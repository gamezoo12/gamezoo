"""Active offer (public) and offer administration: pricing, live preview, tracking and history.

Read-only except for saving settings, which goes through the existing validated
`save_reward_settings` and stays Super Admin only. Saved changes are visible to the
frontend immediately because every page reads GET /api/offers/active.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query, Request

from auth import require_admin
from deps import get_db
from services.offer_terms import (
    PREVIEW_AMOUNTS_GBP, TOPUP_MAX_GBP, TOPUP_MIN_GBP, TOPUP_PRESETS_GBP, TOPUP_TOKENS_PER_GBP,
    campaign_conditions_text, campaign_terms, campaign_topup_preview,
    legal_flags, public_offer, referral_progress, topup_preview,
)
from services.promo_status import STACKING_RULE, STACKING_RULE_LABEL, promotion_rows
from services.reward_program import find_active_influencer_promo, get_reward_settings, save_reward_settings

public_router = APIRouter(prefix='/api/offers', tags=['offers'])
admin_router = APIRouter(prefix='/api/admin/offers', tags=['admin-offers'])


async def _staff(request: Request) -> dict:
    user = await require_admin(request)
    if user.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Admin or super admin only')
    return user


def _clean(doc: dict) -> dict:
    doc.pop('_id', None)
    return doc


@public_router.get('/active')
async def active_offer():
    """Current saved offer terms for signup, referral and top-up pages. No authentication needed."""
    return public_offer(await get_reward_settings(get_db()))


@public_router.get('/promo/{code}')
async def public_campaign(code: str):
    """Validate an influencer code for the signup screen. Display-safe terms only; the server re-validates at signup."""
    promo = await find_active_influencer_promo(get_db(), code[:40])
    if not promo:
        return {'valid': False, 'stacking_rule': STACKING_RULE}
    terms = campaign_terms(promo)
    return {'valid': True, 'stacking_rule': STACKING_RULE,
            'campaign': {**terms, 'conditions_text': campaign_conditions_text(terms)}}


@admin_router.get('/config')
async def offer_config(request: Request):
    await _staff(request)
    db = get_db()
    settings = await get_reward_settings(db)
    return {'settings': _clean(dict(settings)), 'offer': public_offer(settings), 'legal_flags': legal_flags(settings)}


@admin_router.put('/config')
async def save_offer_config(payload: dict, request: Request):
    user = await _staff(request)
    if user.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail='Only Super Admin can change offer settings')
    db = get_db()
    settings = await save_reward_settings(db, payload)
    return {'settings': _clean(dict(settings)), 'offer': public_offer(settings), 'legal_flags': legal_flags(settings)}


@admin_router.get('/pricing')
async def topup_pricing(request: Request):
    """How many purchased Top-up Tokens each GBP amount credits. Display only; checkout and wallet code own the rule."""
    await _staff(request)
    return {
        'rule': {'tokens_per_gbp': TOPUP_TOKENS_PER_GBP, 'min_gbp': TOPUP_MIN_GBP, 'max_gbp': TOPUP_MAX_GBP,
                 'category': 'topup_tokens', 'editable': False,
                 'note': 'Purchased tokens always go to Top-up Tokens, never to Bonus Tokens.'},
        'packages': [{'amount_gbp': a, 'topup_tokens': a * TOPUP_TOKENS_PER_GBP} for a in TOPUP_PRESETS_GBP],
    }


@admin_router.get('/preview')
async def offer_preview(request: Request, amounts: str = Query(default='')):
    """What a new eligible user's top-up produces right now, by wallet category."""
    await _staff(request)
    try:
        values = [float(a) for a in amounts.split(',') if a.strip()] or list(PREVIEW_AMOUNTS_GBP)
    except ValueError:
        raise HTTPException(status_code=400, detail='amounts must be comma-separated numbers')
    if len(values) > 12:
        raise HTTPException(status_code=400, detail='At most 12 amounts')
    settings = await get_reward_settings(get_db())
    return {'offer_version': settings.get('offer_version'), 'previews': [topup_preview(settings, a) for a in values]}


@admin_router.get('/promotion-preview')
async def promotion_preview(request: Request, amounts: str = Query(default=''), promo_id: str = Query(default='')):
    """Normal versus influencer outcome for the same top-up. The two are never added together."""
    await _staff(request)
    try:
        values = [float(a) for a in amounts.split(',') if a.strip()] or list(PREVIEW_AMOUNTS_GBP)
    except ValueError:
        raise HTTPException(status_code=400, detail='amounts must be comma-separated numbers')
    if len(values) > 12:
        raise HTTPException(status_code=400, detail='At most 12 amounts')
    db = get_db()
    settings = await get_reward_settings(db)
    campaigns = await db.influencer_promos.find({}, {'_id': 0}).sort('created_at', -1).limit(100).to_list(100)
    promo = next((p for p in campaigns if p.get('promo_id') == promo_id), None) if promo_id else None
    if promo_id and not promo:
        raise HTTPException(status_code=404, detail='Campaign not found')
    return {
        'stacking_rule': STACKING_RULE, 'stacking_rule_label': STACKING_RULE_LABEL,
        'campaigns': [{'promo_id': p.get('promo_id'), 'code': p.get('code'), 'campaign_name': p.get('campaign_name'),
                       'active': bool(p.get('active', True))} for p in campaigns],
        'campaign': ({**campaign_terms(promo), 'conditions_text': campaign_conditions_text(campaign_terms(promo))} if promo else None),
        'rows': [{'amount_gbp': a, 'normal': topup_preview(settings, a),
                  'influencer': campaign_topup_preview(promo, a) if promo else None} for a in values],
    }


@admin_router.get('/promotion-eligibility')
async def promotion_eligibility(request: Request, q: str = '', acquisition: str = '', conflicts_only: bool = False,
                                limit: int = Query(default=100, ge=1, le=300)):
    """Per-user promotional eligibility. Read-only; filters apply to the newest users first."""
    await _staff(request)
    db = get_db()
    query: dict = {'role': 'user'}
    q = q.strip()[:80]
    if q:
        pattern = re.escape(q)
        query['$or'] = [{'email': {'$regex': pattern, '$options': 'i'}}, {'name': {'$regex': pattern, '$options': 'i'}},
                        {'public_id': {'$regex': pattern, '$options': 'i'}}, {'user_id': q}]
    users = await db.users.find(query, {'_id': 0, 'password_hash': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    rows = await promotion_rows(db, users)
    if acquisition:
        rows = [r for r in rows if r['acquisition_type'] == acquisition]
    if conflicts_only:
        rows = [r for r in rows if r['has_conflict']]
    return {'stacking_rule': STACKING_RULE, 'stacking_rule_label': STACKING_RULE_LABEL, 'items': rows}


@admin_router.get('/history')
async def settings_history(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    await _staff(request)
    rows = await get_db().reward_settings_history.find({}, {'_id': 0}).sort('changed_at', -1).limit(limit).to_list(limit)
    return {'items': rows}


async def _names(db, ids: list) -> dict:
    if not ids:
        return {}
    rows = await db.users.find({'user_id': {'$in': ids}},
                               {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1, 'public_id': 1}).to_list(len(ids))
    return {r['user_id']: r for r in rows}


@admin_router.get('/referrals')
async def referral_tracking(request: Request, state: str = '', limit: int = Query(default=200, ge=1, le=500)):
    """Every referral with its stored terms, progress, pending condition and credited transaction reference."""
    await _staff(request)
    db = get_db()
    settings = await get_reward_settings(db)
    rows = await db.referrals.find({}, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    people = await _names(db, list({i for r in rows for i in (r.get('referrer_user_id'), r.get('referred_user_id')) if i}))
    items = []
    for row in rows:
        row.update(referral_progress(row, settings))
        if state and row['reward_state'] != state:
            continue
        row['referrer'] = people.get(row.get('referrer_user_id'))
        row['referred'] = people.get(row.get('referred_user_id'))
        items.append(row)
    counts = {}
    for row in rows:
        key = referral_progress(row, settings)['reward_state']
        counts[key] = counts.get(key, 0) + 1
    return {'items': items, 'counts': counts}


@admin_router.get('/reward-history')
async def reward_history(request: Request, source: str = '', limit: int = Query(default=200, ge=1, le=500)):
    """Signup / referral reward grants with amount, expiry, status and wallet transaction references."""
    await _staff(request)
    db = get_db()
    query = {'source': source} if source else {'source': {'$in': ['signup', 'normal_topup', 'referral', 'influencer_campaign', 'admin', 'other']}}
    grants = await db.bonus_grants.find(query, {'_id': 0}).sort('granted_at', -1).limit(limit).to_list(limit)
    people = await _names(db, list({g['user_id'] for g in grants if g.get('user_id')}))
    items = [{
        'grant_id': g.get('grant_id'), 'ref_key': g.get('ref_key'), 'source': g.get('source'),
        'user': people.get(g.get('user_id')), 'user_id': g.get('user_id'),
        'tokens': g.get('original_amount'), 'remaining': g.get('remaining_amount'),
        'expired': g.get('expired_amount'), 'status': g.get('status'),
        'granted_at': g.get('granted_at'), 'expires_at': g.get('expires_at'),
        'transaction_ids': g.get('related_tx_ids') or [],
    } for g in grants]
    return {'items': items}
