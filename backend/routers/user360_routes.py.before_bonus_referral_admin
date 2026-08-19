"""
Prize League — Admin User 360° details + delete/suspend workflow.

Endpoints:
    GET   /api/admin/users/{user_id}/360             — full profile aggregate
    POST  /api/admin/users/{user_id}/suspend         — soft close (reversible)
    POST  /api/admin/users/{user_id}/unsuspend       — reinstate
    POST  /api/admin/users/{user_id}/erase           — permanent erasure
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from auth import require_admin, verify_password

router = APIRouter(prefix='/api/admin/users', tags=['admin-users-360'])


class DeleteRequest(BaseModel):
    reason: str
    admin_password: str  # re-authentication


async def _sanitise(doc: dict) -> dict:
    if not doc:
        return {}
    d = dict(doc)
    d.pop('_id', None)
    d.pop('password_hash', None)
    return d


@router.get('/{user_id}/360')
async def user_360(user_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    u = await db.users.find_one({'user_id': user_id})
    if not u:
        raise HTTPException(404, 'User not found')

    wallet = await db.wallets.find_one({'user_id': user_id}, {'_id': 0})
    kyc = await db.kyc.find_one({'user_id': user_id}, {'_id': 0})
    orders = await db.orders.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(50).to_list(50)
    tickets = await db.tickets.find({'user_id': user_id}, {'_id': 0}).limit(200).to_list(200)
    scores = await db.game_scores.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(100).to_list(100)
    txs = await db.wallet_transactions.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(100).to_list(100)
    notifs = await db.notifications.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(30).to_list(30)
    support = await db.support_cases.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(30).to_list(30)
    referrals = await db.referrals.find({'referrer_user_id': user_id}, {'_id': 0}).limit(50).to_list(50)
    sessions = await db.user_sessions.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(20).to_list(20)
    admin_actions = await db.audit_log.find(
        {'target_user_id': user_id}, {'_id': 0},
    ).sort('at', -1).limit(50).to_list(50)

    return {
        'identity': await _sanitise(u),
        'kyc': kyc,
        'wallet': wallet,
        'stats': {
            'orders_count': len(orders),
            'tickets_count': len(tickets),
            'scores_count': len(scores),
            'wallet_txs_count': len(txs),
            'notifications_count': len(notifs),
            'support_cases_count': len(support),
            'referrals_count': len(referrals),
        },
        'orders': orders,
        'tickets': tickets,
        'scores': scores,
        'wallet_transactions': txs,
        'notifications': notifs,
        'support_cases': support,
        'referrals': referrals,
        'sessions': sessions,
        'admin_actions': admin_actions,
    }


@router.post('/{user_id}/suspend')
async def suspend_user(user_id: str, payload: DeleteRequest, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    me = await db.users.find_one({'user_id': admin['user_id']})
    if not me or not verify_password(payload.admin_password, me.get('password_hash') or ''):
        raise HTTPException(403, 'Admin password required')

    r = await db.users.update_one({'user_id': user_id}, {'$set': {'suspended': True, 'suspended_reason': payload.reason}})
    if r.matched_count == 0:
        raise HTTPException(404, 'User not found')
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'user_suspend',
        'admin_email': admin['email'],
        'admin_user_id': admin['user_id'],
        'target_user_id': user_id,
        'reason': payload.reason,
        'at': datetime.now(timezone.utc),
    })
    return {'ok': True}


@router.post('/{user_id}/unsuspend')
async def unsuspend_user(user_id: str, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.users.update_one({'user_id': user_id}, {'$set': {'suspended': False, 'suspended_reason': None}})
    if r.matched_count == 0:
        raise HTTPException(404, 'User not found')
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'user_unsuspend',
        'admin_email': admin['email'],
        'target_user_id': user_id,
        'at': datetime.now(timezone.utc),
    })
    return {'ok': True}


@router.post('/{user_id}/erase')
async def erase_user(user_id: str, payload: DeleteRequest, request: Request):
    admin = await require_admin(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(403, 'Only Super Admin can permanently erase users')
    from deps import get_db
    db = get_db()
    me = await db.users.find_one({'user_id': admin['user_id']})
    if not me or not verify_password(payload.admin_password, me.get('password_hash') or ''):
        raise HTTPException(403, 'Super Admin password required')

    target = await db.users.find_one({'user_id': user_id})
    if not target:
        raise HTTPException(404, 'User not found')
    if target.get('user_id') == admin['user_id']:
        raise HTTPException(400, 'Cannot erase your own account')

    now = datetime.now(timezone.utc)
    # Retain financial + fraud + audit records; only PII from user profile is removed.
    await db.users.update_one(
        {'user_id': user_id},
        {'$set': {
            'name': '[ERASED]',
            'email': f'erased_{user_id}@prizeleague.deleted',
            'phone': None,
            'address': None,
            'dob': None,
            'picture': None,
            'password_hash': None,
            'erased': True,
            'erased_at': now,
            'erased_by': admin['email'],
            'erase_reason': payload.reason,
            'suspended': True,
        }},
    )
    # Erase KYC personal data (retain regulatory subset separately if needed)
    await db.kyc.delete_many({'user_id': user_id})
    # Clear active sessions
    await db.user_sessions.delete_many({'user_id': user_id})
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'user_erase',
        'admin_email': admin['email'],
        'target_user_id': user_id,
        'target_email_before': target.get('email'),
        'reason': payload.reason,
        'at': now,
    })
    return {'ok': True}
