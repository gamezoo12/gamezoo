from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone

from auth import get_current_user
from deps import get_db
from models import CheckoutInput, Order, Ticket
from routers.wallet_routes import _apply_tx, _get_or_create_wallet
from skill_challenge import verify_challenge

router = APIRouter(prefix='/api/orders', tags=['orders'])


def _validate_skill(c: dict, item) -> None:
    """Enforce the skill gate at purchase time.

    Three paths in priority order:
      1. Random-ticket contests (`entry_mode != 'skill_game'`) — no skill check.
      2. Dynamic engine (contest has `skill_question_type` set) — verify the
         signed challenge_token carried in the cart item.
      3. Legacy static question — string-match the user's answer against the
         stored `skill_question.answer`.
    """
    if c.get('entry_mode', 'skill_game') != 'skill_game':
        return
    if c.get('skill_question_type'):
        r = verify_challenge(c['contest_id'], (item.skill_answer or '').strip(), item.challenge_token or '')
        if not r['ok']:
            raise HTTPException(status_code=400, detail=f"Skill check failed for '{c['title']}': {r.get('reason', 'incorrect')}. Return to the contest page and try a fresh question.")
        return
    sq = c.get('skill_question') or {}
    if (item.skill_answer or '').strip() != sq.get('answer'):
        raise HTTPException(status_code=400, detail=f'Incorrect skill answer for: {c["title"]}')


@router.post('/checkout')
async def checkout(inp: CheckoutInput, request: Request):
    user = await get_current_user(request)
    if not inp.items:
        raise HTTPException(status_code=400, detail='Cart is empty')

    db = get_db()

    # Protect only against accidental rapid duplicate submissions.
    #
    # `basket_sig` identifies the basket contents and is used for the short
    # three-second duplicate window. `idempotency_sig` additionally contains
    # a three-second time bucket so the existing unique Mongo index still
    # prevents concurrent double submissions, while a genuine later purchase
    # of the same quantity in the same contest remains allowed.
    from hashlib import sha256
    from datetime import timedelta

    basket_material = user['user_id'] + '|' + '|'.join(
        sorted(f"{i.contest_id}:{i.qty}" for i in inp.items)
    )
    basket_sig = sha256(basket_material.encode()).hexdigest()

    now = datetime.now(timezone.utc)
    recent = await db.orders.find_one({
        'user_id': user['user_id'],
        'basket_sig': basket_sig,
        'created_at': {'$gte': now - timedelta(seconds=3)},
    }, {'_id': 0, 'order_id': 1, 'total': 1})

    if recent:
        raise HTTPException(
            status_code=409,
            detail=f"Duplicate checkout detected. Existing order: {recent['order_id']}",
        )

    time_bucket = int(now.timestamp() // 3)
    sig = sha256(f"{basket_sig}|{time_bucket}".encode()).hexdigest()

    order_items = []
    total = 0.0
    contest_by_id = {}

    # Pass 1: pure validation (skill answer, quantity, contest status). NO
    # writes yet. If any item fails here we haven't touched inventory so
    # nothing needs to be rolled back.
    for item in inp.items:
        c = await db.contests.find_one({'contest_id': item.contest_id}, {'_id': 0})
        if not c:
            raise HTTPException(status_code=404, detail=f'Contest not found: {item.contest_id}')
        if c.get('status') != 'live':
            raise HTTPException(status_code=400, detail=f'Contest closed: {c["title"]}')
        _validate_skill(c, item)
        if item.qty <= 0 or item.qty > 500:
            raise HTTPException(status_code=400, detail='Invalid quantity')

        # Preliminary capacity check — a real ATOMIC guard runs in pass 2.
        available = c['tickets_total'] - c.get('tickets_sold', 0)
        if item.qty > available:
            raise HTTPException(status_code=400, detail=f'Only {available} tickets left for {c["title"]}')

        line_total = item.qty * float(c['price'])
        total += line_total
        contest_by_id[c['contest_id']] = c
        order_items.append({
            'contest_id': c['contest_id'],
            'title': c['title'],
            'image': c['image'],
            'qty': item.qty,
            'price': float(c['price']),
            'line_total': line_total,
        })

    # Wallet balance check BEFORE mutating anything (cheap early rejection so
    # we don't burn ticket reservations for buyers who can't pay).
    wallet = await _get_or_create_wallet(db, user['user_id'])
    if wallet['balance'] < total:
        raise HTTPException(
            status_code=402,
            detail=f'Insufficient wallet balance. You have £{wallet["balance"]:.2f}, need £{total:.2f}. Top up your wallet to continue.',
        )

    # Pass 2: ATOMIC ticket reservations. Each `$inc` is guarded by a filter
    # on `tickets_sold` so two buyers can't oversell the last N tickets. If
    # any reservation fails we roll back the earlier ones before responding.
    reserved: list[tuple[str, int]] = []  # (contest_id, base_before, qty)
    tickets_to_insert = []
    debit_applied = False  # tracks whether we already took the money — if so
                           # and a later step fails, we MUST refund it.
    order = Order(user_id=user['user_id'], items=order_items, total=total, status='paid', method='wallet')
    try:
        for item in inp.items:
            c = contest_by_id[item.contest_id]
            res = await db.contests.find_one_and_update(
                {
                    'contest_id': c['contest_id'],
                    'status': 'live',
                    # Only reserve if there's still room. This is the atomic
                    # equivalent of the earlier `available >= qty` check.
                    '$expr': {'$lte': [{'$add': [{'$ifNull': ['$tickets_sold', 0]}, item.qty]}, '$tickets_total']},
                },
                {'$inc': {'tickets_sold': item.qty}},
                projection={'_id': 0, 'tickets_sold': 1, 'tickets_total': 1},
                return_document=False,  # BEFORE — we want the base index
            )
            if not res:
                # Someone beat us to the last tickets between pass 1 and now.
                raise HTTPException(status_code=409, detail=f'Tickets just sold out for {c["title"]}. Please refresh and try again.')
            base = res.get('tickets_sold', 0)
            reserved.append((c['contest_id'], base, item.qty))
            for n in range(item.qty):
                tickets_to_insert.append(Ticket(
                    order_id=order.order_id,
                    user_id=user['user_id'],
                    contest_id=c['contest_id'],
                    ticket_number=base + n + 1,
                ).model_dump())

        # Debit wallet ATOMICALLY (find_one_and_update with balance guard).
        # If insufficient (a race between check and here), this raises 400
        # and the outer except reverses ticket reservations. Once this line
        # returns without raising we own an unbalanced debit and MUST refund
        # it if any later step fails.
        await _apply_tx(db, user['user_id'], 'spend', -total, note=f'Order {order.order_id}', ref_order_id=order.order_id)
        debit_applied = True

        order_doc = order.model_dump()
        order_doc['basket_sig'] = basket_sig
        order_doc['idempotency_sig'] = sig
        try:
            await db.orders.insert_one(order_doc)
        except Exception as _ins_err:
            # Duplicate key from the unique (user_id, idempotency_sig) index:
            # a concurrent double-submit beat us to the insert. Convert to
            # a friendly 409 so the compensating refund path fires cleanly.
            if 'duplicate key' in str(_ins_err).lower() or 'E11000' in str(_ins_err):
                raise HTTPException(status_code=409, detail='Duplicate checkout detected — the other tab already completed this purchase.')
            raise
        if tickets_to_insert:
            await db.tickets.insert_many(tickets_to_insert)
    except HTTPException:
        # Roll back any reservations we already made this request.
        for contest_id, _base, qty in reserved:
            await db.contests.update_one({'contest_id': contest_id}, {'$inc': {'tickets_sold': -qty}})
        # Compensating refund: if we already debited the wallet but a later
        # step (order/ticket insert) blew up, credit the money back so the
        # buyer isn't out of pocket for a purchase they didn't get.
        if debit_applied:
            try:
                await _apply_tx(
                    db, user['user_id'], 'refund', total,
                    note=f'Auto-refund: checkout failed after wallet debit (order {order.order_id})',
                    ref_order_id=order.order_id,
                )
            except Exception:
                import logging as _lg
                _lg.exception('CRITICAL: failed to auto-refund debited wallet after checkout error user=%s order=%s amount=%.2f', user['user_id'], order.order_id, total)
        raise
    except Exception:
        for contest_id, _base, qty in reserved:
            await db.contests.update_one({'contest_id': contest_id}, {'$inc': {'tickets_sold': -qty}})
        if debit_applied:
            try:
                await _apply_tx(
                    db, user['user_id'], 'refund', total,
                    note=f'Auto-refund: checkout failed after wallet debit (order {order.order_id})',
                    ref_order_id=order.order_id,
                )
            except Exception:
                import logging as _lg
                _lg.exception('CRITICAL: failed to auto-refund debited wallet after checkout error user=%s order=%s amount=%.2f', user['user_id'], order.order_id, total)
        raise

    # In-app notification per contest so users see the winning tickets grouped.
    from notifications import notify
    for item in inp.items:
        c = contest_by_id.get(item.contest_id, {})
        entry_mode = c.get('entry_mode', 'skill_game')
        title = 'Tickets confirmed 🎟️'
        if entry_mode == 'random_tickets':
            body = f"{item.qty} ticket{'s' if item.qty != 1 else ''} in “{c.get('title', 'contest')}”. Your numbers are ready in My Tickets."
        else:
            body = f"{item.qty} ticket{'s' if item.qty != 1 else ''} in “{c.get('title', 'contest')}”. Head to My Games to play."
        await notify(
            db,
            user_id=user['user_id'],
            kind='purchase_success',
            title=title,
            body=body,
            contest_id=item.contest_id,
            ref_order_id=order.order_id,
        )

    # Return the first ticket_id + slug of the first item's contest so the
    # frontend can offer "Play now" straight after checkout without an extra
    # round-trip (see Cart.jsx post-checkout flow).
    first_ticket_id = tickets_to_insert[0]['ticket_id'] if tickets_to_insert else None
    first_contest_id = tickets_to_insert[0]['contest_id'] if tickets_to_insert else None
    first_slug = None
    first_game_type = None
    if first_contest_id:
        _c = contest_by_id.get(first_contest_id) or {}
        first_slug = _c.get('slug')
        first_game_type = _c.get('game_type')
    return {
        'order_id': order.order_id,
        'total': total,
        'tickets': len(tickets_to_insert),
        'method': 'wallet',
        'first_ticket_id': first_ticket_id,
        'first_contest_id': first_contest_id,
        'first_contest_slug': first_slug,
        'first_game_type': first_game_type,
    }


@router.get('/mine')
async def my_orders(request: Request, limit: int = 50):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    limit = max(1, min(limit, 200))  # cap so a rogue client can't ask for millions
    orders = await db.orders.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(limit)
    return orders


@router.get('/my-tickets')
async def my_tickets(request: Request, limit: int = 200):
    """Return the user's tickets ENRICHED with contest title/image/slug/game_type
    so the dashboard can render a proper card (title, thumbnail, Play CTA)
    without additional round-trips per ticket.
    """
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    limit = max(1, min(limit, 1000))
    tickets = await db.tickets.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(limit)
    if not tickets:
        return tickets
    contest_ids = list({t['contest_id'] for t in tickets})
    contest_map = {}
    async for c in db.contests.find(
        {'contest_id': {'$in': contest_ids}},
        {'_id': 0, 'contest_id': 1, 'title': 1, 'slug': 1, 'image': 1, 'hero_image': 1, 'game_type': 1, 'entry_mode': 1, 'status': 1, 'end_time': 1, 'prize_title': 1}
    ):
        contest_map[c['contest_id']] = c
    for t in tickets:
        c = contest_map.get(t['contest_id']) or {}
        t['contest'] = {
            'contest_id': t['contest_id'],
            'title': c.get('title'),
            'slug': c.get('slug'),
            # Contest documents can carry either `image` or `hero_image` depending on
            # when the record was created — accept both.
            'image': c.get('image') or c.get('hero_image'),
            'game_type': c.get('game_type'),
            'entry_mode': c.get('entry_mode') or 'skill_game',
            'status': c.get('status'),
            'end_time': c.get('end_time'),
            'prize_title': c.get('prize_title'),
        }
    return tickets


@router.get('/my-games')
async def my_games(request: Request):
    """Skill-game tickets that the player can still play.
    Returns one row per ticket with contest + attempts + best-score info so the
    dashboard can show Play / Continue / Expired buttons without extra round-trips.
    """
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()

    # Only skill-game tickets (contest has game_type set OR entry_mode='skill_game')
    tickets = await db.tickets.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    if not tickets:
        return {'games': []}

    contest_ids = list({t['contest_id'] for t in tickets})
    contests = {}
    async for c in db.contests.find({'contest_id': {'$in': contest_ids}}, {'_id': 0}):
        if c.get('game_type') and (c.get('entry_mode', 'skill_game') == 'skill_game'):
            contests[c['contest_id']] = c
    if not contests:
        return {'games': []}

    now = datetime.now(timezone.utc)

    # Bulk-fetch usage stats to avoid N+1: previously this endpoint fired one
    # `count_documents` + one `find` per ticket, meaning a user with 50
    # tickets across 10 contests would hit the DB 100+ times.
    active_contest_ids = list(contests.keys())
    used_by_contest: dict[str, int] = {}
    if active_contest_ids:
        used_agg = await db.game_scores.aggregate([
            {'$match': {'user_id': user['user_id'], 'contest_id': {'$in': active_contest_ids}}},
            {'$group': {'_id': '$contest_id', 'n': {'$sum': 1}}},
        ]).to_list(None)
        used_by_contest = {u['_id']: u['n'] for u in used_agg}

    ticket_ids = [t['ticket_id'] for t in tickets]
    attempts_by_ticket: dict[str, list] = {}
    if ticket_ids:
        # One find that returns every score row for every ticket the user owns;
        # we sort in Python (attempts_by_ticket lists are small, typically ≤10).
        async for row in db.game_scores.find(
            {'ticket_id': {'$in': ticket_ids}},
            {'_id': 0, 'ticket_id': 1, 'points': 1, 'completed_at': 1},
        ):
            attempts_by_ticket.setdefault(row['ticket_id'], []).append(row)
        for lst in attempts_by_ticket.values():
            lst.sort(key=lambda r: r.get('points') or 0, reverse=True)

    out = []
    for t in tickets:
        c = contests.get(t['contest_id'])
        if not c:
            continue
        apt = int(c.get('attempts_per_ticket') or c.get('max_attempts') or 3)
        apt = max(1, min(apt, 10))
        tickets_owned = sum(1 for t2 in tickets if t2['contest_id'] == c['contest_id'])
        total_allowed = apt * max(1, tickets_owned)
        used = used_by_contest.get(c['contest_id'], 0)
        attempts = attempts_by_ticket.get(t['ticket_id'], [])
        best = attempts[0] if attempts else None

        end_raw = c.get('end_date')
        expired = False
        try:
            if end_raw:
                end_dt = datetime.fromisoformat(str(end_raw).replace('Z', '+00:00'))
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=timezone.utc)
                expired = now > end_dt
        except (ValueError, TypeError):
            pass

        status = 'expired' if expired else ('completed' if used >= total_allowed else ('in_progress' if used > 0 else 'ready'))
        out.append({
            'ticket_id': t['ticket_id'],
            'contest_id': c['contest_id'],
            'contest_slug': c.get('slug') or c['contest_id'],
            'contest_title': c.get('title'),
            'contest_image': c.get('image'),
            'game_type': c.get('game_type'),
            'end_date': c.get('end_date'),
            'attempts_used': used,
            'attempts_remaining': max(0, total_allowed - used),
            'max_attempts': total_allowed,  # legacy key = pooled total
            'attempts_per_ticket': apt,
            'tickets_owned': tickets_owned,
            'best_points': best.get('points') if best else None,
            'last_attempt_at': attempts[0].get('completed_at') if attempts else None,
            'status': status,
        })
    # ready first, then in_progress, then completed, then expired
    order = {'ready': 0, 'in_progress': 1, 'completed': 2, 'expired': 3}
    out.sort(key=lambda x: (order.get(x['status'], 9), x.get('end_date') or ''))
    return {'games': out}
