from fastapi import APIRouter, HTTPException, Request
from pydantic import EmailStr, TypeAdapter, ValidationError
import uuid
from datetime import datetime, timedelta, timezone

from auth import require_admin, get_current_user, verify_password
from models import Winner  # noqa: F401 (kept for other endpoints that may use it)

router = APIRouter(prefix='/api/admin', tags=['admin'])


# Collections that are safe to wipe wholesale when the super admin clicks
# "Wipe Demo Data". Every entry here is either an audit trail or transient
# state; NONE of them contain irreplaceable config.
_WIPEABLE_COLLECTIONS = (
    'audit_log', 'admin_audit', 'winner_audit',
    'contests', 'contest_draws', 'game_scores',
    'instant_win_configs', 'instant_win_reveals', 'kyc',
    'leaderboard_entries', 'meera_log', 'notifications', 'orders',
    'payment_transactions', 'postal_entries', 'referrals', 'support_cases',
    'tickets', 'user_sessions', 'wallet_tx', 'winners',
)


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

    users = await db.users.find(
        {},
        {'_id': 0, 'password_hash': 0},
    ).sort('created_at', -1).to_list(5000)

    if not users:
        return users

    user_ids = [
        u['user_id']
        for u in users
        if u.get('user_id')
    ]

    # Tickets
    tickets_agg = await db.tickets.aggregate([
        {
            '$match': {
                'user_id': {'$in': user_ids}
            }
        },
        {
            '$group': {
                '_id': '$user_id',
                'count': {'$sum': 1},
                'contest_ids': {'$addToSet': '$contest_id'},
            }
        },
    ]).to_list(None)

    tickets_by_user = {
        t['_id']: {
            'tickets': t.get('count', 0),
            'contests': len(t.get('contest_ids') or []),
        }
        for t in tickets_agg
    }

    # Orders / spend
    orders_agg = await db.orders.aggregate([
        {
            '$match': {
                'user_id': {'$in': user_ids},
                'status': {'$ne': 'refunded'},
            }
        },
        {
            '$group': {
                '_id': '$user_id',
                'orders_count': {'$sum': 1},
                'spent': {'$sum': '$total'},
            }
        },
    ]).to_list(None)

    orders_by_user = {
        o['_id']: {
            'orders_count': o.get('orders_count', 0),
            'spent': float(o.get('spent') or 0),
        }
        for o in orders_agg
    }

    # KYC
    kyc_docs = await db.kyc.find(
        {'user_id': {'$in': user_ids}},
        {
            '_id': 0,
            'user_id': 1,
            'status': 1,
        },
    ).to_list(None)

    kyc_by_user = {
        k['user_id']: k.get('status', 'none')
        for k in kyc_docs
    }

    # Wallets
    wallets = await db.wallets.find(
        {'user_id': {'$in': user_ids}},
        {
            '_id': 0,
            'user_id': 1,
            'balance': 1,
            'lifetime_topup': 1,
            'lifetime_spend': 1,
        },
    ).to_list(None)

    wallets_by_user = {
        w['user_id']: w
        for w in wallets
    }

    # Referrals where user joined through personal referral
    joined_refs = await db.referrals.find(
        {
            'referred_user_id': {'$in': user_ids},
        },
        {
            '_id': 0,
            'referred_user_id': 1,
            'status': 1,
            'reward_granted': 1,
            'topup_qualified': 1,
            'contest_entered': 1,
            'code': 1,
        },
    ).to_list(None)

    joined_ref_by_user = {
        r['referred_user_id']: r
        for r in joined_refs
    }

    # Influencer attribution
    influencer_rows = await db.influencer_attributions.find(
        {
            'user_id': {'$in': user_ids},
        },
        {
            '_id': 0,
            'user_id': 1,
            'promo_id': 1,
            'code': 1,
            'influencer_name': 1,
            'campaign_name': 1,
            'status': 1,
            'topup_qualified': 1,
            'contest_entered': 1,
            'reward_granted': 1,
            'reward_tokens': 1,
        },
    ).to_list(None)

    influencer_by_user = {
        a['user_id']: a
        for a in influencer_rows
    }

    # Winnings
    winnings_agg = await db.winners.aggregate([
        {
            '$match': {
                'user_id': {'$in': user_ids},
            }
        },
        {
            '$group': {
                '_id': '$user_id',
                'winnings': {'$sum': '$prize_amount'},
                'wins': {'$sum': 1},
            }
        },
    ]).to_list(None)

    winnings_by_user = {
        w['_id']: {
            'winnings': float(w.get('winnings') or 0),
            'wins': w.get('wins', 0),
        }
        for w in winnings_agg
    }

    for u in users:
        uid = u['user_id']

        ticket_stats = tickets_by_user.get(uid, {})
        order_stats = orders_by_user.get(uid, {})
        wallet = wallets_by_user.get(uid, {})
        joined_ref = joined_ref_by_user.get(uid)
        influencer = influencer_by_user.get(uid)
        win_stats = winnings_by_user.get(uid, {})

        u['tickets'] = ticket_stats.get('tickets', 0)
        u['contests_count'] = ticket_stats.get('contests', 0)

        u['orders_count'] = order_stats.get('orders_count', 0)
        u['spent'] = order_stats.get('spent', 0)

        u['kyc_status'] = kyc_by_user.get(uid, 'none')

        u['wallet_balance'] = float(wallet.get('balance') or 0)
        u['lifetime_topup'] = float(wallet.get('lifetime_topup') or 0)
        u['lifetime_spend'] = float(wallet.get('lifetime_spend') or 0)

        u['winnings'] = win_stats.get('winnings', 0)
        u['wins'] = win_stats.get('wins', 0)

        if influencer:
            u['acquisition_type'] = 'influencer'
            u['influencer_code'] = influencer.get('code')
            u['influencer_name'] = influencer.get('influencer_name')
            u['influencer_campaign'] = influencer.get('campaign_name')
            u['influencer_reward_granted'] = bool(
                influencer.get('reward_granted')
            )
            u['influencer_reward_status'] = influencer.get('status')
        elif joined_ref:
            u['acquisition_type'] = 'referral'
            u['joined_referral_code'] = joined_ref.get('code')
            u['referral_reward_granted'] = bool(
                joined_ref.get('reward_granted')
            )
            u['referral_status'] = joined_ref.get('status')
        else:
            u['acquisition_type'] = (
                u.get('acquisition_type')
                or 'organic'
            )

        u['signup_bonus_status'] = (
            'granted'
            if u.get('signup_bonus_granted')
            else (
                'eligible'
                if u.get('signup_bonus_offer_eligible')
                else 'none'
            )
        )

    return users


@router.put('/users/{user_id}')
async def update_user(user_id: str, payload: dict, request: Request):
    admin = await _require_role(
        request,
        ['admin', 'super_admin'],
    )

    from deps import get_db
    from routers.twilio_routes import _normalize_phone

    db = get_db()

    current = await db.users.find_one(
        {'user_id': user_id},
    )

    if not current:
        raise HTTPException(
            status_code=404,
            detail='User not found',
        )

    allowed = {
        'name',
        'username',
        'email',
        'phone',
        'dob',
        'address',
        'picture',
        'role',
    }

    updates = {
        k: v
        for k, v in (payload or {}).items()
        if k in allowed
    }

    if not updates:
        raise HTTPException(
            status_code=400,
            detail='No editable profile fields supplied',
        )

    # -----------------------------------------
    # Name
    # -----------------------------------------
    if 'name' in updates:
        name = str(updates['name'] or '').strip()

        if not name:
            raise HTTPException(
                status_code=400,
                detail='Name cannot be empty',
            )

        if len(name) > 160:
            raise HTTPException(
                status_code=400,
                detail='Name is too long',
            )

        updates['name'] = name

    # -----------------------------------------
    # Username
    # -----------------------------------------
    if 'username' in updates:
        username = str(
            updates['username'] or ''
        ).strip()

        if username:
            if len(username) > 80:
                raise HTTPException(
                    status_code=400,
                    detail='Username is too long',
                )

            duplicate = await db.users.find_one(
                {
                    'username': username,
                    'user_id': {'$ne': user_id},
                },
                {'_id': 1},
            )

            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail='Username is already in use',
                )

            updates['username'] = username
        else:
            updates['username'] = None

    # -----------------------------------------
    # Email
    # -----------------------------------------
    if 'email' in updates:
        raw_email = str(
            updates['email'] or ''
        ).strip().lower()

        try:
            validated_email = str(
                TypeAdapter(EmailStr).validate_python(
                    raw_email
                )
            )
        except ValidationError:
            raise HTTPException(
                status_code=400,
                detail='Invalid email address',
            )

        duplicate = await db.users.find_one(
            {
                'email': validated_email,
                'user_id': {'$ne': user_id},
            },
            {'_id': 1},
        )

        if duplicate:
            raise HTTPException(
                status_code=409,
                detail='Email address is already in use',
            )

        updates['email'] = validated_email

        # There is currently no production email-verification provider.
        # Keep the flag false when an email address changes.
        if validated_email != (
            str(current.get('email') or '')
            .strip()
            .lower()
        ):
            updates['email_verified'] = False
            updates['email_verified_at'] = None

    # -----------------------------------------
    # Phone
    # -----------------------------------------
    if 'phone' in updates:
        raw_phone = str(
            updates['phone'] or ''
        ).strip()

        if raw_phone:
            phone = _normalize_phone(raw_phone)

            duplicate = await db.users.find_one(
                {
                    'phone': phone,
                    'user_id': {'$ne': user_id},
                },
                {'_id': 1},
            )

            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail='Phone number is already in use',
                )

            updates['phone'] = phone

            if phone != current.get('phone'):
                updates['phone_verified'] = False
                updates['phone_verified_at'] = None
        else:
            updates['phone'] = None
            updates['phone_verified'] = False
            updates['phone_verified_at'] = None

    # -----------------------------------------
    # DOB
    # -----------------------------------------
    if 'dob' in updates:
        raw_dob = str(
            updates['dob'] or ''
        ).strip()

        if raw_dob:
            try:
                dob = datetime.strptime(
                    raw_dob,
                    '%Y-%m-%d',
                ).date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail='DOB must use YYYY-MM-DD',
                )

            today = datetime.now(
                timezone.utc
            ).date()

            age = (
                today.year
                - dob.year
                - (
                    (today.month, today.day)
                    < (dob.month, dob.day)
                )
            )

            if age < 18:
                raise HTTPException(
                    status_code=400,
                    detail='User must be at least 18 years old',
                )

            updates['dob'] = raw_dob
        else:
            updates['dob'] = None

    # -----------------------------------------
    # Address / picture
    # -----------------------------------------
    for field, maximum in (
        ('address', 500),
        ('picture', 2000),
    ):
        if field in updates:
            value = str(
                updates[field] or ''
            ).strip()

            if len(value) > maximum:
                raise HTTPException(
                    status_code=400,
                    detail=f'{field} is too long',
                )

            updates[field] = value or None

    # -----------------------------------------
    # Role
    # -----------------------------------------
    if 'role' in updates:
        valid_roles = (
            'user',
            'admin',
            'super_admin',
            'operator',
            'support',
        )

        if updates['role'] not in valid_roles:
            raise HTTPException(
                status_code=400,
                detail='Invalid role',
            )

        # Only super_admin can assign/remove admin-level roles.
        if (
            admin.get('role') != 'super_admin'
            and updates['role'] != current.get('role')
        ):
            raise HTTPException(
                status_code=403,
                detail='Only Super Admin can change user roles',
            )

    # Never allow generic profile editing to touch erased accounts.
    if current.get('erased'):
        raise HTTPException(
            status_code=400,
            detail='Erased users cannot be edited',
        )

    changed = {
        k: v
        for k, v in updates.items()
        if current.get(k) != v
    }

    if not changed:
        return {
            'ok': True,
            'updates': {},
            'unchanged': True,
        }

    now = datetime.now(timezone.utc)

    await db.users.update_one(
        {'user_id': user_id},
        {
            '$set': {
                **changed,
                'profile_updated_at': now,
            }
        },
    )

    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'user_profile_update',
        'admin_email': admin.get('email'),
        'admin_user_id': admin.get('user_id'),
        'target_user_id': user_id,
        'changed_fields': sorted(changed.keys()),
        'at': now,
    })

    return {
        'ok': True,
        'updates': changed,
    }


# NOTE: /users/{user_id}/suspend and /users/{user_id}/unsuspend were previously
# defined here. They have been moved to routers/user360_routes.py so they can
# require admin password re-authentication + emit audit_log rows. Do NOT
# re-add duplicates here — FastAPI matches routes in registration order and
# duplicates silently shadow the secure handlers.


async def _enrich_orders_with_user(db, orders: list) -> list:
    """Attach `user_name` / `user_email` to a list of orders using ONE bulk
    lookup instead of one query per order (N+1 avoidance)."""
    if not orders:
        return orders
    user_ids = list({o['user_id'] for o in orders if o.get('user_id')})
    users = await db.users.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1},
    ).to_list(len(user_ids))
    umap = {u['user_id']: u for u in users}
    for o in orders:
        u = umap.get(o.get('user_id'))
        o['user_name'] = u['name'] if u else 'Unknown'
        o['user_email'] = u['email'] if u else ''
    return orders


@router.get('/orders')
async def all_orders(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    orders = await db.orders.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return await _enrich_orders_with_user(db, orders)


@router.post('/orders/{order_id}/refund')
async def refund_order(order_id: str, request: Request):
    # Refunds move real money — restrict to admin/super_admin only.
    # support/operator staff never touch refunds.
    await _require_role(request, ['admin', 'super_admin'])
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
    return await _enrich_orders_with_user(db, orders)


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

    doc['public_coming_soon'] = (
        bool(payload.get('public_coming_soon', False))
        and doc.get('status') == 'draft'
    )

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
               'prize_amount', 'end_date', 'jackpot', 'featured', 'status', 'public_coming_soon', 'skill_question',
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
        elif k in {'free_postal_entry_available', 'jackpot', 'featured', 'public_coming_soon'}:
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
    # Coming Soon must never be live.
    if updates.get('public_coming_soon') is True:
        updates['status'] = 'draft'

    # Going live automatically clears Coming Soon.
    if updates.get('status') == 'live':
        updates['public_coming_soon'] = False

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
    if not subs:
        return subs
    # Bulk-enrich with user name/email (avoid N+1 that would fire one query
    # per KYC submission on the admin KYC queue).
    user_ids = list({s['user_id'] for s in subs if s.get('user_id')})
    users = await db.users.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1},
    ).to_list(len(user_ids))
    umap = {u['user_id']: u for u in users}
    for s in subs:
        u = umap.get(s.get('user_id'))
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



@router.post('/system/wipe-demo-data')
async def wipe_demo_data(payload: dict, request: Request):
    """DESTRUCTIVE — deletes all test/demo data and resets counters so the
    platform is production-clean. Preserves:
      • the calling super admin (their own account is never touched)
      • all other users with role in ('admin', 'super_admin', 'operator', 'support')
      • legal documents, company settings, counters

    Wipes:
      • orders, tickets, wallet_tx, payment_transactions, audit logs,
        notifications, referrals, support cases, contests, contest_draws,
        game_scores, instant_win_configs, instant_win_reveals, kyc,
        leaderboard_entries, meera_log, postal_entries, user_sessions, winners
      • every user with role 'user' (regular players — demo accounts)
      • every wallet not belonging to a preserved user

    Requires:
      • super_admin role
      • password re-confirmation (payload['password'])
      • confirmation phrase (payload['confirm'] == 'WIPE DEMO DATA')
    """
    user = await get_current_user(request)
    if user.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail='Only super_admin can wipe demo data')

    password = (payload or {}).get('password', '')
    confirm = (payload or {}).get('confirm', '')
    if confirm != 'WIPE DEMO DATA':
        raise HTTPException(status_code=400, detail='Confirmation phrase must be exactly: WIPE DEMO DATA')

    from deps import get_db
    db = get_db()
    admin_full = await db.users.find_one({'user_id': user['user_id']})
    if not admin_full or not verify_password(password, admin_full.get('password_hash', '')):
        raise HTTPException(status_code=401, detail='Password re-confirmation failed')

    report: dict[str, int] = {}
    for col in _WIPEABLE_COLLECTIONS:
        r = await db[col].delete_many({})
        if r.deleted_count:
            report[col] = r.deleted_count

    # Preserve staff accounts + the calling super admin. Delete only regular players.
    staff_roles = {'admin', 'super_admin', 'operator', 'support'}
    preserved = await db.users.find(
        {'role': {'$in': list(staff_roles)}},
        {'_id': 0, 'user_id': 1},
    ).to_list(None)
    preserved_ids = [u['user_id'] for u in preserved]

    dr = await db.users.delete_many({'user_id': {'$nin': preserved_ids}})
    if dr.deleted_count:
        report['users'] = dr.deleted_count

    # Reset every preserved staff wallet to £0 and wipe every other wallet.
    wr = await db.wallets.delete_many({'user_id': {'$nin': preserved_ids}})
    if wr.deleted_count:
        report['wallets_deleted'] = wr.deleted_count
    await db.wallets.update_many(
        {'user_id': {'$in': preserved_ids}},
        {'$set': {'balance': 0.0, 'lifetime_topup': 0.0, 'lifetime_spend': 0.0}},
    )

    # Backfill missing public_ids on preserved staff and reset the counter
    # correctly. This is subtle because staff can be a mix of:
    #   • super admin (always gets PL10000)
    #   • existing staff who ALREADY have a PLxxxxx (keep as-is, count towards
    #     the next-signup counter)
    #   • existing staff with NO public_id (assign the smallest unused id)
    _PREFIX = 'PL'
    _START = 10000

    def _num(pid):
        if not pid or not pid.startswith(_PREFIX):
            return None
        try:
            return int(pid[len(_PREFIX):])
        except ValueError:
            return None

    # Snapshot every preserved user's current public_id.
    used: set[int] = set()
    async for u in db.users.find({'user_id': {'$in': preserved_ids}}, {'user_id': 1, 'public_id': 1, 'role': 1}):
        n = _num(u.get('public_id'))
        if n is not None:
            used.add(n)

    # Super admin ALWAYS gets PL10000 (overwrite any other id it may hold —
    # PL10000 is the reserved super-admin marker).
    sa = await db.users.find_one({'role': 'super_admin'}, {'user_id': 1, 'public_id': 1})
    if sa:
        prev = _num(sa.get('public_id'))
        if prev is not None:
            used.discard(prev)
        await db.users.update_one({'user_id': sa['user_id']}, {'$set': {'public_id': f'{_PREFIX}{_START}'}})
        used.add(_START)

    # Assign smallest-unused id to any preserved staff still missing one.
    async for u in db.users.find(
        {
            'user_id': {'$in': preserved_ids},
            'role': {'$ne': 'super_admin'},
            '$or': [{'public_id': {'$in': [None, '']}}, {'public_id': {'$exists': False}}],
        },
        {'user_id': 1},
    ).sort('created_at', 1):
        candidate = _START + 1
        while candidate in used:
            candidate += 1
        await db.users.update_one({'user_id': u['user_id']}, {'$set': {'public_id': f'{_PREFIX}{candidate}'}})
        used.add(candidate)

    # Counter must be set so the next new signup gets `max(used) + 1`.
    # The `next_seq` helper first $inc's seq and returns `seq + start - 1`,
    # so if we want the next call to return `max_used + 1` we need seq
    # (before $inc) to equal `max_used - start + 1`.
    max_used = max(used) if used else _START
    await db.counters.update_one(
        {'_id': 'user_public_id'},
        {'$set': {'seq': max(1, max_used - _START + 1)}},
        upsert=True,
    )

    # Log the wipe itself in a fresh admin_audit row so ops can always
    # answer "who wiped and when?" — inserted AFTER the wipe loop so it
    # survives (the loop just cleared admin_audit as well).
    await db.admin_audit.insert_one({
        'action': 'wipe_demo_data',
        'by_user_id': user['user_id'],
        'by_email': user.get('email'),
        'at': datetime.now(timezone.utc),
        'report': report,
    })

    return {'ok': True, 'wiped': report, 'preserved_users': len(preserved_ids)}
