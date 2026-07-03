from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
import random

from auth import get_current_user
from models import CheckoutInput, Order, Ticket

router = APIRouter(prefix='/api/orders', tags=['orders'])


@router.post('/checkout')
async def checkout(inp: CheckoutInput, request: Request):
    user = await get_current_user(request)
    if not inp.items:
        raise HTTPException(status_code=400, detail='Cart is empty')

    from deps import get_db
    db = get_db()

    order_items = []
    tickets_to_insert = []
    total = 0.0

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

        # Reserve ticket numbers
        base = c.get('tickets_sold', 0)
        for n in range(item.qty):
            tickets_to_insert.append(Ticket(
                order_id='',  # set below
                user_id=user['user_id'],
                contest_id=c['contest_id'],
                ticket_number=base + n + 1,
            ).model_dump())

        # Increment tickets_sold
        await db.contests.update_one({'contest_id': c['contest_id']}, {'$inc': {'tickets_sold': item.qty}})

        line_total = item.qty * float(c['price'])
        total += line_total
        order_items.append({
            'contest_id': c['contest_id'],
            'title': c['title'],
            'image': c['image'],
            'qty': item.qty,
            'price': float(c['price']),
            'line_total': line_total,
        })

    order = Order(user_id=user['user_id'], items=order_items, total=total, status='paid', method='mock')
    order_doc = order.model_dump()
    await db.orders.insert_one(order_doc)
    for t in tickets_to_insert:
        t['order_id'] = order.order_id
    if tickets_to_insert:
        await db.tickets.insert_many(tickets_to_insert)
    return {'order_id': order.order_id, 'total': total, 'tickets': len(tickets_to_insert)}


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
