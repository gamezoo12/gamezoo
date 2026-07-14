"""Prize League — Stripe wallet top-up (Flow A / claimable sandbox) tests.

Covers:
  - POST /api/payments/wallet-topup/checkout (auth required, all 4 lookup keys, unknown key rejection)
  - Payment_transactions record insertion (status, payment_status, amount pence, currency, kind)
  - GET /api/payments/status/{session_id} (public, pending → paid, idempotent wallet credit)
  - POST /api/stripe/webhook invalid signature → 400
  - Regression: POST /api/wallet/topup (mock) still works
"""
import os
import time
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()['token']


@pytest.fixture(scope='module')
def fresh_user():
    ts = int(time.time() * 1000)
    email = f'TEST_stripe_{ts}@example.com'
    r = requests.post(f'{BASE_URL}/api/auth/register', json={'email': email, 'name': 'Stripe Tester', 'password': 'Password123!'}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    return {'email': email, 'token': data['token'], 'user_id': data['user']['user_id']}


# ---------- Auth guard ----------
class TestCheckoutAuth:
    def test_unauth_returns_401(self):
        r = requests.post(
            f'{BASE_URL}/api/payments/wallet-topup/checkout',
            json={'lookup_key': 'wallet_topup_10', 'origin_url': BASE_URL},
            timeout=30,
        )
        assert r.status_code in (401, 403), f'expected 401/403, got {r.status_code}: {r.text}'


# ---------- Checkout: 4 valid keys ----------
@pytest.mark.parametrize('lookup_key,expected_gbp', [
    ('wallet_topup_10', 10.0),
    ('wallet_topup_20', 20.0),
    ('wallet_topup_50', 50.0),
    ('wallet_topup_100', 100.0),
])
def test_checkout_all_four_packages(fresh_user, lookup_key, expected_gbp):
    r = requests.post(
        f'{BASE_URL}/api/payments/wallet-topup/checkout',
        json={'lookup_key': lookup_key, 'origin_url': BASE_URL},
        headers=_auth(fresh_user['token']),
        timeout=30,
    )
    assert r.status_code == 200, f'{lookup_key}: {r.status_code} {r.text}'
    body = r.json()
    assert 'checkout_url' in body
    assert body['checkout_url'].startswith('https://checkout.stripe.com/'), body['checkout_url']
    assert 'session_id' in body
    assert body['session_id'].startswith('cs_'), body['session_id']

    # Verify /status returns amount matching this lookup key
    sid = body['session_id']
    r2 = requests.get(f'{BASE_URL}/api/payments/status/{sid}', timeout=30)
    assert r2.status_code == 200, r2.text
    s = r2.json()
    assert s['session_id'] == sid
    assert s['status'] == 'initiated'
    assert s['payment_status'] == 'pending'
    assert s['wallet_credited'] is False
    assert s['amount_gbp'] == expected_gbp


# ---------- Unknown lookup key ----------
def test_checkout_unknown_key_rejected(fresh_user):
    r = requests.post(
        f'{BASE_URL}/api/payments/wallet-topup/checkout',
        json={'lookup_key': 'wallet_topup_999', 'origin_url': BASE_URL},
        headers=_auth(fresh_user['token']),
        timeout=30,
    )
    assert r.status_code == 400, f'expected 400, got {r.status_code}: {r.text}'


# ---------- Status endpoint is public ----------
def test_status_endpoint_is_public(fresh_user):
    # first create a session
    r = requests.post(
        f'{BASE_URL}/api/payments/wallet-topup/checkout',
        json={'lookup_key': 'wallet_topup_10', 'origin_url': BASE_URL},
        headers=_auth(fresh_user['token']),
        timeout=30,
    )
    assert r.status_code == 200
    sid = r.json()['session_id']

    # hit /status without auth header
    r2 = requests.get(f'{BASE_URL}/api/payments/status/{sid}', timeout=30)
    assert r2.status_code == 200, r2.text


def test_status_unknown_session_404():
    r = requests.get(f'{BASE_URL}/api/payments/status/cs_test_notreal_xyz', timeout=30)
    assert r.status_code == 404


# ---------- End-to-end simulated paid flow: idempotency ----------
async def _flip_to_paid(session_id):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.payment_transactions.update_one(
        {'session_id': session_id},
        {'$set': {'status': 'completed', 'payment_status': 'paid'}},
    )
    client.close()


async def _read_tx(session_id):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = await db.payment_transactions.find_one({'session_id': session_id}, {'_id': 0})
    client.close()
    return doc


def test_paid_flow_credits_wallet_once_idempotent(fresh_user):
    # Get starting balance
    r0 = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(fresh_user['token']), timeout=30)
    assert r0.status_code == 200
    start_balance = r0.json()['balance']

    # Create checkout session for £20
    r = requests.post(
        f'{BASE_URL}/api/payments/wallet-topup/checkout',
        json={'lookup_key': 'wallet_topup_20', 'origin_url': BASE_URL},
        headers=_auth(fresh_user['token']),
        timeout=30,
    )
    assert r.status_code == 200
    sid = r.json()['session_id']

    # Verify DB tx was inserted with expected shape
    tx = asyncio.run(_read_tx(sid))
    assert tx is not None
    assert tx['status'] == 'initiated'
    assert tx['payment_status'] == 'pending'
    assert tx['kind'] == 'wallet_topup'
    assert tx['amount'] == 2000  # £20 in pence
    assert tx['currency'] == 'gbp'
    assert tx['user_id'] == fresh_user['user_id']

    # Flip to paid in DB
    asyncio.run(_flip_to_paid(sid))

    # Hit /status 3 times — wallet should credit exactly once
    balances = []
    credited_flags = []
    for i in range(3):
        rs = requests.get(f'{BASE_URL}/api/payments/status/{sid}', timeout=30)
        assert rs.status_code == 200
        s = rs.json()
        credited_flags.append(s['wallet_credited'])
        rw = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(fresh_user['token']), timeout=30)
        assert rw.status_code == 200
        balances.append(rw.json()['balance'])
        time.sleep(0.3)

    # After first status call, wallet_credited should be True and balance += 20
    assert credited_flags[0] is True
    assert credited_flags[1] is True
    assert credited_flags[2] is True

    # Balance should be exactly start + 20, and NOT increase on subsequent polls
    assert balances[0] == round(start_balance + 20.0, 2), f'balances={balances}, start={start_balance}'
    assert balances[1] == balances[0], f'idempotency broken: {balances}'
    assert balances[2] == balances[0], f'idempotency broken: {balances}'

    # Verify transaction history has a topup row with Stripe note
    rtx = requests.get(f'{BASE_URL}/api/wallet/transactions', headers=_auth(fresh_user['token']), timeout=30)
    assert rtx.status_code == 200
    txs = rtx.json()['transactions']
    stripe_topups = [t for t in txs if t.get('kind') == 'topup' and 'Stripe' in (t.get('note') or '')]
    assert len(stripe_topups) >= 1, f'no Stripe topup tx: {txs}'
    assert stripe_topups[0]['amount'] == 20.0


# ---------- Webhook signature ----------
def test_webhook_invalid_signature_returns_400():
    r = requests.post(
        f'{BASE_URL}/api/stripe/webhook',
        data=b'{"id":"evt_fake","type":"checkout.session.completed","data":{"object":{"id":"cs_x"}}}',
        headers={'stripe-signature': 'bogus', 'Content-Type': 'application/json'},
        timeout=30,
    )
    assert r.status_code == 400, f'expected 400, got {r.status_code}: {r.text}'
    assert 'signature' in r.text.lower() or 'invalid' in r.text.lower()


# ---------- Regression: mock /api/wallet/topup still works ----------
def test_mock_wallet_topup_regression(fresh_user):
    # top up 15 via legacy mock endpoint
    r = requests.post(
        f'{BASE_URL}/api/wallet/topup',
        json={'amount': 15},
        headers=_auth(fresh_user['token']),
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get('ok') is True
    assert 'balance' in body
