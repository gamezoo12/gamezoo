"""Checkout: enforces wallet balance (402 if insufficient), debits wallet on success."""
import os
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=30)
    assert r.status_code == 200
    return r.json()['token']


@pytest.fixture(scope='module')
def live_cheap_contest(admin_token):
    end_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    payload = {
        'title': 'TEST Wallet Checkout Contest',
        'category': 'prize-draws',
        'price': 1.0,
        'tickets_total': 100,
        'prize_amount': 50.0,
        'end_date': end_date,
        'image': 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg',
        'skill_question': {'q': '2+2?', 'options': ['3', '4', '5'], 'answer': '4', 'type': 'math'},
        'status': 'live',
    }
    r = requests.post(f'{BASE_URL}/api/admin/contests', json=payload, headers=_auth(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    contest = r.json()['contest']
    yield contest
    try:
        requests.delete(f'{BASE_URL}/api/admin/contests/{contest["contest_id"]}', headers=_auth(admin_token), timeout=30)
    except Exception:
        pass


@pytest.fixture(scope='module')
def fresh_user():
    ts = int(time.time() * 1000)
    email = f'test_ck_{ts}@example.com'
    r = requests.post(f'{BASE_URL}/api/auth/register', json={'email': email, 'name': 'Checkout Guy', 'password': 'Password123!'}, timeout=30)
    assert r.status_code == 200
    return {'email': email, 'token': r.json()['token'], 'user_id': r.json()['user']['user_id']}


class TestCheckoutWallet:
    def test_empty_wallet_returns_402(self, fresh_user, live_cheap_contest):
        r = requests.post(
            f'{BASE_URL}/api/orders/checkout',
            json={'items': [{'contest_id': live_cheap_contest['contest_id'], 'qty': 1, 'skill_answer': '4'}]},
            headers=_auth(fresh_user['token']),
            timeout=30,
        )
        assert r.status_code == 402, f'expected 402, got {r.status_code}: {r.text}'
        assert 'wallet' in r.text.lower() or 'insufficient' in r.text.lower()

    def test_topup_then_checkout_debits_wallet(self, fresh_user, live_cheap_contest):
        # top up 25
        r = requests.post(f'{BASE_URL}/api/wallet/topup', json={'amount': 25}, headers=_auth(fresh_user['token']), timeout=30)
        assert r.status_code == 200
        assert r.json()['balance'] == 25.0
        # checkout 1x£1
        r2 = requests.post(
            f'{BASE_URL}/api/orders/checkout',
            json={'items': [{'contest_id': live_cheap_contest['contest_id'], 'qty': 1, 'skill_answer': '4'}]},
            headers=_auth(fresh_user['token']),
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body['method'] == 'wallet'
        assert body['total'] == 1.0
        # wallet balance now 24
        r3 = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(fresh_user['token']), timeout=30)
        assert r3.status_code == 200
        assert r3.json()['balance'] == 24.0
        # spend tx present
        r4 = requests.get(f'{BASE_URL}/api/wallet/transactions', headers=_auth(fresh_user['token']), timeout=30)
        txs = r4.json()['transactions']
        assert any(t['kind'] == 'spend' and t['amount'] == -1.0 for t in txs), f'no spend tx: {txs}'
