from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
import random

from auth import require_admin
from models import Winner

router = APIRouter(prefix='/api/admin', tags=['admin'])


@router.get('/stats')
async def stats(request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    users_count = await db.users.count_documents({})
    contests_count = await db.contests.count_documents({})
    orders_count = await db.orders.count_documents({})
    tickets_count = await db.tickets.count_documents({})
    pipeline = [{'$group': {'_id': None, 'total': {'$sum': '$total'}}}]
    rev = await db.orders.aggregate(pipeline).to_list(1)
    revenue = rev[0]['total'] if rev else 0
    prize_pool_pipeline = [{'$group': {'_id': None, 'total': {'$sum': '$prize_amount'}}}]
    pp = await db.contests.aggregate(prize_pool_pipeline).to_list(1)
    prize_pool = pp[0]['total'] if pp else 0
    return {
        'users': users_count,
        'contests': contests_count,
        'orders': orders_count,
        'tickets_sold': tickets_count,
        'revenue': revenue,
        'prize_pool': prize_pool,
    }


@router.get('/users')
async def all_users(request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    users = await db.users.find({}, {'_id': 0, 'password_hash': 0}).sort('created_at', -1).to_list(500)
    # attach tickets/spent
    for u in users:
        u['tickets'] = await db.tickets.count_documents({'user_id': u['user_id']})
        agg = await db.orders.aggregate([{'$match': {'user_id': u['user_id']}}, {'$group': {'_id': None, 't': {'$sum': '$total'}}}]).to_list(1)
        u['spent'] = agg[0]['t'] if agg else 0
    return users


@router.get('/orders')
async def all_orders(request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    orders = await db.orders.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    # attach user name
    for o in orders:
        u = await db.users.find_one({'user_id': o['user_id']}, {'_id': 0, 'name': 1, 'email': 1})
        o['user_name'] = u['name'] if u else 'Unknown'
        o['user_email'] = u['email'] if u else ''
    return orders


@router.get('/contests')
async def all_contests(request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    return await db.contests.find({}, {'_id': 0}).sort('end_date', 1).to_list(500)


@router.get('/winners')
async def all_winners(request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    return await db.winners.find({}, {'_id': 0}).sort('drawn_at', -1).to_list(500)


@router.post('/draw/{contest_id}')
async def draw_winner(contest_id: str, request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    c = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='Contest not found')
    if c.get('status') != 'live':
        raise HTTPException(status_code=400, detail='Contest already drawn or archived')
    tickets = await db.tickets.find({'contest_id': contest_id}, {'_id': 0}).to_list(100000)
    if not tickets:
        raise HTTPException(status_code=400, detail='No tickets sold — cannot draw')
    chosen = random.choice(tickets)
    user = await db.users.find_one({'user_id': chosen['user_id']}, {'_id': 0, 'password_hash': 0})
    winner = Winner(
        contest_id=contest_id,
        user_id=chosen['user_id'],
        user_name=user['name'] if user else 'Anonymous',
        ticket_number=chosen['ticket_number'],
        prize_amount=c['prize_amount'],
        prize_title=c['title'],
    )
    await db.winners.insert_one(winner.model_dump())
    await db.contests.update_one({'contest_id': contest_id}, {'$set': {'status': 'drawn'}})
    return {'winner': winner.model_dump()}


@router.post('/winners/{winner_id}/mark-paid')
async def mark_paid(winner_id: str, request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    r = await db.winners.update_one({'winner_id': winner_id}, {'$set': {'paid_out': True}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Winner not found')
    return {'ok': True}


@router.post('/contests/{contest_id}/launch')
async def launch_contest(contest_id: str, request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    r = await db.contests.update_one({'contest_id': contest_id}, {'$set': {'status': 'live'}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    return {'ok': True, 'status': 'live'}


@router.post('/contests/{contest_id}/pause')
async def pause_contest(contest_id: str, request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    r = await db.contests.update_one({'contest_id': contest_id}, {'$set': {'status': 'draft'}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    return {'ok': True, 'status': 'draft'}


@router.delete('/contests/{contest_id}')
async def delete_contest(contest_id: str, request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    r = await db.contests.delete_one({'contest_id': contest_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    await db.tickets.delete_many({'contest_id': contest_id})
    return {'ok': True}
