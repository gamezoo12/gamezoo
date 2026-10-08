"""
Prize League — Admin User 360° details + delete/suspend workflow.

Endpoints:
    GET   /api/admin/users/{user_id}/360             — full profile aggregate
    POST  /api/admin/users/{user_id}/suspend         — soft close (reversible)
    POST  /api/admin/users/{user_id}/unsuspend       — reinstate
    POST  /api/admin/users/{user_id}/erase           — permanent erasure
"""
from __future__ import annotations
import os
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from auth import require_admin, verify_password

logger = logging.getLogger(__name__)

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

    # ------------------------------------------------------------------
    # Free World history (read-only): progression, per-level attempts,
    # catch-up skips, Championship winnings, and token spends — all with
    # timings. Aggregated from existing collections; nothing is mutated.
    # ------------------------------------------------------------------
    world_progress = await db.world_progress.find_one(
        {'user_id': user_id}, {'_id': 0},
    )

    world_level_attempts = await db.world_level_attempts.find(
        {'user_id': user_id}, {'_id': 0},
    ).sort('created_at', -1).limit(200).to_list(200)

    world_level_skips = await db.world_level_skips.find(
        {'user_id': user_id}, {'_id': 0},
    ).sort('skipped_at', -1).limit(200).to_list(200)

    world_winnings = await db.world_winner_awards.find(
        {'user_id': user_id}, {'_id': 0},
    ).sort('created_at', -1).limit(200).to_list(200)

    world_level_unlocks = await db.world_level_unlock_reservations.find(
        {'user_id': user_id}, {'_id': 0},
    ).sort('created_at', -1).limit(200).to_list(200)

    world_token_retries = await db.world_token_retry_reservations.find(
        {'user_id': user_id}, {'_id': 0},
    ).sort('created_at', -1).limit(200).to_list(200)

    # Normalise token history into a single, sorted, display-friendly list.
    world_token_history = []
    for r in world_level_unlocks:
        world_token_history.append({
            'kind': 'level_unlock',
            'champion_stage': r.get('champion_stage'),
            'level': r.get('level'),
            'token_cost': r.get('token_cost'),
            'status': r.get('status'),
            'paid': bool(r.get('token_payment_verified')),
            'at': r.get('created_at'),
        })
    for r in world_token_retries:
        world_token_history.append({
            'kind': 'level_retry',
            'champion_stage': r.get('champion_stage'),
            'level': r.get('level'),
            'token_cost': r.get('token_cost'),
            'status': r.get('status'),
            'paid': bool(r.get('token_payment_verified')),
            'at': r.get('created_at'),
        })
    world_token_history.sort(
        key=lambda x: (x.get('at') is not None, x.get('at')),
        reverse=True,
    )

    world_winnings_total = sum(
        int(w.get('winning_amount') or 0) for w in world_winnings
    )

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
        'world': {
            'progress': world_progress,
            'level_attempts': world_level_attempts,
            'level_skips': world_level_skips,
            'winnings': world_winnings,
            'winnings_total': world_winnings_total,
            'token_history': world_token_history,
            'stats': {
                'level_attempts_count': len(world_level_attempts),
                'level_skips_count': len(world_level_skips),
                'winnings_count': len(world_winnings),
                'token_events_count': len(world_token_history),
                'champion_stage': (world_progress or {}).get('champion_stage'),
                'current_level': (world_progress or {}).get('current_level'),
            },
        },
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


# ============================================================================
# Admin Alerts / Campaigns
# Uses the existing db.notifications collection so current player notification
# endpoints continue to work unchanged.
# ============================================================================

from typing import List, Literal
from pydantic import Field


class AdminAlertCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=4000)
    alert_type: str = Field(default='custom', max_length=80)
    user_from: int = Field(default=1, ge=1)
    user_to: int = Field(default=1000, ge=1)
    channels: List[Literal['in_app', 'email', 'sms']] = Field(
        default_factory=lambda: ['in_app']
    )


def _alert_public(doc: dict) -> dict:
    d = dict(doc or {})
    d.pop('_id', None)
    return d


def _twilio_messaging():
    """Return (Client, messaging_service_sid) for the configured Twilio
    Messaging Service, or (None, None) if the backend secrets are not set.

    Reuses the already-configured Twilio account credentials. The Messaging
    Service SID is intentionally separate from the Verify SID used for OTP.
    Credentials are read from the environment and never logged or returned.
    """
    sid = os.environ.get('TWILIO_ACCOUNT_SID')
    token = os.environ.get('TWILIO_AUTH_TOKEN')
    messaging_service_sid = os.environ.get('TWILIO_MESSAGING_SERVICE_SID')
    if not (sid and token and messaging_service_sid):
        return None, None
    from twilio.rest import Client
    return Client(sid, token), messaging_service_sid


async def _recount_campaign(db, campaign_id: str) -> None:
    """Recompute per-channel/status delivery counts for a campaign."""
    counts: dict = {}
    cursor = db.alert_deliveries.find(
        {'campaign_id': campaign_id},
        {'_id': 0, 'channel': 1, 'status': 1},
    )
    async for d in cursor:
        ch = d.get('channel')
        st = d.get('status')
        counts.setdefault(ch, {})
        counts[ch][st] = counts[ch].get(st, 0) + 1
    await db.alert_campaigns.update_one(
        {'campaign_id': campaign_id},
        {'$set': {
            'delivery_counts': counts,
            'updated_at': datetime.now(timezone.utc),
        }},
    )


async def _send_campaign_sms(campaign_id: str, message: str, sends: list) -> None:
    """Background delivery of campaign SMS via the Twilio Messaging Service.

    - Claims each delivery (pending -> sending) atomically before calling
      Twilio, which prevents duplicate sends if this runs more than once.
    - Stores the Twilio Message SID and sets status from the actual API
      result. Never marks a record 'delivered' (that needs delivery webhooks).
    - Never raises to the caller; failures are recorded per-delivery.
    """
    from deps import get_db
    db = get_db()

    client, messaging_service_sid = _twilio_messaging()
    if not client:
        # Configuration disappeared between request and send — report it,
        # never pretend the messages were sent.
        await db.alert_deliveries.update_many(
            {'campaign_id': campaign_id, 'channel': 'sms', 'status': 'pending'},
            {'$set': {
                'status': 'skipped',
                'reason': 'sms_not_configured',
                'updated_at': datetime.now(timezone.utc),
            }},
        )
        await _recount_campaign(db, campaign_id)
        return

    from twilio.base.exceptions import TwilioRestException

    for item in sends:
        delivery_id = item['delivery_id']
        now = datetime.now(timezone.utc)

        # Atomic claim: only proceed if still pending.
        claimed = await db.alert_deliveries.find_one_and_update(
            {'delivery_id': delivery_id, 'status': 'pending'},
            {'$set': {'status': 'sending', 'updated_at': now}},
        )
        if not claimed:
            continue

        try:
            msg = client.messages.create(
                messaging_service_sid=messaging_service_sid,
                to=item['phone'],
                body=message,
            )
            await db.alert_deliveries.update_one(
                {'delivery_id': delivery_id},
                {'$set': {
                    'status': 'sent',
                    'provider_status': getattr(msg, 'status', None) or 'queued',
                    'message_sid': msg.sid,
                    'reason': None,
                    'updated_at': datetime.now(timezone.utc),
                }},
            )
        except TwilioRestException as e:
            await db.alert_deliveries.update_one(
                {'delivery_id': delivery_id},
                {'$set': {
                    'status': 'failed',
                    'reason': 'twilio_error',
                    'error_code': getattr(e, 'code', None),
                    'updated_at': datetime.now(timezone.utc),
                }},
            )
            logger.warning(
                'Campaign %s SMS to user %s failed (code %s)',
                campaign_id, item.get('user_id'), getattr(e, 'code', None),
            )
        except Exception as e:  # noqa: BLE001 - never crash the worker
            await db.alert_deliveries.update_one(
                {'delivery_id': delivery_id},
                {'$set': {
                    'status': 'failed',
                    'reason': 'send_error',
                    'updated_at': datetime.now(timezone.utc),
                }},
            )
            logger.warning('Campaign %s SMS send error: %s', campaign_id, e)

    await _recount_campaign(db, campaign_id)


@router.post('/alerts/campaigns')
async def create_alert_campaign(
    payload: AdminAlertCreateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Create an alert campaign for a stable 1-based registration range.

    Example: user_from=1, user_to=1000 targets the first 1000 registered
    non-erased users. The same ordering is used for preview and send.

    In-app delivery is performed immediately using the existing notifications
    collection. Email/SMS are recorded as pending until a delivery provider is
    connected; they are never falsely reported as sent.
    """
    admin = await require_admin(request)

    if payload.user_to < payload.user_from:
        raise HTTPException(
            status_code=400,
            detail='user_to must be greater than or equal to user_from',
        )

    # Safety cap: one request may target at most 10,000 users.
    target_count = payload.user_to - payload.user_from + 1
    if target_count > 10000:
        raise HTTPException(
            status_code=400,
            detail='A single campaign can target at most 10,000 users',
        )

    from deps import get_db
    db = get_db()

    now = datetime.now(timezone.utc)
    campaign_id = f'alt_{uuid.uuid4().hex[:16]}'

    # Whether the Twilio Messaging Service is configured for real SMS sends.
    _mclient, _ = _twilio_messaging()
    sms_configured = _mclient is not None

    # Stable audience order. created_at is preferred; user_id breaks ties.
    users = await db.users.find(
        {'erased': {'$ne': True}},
        {
            '_id': 0,
            'user_id': 1,
            'email': 1,
            'phone': 1,
            'phone_verified': 1,
            'sms_consent': 1,
            'created_at': 1,
        },
    ).sort([('created_at', 1), ('user_id', 1)]).skip(
        payload.user_from - 1
    ).limit(target_count).to_list(target_count)

    campaign = {
        'campaign_id': campaign_id,
        'title': payload.title.strip(),
        'message': payload.message.strip(),
        'alert_type': payload.alert_type.strip() or 'custom',
        'user_from': payload.user_from,
        'user_to': payload.user_to,
        'requested_count': target_count,
        'targeted_count': len(users),
        'channels': list(dict.fromkeys(payload.channels)),
        'created_by_user_id': admin.get('user_id'),
        'created_by_email': admin.get('email'),
        'created_at': now,
        'status': 'processing',
    }
    await db.alert_campaigns.insert_one(dict(campaign))

    notification_docs = []
    delivery_docs = []
    pending_sms = []

    for position, user in enumerate(users, start=payload.user_from):
        user_id = user.get('user_id')
        if not user_id:
            continue

        for channel in campaign['channels']:
            delivery_id = f'ald_{uuid.uuid4().hex[:18]}'

            if channel == 'in_app':
                notification_id = f'ntf_{uuid.uuid4().hex[:18]}'
                notification_docs.append({
                    'notification_id': notification_id,
                    'user_id': user_id,
                    'kind': 'admin_alert',
                    'type': campaign['alert_type'],
                    'title': campaign['title'],
                    'message': campaign['message'],
                    'read': False,
                    'campaign_id': campaign_id,
                    'created_at': now,
                })
                status = 'sent'
                reason = None
            elif channel == 'email':
                # Do not claim delivery until an email provider is connected.
                status = 'pending' if user.get('email') else 'skipped'
                reason = None if user.get('email') else 'no_email'
            else:  # sms
                has_verified_phone = bool(
                    user.get('phone') and user.get('phone_verified')
                )
                has_consent = user.get('sms_consent') is True
                if not has_verified_phone:
                    status = 'skipped'
                    reason = 'no_verified_phone'
                elif not has_consent:
                    # Respect consent / opt-outs: never send without it.
                    status = 'skipped'
                    reason = 'no_sms_consent'
                elif not sms_configured:
                    # Report the missing configuration instead of pretending.
                    status = 'skipped'
                    reason = 'sms_not_configured'
                else:
                    status = 'pending'
                    reason = None
                    pending_sms.append({
                        'delivery_id': delivery_id,
                        'user_id': user_id,
                        'phone': user.get('phone'),
                    })

            delivery_docs.append({
                'delivery_id': delivery_id,
                'campaign_id': campaign_id,
                'user_id': user_id,
                'user_position': position,
                'channel': channel,
                'status': status,
                'reason': reason,
                'created_at': now,
                'updated_at': now,
            })

    if notification_docs:
        await db.notifications.insert_many(notification_docs)

    if delivery_docs:
        await db.alert_deliveries.insert_many(delivery_docs)

    counts = {}
    for d in delivery_docs:
        channel = d['channel']
        status = d['status']
        counts.setdefault(channel, {})
        counts[channel][status] = counts[channel].get(status, 0) + 1

    await db.alert_campaigns.update_one(
        {'campaign_id': campaign_id},
        {
            '$set': {
                'status': 'created',
                'delivery_counts': counts,
                'completed_at': datetime.now(timezone.utc),
            }
        },
    )

    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'admin_alert_campaign_created',
        'admin_email': admin.get('email'),
        'admin_user_id': admin.get('user_id'),
        'campaign_id': campaign_id,
        'user_from': payload.user_from,
        'user_to': payload.user_to,
        'targeted_count': len(users),
        'channels': campaign['channels'],
        'at': now,
    })

    # Send SMS in the background so bulk campaigns never block the API
    # response. Each delivery is claimed atomically to prevent duplicates.
    if pending_sms:
        background_tasks.add_task(
            _send_campaign_sms,
            campaign_id,
            campaign['message'],
            pending_sms,
        )

    return {
        'ok': True,
        'campaign_id': campaign_id,
        'targeted_count': len(users),
        'counts': counts,
        'sms_configured': sms_configured,
        'sms_queued': len(pending_sms),
    }


@router.get('/alerts/campaigns')
async def list_alert_campaigns(
    request: Request,
    limit: int = 50,
):
    await require_admin(request)
    from deps import get_db
    db = get_db()

    limit = max(1, min(int(limit), 200))
    docs = await db.alert_campaigns.find(
        {},
        {'_id': 0},
    ).sort('created_at', -1).limit(limit).to_list(limit)

    return {'campaigns': docs}


@router.get('/alerts/campaigns/{campaign_id}')
async def get_alert_campaign(
    campaign_id: str,
    request: Request,
):
    await require_admin(request)
    from deps import get_db
    db = get_db()

    campaign = await db.alert_campaigns.find_one(
        {'campaign_id': campaign_id},
        {'_id': 0},
    )
    if not campaign:
        raise HTTPException(status_code=404, detail='Campaign not found')

    pipeline = [
        {'$match': {'campaign_id': campaign_id}},
        {
            '$group': {
                '_id': {
                    'channel': '$channel',
                    'status': '$status',
                },
                'count': {'$sum': 1},
            }
        },
    ]
    grouped = await db.alert_deliveries.aggregate(pipeline).to_list(100)

    counts = {}
    for row in grouped:
        channel = row['_id']['channel']
        status = row['_id']['status']
        counts.setdefault(channel, {})
        counts[channel][status] = row['count']

    campaign['delivery_counts'] = counts
    return campaign


@router.get('/alerts/campaigns/{campaign_id}/deliveries')
async def get_alert_deliveries(
    campaign_id: str,
    request: Request,
    status: Optional[str] = None,
    channel: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
):
    await require_admin(request)
    from deps import get_db
    db = get_db()

    q = {'campaign_id': campaign_id}
    if status:
        q['status'] = status
    if channel:
        if channel not in ('in_app', 'email', 'sms'):
            raise HTTPException(status_code=400, detail='Invalid channel')
        q['channel'] = channel

    skip = max(0, int(skip))
    limit = max(1, min(int(limit), 500))

    total = await db.alert_deliveries.count_documents(q)
    docs = await db.alert_deliveries.find(
        q,
        {'_id': 0},
    ).sort([('user_position', 1), ('channel', 1)]).skip(
        skip
    ).limit(limit).to_list(limit)

    return {
        'deliveries': docs,
        'total': total,
        'skip': skip,
        'limit': limit,
    }
