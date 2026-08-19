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
    referrals = await db.referrals.find(
        {'referrer_user_id': user_id},
        {'_id': 0},
    ).sort('created_at', -1).limit(50).to_list(50)

    # Referral through which this user originally joined Prize League.
    referred_by_referral = await db.referrals.find_one(
        {'referred_user_id': user_id},
        {'_id': 0},
    )

    # Resolve safe display details for referral relationships.
    outgoing_ids = [
        r.get('referred_user_id')
        for r in referrals
        if r.get('referred_user_id')
    ]

    outgoing_users = {}
    if outgoing_ids:
        docs = await db.users.find(
            {'user_id': {'$in': outgoing_ids}},
            {
                '_id': 0,
                'user_id': 1,
                'name': 1,
                'email': 1,
                'public_id': 1,
            },
        ).to_list(100)

        outgoing_users = {x['user_id']: x for x in docs}

    for ref in referrals:
        referred = outgoing_users.get(ref.get('referred_user_id'), {})
        ref['referred_name'] = referred.get('name')
        ref['referred_email'] = referred.get('email')
        ref['referred_public_id'] = referred.get('public_id')

        if ref.get('status') == 'completed':
            ref['display_status'] = 'Rewarded'
        elif not ref.get('topup_qualified'):
            ref['display_status'] = 'Waiting for £10 top-up'
        elif not ref.get('contest_entered'):
            ref['display_status'] = 'Waiting for contest entry'
        else:
            ref['display_status'] = 'Processing reward'

    referrer_user = None
    if referred_by_referral and referred_by_referral.get('referrer_user_id'):
        referrer_user = await db.users.find_one(
            {'user_id': referred_by_referral['referrer_user_id']},
            {
                '_id': 0,
                'user_id': 1,
                'name': 1,
                'email': 1,
                'public_id': 1,
                'referral_code': 1,
            },
        )

    signup_bonus = {
        'eligible': bool(u.get('signup_bonus_offer_eligible')),
        'qualifying_topup_completed': bool(u.get('qualifying_topup_completed')),
        'qualifying_topup_amount_gbp': u.get('qualifying_topup_amount_gbp'),
        'qualifying_topup_at': u.get('qualifying_topup_at'),
        'qualifying_topup_session_id': u.get('qualifying_topup_session_id'),
        'granted': bool(u.get('signup_bonus_granted')),
        'granted_at': u.get('signup_bonus_granted_at'),
        'tokens': u.get('signup_bonus_tokens') or 0,
        'tx_id': u.get('signup_bonus_tx_id'),
        'topup_session_id': u.get('signup_bonus_topup_session_id'),
    }

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
        'referral_joined_via': referred_by_referral,
        'referrer_user': referrer_user,
        'signup_bonus': signup_bonus,
        'sessions': sessions,
        'admin_actions': admin_actions,
    }



class AdminOtpVerifyRequest(BaseModel):
    code: str


@router.post('/{user_id}/phone/send-otp')
async def admin_send_phone_otp(
    user_id: str,
    request: Request,
):
    admin = await require_admin(request)

    from deps import get_db
    from routers.twilio_routes import (
        _normalize_phone,
        _twilio_client,
    )
    from twilio.base.exceptions import TwilioRestException
    from datetime import timedelta

    db = get_db()

    user = await db.users.find_one(
        {'user_id': user_id},
        {
            '_id': 0,
            'user_id': 1,
            'phone': 1,
            'phone_verified': 1,
            'erased': 1,
        },
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail='User not found',
        )

    if user.get('erased'):
        raise HTTPException(
            status_code=400,
            detail='Cannot verify an erased account',
        )

    if not user.get('phone'):
        raise HTTPException(
            status_code=400,
            detail='User has no phone number',
        )

    phone = _normalize_phone(user['phone'])

    if user.get('phone_verified'):
        return {
            'ok': True,
            'already_verified': True,
            'phone': phone,
        }

    existing = await db.users.find_one(
        {
            'phone': phone,
            'phone_verified': True,
            'user_id': {'$ne': user_id},
        },
        {'_id': 1},
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail='This phone is already verified on another account',
        )

    now = datetime.now(timezone.utc)

    recent = await db.otp_attempts.find(
        {
            'phone': phone,
            'purpose': 'admin_phone_verify',
            'sent_at': {
                '$gte': now - timedelta(minutes=15)
            },
        },
        {
            '_id': 0,
            'sent_at': 1,
        },
    ).sort('sent_at', -1).to_list(20)

    if recent:
        newest = recent[0].get('sent_at')

        if isinstance(newest, str):
            try:
                newest = datetime.fromisoformat(newest)
            except Exception:
                newest = now

        if isinstance(newest, datetime) and newest.tzinfo is None:
            newest = newest.replace(tzinfo=timezone.utc)

        seconds_since = (
            now - newest
        ).total_seconds()

        if seconds_since < 30:
            raise HTTPException(
                status_code=429,
                detail=(
                    f'Please wait '
                    f'{max(1, int(30 - seconds_since))}s '
                    'before sending another code.'
                ),
            )

        if len(recent) >= 5:
            raise HTTPException(
                status_code=429,
                detail=(
                    'Too many OTP requests. '
                    'Please try again in 15 minutes.'
                ),
            )

    client, service_sid = _twilio_client()

    try:
        verification = (
            client.verify.v2
            .services(service_sid)
            .verifications
            .create(
                to=phone,
                channel='sms',
            )
        )
    except TwilioRestException:
        raise HTTPException(
            status_code=400,
            detail='Could not send SMS verification code',
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail='SMS verification service unavailable',
        )

    await db.otp_attempts.insert_one({
        'phone': phone,
        'purpose': 'admin_phone_verify',
        'target_user_id': user_id,
        'sent_at': now,
    })

    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'admin_phone_verification_sent',
        'admin_email': admin.get('email'),
        'admin_user_id': admin.get('user_id'),
        'target_user_id': user_id,
        'at': now,
    })

    return {
        'ok': True,
        'phone': phone,
        'status': verification.status,
    }


@router.post('/{user_id}/phone/verify-otp')
async def admin_verify_phone_otp(
    user_id: str,
    payload: AdminOtpVerifyRequest,
    request: Request,
):
    admin = await require_admin(request)

    from deps import get_db
    from otp_verify import verify_twilio_otp

    db = get_db()

    user = await db.users.find_one(
        {'user_id': user_id},
        {
            '_id': 0,
            'user_id': 1,
            'phone': 1,
            'phone_verified': 1,
            'erased': 1,
        },
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail='User not found',
        )

    if user.get('erased'):
        raise HTTPException(
            status_code=400,
            detail='Cannot verify an erased account',
        )

    if not user.get('phone'):
        raise HTTPException(
            status_code=400,
            detail='User has no phone number',
        )

    phone = await verify_twilio_otp(
        user['phone'],
        payload.code,
    )

    existing = await db.users.find_one(
        {
            'phone': phone,
            'phone_verified': True,
            'user_id': {'$ne': user_id},
        },
        {'_id': 1},
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail='This phone is already verified on another account',
        )

    now = datetime.now(timezone.utc)

    await db.users.update_one(
        {'user_id': user_id},
        {
            '$set': {
                'phone': phone,
                'phone_verified': True,
                'phone_verified_at': now,
            }
        },
    )

    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'admin_phone_verification_completed',
        'admin_email': admin.get('email'),
        'admin_user_id': admin.get('user_id'),
        'target_user_id': user_id,
        'at': now,
    })

    return {
        'ok': True,
        'phone': phone,
        'verified': True,
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
