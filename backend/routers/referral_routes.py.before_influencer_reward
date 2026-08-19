"""
Prize League referral + signup bonus programme.

Rules:
- Minimum normal wallet top-up remains £5.
- Signup bonus:
    New eligible user completes ONE verified Stripe top-up of £10+
    -> user receives 5 bonus tokens once.
- Referral:
    Referred user signs up with a valid referral code,
    completes ONE verified Stripe top-up of £10+,
    and successfully enters at least one contest
    -> referrer receives 5 bonus tokens once.

Rewards are server-driven only.
No free-ticket rewards.
No £5 fallback credit.
"""
from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request

from auth import get_current_user
from deps import get_db


router = APIRouter(prefix='/api/referrals', tags=['referrals'])

QUALIFYING_TOPUP_GBP = 10.0
SIGNUP_BONUS_TOKENS = 5.0
REFERRAL_REWARD_TOKENS = 5.0
PROGRAM_VERSION = 'tokens_v2'


async def _notify_reward(
    db,
    user_id: str,
    kind: str,
    title: str,
    body: str,
    ref_tx_id: str | None = None,
):
    from notifications import notify

    await notify(
        db,
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        ref_tx_id=ref_tx_id,
    )


async def _grant_signup_bonus_once(
    db,
    user_id: str,
    qualifying_session_id: str | None = None,
) -> bool:
    """
    Atomically claim and grant the 5-token signup bonus.

    Only accounts explicitly enrolled at registration are eligible.
    Existing legacy users are therefore not retroactively rewarded.
    """
    now = datetime.now(timezone.utc)

    claim = await db.users.find_one_and_update(
        {
            'user_id': user_id,
            'signup_bonus_offer_eligible': True,
            'signup_bonus_granted': {'$ne': True},
            'signup_bonus_processing': {'$ne': True},
        },
        {
            '$set': {
                'signup_bonus_processing': True,
                'signup_bonus_processing_at': now,
            }
        },
        return_document=True,
    )

    if not claim:
        return False

    try:
        from routers.wallet_routes import _apply_tx

        result = await _apply_tx(
            db,
            user_id,
            'signup_bonus',
            SIGNUP_BONUS_TOKENS,
            note='5-token signup bonus — verified £10+ Stripe top-up',
        )

        reward_tx = (result.get('tx') or {}).get('tx_id')

        await db.users.update_one(
            {'user_id': user_id},
            {
                '$set': {
                    'signup_bonus_granted': True,
                    'signup_bonus_granted_at': now,
                    'signup_bonus_tokens': SIGNUP_BONUS_TOKENS,
                    'signup_bonus_tx_id': reward_tx,
                    'signup_bonus_topup_session_id': qualifying_session_id,
                },
                '$unset': {
                    'signup_bonus_processing': '',
                    'signup_bonus_processing_at': '',
                },
            },
        )

        await _notify_reward(
            db,
            user_id,
            'signup_bonus',
            '🎉 5 signup bonus tokens added',
            'Your verified £10+ top-up qualified for the Prize League signup bonus.',
            reward_tx,
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
    Reward the referrer only when BOTH conditions are stored:

    1. referred user has a verified £10+ Stripe top-up
    2. referred user has successfully entered a contest
    """
    now = datetime.now(timezone.utc)

    ref = await db.referrals.find_one_and_update(
        {
            'referred_user_id': referred_user_id,
            'program_version': PROGRAM_VERSION,
            'status': 'pending',
            'topup_qualified': True,
            'contest_entered': True,
            'reward_granted': {'$ne': True},
            'reward_processing': {'$ne': True},
        },
        {
            '$set': {
                'reward_processing': True,
                'reward_processing_at': now,
            }
        },
        return_document=True,
    )

    if not ref:
        return False

    try:
        from routers.wallet_routes import _apply_tx

        result = await _apply_tx(
            db,
            ref['referrer_user_id'],
            'referral_bonus',
            REFERRAL_REWARD_TOKENS,
            note=f"5-token referral reward — referral {ref['referral_id']}",
        )

        reward_tx = (result.get('tx') or {}).get('tx_id')

        await db.referrals.update_one(
            {'referral_id': ref['referral_id']},
            {
                '$set': {
                    'status': 'completed',
                    'reward_granted': True,
                    'reward_tokens': REFERRAL_REWARD_TOKENS,
                    'reward_tx_id': reward_tx,
                    'completed_at': now,
                },
                '$unset': {
                    'reward_processing': '',
                    'reward_processing_at': '',
                },
            },
        )

        await _notify_reward(
            db,
            ref['referrer_user_id'],
            'referral_reward',
            '🎁 5 referral tokens added',
            'Your referred friend completed a verified £10+ top-up and entered their first contest.',
            reward_tx,
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
    Called only from the verified Stripe wallet-credit flow.

    £5 normal top-ups remain valid but do NOT qualify.
    Only ONE Stripe payment of £10+ qualifies.
    """
    amount_gbp = round(float(amount_gbp), 2)

    if amount_gbp < QUALIFYING_TOPUP_GBP:
        return {
            'qualifying': False,
            'amount_gbp': amount_gbp,
        }

    now = datetime.now(timezone.utc)

    # Save the verified qualifying payment against the account.
    await db.users.update_one(
        {'user_id': user_id},
        {
            '$set': {
                'qualifying_topup_completed': True,
                'qualifying_topup_amount_gbp': amount_gbp,
                'qualifying_topup_at': now,
                'qualifying_topup_session_id': session_id,
            }
        },
    )

    # Signup bonus is independent of referral participation.
    await _grant_signup_bonus_once(
        db,
        user_id,
        qualifying_session_id=session_id,
    )

    # If this account was referred, record the referral milestone.
    await db.referrals.update_one(
        {
            'referred_user_id': user_id,
            'program_version': PROGRAM_VERSION,
            'status': 'pending',
        },
        {
            '$set': {
                'topup_qualified': True,
                'topup_qualified_at': now,
                'topup_amount_gbp': amount_gbp,
                'topup_session_id': session_id,
            }
        },
    )

    # Handles either order of events:
    # top-up first or contest entry first.
    await _complete_referral_if_eligible(db, user_id)

    return {
        'qualifying': True,
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


async def _sync_current_user(db, user_id: str):
    """
    Safe recovery check.

    If a webhook/reward hook was temporarily interrupted, opening the
    referral page can reconstruct eligibility from VERIFIED database facts.
    """
    user = await db.users.find_one(
        {'user_id': user_id},
        {
            '_id': 0,
            'signup_bonus_offer_eligible': 1,
        },
    )

    if user and user.get('signup_bonus_offer_eligible'):
        payment = await db.payment_transactions.find_one(
            {
                'user_id': user_id,
                'kind': 'wallet_topup',
                'payment_status': 'paid',
                'wallet_credited': True,
                'amount': {'$gte': int(QUALIFYING_TOPUP_GBP * 100)},
            },
            {'_id': 0},
            sort=[('credited_at', 1)],
        )

        if payment:
            await record_verified_topup(
                db,
                user_id,
                round(payment['amount'] / 100.0, 2),
                payment.get('session_id'),
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

    return {
        'code': code,
        'link_path': f"/login?tab=signup&ref={code}",
        'completed': completed,
        'pending': pending,
        'tokens_earned': tokens_earned,

        'signup_bonus': {
            'eligible': bool((full or {}).get('signup_bonus_offer_eligible')),
            'required_topup_gbp': QUALIFYING_TOPUP_GBP,
            'reward_tokens': SIGNUP_BONUS_TOKENS,
            'topup_completed': bool((full or {}).get('qualifying_topup_completed')),
            'granted': bool((full or {}).get('signup_bonus_granted')),
            'granted_at': (full or {}).get('signup_bonus_granted_at'),
        },

        'my_referral_status': my_invitation,
    }


@router.get('/list')
async def list_my_referrals(request: Request):
    user = await get_current_user(request)
    db = get_db()

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

            if r.get('status') == 'completed':
                r['display_status'] = 'Rewarded'
            elif not r.get('topup_qualified'):
                r['display_status'] = 'Waiting for £10 top-up'
            elif not r.get('contest_entered'):
                r['display_status'] = 'Waiting for contest entry'
            else:
                r['display_status'] = 'Processing reward'

    return {
        'referrals': refs,
        'requirements': {
            'topup_gbp': QUALIFYING_TOPUP_GBP,
            'contest_entries': 1,
            'reward_tokens': REFERRAL_REWARD_TOKENS,
        },
    }


@router.post('/complete')
async def complete_referral(request: Request):
    """
    Legacy endpoint intentionally disabled.

    Referral rewards are now generated automatically by verified backend
    events and cannot be triggered by the browser.
    """
    await get_current_user(request)

    raise HTTPException(
        status_code=410,
        detail='Referral rewards are automatic after a verified £10+ top-up and first contest entry.',
    )
