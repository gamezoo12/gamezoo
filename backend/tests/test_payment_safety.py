"""Safety checks for the demo wallet top-up and Stripe mode validation."""
from __future__ import annotations

import asyncio
import os
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request
import stripe
from motor.motor_asyncio import AsyncIOMotorClient

from deps import _mongo_url, _sanitize_db_name
from routers import payments_routes, wallet_routes


def _request():
    return Request({'type': 'http', 'method': 'POST', 'path': '/api/wallet/topup', 'headers': []})


def _stripe_request(payload=b'{}', signature=b'invalid'):
    async def receive():
        return {'type': 'http.request', 'body': payload, 'more_body': False}
    return Request({
        'type': 'http', 'method': 'POST', 'path': '/api/stripe/webhook',
        'headers': [(b'stripe-signature', signature)],
    }, receive=receive)


@pytest.mark.parametrize('environment,stripe_mode,secret_key', [
    ('production', 'test', 'sk_test_example'),
    ('prod', 'live', 'sk_live_example'),
    ('development', 'live', 'sk_live_example'),
    ('staging', 'test', 'sk_test_example'),
])
def test_mock_topup_is_hidden_for_production_live_or_unknown_environment(
    monkeypatch, environment, stripe_mode, secret_key,
):
    monkeypatch.setenv('ENVIRONMENT', environment)
    monkeypatch.delenv('APP_ENV', raising=False)
    monkeypatch.setenv('STRIPE_MODE', stripe_mode)
    monkeypatch.setenv('STRIPE_SECRET_KEY', secret_key)
    monkeypatch.setenv('ENABLE_MOCK_WALLET_TOPUP', 'true')
    monkeypatch.setattr(wallet_routes, 'get_db', lambda: pytest.fail('mock endpoint reached DB'))

    async def run():
        with pytest.raises(HTTPException) as error:
            await wallet_routes.topup(wallet_routes.TopupInput(amount=10), _request())
        assert error.value.status_code == 404
    asyncio.run(run())


def test_mock_topup_requires_explicit_development_opt_in(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT', 'development')
    monkeypatch.setenv('STRIPE_MODE', 'test')
    monkeypatch.setenv('STRIPE_SECRET_KEY', 'sk_test_example')
    monkeypatch.delenv('ENABLE_MOCK_WALLET_TOPUP', raising=False)
    assert wallet_routes._mock_wallet_topup_enabled() is False


def test_conflicting_environment_markers_block_mock_and_checkout(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT', 'development')
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('STRIPE_MODE', 'test')
    monkeypatch.setenv('STRIPE_SECRET_KEY', 'sk_test_example')
    monkeypatch.setenv('STRIPE_PUBLISHABLE_KEY', 'pk_test_example')
    monkeypatch.setenv('ENABLE_MOCK_WALLET_TOPUP', 'true')
    assert wallet_routes._mock_wallet_topup_enabled() is False
    with pytest.raises(HTTPException) as error:
        payments_routes._require_stripe_configuration()
    assert error.value.status_code == 503


def test_mock_topup_can_only_run_with_explicit_development_opt_in(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT', 'development')
    monkeypatch.setenv('STRIPE_MODE', 'test')
    monkeypatch.setenv('STRIPE_SECRET_KEY', 'sk_test_example')
    monkeypatch.setenv('ENABLE_MOCK_WALLET_TOPUP', 'true')
    credit = AsyncMock(return_value={'balance': 10, 'tx': {}})
    monkeypatch.setattr(wallet_routes, 'require_verified_user', AsyncMock(return_value={'user_id': 'dev-user'}))
    monkeypatch.setattr(wallet_routes, 'get_db', lambda: object())
    monkeypatch.setattr(wallet_routes, '_apply_tx', credit)

    async def run():
        result = await wallet_routes.topup(wallet_routes.TopupInput(amount=10), _request())
        assert result['ok'] is True
        assert credit.await_count == 1
    asyncio.run(run())


@pytest.mark.parametrize('secret,publishable,declared', [
    ('sk_test_example', 'pk_test_example', 'live'),
    ('sk_live_example', 'pk_test_example', 'live'),
    ('invalid', 'pk_test_example', 'test'),
])
def test_checkout_configuration_fails_closed_on_missing_or_mismatched_mode(
    monkeypatch, secret, publishable, declared,
):
    monkeypatch.setenv('ENVIRONMENT', 'production')
    monkeypatch.setenv('STRIPE_SECRET_KEY', secret)
    monkeypatch.setenv('STRIPE_PUBLISHABLE_KEY', publishable)
    monkeypatch.setenv('STRIPE_MODE', declared)
    monkeypatch.setenv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    with pytest.raises(HTTPException) as error:
        payments_routes._require_stripe_configuration()
    assert error.value.status_code == 503


def test_live_stripe_key_requires_explicit_production_environment(monkeypatch):
    monkeypatch.delenv('ENVIRONMENT', raising=False)
    monkeypatch.delenv('APP_ENV', raising=False)
    monkeypatch.setenv('STRIPE_SECRET_KEY', 'sk_live_example')
    monkeypatch.setenv('STRIPE_PUBLISHABLE_KEY', 'pk_live_example')
    monkeypatch.setenv('STRIPE_MODE', 'live')
    monkeypatch.setenv('STRIPE_WEBHOOK_SECRET', 'whsec_live')
    with pytest.raises(HTTPException) as error:
        payments_routes._require_stripe_configuration()
    assert error.value.status_code == 503


def test_unpaid_completed_checkout_is_not_credited(monkeypatch):
    class PaymentCollection:
        def __init__(self):
            self.record = {
                'session_id': 'cs_unpaid', 'user_id': 'test-user', 'amount': 1000,
                'currency': 'gbp', 'status': 'completed', 'payment_status': 'unpaid',
                'wallet_credited': False,
            }
            self.updates = 0

        async def find_one(self, *_args, **_kwargs):
            return dict(self.record)

        async def update_one(self, *_args, **_kwargs):
            self.updates += 1

    payments = PaymentCollection()
    monkeypatch.setattr(payments_routes, 'get_db', lambda: type('DB', (), {'payment_transactions': payments})())
    monkeypatch.setattr(payments_routes.stripe.checkout.Session, 'retrieve', lambda _session_id: {
        'id': 'cs_unpaid', 'status': 'complete', 'payment_status': 'unpaid',
        'currency': 'gbp', 'amount_total': 1000, 'amount_subtotal': 1000, 'livemode': False,
    })
    monkeypatch.setattr(payments_routes, '_require_stripe_configuration', lambda: 'test')
    monkeypatch.setattr(payments_routes, '_credit_wallet_once', AsyncMock())

    result = asyncio.run(payments_routes.get_status('cs_unpaid'))
    assert result['payment_status'] == 'unpaid'
    assert result['wallet_credited'] is False
    assert payments.updates == 0
    payments_routes._credit_wallet_once.assert_not_awaited()


def test_invalid_webhook_signature_is_rejected_before_database_access(monkeypatch):
    monkeypatch.setenv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    monkeypatch.setattr(payments_routes, '_require_stripe_configuration', lambda **_kwargs: 'test')
    monkeypatch.setattr(payments_routes, 'get_db', lambda: pytest.fail('invalid signature reached the database'))
    monkeypatch.setattr(
        payments_routes.stripe.Webhook, 'construct_event',
        lambda *_args: (_ for _ in ()).throw(stripe.error.SignatureVerificationError('invalid', 'bad')),
    )
    async def run():
        with pytest.raises(HTTPException) as error:
            await payments_routes.stripe_webhook(_stripe_request())
        assert error.value.status_code == 400
    asyncio.run(run())


def test_credit_retry_recovers_after_wallet_commit_before_payment_flag(monkeypatch):
    class PaymentCollection:
        def __init__(self):
            self.record = {
                'session_id': 'cs_retry', 'user_id': 'test-user', 'amount': 1000,
                'amount_received_pence': 1000, 'amount_subtotal_pence': 1000,
                'currency': 'gbp', 'status': 'completed', 'payment_status': 'paid',
                'stripe_livemode': False, 'wallet_credited': False,
            }
            self.fail_next_update = True

        async def find_one(self, *_args, **_kwargs):
            return dict(self.record)

        async def update_one(self, _query, update):
            if self.fail_next_update:
                self.fail_next_update = False
                raise RuntimeError('simulated process failure before payment flag')
            self.record.update(update['$set'])

    payment_collection = PaymentCollection()
    db = type('DB', (), {'payment_transactions': payment_collection})()
    applied = set()
    async def apply_once(_db, _user, _kind, _amount, **kwargs):
        key = kwargs['ref_order_id']
        replay = key in applied
        applied.add(key)
        return {'balance': 10, 'idempotent_replay': replay, 'tx': {'tx_id': 'tx_once'}}
    monkeypatch.setattr(payments_routes, '_require_stripe_configuration', lambda: 'test')
    monkeypatch.setattr(payments_routes, '_apply_tx_idempotent', apply_once)
    from routers import referral_routes
    from services import influencer_commissions
    monkeypatch.setattr(referral_routes, 'record_verified_topup', AsyncMock())
    monkeypatch.setattr(influencer_commissions, 'record_topup_commission', AsyncMock())

    async def run():
        with pytest.raises(RuntimeError):
            await payments_routes._credit_wallet_once(db, dict(payment_collection.record))
        result = await payments_routes._credit_wallet_once(db, dict(payment_collection.record))
        assert result['idempotent_replay'] is True
        assert payment_collection.record['wallet_credited'] is True
        assert len(applied) == 1
    asyncio.run(run())


def test_paid_webhook_and_repeated_status_polls_credit_wallet_once(monkeypatch):
    database_name = _sanitize_db_name(os.environ["DB_NAME"])
    if 'test' not in database_name.lower():
        pytest.skip('Integration test requires a DB_NAME containing "test"')
    user_id = f'payment_safety_itest_{uuid.uuid4().hex[:12]}'
    session_id = f'cs_payment_safety_itest_{uuid.uuid4().hex[:12]}'
    now_event = {
        'id': session_id, 'payment_status': 'paid', 'status': 'complete',
        'currency': 'gbp', 'amount_total': 1000, 'amount_subtotal': 1000,
        'livemode': False, 'payment_intent': 'pi_payment_safety_test',
        'metadata': {'user_id': user_id}, 'total_details': {'amount_tax': 0},
    }
    event = {'id': 'evt_payment_safety_test', 'type': 'checkout.session.completed',
             'livemode': False, 'data': {'object': now_event}}

    async def run():
        client = AsyncIOMotorClient(_mongo_url)
        db = client[database_name]
        try:
            await db.payment_transactions.insert_one({
                'session_id': session_id, 'user_id': user_id, 'amount': 1000,
                'currency': 'gbp', 'kind': 'wallet_topup', 'status': 'initiated',
                'payment_status': 'pending', 'wallet_credited': False,
                'stripe_livemode': False,
            })
            monkeypatch.setattr(payments_routes, 'get_db', lambda: db)
            monkeypatch.setattr(payments_routes, '_require_stripe_configuration', lambda **_kwargs: 'test')
            monkeypatch.setattr(payments_routes.stripe.Webhook, 'construct_event', lambda *_args: event)
            monkeypatch.setenv('STRIPE_SECRET_KEY', 'sk_test_example')
            monkeypatch.setenv('STRIPE_PUBLISHABLE_KEY', 'pk_test_example')
            monkeypatch.setenv('STRIPE_MODE', 'test')
            monkeypatch.setenv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
            from routers import referral_routes
            from services import influencer_commissions
            monkeypatch.setattr('notifications.notify', AsyncMock())
            monkeypatch.setattr(referral_routes, 'record_verified_topup', AsyncMock())
            monkeypatch.setattr(influencer_commissions, 'record_topup_commission', AsyncMock())

            await payments_routes.stripe_webhook(_stripe_request(payload=b'{"test":true}', signature=b'test'))
            await payments_routes.stripe_webhook(_stripe_request(payload=b'{"test":true}', signature=b'test'))
            first_poll = await payments_routes.get_status(session_id)
            second_poll = await payments_routes.get_status(session_id)

            wallet = await db.wallets.find_one({'user_id': user_id}, {'_id': 0})
            txs = await db.wallet_tx.find({'user_id': user_id,
                                           'ref_order_id': f'stripe_checkout:{session_id}'},
                                          {'_id': 0}).to_list(10)
            payment = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0})
            assert first_poll['payment_status'] == second_poll['payment_status'] == 'paid'
            assert first_poll['wallet_credited'] is second_poll['wallet_credited'] is True
            assert wallet['balance'] == 10
            assert wallet.get('bonus', 0) == 0 and wallet.get('withdrawable', 0) == 0
            assert len(txs) == 1 and txs[0]['amount'] == 10 and txs[0]['purchased_amount'] == 10
            assert payment['wallet_credited'] is True
        finally:
            for collection in ('payment_transactions', 'wallets', 'wallet_tx', 'notifications'):
                await db[collection].delete_many({'$or': [{'user_id': user_id}, {'session_id': session_id},
                                                           {'ref_order_id': f'stripe_checkout:{session_id}'}]})
            client.close()
    asyncio.run(run())


def test_checkout_creates_server_priced_gbp_session_and_pending_record(monkeypatch):
    inserted = []
    created = {}
    class SessionFactory:
        @staticmethod
        def create(**kwargs):
            created.update(kwargs)
            return SimpleNamespace(id='cs_checkout_test', url='https://checkout.stripe.test/session', livemode=False)
    class PaymentCollection:
        async def insert_one(self, document):
            inserted.append(dict(document))
    db = type('DB', (), {'payment_transactions': PaymentCollection()})()
    monkeypatch.setattr(payments_routes.stripe.checkout.Session, 'create', SessionFactory.create)
    monkeypatch.setattr(payments_routes, 'require_verified_user', AsyncMock(return_value={
        'user_id': 'checkout-test-user', 'email': 'checkout@example.test',
    }))
    monkeypatch.setattr(payments_routes, 'get_db', lambda: db)
    monkeypatch.setattr(payments_routes, '_require_stripe_configuration', lambda: 'test')
    monkeypatch.setenv('PUBLIC_SITE_URL', 'https://prizeleague.co.uk')

    result = asyncio.run(payments_routes.create_topup_checkout(
        payments_routes.CheckoutRequest(lookup_key='wallet_topup_10', origin_url='https://prizeleague.test'),
        _request(),
    ))
    line = created['line_items'][0]['price_data']
    assert line['currency'] == 'gbp' and line['unit_amount'] == 1000
    assert created['success_url'].startswith('https://prizeleague.co.uk/')
    assert created['cancel_url'].startswith('https://prizeleague.co.uk/')
    assert 'attacker.example' not in created['success_url']
    assert created['metadata']['user_id'] == 'checkout-test-user'
    assert result == {'checkout_url': 'https://checkout.stripe.test/session', 'session_id': 'cs_checkout_test'}
    assert inserted[0]['amount'] == 1000 and inserted[0]['currency'] == 'gbp'
    assert inserted[0]['payment_status'] == 'pending'
    assert inserted[0].get('wallet_credited') is not True


def test_custom_checkout_ignores_caller_controlled_origin(monkeypatch):
    created = {}

    class SessionFactory:
        @staticmethod
        def create(**kwargs):
            created.update(kwargs)
            return SimpleNamespace(id='cs_custom_test', url='https://checkout.stripe.test/session', livemode=False)

    class PaymentCollection:
        async def insert_one(self, _document):
            return None

    db = type('DB', (), {'payment_transactions': PaymentCollection()})()
    monkeypatch.setattr(payments_routes.stripe.checkout.Session, 'create', SessionFactory.create)
    monkeypatch.setattr(payments_routes, 'require_verified_user', AsyncMock(return_value={
        'user_id': 'checkout-test-user', 'email': 'checkout@example.test',
    }))
    monkeypatch.setattr(payments_routes, 'get_db', lambda: db)
    monkeypatch.setattr(payments_routes, '_require_stripe_configuration', lambda: 'test')
    monkeypatch.setenv('PUBLIC_SITE_URL', 'https://prizeleague.co.uk')

    asyncio.run(payments_routes.create_custom_topup(
        payments_routes.CustomTopupRequest(amount=5, origin_url='https://attacker.example'),
        _request(),
    ))

    assert created['success_url'].startswith('https://prizeleague.co.uk/')
    assert created['cancel_url'].startswith('https://prizeleague.co.uk/')
    assert 'attacker.example' not in created['success_url']


@pytest.mark.parametrize('payment_status', ['failed', 'expired', 'refunded', 'disputed'])
def test_terminal_unpaid_payment_status_never_calls_stripe_or_credits(monkeypatch, payment_status):
    class PaymentCollection:
        async def find_one(self, *_args, **_kwargs):
            return {'session_id': 'cs_terminal', 'user_id': 'test-user', 'amount': 1000,
                    'currency': 'gbp', 'status': payment_status, 'payment_status': payment_status,
                    'wallet_credited': False}
    db = type('DB', (), {'payment_transactions': PaymentCollection()})()
    monkeypatch.setattr(payments_routes, 'get_db', lambda: db)
    monkeypatch.setattr(payments_routes, '_require_stripe_configuration', lambda: pytest.fail('terminal payment queried Stripe'))
    monkeypatch.setattr(payments_routes.stripe.checkout.Session, 'retrieve', lambda *_args: pytest.fail('terminal payment queried Stripe'))
    credit = AsyncMock()
    monkeypatch.setattr(payments_routes, '_credit_wallet_once', credit)
    result = asyncio.run(payments_routes.get_status('cs_terminal'))
    assert result['payment_status'] == payment_status and result['wallet_credited'] is False
    credit.assert_not_awaited()