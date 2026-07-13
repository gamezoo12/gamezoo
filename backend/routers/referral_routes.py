"""Referral programme: each user has a code; new signups can enter one and both parties earn a free ticket."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
from typing import Optional

from auth import get_current_user
from deps import get_db
from models import Referral, Ticket

REWARD_TICKETS = 1  # tickets both referrer and referred earn on completion

router = APIRouter(prefix='/api/referrals', tags=['referrals'])


async def _pick_reward_contest(db) -> Optional[dict]:
    """Pick a small-price live contest to grant a free ticket for."""
    return await db.contests.find_one(
        {'status': 'live', 'price': {'$lte': 5}},
        {'_id': 0},
        sort=[('price', 1)],
    )


async def _grant_free_ticket(db, user_id: str, user_name: str, note: str) -> Optional[str]:
    contest = await _pick_reward_contest(db)
    if not contest:
        return None
    ticket_number = int(contest.get('tickets_sold', 0)) + 1
    t = Ticket(
        order_id=f"referral_{user_id[:8]}_{ticket_number}",
        user_id=user_id,
        contest_id=contest['contest_id'],
        ticket_number=ticket_number,
    )
    await db.tickets.insert_one(t.model_dump())
    await db.contests.update_one({'contest_id': contest['contest_id']}, {'$inc': {'tickets_sold': 1}})
    # In-app notification
    await db.notifications.insert_one({
        'notification_id': f"nr_{t.ticket_id[-8:]}",
        'user_id': user_id,
        'type': 'referral_reward',
        'title': '🎁 Free ticket earned!',
        'body': f"{note} You got a free ticket #{ticket_number} in \"{contest['title']}\".",
        'contest_id': contest['contest_id'],
        'read': False,
        'created_at': datetime.now(timezone.utc),
    })
    return t.ticket_id


@router.get('/me')
async def my_referral(request: Request):
    user = await get_current_user(request)
    db = get_db()
    # Fetch code and stats
    full = await db.users.find_one({'user_id': user['user_id']}, {'_id': 0, 'referral_code': 1, 'name': 1})
    code = (full or {}).get('referral_code')
    if not code:
        # Backfill for legacy users
        import uuid
        code = uuid.uuid4().hex[:8].upper()
        await db.users.update_one({'user_id': user['user_id']}, {'$set': {'referral_code': code}})
    completed = await db.referrals.count_documents({'referrer_user_id': user['user_id'], 'status': 'completed'})
    pending = await db.referrals.count_documents({'referrer_user_id': user['user_id'], 'status': 'pending'})
    return {
        'code': code,
        'link_path': f"/?ref={code}",
        'completed': completed,
        'pending': pending,
        'tickets_earned': completed * REWARD_TICKETS,
    }


@router.post('/complete')
async def complete_referral(request: Request):
    """Player calls this once they've done a qualifying action (e.g. bought first ticket).
    Marks the referral as completed and grants both parties a free ticket."""
    user = await get_current_user(request)
    db = get_db()
    ref = await db.referrals.find_one({'referred_user_id': user['user_id'], 'status': 'pending'}, {'_id': 0})
    if not ref:
        raise HTTPException(status_code=404, detail='No pending referral for this user')
    # Grant tickets
    referrer = await db.users.find_one({'user_id': ref['referrer_user_id']}, {'_id': 0})
    t1 = await _grant_free_ticket(db, ref['referrer_user_id'], (referrer or {}).get('name', 'Friend'), 'Someone you invited just bought a ticket.')
    t2 = await _grant_free_ticket(db, user['user_id'], user['name'], 'Thanks for signing up via a referral link!')
    await db.referrals.update_one({'referral_id': ref['referral_id']}, {
        '$set': {'status': 'completed', 'reward_ticket_id': t2, 'completed_at': datetime.now(timezone.utc)},
    })
    return {'ok': True, 'referrer_ticket': t1, 'you_ticket': t2}


@router.get('/list')
async def list_my_referrals(request: Request):
    """Referrals invited by the current user."""
    user = await get_current_user(request)
    db = get_db()
    refs = await db.referrals.find({'referrer_user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).limit(50).to_list(50)
    # Enrich with referred user name
    referred_ids = [r['referred_user_id'] for r in refs]
    if referred_ids:
        users = await db.users.find({'user_id': {'$in': referred_ids}}, {'_id': 0, 'user_id': 1, 'email': 1, 'name': 1}).to_list(200)
        umap = {u['user_id']: u for u in users}
        for r in refs:
            u = umap.get(r['referred_user_id'], {})
            r['referred_email'] = u.get('email')
            r['referred_name'] = u.get('name')
    return {'referrals': refs}
