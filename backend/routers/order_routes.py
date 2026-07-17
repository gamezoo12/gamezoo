from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone

from auth import get_current_user
from deps import get_db
from models import CheckoutInput, Order, Ticket
from routers.wallet_routes import _apply_tx, _get_or_create_wallet

router = APIRouter(prefix='/api/orders', tags=['orders'])


@router.post('/checkout')
async def checkout(inp: CheckoutInput, request: Request):
    user = await get_current_user(request)
    if not inp.items:
        raise HTTPException(status_code=400, detail='Cart is empty')

    db = get_db()

    order_items = []
    tickets_to_insert = []
    total = 0.0
    contest_by_id = {}

    for item in inp.items:
        c = await db.contests.find_one({'contest_id': item.contest_id}, {'_id': 0})
        if not c:
            raise HTTPException(status_code=404, detail=f'Contest not found: {item.contest_id}')
        if c.get('status') != 'live':
            raise HTTPException(status_code=400, detail=f'Contest closed: {c["title"]}')
        # Validate skill answer
        sq = c.get('skill_question') or {}
        if (item.skill_answer or '').strip() != sq.get('answer'):
            raise HTTPException(status_code=400, detail=f'Incorrect skill answer for: {c["title"]}')
        if item.qty <= 0 or item.qty > 500:
            raise HTTPException(status_code=400, detail='Invalid quantity')

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

    # Wallet balance check BEFORE mutating anything
    wallet = await _get_or_create_wallet(db, user['user_id'])
    if wallet['balance'] < total:
        raise HTTPException(
            status_code=402,
            detail=f'Insufficient wallet balance. You have £{wallet["balance"]:.2f}, need £{total:.2f}. Top up your wallet to continue.',
        )

    # All checks passed — commit ticket numbers, order, and wallet debit
    for item in inp.items:
        c = contest_by_id[item.contest_id]
        base = c.get('tickets_sold', 0)
        for n in range(item.qty):
            tickets_to_insert.append(Ticket(
                order_id='',  # set below
                user_id=user['user_id'],
                contest_id=c['contest_id'],
                ticket_number=base + n + 1,
            ).model_dump())
        await db.contests.update_one({'contest_id': c['contest_id']}, {'$inc': {'tickets_sold': item.qty}})

    order = Order(user_id=user['user_id'], items=order_items, total=total, status='paid', method='wallet')
    order_doc = order.model_dump()
    await db.orders.insert_one(order_doc)
    for t in tickets_to_insert:
        t['order_id'] = order.order_id
    if tickets_to_insert:
        await db.tickets.insert_many(tickets_to_insert)

    # Debit wallet
    await _apply_tx(db, user['user_id'], 'spend', -total, note=f'Order {order.order_id}', ref_order_id=order.order_id)

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

    return {'order_id': order.order_id, 'total': total, 'tickets': len(tickets_to_insert), 'method': 'wallet'}


@router.get('/mine')
async def my_orders(request: Request):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    orders = await db.orders.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return orders


@router.get('/my-tickets')
async def my_tickets(request: Request):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    tickets = await db.tickets.find({'user_id': user['user_id']}, {'_id': 0}).to_list(1000)
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
    tickets = await db.tickets.find({'user_id': user['user_id']}, {'_id': 0}).to_list(1000)
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
    out = []
    for t in tickets:
        c = contests.get(t['contest_id'])
        if not c:
            continue
        apt = int(c.get('attempts_per_ticket') or c.get('max_attempts') or 3)
        apt = max(1, min(apt, 10))
        # Total attempts pool = tickets_owned * apt (all tickets for this contest by this user)
        tickets_owned = sum(1 for t2 in tickets if t2['contest_id'] == c['contest_id'])
        total_allowed = apt * max(1, tickets_owned)
        # Attempts used across ALL tickets for this contest by this user
        used = await db.game_scores.count_documents({'user_id': user['user_id'], 'contest_id': c['contest_id']})
        attempts = await db.game_scores.find({'ticket_id': t['ticket_id']}, {'_id': 0}).sort('points', -1).to_list(50)
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
