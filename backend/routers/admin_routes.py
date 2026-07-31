from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timedelta, timezone

from auth import require_admin, get_current_user
from models import Winner  # noqa: F401 (kept for other endpoints that may use it)

router = APIRouter(prefix='/api/admin', tags=['admin'])


async def _require_role(request: Request, allowed):
    user = await get_current_user(request)
    if user.get('role') not in allowed:
        raise HTTPException(status_code=403, detail=f'Requires one of: {allowed}')
    return user


@router.get('/stats')
async def stats(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    users_count = await db.users.count_documents({})
    contests_count = await db.contests.count_documents({})
    orders_count = await db.orders.count_documents({})
    tickets_count = await db.tickets.count_documents({})
    kyc_pending = await db.kyc.count_documents({'status': 'pending'})
    rev = await db.orders.aggregate([{'$group': {'_id': None, 'total': {'$sum': '$total'}}}]).to_list(1)
    revenue = rev[0]['total'] if rev else 0
    pp = await db.contests.aggregate([{'$group': {'_id': None, 'total': {'$sum': '$prize_amount'}}}]).to_list(1)
    prize_pool = pp[0]['total'] if pp else 0
    return {
        'users': users_count, 'contests': contests_count, 'orders': orders_count,
        'tickets_sold': tickets_count, 'revenue': revenue, 'prize_pool': prize_pool,
        'kyc_pending': kyc_pending,
    }


@router.get('/audit-logs')
async def audit_logs(request: Request, limit: int = 200):
    """All admin audit logs across the platform. Combines winner_audit and any
    future admin_audit collection. Read-only.
    """
    await require_admin(request)
    from deps import get_db
    db = get_db()
    limit = max(10, min(1000, limit))
    winner_logs = await db.winner_audit.find({}, {'_id': 0}).sort('at', -1).to_list(limit)
    for e in winner_logs:
        e['source'] = 'winner_selection'
    # Support cases activity (create + status changes)
    support_cases = await db.support_cases.find({}, {'_id': 0}).sort('updated_at', -1).to_list(limit)
    support_logs = []
    for c in support_cases:
        support_logs.append({
            'at': c.get('updated_at') or c.get('created_at'),
            'source': 'support_case',
            'action': f'case_{c.get("status", "open")}',
            'admin_id': c.get('closed_by'),
            'target': c.get('case_id'),
            'meta': {'subject': c.get('subject'), 'user_id': c.get('user_id')},
        })
    combined = sorted(winner_logs + support_logs, key=lambda x: x.get('at') or '', reverse=True)
    return {'logs': combined[:limit], 'count': len(combined)}


@router.get('/users')
async def all_users(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    users = await db.users.find({}, {'_id': 0, 'password_hash': 0}).sort('created_at', -1).to_list(1000)
    if not users:
        return users

    # Bulk-join tickets / orders / kyc in 3 aggregations instead of 3 per user.
    # Previously this endpoint fired 1 + 3×N queries (3001 for 1000 users) and
    # timed out at scale — deployment blocker flagged in the launch review.
    user_ids = [u['user_id'] for u in users]

    tickets_agg = await db.tickets.aggregate([
        {'$match': {'user_id': {'$in': user_ids}}},
        {'$group': {'_id': '$user_id', 'count': {'$sum': 1}}},
    ]).to_list(None)
    tickets_by_user = {t['_id']: t['count'] for t in tickets_agg}

    orders_agg = await db.orders.aggregate([
        {'$match': {'user_id': {'$in': user_ids}}},
        {'$group': {'_id': '$user_id', 'total': {'$sum': '$total'}}},
    ]).to_list(None)
    spent_by_user = {o['_id']: o['total'] for o in orders_agg}

    kyc_docs = await db.kyc.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'status': 1},
    ).to_list(None)
    kyc_by_user = {k['user_id']: k.get('status', 'none') for k in kyc_docs}

    for u in users:
        u['tickets'] = tickets_by_user.get(u['user_id'], 0)
        u['spent'] = spent_by_user.get(u['user_id'], 0)
        u['kyc_status'] = kyc_by_user.get(u['user_id'], 'none')
    return users


@router.put('/users/{user_id}')
async def update_user(user_id: str, payload: dict, request: Request):
    await _require_role(request, ['admin', 'super_admin'])
    from deps import get_db
    db = get_db()
    allowed = {'name', 'email', 'role', 'picture'}
    updates = {k: v for k, v in (payload or {}).items() if k in allowed}
    if 'role' in updates and updates['role'] not in ('user', 'admin', 'super_admin', 'operator', 'support'):
        raise HTTPException(status_code=400, detail='Invalid role')
    r = await db.users.update_one({'user_id': user_id}, {'$set': updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='User not found')
    return {'ok': True, 'updates': updates}


# NOTE: /users/{user_id}/suspend and /users/{user_id}/unsuspend were previously
# defined here. They have been moved to routers/user360_routes.py so they can
# require admin password re-authentication + emit audit_log rows. Do NOT
# re-add duplicates here — FastAPI matches routes in registration order and
# duplicates silently shadow the secure handlers.


@router.get('/orders')
async def all_orders(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    orders = await db.orders.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    for o in orders:
        u = await db.users.find_one({'user_id': o['user_id']}, {'_id': 0, 'name': 1, 'email': 1})
        o['user_name'] = u['name'] if u else 'Unknown'
        o['user_email'] = u['email'] if u else ''
    return orders


@router.post('/orders/{order_id}/refund')
async def refund_order(order_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    from routers.wallet_routes import _apply_tx
    db = get_db()
    o = await db.orders.find_one({'order_id': order_id}, {'_id': 0})
    if not o:
        raise HTTPException(status_code=404, detail='Order not found')
    if o.get('status') == 'refunded':
        return {'ok': True, 'already': True}

    # Credit the buyer's wallet back BEFORE mutating inventory so an
    # accidental double-refund attempt can't remove tickets twice. The
    # idempotency guard above (status == 'refunded') keeps this safe on
    # retries — we only ever credit money once per order.
    total_to_refund = float(o.get('total', 0) or 0)
    if total_to_refund > 0 and o.get('method') == 'wallet':
        await _apply_tx(
            db,
            o['user_id'],
            'refund',
            total_to_refund,
            note=f'Refund for order {order_id}',
            ref_order_id=order_id,
        )

    # Decrement tickets_sold and delete tickets so the seat becomes available
    # again for future buyers.
    for item in o.get('items', []):
        await db.contests.update_one({'contest_id': item['contest_id']}, {'$inc': {'tickets_sold': -item['qty']}})
    await db.tickets.delete_many({'order_id': order_id})
    await db.orders.update_one({'order_id': order_id}, {'$set': {'status': 'refunded'}})
    return {'ok': True, 'refunded_amount': total_to_refund}


@router.get('/payments')
async def all_payments(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    orders = await db.orders.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    for o in orders:
        u = await db.users.find_one({'user_id': o['user_id']}, {'_id': 0, 'name': 1, 'email': 1})
        o['user_name'] = u['name'] if u else 'Unknown'
        o['user_email'] = u['email'] if u else ''
    return orders


@router.get('/contests')
async def all_contests(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    return await db.contests.find({}, {'_id': 0}).sort('end_date', 1).to_list(500)


@router.post('/contests')
async def create_contest_api(payload: dict, request: Request):
    """Create a new contest from the admin UI (no code, no Meera required)."""
    await require_admin(request)
    from deps import get_db
    from models import Contest, SkillQuestion
    db = get_db()

    # Skill question is now OPTIONAL — modern contests use the dynamic engine
    # (skill_question_type + skill_question_difficulty) which auto-generates a
    # fresh problem per visitor. A static block is only required for legacy
    # trivia/word questions.
    sk = payload.get('skill_question') or {}
    has_static = bool(sk.get('q') and sk.get('answer') and sk.get('options') and len(sk['options']) >= 2)
    sqt = (payload.get('skill_question_type') or '').strip().lower() or None
    sqd = (payload.get('skill_question_difficulty') or '').strip().lower() or None
    if not has_static and not sqt:
        # Default to dynamic addition/easy so contests can be created without extra input.
        sqt = 'addition'
        sqd = 'easy'

    # Slug (server-generated, unique)
    import re
    import secrets
    title = (payload.get('title') or 'Contest').strip()
    slug_base = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:40] or 'contest'
    slug = f"{slug_base}-{secrets.token_hex(3)}"

    # Parse end_date
    end_date_val = payload.get('end_date')
    if isinstance(end_date_val, str):
        try:
            end_date_val = datetime.fromisoformat(end_date_val.replace('Z', '+00:00'))
        except Exception:
            end_date_val = datetime.now(timezone.utc) + timedelta(days=7)
    elif not isinstance(end_date_val, datetime):
        end_date_val = datetime.now(timezone.utc) + timedelta(days=7)

    category = payload.get('category') or 'prize-draws'
    tag_map = {'jackpot': 'Jackpot', 'instant-wins': 'Instant Wins', 'prize-draws': 'Prize Draws', 'new-games': 'New Game'}
    prize_amount = float(payload.get('prize_amount') or 100)

    try:
        contest = Contest(
            slug=slug,
            title=title,
            subtitle=payload.get('subtitle') or f"£{int(prize_amount)} cash prize",
            category=category,
            tag=payload.get('tag') or tag_map.get(category, 'Prize Draws'),
            price=float(payload.get('price') or 1),
            tickets_total=int(payload.get('tickets_total') or 150),
            prize_amount=prize_amount,
            end_date=end_date_val,
            image=payload.get('image') or 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
            jackpot=bool(payload.get('jackpot')) or prize_amount >= 250,
            featured=bool(payload.get('featured')),
            skill_question=SkillQuestion(
                q=sk['q'], options=list(sk['options']), answer=sk['answer'],
                type=sk.get('type', 'trivia'),
            ) if has_static else SkillQuestion(
                # Placeholder — never rendered to public because dynamic engine
                # supersedes it. Kept because the Contest model requires it.
                q='Dynamic', options=['auto'], answer='auto', type='dynamic',
            ),
            status=payload.get('status', 'draft') if payload.get('status') in ('draft', 'live') else 'draft',
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'Invalid contest data: {e}')

    doc = contest.model_dump()
    if sqt:
        doc['skill_question_type'] = sqt
        doc['skill_question_difficulty'] = sqd or 'easy'
    await db.contests.insert_one(doc)
    doc.pop('_id', None)
    return {'ok': True, 'contest': doc}


@router.put('/contests/{contest_id}')
async def update_contest_full(contest_id: str, payload: dict, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    allowed = {'title', 'subtitle', 'category', 'tag', 'image', 'price', 'tickets_total',
               'prize_amount', 'end_date', 'jackpot', 'featured', 'status', 'skill_question',
               'skill_question_type', 'skill_question_difficulty',
               'game_type', 'game_config', 'entry_mode', 'max_attempts', 'attempts_per_ticket',
               'leaderboard_visibility', 'winner_selection_method',
               # ---- Extended editable fields (Phase-1 launch spec) ----
               'short_description', 'full_description', 'how_to_enter', 'skill_instructions',
               'eligibility', 'max_tickets_per_user', 'open_date', 'draw_date',
               'prize_details', 'num_prizes', 'prize_values', 'winner_method', 'scoring_method',
               'tiebreak_method', 'verification_method', 'prize_credit_timeframe',
               'refund_conditions', 'important_info', 'contest_rules',
               'terms_acknowledgement', 'country_restrictions', 'age_restriction',
               'mobile_image', 'seo_title', 'seo_description', 'publication_status',
               'engine_type', 'free_postal_entry_available', 'free_postal_entry_instructions'}
    updates = {}
    for k, v in (payload or {}).items():
        if k not in allowed:
            continue
        if k in {'end_date', 'open_date', 'draw_date'} and isinstance(v, str) and v:
            try:
                updates[k] = datetime.fromisoformat(v.replace('Z', '+00:00'))
            except Exception:
                continue
        elif k in {'price', 'prize_amount'}:
            updates[k] = float(v)
        elif k in {'tickets_total', 'num_prizes', 'max_tickets_per_user'}:
            try:
                updates[k] = int(v)
            except (TypeError, ValueError):
                continue
        elif k in {'free_postal_entry_available', 'jackpot', 'featured'}:
            updates[k] = bool(v)
        elif k == 'skill_question' and isinstance(v, dict):
            if all(x in v for x in ('q', 'options', 'answer')):
                updates[k] = {'q': v['q'], 'options': list(v['options']), 'answer': v['answer'], 'type': v.get('type', 'trivia')}
        elif k == 'skill_question_type':
            val = (str(v or '').strip().lower()) or None
            if val in {'addition', 'subtraction', 'multiplication', 'division', None}:
                updates[k] = val
        elif k == 'skill_question_difficulty':
            val = (str(v or '').strip().lower()) or 'easy'
            if val in {'easy', 'medium', 'hard'}:
                updates[k] = val
        else:
            updates[k] = v
    if not updates:
        raise HTTPException(status_code=400, detail='No valid fields to update')
    r = await db.contests.update_one({'contest_id': contest_id}, {'$set': updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    return {'ok': True, 'updates': list(updates.keys())}


@router.get('/winners')
async def all_winners(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    return await db.winners.find({}, {'_id': 0}).sort('drawn_at', -1).to_list(500)


@router.post('/draw/{contest_id}')
async def draw_winner(contest_id: str, request: Request):
    await _require_role(request, ['admin', 'super_admin', 'operator'])
    from deps import get_db
    from services.draw_service import draw_contest as _draw
    db = get_db()
    result = await _draw(db, contest_id)
    if not result.get('ok'):
        reason_map = {
            'contest_not_found': (404, 'Contest not found'),
            'already_drawn': (400, 'Contest already drawn'),
            'no_tickets': (400, 'No tickets sold'),
        }
        code, msg = reason_map.get(result.get('reason'), (400, result.get('reason', 'Draw failed')))
        raise HTTPException(status_code=code, detail=msg)
    return {'winner': result['winner']}


@router.post('/winners/{winner_id}/mark-paid')
async def mark_paid(winner_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.winners.update_one({'winner_id': winner_id}, {'$set': {'paid_out': True}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Winner not found')
    return {'ok': True}


@router.post('/contests/bulk/launch')
async def bulk_launch_contests(request: Request, payload: dict | None = None):
    """Launch multiple contests at once. Optional filter:
    - only_games=true → only contests with game_type set
    - category=<slug> → only contests in that category
    - status_from='draft'|'live'|'all' (default 'draft')
    Returns count of contests updated.
    """
    await require_admin(request)
    from deps import get_db
    db = get_db()
    payload = payload or {}
    q = {}
    status_from = (payload.get('status_from') or 'draft')
    if status_from != 'all':
        q['status'] = status_from
    if payload.get('only_games'):
        q['game_type'] = {'$exists': True, '$nin': [None, '']}
    cat = payload.get('category')
    if cat and cat != 'all':
        q['category'] = cat
    r = await db.contests.update_many(q, {'$set': {'status': 'live'}})
    return {'ok': True, 'updated': r.modified_count, 'matched': r.matched_count, 'filter': q}


@router.post('/contests/bulk/pause')
async def bulk_pause_contests(request: Request, payload: dict | None = None):
    """Pause multiple contests. Same filter surface as bulk/launch."""
    await require_admin(request)
    from deps import get_db
    db = get_db()
    payload = payload or {}
    q = {}
    status_from = (payload.get('status_from') or 'live')
    if status_from != 'all':
        q['status'] = status_from
    if payload.get('only_games'):
        q['game_type'] = {'$exists': True, '$nin': [None, '']}
    cat = payload.get('category')
    if cat and cat != 'all':
        q['category'] = cat
    r = await db.contests.update_many(q, {'$set': {'status': 'draft'}})
    return {'ok': True, 'updated': r.modified_count, 'matched': r.matched_count, 'filter': q}


@router.post('/contests/{contest_id}/launch')
async def launch_contest(contest_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.contests.update_one({'contest_id': contest_id}, {'$set': {'status': 'live'}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    return {'ok': True, 'status': 'live'}


@router.post('/contests/{contest_id}/pause')
async def pause_contest(contest_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.contests.update_one({'contest_id': contest_id}, {'$set': {'status': 'draft'}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    return {'ok': True, 'status': 'draft'}


@router.delete('/contests/{contest_id}')
async def delete_contest(contest_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.contests.delete_one({'contest_id': contest_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    await db.tickets.delete_many({'contest_id': contest_id})
    return {'ok': True}


# ---------- KYC ----------
@router.get('/kyc')
async def list_kyc(request: Request, status: str = 'all'):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    q = {} if status == 'all' else {'status': status}
    subs = await db.kyc.find(q, {'_id': 0}).sort('submitted_at', -1).to_list(500)
    for s in subs:
        u = await db.users.find_one({'user_id': s['user_id']}, {'_id': 0, 'name': 1, 'email': 1})
        s['user_name'] = u['name'] if u else 'Unknown'
        s['user_email'] = u['email'] if u else ''
    return subs


@router.post('/kyc/{kyc_id}/approve')
async def approve_kyc(kyc_id: str, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.kyc.update_one({'kyc_id': kyc_id}, {'$set': {
        'status': 'approved',
        'reviewed_at': datetime.now(timezone.utc),
        'reviewed_by': admin['email'],
    }})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='KYC not found')
    return {'ok': True}


@router.post('/kyc/{kyc_id}/reject')
async def reject_kyc(kyc_id: str, payload: dict, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.kyc.update_one({'kyc_id': kyc_id}, {'$set': {
        'status': 'rejected',
        'reviewed_at': datetime.now(timezone.utc),
        'reviewed_by': admin['email'],
        'reject_reason': (payload or {}).get('reason', ''),
    }})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='KYC not found')
    return {'ok': True}
