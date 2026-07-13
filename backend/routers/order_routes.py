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
