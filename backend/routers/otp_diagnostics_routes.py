"""Admin OTP delivery diagnostics (no codes are ever stored or returned)."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query, Request

from auth import require_admin
from deps import get_db

router = APIRouter(prefix='/api/admin/otp-diagnostics', tags=['admin-otp'])


@router.get('')
async def otp_diagnostics(request: Request, hours: int = Query(24, ge=1, le=720)):
    await require_admin(request)
    db = get_db()
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    summary = await db.otp_events.aggregate([
        {'$match': {'at': {'$gte': since}}},
        {'$group': {'_id': {'channel': '$channel', 'purpose': '$purpose', 'result': '$result', 'provider_code': '$provider_code'}, 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
    ]).to_list(200)
    domains = await db.otp_events.aggregate([
        {'$match': {'at': {'$gte': since}, 'channel': 'email', 'purpose': {'$ne': 'check'}}},
        {'$group': {'_id': {'domain': '$domain', 'result': '$result'}, 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
    ]).to_list(100)
    recent = await db.otp_events.find({'at': {'$gte': since}}, {'_id': 0}).sort('at', -1).to_list(150)
    for r in recent:
        r['at'] = r['at'].replace(tzinfo=timezone.utc).isoformat() if r['at'].tzinfo is None else r['at'].isoformat()
    return {
        'hours': hours,
        'summary': [{**s['_id'], 'count': s['count']} for s in summary],
        'email_domains': [{**d['_id'], 'count': d['count']} for d in domains],
        'recent': recent,
    }
