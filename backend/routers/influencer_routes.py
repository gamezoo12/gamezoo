"""Restricted influencer management and privacy-safe partner reporting."""
from __future__ import annotations

import csv
import hmac
import hashlib
import io
import os
import secrets
import uuid
from datetime import datetime, timezone
from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from auth import JWT_SECRET, get_current_user, require_admin
from deps import get_db

admin_router = APIRouter(prefix='/api/admin/influencers', tags=['admin-influencers'])
partner_router = APIRouter(prefix='/api/influencer', tags=['influencer-dashboard'])
public_router = APIRouter(prefix='/api/influencer', tags=['influencer-attribution'])


async def _require_campaign_admin(request: Request) -> dict:
    user = await require_admin(request)
    if user.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Admin or super admin only')
    return user


async def _require_partner(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get('role') != 'influencer':
        raise HTTPException(status_code=403, detail='Influencer access only')
    db = get_db()
    profile = await db.influencers.find_one(
        {'user_id': user['user_id'], 'status': 'active'}, {'_id': 0})
    if not profile:
        raise HTTPException(status_code=403, detail='Influencer account is inactive')
    return profile


class InfluencerAssign(BaseModel):
    user_id: Optional[str] = Field(default=None, min_length=3, max_length=128)
    email: Optional[str] = Field(default=None, min_length=5, max_length=254)
    display_name: str = Field(..., min_length=1, max_length=120)


class InfluencerInviteRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    display_name: str = Field(..., min_length=1, max_length=120)


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    status: Optional[Literal['active', 'paused', 'deactivated']] = None


class CommissionReview(BaseModel):
    decision: Literal['approved', 'rejected']
    reason: str = Field(..., min_length=10, max_length=500)


class ExternalPayment(BaseModel):
    payment_method: Literal['bank_transfer', 'manual', 'other']
    payment_reference: str = Field(..., min_length=4, max_length=120)
    paid_at: datetime
    confirmed_external_payment: bool
    note: str = Field(..., min_length=10, max_length=500)


class AffiliateVisit(BaseModel):
    code: str = Field(..., min_length=2, max_length=32)
    visitor_id: Optional[str] = Field(default=None, min_length=8, max_length=80)
    page_key: str = Field(default='landing', max_length=64)


def _money(pence: int) -> str:
    return f'£{int(pence or 0) / 100:.2f}'


def _safe_ref(user_id: str) -> str:
    return hashlib.sha256(user_id.encode('utf-8')).hexdigest()[:12]


def _affiliate_visitor_key(request: Request) -> str | None:
    client = request.client
    address = client.host if client else ''
    if not address:
        return None
    secret = os.getenv('INFLUENCER_VISITOR_HMAC_SECRET') or JWT_SECRET
    material = f"{address}\0{request.headers.get('user-agent', '')[:300]}".encode('utf-8')
    return hmac.new(secret.encode('utf-8'), material, hashlib.sha256).hexdigest()


@admin_router.get('')
async def list_influencers(request: Request, q: str = '', status: str = 'all', limit: int = 100):
    await _require_campaign_admin(request)
    db = get_db()
    limit = max(1, min(int(limit), 250))
    query = {}
    if status in ('active', 'paused', 'deactivated'):
        query['status'] = status
    profiles = await db.influencers.find(query, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    user_ids = [p['user_id'] for p in profiles]
    users = await db.users.find({'user_id': {'$in': user_ids}},
                                {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1, 'phone': 1}).to_list(limit)
    user_map = {u['user_id']: u for u in users}
    for profile in profiles:
        profile['user'] = user_map.get(profile['user_id'], {})
        if q and q.lower() not in (profile.get('display_name', '') + ' ' +
                                   profile['user'].get('name', '') + ' ' +
                                   profile['user'].get('email', '')).lower():
            profile['_omit'] = True
    profiles = [p for p in profiles if not p.pop('_omit', False)]
    influencer_ids = [p['influencer_id'] for p in profiles]
    if influencer_ids:
        attribution_stats = await db.influencer_attributions.aggregate([
            {'$match': {'influencer_id': {'$in': influencer_ids}}},
            {'$group': {'_id': '$influencer_id', 'registrations': {'$sum': 1}}},
        ]).to_list(len(influencer_ids))
        visit_stats = await db.influencer_visits.aggregate([
            {'$match': {'influencer_id': {'$in': influencer_ids}}},
            {'$group': {'_id': {'influencer_id': '$influencer_id', 'visitor_id': '$visitor_id'}, 'visits': {'$sum': 1}}},
            {'$group': {'_id': '$_id.influencer_id', 'visits': {'$sum': '$visits'}, 'unique_visitors': {'$sum': 1}}},
        ]).to_list(len(influencer_ids))
        topup_stats = await db.influencer_topup_events.aggregate([
            {'$match': {'influencer_id': {'$in': influencer_ids}}},
            {'$group': {'_id': '$influencer_id',
                        'topup_users': {'$addToSet': '$referral_ref'},
                        'qualifying_topups': {'$sum': {'$cond': ['$qualifies', 1, 0]}},
                        'qualifying_value_pence': {'$sum': {'$cond': ['$qualifies', '$amount_pence', 0]}}}},
        ]).to_list(len(influencer_ids))
        commission_stats = await db.influencer_commissions.aggregate([
            {'$match': {'influencer_id': {'$in': influencer_ids}}},
            {'$group': {'_id': '$influencer_id',
                        'commission_pence': {'$sum': {'$cond': [{'$in': ['$status', ['pending', 'approved', 'paid']]}, '$amount_pence', 0]}},
                        'pending_pence': {'$sum': {'$cond': [{'$eq': ['$status', 'pending']}, '$amount_pence', 0]}},
                        'approved_pence': {'$sum': {'$cond': [{'$eq': ['$status', 'approved']}, '$amount_pence', 0]}}}},
        ]).to_list(len(influencer_ids))
        stats_by_id = {p['influencer_id']: {'registrations': 0, 'visits': 0, 'unique_visitors': 0,
                                            'topup_users': 0, 'qualifying_topups': 0,
                                            'qualifying_value': _money(0), 'commission': _money(0),
                                            'pending_commission': _money(0), 'approved_commission': _money(0)}
                       for p in profiles}
        for group in attribution_stats:
            stats_by_id[group['_id']]['registrations'] = group['registrations']
        for group in visit_stats:
            stats_by_id[group['_id']].update(visits=group['visits'], unique_visitors=group['unique_visitors'])
        for group in topup_stats:
            stats_by_id[group['_id']].update(
                topup_users=len([value for value in group.get('topup_users', []) if value]),
                qualifying_topups=group['qualifying_topups'],
                qualifying_value=_money(group['qualifying_value_pence']),
            )
        for group in commission_stats:
            stats_by_id[group['_id']].update(
                commission=_money(group['commission_pence']),
                pending_commission=_money(group['pending_pence']),
                approved_commission=_money(group['approved_pence']),
            )
        for profile in profiles:
            profile['stats'] = stats_by_id[profile['influencer_id']]
    return {'influencers': profiles}


@admin_router.post('')
async def assign_influencer(payload: InfluencerAssign, request: Request):
    admin = await _require_campaign_admin(request)
    db = get_db()
    if not payload.user_id and not payload.email:
        raise HTTPException(status_code=400, detail='Provide an existing user ID or email address')
    email = (payload.email or '').strip().lower()
    if payload.email and ('@' not in email or email.startswith('@') or email.endswith('@')):
        raise HTTPException(status_code=400, detail='Enter a valid existing user email address')
    user_query = {'user_id': payload.user_id} if payload.user_id else {'email': email}
    user = await db.users.find_one(user_query, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    user_id = user['user_id']
    if user.get('role') not in ('user', 'influencer'):
        raise HTTPException(status_code=409, detail='Staff accounts cannot be assigned as influencers')
    existing = await db.influencers.find_one({'user_id': user_id}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=409, detail='User already has an influencer profile')
    now = datetime.now(timezone.utc)
    profile = {
        'influencer_id': f'inf_{uuid.uuid4().hex}', 'user_id': user_id,
        'display_name': payload.display_name.strip(), 'status': 'active',
        'created_by': admin.get('user_id'), 'created_by_email': admin.get('email'),
        'created_at': now, 'updated_at': now,
    }
    await db.influencers.insert_one(profile)
    role_update = await db.users.update_one(
        {'user_id': user_id, 'role': user.get('role')},
        {'$set': {'role': 'influencer', 'influencer_id': profile['influencer_id']}},
    )
    if not role_update.modified_count:
        await db.influencers.delete_one({'influencer_id': profile['influencer_id']})
        raise HTTPException(status_code=409, detail='User role changed while assigning influencer access')
    from services.analytics_events import record_staff_role_transition
    await record_staff_role_transition(db, user_id, user.get('role') or 'user', 'influencer', now)
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': 'influencer_assigned',
        'admin_user_id': admin.get('user_id'), 'admin_email': admin.get('email'),
        'target_user_id': user_id, 'influencer_id': profile['influencer_id'], 'at': now,
    })
    profile.pop('_id', None)
    return profile


@admin_router.post('/invites')
async def create_influencer_invite(payload: InfluencerInviteRequest, request: Request):
    admin = await _require_campaign_admin(request)
    db = get_db()
    email = payload.email.strip().lower()
    if '@' not in email or email.startswith('@') or email.endswith('@'):
        raise HTTPException(status_code=400, detail='Enter a valid email address')
    if await db.users.find_one({'email': email}, {'_id': 1}):
        raise HTTPException(status_code=409, detail='An account already uses this email. Assign its influencer role instead.')
    now = datetime.now(timezone.utc)
    await db.influencer_invites.update_many(
        {'email': email, 'used': False, 'expires_at': {'$lte': now}},
        {'$set': {'used': True, 'status': 'expired'}},
    )
    existing = await db.influencer_invites.find_one(
        {'email': email, 'used': False, 'expires_at': {'$gt': now}}, {'_id': 1})
    if existing:
        raise HTTPException(status_code=409, detail='An active invitation already exists for this email')
    token = secrets.token_urlsafe(32)
    influencer_id = f'inf_{uuid.uuid4().hex}'
    invite = {
        'invite_id': f'ii_{uuid.uuid4().hex}',
        'token_hash': hashlib.sha256(token.encode('utf-8')).hexdigest(),
        'email': email, 'display_name': payload.display_name.strip(),
        'influencer_id': influencer_id, 'created_by': admin.get('user_id'),
        'created_by_email': admin.get('email'), 'created_at': now,
        'expires_at': now + timedelta(days=7), 'used': False,
    }
    try:
        await db.influencer_invites.insert_one(invite)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail='An active invitation already exists for this email') from exc
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': 'influencer_invite_created',
        'admin_user_id': admin.get('user_id'), 'admin_email': admin.get('email'),
        'target_email': email, 'influencer_id': influencer_id, 'invite_id': invite['invite_id'],
        'at': now,
    })
    site = os.getenv('PUBLIC_SITE_URL', 'https://prizeleague.co.uk').rstrip('/')
    return {'email': email, 'expires_at': invite['expires_at'],
            'signup_url': f'{site}/login?tab=signup&invite={token}'}


async def claim_influencer_invite(db, *, token: str, email: str, user_id: str) -> dict:
    if not token or len(token) > 128:
        raise HTTPException(status_code=400, detail='Influencer invitation is invalid or expired')
    now = datetime.now(timezone.utc)
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
    invite = await db.influencer_invites.find_one_and_update(
        {'token_hash': token_hash, 'email': email.strip().lower(), 'used': False,
         'expires_at': {'$gt': now},
         '$or': [{'claim_expires_at': {'$exists': False}}, {'claim_expires_at': {'$lte': now}}]},
        {'$set': {'claimed_by_user_id': user_id, 'claimed_at': now,
              'claim_expires_at': now + timedelta(minutes=15)}},
        return_document=True, projection={'_id': 0},
    )
    if not invite:
        raise HTTPException(status_code=400, detail='Influencer invitation is invalid, expired, or already being used')
    return invite


async def complete_influencer_invite(db, *, invite: dict, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    user = await db.users.find_one({'user_id': user_id}, {'_id': 0, 'email': 1, 'role': 1, 'influencer_id': 1})
    if not user or user.get('email', '').strip().lower() != invite['email']:
        raise HTTPException(status_code=409, detail='Invitation account email does not match')
    if user.get('role') not in ('user', 'influencer') or user.get('influencer_id') not in (None, invite['influencer_id']):
        raise HTTPException(status_code=409, detail='Account role changed while completing invitation')
    profile = {
        'influencer_id': invite['influencer_id'], 'user_id': user_id,
        'display_name': invite['display_name'], 'status': 'active',
        'created_by': invite.get('created_by'), 'created_by_email': invite.get('created_by_email'),
        'created_at': now, 'updated_at': now,
    }
    await db.influencers.update_one({'influencer_id': invite['influencer_id']}, {'$setOnInsert': profile}, upsert=True)
    await db.users.update_one({'user_id': user_id, 'role': {'$in': ['user', 'influencer']}},
                              {'$set': {'role': 'influencer', 'influencer_id': invite['influencer_id']}})
    from services.analytics_events import record_staff_role_transition
    await record_staff_role_transition(
        db, user_id, 'user', 'influencer', invite.get('claimed_at') or now,
        transition_id=f"influencer-invite:{invite['invite_id']}",
    )
    await db.influencer_invites.update_one(
        {'invite_id': invite['invite_id'], 'claimed_by_user_id': user_id, 'used': False},
        {'$set': {'used': True, 'used_at': now, 'user_id': user_id}, '$unset': {'claim_expires_at': ''}},
    )
    await db.audit_log.update_one(
        {'_id': f'influencer_invite_completed:{invite["invite_id"]}'},
        {'$setOnInsert': {
            '_id': f'influencer_invite_completed:{invite["invite_id"]}',
            'audit_id': f'aud_{hashlib.sha256(invite["invite_id"].encode()).hexdigest()[:12]}',
            'kind': 'influencer_invite_completed', 'target_user_id': user_id,
            'target_email': invite['email'], 'influencer_id': invite['influencer_id'],
            'invite_id': invite['invite_id'], 'at': now,
        }}, upsert=True,
    )
    return profile


async def recover_claimed_influencer_invites(db, limit: int = 100) -> int:
    now = datetime.now(timezone.utc)
    recovered = 0
    async for invite in db.influencer_invites.find(
        {'used': False, 'claimed_by_user_id': {'$exists': True}}, {'_id': 0}).limit(limit):
        user = await db.users.find_one({'user_id': invite['claimed_by_user_id']}, {'_id': 0, 'email': 1})
        if user and user.get('email', '').strip().lower() == invite.get('email'):
            await complete_influencer_invite(db, invite=invite, user_id=invite['claimed_by_user_id'])
            recovered += 1
        elif invite.get('claim_expires_at') and invite['claim_expires_at'] <= now:
            await db.influencer_invites.update_one(
                {'invite_id': invite['invite_id'], 'used': False, 'claim_expires_at': invite['claim_expires_at']},
                {'$unset': {'claimed_by_user_id': '', 'claimed_at': '', 'claim_expires_at': ''}},
            )
    return recovered


@admin_router.patch('/{influencer_id}')
async def update_influencer(influencer_id: str, payload: ProfileUpdate, request: Request):
    admin = await _require_campaign_admin(request)
    db = get_db()
    current = await db.influencers.find_one({'influencer_id': influencer_id}, {'_id': 0})
    if not current:
        raise HTTPException(status_code=404, detail='Influencer not found')
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return current
    if updates.get('display_name') is not None:
        updates['display_name'] = updates['display_name'].strip()
    updates['updated_at'] = datetime.now(timezone.utc)
    await db.influencers.update_one({'influencer_id': influencer_id}, {'$set': updates})
    if updates.get('status') in ('deactivated', 'paused'):
        await db.influencer_promos.update_many({'influencer_id': influencer_id}, {'$set': {'active': False}})
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': 'influencer_updated',
        'admin_user_id': admin.get('user_id'), 'admin_email': admin.get('email'),
        'target_user_id': current['user_id'], 'influencer_id': influencer_id,
        'changes': updates, 'at': datetime.now(timezone.utc),
    })
    return await db.influencers.find_one({'influencer_id': influencer_id}, {'_id': 0})


@admin_router.get('/{influencer_id}/commissions')
async def admin_commissions(influencer_id: str, request: Request, status: str = 'all', limit: int = 100):
    await _require_campaign_admin(request)
    db = get_db()
    if not await db.influencers.find_one({'influencer_id': influencer_id}, {'_id': 1}):
        raise HTTPException(status_code=404, detail='Influencer not found')
    query = {'influencer_id': influencer_id}
    if status in ('pending', 'on_hold', 'approved', 'payment_processing', 'rejected', 'reversed', 'paid'):
        query['status'] = status
    limit = max(1, min(int(limit), 500))
    rows = await db.influencer_commissions.find(query, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    return {'commissions': rows}


@admin_router.get('/commissions.csv')
async def admin_commissions_csv(request: Request, influencer_id: str = '', status: str = 'all'):
    await _require_campaign_admin(request)
    db = get_db()
    query = {}
    if influencer_id:
        query['influencer_id'] = influencer_id
    if status in ('pending', 'on_hold', 'approved', 'payment_processing', 'rejected', 'reversed', 'paid'):
        query['status'] = status
    rows = await db.influencer_commissions.find(query, {'_id': 0}).sort('created_at', -1).limit(10000).to_list(10000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Date', 'Influencer ID', 'Promo ID', 'Event', 'Qualifying top-up pence',
                     'Commission pence', 'Commission tokens', 'Status', 'Payment reference'])
    for row in rows:
        writer.writerow([row.get('created_at'), row.get('influencer_id'), row.get('promo_id'),
                         row.get('event_kind'), row.get('qualifying_amount_pence'), row.get('amount_pence'),
                         row.get('amount_tokens'), row.get('status'), row.get('payment_reference')])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type='text/csv',
                             headers={'Content-Disposition': 'attachment; filename="influencer-commissions.csv"'})


@admin_router.get('/campaigns.csv')
async def admin_campaigns_csv(request: Request, influencer_id: str = '', active: Optional[bool] = None):
    await _require_campaign_admin(request)
    db = get_db()
    query = {}
    if influencer_id:
        query['influencer_id'] = influencer_id
    if active is not None:
        query['active'] = active
    rows = await db.influencer_promos.find(query, {'_id': 0}).sort('created_at', -1).limit(10000).to_list(10000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Promo code', 'Campaign', 'Influencer ID', 'Active', 'Starts at', 'Ends at',
                     'Reward type', 'Registration commission pence', 'Registration commission tokens', 'Registration eligibility',
                     'Top-up mode', 'Top-up basis points', 'Top-up fixed pence', 'Top-up qualification',
                     'Top-up token mode', 'Top-up commission tokens', 'Signup bonus tokens',
                     'Top-up bonus mode', 'Top-up bonus basis points', 'Top-up bonus tokens',
                     'Expiry days', 'Commission cap pence', 'Budget pence'])
    for row in rows:
        writer.writerow([row.get('code'), row.get('campaign_name'), row.get('influencer_id'), row.get('active'),
                         row.get('starts_at'), row.get('expires_at'), row.get('reward_type'),
                         row.get('registration_commission_pence'), row.get('registration_commission_tokens'),
                         row.get('registration_eligibility'),
                         row.get('topup_commission_mode'), row.get('topup_commission_bps'),
                         row.get('topup_fixed_commission_pence'), row.get('topup_qualification'),
                         row.get('topup_token_mode'), row.get('topup_commission_tokens'),
                         row.get('signup_reward_tokens'), row.get('topup_reward_mode'), row.get('topup_reward_bps'),
                         row.get('topup_reward_tokens'), row.get('bonus_expiry_days'),
                         row.get('commission_cap_pence'), row.get('budget_pence')])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type='text/csv',
                             headers={'Content-Disposition': 'attachment; filename="influencer-campaigns.csv"'})


@admin_router.post('/{influencer_id}/commissions/{commission_id}/review')
async def review_commission(influencer_id: str, commission_id: str, payload: CommissionReview, request: Request):
    admin = await _require_campaign_admin(request)
    db = get_db()
    now = datetime.now(timezone.utc)
    query = {'commission_id': commission_id, 'influencer_id': influencer_id}
    current = await db.influencer_commissions.find_one(query, {'_id': 0})
    if not current:
        raise HTTPException(status_code=404, detail='Commission not found')
    changed = False
    if current.get('status') == 'pending':
        updated = await db.influencer_commissions.update_one(
            {**query, 'status': 'pending'},
            {'$set': {'status': payload.decision, 'reviewed_at': now, 'reviewed_by': admin.get('user_id'),
                      'reviewed_by_email': admin.get('email'), 'review_reason': payload.reason.strip()}},
        )
        if not updated.modified_count:
            raise HTTPException(status_code=409, detail='Commission changed while being reviewed')
        changed = True
    elif not (current.get('status') == payload.decision or
              current.get('status') in ('approved', 'paid') and payload.decision == 'approved'):
        raise HTTPException(status_code=409, detail='Commission is no longer pending')

    row = await db.influencer_commissions.find_one(query, {'_id': 0})
    if changed:
        await db.audit_log.insert_one({
            'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': f'influencer_commission_{payload.decision}',
            'admin_user_id': admin.get('user_id'), 'admin_email': admin.get('email'),
            'target_user_id': row.get('referred_user_id'), 'influencer_id': influencer_id,
            'commission_id': commission_id, 'reason': payload.reason.strip(), 'at': now,
        })
        if payload.decision == 'rejected' and int(row.get('amount_pence') or 0) > 0:
            await db.influencer_promos.update_one(
                {'promo_id': row.get('promo_id'),
                 'commission_reserved_pence': {'$gte': int(row['amount_pence'])}},
                {'$inc': {'commission_reserved_pence': -int(row['amount_pence'])}},
            )
        partner = await db.influencers.find_one({'influencer_id': influencer_id}, {'_id': 0, 'user_id': 1})
        if partner and partner.get('user_id'):
            from notifications import notify
            await notify(
                db, user_id=partner['user_id'],
                kind=f'influencer_commission_{payload.decision}',
                title='Influencer commission updated',
                body=f'Commission {commission_id} was {payload.decision}.',
                event_id=f'influencer-commission:{commission_id}:{payload.decision}',
                target_url='/influencer',
            )

    if payload.decision == 'approved' and float(row.get('amount_tokens') or 0) > 0 and not row.get('token_grant_ids'):
        profile = await db.influencers.find_one({'influencer_id': influencer_id}, {'_id': 0, 'user_id': 1})
        if not profile:
            raise HTTPException(status_code=404, detail='Influencer profile not found')
        from services.influencer_commissions import grant_campaign_bonus
        try:
            grants = await grant_campaign_bonus(
                db, user_id=profile['user_id'], amount=float(row['amount_tokens']), expires_at=None,
                actor_id=admin.get('user_id') or 'admin', actor_email=admin.get('email') or '',
                reason=f"Approved influencer commission {commission_id}",
                ref_key=f'influencer-commission:{commission_id}',
            )
        except Exception as exc:
            raise HTTPException(status_code=503, detail='Token commission grant will need retrying') from exc
        grant_ids = [grant['grant_id'] for grant in grants]
        await db.influencer_commissions.update_one(
            {**query, 'token_grant_ids': {'$exists': False}},
            {'$set': {'token_grant_ids': grant_ids, 'token_grant_id': grant_ids[0] if grant_ids else None,
                      'token_paid_at': now,
                      'token_paid_by': admin.get('user_id'),
                      'status': 'paid' if int(row.get('amount_pence') or 0) == 0 else 'approved'}},
        )
        row = await db.influencer_commissions.find_one(query, {'_id': 0})
    row.pop('_id', None)
    return row


@admin_router.post('/{influencer_id}/commissions/{commission_id}/record-payment')
async def record_external_payment(influencer_id: str, commission_id: str,
                                  payload: ExternalPayment, request: Request):
    admin = await _require_campaign_admin(request)
    if not payload.confirmed_external_payment:
        raise HTTPException(status_code=400, detail='Confirm the external payment was settled first')
    db = get_db()
    query = {'commission_id': commission_id, 'influencer_id': influencer_id}
    commission = await db.influencer_commissions.find_one(query, {'_id': 0})
    if not commission or int(commission.get('amount_pence') or 0) <= 0:
        raise HTTPException(status_code=409, detail='Only approved cash commissions can be recorded as paid')
    reference = payload.payment_reference.strip()
    payment_id = commission.get('payment_id') or f'ip_{commission_id}'
    if commission.get('status') == 'paid':
        if commission.get('payment_reference') == reference:
            return {'ok': True, 'payment_id': payment_id, 'amount': _money(commission['amount_pence']),
                    'settlement_source': 'externally confirmed by administrator', 'idempotent_replay': True}
        raise HTTPException(status_code=409, detail='Commission is already recorded as paid')
    if commission.get('status') == 'approved':
        claimed = await db.influencer_commissions.update_one(
            {**query, 'status': 'approved'},
            {'$set': {'status': 'payment_processing', 'payment_id': payment_id,
                      'payment_reference': reference, 'payment_started_at': datetime.now(timezone.utc),
                      'payment_started_by': admin.get('user_id')}},
        )
        if not claimed.modified_count:
            commission = await db.influencer_commissions.find_one(query, {'_id': 0})
        else:
            commission['status'] = 'payment_processing'
            commission['payment_id'] = payment_id
            commission['payment_reference'] = reference
    if commission.get('status') != 'payment_processing' or commission.get('payment_reference') != reference:
        raise HTTPException(status_code=409, detail='Commission payment is already being processed with another reference')

    now = datetime.now(timezone.utc)
    try:
        await db.influencer_commission_payments.update_one(
            {'commission_id': commission_id},
            {'$setOnInsert': {
            'payment_id': payment_id, 'commission_id': commission_id, 'influencer_id': influencer_id,
            'amount_pence': int(commission['amount_pence']), 'currency': 'GBP',
            'payment_method': payload.payment_method, 'payment_reference': reference,
            'paid_at': payload.paid_at, 'recorded_at': now, 'recorded_by': admin.get('user_id'),
            'recorded_by_email': admin.get('email'), 'note': payload.note.strip(), 'status': 'recorded',
            }}, upsert=True,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail='Payment reference has already been recorded') from exc
    payment = await db.influencer_commission_payments.find_one({'commission_id': commission_id}, {'_id': 0})
    if not payment or payment.get('payment_reference') != reference:
        raise HTTPException(status_code=409, detail='Payment reference has already been recorded for another settlement')
    updated = await db.influencer_commissions.update_one(
        {**query, 'status': 'payment_processing', 'payment_reference': reference},
        {'$set': {'status': 'paid', 'paid_at': payload.paid_at, 'payment_id': payment_id}},
    )
    if not updated.modified_count:
        commission = await db.influencer_commissions.find_one(query, {'_id': 0})
        if commission.get('status') != 'paid' or commission.get('payment_reference') != reference:
            raise HTTPException(status_code=409, detail='Commission changed while recording payment')
    await db.audit_log.update_one(
        {'_id': f'influencer_commission_paid:{commission_id}'},
        {'$setOnInsert': {
            '_id': f'influencer_commission_paid:{commission_id}',
            'audit_id': f'aud_{hashlib.sha256(commission_id.encode()).hexdigest()[:12]}',
            'kind': 'influencer_commission_paid', 'admin_user_id': admin.get('user_id'),
            'admin_email': admin.get('email'), 'target_user_id': commission.get('referred_user_id'),
            'influencer_id': influencer_id, 'commission_id': commission_id,
            'payment_id': payment_id, 'at': now,
        }}, upsert=True,
    )
    if updated.modified_count:
        profile = await db.influencers.find_one({'influencer_id': influencer_id}, {'_id': 0, 'user_id': 1})
        if profile and profile.get('user_id'):
            from notifications import notify
            await notify(
                db, user_id=profile['user_id'], kind='influencer_commission_paid',
                title='Influencer commission paid',
                body=f'Commission {commission_id} has been recorded as paid.',
                event_id=f'influencer-commission:{commission_id}:paid',
                target_url='/influencer',
            )
    return {'ok': True, 'payment_id': payment_id, 'amount': _money(commission['amount_pence']),
            'settlement_source': 'externally confirmed by administrator'}


@partner_router.get('/dashboard')
async def partner_dashboard(request: Request, range_key: str = Query(default='30d', alias='range'),
                            start_date: Optional[str] = None, end_date: Optional[str] = None):
    profile = await _require_partner(request)
    db = get_db()
    from services.analytics_common import resolve_range
    date_range = resolve_range(range_key, start_date, end_date)
    campaign_fields = {
        '_id': 0, 'promo_id': 1, 'code': 1, 'campaign_name': 1, 'active': 1,
        'reward_type': 1, 'registration_commission_pence': 1, 'registration_eligibility': 1,
        'registration_commission_tokens': 1,
        'topup_commission_mode': 1, 'topup_commission_bps': 1, 'topup_fixed_commission_pence': 1,
        'topup_token_mode': 1, 'topup_commission_tokens': 1,
        'topup_qualification': 1, 'topup_first_n': 1, 'signup_reward_tokens': 1,
        'topup_reward_tokens': 1, 'topup_reward_mode': 1, 'topup_reward_bps': 1,
        'bonus_expiry_days': 1, 'starts_at': 1, 'expires_at': 1,
        'attribution_window_days': 1,
    }
    campaigns = await db.influencer_promos.find(
        {'influencer_id': profile['influencer_id']}, campaign_fields).to_list(100)
    bounds = {'$gte': date_range['start'], '$lt': date_range['end']}
    attribution_query = {'influencer_id': profile['influencer_id'], 'created_at': bounds}
    commission_query = {'influencer_id': profile['influencer_id'], 'created_at': bounds}
    visit_query = {'influencer_id': profile['influencer_id'], 'created_at': bounds}
    attributions = await db.influencer_attributions.find(
        attribution_query, {'_id': 0, 'user_id': 1, 'created_at': 1, 'status': 1,
                            'topup_qualified': 1, 'topup_amount_gbp': 1, 'promo_id': 1,
                            'registration_eligible': 1}).limit(5000).to_list(5000)
    commissions = await db.influencer_commissions.find(commission_query, {'_id': 0}).sort('created_at', -1).limit(1000).to_list(1000)
    visits = await db.influencer_visits.count_documents(visit_query)
    unique_visitors = await db.influencer_visits.distinct('visitor_id', visit_query)
    topup_events = await db.influencer_topup_events.find(
        visit_query, {'_id': 0, 'referral_ref': 1, 'amount_pence': 1, 'qualifies': 1, 'rank': 1}).limit(5000).to_list(5000)
    grouped = {key: [row for row in commissions if row.get('status') == key] for key in
               ('pending', 'on_hold', 'approved', 'payment_processing', 'paid', 'reversed', 'rejected')}
    earning_rows = [row for row in commissions if row.get('status') in
                    ('pending', 'approved', 'payment_processing', 'paid')]
    cash_total = sum(int(row.get('amount_pence') or 0) for row in earning_rows)
    topup_value = sum(int(row.get('amount_pence') or 0) for row in topup_events if row.get('qualifies'))
    verified_ids = set()
    mobile_verified_ids = set()
    if attributions:
        linked_users = await db.users.find(
            {'user_id': {'$in': [item['user_id'] for item in attributions]}},
            {'_id': 0, 'user_id': 1, 'email_verified': 1, 'phone_verified': 1},
        ).to_list(5000)
        verified_ids = {row['user_id'] for row in linked_users if row.get('email_verified') is True}
        mobile_verified_ids = {row['user_id'] for row in linked_users if row.get('phone_verified') is True}
    referrals = [{
        'referral_ref': _safe_ref(row['user_id']), 'registered_at': row.get('created_at'),
        'email_verified': row['user_id'] in verified_ids,
        'mobile_verified': row['user_id'] in mobile_verified_ids,
        'registration_eligible': bool(row.get('registration_eligible')),
        'topup_qualified': bool(row.get('topup_qualified')),
    } for row in attributions if row.get('user_id')]
    signup_count = len(attributions)
    eligible_signup_count = sum(bool(row.get('registration_eligible')) for row in attributions)
    signup_page_visits = await db.influencer_visits.count_documents({**visit_query, 'page_key': '/login'})
    verified_signup_count = len(verified_ids)
    mobile_verified_signup_count = len(mobile_verified_ids)
    first_topups = len([row for row in topup_events if row.get('qualifies') and int(row.get('rank') or 0) == 1])
    repeat_topups = len([row for row in topup_events if row.get('qualifies') and int(row.get('rank') or 0) > 1])

    def conversion(count: int, denominator: int) -> float:
        return round(count / denominator * 100, 2) if denominator else 0.0

    funnel = [
        {'stage': 'affiliate_visits', 'count': visits, 'conversion_rate': 100.0 if visits else 0.0},
        {'stage': 'signup_page_visits', 'count': signup_page_visits, 'conversion_rate': conversion(signup_page_visits, visits)},
        {'stage': 'registrations', 'count': signup_count, 'conversion_rate': conversion(signup_count, signup_page_visits)},
        {'stage': 'verified_registrations', 'count': verified_signup_count, 'conversion_rate': conversion(verified_signup_count, signup_count)},
        {'stage': 'first_topups', 'count': first_topups, 'conversion_rate': conversion(first_topups, verified_signup_count)},
        {'stage': 'repeat_topups', 'count': repeat_topups, 'conversion_rate': conversion(repeat_topups, first_topups)},
    ]
    return {
        'influencer': {'influencer_id': profile['influencer_id'], 'display_name': profile['display_name']},
        'range': date_range,
        'campaigns': campaigns,
        'overview': {
            'visits': visits, 'unique_visitors': len(unique_visitors), 'registrations': signup_count,
            'eligible_registrations': eligible_signup_count,
            'pending_registrations': max(0, signup_count - eligible_signup_count),
            'email_verified_registrations': verified_signup_count,
            'mobile_verified_registrations': mobile_verified_signup_count,
            'topup_users': len({r.get('referral_ref') for r in topup_events}),
            'qualifying_topups': len([r for r in topup_events if r.get('qualifies')]),
            'first_topups': first_topups, 'repeat_topups': repeat_topups,
            'qualifying_topup_value': _money(topup_value),
            'commission_earned': _money(cash_total),
            'registration_commission': _money(sum(int(r.get('amount_pence') or 0) for r in earning_rows if r.get('event_kind') == 'registration')),
            'topup_commission': _money(sum(int(r.get('amount_pence') or 0) for r in earning_rows if r.get('event_kind') == 'topup')),
            'pending_commission': _money(sum(int(r.get('amount_pence') or 0) for r in grouped['pending'])),
            'held_commission': _money(sum(int(r.get('amount_pence') or 0) for r in grouped['on_hold'])),
            'approved_commission': _money(sum(int(r.get('amount_pence') or 0) for r in grouped['approved'])),
            'processing_commission': _money(sum(int(r.get('amount_pence') or 0) for r in grouped['payment_processing'])),
            'paid_commission': _money(sum(int(r.get('amount_pence') or 0) for r in grouped['paid'])),
            'reversed_commission': _money(sum(int(r.get('reversed_amount_pence') or r.get('amount_pence') or 0)
                                    for r in commissions if r.get('status') == 'reversed')
                                 + sum(max(0, -int(r.get('amount_pence') or 0))
                                     for r in commissions if r.get('event_kind') == 'refund_recovery')),
            'outstanding_payable': _money(sum(int(r.get('amount_pence') or 0) for r in grouped['approved'])),
        },
        'funnel': funnel,
        'commissions': [{
            'date': row.get('created_at'), 'activity': row.get('event_kind'),
            'topup_amount': _money(row.get('qualifying_amount_pence') or 0),
            'commission': _money(row.get('amount_pence') or 0),
            'tokens': row.get('amount_tokens') or 0, 'status': row.get('status'),
        } for row in commissions],
        'referrals': referrals,
    }


@partner_router.get('/commissions.csv')
async def partner_commissions_csv(request: Request):
    profile = await _require_partner(request)
    db = get_db()
    rows = await db.influencer_commissions.find(
        {'influencer_id': profile['influencer_id']},
        {'_id': 0, 'created_at': 1, 'event_kind': 1, 'qualifying_amount_pence': 1,
         'amount_pence': 1, 'amount_tokens': 1, 'status': 1},
    ).sort('created_at', -1).limit(5000).to_list(5000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Date', 'Activity', 'Qualifying top-up', 'Commission', 'Tokens', 'Status'])
    for row in rows:
        writer.writerow([row.get('created_at'), row.get('event_kind'), _money(row.get('qualifying_amount_pence') or 0),
                         _money(row.get('amount_pence') or 0), row.get('amount_tokens') or 0, row.get('status')])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type='text/csv',
                             headers={'Content-Disposition': 'attachment; filename="influencer-commissions.csv"'})


@public_router.post('/visit')
async def record_affiliate_visit(payload: AffiliateVisit, request: Request):
    if request.headers.get('DNT') == '1' or request.headers.get('Sec-GPC') == '1':
        return {'recorded': False, 'reason': 'privacy_signal'}
    from services.analytics_common import is_staff, is_test_account
    try:
        viewer = await get_current_user(request)
    except Exception:
        viewer = None
    if viewer and (is_staff(viewer) or is_test_account(viewer)):
        return {'recorded': False, 'reason': 'internal_account'}
    visitor_key = _affiliate_visitor_key(request)
    if not visitor_key:
        return {'recorded': False, 'reason': 'identity_unavailable'}
    db = get_db()
    code = payload.code.strip().upper()
    now = datetime.now(timezone.utc)
    promo = await db.influencer_promos.find_one({
        'code': code, 'active': True,
        '$and': [
            {'$or': [{'starts_at': {'$exists': False}}, {'starts_at': None}, {'starts_at': {'$lte': now}}]},
            {'$or': [{'expires_at': {'$exists': False}}, {'expires_at': None}, {'expires_at': {'$gt': now}}]},
        ],
    }, {'_id': 0})
    if not promo or not promo.get('influencer_id'):
        return {'recorded': False}
    today = datetime.now(timezone.utc).date().isoformat()
    dedupe = f"{promo['promo_id']}:{visitor_key}:{today}"
    try:
        await db.influencer_visits.insert_one({
            'visit_id': f'iv_{uuid.uuid4().hex}', 'dedupe': dedupe,
            'promo_id': promo['promo_id'], 'influencer_id': promo['influencer_id'],
            'visitor_id': visitor_key, 'page_key': payload.page_key,
            'created_at': datetime.now(timezone.utc),
        })
        return {'recorded': True, 'attribution_window_days': promo.get('attribution_window_days', 30)}
    except Exception as exc:
        if exc.__class__.__name__ == 'DuplicateKeyError':
            return {'recorded': True, 'duplicate': True,
                    'attribution_window_days': promo.get('attribution_window_days', 30)}
        raise