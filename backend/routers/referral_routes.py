"""
Prize League referral + signup bonus programme.

Every threshold, reward amount, expiry and the contest-entry requirement comes from the
saved reward settings (services.reward_program) or from the terms snapshotted onto the
user / referral when they became eligible (services.offer_terms). Nothing is hardcoded.

Rewards are server-driven only: triggered by VERIFIED Stripe payments and paid orders,
with idempotent wallet grants so webhook retries, refreshes and concurrent requests
cannot credit twice.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request

from auth import get_current_user
from deps import get_db
from services.offer_terms import (
    expiry_from_terms, public_offer, referral_progress, referral_terms,
    signup_conditions_text, signup_terms,
)
from services.reward_program import get_reward_settings, resolve_acquisition_program


router = APIRouter(prefix='/api/referrals', tags=['referrals'])

PROGRAM_VERSION = 'tokens_v2'
LOCK_TTL = timedelta(minutes=5)  # a crashed worker's claim becomes retryable after this

logger = logging.getLogger(__name__)


async def _grant_normal_topup_bonus_once(db, user_id: str, amount_gbp: float, session_id: str | None) -> bool:
    """Grant an enrolled Normal user's configured top-up promotion once per qualifying payment."""
    if not session_id or await resolve_acquisition_program(db, user_id) != 'normal':
        return False
    user = await db.users.find_one({'user_id': user_id}, {'_id': 0, 'normal_topup_offer_terms': 1}) or {}
    terms = user.get('normal_topup_offer_terms')
    if not terms or not terms.get('enabled') or amount_gbp < float(terms.get('minimum_gbp') or 0):
        return False

    ref_key = f'normal-topup:{user_id}:{session_id}'
    if terms.get('first_only'):
        existing = await db.bonus_grants.find_one({'user_id': user_id, 'source': 'normal_topup'},
                                                   {'_id': 0, 'ref_key': 1})
        if existing and existing.get('ref_key') != ref_key:
            return False
        now = datetime.now(timezone.utc)
        claim = await db.users.find_one_and_update(
            {'user_id': user_id, '$or': [
                {'normal_topup_bonus_claimed_session_id': session_id},
                {'normal_topup_bonus_claimed_session_id': {'$exists': False}},
            ]},
            {'$set': {'normal_topup_bonus_claimed_session_id': session_id,
                      'normal_topup_bonus_processing_at': now}},
            return_document=True,
        )
        if not claim:
            return False

    from services.bonus_grants import create_grant
    from services.offer_terms import TOPUP_TOKENS_PER_GBP
    base_tokens = round(float(amount_gbp) * TOPUP_TOKENS_PER_GBP, 2)
    amount = (round(base_tokens * float(terms.get('reward_percent') or 0) / 100, 2)
              if terms.get('mode') == 'percentage' else round(float(terms.get('reward_tokens') or 0), 2))
    if amount <= 0:
        return False
    try:
        await create_grant(
            db, user_id=user_id, amount=amount, expires_at=expiry_from_terms(terms),
            actor_id='normal-topup-promo-system', actor_email='Prize League',
            reason=f'Normal top-up promotion for verified payment {session_id}',
            ref_key=ref_key, source='normal_topup',
        )
        await db.users.update_one({'user_id': user_id, 'normal_topup_bonus_claimed_session_id': session_id},
                                  {'$unset': {'normal_topup_bonus_processing_at': ''}})
        return True
    except Exception:
        await db.users.update_one({'user_id': user_id, 'normal_topup_bonus_claimed_session_id': session_id},
                                  {'$unset': {'normal_topup_bonus_processing_at': ''}})
        raise


async def _grant_signup_bonus_once(
    db,
    user_id: str,
    qualifying_session_id: str | None = None,
) -> bool:
    """
    Atomically claim and grant the signup bonus using the terms stored when the account
    was enrolled (current saved terms for accounts enrolled before versioning).

    Only accounts explicitly enrolled at registration are eligible, so legacy users are
    never retroactively rewarded. A disabled offer grants nothing.
    """
    now = datetime.now(timezone.utc)
    settings = await get_reward_settings(db)

    # Influencer-attributed and unresolved accounts never receive the normal signup bonus.
    if await resolve_acquisition_program(db, user_id) != 'normal':
        return False

    claim = await db.users.find_one_and_update(
        {
            'user_id': user_id,
            'signup_bonus_offer_eligible': True,
            'signup_bonus_granted': {'$ne': True},
            '$or': [
                {'signup_bonus_processing': {'$ne': True}},
                {'signup_bonus_processing_at': {'$lt': now - LOCK_TTL}},
            ],
        },
        {'$set': {'signup_bonus_processing': True, 'signup_bonus_processing_at': now}},
        return_document=True,
    )

    if not claim:
        return False

    try:
        terms = claim.get('signup_offer_terms') or signup_terms(settings)
        if not terms.get('enabled', True):
            await db.users.update_one({'user_id': user_id}, {'$unset': {
                'signup_bonus_processing': '', 'signup_bonus_processing_at': '',
            }})
            return False
        signup_reward_tokens = round(float(terms['reward_tokens']), 2)
        reward_tx = None

        if signup_reward_tokens > 0:
            from services.bonus_grants import create_grant

            grant = await create_grant(
                db, user_id=user_id, amount=signup_reward_tokens,
                expires_at=expiry_from_terms(terms, now),
                actor_id='signup-reward-system', actor_email='Prize League',
                reason='Verified qualifying Stripe top-up signup reward',
                ref_key=f'signup_reward:{user_id}', source='signup',
            )
            reward_tx = next(iter(grant.get('related_tx_ids') or []), None)

        await db.users.update_one(
            {'user_id': user_id},
            {
                '$set': {
                    'signup_bonus_granted': True,
                    'signup_bonus_granted_at': now,
                    'signup_bonus_tokens': signup_reward_tokens,
                    'signup_bonus_tx_id': reward_tx,
                    'signup_bonus_topup_session_id': qualifying_session_id,
                    'signup_bonus_offer_version': terms.get('offer_version'),
                    'signup_offer_terms': terms,
                },
                '$unset': {
                    'signup_bonus_processing': '',
                    'signup_bonus_processing_at': '',
                },
            },
        )

        return True

    except Exception:
        await db.users.update_one(
            {'user_id': user_id},
            {
                '$unset': {
                    'signup_bonus_processing': '',
                    'signup_bonus_processing_at': '',
                }
            },
        )
        raise


async def _complete_referral_if_eligible(db, referred_user_id: str) -> bool:
    """
    Reward the referrer (and optionally the referred user) once every condition in the
    referral's own terms is stored: a verified qualifying top-up and, when that snapshot
    requires it, a contest entry. A disabled offer grants nothing.
    """
    now = datetime.now(timezone.utc)
    settings = await get_reward_settings(db)
    if await resolve_acquisition_program(db, referred_user_id) != 'normal':
        return False

    candidate = await db.referrals.find_one(
        {
            'referred_user_id': referred_user_id,
            'program_version': PROGRAM_VERSION,
            'status': 'pending',
            'topup_qualified': True,
            'reward_granted': {'$ne': True},
        },
        {'_id': 0},
    )
    if not candidate:
        return False

    terms = candidate.get('offer_terms') or referral_terms(settings)
    if not terms.get('enabled', True):
        return False
    if terms.get('contest_entry_required') and not candidate.get('contest_entered'):
        return False

    ref = await db.referrals.find_one_and_update(
        {
            'referral_id': candidate['referral_id'],
            'status': 'pending',
            'reward_granted': {'$ne': True},
            '$or': [
                {'reward_processing': {'$ne': True}},
                {'reward_processing_at': {'$lt': now - LOCK_TTL}},
            ],
        },
        {'$set': {'reward_processing': True, 'reward_processing_at': now}},
        return_document=True,
    )

    if not ref:
        return False

    try:
        from services.bonus_grants import create_grant

        expires_at = expiry_from_terms(terms, now)
        referral_reward_tokens = round(float(terms['referrer_reward_tokens']), 2)
        referred_tokens = round(float(terms.get('referred_reward_tokens') or 0), 2)
        reward_tx = referred_tx = None

        if referral_reward_tokens > 0:
            grant = await create_grant(
                db, user_id=ref['referrer_user_id'], amount=referral_reward_tokens, expires_at=expires_at,
                actor_id='referral-reward-system', actor_email='Prize League',
                reason=f"Qualified referral reward {ref['referral_id']}",
                ref_key=f"referral_reward:{ref['referral_id']}", source='referral',
            )
            reward_tx = next(iter(grant.get('related_tx_ids') or []), None)

        if referred_tokens > 0:
            grant = await create_grant(
                db, user_id=ref['referred_user_id'], amount=referred_tokens, expires_at=expires_at,
                actor_id='referral-reward-system', actor_email='Prize League',
                reason=f"Referral welcome reward {ref['referral_id']}",
                ref_key=f"referral_referred_reward:{ref['referral_id']}", source='referral',
            )
            referred_tx = next(iter(grant.get('related_tx_ids') or []), None)

        await db.referrals.update_one(
            {'referral_id': ref['referral_id']},
            {
                '$set': {
                    'status': 'completed',
                    'reward_granted': True,
                    'reward_tokens': referral_reward_tokens,
                    'reward_tx_id': reward_tx,
                    'referred_reward_tokens': referred_tokens,
                    'referred_reward_tx_id': referred_tx,
                    'offer_terms': terms,
                    'offer_version': terms.get('offer_version'),
                    'completed_at': now,
                },
                '$unset': {
                    'reward_processing': '',
                    'reward_processing_at': '',
                },
            },
        )

        return True

    except Exception:
        await db.referrals.update_one(
            {'referral_id': ref['referral_id']},
            {
                '$unset': {
                    'reward_processing': '',
                    'reward_processing_at': '',
                }
            },
        )
        raise


async def record_verified_topup(
    db,
    user_id: str,
    amount_gbp: float,
    session_id: str | None = None,
):
    """
    Called only from the verified Stripe wallet-credit flow (and its recovery).

    Each programme compares the payment with ITS OWN terms; only the first qualifying
    payment is recorded against an account and later payments never overwrite it.
    """
    amount_gbp = round(float(amount_gbp), 2)
    settings = await get_reward_settings(db)
    now = datetime.now(timezone.utc)

    user = await db.users.find_one(
        {'user_id': user_id},
        {'_id': 0, 'signup_bonus_offer_eligible': 1, 'signup_bonus_granted': 1, 'signup_offer_terms': 1},
    ) or {}
    signup_in_force = user.get('signup_offer_terms') or signup_terms(settings)
    program = await resolve_acquisition_program(db, user_id)
    signup_qualified = bool(
        program == 'normal'
        and user.get('signup_bonus_offer_eligible')
        and not user.get('signup_bonus_granted')
        and amount_gbp >= float(signup_in_force['qualifying_topup_gbp'])
    )

    referral = await db.referrals.find_one(
        {'referred_user_id': user_id, 'program_version': PROGRAM_VERSION, 'status': 'pending'},
        {'_id': 0},
    )
    referral_in_force = (referral or {}).get('offer_terms') or referral_terms(settings)
    referral_qualified = bool(
        program == 'normal' and referral and amount_gbp >= float(referral_in_force['qualifying_topup_gbp'])
    )

    if signup_qualified:
        await db.users.update_one(
            {'user_id': user_id, 'qualifying_topup_completed': {'$ne': True}},
            {
                '$set': {
                    'qualifying_topup_completed': True,
                    'qualifying_topup_amount_gbp': amount_gbp,
                    'qualifying_topup_at': now,
                    'qualifying_topup_session_id': session_id,
                }
            },
        )
        await _grant_signup_bonus_once(db, user_id, qualifying_session_id=session_id)

    normal_topup_bonus_qualified = False
    if program == 'normal':
        normal_topup_bonus_qualified = await _grant_normal_topup_bonus_once(
            db, user_id, amount_gbp, session_id,
        )

    if referral_qualified:
        await db.referrals.update_one(
            {'referral_id': referral['referral_id'], 'status': 'pending', 'topup_qualified': {'$ne': True}},
            {
                '$set': {
                    'topup_qualified': True,
                    'topup_qualified_at': now,
                    'topup_amount_gbp': amount_gbp,
                    'topup_session_id': session_id,
                }
            },
        )
        # Handles either order of events: top-up first or contest entry first.
        await _complete_referral_if_eligible(db, user_id)

    # Influencer qualification has its own per-code threshold and uses the same VERIFIED event.
    try:
        from services.reward_program import record_influencer_topup

        await record_influencer_topup(db, user_id, amount_gbp, session_id)
    except Exception:
        logger.exception('Influencer top-up qualification failed user=%s session=%s', user_id, session_id)

    return {
        'qualifying': bool(signup_qualified or referral_qualified or normal_topup_bonus_qualified),
        'signup_qualified': signup_qualified,
        'normal_topup_bonus_qualified': normal_topup_bonus_qualified,
        'referral_qualified': referral_qualified,
        'program': program,
        'amount_gbp': amount_gbp,
    }


async def record_contest_entry(
    db,
    user_id: str,
    order_id: str | None = None,
):
    """
    Called only after checkout successfully creates the paid order/tickets.
    """
    now = datetime.now(timezone.utc)

    await db.referrals.update_one(
        {
            'referred_user_id': user_id,
            'program_version': PROGRAM_VERSION,
            'status': 'pending',
            'contest_entered': {'$ne': True},
        },
        {
            '$set': {
                'contest_entered': True,
                'contest_entered_at': now,
                'first_contest_order_id': order_id,
            }
        },
    )

    await _complete_referral_if_eligible(db, user_id)

    # Influencer qualification uses the same successful contest-entry event.
    try:
        from services.reward_program import record_influencer_contest_entry

        await record_influencer_contest_entry(db, user_id, order_id)
    except Exception:
        logger.exception('Influencer contest-entry qualification failed user=%s order=%s', user_id, order_id)


async def _sync_current_user(db, user_id: str):
    """
    Safe recovery check.

    If a webhook/reward hook was interrupted, opening the referral page re-evaluates
    VERIFIED payments (paid and wallet-credited) and paid orders against the stored
    terms. Re-running is harmless because every step is idempotent.
    """
    user = await db.users.find_one({'user_id': user_id}, {
        '_id': 0, 'signup_bonus_offer_eligible': 1, 'normal_topup_offer_terms': 1,
    })
    program = await resolve_acquisition_program(db, user_id)
    pending_referral = await db.referrals.find_one(
        {'referred_user_id': user_id, 'program_version': PROGRAM_VERSION, 'status': 'pending'},
        {'_id': 1},
    )

    if program == 'influencer':
        # Re-run campaign top-up rewards for verified payments whose hook was interrupted; idempotent.
        from services.influencer_commissions import record_topup_commission, record_registration_commission
        await record_registration_commission(db, user_id)
        payments = await db.payment_transactions.find(
            {'user_id': user_id, 'kind': 'wallet_topup', 'payment_status': 'paid', 'wallet_credited': True},
            {'_id': 0, 'session_id': 1},
        ).sort('credited_at', 1).limit(25).to_list(25)
        for payment in payments:
            if payment.get('session_id'):
                await record_topup_commission(db, user_id, payment['session_id'])

    normal_topup_terms = (user or {}).get('normal_topup_offer_terms') or {}
    if ((program == 'normal' and user and (user.get('signup_bonus_offer_eligible')
          or normal_topup_terms.get('enabled'))) or pending_referral or program == 'influencer'):
        payments = await db.payment_transactions.find(
            {'user_id': user_id, 'kind': 'wallet_topup', 'payment_status': 'paid', 'wallet_credited': True},
            {'_id': 0},
        ).sort('credited_at', 1).limit(25).to_list(25)

        for payment in payments:
            await record_verified_topup(
                db, user_id, round(payment['amount'] / 100.0, 2), payment.get('session_id'),
            )

    ref = await db.referrals.find_one(
        {
            'referred_user_id': user_id,
            'program_version': PROGRAM_VERSION,
            'status': 'pending',
        },
        {'_id': 0},
    )

    if ref:
        order = await db.orders.find_one(
            {
                'user_id': user_id,
                'status': 'paid',
            },
            {'_id': 0, 'order_id': 1},
            sort=[('created_at', 1)],
        )

        if order:
            await record_contest_entry(
                db,
                user_id,
                order.get('order_id'),
            )


@router.get('/me')
async def my_referral(request: Request):
    user = await get_current_user(request)
    db = get_db()

    await _sync_current_user(db, user['user_id'])
    settings = await get_reward_settings(db)

    full = await db.users.find_one(
        {'user_id': user['user_id']},
        {
            '_id': 0,
            'referral_code': 1,
            'name': 1,
            'signup_bonus_offer_eligible': 1,
            'signup_bonus_granted': 1,
            'signup_bonus_granted_at': 1,
            'signup_bonus_tokens': 1,
            'signup_bonus_tx_id': 1,
            'signup_offer_terms': 1,
            'qualifying_topup_completed': 1,
            'qualifying_topup_amount_gbp': 1,
        },
    )

    code = (full or {}).get('referral_code')

    if not code:
        import uuid

        code = uuid.uuid4().hex[:8].upper()

        await db.users.update_one(
            {'user_id': user['user_id']},
            {'$set': {'referral_code': code}},
        )

    completed = await db.referrals.count_documents({
        'referrer_user_id': user['user_id'],
        'program_version': PROGRAM_VERSION,
        'status': 'completed',
    })

    pending = await db.referrals.count_documents({
        'referrer_user_id': user['user_id'],
        'program_version': PROGRAM_VERSION,
        'status': 'pending',
    })

    rewarded = await db.referrals.find(
        {
            'referrer_user_id': user['user_id'],
            'program_version': PROGRAM_VERSION,
            'reward_granted': True,
        },
        {'_id': 0, 'reward_tokens': 1},
    ).to_list(500)

    tokens_earned = round(
        sum(float(r.get('reward_tokens') or 0) for r in rewarded),
        2,
    )

    my_invitation = await db.referrals.find_one(
        {
            'referred_user_id': user['user_id'],
            'program_version': PROGRAM_VERSION,
        },
        {'_id': 0},
    )

    if my_invitation:
        my_invitation = {**my_invitation, **referral_progress(my_invitation, settings)}

    own_terms = (full or {}).get('signup_offer_terms') or signup_terms(settings)
    eligible = bool((full or {}).get('signup_bonus_offer_eligible'))
    granted = bool((full or {}).get('signup_bonus_granted'))

    from services.promo_status import user_promotion_status
    promotion = await user_promotion_status(db, user['user_id'])
    influencer_exclusive = bool(promotion and promotion['acquisition_type'] == 'influencer')
    if influencer_exclusive:
        eligible = False

    return {
        'code': code,
        'link_path': f"/login?tab=signup&ref={code}",
        'completed': completed,
        'pending': pending,
        'tokens_earned': tokens_earned,
        'offer': public_offer(settings),
        'promotion': promotion and {
            k: promotion[k] for k in (
                'acquisition_type', 'stacking_rule', 'influencer_name', 'promo_code', 'campaign_name', 'campaign',
                'signup_bonus_status', 'topup_bonus_status', 'signup_pending_condition', 'topup_pending_condition',
                'influencer_bonus_tokens_issued', 'bonus_expiry', 'blocked_reason', 'campaign_active',
                'influencer_topup_event_count', 'next_influencer_topup_rank', 'normal_topup_promo',
                'normal_topup_bonus_tokens_issued', 'normal_bonus_tokens_issued')
        },

        'signup_bonus': {
            'eligible': eligible,
            'required_topup_gbp': None if influencer_exclusive else own_terms['qualifying_topup_gbp'],
            'reward_tokens': None if influencer_exclusive else own_terms['reward_tokens'],
            'expiry_days': own_terms.get('expiry_days'),
            'offer_version': own_terms.get('offer_version'),
            'offer_enabled': bool(own_terms.get('enabled', True)),
            'conditions_text': signup_conditions_text(own_terms) if eligible and not granted else None,
            'topup_completed': bool((full or {}).get('qualifying_topup_completed')),
            'granted': granted,
            'granted_at': (full or {}).get('signup_bonus_granted_at'),
            'credited_tokens': (full or {}).get('signup_bonus_tokens') if granted else None,
            'tx_id': (full or {}).get('signup_bonus_tx_id') if granted else None,
        },

        'my_referral_status': my_invitation,
    }


@router.get('/list')
async def list_my_referrals(request: Request):
    user = await get_current_user(request)
    db = get_db()
    settings = await get_reward_settings(db)

    refs = await db.referrals.find(
        {
            'referrer_user_id': user['user_id'],
            'program_version': PROGRAM_VERSION,
        },
        {'_id': 0},
    ).sort('created_at', -1).limit(100).to_list(100)

    referred_ids = [r['referred_user_id'] for r in refs]

    if referred_ids:
        users = await db.users.find(
            {'user_id': {'$in': referred_ids}},
            {
                '_id': 0,
                'user_id': 1,
                'email': 1,
                'name': 1,
                'public_id': 1,
            },
        ).to_list(200)

        umap = {u['user_id']: u for u in users}

        for r in refs:
            u = umap.get(r['referred_user_id'], {})

            r['referred_email'] = u.get('email')
            r['referred_name'] = u.get('name')
            r['referred_public_id'] = u.get('public_id')

    for r in refs:
        r.update(referral_progress(r, settings))

    terms = referral_terms(settings)
    return {
        'referrals': refs,
        'offer': public_offer(settings),
        'requirements': {
            'topup_gbp': terms['qualifying_topup_gbp'],
            'contest_entries': 1 if terms['contest_entry_required'] else 0,
            'reward_tokens': terms['referrer_reward_tokens'],
            'referred_reward_tokens': terms['referred_reward_tokens'],
        },
    }


@router.post('/complete')
async def complete_referral(request: Request):
    """
    Legacy endpoint intentionally disabled.

    Referral rewards are generated automatically by verified backend events and
    cannot be triggered by the browser.
    """
    await get_current_user(request)

    raise HTTPException(
        status_code=410,
        detail='Referral rewards are automatic once the conditions in the active offer are met.',
    )
