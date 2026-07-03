"""
Production-panel and player-notification endpoints.

- /api/production/upcoming-draws   – staff view of contests ending soon / drawn
- /api/production/draw/{id}        – alias for admin draw, accepts operator role
- /api/users/notifications         – player: list own notifications
- /api/users/notifications/mark-read – player: mark all read
"""
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timedelta, timezone

from auth import get_current_user
from services.draw_service import draw_contest

production_router = APIRouter(prefix='/api/production', tags=['production'])
notif_router = APIRouter(prefix='/api/users/notifications', tags=['notifications'])


async def _require_staff(request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('admin', 'super_admin', 'operator'):
        raise HTTPException(status_code=403, detail='Staff only')
    return user


# ---------- Production ----------
@production_router.get('/upcoming-draws')
async def upcoming_draws(request: Request, hours: int = 24):
    await _require_staff(request)
    from server import db_ref
    db = db_ref()
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=hours)

    ending_soon = await db.contests.find(
        {'status': 'live', 'end_date': {'$lte': horizon}},
        {'_id': 0},
    ).sort('end_date', 1).to_list(200)

    overdue = await db.contests.find(
        {'status': 'live', 'end_date': {'$lte': now}},
        {'_id': 0},
    ).to_list(200)

    recently_drawn = await db.winners.find({}, {'_id': 0}).sort('drawn_at', -1).limit(20).to_list(20)
    return {
        'now': now.isoformat(),
        'ending_soon': ending_soon,
        'overdue': overdue,
        'recently_drawn': recently_drawn,
    }


@production_router.post('/draw/{contest_id}')
async def production_draw(contest_id: str, request: Request):
    await _require_staff(request)
    from server import db_ref
    db = db_ref()
    result = await draw_contest(db, contest_id)
    if not result.get('ok'):
        code_map = {
            'contest_not_found': 404,
            'already_drawn': 400,
            'no_tickets': 400,
        }
        raise HTTPException(status_code=code_map.get(result.get('reason'), 400),
                            detail=result.get('reason', 'Draw failed'))
    return {'winner': result['winner']}


# ---------- Player notifications ----------
@notif_router.get('')
async def my_notifications(request: Request, only_unread: bool = False):
    user = await get_current_user(request)
    from server import db_ref
    db = db_ref()
    q = {'user_id': user['user_id']}
    if only_unread:
        q['read'] = False
    docs = await db.notifications.find(q, {'_id': 0}).sort('created_at', -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({'user_id': user['user_id'], 'read': False})
    return {'notifications': docs, 'unread': unread}


@notif_router.post('/mark-read')
async def mark_read(request: Request):
    user = await get_current_user(request)
    from server import db_ref
    db = db_ref()
    r = await db.notifications.update_many(
        {'user_id': user['user_id'], 'read': False},
        {'$set': {'read': True}},
    )
    return {'ok': True, 'updated': r.modified_count}
