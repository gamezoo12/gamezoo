"""Unified signup / referral / top-up offer programme. Writes only to a DB_NAME containing 'test'."""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from deps import _mongo_url, _sanitize_db_name
from models import Referral
from routers import offer_routes
from routers.referral_routes import (
    _complete_referral_if_eligible, _grant_signup_bonus_once, _sync_current_user, grant_zero_threshold_signup_bonus, record_contest_entry,
    record_verified_topup,
)
from services.offer_terms import (
    legal_flags, public_offer, referral_enrollment, referral_progress, signup_enrollment, topup_preview,
)
from services.reward_program import get_reward_settings, save_reward_settings


def run_db(target, fn):
    async def run():
        client = AsyncIOMotorClient(target['url'])
        try:
            return await fn(client[target['name']])
        finally:
            client.close()
    return asyncio.run(run())


@pytest.fixture(scope='module')
def safe_db():
    name = os.environ.get('DB_NAME', '')
    if 'test' not in name.lower():
        pytest.skip('Integration test requires a DB_NAME containing "test"')
    return {'url': _mongo_url, 'name': _sanitize_db_name(name)}


@pytest.fixture
def tag(safe_db):
    """Unique prefix; the shared settings document and this tag's rows are removed afterwards."""
    t = 'offer_' + uuid.uuid4().hex[:8]

    async def reset(db):
        await db.reward_settings.delete_one({'_id': 'app'})
    run_db(safe_db, reset)
    yield t

    async def cleanup(db):
        await db.reward_settings.delete_one({'_id': 'app'})
        like = {'$regex': f'^{t}'}
        await db.users.delete_many({'user_id': like})
        await db.referrals.delete_many({'referred_user_id': like})
        await db.wallets.delete_many({'user_id': like})
        await db.wallet_tx.delete_many({'user_id': like})
        await db.bonus_grants.delete_many({'user_id': like})
        await db.payment_transactions.delete_many({'user_id': like})
        await db.notifications.delete_many({'user_id': like})
    run_db(safe_db, cleanup)


async def enrolled_user(db, uid):
    await db.users.insert_one({'user_id': uid, 'email': f'{uid}@example.test', 'name': uid, 'role': 'user',
                               **await signup_enrollment(db)})


async def referral_pair(db, tag, name='a'):
    referrer, referred = f'{tag}_{name}_referrer', f'{tag}_{name}_referred'
    await db.users.insert_one({'user_id': referrer, 'email': f'{referrer}@example.test', 'role': 'user'})
    await enrolled_user(db, referred)
    referral = Referral(referrer_user_id=referrer, referred_user_id=referred, code='CODE', **await referral_enrollment(db))
    await db.referrals.insert_one(referral.model_dump())
    return referrer, referred


async def bonus(db, uid):
    wallet = await db.wallets.find_one({'user_id': uid}, {'_id': 0}) or {}
    return round(float(wallet.get('bonus') or 0), 2)


def utc(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def test_saving_changes_bumps_version_records_history_and_noop_does_not(safe_db, tag):
    async def run(db):
        first = await get_reward_settings(db)
        assert first['offer_version'] == 1
        saved = await save_reward_settings(db, {'signup_qualifying_topup_gbp': 7.5})
        assert saved['offer_version'] == 2 and saved['offer_effective_from'] is not None
        again = await save_reward_settings(db, {'signup_qualifying_topup_gbp': 7.5})
        assert again['offer_version'] == 2
        history = await db.reward_settings_history.find({'offer_version': 2}).to_list(5)
        assert history and history[-1]['changes']['signup_qualifying_topup_gbp'] == {'from': 10.0, 'to': 7.5}
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_zero_threshold_signup_grants_once_without_topup(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'signup_qualifying_topup_gbp': 0, 'signup_reward_tokens': 5})
        uid = f'{tag}_zero'
        await enrolled_user(db, uid)
        assert await grant_zero_threshold_signup_bonus(db, uid) is True
        await _sync_current_user(db, uid)
        assert await grant_zero_threshold_signup_bonus(db, uid) is False
        user = await db.users.find_one({'user_id': uid})
        assert user['signup_bonus_granted'] is True and user['signup_bonus_tokens'] == 5
        assert not user.get('qualifying_topup_completed') and not user.get('signup_bonus_topup_session_id')
        assert await bonus(db, uid) == 5
        assert await db.bonus_grants.count_documents({'user_id': uid, 'source': 'signup'}) == 1
        assert await db.payment_transactions.count_documents({'user_id': uid}) == 0
        assert await db.wallet_tx.count_documents({'user_id': uid, 'kind': 'topup'}) == 0
        offer = public_offer(await get_reward_settings(db))
        assert 'no top-up is required' in offer['signup']['text']
        assert topup_preview(await get_reward_settings(db), 10)['signup_bonus']['tokens'] == 0

        recovery = f'{tag}_recovery'
        await enrolled_user(db, recovery)
        await _sync_current_user(db, recovery)
        await _sync_current_user(db, recovery)
        assert await bonus(db, recovery) == 5
        assert await db.bonus_grants.count_documents({'user_id': recovery, 'source': 'signup'}) == 1

        locked = f'{tag}_processing'
        await enrolled_user(db, locked)
        await db.users.update_one({'user_id': locked}, {'$set': {
            'signup_bonus_processing': True, 'signup_bonus_processing_at': datetime.now(timezone.utc)}})
        assert (await record_verified_topup(db, locked, 10, 'cs_concurrent'))['signup_qualified'] is False
        assert not (await db.users.find_one({'user_id': locked})).get('qualifying_topup_completed')
        await db.users.update_one({'user_id': locked}, {'$unset': {'signup_bonus_processing': '', 'signup_bonus_processing_at': ''}})
        await _sync_current_user(db, locked)
        assert await bonus(db, locked) == 5

        blocked = f'{tag}_influencer'
        await enrolled_user(db, blocked)
        await db.users.update_one({'user_id': blocked}, {'$set': {'acquisition_type': 'influencer_pending'}})
        assert await grant_zero_threshold_signup_bonus(db, blocked) is False
        assert await bonus(db, blocked) == 0

        disabled = f'{tag}_disabled'
        await save_reward_settings(db, {'signup_offer_enabled': False})
        await enrolled_user(db, disabled)
        assert await grant_zero_threshold_signup_bonus(db, disabled) is False
        assert await bonus(db, disabled) == 0
    run_db(safe_db, run)


def test_zero_threshold_granted_during_email_and_google_signup(safe_db, tag, monkeypatch):
    async def run(db):
        import deps
        import otp_verify
        from models import RegisterInput
        from routers import auth_routes

        async def return_phone(phone, _code):
            return phone

        async def verify_email(*_args):
            return None

        async def public_id(_db):
            return f'PL{tag}'

        async def contest(*_args):
            return 1

        monkeypatch.setattr(deps, 'get_db', lambda: db)
        monkeypatch.setattr(otp_verify, 'verify_twilio_email_otp', verify_email)
        monkeypatch.setattr(auth_routes, '_verify_twilio_otp', return_phone)
        monkeypatch.setattr(auth_routes, 'allocate_user_public_id', public_id)
        monkeypatch.setattr(auth_routes, '_world_signup_contest', contest)
        monkeypatch.setattr(auth_routes, 'hash_password', lambda _password: 'test-hash')
        await save_reward_settings(db, {'signup_qualifying_topup_gbp': 0, 'signup_reward_tokens': 5})

        email = f'{tag}@example.com'
        registered = await auth_routes.register(RegisterInput(
            email=email, password='Password123!', name='Test Player', phone='+15550001234',
            otp_code='000000', email_otp_code='000000', accept_terms=True, dob='2000-08-02'), None)
        email_id = registered['user']['user_id']
        try:
            assert await bonus(db, email_id) == 5
            assert await db.bonus_grants.count_documents({'user_id': email_id, 'source': 'signup'}) == 1
            assert await db.payment_transactions.count_documents({'user_id': email_id}) == 0

            google_id = f'{tag}_google'
            google = {'user_id': google_id, 'email': f'{tag}_google@example.com', 'name': 'Google Player',
                      'role': 'user', 'method': 'google', 'created_at': datetime.now(timezone.utc),
                      'free_world_started_global_contest': 1}
            await db.users.insert_one(dict(google))

            async def current_user(_request):
                return google

            monkeypatch.setattr(auth_routes, 'get_current_user', current_user)
            await auth_routes.finalize_google_signup(auth_routes.GoogleFinalizeInput(
                phone='+15550001235', otp_code='000000', accept_terms=True, dob='2000-08-02'), None)
            assert await bonus(db, google_id) == 5
            assert await db.bonus_grants.count_documents({'user_id': google_id, 'source': 'signup'}) == 1
            assert await db.payment_transactions.count_documents({'user_id': google_id}) == 0
        finally:
            await db.users.delete_many({'user_id': email_id})
            for name in ('wallets', 'wallet_tx', 'bonus_grants', 'notifications'):
                await db[name].delete_many({'user_id': email_id})
    run_db(safe_db, run)


def test_minimum_topup_change_applies_to_new_enrolments_not_earned_terms(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'signup_qualifying_topup_gbp': 10, 'signup_reward_tokens': 5})
        old, new = f'{tag}_old', f'{tag}_new'
        await enrolled_user(db, old)
        await save_reward_settings(db, {'signup_qualifying_topup_gbp': 5, 'signup_reward_tokens': 8})
        await enrolled_user(db, new)
        stored = await db.users.find_one({'user_id': old})
        assert stored['signup_offer_terms']['qualifying_topup_gbp'] == 10 and stored['signup_offer_terms']['reward_tokens'] == 5

        assert (await record_verified_topup(db, old, 5, 's_old_1'))['signup_qualified'] is False
        assert await bonus(db, old) == 0
        assert (await record_verified_topup(db, new, 5, 's_new_1'))['signup_qualified'] is True
        assert await bonus(db, new) == 8
        assert (await record_verified_topup(db, old, 10, 's_old_2'))['signup_qualified'] is True
        assert await bonus(db, old) == 5

        await record_verified_topup(db, new, 50, 's_new_2')
        user = await db.users.find_one({'user_id': new})
        assert user['qualifying_topup_session_id'] == 's_new_1' and user['qualifying_topup_amount_gbp'] == 5
        assert await bonus(db, new) == 8
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_signup_expiry_is_snapshotted_per_user(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'signup_bonus_expiry_enabled': True, 'signup_bonus_expiry_days': 7,
                                        'signup_qualifying_topup_gbp': 5})
        early, late = f'{tag}_early', f'{tag}_late'
        await enrolled_user(db, early)
        await save_reward_settings(db, {'signup_bonus_expiry_days': 30})
        await enrolled_user(db, late)
        await record_verified_topup(db, early, 5, 's1')
        await record_verified_topup(db, late, 5, 's2')
        grants = {g['user_id']: g for g in await db.bonus_grants.find({'user_id': {'$in': [early, late]}}).to_list(5)}
        now = datetime.now(timezone.utc)
        assert grants[early]['source'] == 'signup' and grants[late]['source'] == 'signup'
        assert 6.9 < (utc(grants[early]['expires_at']) - now).total_seconds() / 86400 < 7.1
        assert 29.9 < (utc(grants[late]['expires_at']) - now).total_seconds() / 86400 < 30.1
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_normal_topup_bonus_uses_enrollment_terms_and_is_first_qualifying_payment_only(safe_db, tag):
    async def run(db):
        from routers.referral_routes import record_verified_topup
        from routers.wallet_routes import _apply_tx

        await save_reward_settings(db, {
            'signup_qualifying_topup_gbp': 10,
            'normal_topup_bonus_enabled': True,
            'normal_topup_bonus_mode': 'fixed',
            'normal_topup_bonus_tokens': 3,
            'normal_topup_bonus_minimum_gbp': 5,
            'normal_topup_bonus_first_only': True,
            'normal_topup_bonus_expiry_enabled': True,
            'normal_topup_bonus_expiry_days': 4,
        })
        uid = f'{tag}_normal_topup'
        await enrolled_user(db, uid)
        await _apply_tx(db, uid, 'topup', 4, note='verified purchase below promo minimum')
        first = await record_verified_topup(db, uid, 4, 'cs-below')
        assert first['normal_topup_bonus_qualified'] is False
        assert await bonus(db, uid) == 0

        await _apply_tx(db, uid, 'topup', 10, note='first qualifying verified purchase')
        qualifying = await record_verified_topup(db, uid, 10, 'cs-first')
        assert qualifying['normal_topup_bonus_qualified'] is True
        assert await bonus(db, uid) == 8  # signup + normal top-up promotional grant
        await record_verified_topup(db, uid, 10, 'cs-first')
        await _apply_tx(db, uid, 'topup', 20, note='repeat verified purchase')
        repeated = await record_verified_topup(db, uid, 20, 'cs-repeat')
        assert repeated['normal_topup_bonus_qualified'] is False
        assert await bonus(db, uid) == 8
        grants = await db.bonus_grants.find({'user_id': uid}, {'_id': 0}).to_list(10)
        assert {g['source'] for g in grants} == {'signup', 'normal_topup'}
        normal_grant = next(g for g in grants if g['source'] == 'normal_topup')
        assert normal_grant['ref_key'] == f'normal-topup:{uid}:cs-first'
        assert 3.9 < (utc(normal_grant['expires_at']) - datetime.now(timezone.utc)).total_seconds() / 86400 < 4.1
        wallet = await db.wallets.find_one({'user_id': uid}, {'_id': 0})
        assert wallet['balance'] == 42 and wallet['bonus'] == 8
        assert round(wallet['balance'] - wallet['bonus'], 2) == 34  # purchased Top-up Tokens remain separate

    run_db(safe_db, run)


def test_concurrent_normal_topups_claim_first_only_bonus_once(safe_db, tag):
    async def run(db):
        from routers.referral_routes import record_verified_topup
        from routers.wallet_routes import _apply_tx
        await save_reward_settings(db, {
            'normal_topup_bonus_enabled': True, 'normal_topup_bonus_tokens': 3,
            'normal_topup_bonus_minimum_gbp': 5, 'normal_topup_bonus_first_only': True,
            'signup_qualifying_topup_gbp': 100,
        })
        uid = f'{tag}_race'
        await enrolled_user(db, uid)
        await _apply_tx(db, uid, 'topup', 5, note='concurrent payment A')
        await _apply_tx(db, uid, 'topup', 5, note='concurrent payment B')
        results = await asyncio.gather(
            record_verified_topup(db, uid, 5, 'cs-race-a'),
            record_verified_topup(db, uid, 5, 'cs-race-b'),
        )
        assert sum(bool(result['normal_topup_bonus_qualified']) for result in results) == 1
        assert await bonus(db, uid) == 3
        assert await db.bonus_grants.count_documents({'user_id': uid, 'source': 'normal_topup'}) == 1
    run_db(safe_db, run)


def test_reward_recovery_runs_when_only_normal_topup_promo_is_enabled(safe_db, tag):
    async def run(db):
        from routers.referral_routes import _sync_current_user
        from routers.wallet_routes import _apply_tx
        await save_reward_settings(db, {
            'signup_offer_enabled': False,
            'normal_topup_bonus_enabled': True,
            'normal_topup_bonus_tokens': 2,
            'normal_topup_bonus_minimum_gbp': 5,
        })
        uid = f'{tag}_recovery'
        await enrolled_user(db, uid)
        await _apply_tx(db, uid, 'topup', 5, note='settled top-up before hook recovery', ref_order_id='stripe_checkout:cs-recovery')
        await db.payment_transactions.insert_one(_payment(uid, 500, session_id='cs-recovery'))
        await _sync_current_user(db, uid)
        await _sync_current_user(db, uid)
        assert await bonus(db, uid) == 2
        assert await db.bonus_grants.count_documents({'user_id': uid, 'source': 'normal_topup'}) == 1
    run_db(safe_db, run)


def test_contest_entry_requirement_is_snapshotted_and_toggle_applies_to_new_referrals(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'referral_qualifying_topup_gbp': 5, 'referral_reward_tokens': 4,
                                        'referral_contest_entry_required': True})
        needs_referrer, needs_referred = await referral_pair(db, tag, 'needs')
        await save_reward_settings(db, {'referral_contest_entry_required': False, 'referral_reward_tokens': 6})
        free_referrer, free_referred = await referral_pair(db, tag, 'free')

        await record_verified_topup(db, needs_referred, 5, 'rs1')
        await record_verified_topup(db, free_referred, 5, 'rs2')
        assert await bonus(db, needs_referrer) == 0  # snapshot still requires an entry
        assert await bonus(db, free_referrer) == 6   # new terms: top-up alone completes

        progress = referral_progress(await db.referrals.find_one({'referred_user_id': needs_referred}), await get_reward_settings(db))
        assert progress['reward_state'] == 'pending' and progress['pending_conditions'] == ['Enter at least one contest']
        await record_contest_entry(db, needs_referred, 'order_1')
        assert await bonus(db, needs_referrer) == 4  # earned under the terms it joined with
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_referred_user_reward_expiry_and_single_credit_under_concurrency(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'referral_qualifying_topup_gbp': 5, 'referral_reward_tokens': 4,
                                        'referral_referred_reward_tokens': 2, 'referral_contest_entry_required': False,
                                        'referral_bonus_expiry_enabled': True, 'referral_bonus_expiry_days': 14})
        referrer, referred = await referral_pair(db, tag)
        await db.referrals.update_one({'referred_user_id': referred}, {'$set': {
            'topup_qualified': True, 'topup_amount_gbp': 5, 'topup_session_id': 'cs1'}})
        results = await asyncio.gather(*[_complete_referral_if_eligible(db, referred) for _ in range(6)])
        assert results.count(True) == 1
        assert await bonus(db, referrer) == 4 and await bonus(db, referred) == 2
        ref = await db.referrals.find_one({'referred_user_id': referred})
        assert ref['status'] == 'completed' and ref['reward_tx_id'] and ref['referred_reward_tx_id']
        assert ref['reward_tx_id'] != ref['referred_reward_tx_id']
        grants = await db.bonus_grants.find({'user_id': {'$in': [referrer, referred]}}).to_list(5)
        assert len(grants) == 2 and all(g['source'] == 'referral' and g['expires_at'] for g in grants)
        assert not await _complete_referral_if_eligible(db, referred)
        assert await bonus(db, referrer) == 4
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_disabled_offers_enrol_nobody_grant_nothing_and_reject_new_referrals(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'signup_offer_enabled': False, 'referral_offer_enabled': False})
        user = f'{tag}_off'
        await enrolled_user(db, user)
        assert (await db.users.find_one({'user_id': user}))['signup_bonus_offer_eligible'] is False
        referrer, referred = await referral_pair(db, tag, 'off')
        ref = await db.referrals.find_one({'referred_user_id': referred})
        assert ref['status'] == 'rejected' and ref['rejected_reason'] == 'referral_offer_disabled'
        assert referral_progress(ref, await get_reward_settings(db))['reward_state'] == 'rejected'
        # A saved enrollment snapshot remains valid if the current offer is later disabled.
        await save_reward_settings(db, {'signup_offer_enabled': True})
        early = f'{tag}_early'
        await enrolled_user(db, early)
        await save_reward_settings(db, {'signup_offer_enabled': False})
        assert await _grant_signup_bonus_once(db, early, 's')
        assert await bonus(db, early) == 5
        new_user = f'{tag}_disabled_new'
        await enrolled_user(db, new_user)
        assert (await db.users.find_one({'user_id': new_user}))['signup_bonus_offer_eligible'] is False
        assert not await _grant_signup_bonus_once(db, new_user, 's-new')
        assert await bonus(db, new_user) == 0

        await save_reward_settings(db, {'referral_offer_enabled': True, 'referral_qualifying_topup_gbp': 5,
                        'referral_contest_entry_required': False, 'referral_reward_tokens': 6})
        referrer, referred = await referral_pair(db, tag, 'before_disable')
        await db.referrals.update_one({'referred_user_id': referred}, {'$set': {'topup_qualified': True}})
        await save_reward_settings(db, {'referral_offer_enabled': False})
        assert await _complete_referral_if_eligible(db, referred)
        assert await bonus(db, referrer) == 6
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def _payment(uid, amount_pence, **extra):
    return {'session_id': 'cs_' + uuid.uuid4().hex, 'user_id': uid, 'kind': 'wallet_topup', 'payment_status': 'paid',
            'wallet_credited': True, 'amount': amount_pence, 'currency': 'gbp',
            'credited_at': datetime.now(timezone.utc), **extra}


def test_recovery_uses_saved_minimum_and_ignores_unverified_payments(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'signup_qualifying_topup_gbp': 5, 'signup_reward_tokens': 3})
        verified, pending, uncredited = f'{tag}_ok', f'{tag}_pending', f'{tag}_uncredited'
        for uid in (verified, pending, uncredited):
            await enrolled_user(db, uid)
        await db.payment_transactions.insert_one(_payment(verified, 500))
        await db.payment_transactions.insert_one(_payment(pending, 500, payment_status='unpaid'))
        await db.payment_transactions.insert_one(_payment(uncredited, 500, wallet_credited=False))
        for uid in (verified, pending, uncredited):
            await _sync_current_user(db, uid)
            await _sync_current_user(db, uid)  # a refresh must never double credit
        assert await bonus(db, verified) == 3
        assert await bonus(db, pending) == 0 and await bonus(db, uncredited) == 0
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_stale_reward_lock_is_recoverable_but_a_fresh_lock_blocks(safe_db, tag):
    async def run(db):
        stale, fresh = f'{tag}_stale', f'{tag}_fresh'
        await enrolled_user(db, stale)
        await enrolled_user(db, fresh)
        now = datetime.now(timezone.utc)
        await db.users.update_one({'user_id': stale}, {'$set': {
            'signup_bonus_processing': True, 'signup_bonus_processing_at': now - timedelta(minutes=30)}})
        await db.users.update_one({'user_id': fresh}, {'$set': {
            'signup_bonus_processing': True, 'signup_bonus_processing_at': now}})
        assert await _grant_signup_bonus_once(db, stale, 's')
        assert not await _grant_signup_bonus_once(db, fresh, 's')
        assert await bonus(db, stale) == 5 and await bonus(db, fresh) == 0
    run_db(safe_db, run)


def test_progress_text_uses_configured_minimum_not_a_hardcoded_value(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'referral_qualifying_topup_gbp': 7.5})
        _, referred = await referral_pair(db, tag)
        progress = referral_progress(await db.referrals.find_one({'referred_user_id': referred}), await get_reward_settings(db))
        assert progress['display_status'] == 'Waiting for top-up of \u00a37.50 or more in one verified payment'
        assert '10' not in progress['display_status']
        offer = public_offer(await get_reward_settings(db))
        assert '\u00a37.50' in offer['referral']['text'] and offer['referral']['qualifying_topup_gbp'] == 7.5
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_topup_preview_splits_wallet_categories_and_never_calls_purchased_tokens_bonus(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'signup_qualifying_topup_gbp': 10, 'signup_reward_tokens': 5,
                                        'referral_qualifying_topup_gbp': 10, 'referral_reward_tokens': 4,
                                        'influencer_qualifying_topup_gbp': 20, 'influencer_reward_tokens': 2})
        settings = await get_reward_settings(db)
        by_amount = {a: topup_preview(settings, a) for a in (5, 10, 20, 50)}
        assert by_amount[5]['credited_now'] == {'topup_tokens': 5, 'bonus_tokens': 0, 'winning_tokens': 0,
                                                'winning_bonus_tokens': 0, 'total_tokens': 5}
        assert by_amount[20]['credited_now']['topup_tokens'] == 20 and by_amount[20]['credited_now']['bonus_tokens'] == 5
        assert by_amount[20]['credited_now']['total_tokens'] == 25
        assert by_amount[50]['credited_now']['total_tokens'] == 55
        assert by_amount[10]['referral']['referrer_tokens'] == 4 and by_amount[5]['referral']['referrer_tokens'] == 0
        assert by_amount[10]['campaign_bonus_if_campaign_code']['tokens'] is None
        assert by_amount[20]['campaign_bonus_if_campaign_code']['tokens'] is None
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_normal_topup_preview_adds_bonus_separately_and_flags_legal_mismatch(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {
            'signup_offer_enabled': False,
            'normal_topup_bonus_enabled': True,
            'normal_topup_bonus_mode': 'percentage',
            'normal_topup_bonus_percent': 10,
            'normal_topup_bonus_minimum_gbp': 10,
        })
        settings = await get_reward_settings(db)
        preview = topup_preview(settings, 20)
        assert preview['credited_now']['topup_tokens'] == 20
        assert preview['normal_topup_bonus']['tokens'] == 2
        assert preview['credited_now']['total_tokens'] == 22
        assert preview['credited_now']['bonus_tokens'] == 2
        assert preview['campaign_bonus_if_campaign_code']['tokens'] is None
        flags = legal_flags(settings)
        assert any(flag['area'] == 'Normal top-up bonus' for flag in flags)
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_public_offer_endpoint_and_admin_preview_use_saved_config(safe_db, tag, monkeypatch):
    async def run(db):
        monkeypatch.setattr(offer_routes, 'get_db', lambda: db)

        async def staff(_request):
            return {'user_id': 'a', 'role': 'admin'}
        monkeypatch.setattr(offer_routes, '_staff', staff)
        await save_reward_settings(db, {'signup_qualifying_topup_gbp': 12, 'signup_reward_tokens': 9})
        offer = await offer_routes.active_offer()
        assert offer['signup']['qualifying_topup_gbp'] == 12 and offer['signup']['reward_tokens'] == 9
        assert offer['topup']['min_gbp'] == 5 and offer['offer_version'] == 2
        preview = await offer_routes.offer_preview(None, amounts='5,20')
        assert [p['credited_now']['bonus_tokens'] for p in preview['previews']] == [0, 9]
        pricing = await offer_routes.topup_pricing(None)
        assert {p['amount_gbp']: p['topup_tokens'] for p in pricing['packages']}[20] == 20 and pricing['rule']['editable'] is False
        with pytest.raises(Exception):
            await offer_routes.save_offer_config({'signup_reward_tokens': 1}, None)  # admin role, not super_admin
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)


def test_legal_flags_report_published_terms_that_disagree_with_configured_rewards(safe_db, tag):
    async def run(db):
        await save_reward_settings(db, {'referral_contest_entry_required': False})
        flags = legal_flags(await get_reward_settings(db))
        areas = {f['area'] for f in flags}
        assert {'Referral reward type', 'Contest entry requirement', 'Minimum top-up and expiry not published'} <= areas
        await db.reward_settings_history.delete_many({'offer_version': {'$gte': 2}})
    run_db(safe_db, run)
