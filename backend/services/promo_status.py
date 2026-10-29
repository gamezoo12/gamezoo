"""Read-only promotional eligibility report: normal versus influencer, rewards issued, conflicts.

Nothing here changes a balance or a stored classification. Admin screens, User 360 and the
player's own wallet view all use `promotion_rows` so every surface shows the same figures.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from services.offer_terms import campaign_conditions_text, campaign_terms, classify_acquisition

STACKING_RULE = 'influencer_exclusive'
STACKING_RULE_LABEL = 'Influencer Exclusive'

_NORMAL = {'signup'}
_NORMAL_TOPUP = {'normal_topup'}
_INFLUENCER = {'influencer_campaign'}


def _aware(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


def _iso(value) -> Optional[str]:
    value = _aware(value)
    return value.isoformat() if value else None


def _campaign_live(promo: dict, now: datetime) -> bool:
    if not promo or not promo.get('active', True):
        return False
    starts, expires = _aware(promo.get('starts_at')), _aware(promo.get('expires_at'))
    cap = int(promo.get('max_redemptions') or 0)
    if cap and int(promo.get('redemptions') or 0) >= cap:
        return False
    return not ((starts and starts > now) or (expires and expires < now))


def _signup_pending_reason(terms: dict, user: dict) -> str:
    when = terms.get('signup_when')
    if when == 'first_topup':
        return 'Make a qualifying first top-up'
    if when == 'mobile_verified' and user.get('phone_verified') is not True:
        return 'Verify your mobile number'
    if user.get('email_verified') is not True:
        return 'Verify your email'
    return 'Processing'


def _topup_pending_reason(terms: dict) -> str:
    minimum = terms.get('topup_minimum_gbp') or 0
    return f'Make a qualifying top-up of \u00a3{minimum:g} or more' if minimum else 'Make a qualifying top-up'


async def promotion_rows(db, users: list[dict]) -> list[dict]:
    """Eligibility rows for the given user documents using batched queries."""
    if not users:
        return []
    now = datetime.now(timezone.utc)
    ids = [u['user_id'] for u in users]
    attributions = {a['user_id']: a async for a in db.influencer_attributions.find({'user_id': {'$in': ids}}, {'_id': 0})}
    promo_ids = list({a['promo_id'] for a in attributions.values() if a.get('promo_id')})
    promos = {p['promo_id']: p async for p in db.influencer_promos.find({'promo_id': {'$in': promo_ids}}, {'_id': 0})} if promo_ids else {}
    attribution_ids = [a['attribution_id'] for a in attributions.values() if a.get('attribution_id')]
    topup_event_counts: dict[str, int] = {}
    if attribution_ids:
        async for event in db.influencer_topup_events.aggregate([
            {'$match': {'attribution_id': {'$in': attribution_ids}}},
            {'$group': {'_id': '$attribution_id', 'count': {'$sum': 1}}},
        ]):
            topup_event_counts[event['_id']] = int(event.get('count') or 0)
    referrals = {r['referred_user_id']: r async for r in db.referrals.find({'referred_user_id': {'$in': ids}}, {'_id': 0, 'referred_user_id': 1})}
    grants_by_user: dict[str, list] = {}
    async for g in db.bonus_grants.find({'user_id': {'$in': ids}}, {
            '_id': 0, 'user_id': 1, 'source': 1, 'original_amount': 1, 'remaining_amount': 1, 'status': 1,
            'expires_at': 1, 'related_tx_ids': 1, 'ref_key': 1, 'granted_at': 1, 'grant_id': 1}):
        grants_by_user.setdefault(g['user_id'], []).append(g)
    wallets = {w['user_id']: w async for w in db.wallets.find({'user_id': {'$in': ids}}, {
        '_id': 0, 'user_id': 1, 'bonus': 1, 'source_migrated': 1})}
    purchased: dict[str, float] = {}
    async for row in db.wallet_tx.aggregate([
        {'$match': {'user_id': {'$in': ids}, 'kind': 'topup', 'amount': {'$gt': 0}}},
        {'$group': {'_id': '$user_id', 'tokens': {'$sum': '$amount'}}},
    ]):
        purchased[row['_id']] = round(float(row['tokens']), 2)

    rows = []
    for user in users:
        uid = user['user_id']
        attribution = attributions.get(uid)
        acquisition = classify_acquisition(user, attribution, referrals.get(uid))
        promo = promos.get((attribution or {}).get('promo_id')) or {}
        grants = grants_by_user.get(uid, [])
        normal = [g for g in grants if g.get('source') in _NORMAL]
        normal_topup = [g for g in grants if g.get('source') in _NORMAL_TOPUP]
        influencer = [g for g in grants if g.get('source') in _INFLUENCER]
        referral = [g for g in grants if g.get('source') == 'referral']
        terms = campaign_terms({**promo, **(attribution or {}).get('campaign_snapshot', {})}) if attribution else None
        campaign_live = _campaign_live(promo, now) if attribution else None
        topup_event_count = topup_event_counts.get((attribution or {}).get('attribution_id'), 0)
        normal_topup_terms = (user.get('normal_topup_offer_terms') or {}) if acquisition == 'normal' else None

        conflicts = []
        if acquisition == 'influencer' and (normal or normal_topup):
            conflicts.append({'code': 'normal_bonus_on_influencer',
                              'message': 'Normal promotional bonus already issued to an influencer-attributed account; influencer credits are held for review'})
        elif attribution and attribution.get('promo_conflict'):
            conflicts.append({'code': 'flagged_for_review', 'message': 'Previously flagged for review'})
        if user.get('acquisition_type') == 'influencer_pending' and not attribution:
            conflicts.append({'code': 'attribution_pending',
                              'message': 'Influencer signup recorded but attribution not yet persisted; no credits issued until resolved'})
        blocked_reason = 'Acquisition unresolved: no promotional credits are issued' if acquisition == 'unresolved' else None

        if acquisition == 'influencer':
            signup_grant = next((g for g in influencer if str(g.get('ref_key') or '').startswith(('influencer-signup:', 'influencer-qualifying:'))), None)
            topup_grants = [g for g in influencer if str(g.get('ref_key') or '').startswith('influencer-topup:')]
            if signup_grant:
                signup_status = 'credited'
            elif normal:
                signup_status = 'held_for_review'
            elif terms and terms['signup_reward_tokens'] > 0:
                signup_status = 'pending'
            else:
                signup_status = 'not_offered'
            if topup_grants:
                topup_status = 'credited'
            elif normal:
                topup_status = 'held_for_review'
            elif terms and campaign_live and (terms['topup_reward_tokens'] > 0 or terms['topup_reward_percent'] > 0):
                topup_status = 'pending'
            else:
                topup_status = 'not_offered'
        elif acquisition == 'normal':
            signup_status = ('credited' if normal or user.get('signup_bonus_granted')
                             else 'pending' if user.get('signup_bonus_offer_eligible') else 'not_eligible')
            if normal_topup:
                topup_status = 'credited'
            elif normal_topup_terms and normal_topup_terms.get('enabled') and (normal_topup_terms.get('reward_tokens') or normal_topup_terms.get('reward_percent')):
                topup_status = 'pending'
            else:
                topup_status = 'not_offered'
        else:
            signup_status = topup_status = 'blocked_unresolved' if acquisition == 'unresolved' else 'not_eligible'

        wallet = wallets.get(uid) or {}
        tx_ids = [t for g in grants for t in (g.get('related_tx_ids') or [])]
        if user.get('signup_bonus_tx_id') and user['signup_bonus_tx_id'] not in tx_ids:
            tx_ids.append(user['signup_bonus_tx_id'])
        rows.append({
            'user_id': uid, 'public_id': user.get('public_id'), 'name': user.get('name'), 'email': user.get('email'),
            'acquisition_type': acquisition, 'stacking_rule': STACKING_RULE,
            'influencer_name': (attribution or {}).get('influencer_name') or promo.get('influencer_name') or None,
            'promo_code': (attribution or {}).get('code') or promo.get('code') or None,
            'campaign_name': (attribution or {}).get('campaign_name') or promo.get('campaign_name') or None,
            'promo_id': (attribution or {}).get('promo_id'),
            'campaign_active': campaign_live,
            'campaign': ({**terms, 'conditions_text': campaign_conditions_text(terms)} if terms else None),
            'influencer_topup_event_count': topup_event_count,
            'next_influencer_topup_rank': topup_event_count + 1,
            'signup_bonus_status': signup_status, 'topup_bonus_status': topup_status,
            'normal_topup_promo': normal_topup_terms,
            'signup_pending_condition': (_signup_pending_reason(terms, user) if acquisition == 'influencer' and signup_status == 'pending' and terms else None),
            'topup_pending_condition': (_topup_pending_reason(terms) if acquisition == 'influencer' and topup_status == 'pending' and terms else None),
            'normal_bonus_tokens_issued': round(sum(float(g.get('original_amount') or 0) for g in normal + normal_topup), 2),
            'normal_topup_bonus_tokens_issued': round(sum(float(g.get('original_amount') or 0) for g in normal_topup), 2),
            'influencer_bonus_tokens_issued': round(sum(float(g.get('original_amount') or 0) for g in influencer), 2),
            'referral_bonus_tokens_issued': round(sum(float(g.get('original_amount') or 0) for g in referral), 2),
            'purchased_topup_tokens': purchased.get(uid, 0.0),
            'promotional_bonus_tokens_current': round(float(wallet.get('bonus') or 0), 2) if wallet.get('source_migrated') else None,
            'reward_transaction_ids': tx_ids,
            'bonus_expiry': [{'source': g.get('source'), 'tokens': g.get('original_amount'), 'remaining': g.get('remaining_amount'),
                              'status': g.get('status'), 'expires_at': _iso(g.get('expires_at'))}
                             for g in grants if g.get('source') in _NORMAL | _NORMAL_TOPUP | _INFLUENCER | {'referral'}],
            'conflicts': conflicts,
            'has_conflict': bool(conflicts),
            'blocked_reason': blocked_reason,
        })
    return rows


async def user_promotion_status(db, user_id: str) -> Optional[dict]:
    user = await db.users.find_one({'user_id': user_id}, {'_id': 0, 'password_hash': 0})
    if not user:
        return None
    return (await promotion_rows(db, [user]))[0]
