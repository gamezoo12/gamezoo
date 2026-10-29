"""Idempotent influencer qualification and commission records."""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
import uuid

from pymongo.errors import DuplicateKeyError

MAX_CAMPAIGN_GRANT_TOKENS = 500
log = logging.getLogger('gz.influencer_commissions')


def _utc(value) -> datetime | None:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _commission_pence(promo: dict, event_kind: str, amount_pence: int = 0) -> int:
    if promo.get('reward_type', 'cash') not in ('cash', 'both'):
        return 0
    if event_kind == 'registration':
        return max(0, int(promo.get('registration_commission_pence') or 0))
    if promo.get('topup_commission_mode', 'percentage') == 'disabled':
        return 0
    if promo.get('topup_commission_mode', 'percentage') == 'fixed':
        return max(0, int(promo.get('topup_fixed_commission_pence') or 0))
    basis_points = max(0, int(promo.get('topup_commission_bps') or 0))
    return (max(0, amount_pence) * basis_points + 5000) // 10000


def _token_commission(promo: dict, event_kind: str, amount_pence: int = 0) -> float:
    if promo.get('reward_type') not in ('tokens', 'both'):
        return 0.0
    if event_kind == 'registration':
        return round(float(promo.get('registration_commission_tokens') or 0), 2)
    fixed = float(promo.get('topup_commission_tokens') or 0)
    if promo.get('topup_token_mode') == 'percentage':
        return round((amount_pence / 100) * fixed / 100, 2)
    return round(fixed, 2)


def _user_topup_reward(promo: dict, amount_pence: int) -> float:
    if promo.get('topup_reward_mode') == 'percentage':
        basis_points = max(0, int(promo.get('topup_reward_bps') or 0))
        return round((amount_pence / 100) * basis_points / 10000, 2)
    return max(0.0, round(float(promo.get('topup_reward_tokens') or 0), 2))


async def _reconcile_refunded_user_bonus(db, *, user_id: str, session_id: str,
                                         promo: dict, target_amount: float, refunded_pence: int) -> None:
    from services.bonus_grants import revoke_grant

    original_prefix = re.escape(f'influencer-topup:{session_id}:part:')
    adjustment_prefix = re.escape(f'influencer-topup-refund:{session_id}:')
    grants = await db.bonus_grants.find({
        'user_id': user_id,
        '$or': [{'ref_key': {'$regex': f'^{original_prefix}'}},
                {'ref_key': {'$regex': f'^{adjustment_prefix}'}}],
    }, {'_id': 0, 'grant_id': 1, 'status': 1, 'original_amount': 1, 'remaining_amount': 1,
        'expired_amount': 1, 'revoked_amount': 1, 'expires_at': 1}).to_list(1000)
    spent = round(sum(max(0.0, float(row.get('original_amount') or 0)
                          - float(row.get('remaining_amount') or 0)
                          - float(row.get('expired_amount') or 0)
                          - float(row.get('revoked_amount') or 0)) for row in grants), 2)
    active = [row for row in grants if row.get('status') == 'active' and float(row.get('remaining_amount') or 0) > 0]
    available = round(sum(float(row.get('remaining_amount') or 0) for row in active), 2)
    target = max(0.0, round(float(target_amount), 2))
    if abs(spent + available - target) < 0.01:
        return

    expiry_values = [_utc(row.get('expires_at')) for row in grants if row.get('expires_at')]
    expiry = expiry_values[0] if expiry_values else None
    for row in active:
        await revoke_grant(db, row['grant_id'], 'payment-refund')

    replacement = max(0.0, round(target - spent, 2))
    if replacement > 0:
        await grant_campaign_bonus(
            db, user_id=user_id, amount=replacement, expires_at=expiry,
            actor_id='campaign-system', actor_email='campaign-system@prizeleague.co.uk',
            reason='Adjusted campaign reward after confirmed payment refund',
            ref_key=f'influencer-topup-refund:{session_id}:{refunded_pence}',
        )


async def _create_commission(db, *, event_key: str, event_kind: str, user_id: str,
                             attribution: dict, promo: dict, amount_pence: int = 0,
                             payment_session_id: str | None = None) -> dict | None:
    cash_pence = _commission_pence(promo, event_kind, amount_pence)
    token_amount = _token_commission(promo, event_kind, amount_pence)
    if cash_pence <= 0 and token_amount <= 0:
        return None

    budget = promo.get('budget_pence')
    commission_cap = promo.get('commission_cap_pence')
    limits = [int(value) for value in (budget, commission_cap) if value is not None]
    if cash_pence and limits:
        limit = min(limits)
        reservation = await db.influencer_promos.find_one_and_update(
            {'promo_id': promo['promo_id'], 'active': True,
             '$expr': {'$lte': [
                 {'$add': [{'$ifNull': ['$commission_reserved_pence', 0]}, cash_pence]},
                 limit,
             ]}},
            {'$inc': {'commission_reserved_pence': cash_pence}},
            return_document=True,
        )
        if not reservation:
            return None

    base = {
        'commission_id': f'ic_{uuid.uuid4().hex}',
        'influencer_id': promo['influencer_id'],
        'promo_id': promo['promo_id'],
        'attribution_id': attribution['attribution_id'],
        'referred_user_id': user_id,
        'event_key': event_key,
        'event_kind': event_kind,
        'payment_session_id': payment_session_id,
        'qualifying_amount_pence': int(amount_pence),
        'original_qualifying_amount_pence': int(amount_pence),
        'amount_pence': cash_pence,
        'original_amount_pence': cash_pence,
        'amount_tokens': token_amount,
        'original_amount_tokens': token_amount,
        'currency': 'GBP',
        'status': 'pending',
        'rate_snapshot': {
            'reward_type': promo.get('reward_type', 'cash'),
            'registration_commission_pence': promo.get('registration_commission_pence', 0),
            'registration_commission_tokens': promo.get('registration_commission_tokens', 0),
            'topup_commission_mode': promo.get('topup_commission_mode', 'percentage'),
            'topup_commission_bps': promo.get('topup_commission_bps', 0),
            'topup_fixed_commission_pence': promo.get('topup_fixed_commission_pence', 0),
            'topup_token_mode': promo.get('topup_token_mode', 'fixed'),
            'topup_commission_tokens': promo.get('topup_commission_tokens', 0),
            'topup_reward_mode': promo.get('topup_reward_mode', 'fixed'),
            'topup_reward_bps': promo.get('topup_reward_bps', 0),
            'topup_reward_tokens': promo.get('topup_reward_tokens', 0),
        },
        'created_at': datetime.now(timezone.utc),
    }
    try:
        await db.influencer_commissions.insert_one(base)
    except DuplicateKeyError:
        if cash_pence and limits:
            await db.influencer_promos.update_one(
                {'promo_id': promo['promo_id']}, {'$inc': {'commission_reserved_pence': -cash_pence}})
        return await db.influencer_commissions.find_one({'event_key': event_key}, {'_id': 0})
    except Exception:
        if cash_pence and limits:
            await db.influencer_promos.update_one(
                {'promo_id': promo['promo_id'], 'commission_reserved_pence': {'$gte': cash_pence}},
                {'$inc': {'commission_reserved_pence': -cash_pence}},
            )
        raise
    return base


async def _grant_user_bonus(db, *, user_id: str, promo: dict, amount: float, ref_key: str,
                            reason: str, attribution: dict | None = None) -> list[dict]:
    """The single choke point for campaign Bonus Token credits to the referred user.

    Credits only influencer-classified accounts, holds credits for accounts that already hold a
    normal signup bonus (flagged for review), and enforces the campaign's max_redemptions once per
    account. An already-created grant is only replayed (idempotent), never re-gated.
    """
    if amount <= 0:
        return []
    from services.reward_program import claim_campaign_redemption, promo_conflict, resolve_acquisition_program

    expiry_days = promo.get('bonus_expiry_days')
    expires_at = datetime.now(timezone.utc) + timedelta(days=int(expiry_days)) if expiry_days else None
    already = await db.bonus_grants.find_one({'ref_key': f'{ref_key}:part:1'}, {'_id': 1})
    if not already:
        if await resolve_acquisition_program(db, user_id) != 'influencer':
            return []
        if await promo_conflict(db, user_id):
            if attribution:
                await db.influencer_attributions.update_one(
                    {'attribution_id': attribution['attribution_id']},
                    {'$set': {'promo_conflict': True, 'promo_conflict_at': datetime.now(timezone.utc),
                              'promo_conflict_reason': 'normal_signup_bonus_already_issued'}},
                )
            return []
        if attribution and not await claim_campaign_redemption(db, attribution, promo):
            return []
    return await grant_campaign_bonus(
        db, user_id=user_id, amount=amount, expires_at=expires_at,
        actor_id='campaign-system', actor_email='campaign-system@prizeleague.co.uk',
        reason=reason[:300], ref_key=ref_key,
    )


async def grant_campaign_bonus(db, *, user_id: str, amount: float, expires_at: datetime | None,
                               actor_id: str, actor_email: str, reason: str, ref_key: str) -> list[dict]:
    total = max(0.0, round(float(amount), 2))
    if total <= 0:
        return []
    from services.bonus_grants import create_grant
    grants = []
    part = 0
    remaining = total
    while remaining > 0:
        part += 1
        grant_amount = min(MAX_CAMPAIGN_GRANT_TOKENS, remaining)
        grants.append(await create_grant(
            db, user_id=user_id, amount=grant_amount, expires_at=expires_at,
            actor_id=actor_id, actor_email=actor_email, reason=reason[:300],
            ref_key=f'{ref_key}:part:{part}', source='influencer_campaign',
        ))
        remaining = round(remaining - grant_amount, 2)
    return grants


async def record_registration_commission(db, user_id: str, *, first_topup_qualified: bool = False) -> dict | None:
    """Record an eligible registration once; never trusts a browser assertion."""
    attribution = await db.influencer_attributions.find_one({'user_id': user_id}, {'_id': 0})
    if not attribution or not attribution.get('influencer_id'):
        return None
    user = await db.users.find_one({'user_id': user_id}, {'_id': 0})
    influencer = await db.influencers.find_one(
        {'influencer_id': attribution['influencer_id'], 'status': 'active'}, {'_id': 0})
    promo = await db.influencer_promos.find_one({'promo_id': attribution['promo_id']}, {'_id': 0})
    if not user or not influencer or not promo:
        return None
    if user.get('role') != 'user' or user.get('is_test') or user.get('is_test_account'):
        return None
    if user_id == influencer.get('user_id') or user.get('email_verified') is not True:
        return None
    if user.get('email', '').strip().lower() == influencer.get('email', '').strip().lower():
        return None
    promo_snapshot = {**promo, **(attribution.get('campaign_snapshot') or {})}
    user_created_at = _utc(user.get('created_at')) or datetime.now(timezone.utc)
    starts_at = _utc(promo_snapshot.get('starts_at'))
    expires_at = _utc(promo_snapshot.get('expires_at'))
    if starts_at and user_created_at < starts_at or expires_at and user_created_at > expires_at:
        return None
    eligibility = promo_snapshot.get('registration_eligibility', 'email_verified')
    if eligibility == 'mobile_verified' and user.get('phone_verified') is not True:
        return None
    if eligibility == 'first_topup' and not first_topup_qualified:
        return None
    eligible_at = datetime.now(timezone.utc)
    await db.influencer_attributions.update_one(
        {'attribution_id': attribution['attribution_id'], 'registration_eligible': {'$ne': True}},
        {'$set': {'registration_eligible': True, 'registration_eligible_at': eligible_at,
                  'registration_eligibility_rule': eligibility}},
    )
    event_key = (f"registration:first-topup:{attribution['attribution_id']}" if eligibility == 'first_topup'
                 else f"registration:{attribution['attribution_id']}")
    commission = await _create_commission(
        db, event_key=event_key, event_kind='registration', user_id=user_id,
        attribution=attribution, promo=promo_snapshot)
    if eligibility != 'first_topup' or first_topup_qualified:
        await _grant_user_bonus(
            db, user_id=user_id, promo=promo_snapshot,
            amount=float(promo_snapshot.get('signup_reward_tokens') or 0),
            ref_key=f"influencer-signup:{attribution['attribution_id']}",
            reason=f"Campaign {promo_snapshot.get('code') or promo['code']} eligible signup reward",
            attribution=attribution)
    await db.influencer_attributions.update_one(
        {'attribution_id': attribution['attribution_id']},
        {'$set': {'registration_commission_checked_at': datetime.now(timezone.utc),
                  'registration_commission_id': commission.get('commission_id') if commission else None}},
    )
    return commission


async def recover_pending_registration_commissions(db, limit: int = 100,
                                                  now: datetime | None = None) -> int:
    """Retry signup rewards/commissions interrupted after user creation."""
    now = now or datetime.now(timezone.utc)
    batch = max(1, min(int(limit), 500))
    rows = await db.influencer_attributions.find(
        {'registration_commission_checked_at': {'$exists': False},
         '$or': [
             {'registration_eligible': True},
             {'campaign_snapshot.registration_eligibility': {'$exists': True, '$ne': 'first_topup'}},
             {'campaign_snapshot.registration_eligibility': {'$exists': False},
              'registration_eligibility': {'$exists': True, '$ne': 'first_topup'}},
             {'campaign_snapshot.registration_eligibility': {'$exists': False},
              'registration_eligibility': {'$exists': False}},
         ],
         'created_at': {'$gte': now - timedelta(days=365)}},
        {'_id': 0, 'user_id': 1, 'registration_eligibility_rule': 1},
    ).sort('created_at', 1).limit(batch).to_list(batch)
    recovered = 0
    for attribution in rows:
        try:
            await record_registration_commission(
                db, attribution['user_id'],
                first_topup_qualified=attribution.get('registration_eligibility_rule') == 'first_topup',
            )
            fresh = await db.influencer_attributions.find_one(
                {'user_id': attribution['user_id'], 'registration_commission_checked_at': {'$exists': True}},
                {'_id': 1},
            )
            recovered += bool(fresh)
        except Exception:
            log.exception('Registration commission recovery failed user=%s', attribution.get('user_id'))
    return recovered


async def recover_pending_influencer_topups(db, limit: int = 100, now: datetime | None = None) -> int:
    """Re-run campaign rewards for verified, wallet-credited top-ups whose reward hook never finished.

    A processed session always leaves an `influencer_topup_events` row (qualifying or not), so a
    missing row means the hook was interrupted. Everything downstream is idempotent.
    """
    now = now or datetime.now(timezone.utc)
    batch = max(1, min(int(limit), 500))
    since = now - timedelta(days=365)
    attributed = await db.influencer_attributions.find(
        {'created_at': {'$gte': since}}, {'_id': 0, 'user_id': 1},
    ).sort('created_at', -1).limit(2000).to_list(2000)
    user_ids = [row['user_id'] for row in attributed if row.get('user_id')]
    if not user_ids:
        return 0
    payments = await db.payment_transactions.find(
        {'user_id': {'$in': user_ids}, 'kind': 'wallet_topup', 'payment_status': 'paid',
         'wallet_credited': True, 'credited_at': {'$gte': since}},
        {'_id': 0, 'session_id': 1, 'user_id': 1},
    ).sort('credited_at', 1).limit(batch * 4).to_list(batch * 4)
    sessions = [row['session_id'] for row in payments if row.get('session_id')]
    done = {row['session_id'] async for row in db.influencer_topup_events.find(
        {'session_id': {'$in': sessions}}, {'_id': 0, 'session_id': 1})}
    recovered = 0
    for payment in payments:
        session_id = payment.get('session_id')
        if not session_id or session_id in done:
            continue
        try:
            await record_topup_commission(db, payment['user_id'], session_id)
            recovered += 1
        except Exception:
            log.exception('Influencer top-up recovery failed session=%s', session_id)
        if recovered >= batch:
            break
    return recovered


async def record_topup_commission(db, user_id: str, session_id: str) -> list[dict]:
    """Create commission and user bonus records from a settled Stripe top-up."""
    payment = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0})
    if not payment or payment.get('payment_status') != 'paid' or payment.get('wallet_credited') is not True:
        return []
    if payment.get('user_id') != user_id:
        return []

    attribution = await db.influencer_attributions.find_one({'user_id': user_id}, {'_id': 0})
    if not attribution or not attribution.get('influencer_id'):
        return []
    influencer = await db.influencers.find_one(
        {'influencer_id': attribution['influencer_id'], 'status': 'active'}, {'_id': 0})
    promo = await db.influencer_promos.find_one(
        {'promo_id': attribution['promo_id'], 'active': True}, {'_id': 0})
    if not influencer or not promo:
        return []

    now = datetime.now(timezone.utc)
    starts_at = _utc(promo.get('starts_at'))
    expires_at = _utc(promo.get('expires_at'))
    if starts_at and now < starts_at or expires_at and now > expires_at:
        return []

    created_at = _utc(payment.get('created_at')) or datetime.now(timezone.utc)
    attributed_at = _utc(attribution.get('created_at'))
    window_days = max(1, min(int(promo.get('attribution_window_days') or 30), 365))
    if attributed_at and created_at > attributed_at + timedelta(days=window_days):
        return []

    received = int(payment.get('amount_received_pence') or payment.get('amount') or 0)
    refunded = min(received, int(payment.get('amount_refunded_pence') or 0))
    tax = min(received - refunded, int(payment.get('amount_tax_pence') or 0)) if promo.get('exclude_tax', True) else 0
    eligible_amount = max(0, received - refunded - tax)
    minimum = int(promo.get('topup_minimum_pence') or 0)
    rule = promo.get('topup_qualification', 'first_success')
    paid = await db.payment_transactions.find(
        {'user_id': user_id, 'payment_status': 'paid', 'wallet_credited': True,
         'created_at': {'$gte': attributed_at} if attributed_at else {'$exists': True}},
        {'_id': 0, 'session_id': 1, 'created_at': 1},
    ).sort([('created_at', 1), ('session_id', 1)]).limit(1000).to_list(1000)
    eligible_sessions = [row.get('session_id') for row in paid if row.get('session_id')]
    rank = eligible_sessions.index(session_id) + 1 if session_id in eligible_sessions else 0
    first_n = max(1, min(int(promo.get('topup_first_n') or 1), 100))
    rule_qualified = bool(rank) and not (rule == 'first_success' and rank != 1) and not (rule == 'first_n' and rank > first_n)
    qualifies = rule_qualified and eligible_amount >= minimum
    await db.influencer_topup_events.update_one(
        {'session_id': session_id},
        {'$setOnInsert': {
            'session_id': session_id, 'influencer_id': influencer['influencer_id'],
            'promo_id': promo['promo_id'], 'attribution_id': attribution['attribution_id'],
            'referral_ref': hashlib.sha256(user_id.encode('utf-8')).hexdigest()[:12],
            'amount_pence': eligible_amount, 'original_amount_pence': eligible_amount,
            'rank': rank, 'qualifies': qualifies, 'original_qualifies': qualifies,
            'campaign_snapshot': {
                'topup_minimum_pence': promo.get('topup_minimum_pence', 0),
                'topup_reward_mode': promo.get('topup_reward_mode', 'fixed'),
                'topup_reward_bps': promo.get('topup_reward_bps', 0),
                'topup_reward_tokens': promo.get('topup_reward_tokens', 0),
                'bonus_expiry_days': promo.get('bonus_expiry_days'),
            },
            'created_at': created_at,
        }}, upsert=True,
    )
    if not qualifies:
        return []

    if rule_qualified and promo.get('registration_eligibility') == 'first_topup':
        await record_registration_commission(db, user_id, first_topup_qualified=True)

    event = await _create_commission(
        db,
        event_key=f'topup:{session_id}',
        event_kind='topup',
        user_id=user_id,
        attribution=attribution,
        promo=promo,
        amount_pence=eligible_amount,
        payment_session_id=session_id,
    )
    await _grant_user_bonus(
        db, user_id=user_id, promo=promo,
        amount=_user_topup_reward(promo, eligible_amount),
        ref_key=f'influencer-topup:{session_id}', reason=f"Campaign {promo['code']} qualifying top-up reward",
        attribution=attribution)
    return [event] if event else []


async def reverse_payment_commissions(db, session_id: str, refunded_pence: int) -> int:
    """Recalculate commission liability after a verified cumulative Stripe refund."""
    payment = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0}) or {}
    received = max(0, int(payment.get('amount_received_pence') or payment.get('amount') or 0))
    if received <= 0:
        return 0
    refunded_pence = min(received, max(0, int(refunded_pence)))
    remaining_ratio = (received - refunded_pence) / received
    topup_event = await db.influencer_topup_events.find_one({'session_id': session_id}, {'_id': 0})
    promo = None
    if topup_event:
        promo = await db.influencer_promos.find_one({'promo_id': topup_event.get('promo_id')}, {'_id': 0})
        promo = {**(promo or {}), **(topup_event.get('campaign_snapshot') or {})}
        original_topup = int(topup_event.get('original_amount_pence') or topup_event.get('amount_pence') or 0)
        remaining_topup = int(original_topup * remaining_ratio + 0.5)
        qualifies = bool(topup_event.get('original_qualifies', topup_event.get('qualifies')))
        qualifies = qualifies and remaining_topup >= int(promo.get('topup_minimum_pence') or 0)
        await db.influencer_topup_events.update_one(
            {'session_id': session_id},
            {'$set': {'amount_pence': remaining_topup, 'refunded_amount_pence': refunded_pence,
                      'qualifies': qualifies}},
        )
        if not qualifies:
            target_reward = 0.0
        else:
            target_reward = _user_topup_reward(promo or {}, remaining_topup)
        if promo:
            await _reconcile_refunded_user_bonus(
                db, user_id=payment.get('user_id'), session_id=session_id, promo=promo,
                target_amount=target_reward, refunded_pence=refunded_pence,
            )

    rows = await db.influencer_commissions.find(
        {'payment_session_id': session_id, 'event_kind': {'$ne': 'refund_recovery'},
         'status': {'$in': ['pending', 'approved', 'payment_processing', 'paid']}},
        {'_id': 0, 'commission_id': 1, 'status': 1, 'promo_id': 1, 'influencer_id': 1,
         'attribution_id': 1, 'referred_user_id': 1, 'event_kind': 1, 'amount_pence': 1,
         'original_amount_pence': 1, 'amount_tokens': 1, 'original_amount_tokens': 1,
         'qualifying_amount_pence': 1, 'original_qualifying_amount_pence': 1,
         'token_grant_id': 1, 'token_grant_ids': 1},
    ).to_list(100)
    now = datetime.now(timezone.utc)
    changed = 0
    for row in rows:
        original_cash = int(row.get('original_amount_pence', row.get('amount_pence')) or 0)
        original_tokens = float(row.get('original_amount_tokens', row.get('amount_tokens')) or 0)
        original_topup = int(row.get('original_qualifying_amount_pence', row.get('qualifying_amount_pence')) or 0)
        revised_cash = int(original_cash * remaining_ratio + 0.5)
        revised_tokens = round(original_tokens * remaining_ratio, 2)
        revised_topup = int(original_topup * remaining_ratio + 0.5)
        is_reversed = revised_cash == 0 and revised_tokens == 0
        if row['status'] in ('payment_processing', 'paid'):
            recovery_key = f"refund-recovery:{row['commission_id']}"
            cash_recovery = original_cash - revised_cash
            token_recovery = round(original_tokens - revised_tokens, 2)
            if cash_recovery or token_recovery:
                await db.influencer_commissions.update_one(
                    {'event_key': recovery_key},
                    {'$setOnInsert': {
                        'commission_id': f"ic_{uuid.uuid4().hex}", 'event_key': recovery_key,
                        'event_kind': 'refund_recovery', 'influencer_id': row['influencer_id'],
                        'promo_id': row.get('promo_id'), 'attribution_id': row.get('attribution_id'),
                        'referred_user_id': row.get('referred_user_id'), 'payment_session_id': session_id,
                        'currency': 'GBP', 'created_at': now,
                    }, '$set': {
                        'amount_pence': -cash_recovery, 'amount_tokens': -token_recovery,
                        'qualifying_amount_pence': -int(original_topup * (1 - remaining_ratio) + 0.5),
                        'status': 'pending', 'reverses_commission_id': row['commission_id'],
                        'reversal_reason': 'Underlying Stripe payment refunded', 'refunded_amount_pence': refunded_pence,
                    }}, upsert=True,
                )
                changed += 1
            grant_ids = row.get('token_grant_ids') or ([row['token_grant_id']] if row.get('token_grant_id') else [])
            if grant_ids:
                from services.bonus_grants import revoke_grant
                for grant_id in grant_ids:
                    await revoke_grant(db, grant_id, 'payment-refund')
            continue

        result = await db.influencer_commissions.update_one(
            {'commission_id': row['commission_id'], 'status': row['status']},
            {'$set': {'status': 'reversed' if is_reversed else row['status'],
                      'amount_pence': revised_cash, 'original_amount_pence': original_cash,
                      'amount_tokens': revised_tokens, 'original_amount_tokens': original_tokens,
                      'qualifying_amount_pence': revised_topup,
                      'original_qualifying_amount_pence': original_topup,
                      'reversed_amount_pence': original_cash - revised_cash,
                      'reversed_at': now if is_reversed else None,
                      'reversal_reason': 'Underlying Stripe payment refunded' if is_reversed else None,
                      'refunded_amount_pence': refunded_pence}},
        )
        changed += result.modified_count
        released = max(0, int(row.get('amount_pence') or 0) - revised_cash)
        if released > 0 and row.get('promo_id'):
            await db.influencer_promos.update_one(
                {'promo_id': row['promo_id'], 'commission_reserved_pence': {'$gte': released}},
                {'$inc': {'commission_reserved_pence': -released}},
            )
    return changed


async def hold_payment_commissions(db, session_id: str, dispute_id: str) -> int:
    """Hold unsettled commissions while a Stripe dispute is unresolved."""
    rows = await db.influencer_commissions.find(
        {'payment_session_id': session_id, 'status': {'$in': ['pending', 'approved']}},
        {'_id': 0, 'commission_id': 1, 'status': 1},
    ).to_list(100)
    changed = 0
    for row in rows:
        result = await db.influencer_commissions.update_one(
            {'commission_id': row['commission_id'], 'status': row['status']},
            {'$set': {'status': 'on_hold', 'status_before_dispute': row['status'],
                      'stripe_dispute_id': dispute_id}},
        )
        changed += result.modified_count
    return changed


async def resolve_payment_dispute(db, session_id: str, dispute_id: str, outcome: str,
                                  amount_pence: int) -> int:
    """Restore held commissions on a won dispute or reverse them on a lost dispute."""
    if outcome not in ('won', 'lost'):
        return 0
    restored = 0
    async for row in db.influencer_commissions.find(
        {'payment_session_id': session_id, 'stripe_dispute_id': dispute_id, 'status': 'on_hold'},
        {'_id': 0, 'commission_id': 1, 'status_before_dispute': 1},
    ):
        previous = row.get('status_before_dispute')
        if previous not in ('pending', 'approved'):
            previous = 'pending'
        result = await db.influencer_commissions.update_one(
            {'commission_id': row['commission_id'], 'stripe_dispute_id': dispute_id, 'status': 'on_hold'},
            {'$set': {'status': previous}, '$unset': {'status_before_dispute': '', 'stripe_dispute_id': ''}},
        )
        restored += result.modified_count
    if outcome == 'won':
        await db.payment_transactions.update_one(
            {'session_id': session_id, 'stripe_dispute_id': dispute_id},
            {'$set': {'status': 'completed', 'payment_status': 'paid', 'dispute_status': 'won',
                      'dispute_resolved_at': datetime.now(timezone.utc)}},
        )
        return restored

    payment = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0}) or {}
    received = int(payment.get('amount_received_pence') or payment.get('amount') or amount_pence or 0)
    refunded = min(received, max(0, int(amount_pence or received)))
    await db.payment_transactions.update_one(
        {'session_id': session_id},
        {'$set': {'status': 'disputed_lost', 'payment_status': 'refunded',
                  'amount_refunded_pence': max(int(payment.get('amount_refunded_pence') or 0), refunded),
                  'dispute_status': 'lost', 'dispute_resolved_at': datetime.now(timezone.utc)}},
    )
    return restored + await reverse_payment_commissions(db, session_id, refunded)