"""Integration tests for influencer commissions using isolated test records."""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from starlette.requests import Request
from motor.motor_asyncio import AsyncIOMotorClient

from deps import _mongo_url, _sanitize_db_name
from routers import influencer_routes
from routers import influencer_promo_routes
from routers import user360_routes
from routers import auth_routes
from routers import payments_routes
from routers.auth_routes import GoogleFinalizeInput
from routers.influencer_routes import (
    CommissionReview, ExternalPayment, InfluencerAssign, InfluencerInviteRequest,
)
from fastapi import HTTPException
from services.influencer_commissions import (
    hold_payment_commissions,
    recover_pending_registration_commissions,
    record_registration_commission,
    record_topup_commission,
    resolve_payment_dispute,
    reverse_payment_commissions,
)


def run_db(db_name, fn):
    async def run():
        client = AsyncIOMotorClient(_mongo_url)
        try:
            return await fn(client[db_name])
        finally:
            client.close()
    return asyncio.run(run())


@pytest.fixture(scope='module')
def safe_db():
    name = os.environ.get('DB_NAME', 'test_database')
    if 'test' not in name.lower():
        pytest.skip('Integration tests require a DB_NAME containing "test"')
    return _sanitize_db_name(name)


@pytest.fixture
def scenario(safe_db):
    key = uuid.uuid4().hex[:10]
    influencer_id = f'inf_itest_{key}'
    influencer_user_id = f'inf_user_itest_{key}'
    user_id = f'inf_referred_itest_{key}'
    promo_id = f'inf_promo_itest_{key}'
    attribution_id = f'inf_attr_itest_{key}'
    session_id = f'inf_session_itest_{key}'
    now = datetime.now(timezone.utc)

    async def seed(db):
        await db.influencers.insert_one({
            'influencer_id': influencer_id, 'user_id': influencer_user_id,
            'status': 'active', 'display_name': 'Test Partner',
        })
        await db.users.insert_many([
            {'user_id': influencer_user_id, 'email': f'{key}-partner@example.test', 'role': 'influencer'},
            {'user_id': user_id, 'email': f'{key}-user@example.test', 'role': 'user', 'email_verified': True},
        ])
        await db.influencer_promos.insert_one({
            'promo_id': promo_id, 'influencer_id': influencer_id, 'code': f'TEST{key.upper()}',
            'active': True, 'reward_type': 'cash', 'registration_commission_pence': 50,
            'registration_eligibility': 'email_verified', 'topup_commission_mode': 'percentage',
            'topup_commission_bps': 500, 'topup_qualification': 'every_success',
            'attribution_window_days': 30, 'exclude_tax': True, 'budget_pence': 50000,
        })
        await db.influencer_attributions.insert_one({
            'attribution_id': attribution_id, 'user_id': user_id, 'influencer_id': influencer_id,
            'promo_id': promo_id, 'created_at': now - timedelta(days=1), 'status': 'pending',
        })
        await db.payment_transactions.insert_one({
            'session_id': session_id, 'user_id': user_id, 'payment_status': 'paid',
            'wallet_credited': True, 'amount': 2000, 'amount_received_pence': 2000,
            'amount_tax_pence': 0, 'created_at': now,
        })

    run_db(safe_db, seed)
    yield {
        'db_name': safe_db, 'influencer_id': influencer_id, 'influencer_user_id': influencer_user_id,
        'user_id': user_id, 'promo_id': promo_id, 'attribution_id': attribution_id,
        'session_id': session_id,
    }

    async def cleanup(db):
        for collection in ('influencers', 'users', 'influencer_promos', 'influencer_attributions',
                           'influencer_commissions', 'payment_transactions', 'influencer_visits',
                           'influencer_topup_events', 'influencer_commission_payments', 'bonus_grants',
                           'wallets', 'wallet_tx', 'notifications', 'audit_log', 'influencer_invites',
                           'staff_role_history'):
            await db[collection].delete_many({'$or': [
                {'user_id': {'$in': [influencer_user_id, user_id]}},
                {'user_id': {'$regex': '^existing_inf_referred_itest_'}},
                {'user_id': {'$regex': f'^invite_user_{session_id}$'}},
                {'influencer_id': influencer_id}, {'promo_id': promo_id},
                {'email': f'invite_{session_id}@example.test'},
                {'target_email': f'invite_{session_id}@example.test'},
                {'attribution_id': attribution_id}, {'session_id': session_id},
                {'event_key': {'$regex': f'^(registration|topup):.*{attribution_id}|^topup:{session_id}$'}},
            ]})
    run_db(safe_db, cleanup)


def test_registration_commission_is_email_verified_and_idempotent(scenario):
    async def run(db):
        first = await record_registration_commission(db, scenario['user_id'])
        replay = await record_registration_commission(db, scenario['user_id'])
        assert first['amount_pence'] == 50
        assert replay['event_key'] == first['event_key']
        assert await db.influencer_commissions.count_documents({'event_key': first['event_key']}) == 1

        await db.users.update_one({'user_id': scenario['user_id']}, {'$set': {'email_verified': False}})
        assert await record_registration_commission(db, scenario['user_id']) is None
    run_db(scenario['db_name'], run)


def test_eligible_registration_is_tracked_when_commission_is_disabled(scenario):
    async def run(db):
        await db.influencer_promos.update_one({'promo_id': scenario['promo_id']}, {'$set': {
            'reward_type': 'none', 'registration_commission_pence': 0,
        }})
        assert await record_registration_commission(db, scenario['user_id']) is None
        attribution = await db.influencer_attributions.find_one(
            {'attribution_id': scenario['attribution_id']}, {'_id': 0})
        assert attribution['registration_eligible'] is True
        assert attribution['registration_eligibility_rule'] == 'email_verified'
        assert await db.influencer_commissions.count_documents({'attribution_id': scenario['attribution_id']}) == 0
    run_db(scenario['db_name'], run)


def test_registration_uses_signup_time_campaign_snapshot(scenario):
    async def run(db):
        await db.influencer_attributions.update_one(
            {'attribution_id': scenario['attribution_id']},
            {'$set': {'campaign_snapshot': {
                'reward_type': 'cash', 'registration_eligibility': 'email_verified',
                'registration_commission_pence': 50, 'registration_commission_tokens': 0,
                'signup_reward_tokens': 0,
            }}},
        )
        await db.influencer_promos.update_one({'promo_id': scenario['promo_id']}, {'$set': {
            'registration_commission_pence': 500,
        }})
        commission = await record_registration_commission(db, scenario['user_id'])
        assert commission['amount_pence'] == 50
    run_db(scenario['db_name'], run)


def test_partner_earnings_exclude_rejected_and_held_commissions(scenario, monkeypatch):
    async def run(db):
        now = datetime.now(timezone.utc)
        statuses = [
            ('pending', 'registration', 100),
            ('approved', 'topup', 200),
            ('payment_processing', 'topup', 300),
            ('paid', 'registration', 400),
            ('on_hold', 'topup', 500),
            ('rejected', 'registration', 600),
            ('reversed', 'topup', 700),
        ]
        await db.influencer_commissions.insert_many([
            {'commission_id': f"ic_{scenario['influencer_id']}_{status}",
             'influencer_id': scenario['influencer_id'], 'event_kind': kind,
             'event_key': f"fixture:{scenario['influencer_id']}:{status}",
             'status': status, 'amount_pence': amount, 'created_at': now}
            for status, kind, amount in statuses
        ])
        profile = {'influencer_id': scenario['influencer_id'], 'display_name': 'Test Partner'}
        monkeypatch.setattr(influencer_routes, '_require_partner', lambda _request: _async_return(profile))
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        request = Request({'type': 'http', 'method': 'GET', 'path': '/', 'headers': []})
        result = await influencer_routes.partner_dashboard(request, range_key='30d')
        overview = result['overview']
        assert overview['commission_earned'] == '£10.00'
        assert overview['registration_commission'] == '£5.00'
        assert overview['topup_commission'] == '£5.00'
        assert overview['held_commission'] == '£5.00'
        assert overview['outstanding_payable'] == '£2.00'
    run_db(scenario['db_name'], run)


def test_registration_commission_recovers_after_interrupted_write(scenario, monkeypatch):
    async def run(db):
        import services.influencer_commissions as commission_service
        original_create = commission_service._create_commission
        attempts = {'count': 0}
        async def fail_once(*args, **kwargs):
            attempts['count'] += 1
            if attempts['count'] == 1:
                raise RuntimeError('simulated interruption')
            return await original_create(*args, **kwargs)
        monkeypatch.setattr(commission_service, '_create_commission', fail_once)
        with pytest.raises(RuntimeError):
            await record_registration_commission(db, scenario['user_id'])
        attribution = await db.influencer_attributions.find_one(
            {'attribution_id': scenario['attribution_id']}, {'_id': 0})
        assert attribution['registration_eligible'] is True
        assert 'registration_commission_checked_at' not in attribution
        assert await recover_pending_registration_commissions(db) == 1
        assert await recover_pending_registration_commissions(db) == 0
        assert await db.influencer_commissions.count_documents(
            {'event_key': f"registration:{scenario['attribution_id']}"}) == 1
    run_db(scenario['db_name'], run)


def test_failed_commission_insert_releases_reserved_campaign_budget(scenario, monkeypatch):
    async def run(db):
        from types import SimpleNamespace
        import services.influencer_commissions as commission_service

        class FailingCommissionCollection:
            async def insert_one(self, _document):
                raise RuntimeError('simulated database write failure')

        attribution = await db.influencer_attributions.find_one(
            {'attribution_id': scenario['attribution_id']}, {'_id': 0})
        promo = await db.influencer_promos.find_one({'promo_id': scenario['promo_id']}, {'_id': 0})
        failing_db = SimpleNamespace(
            influencer_promos=db.influencer_promos,
            influencer_commissions=FailingCommissionCollection(),
        )
        with pytest.raises(RuntimeError, match='simulated database write failure'):
            await commission_service._create_commission(
                failing_db, event_key=f"write-failure:{scenario['attribution_id']}",
                event_kind='registration', user_id=scenario['user_id'],
                attribution=attribution, promo=promo,
            )
        promo = await db.influencer_promos.find_one({'promo_id': scenario['promo_id']}, {'_id': 0})
        assert promo.get('commission_reserved_pence', 0) == 0
    run_db(scenario['db_name'], run)


def test_google_finalize_uses_influencer_code_only_for_new_account(scenario, monkeypatch):
    async def run(db):
        import deps
        await db.influencer_promos.update_one(
            {'promo_id': scenario['promo_id']}, {'$set': {'code': f"GOOG{scenario['session_id'][-6:].upper()}"}})
        await db.influencer_attributions.delete_one({'user_id': scenario['user_id']})
        await db.users.update_one({'user_id': scenario['user_id']}, {'$set': {
            'created_at': datetime.now(timezone.utc), 'phone_verified': False,
            'free_world_started_global_contest': 1, 'name': 'Google Test User', 'method': 'google',
        }})
        user = await db.users.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        monkeypatch.setattr(deps, 'get_db', lambda: db)
        monkeypatch.setattr(auth_routes, 'get_current_user', lambda _request: _async_return(user))
        monkeypatch.setattr(auth_routes, '_verify_twilio_otp', lambda phone, _code: _async_return(phone))
        monkeypatch.setattr(auth_routes, '_assert_18_plus', lambda _dob: None)
        result = await auth_routes.finalize_google_signup(GoogleFinalizeInput(
            phone='+447700900123', otp_code='123456', accept_terms=True, dob='2000-08-02',
            referral_code=f"GOOG{scenario['session_id'][-6:].upper()}"), None)
        assert result['ok'] is True
        attribution = await db.influencer_attributions.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        assert attribution['code'].startswith('GOOG')
        assert await db.influencer_commissions.count_documents({'attribution_id': attribution['attribution_id']}) == 1

        existing_user_id = f"existing_{scenario['user_id']}"
        await db.users.insert_one({
            'user_id': existing_user_id, 'email': f'{existing_user_id}@example.test',
            'role': 'user', 'name': 'Existing Google User', 'method': 'google', 'email_verified': True, 'created_at': datetime.now(timezone.utc),
            'terms_accepted_at': datetime.now(timezone.utc), 'free_world_started_global_contest': 1,
        })
        existing_user = await db.users.find_one({'user_id': existing_user_id}, {'_id': 0})
        monkeypatch.setattr(auth_routes, 'get_current_user', lambda _request: _async_return(existing_user))
        await auth_routes.finalize_google_signup(GoogleFinalizeInput(
            phone='+447700900124', otp_code='123456', accept_terms=True, dob='2000-08-02',
            referral_code=f"GOOG{scenario['session_id'][-6:].upper()}"), None)
        assert await db.influencer_attributions.count_documents({'user_id': existing_user_id}) == 0
    run_db(scenario['db_name'], run)


def test_google_finalize_rejects_expired_campaign_before_account_mutation(scenario, monkeypatch):
    async def run(db):
        import deps
        now = datetime.now(timezone.utc)
        code = f"EXPIRED{scenario['session_id'][-6:].upper()}"
        await db.influencer_promos.update_one(
            {'promo_id': scenario['promo_id']},
            {'$set': {'code': code, 'expires_at': now - timedelta(minutes=1), 'active': True}},
        )
        await db.users.update_one({'user_id': scenario['user_id']}, {'$set': {
            'created_at': now, 'phone_verified': False,
            'free_world_started_global_contest': 1, 'name': 'Google Test User',
            'method': 'google',
        }})
        user = await db.users.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        monkeypatch.setattr(deps, 'get_db', lambda: db)
        monkeypatch.setattr(auth_routes, 'get_current_user', lambda _request: _async_return(user))
        monkeypatch.setattr(auth_routes, '_verify_twilio_otp', lambda *_args: pytest.fail('OTP should not be sent'))
        monkeypatch.setattr(auth_routes, '_assert_18_plus', lambda _dob: None)
        with pytest.raises(HTTPException) as error:
            await auth_routes.finalize_google_signup(GoogleFinalizeInput(
                phone='+447700900123', otp_code='123456', accept_terms=True,
                dob='2000-08-02', referral_code=code), None)
        assert error.value.status_code == 400
        after = await db.users.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        assert after['phone_verified'] is False
        assert 'terms_accepted_at' not in after
        assert 'phone_verified_at' not in after
        assert 'dob' not in after
    run_db(scenario['db_name'], run)


async def _async_return(value):
    return value


def test_settled_topup_commission_uses_pence_and_deduplicates(scenario):
    async def run(db):
        first = await record_topup_commission(db, scenario['user_id'], scenario['session_id'])
        replay = await record_topup_commission(db, scenario['user_id'], scenario['session_id'])
        assert first[0]['amount_pence'] == 100
        assert replay[0]['commission_id'] == first[0]['commission_id']
        assert await db.influencer_commissions.count_documents({'event_key': f"topup:{scenario['session_id']}"}) == 1

        await db.payment_transactions.update_one({'session_id': scenario['session_id']}, {'$set': {'wallet_credited': False}})
        assert await record_topup_commission(db, scenario['user_id'], scenario['session_id']) == []
    run_db(scenario['db_name'], run)


def test_partial_and_full_refunds_recalculate_unpaid_commissions(scenario):
    async def run(db):
        commission = (await record_topup_commission(db, scenario['user_id'], scenario['session_id']))[0]
        partial = await reverse_payment_commissions(db, scenario['session_id'], 1000)
        after_partial = await db.influencer_commissions.find_one({'commission_id': commission['commission_id']}, {'_id': 0})
        assert partial == 1 and after_partial['amount_pence'] == 50 and after_partial['status'] == 'pending'
        full = await reverse_payment_commissions(db, scenario['session_id'], 2000)
        after_full = await db.influencer_commissions.find_one({'commission_id': commission['commission_id']}, {'_id': 0})
        assert full == 1 and after_full['amount_pence'] == 0 and after_full['status'] == 'reversed'
    run_db(scenario['db_name'], run)


def test_repeated_partial_refunds_recalculate_from_original_commission(scenario):
    async def run(db):
        commission = (await record_topup_commission(db, scenario['user_id'], scenario['session_id']))[0]
        await reverse_payment_commissions(db, scenario['session_id'], 500)
        await reverse_payment_commissions(db, scenario['session_id'], 1000)
        await reverse_payment_commissions(db, scenario['session_id'], 1500)
        row = await db.influencer_commissions.find_one({'commission_id': commission['commission_id']}, {'_id': 0})
        assert row['original_amount_pence'] == 100
        assert row['amount_pence'] == 25
    run_db(scenario['db_name'], run)


def test_partial_and_full_refunds_reconcile_percentage_user_bonus(scenario):
    async def run(db):
        await db.influencer_promos.update_one({'promo_id': scenario['promo_id']}, {'$set': {
            'topup_reward_mode': 'percentage', 'topup_reward_bps': 500,
        }})
        await record_topup_commission(db, scenario['user_id'], scenario['session_id'])
        wallet = await db.wallets.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        assert wallet['bonus'] == 1
        await db.influencer_promos.update_one(
            {'promo_id': scenario['promo_id']}, {'$set': {'topup_reward_bps': 1000}})
        await reverse_payment_commissions(db, scenario['session_id'], 1000)
        await reverse_payment_commissions(db, scenario['session_id'], 1000)
        wallet = await db.wallets.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        assert wallet['bonus'] == 0.5
        assert await db.bonus_grants.count_documents({
            'user_id': scenario['user_id'], 'ref_key': {'$regex': f"^influencer-topup-refund:{scenario['session_id']}:"}}) == 1
        await reverse_payment_commissions(db, scenario['session_id'], 2000)
        wallet = await db.wallets.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        assert wallet['bonus'] == 0
    run_db(scenario['db_name'], run)


@pytest.mark.parametrize('commission_status', ['paid', 'payment_processing'])
def test_refund_after_settled_or_processing_commission_records_recovery(scenario, commission_status):
    async def run(db):
        commission = (await record_topup_commission(db, scenario['user_id'], scenario['session_id']))[0]
        await db.influencer_commissions.update_one(
            {'commission_id': commission['commission_id']}, {'$set': {'status': commission_status}})
        await reverse_payment_commissions(db, scenario['session_id'], 1000)
        await reverse_payment_commissions(db, scenario['session_id'], 2000)
        recovery = await db.influencer_commissions.find_one(
            {'event_key': f"refund-recovery:{commission['commission_id']}"}, {'_id': 0})
        assert recovery['amount_pence'] == -100
        assert recovery['status'] == 'pending'
        assert await db.influencer_commissions.count_documents(
            {'event_key': f"refund-recovery:{commission['commission_id']}"}) == 1
    run_db(scenario['db_name'], run)


def test_dispute_wins_restore_commissions_and_losses_reverse_them(scenario):
    async def run(db):
        commission = (await record_topup_commission(db, scenario['user_id'], scenario['session_id']))[0]
        dispute_id = f"dp_{scenario['session_id']}"
        await db.payment_transactions.update_one(
            {'session_id': scenario['session_id']},
            {'$set': {'payment_status': 'disputed', 'stripe_dispute_id': dispute_id}},
        )
        assert await hold_payment_commissions(db, scenario['session_id'], dispute_id) == 1
        held = await db.influencer_commissions.find_one({'commission_id': commission['commission_id']}, {'_id': 0})
        assert held['status'] == 'on_hold'
        assert await resolve_payment_dispute(db, scenario['session_id'], dispute_id, 'won', 2000) == 1
        restored = await db.influencer_commissions.find_one({'commission_id': commission['commission_id']}, {'_id': 0})
        assert restored['status'] == 'pending'

        await db.payment_transactions.update_one(
            {'session_id': scenario['session_id']},
            {'$set': {'payment_status': 'disputed', 'stripe_dispute_id': dispute_id}},
        )
        await hold_payment_commissions(db, scenario['session_id'], dispute_id)
        await resolve_payment_dispute(db, scenario['session_id'], dispute_id, 'lost', 2000)
        reversed_row = await db.influencer_commissions.find_one({'commission_id': commission['commission_id']}, {'_id': 0})
        assert reversed_row['status'] == 'reversed'
        assert reversed_row['amount_pence'] == 0
    run_db(scenario['db_name'], run)


def test_signed_dispute_webhook_holds_and_restores_commission(scenario, monkeypatch):
    async def run(db):
        await record_topup_commission(db, scenario['user_id'], scenario['session_id'])
        await db.payment_transactions.update_one(
            {'session_id': scenario['session_id']}, {'$set': {'stripe_payment_intent_id': 'pi_dispute_test'}})
        monkeypatch.setattr(payments_routes, 'get_db', lambda: db)
        events = {'current': None}
        monkeypatch.setattr(payments_routes.stripe.Webhook, 'construct_event',
                            lambda *_args, **_kwargs: events['current'])

        async def receive():
            return {'type': 'http.request', 'body': b'{}', 'more_body': False}
        request = Request({'type': 'http', 'method': 'POST', 'path': '/stripe/webhook',
                           'headers': [(b'stripe-signature', b'test')]}, receive)

        events['current'] = {'type': 'charge.dispute.created', 'data': {'object': {
            'id': 'dp_webhook_test', 'payment_intent': 'pi_dispute_test', 'status': 'needs_response', 'amount': 2000,
        }}}
        assert await payments_routes.stripe_webhook(request) == {'status': 'ok'}
        row = await db.influencer_commissions.find_one({'event_key': f"topup:{scenario['session_id']}"}, {'_id': 0})
        assert row['status'] == 'on_hold'

        events['current'] = {'type': 'charge.dispute.closed', 'data': {'object': {
            'id': 'dp_webhook_test', 'payment_intent': 'pi_dispute_test', 'status': 'won', 'amount': 2000,
        }}}
        assert await payments_routes.stripe_webhook(request) == {'status': 'ok'}
        row = await db.influencer_commissions.find_one({'event_key': f"topup:{scenario['session_id']}"}, {'_id': 0})
        assert row['status'] == 'pending'

        events['current'] = {'type': 'charge.dispute.created', 'data': {'object': {
            'id': 'dp_webhook_test', 'payment_intent': 'pi_dispute_test', 'status': 'needs_response', 'amount': 2000,
        }}}
        await payments_routes.stripe_webhook(request)
        payment = await db.payment_transactions.find_one({'session_id': scenario['session_id']}, {'_id': 0})
        assert payment['payment_status'] == 'paid'
        row = await db.influencer_commissions.find_one({'event_key': f"topup:{scenario['session_id']}"}, {'_id': 0})
        assert row['status'] == 'pending'
    run_db(scenario['db_name'], run)


def test_topup_commission_ignores_unsettled_or_expired_attribution(scenario):
    async def run(db):
        await db.payment_transactions.update_one({'session_id': scenario['session_id']}, {'$set': {'payment_status': 'pending'}})
        assert await record_topup_commission(db, scenario['user_id'], scenario['session_id']) == []
        await db.payment_transactions.update_one({'session_id': scenario['session_id']}, {'$set': {
            'payment_status': 'paid', 'created_at': datetime.now(timezone.utc),
        }})
        await db.influencer_attributions.update_one({'attribution_id': scenario['attribution_id']}, {
            '$set': {'created_at': datetime.now(timezone.utc) - timedelta(days=31)},
        })
        assert await record_topup_commission(db, scenario['user_id'], scenario['session_id']) == []
    run_db(scenario['db_name'], run)


def test_approved_token_commission_uses_idempotent_bonus_grant(scenario, monkeypatch):
    async def run(db):
        await db.influencer_promos.update_one({'promo_id': scenario['promo_id']}, {'$set': {
            'reward_type': 'both', 'registration_commission_tokens': 3,
        }})
        commission = await record_registration_commission(db, scenario['user_id'])
        async def require_admin(_request):
            return {'user_id': 'admin_test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(influencer_routes, '_require_campaign_admin', require_admin)
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        first = await influencer_routes.review_commission(
            scenario['influencer_id'], commission['commission_id'],
            CommissionReview(decision='approved', reason='Verified qualifying event'), None)
        replay = await influencer_routes.review_commission(
            scenario['influencer_id'], commission['commission_id'],
            CommissionReview(decision='approved', reason='Verified qualifying event'), None)
        assert first['status'] == 'approved'
        assert replay['token_grant_id'] == first['token_grant_id']
        assert await db.bonus_grants.count_documents({'ref_key': {'$regex': f"^influencer-commission:{commission['commission_id']}:part:"}}) == 1
        wallet = await db.wallets.find_one({'user_id': scenario['influencer_user_id']}, {'_id': 0})
        assert wallet['bonus'] == 3
    run_db(scenario['db_name'], run)


def test_large_token_commission_uses_bounded_idempotent_grants(scenario, monkeypatch):
    async def run(db):
        await db.influencer_promos.update_one({'promo_id': scenario['promo_id']}, {'$set': {
            'reward_type': 'tokens', 'registration_commission_tokens': 700,
        }})
        commission = await record_registration_commission(db, scenario['user_id'])
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(influencer_routes, '_require_campaign_admin', admin)
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        result = await influencer_routes.review_commission(
            scenario['influencer_id'], commission['commission_id'],
            CommissionReview(decision='approved', reason='Approved token commission'), None)
        replay = await influencer_routes.review_commission(
            scenario['influencer_id'], commission['commission_id'],
            CommissionReview(decision='approved', reason='Approved token commission'), None)
        assert len(result['token_grant_ids']) == 2
        assert replay['token_grant_ids'] == result['token_grant_ids']
        assert replay['status'] == 'paid'
        grants = await db.bonus_grants.find({'grant_id': {'$in': result['token_grant_ids']}}, {'_id': 0}).to_list(5)
        assert sorted(grant['original_amount'] for grant in grants) == [200, 500]
        wallet = await db.wallets.find_one({'user_id': scenario['influencer_user_id']}, {'_id': 0})
        assert wallet['bonus'] == 700
    run_db(scenario['db_name'], run)


def test_affiliate_visit_honors_privacy_window_and_deduplication(scenario, monkeypatch):
    async def run(db):
        await db.influencer_visits.create_index('dedupe', unique=True)
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        payload = influencer_routes.AffiliateVisit(
            code=f"TEST{scenario['promo_id'].split('_')[-1].upper()}",
            visitor_id=f"visitor_{scenario['session_id']}", page_key='/login')
        privacy_request = Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': [(b'dnt', b'1')]})
        assert await influencer_routes.record_affiliate_visit(payload, privacy_request) == {
            'recorded': False, 'reason': 'privacy_signal'}
        request = Request({'type': 'http', 'method': 'POST', 'path': '/',
                   'headers': [(b'user-agent', b'test-browser')],
                   'client': ('192.0.2.10', 1234)})
        first = await influencer_routes.record_affiliate_visit(payload, request)
        replay = await influencer_routes.record_affiliate_visit(payload, request)
        forged = payload.model_copy(update={'visitor_id': 'forged_visitor_identifier_2'})
        forged_replay = await influencer_routes.record_affiliate_visit(forged, request)
        assert first['recorded'] is True
        assert replay.get('duplicate') is True
        assert forged_replay.get('duplicate') is True
        row = await db.influencer_visits.find_one({'promo_id': scenario['promo_id']}, {'_id': 0})
        assert row['visitor_id'] != payload.visitor_id
        assert await db.influencer_visits.count_documents({'promo_id': scenario['promo_id']}) == 1

        future_code = f"FUTURE{scenario['promo_id'].split('_')[-1].upper()}"
        await db.influencer_promos.insert_one({
            'promo_id': f"future_{scenario['promo_id']}", 'influencer_id': scenario['influencer_id'],
            'code': future_code, 'active': True, 'starts_at': datetime.now(timezone.utc) + timedelta(days=1),
        })
        future_payload = influencer_routes.AffiliateVisit(code=future_code, visitor_id=f"future_{payload.visitor_id}")
        assert await influencer_routes.record_affiliate_visit(future_payload, request) == {'recorded': False}
    run_db(scenario['db_name'], run)


def test_partner_dashboard_is_owner_scoped_and_hides_campaign_budget(scenario, monkeypatch):
    async def run(db):
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        async def partner(_request):
            return {'influencer_id': scenario['influencer_id'], 'display_name': 'Test Partner',
                    'user_id': scenario['influencer_user_id'], 'status': 'active'}
        monkeypatch.setattr(influencer_routes, '_require_partner', partner)
        report = await influencer_routes.partner_dashboard(None, range_key='30d')
        assert report['influencer']['influencer_id'] == scenario['influencer_id']
        assert [row['promo_id'] for row in report['campaigns']] == [scenario['promo_id']]
        assert 'budget_pence' not in report['campaigns'][0]
        assert report['referrals'][0]['referral_ref'] != scenario['user_id']
        assert 'user_id' not in report['referrals'][0]
    run_db(scenario['db_name'], run)


def test_partner_guard_rejects_non_influencer_role(scenario, monkeypatch):
    async def run(db):
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        async def user(_request):
            return {'user_id': scenario['influencer_user_id'], 'role': 'admin'}
        monkeypatch.setattr(influencer_routes, 'get_current_user', user)
        with pytest.raises(HTTPException) as error:
            await influencer_routes._require_partner(None)
        assert error.value.status_code == 403
    run_db(scenario['db_name'], run)


def test_admin_assigns_existing_user_by_email(scenario, monkeypatch):
    async def run(db):
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(influencer_routes, '_require_campaign_admin', admin)
        user = await db.users.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        result = await influencer_routes.assign_influencer(
            InfluencerAssign(email=user['email'], display_name='Assigned Partner'), None)
        updated = await db.users.find_one({'user_id': scenario['user_id']}, {'_id': 0})
        assert result['user_id'] == scenario['user_id']
        assert updated['role'] == 'influencer'
        assert updated['influencer_id'] == result['influencer_id']
    run_db(scenario['db_name'], run)


def test_invitation_is_email_bound_single_use_and_completes_partner_profile(scenario, monkeypatch):
    async def run(db):
        invite_email = f"invite_{scenario['session_id']}@example.test"
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(influencer_routes, '_require_campaign_admin', admin)
        result = await influencer_routes.create_influencer_invite(
            InfluencerInviteRequest(email=invite_email, display_name='Invited Creator'), None)
        token = result['signup_url'].split('invite=', 1)[1]
        user_id = f"invite_user_{scenario['session_id']}"
        await db.users.insert_one({'user_id': user_id, 'email': invite_email, 'role': 'user'})
        with pytest.raises(HTTPException):
            await influencer_routes.claim_influencer_invite(
                db, token=token, email='other@example.test', user_id=user_id)
        invite = await influencer_routes.claim_influencer_invite(
            db, token=token, email=invite_email, user_id=user_id)
        profile = await influencer_routes.complete_influencer_invite(db, invite=invite, user_id=user_id)
        user = await db.users.find_one({'user_id': user_id}, {'_id': 0})
        stored = await db.influencer_invites.find_one({'invite_id': invite['invite_id']}, {'_id': 0})
        assert profile['display_name'] == 'Invited Creator'
        assert user['role'] == 'influencer'
        assert stored['used'] is True
        with pytest.raises(HTTPException):
            await influencer_routes.claim_influencer_invite(
                db, token=token, email=invite_email, user_id=user_id)
    run_db(scenario['db_name'], run)


def test_campaign_admin_guard_rejects_operator(monkeypatch):
    async def operator(_request):
        return {'user_id': 'operator-test', 'role': 'operator'}
    monkeypatch.setattr(influencer_promo_routes, 'require_admin', operator)
    async def run():
        with pytest.raises(HTTPException) as error:
            await influencer_promo_routes._require_promo_admin(None)
        assert error.value.status_code == 403
    asyncio.run(run())


def test_external_commission_payment_is_idempotent(scenario, monkeypatch):
    async def run(db):
        commission = (await record_topup_commission(db, scenario['user_id'], scenario['session_id']))[0]
        await db.influencer_commissions.update_one(
            {'commission_id': commission['commission_id']}, {'$set': {'status': 'approved'}})
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(influencer_routes, '_require_campaign_admin', admin)
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        payload = ExternalPayment(
            payment_method='bank_transfer', payment_reference=f"settled-{scenario['session_id']}",
            paid_at=datetime.now(timezone.utc), confirmed_external_payment=True,
            note='Settlement confirmed against bank statement')
        first = await influencer_routes.record_external_payment(
            scenario['influencer_id'], commission['commission_id'], payload, None)
        replay = await influencer_routes.record_external_payment(
            scenario['influencer_id'], commission['commission_id'], payload, None)
        assert first['payment_id'] == replay['payment_id']
        assert replay['idempotent_replay'] is True
        assert await db.influencer_commission_payments.count_documents({'commission_id': commission['commission_id']}) == 1
        paid = await db.influencer_commissions.find_one({'commission_id': commission['commission_id']}, {'_id': 0})
        assert paid['status'] == 'paid'
    run_db(scenario['db_name'], run)


def test_external_payment_recovers_after_processing_claim(scenario, monkeypatch):
    async def run(db):
        commission = (await record_topup_commission(db, scenario['user_id'], scenario['session_id']))[0]
        reference = f"recovery-{scenario['session_id']}"
        await db.influencer_commissions.update_one({'commission_id': commission['commission_id']}, {'$set': {
            'status': 'payment_processing', 'payment_id': f"ip_{commission['commission_id']}",
            'payment_reference': reference,
        }})
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(influencer_routes, '_require_campaign_admin', admin)
        monkeypatch.setattr(influencer_routes, 'get_db', lambda: db)
        payload = ExternalPayment(
            payment_method='bank_transfer', payment_reference=reference,
            paid_at=datetime.now(timezone.utc), confirmed_external_payment=True,
            note='Recovered after payment processing interruption')
        result = await influencer_routes.record_external_payment(
            scenario['influencer_id'], commission['commission_id'], payload, None)
        assert result['ok'] is True
        paid = await db.influencer_commissions.find_one({'commission_id': commission['commission_id']}, {'_id': 0})
        assert paid['status'] == 'paid'
        assert await db.influencer_commission_payments.count_documents({'commission_id': commission['commission_id']}) == 1
    run_db(scenario['db_name'], run)


def test_user_360_returns_wallet_sources_grants_and_safe_withdrawal_history(scenario, monkeypatch):
    async def run(db):
        await db.wallets.insert_one({
            'user_id': scenario['user_id'], 'balance': 20, 'bonus': 5,
            'withdrawable': 2, 'withdrawable_pending': 1,
        })
        await db.bonus_grants.insert_one({
            'grant_id': f"grant_{scenario['user_id']}", 'user_id': scenario['user_id'],
            'original_amount': 10, 'remaining_amount': 5, 'expired_amount': 0,
            'revoked_amount': 0, 'status': 'active', 'granted_at': datetime.now(timezone.utc),
            'expires_at': datetime.now(timezone.utc) + timedelta(days=7),
        })
        await db.winnings_wallets.insert_one({
            'user_id': scenario['user_id'], 'available_pence': 1000, 'pending_pence': 250,
            'total_won_pence': 2000,
        })
        await db.cashout_requests.insert_one({
            'withdrawal_id': f"wd_{scenario['user_id']}", 'user_id': scenario['user_id'],
            'amount_tokens': 2, 'amount_gbp': 1, 'status': 'processing',
            'created_at': datetime.now(timezone.utc), 'account_number': 'SHOULD_NOT_LEAK',
        })
        await db.acquisition_attributions.insert_one({
            'user_id': scenario['user_id'], 'source_key': 'instagram', 'campaign': 'creator',
            'landing_path': '/login', 'session_id': f"session_{scenario['user_id']}",
            'registration_session_id': f"signup_{scenario['user_id']}",
            'attributed_at': datetime.now(timezone.utc),
        })
        await db.acquisition_page_views.insert_one({
            'view_id': f"view_{scenario['user_id']}", 'session_id': f"session_{scenario['user_id']}",
            'page_path': '/login', 'created_at': datetime.now(timezone.utc), 'engaged_ms': 1000,
        })
        import deps
        monkeypatch.setattr(deps, 'get_db', lambda: db)
        async def admin(_request):
            return {'user_id': 'admin-test', 'role': 'admin'}
        monkeypatch.setattr(user360_routes, 'require_admin', admin)
        result = await user360_routes.user_360(scenario['user_id'], None)
        assert result['wallet_breakdown']['purchased_tokens'] == 12
        assert result['wallet_breakdown']['bonus_tokens'] == 5
        assert result['wallet_breakdown']['winnings_pence'] == 1250
        assert result['wallet_breakdown']['lifetime_winnings_pence'] == 2000
        assert result['bonus_grants'][0]['spent_amount'] == 5
        assert result['withdrawals'][0]['amount_gbp'] == 1
        assert 'account_number' not in result['withdrawals'][0]
        assert result['acquisition']['source_key'] == 'instagram'
        assert result['page_visits'][0]['page_path'] == '/login'
    run_db(scenario['db_name'], run)