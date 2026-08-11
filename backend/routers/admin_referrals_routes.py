"""
Prize League — Admin Referrals & Signup Bonuses dashboard.

READ-ONLY operational visibility.

This router does NOT:
- grant tokens
- complete referrals
- modify Stripe payments
- modify wallet balances
- modify contest entries

All rewards remain controlled by the verified production reward engine.
"""

from fastapi import APIRouter, Request

from auth import require_admin
from deps import get_db


router = APIRouter(
    prefix='/api/admin/referrals-bonuses',
    tags=['admin-referrals-bonuses'],
)


@router.get('')
async def admin_referrals_bonuses(request: Request):
    await require_admin(request)
    db = get_db()

    # ---------------------------------------------------------
    # Signup bonus users
    # ---------------------------------------------------------
    bonus_users = await db.users.find(
        {
            '$or': [
                {'signup_bonus_offer_eligible': True},
                {'signup_bonus_granted': True},
                {'qualifying_topup_completed': True},
            ]
        },
        {
            '_id': 0,
            'user_id': 1,
            'public_id': 1,
            'name': 1,
            'email': 1,
            'referral_code': 1,
            'referred_by': 1,
            'created_at': 1,

            'signup_bonus_offer_eligible': 1,
            'signup_bonus_granted': 1,
            'signup_bonus_granted_at': 1,
            'signup_bonus_tokens': 1,
            'signup_bonus_tx_id': 1,
            'signup_bonus_topup_session_id': 1,

            'qualifying_topup_completed': 1,
            'qualifying_topup_amount_gbp': 1,
            'qualifying_topup_at': 1,
            'qualifying_topup_session_id': 1,
        },
    ).sort('created_at', -1).limit(1000).to_list(1000)

    # ---------------------------------------------------------
    # Referral records
    # ---------------------------------------------------------
    referrals = await db.referrals.find(
        {},
        {'_id': 0},
    ).sort('created_at', -1).limit(1000).to_list(1000)

    user_ids = set()

    for ref in referrals:
        if ref.get('referrer_user_id'):
            user_ids.add(ref['referrer_user_id'])

        if ref.get('referred_user_id'):
            user_ids.add(ref['referred_user_id'])

    # Resolve safe user display data in one query.
    user_map = {}

    if user_ids:
        docs = await db.users.find(
            {'user_id': {'$in': list(user_ids)}},
            {
                '_id': 0,
                'user_id': 1,
                'public_id': 1,
                'name': 1,
                'email': 1,
                'referral_code': 1,
            },
        ).to_list(2000)

        user_map = {
            u['user_id']: u
            for u in docs
            if u.get('user_id')
        }

    for ref in referrals:
        referrer = user_map.get(ref.get('referrer_user_id'), {})
        referred = user_map.get(ref.get('referred_user_id'), {})

        ref['referrer_name'] = referrer.get('name')
        ref['referrer_email'] = referrer.get('email')
        ref['referrer_public_id'] = referrer.get('public_id')

        ref['referred_name'] = referred.get('name')
        ref['referred_email'] = referred.get('email')
        ref['referred_public_id'] = referred.get('public_id')

        if ref.get('reward_granted') or ref.get('status') == 'completed':
            ref['display_status'] = 'Rewarded'
        elif not ref.get('topup_qualified'):
            ref['display_status'] = 'Waiting for £10 top-up'
        elif not ref.get('contest_entered'):
            ref['display_status'] = 'Waiting for contest entry'
        else:
            ref['display_status'] = 'Processing reward'

    # ---------------------------------------------------------
    # Influencer programme
    # ---------------------------------------------------------
    from services.reward_program import (
        get_reward_settings,
        influencer_admin_snapshot,
    )

    reward_settings = await get_reward_settings(db)
    influencer = await influencer_admin_snapshot(db)

    # ---------------------------------------------------------
    # Summary
    # ---------------------------------------------------------
    signup_eligible = sum(
        1 for u in bonus_users
        if u.get('signup_bonus_offer_eligible')
    )

    signup_granted = sum(
        1 for u in bonus_users
        if u.get('signup_bonus_granted')
    )

    signup_waiting_topup = sum(
        1 for u in bonus_users
        if u.get('signup_bonus_offer_eligible')
        and not u.get('qualifying_topup_completed')
        and not u.get('signup_bonus_granted')
    )

    signup_qualified_processing = sum(
        1 for u in bonus_users
        if u.get('qualifying_topup_completed')
        and not u.get('signup_bonus_granted')
    )

    referral_rewarded = sum(
        1 for r in referrals
        if r.get('reward_granted') or r.get('status') == 'completed'
    )

    referral_waiting_topup = sum(
        1 for r in referrals
        if r.get('status') != 'completed'
        and not r.get('topup_qualified')
    )

    referral_waiting_contest = sum(
        1 for r in referrals
        if r.get('status') != 'completed'
        and r.get('topup_qualified')
        and not r.get('contest_entered')
    )

    referral_processing = sum(
        1 for r in referrals
        if r.get('status') != 'completed'
        and r.get('topup_qualified')
        and r.get('contest_entered')
        and not r.get('reward_granted')
    )

    total_signup_tokens = round(
        sum(
            float(u.get('signup_bonus_tokens') or 0)
            for u in bonus_users
            if u.get('signup_bonus_granted')
        ),
        2,
    )

    total_referral_tokens = round(
        sum(
            float(r.get('reward_tokens') or 0)
            for r in referrals
            if r.get('reward_granted')
        ),
        2,
    )

    return {
        'summary': {
            'signup_eligible': signup_eligible,
            'signup_granted': signup_granted,
            'signup_waiting_topup': signup_waiting_topup,
            'signup_qualified_processing': signup_qualified_processing,

            'referrals_total': len(referrals),
            'referral_rewarded': referral_rewarded,
            'referral_waiting_topup': referral_waiting_topup,
            'referral_waiting_contest': referral_waiting_contest,
            'referral_processing': referral_processing,

            'signup_tokens_granted': total_signup_tokens,
            'referral_tokens_granted': total_referral_tokens,
            'influencer_signups':
                influencer['summary']['influencer_signups'],

            'influencer_rewards_issued':
                influencer['summary']['influencer_rewards_issued'],

            'influencer_tokens_granted':
                influencer['summary']['influencer_tokens_granted'],

            'influencer_pending':
                influencer['summary']['influencer_pending'],

            'all_rewards_issued': (
                signup_granted
                + referral_rewarded
                + influencer['summary']['influencer_rewards_issued']
            ),

            'total_bonus_tokens_granted': round(
                total_signup_tokens
                + total_referral_tokens
                + influencer['summary']['influencer_tokens_granted'],
                2,
            ),
        },
        'signup_bonuses': bonus_users,
        'referrals': referrals,
        'influencer_promos': influencer['promos'],
        'influencer_attributions': influencer['attributions'],
        'reward_settings': reward_settings,
        'rules': {
            'minimum_wallet_topup_gbp': 5,
            'signup_qualifying_topup_gbp':
                reward_settings['signup_qualifying_topup_gbp'],
            'signup_bonus_tokens':
                reward_settings['signup_reward_tokens'],
            'referral_qualifying_topup_gbp':
                reward_settings['referral_qualifying_topup_gbp'],
            'referral_required_contest_entries':
                1 if reward_settings['referral_contest_entry_required'] else 0,
            'referral_reward_tokens':
                reward_settings['referral_reward_tokens'],
            'influencer_qualifying_topup_gbp':
                reward_settings['influencer_qualifying_topup_gbp'],
            'influencer_reward_tokens':
                reward_settings['influencer_reward_tokens'],
            'influencer_contest_entry_required':
                reward_settings['influencer_contest_entry_required'],
        },
    }
