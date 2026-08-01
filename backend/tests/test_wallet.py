"""Wallet: top-up validation, balance, admin list/adjust, checkout enforcement."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'


# ---------- shared helpers ----------
def _register(session, email, name, password='Password123!', referral_code=None):
    payload = {'email': email, 'name': name, 'password': password}
    if referral_code:
        payload['referral_code'] = referral_code
    r = session.post(f'{BASE_URL}/api/auth/register', json=payload, timeout=30)
    return r


def _login(session, email, password):
    r = session.post(f'{BASE_URL}/api/auth/login', json={'email': email, 'password': password}, timeout=30)
    return r


def _auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='module')
def new_user():
    s = requests.Session()
    ts = int(time.time() * 1000)
    email = f'test_wallet_{ts}@example.com'
    r = _register(s, email, 'Wallet Tester')
    assert r.status_code == 200, f'register failed: {r.status_code} {r.text}'
    data = r.json()
    return {'session': s, 'email': email, 'token': data['token'], 'user': data['user']}


@pytest.fixture(scope='module')
def admin_token():
    s = requests.Session()
    r = _login(s, ADMIN_EMAIL, ADMIN_PASS)
    assert r.status_code == 200, f'admin login failed: {r.text}'
    return r.json()['token']


# ---------- Player wallet endpoints ----------
class TestWalletTopup:
    def test_topup_below_minimum_returns_422(self, new_user):
        # Token system: minimum is 5 tokens (was 10 in legacy money mode).
        r = requests.post(
            f'{BASE_URL}/api/wallet/topup',
            json={'amount': 4},
            headers=_auth_headers(new_user['token']),
            timeout=30,
        )
        assert r.status_code == 422, f'expected 422, got {r.status_code}: {r.text}'

    def test_topup_25_success_sets_balance(self, new_user):
        r = requests.post(
            f'{BASE_URL}/api/wallet/topup',
            json={'amount': 25},
            headers=_auth_headers(new_user['token']),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get('ok') is True
        assert body.get('balance') == 25.0

    def test_get_wallet_me_reflects_topup(self, new_user):
        r = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth_headers(new_user['token']), timeout=30)
        assert r.status_code == 200
        w = r.json()
        assert w['balance'] == 25.0
        assert w['lifetime_topup'] == 25.0
        assert w['lifetime_spend'] == 0.0
        assert '_id' not in w  # no mongodb oid leak

    def test_transactions_include_topup(self, new_user):
        r = requests.get(f'{BASE_URL}/api/wallet/transactions', headers=_auth_headers(new_user['token']), timeout=30)
        assert r.status_code == 200
        txs = r.json()['transactions']
        assert len(txs) >= 1
        assert txs[0]['kind'] == 'topup'
        assert txs[0]['amount'] == 25.0
        assert txs[0]['balance_after'] == 25.0

    def test_topup_over_max_returns_422(self, new_user):
        r = requests.post(
            f'{BASE_URL}/api/wallet/topup',
            json={'amount': 100000},
            headers=_auth_headers(new_user['token']),
            timeout=30,
        )
        assert r.status_code == 422


# ---------- Admin wallet endpoints (self-contained so xdist works across classes) ----------
@pytest.fixture(scope='class')
def admin_scoped_user():
    s = requests.Session()
    ts = int(time.time() * 1000)
    email = f'test_wa_{ts}@example.com'
    r = _register(s, email, 'AdminWallet Tester')
    assert r.status_code == 200, r.text
    data = r.json()
    # top up 20 so we have a balance to inspect
    r2 = requests.post(
        f'{BASE_URL}/api/wallet/topup',
        json={'amount': 20},
        headers=_auth_headers(data['token']),
        timeout=30,
    )
    assert r2.status_code == 200
    return {'email': email, 'token': data['token'], 'user': data['user']}


class TestAdminWallet:
    def test_admin_list_wallets(self, admin_token, admin_scoped_user):
        r = requests.get(f'{BASE_URL}/api/admin/wallets?limit=1000', headers=_auth_headers(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert 'wallets' in body and 'totals' in body
        uids = [w['user_id'] for w in body['wallets']]
        assert admin_scoped_user['user']['user_id'] in uids

    def test_non_admin_cannot_list(self, admin_scoped_user):
        r = requests.get(f'{BASE_URL}/api/admin/wallets', headers=_auth_headers(admin_scoped_user['token']), timeout=30)
        assert r.status_code == 403

    def test_admin_adjust_credit(self, admin_token, admin_scoped_user):
        r = requests.post(
            f'{BASE_URL}/api/admin/wallets/adjust',
            json={'user_id': admin_scoped_user['user']['user_id'], 'amount': 5.0, 'note': 'TEST adjust'},
            headers=_auth_headers(admin_token),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        assert body['balance'] == 25.0  # was 20, +5

    def test_admin_adjust_debit_below_zero_rejected(self, admin_token, admin_scoped_user):
        r = requests.post(
            f'{BASE_URL}/api/admin/wallets/adjust',
            json={'user_id': admin_scoped_user['user']['user_id'], 'amount': -1000.0, 'note': 'TEST overshoot'},
            headers=_auth_headers(admin_token),
            timeout=30,
        )
        assert r.status_code == 400
