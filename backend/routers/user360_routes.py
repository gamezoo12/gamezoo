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
from pydantic import BaseModel, Field
from typing import Literal, Optional

from auth import phone_is_verified, require_admin, verify_password
from services.promo_consent import admin_web_push_enable_updates

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/admin/users', tags=['admin-users-360'])


class DeleteRequest(BaseModel):
    reason: str
    admin_password: str  # re-authentication


class BulkUserActionRequest(BaseModel):
    user_ids: list[str] = Field(min_length=1, max_length=200)
    action: Literal['credit', 'sms_grant', 'sms_revoke', 'web_push_grant', 'web_push_revoke']
    batch_id: str = Field(min_length=16, max_length=64)
    amount: Optional[float] = None
    note: str = Field(default='', max_length=500)
    consent_evidence: str = Field(default='', max_length=2000)


class UserWalletAdjustmentRequest(BaseModel):
    amount: float = Field(ge=-1_000_000, le=1_000_000)
    wallet: Optional[Literal['winnings', 'bonus', 'winning_bonus', 'topup']] = None
    reason: str = Field(min_length=10, max_length=300)
    operation_id: str = Field(min_length=16, max_length=64)


class UserWebPushDisableRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=300)


class UserWebPushGrantRequest(BaseModel):
    evidence: str = Field(min_length=10, max_length=2000)


async def _sanitise(doc: dict) -> dict:
    if not doc:
        return {}
    d = dict(doc)
    d.pop('_id', None)
    d.pop('password_hash', None)
    from auth import phone_is_verified
    d['phone_verified'] = phone_is_verified(d)
    return d


@router.post('/bulk-actions')
async def bulk_user_actions(payload: BulkUserActionRequest, request: Request):
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin or super-admin can run bulk user actions')

    user_ids = list(dict.fromkeys(user_id.strip() for user_id in payload.user_ids if user_id.strip()))
    if not user_ids:
        raise HTTPException(status_code=400, detail='Select at least one user')
    if payload.action == 'credit':
        if payload.amount is None or not 0 < float(payload.amount) <= 500:
            raise HTTPException(status_code=400, detail='Credit must be greater than 0 and at most 500 tokens per user')
        if len(payload.note.strip()) < 10:
            raise HTTPException(status_code=400, detail='A credit reason of at least 10 characters is required')
    elif payload.action == 'sms_grant':
        if len(payload.consent_evidence.strip()) < 20:
            raise HTTPException(status_code=400, detail='Documented consent evidence of at least 20 characters is required')
    elif payload.action == 'web_push_grant':
        if len(payload.consent_evidence.strip()) < 10:
            raise HTTPException(status_code=400, detail='A reason of at least 10 characters is required')
    elif payload.action in ('sms_revoke', 'web_push_revoke') and len(payload.note.strip()) < 10:
        raise HTTPException(status_code=400, detail='A revocation reason of at least 10 characters is required')

    from deps import get_db
    from routers.wallet_routes import _apply_tx_idempotent
    db = get_db()
    users = await db.users.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1, 'phone': 1,
         'phone_verified': 1, 'sms_consent': 1, 'erased': 1},
    ).to_list(len(user_ids))
    user_map = {user['user_id']: user for user in users}
    batch_id = payload.batch_id
    now = datetime.now(timezone.utc)
    items = []

    for user_id in user_ids:
        user = user_map.get(user_id)
        if not user:
            items.append({'user_id': user_id, 'status': 'skipped', 'reason': 'User not found'})
            continue
        if user.get('erased'):
            items.append({'user_id': user_id, 'status': 'skipped', 'reason': 'Account erased'})
            continue

        if payload.action == 'credit':
            try:
                await _apply_tx_idempotent(
                    db, user_id, 'admin_adjust', float(payload.amount),
                    note=f"Bulk credit by {admin.get('email')}: {payload.note.strip()}",
                    ref_order_id=f'bulk_admin_credit:{batch_id}:{user_id}',
                )
                await db.audit_log.insert_one({
                    'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
                    'kind': 'admin_bulk_wallet_credit',
                    'admin_user_id': admin.get('user_id'),
                    'admin_email': admin.get('email'),
                    'target_user_id': user_id,
                    'amount': float(payload.amount),
                    'reason': payload.note.strip(),
                    'batch_id': batch_id,
                    'at': now,
                })
                items.append({'user_id': user_id, 'status': 'success', 'amount': float(payload.amount)})
            except Exception as exc:
                items.append({'user_id': user_id, 'status': 'failed', 'reason': str(exc)[:200]})
            continue

        if payload.action == 'sms_grant' and (not user.get('phone') or not user.get('phone_verified')):
            items.append({'user_id': user_id, 'status': 'skipped', 'reason': 'Verified phone required'})
            continue

        if payload.action == 'web_push_revoke':
            await db.users.update_one({'user_id': user_id}, {'$set': {
                'web_push_enabled': False,
                'web_push_enabled_at': None,
                'web_push_admin_enabled': False,
                'web_push_admin_pending': False,
                'web_push_consent_at': now,
                'web_push_consent_source': 'admin',
                'web_push_admin_reason': payload.note.strip(),
            }})
            audit_id = f'aud_{payload.action}_{batch_id}_{user_id}'
            await db.audit_log.update_one({'audit_id': audit_id}, {'$setOnInsert': {
                'audit_id': audit_id,
                'kind': 'admin_bulk_web_push_consent_change',
                'admin_user_id': admin.get('user_id'),
                'admin_email': admin.get('email'),
                'target_user_id': user_id,
                'consent': False,
                'source': 'admin',
                'reason': payload.note.strip(),
                'batch_id': batch_id,
                'at': now,
            }}, upsert=True)
            items.append({'user_id': user_id, 'status': 'success', 'consent': False})
            continue

        if payload.action == 'web_push_grant':
            active_devices = await db.web_push_subscriptions.count_documents(
                {'user_id': user_id, 'active': True},
            )
            evidence = payload.consent_evidence.strip()
            await db.users.update_one({'user_id': user_id}, {'$set': admin_web_push_enable_updates(now, admin.get('email'), evidence)})
            audit_id = f'aud_{payload.action}_{batch_id}_{user_id}'
            await db.audit_log.update_one({'audit_id': audit_id}, {'$setOnInsert': {
                'audit_id': audit_id,
                'kind': 'admin_bulk_web_push_consent_change',
                'admin_user_id': admin.get('user_id'),
                'admin_email': admin.get('email'),
                'target_user_id': user_id,
                'consent': False,
                'pending_browser_permission': True,
                'source': 'admin',
                'reason': evidence,
                'batch_id': batch_id,
                'at': now,
            }}, upsert=True)
            items.append({'user_id': user_id, 'status': 'success', 'pending_browser_permission': True, 'active_devices': active_devices})
            continue

        updates = {
            'sms_consent': payload.action == 'sms_grant',
            'sms_consent_at': now,
            'sms_consent_source': 'admin_bulk',
        }
        if payload.action == 'sms_grant':
            updates.update({'sms_opt_out': False, 'sms_consent_evidence': payload.consent_evidence.strip()})
        await db.users.update_one({'user_id': user_id}, {'$set': updates})
        await db.audit_log.insert_one({
            'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
            'kind': 'admin_bulk_sms_consent_change',
            'admin_user_id': admin.get('user_id'),
            'admin_email': admin.get('email'),
            'target_user_id': user_id,
            'consent': payload.action == 'sms_grant',
            'reason': payload.consent_evidence.strip() if payload.action == 'sms_grant' else payload.note.strip(),
            'batch_id': batch_id,
            'at': now,
        })
        items.append({'user_id': user_id, 'status': 'success'})

    return {
        'batch_id': batch_id,
        'action': payload.action,
        'selected': len(user_ids),
        'succeeded': sum(item['status'] == 'success' for item in items),
        'skipped': sum(item['status'] == 'skipped' for item in items),
        'failed': sum(item['status'] == 'failed' for item in items),
        'items': items,
    }


@router.get('/{user_id}/wallet-breakdown')
async def user_wallet_breakdown(user_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    from services.wallet_admin_adjust import wallet_breakdown
    db = get_db()
    w = await db.wallets.find_one({'user_id': user_id}, {'_id': 0}) or {}
    txs = await db.wallet_tx.find({'user_id': user_id, 'kind': 'admin_adjust'}, {'_id': 0}).sort('created_at', -1).to_list(100)
    return {'wallets': wallet_breakdown(w), 'adjustments': txs}


@router.post('/{user_id}/wallet-adjust')
async def adjust_user_wallet(user_id: str, payload: UserWalletAdjustmentRequest, request: Request):
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin or super-admin can adjust user wallets')
    if payload.amount == 0:
        raise HTTPException(status_code=400, detail='Adjustment amount cannot be zero')

    from deps import get_db
    from routers.wallet_routes import _apply_tx_idempotent

    db = get_db()
    user = await db.users.find_one(
        {'user_id': user_id}, {'_id': 0, 'user_id': 1, 'erased': 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    if user.get('erased'):
        raise HTTPException(status_code=400, detail='Cannot adjust an erased account')

    reason = payload.reason.strip()
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail='Adjustment reason must be at least 10 characters')
    operation_id = payload.operation_id.strip()
    if len(operation_id) < 16:
        raise HTTPException(status_code=400, detail='A valid operation ID is required')

    note = f"Admin adjustment by {admin.get('email', admin.get('user_id'))}: {reason}"
    if payload.wallet:
        from services.wallet_admin_adjust import WALLET_LABELS, adjust_single_wallet
        note = f"{WALLET_LABELS[payload.wallet]} · {note}"
        result = await adjust_single_wallet(db, user_id, payload.wallet, payload.amount, note=note,
                                            operation_id=operation_id, admin=admin)
    else:
        result = await _apply_tx_idempotent(
            db, user_id, 'admin_adjust', round(float(payload.amount), 2),
            note=note, ref_order_id=f'admin_user_adjust:{operation_id}',
        )
    now = datetime.now(timezone.utc)
    await db.audit_log.update_one(
        {'audit_id': f'aud_wallet_adjust_{operation_id}'},
        {'$setOnInsert': {
            'audit_id': f'aud_wallet_adjust_{operation_id}',
            'kind': 'admin_user_wallet_adjustment',
            'admin_user_id': admin.get('user_id'),
            'admin_email': admin.get('email'),
            'target_user_id': user_id,
            'amount': round(float(payload.amount), 2),
            'wallet': payload.wallet or 'legacy_default',
            'reason': reason,
            'operation_id': operation_id,
            'at': now,
        }},
        upsert=True,
    )
    return {'ok': True, **result}


@router.post('/{user_id}/web-push/disable')
async def disable_user_web_push(user_id: str, payload: UserWebPushDisableRequest, request: Request):
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin or super-admin can disable Web Push')
    reason = payload.reason.strip()
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail='A reason of at least 10 characters is required')

    from deps import get_db
    db = get_db()
    user = await db.users.find_one(
        {'user_id': user_id}, {'_id': 0, 'user_id': 1, 'erased': 1, 'web_push_enabled': 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    if user.get('erased'):
        raise HTTPException(status_code=400, detail='Cannot update an erased account')

    now = datetime.now(timezone.utc)
    await db.users.update_one({'user_id': user_id}, {'$set': {
        'web_push_enabled': False,
        'web_push_enabled_at': None,
        'web_push_admin_enabled': False,
        'web_push_admin_pending': False,
        'web_push_consent_at': now,
        'web_push_consent_source': 'admin',
        'web_push_admin_reason': reason,
    }})
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'admin_web_push_consent_change',
        'admin_user_id': admin.get('user_id'),
        'admin_email': admin.get('email'),
        'target_user_id': user_id,
        'consent': False,
        'source': 'admin',
        'reason': reason,
        'at': now,
    })
    return {'ok': True, 'web_push_enabled': False, 'web_push_consent_at': now.isoformat(), 'web_push_consent_source': 'admin'}


@router.post('/{user_id}/web-push/enable')
async def enable_user_web_push(user_id: str, payload: UserWebPushGrantRequest, request: Request):
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin or super-admin can grant Web Push consent')
    evidence = payload.evidence.strip()
    if len(evidence) < 10:
        raise HTTPException(status_code=400, detail='A reason of at least 10 characters is required')

    from deps import get_db
    db = get_db()
    user = await db.users.find_one(
        {'user_id': user_id}, {'_id': 0, 'user_id': 1, 'erased': 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    if user.get('erased'):
        raise HTTPException(status_code=400, detail='Cannot update an erased account')
    active_devices = await db.web_push_subscriptions.count_documents(
        {'user_id': user_id, 'active': True},
    )
    now = datetime.now(timezone.utc)
    await db.users.update_one({'user_id': user_id}, {'$set': admin_web_push_enable_updates(now, admin.get('email'), evidence)})
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'admin_web_push_consent_change',
        'admin_user_id': admin.get('user_id'),
        'admin_email': admin.get('email'),
        'target_user_id': user_id,
        'consent': False,
        'pending_browser_permission': True,
        'source': 'admin',
        'reason': evidence,
        'active_devices': active_devices,
        'at': now,
    })
    return {
        'ok': True,
        'web_push_admin_pending': True,
        'web_push_device_count': active_devices,
    }


@router.get('/{user_id}/360')
async def user_360(user_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    u = await db.users.find_one({'user_id': user_id})
    if not u:
        raise HTTPException(404, 'User not found')

    from services.push_delivery import web_push_status
    web_push_device_count = await db.web_push_subscriptions.count_documents(
        {'user_id': user_id, 'active': True},
    )
    identity = await _sanitise(u)
    identity['phone_verified'] = phone_is_verified(u)
    from auth import email_is_verified
    identity['email_verified'] = email_is_verified(u)
    identity['email_verified_source'] = u.get('email_verified_source') or ('google' if u.get('method') == 'google' else 'email_code' if u.get('email_verified') else None)
    identity['login_methods'] = sorted(set((u.get('login_methods') or []) + [u.get('method') or 'email'] + (['password'] if u.get('password_hash') else [])) - {'email'})
    identity['web_push_device_count'] = web_push_device_count
    identity['web_push_status'] = web_push_status(u, web_push_device_count)
    identity['web_push_admin_pending'] = u.get('web_push_admin_pending') is True

    wallet = await db.wallets.find_one({'user_id': user_id}, {'_id': 0}) or {}
    kyc = await db.kyc.find_one({'user_id': user_id}, {'_id': 0})
    orders = await db.orders.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(50).to_list(50)
    payments = await db.payment_transactions.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(100).to_list(100)
    tickets = await db.tickets.find({'user_id': user_id}, {'_id': 0}).limit(200).to_list(200)
    scores = await db.game_scores.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(100).to_list(100)
    txs = await db.wallet_tx.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(100).to_list(100)
    if not txs:
        txs = await db.wallet_transactions.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(100).to_list(100)
    bonus_grants = await db.bonus_grants.find({'user_id': user_id}, {'_id': 0}).sort('granted_at', -1).limit(100).to_list(100)
    winnings_wallet = await db.winnings_wallets.find_one({'user_id': user_id}, {'_id': 0}) or {}
    withdrawals = await db.cashout_requests.find(
        {'user_id': user_id},
        {'_id': 0, 'withdrawal_id': 1, 'amount_tokens': 1, 'amount_gbp': 1, 'status': 1,
         'created_at': 1, 'paid_at': 1, 'kyc_status_snapshot': 1, 'admin_notes': 1,
         'reject_reason': 1, 'payment_reference': 1},
    ).sort('created_at', -1).limit(100).to_list(100)
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

    from services.offer_terms import referral_progress
    from services.reward_program import get_reward_settings
    reward_settings = await get_reward_settings(db)
    for ref in referrals:
        referred = outgoing_users.get(ref.get('referred_user_id'), {})
        ref['referred_name'] = referred.get('name')
        ref['referred_email'] = referred.get('email')
        ref['referred_public_id'] = referred.get('public_id')
        ref.update(referral_progress(ref, reward_settings))

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
        'offer_terms': u.get('signup_offer_terms'),
        'offer_version': u.get('signup_offer_version'),
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
    from services.promo_status import user_promotion_status
    promotion_status = await user_promotion_status(db, user_id)

    from services.bonus_grants import wallet_bonus_view
    from services.promo_status import user_promotion_status
    promotion_eligibility = await user_promotion_status(db, user_id)
    bonus_view = await wallet_bonus_view(db, user_id, wallet)
    wallet_balance = float(wallet.get('balance') or 0)
    bonus_tokens = float(wallet.get('bonus') or 0)
    winning_bonus_tokens = float(wallet.get('winning_bonus') or 0)
    winning_tokens = float(wallet.get('withdrawable') or 0)
    pending_withdrawable = float(wallet.get('withdrawable_pending') or 0)
    source_classified = wallet.get('source_migrated') is True
    topup_tokens = max(0.0, wallet_balance - bonus_tokens - winning_bonus_tokens
                       - winning_tokens - pending_withdrawable) if source_classified else None
    total_available_tokens = (topup_tokens + bonus_tokens + winning_bonus_tokens + winning_tokens
                              if source_classified else None)
    wallet_breakdown = {
        'balance_tokens': wallet_balance,
        'source_classified': source_classified,
        'total_tokens': round(total_available_tokens, 2) if source_classified else None,
        'topup_tokens': round(topup_tokens, 2) if source_classified else None,
        'purchased_tokens': round(topup_tokens, 2) if source_classified else None,
        'winning_tokens': round(winning_tokens, 2) if source_classified else None,
        'withdrawable_tokens': round(winning_tokens, 2) if source_classified else None,
        'winning_bonus_tokens': round(winning_bonus_tokens, 2) if source_classified else None,
        'bonus_tokens': round(bonus_tokens, 2) if source_classified else None,
        'available_to_cash_out': round(winning_tokens, 2) if source_classified else None,
        'pending_withdrawable_tokens': round(pending_withdrawable, 2),
        'winnings_pence': int(winnings_wallet.get('available_pence') or 0)
                          + int(winnings_wallet.get('pending_pence') or 0),
        'lifetime_winnings_pence': int(winnings_wallet.get('total_won_pence') or 0),
        **bonus_view,
    }
    for grant in bonus_grants:
        grant['spent_amount'] = round(max(0.0, float(grant.get('original_amount') or 0)
                                          - float(grant.get('remaining_amount') or 0)
                                          - float(grant.get('expired_amount') or 0)
                                          - float(grant.get('revoked_amount') or 0)), 2)

    sessions = await db.user_sessions.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(20).to_list(20)
    admin_actions = await db.audit_log.find(
        {'target_user_id': user_id}, {'_id': 0},
    ).sort('at', -1).limit(50).to_list(50)
    acquisition = await db.acquisition_attributions.find_one({'user_id': user_id}, {'_id': 0})
    page_visits = []
    if acquisition:
        journey_sessions = list(dict.fromkeys(
            value for value in (acquisition.get('session_id'), acquisition.get('registration_session_id')) if value
        ))
        if journey_sessions:
            page_visits = await db.acquisition_page_views.find(
                {'session_id': {'$in': journey_sessions}},
                {'_id': 0, 'page_path': 1, 'page_key': 1, 'created_at': 1, 'engaged_ms': 1,
                 'source_key': 1, 'campaign': 1},
            ).sort('created_at', -1).limit(100).to_list(100)
    influencer_attribution = await db.influencer_attributions.find_one({'user_id': user_id}, {
        '_id': 0, 'attribution_id': 1, 'promo_id': 1, 'influencer_id': 1, 'code': 1,
        'campaign_name': 1, 'influencer_name': 1, 'status': 1, 'created_at': 1,
        'topup_qualified': 1, 'reward_granted': 1, 'reward_tokens': 1,
    })

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

    challenge_attempts = await db.special_challenge_attempts.find(
        {'user_id': user_id}, {'_id': 0},
    ).sort('started_at', -1).limit(200).to_list(200)

    challenge_rewards = await db.special_challenge_rewards.find(
        {'user_id': user_id}, {'_id': 0},
    ).sort('created_at', -1).limit(200).to_list(200)

    challenge_cooldowns = await db.special_challenge_cooldowns.find(
        {'user_id': user_id}, {'_id': 0},
    ).sort('next_allowed_at', -1).limit(200).to_list(200)

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
        'identity': identity,
        'kyc': kyc,
        'wallet': wallet,
        'stats': {
            'orders_count': len(orders),
            'payments_count': len(payments),
            'tickets_count': len(tickets),
            'scores_count': len(scores),
            'wallet_txs_count': len(txs),
            'bonus_grants_count': len(bonus_grants),
            'withdrawals_count': len(withdrawals),
            'notifications_count': len(notifs),
            'support_cases_count': len(support),
            'referrals_count': len(referrals),
        },
        'orders': orders,
        'payments': payments,
        'tickets': tickets,
        'scores': scores,
        'wallet_transactions': txs,
        'wallet_breakdown': wallet_breakdown,
        'bonus_grants': bonus_grants,
        'withdrawals': withdrawals,
        'notifications': notifs,
        'support_cases': support,
        'referrals': referrals,
        'referral_joined_via': referred_by_referral,
        'referrer_user': referrer_user,
        'signup_bonus': signup_bonus,
        'promotion_status': promotion_status,
        'promotion_eligibility': promotion_eligibility,
        'sessions': sessions,
        'admin_actions': admin_actions,
        'acquisition': acquisition,
        'page_visits': page_visits,
        'influencer_attribution': influencer_attribution,
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
        'special_challenge': {
            'attempts': challenge_attempts,
            'rewards': challenge_rewards,
            'cooldowns': challenge_cooldowns,
            'stats': {
                'attempts_count': len(challenge_attempts),
                'rewards_count': len(challenge_rewards),
                'cooldowns_count': len(challenge_cooldowns),
                'total_rewards_pence': sum(int(r.get('reward_pence') or 0) for r in challenge_rewards),
                'total_tokens_spent': sum(int(r.get('entry_tokens') or 0) for r in challenge_attempts),
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


class AdminSmsConsentRequest(BaseModel):
    consent: bool


@router.post('/{user_id}/sms-consent')
async def admin_set_sms_consent(
    user_id: str,
    payload: AdminSmsConsentRequest,
    request: Request,
):
    """Admin grants or revokes a user's SMS marketing/alert consent.

    Granting records the consent timestamp and clears any prior opt-out so the
    user becomes eligible for Admin Alert SMS (still gated on a verified phone).
    Revoking sets consent to false. Every change is audited with the actor.
    """
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()

    user = await db.users.find_one(
        {'user_id': user_id},
        {'_id': 0, 'user_id': 1, 'phone_verified': 1, 'erased': 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    if user.get('erased'):
        raise HTTPException(
            status_code=400, detail='Cannot change an erased account',
        )

    now = datetime.now(timezone.utc)
    if payload.consent:
        updates = {
            'sms_consent': True,
            'sms_consent_at': now,
            'sms_consent_source': 'admin',
            'sms_opt_out': False,
        }
    else:
        updates = {
            'sms_consent': False,
            'sms_consent_at': now,
            'sms_consent_source': 'admin',
        }

    await db.users.update_one({'user_id': user_id}, {'$set': updates})

    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'admin_sms_consent_change',
        'admin_email': admin.get('email'),
        'admin_user_id': admin.get('user_id'),
        'target_user_id': user_id,
        'consent': bool(payload.consent),
        'at': now,
    })

    return {
        'ok': True,
        'sms_consent': bool(payload.consent),
        'phone_verified': bool(user.get('phone_verified')),
    }





# User 360 Email Marketing consent (admin, consent-evidence required)
class AdminEmailConsentRequest(BaseModel):
    consent: bool
    evidence: Optional[str] = None


@router.post('/{user_id}/email-consent')
async def admin_set_email_consent(user_id: str, payload: AdminEmailConsentRequest, request: Request):
    admin = await require_admin(request)
    if payload.consent and (not payload.evidence or len(payload.evidence.strip()) < 10):
        raise HTTPException(400, 'Record how and when the user agreed to marketing emails (at least 10 characters).')
    from deps import get_db
    db = get_db()
    user = await db.users.find_one({'user_id': user_id}, {'_id': 0, 'erased': 1, 'email': 1})
    if not user:
        raise HTTPException(404, 'User not found')
    if user.get('erased'):
        raise HTTPException(400, 'Cannot change an erased account')
    if payload.consent and not user.get('email'):
        raise HTTPException(400, 'User has no email address')
    now = datetime.now(timezone.utc)
    changes = {
        'marketing_email_consent': payload.consent,
        'email_marketing_opt_in': payload.consent,
        'marketing_email_consent_at': now,
        'marketing_email_consent_source': 'admin_verified_evidence' if payload.consent else 'admin_revoke',
    }
    if payload.consent:
        changes['marketing_email_unsubscribed'] = False
    else:
        changes['marketing_email_unsubscribed'] = True
        changes['marketing_email_unsubscribed_at'] = now
    await db.users.update_one({'user_id': user_id}, {'$set': changes})
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'admin_email_marketing_consent_change',
        'admin_email': admin.get('email'),
        'admin_user_id': admin.get('user_id'),
        'target_user_id': user_id,
        'consent': payload.consent,
        'evidence': payload.evidence.strip() if payload.consent else None,
        'at': now,
    })
    return {'ok': True, 'marketing_email_consent': payload.consent}


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
    await db.support_cases.update_many(
        {'user_id': user_id},
        {'$set': {
            'user_name': '[ERASED]',
            'username': None,
            'user_email': f'erased_{user_id}@prizeleague.deleted',
            'description': '[Removed as part of account erasure]',
            'ai_summary': '',
            'conversation_history': [],
            'messages': [{
                'author': 'system',
                'author_id': 'system',
                'body': 'Support conversation content removed due to account erasure.',
                'at': now,
            }],
            'internal_notes': [],
            'updated_at': now,
        }},
    )
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

from typing import List
from pydantic import Field


class AudienceSpec(BaseModel):
    mode: Literal['range', 'users', 'winners'] = 'range'
    # For mode='users': account IDs (public_id/user_id) or emails.
    identifiers: List[str] = Field(default_factory=list)
    # For mode='winners':
    winner_source: Optional[
        Literal['paid_contest', 'promotion_draw', 'free_world']
    ] = None
    winner_ref: Optional[str] = None  # contest_id / promotion_id / stage / 'all'


class AdminAlertCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=4000)
    alert_type: str = Field(default='custom', max_length=80)
    user_from: int = Field(default=1, ge=1)
    user_to: int = Field(default=1000, ge=1)
    channels: List[Literal['in_app', 'email', 'sms', 'web_push', 'native_push']] = Field(
        default_factory=lambda: ['in_app']
    )
    audience: Optional[AudienceSpec] = None


# User fields loaded for every recipient (shared projection).
_ALERT_USER_PROJECTION = {
    '_id': 0, 'user_id': 1, 'email': 1, 'phone': 1,
    'phone_verified': 1, 'sms_consent': 1, 'sms_opt_out': 1,
    'marketing_email_consent': 1, 'marketing_email_unsubscribed': 1,
    'created_at': 1,
    'public_id': 1, 'name': 1,
}


async def _resolve_identifier_users(db, identifiers: list):
    """Resolve a list of account IDs / emails to user docs.

    Returns (users_in_input_order, unknown_tokens). Deduplicated by user_id.
    """
    tokens = [str(t).strip() for t in (identifiers or []) if str(t).strip()]
    if not tokens:
        return [], []
    lowered = [t.lower() for t in tokens]
    query = {'$or': [
        {'public_id': {'$in': tokens}},
        {'user_id': {'$in': tokens}},
        {'email': {'$in': lowered}},
        {'username': {'$in': lowered}},
    ]}
    found = await db.users.find(
        {'$and': [{'erased': {'$ne': True}}, query]},
        _ALERT_USER_PROJECTION,
    ).to_list(5000)

    by_key = {}
    for u in found:
        for key in (u.get('public_id'), u.get('user_id'),
                    (u.get('email') or '').lower()):
            if key:
                by_key[key] = u

    ordered, seen, unknown = [], set(), []
    for raw, low in zip(tokens, lowered):
        u = by_key.get(raw) or by_key.get(low)
        if u and u['user_id'] not in seen:
            seen.add(u['user_id'])
            ordered.append(u)
        elif not u:
            unknown.append(raw)
    return ordered, unknown


async def _resolve_winner_user_ids(db, source: str, ref: Optional[str]):
    """Return an ordered list of winner user_ids for a winner source."""
    uids: list = []
    if source == 'paid_contest':
        q = {'winner_user_id': {'$exists': True, '$ne': None}}
        if ref and ref != 'all':
            q['contest_id'] = ref
        async for c in db.contests.find(q, {'_id': 0, 'winner_user_id': 1}):
            if c.get('winner_user_id'):
                uids.append(c['winner_user_id'])
    elif source == 'promotion_draw':
        q = {} if (not ref or ref == 'all') else {'promotion_id': ref}
        async for d in db.promotion_draws.find(q, {'_id': 0, 'winners': 1}):
            for w in (d.get('winners') or []):
                if w.get('user_id'):
                    uids.append(w['user_id'])
    elif source == 'free_world':
        q = {'status': 'paid'}
        if ref and ref != 'all':
            try:
                q['champion_stage'] = int(ref)
            except (TypeError, ValueError):
                q['champion_stage'] = ref
        async for a in db.world_winner_awards.find(
            q, {'_id': 0, 'user_id': 1}
        ):
            if a.get('user_id'):
                uids.append(a['user_id'])
    # Dedup preserving order
    seen, out = set(), []
    for u in uids:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


async def _users_by_ids(db, user_ids: list):
    """Fetch recipient docs for a list of user_ids, preserving order."""
    if not user_ids:
        return []
    docs = await db.users.find(
        {'user_id': {'$in': user_ids}, 'erased': {'$ne': True}},
        _ALERT_USER_PROJECTION,
    ).to_list(len(user_ids))
    by_id = {d['user_id']: d for d in docs}
    return [by_id[u] for u in user_ids if u in by_id]


@router.get('/alerts/user-search')
async def alert_user_search(request: Request, q: str = '', limit: int = 20):
    """Search users by name, email, username or account ID for targeting."""
    await require_admin(request)
    from deps import get_db
    db = get_db()
    term = (q or '').strip()
    if len(term) < 2:
        return {'users': []}
    limit = max(1, min(int(limit), 50))
    import re as _re
    rx = _re.compile(_re.escape(term), _re.I)
    rows = await db.users.find(
        {'erased': {'$ne': True}, '$or': [
            {'name': rx}, {'email': rx}, {'username': rx},
            {'public_id': rx}, {'user_id': rx},
        ]},
        {'_id': 0, 'user_id': 1, 'public_id': 1, 'name': 1,
         'email': 1, 'phone_verified': 1, 'sms_consent': 1},
    ).limit(limit).to_list(limit)
    return {'users': rows}


@router.get('/alerts/winner-sources')
async def alert_winner_sources(request: Request):
    """List available winner sources and their selectable references."""
    await require_admin(request)
    from deps import get_db
    db = get_db()

    paid = []
    async for c in db.contests.find(
        {'winner_user_id': {'$exists': True, '$ne': None}},
        {'_id': 0, 'contest_id': 1, 'title': 1, 'name': 1},
    ).limit(200):
        paid.append({
            'ref': c.get('contest_id'),
            'label': c.get('title') or c.get('name') or c.get('contest_id'),
        })

    promos = []
    async for d in db.promotion_draws.find(
        {}, {'_id': 0, 'promotion_id': 1, 'promotion_name': 1, 'winners': 1},
    ).limit(200):
        promos.append({
            'ref': d.get('promotion_id'),
            'label': d.get('promotion_name') or d.get('promotion_id'),
            'count': len(d.get('winners') or []),
        })

    stages = await db.world_winner_awards.distinct(
        'champion_stage', {'status': 'paid'}
    )
    fw = [{'ref': 'all', 'label': 'All Free World Champions'}]
    for s in sorted(x for x in stages if x is not None):
        fw.append({'ref': str(s), 'label': f'Championship {s} Champions'})

    return {
        'sources': {
            'paid_contest': paid,
            'promotion_draw': promos,
            'free_world': fw,
        }
    }


@router.get('/alerts/winners')
async def alert_winners(request: Request, source: str, ref: str = 'all'):
    """Resolve the winner recipients for a chosen source/reference."""
    await require_admin(request)
    from deps import get_db
    db = get_db()
    uids = await _resolve_winner_user_ids(db, source, ref)
    users = await _users_by_ids(db, uids)
    return {
        'count': len(users),
        'users': [
            {'user_id': u['user_id'], 'public_id': u.get('public_id'),
             'name': u.get('name'), 'email': u.get('email')}
            for u in users
        ],
    }


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


def _campaign_email_configured() -> bool:
    """Marketing campaigns require their own SendGrid credentials and sender."""
    return bool(
        os.environ.get('SENDGRID_API_KEY')
        and (os.environ.get('SENDGRID_FROM_EMAIL') or os.environ.get('FROM_EMAIL'))
    )


def _send_sendgrid_campaign_email(
    to_email: str,
    title: str,
    message: str,
    unsubscribe_url: str,
):
    """Submit to SendGrid; HTTP 202 means accepted, not delivered."""
    import json
    from urllib.request import Request as UrlRequest, urlopen
    from urllib.error import HTTPError
    from html import escape

    sender = os.environ.get('SENDGRID_FROM_EMAIL') or os.environ.get('FROM_EMAIL')
    import re
    text_body = message + "\n\nUnsubscribe from marketing emails: " + unsubscribe_url
    # Pull the first link out of the message and render it as a button instead of a raw URL.
    url_match = re.search(r'https?://[^\s<>"]+', message)
    cta_url = url_match.group(0).rstrip('.,);') if url_match else None
    body_text = re.sub(r'https?://[^\s<>"]+', '', message).strip()
    body_text = re.sub(r'\n{3,}', '\n\n', body_text)
    safe_body = escape(body_text).replace('\n', '<br>')
    cta_html = (
        '<div style="padding:26px 0 8px;"><a href="' + escape(cta_url, quote=True) +
        '" style="display:inline-block;background:#6c2bff;color:#ffffff;text-decoration:none;'
        'font-size:16px;font-weight:700;padding:14px 28px;border-radius:8px;">View competition</a></div>'
    ) if cta_url else ''
    html_body = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        '<body style="margin:0;padding:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#17202b;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f7;padding:28px 12px;">'
        '<tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" '
        'style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4e8ed;border-radius:14px;overflow:hidden;">'
        '<tr><td style="padding:22px 28px;background:#101827;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:1px;">PRIZE LEAGUE</td></tr>'
        '<tr><td style="padding:32px 28px 18px;">'
        '<h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:#101827;">' + escape(title) + '</h1>'
        '<div style="font-size:16px;line-height:1.7;color:#475569;">' + safe_body + '</div>'
        + cta_html +
        '</td></tr>'
        '<tr><td style="padding:18px 28px 24px;border-top:1px solid #edf0f3;font-size:12px;line-height:1.6;color:#7b8794;">'
        'You are receiving this because you opted in to Prize League marketing emails. '
        '<a href="' + escape(unsubscribe_url, quote=True) + '" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>'
        '</td></tr></table></td></tr></table></body></html>'
    )
    data = json.dumps({
        'personalizations': [{'to': [{'email': to_email}]}],
        'from': {'email': sender, 'name': 'Prize League'},
        'subject': title,
        'headers': {'List-Unsubscribe': f'<{unsubscribe_url}>'},
        'content': [
            {'type': 'text/plain', 'value': text_body},
            {'type': 'text/html', 'value': html_body},
        ],
        'mail_settings': {'sandbox_mode': {'enable': False}},
    }).encode('utf-8')
    req = UrlRequest(
        'https://api.sendgrid.com/v3/mail/send',
        data=data,
        headers={
            'Authorization': 'Bearer ' + os.environ['SENDGRID_API_KEY'],
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urlopen(req, timeout=20) as response:
            return response.status, response.headers.get('X-Message-Id')
    except HTTPError as exc:
        # Do not log recipient addresses or credentials.
        raise RuntimeError('SendGrid rejected request (HTTP %s)' % exc.code) from exc


async def _send_campaign_email(campaign_id: str, title: str, message: str, sends: list) -> None:
    """Send opted-in campaign email; persist provider acceptance, not delivery."""
    import asyncio
    from deps import get_db
    db = get_db()
    if not _campaign_email_configured():
        await db.alert_deliveries.update_many(
            {'campaign_id': campaign_id, 'channel': 'email', 'status': 'pending'},
            {'$set': {'status': 'skipped', 'reason': 'email_not_configured',
                      'updated_at': datetime.now(timezone.utc)}},
        )
        await _recount_campaign(db, campaign_id)
        return

    public_site_url = (
        os.environ.get('PUBLIC_SITE_URL') or 'https://prizeleague.co.uk'
    ).rstrip('/')

    for item in sends:
        delivery_id = item['delivery_id']
        claimed = await db.alert_deliveries.find_one_and_update(
            {'delivery_id': delivery_id, 'status': 'pending'},
            {'$set': {'status': 'sending', 'updated_at': datetime.now(timezone.utc)}},
        )
        if not claimed:
            continue
        try:
            unsubscribe_url = (
                f"{public_site_url}/api/marketing/unsubscribe/"
                f"{item['unsubscribe_token']}"
            )
            status_code, provider_id = await asyncio.to_thread(
                _send_sendgrid_campaign_email,
                item['email'], title, message, unsubscribe_url,
            )
            await db.alert_deliveries.update_one(
                {'delivery_id': delivery_id},
                {'$set': {
                    'status': 'accepted' if status_code == 202 else 'failed',
                    'provider_status': 'accepted' if status_code == 202 else 'unexpected_response',
                    'provider_message_id': provider_id,
                    'reason': None if status_code == 202 else 'provider_unexpected_response',
                    'updated_at': datetime.now(timezone.utc),
                }},
            )
        except Exception as exc:
            logger.warning('Campaign %s email send failed: %s', campaign_id, exc)
            await db.alert_deliveries.update_one(
                {'delivery_id': delivery_id},
                {'$set': {'status': 'failed', 'reason': 'email_send_error',
                          'updated_at': datetime.now(timezone.utc)}},
            )
    await _recount_campaign(db, campaign_id)


async def _send_campaign_web_push(campaign_id: str, title: str, message: str, sends: list, marketing: bool) -> None:
    """Deliver Web Push per user; consent, permission and subscription are enforced by send_web_push_to_user."""
    from deps import get_db
    from services.push_delivery import send_web_push_to_user
    db = get_db()
    for item in sends:
        claimed = await db.alert_deliveries.find_one_and_update(
            {'delivery_id': item['delivery_id'], 'status': 'pending'},
            {'$set': {'status': 'sending', 'updated_at': datetime.now(timezone.utc)}},
        )
        if not claimed:
            continue
        try:
            result = await send_web_push_to_user(
                db, item['user_id'],
                {'event_id': item['delivery_id'], 'title': title, 'body': message, 'url': '/my-account/notifications'},
                marketing=marketing,
            )
            status, reason = result['status'], result.get('reason') or None
        except Exception as exc:  # noqa: BLE001 - one bad device must not stop the campaign
            logging.getLogger(__name__).warning('Campaign %s Web Push error: %s', campaign_id, type(exc).__name__)
            status, reason = 'failed', 'send_error'
        await db.alert_deliveries.update_one(
            {'delivery_id': item['delivery_id']},
            {'$set': {'status': status, 'reason': reason, 'updated_at': datetime.now(timezone.utc)}},
        )
    await _recount_campaign(db, campaign_id)


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

    In-app notifications are created immediately. Email is submitted to SendGrid
    only for opted-in users; accepted is not the same as delivered. SMS uses
    the separately configured Twilio Messaging Service.
    """
    admin = await require_admin(request)

    from deps import get_db
    db = get_db()

    audience = payload.audience or AudienceSpec()
    unknown_identifiers: list = []
    audience_meta: dict = {'mode': audience.mode}

    if audience.mode == 'range':
        if payload.user_to < payload.user_from:
            raise HTTPException(
                status_code=400,
                detail='user_to must be greater than or equal to user_from',
            )
        target_count = payload.user_to - payload.user_from + 1
        if target_count > 10000:
            raise HTTPException(
                status_code=400,
                detail='A single campaign can target at most 10,000 users',
            )
        # Stable audience order. created_at is preferred; user_id breaks ties.
        users = await db.users.find(
            {'erased': {'$ne': True}},
            _ALERT_USER_PROJECTION,
        ).sort([('created_at', 1), ('user_id', 1)]).skip(
            payload.user_from - 1
        ).limit(target_count).to_list(target_count)
        camp_from, camp_to = payload.user_from, payload.user_to

    elif audience.mode == 'users':
        users, unknown_identifiers = await _resolve_identifier_users(
            db, audience.identifiers
        )
        if not users:
            raise HTTPException(
                status_code=400,
                detail='No matching users found for the provided identifiers.',
            )
        if len(users) > 10000:
            raise HTTPException(
                status_code=400,
                detail='A single campaign can target at most 10,000 users',
            )
        camp_from, camp_to = 0, 0
        audience_meta['unknown_identifiers'] = unknown_identifiers

    else:  # winners
        if not audience.winner_source:
            raise HTTPException(
                status_code=400, detail='winner_source is required.'
            )
        uids = await _resolve_winner_user_ids(
            db, audience.winner_source, audience.winner_ref or 'all'
        )
        users = await _users_by_ids(db, uids)
        if not users:
            raise HTTPException(
                status_code=400,
                detail='No winners found for the selected source.',
            )
        if len(users) > 10000:
            raise HTTPException(
                status_code=400,
                detail='A single campaign can target at most 10,000 users',
            )
        camp_from, camp_to = 0, 0
        audience_meta['winner_source'] = audience.winner_source
        audience_meta['winner_ref'] = audience.winner_ref or 'all'

    target_count = len(users)

    now = datetime.now(timezone.utc)
    campaign_id = f'alt_{uuid.uuid4().hex[:16]}'

    # Whether the Twilio Messaging Service is configured for real SMS sends.
    _mclient, _ = _twilio_messaging()
    sms_configured = _mclient is not None

    campaign = {
        'campaign_id': campaign_id,
        'title': payload.title.strip(),
        'message': payload.message.strip(),
        'alert_type': payload.alert_type.strip() or 'custom',
        'user_from': camp_from,
        'user_to': camp_to,
        'audience': audience_meta,
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
    pending_email = []
    pending_push = []

    for position, user in enumerate(users, start=(camp_from or 1)):
        user_id = user.get('user_id')
        if not user_id:
            continue

        for channel in campaign['channels']:
            delivery_id = f'ald_{uuid.uuid4().hex[:18]}'
            unsubscribe_token = None

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
                if not user.get('email'):
                    status, reason = 'skipped', 'no_email'
                elif user.get('marketing_email_unsubscribed') is True:
                    status, reason = 'skipped', 'email_unsubscribed'
                elif user.get('marketing_email_consent') is not True:
                    status, reason = 'skipped', 'no_email_consent'
                elif not _campaign_email_configured():
                    status, reason = 'skipped', 'email_not_configured'
                else:
                    status, reason = 'pending', None
                    unsubscribe_token = uuid.uuid4().hex + uuid.uuid4().hex
                    pending_email.append({
                        'delivery_id': delivery_id,
                        'user_id': user_id,
                        'email': user['email'],
                        'unsubscribe_token': unsubscribe_token,
                    })
            elif channel == 'web_push':
                status, reason = 'pending', None
                pending_push.append({'delivery_id': delivery_id, 'user_id': user_id})
            elif channel == 'native_push':
                status, reason = 'skipped', 'native_push_not_configured'
            else:  # sms
                has_verified_phone = bool(
                    user.get('phone') and user.get('phone_verified')
                )
                has_consent = user.get('sms_consent') is True
                opted_out = user.get('sms_opt_out') is True
                if not has_verified_phone:
                    status = 'skipped'
                    reason = 'no_verified_phone'
                elif opted_out:
                    # Respect Twilio STOP / self-service opt-outs.
                    status = 'skipped'
                    reason = 'sms_opted_out'
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

            delivery = {
                'delivery_id': delivery_id,
                'campaign_id': campaign_id,
                'user_id': user_id,
                'user_position': position,
                'channel': channel,
                'status': status,
                'reason': reason,
                'created_at': now,
                'updated_at': now,
            }
            if unsubscribe_token:
                delivery['unsubscribe_token'] = unsubscribe_token
            delivery_docs.append(delivery)

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

    if pending_email:
        background_tasks.add_task(
            _send_campaign_email,
            campaign_id,
            campaign['title'],
            campaign['message'],
            pending_email,
        )

    if pending_push:
        background_tasks.add_task(
            _send_campaign_web_push,
            campaign_id,
            campaign['title'],
            campaign['message'],
            pending_push,
            campaign['alert_type'] in ('promotion', 'newsletter'),
        )

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
        'email_configured': _campaign_email_configured(),
        'email_queued': len(pending_email),
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
        if channel not in ('in_app', 'email', 'sms', 'web_push', 'native_push'):
            raise HTTPException(status_code=400, detail='Invalid channel')
        q['channel'] = channel

    skip = max(0, int(skip))
    limit = max(1, min(int(limit), 500))

    total = await db.alert_deliveries.count_documents(q)
    docs = await db.alert_deliveries.find(
        q,
        {'_id': 0, 'unsubscribe_token': 0},
    ).sort([('user_position', 1), ('channel', 1)]).skip(
        skip
    ).limit(limit).to_list(limit)

    return {
        'deliveries': docs,
        'total': total,
        'skip': skip,
        'limit': limit,
    }
