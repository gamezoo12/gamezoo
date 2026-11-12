# Iteration 69: Worldwide registration & country management (country policy, signup rules, restrictions, admin APIs)
import os
import random
import string
import subprocess
import time

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f'{BASE_URL}/api'
ADMIN = ('bachanta8@gmail.com', 'Herts@910022')
PLAYER1 = ('player1@example.com', 'Player@12345')
INTL = ('intl.tester1@example.com', 'Intl@12345')
_db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
CREATED_EMAILS = []


def _rand():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))


def _seed(*dest):
    subprocess.run(['python3', '/app/tests/seed_otp_approval.py', *dest], check=True, capture_output=True)


def _login(email, pw):
    r = requests.post(f'{API}/auth/login', json={'email': email, 'password': pw}, timeout=30)
    return r


def _h(tok):
    return {'Authorization': f'Bearer {tok}'}


@pytest.fixture(scope='module')
def admin_h():
    r = _login(*ADMIN)
    if r.status_code != 200:
        pytest.skip(f'admin login failed {r.status_code}')
    return _h(r.json()['token'])


@pytest.fixture(scope='module')
def intl_h():
    r = _login(*INTL)
    if r.status_code != 200:
        pytest.skip(f'intl login failed {r.status_code} {r.text}')
    return _h(r.json()['token'])


@pytest.fixture(scope='module', autouse=True)
def cleanup():
    yield
    for e in CREATED_EMAILS:
        _db.users.delete_one({'email': e})
    _db.country_change_requests.delete_many({'email': INTL[0]})
    _db.users.update_one({'email': INTL[0]}, {'$set': {'country_of_residence': 'US'}})


def _register(email, country, phone=None, otp=None, dob='1990-01-01'):
    body = {'email': email, 'password': 'Test@12345', 'name': 'TEST User', 'email_otp_code': '246810',
            'country_of_residence': country, 'accept_terms': True, 'dob': dob}
    if phone:
        body['phone'] = phone
    if otp:
        body['otp_code'] = otp
    return requests.post(f'{API}/auth/register', json=body, timeout=30)


# --- Public country endpoints
class TestPublicCountries:
    def test_list(self):
        r = requests.get(f'{API}/countries', timeout=20)
        assert r.status_code == 200
        cs = r.json()['countries']
        assert len(cs) >= 245
        codes = {c['code'] for c in cs}
        assert {'GB', 'US', 'DE', 'FR'} <= codes

    def test_rules_gb_us(self):
        gb = requests.get(f'{API}/countries/GB/signup-rules', timeout=20).json()
        us = requests.get(f'{API}/countries/US/signup-rules', timeout=20).json()
        assert gb['require_phone_otp'] is True and gb['prize_notice'] is None
        assert us['require_phone_otp'] is False and 'UK residents' in us['prize_notice']
        assert requests.get(f'{API}/countries/ZZ/signup-rules', timeout=20).status_code == 422

    def test_sms_blocked_for_us(self):
        r = requests.post(f'{API}/auth/otp/send', json={'phone': '+12025550123', 'country': 'US'}, timeout=20)
        assert r.status_code == 403, r.text

    def test_sms_uk_rejects_non_uk_number(self):
        r = requests.post(f'{API}/auth/otp/send', json={'phone': '+12025550123', 'country': 'GB'}, timeout=20)
        assert r.status_code in (400, 422), r.text


# --- International and UK signup
class TestSignup:
    def test_intl_signup_de(self):
        email = f'newintl_{_rand()}@example.com'
        _seed(email)
        r = _register(email, 'DE')
        assert r.status_code == 200, r.text
        CREATED_EMAILS.append(email)
        tok = r.json().get('token')
        me = requests.get(f'{API}/auth/me', headers=_h(tok), timeout=20).json()
        assert me['country_of_residence'] == 'DE'
        assert me['phone_verification_required'] is False
        ca = me['country_access']
        assert ca['restriction_code'] == 'COUNTRY_RESTRICTED'
        for k in ('allow_paid_contests', 'allow_free_world_prizes', 'allow_promo_draws', 'allow_wallet_topups', 'allow_prize_claims'):
            assert ca['permissions'][k] is False
        assert ca['permissions']['allow_free_games'] is True

    def test_uk_signup_phone_required_and_duplicate(self):
        email = f'ukuser_{_rand()}@example.com'
        phone = f'+4477009{random.randint(10000, 99999)}'
        _seed(email, phone)
        r = _register(email, 'GB')
        assert r.status_code == 422 and 'Phone number is required' in r.text
        r = _register(email, 'GB', phone, '246810')
        assert r.status_code == 200, r.text
        CREATED_EMAILS.append(email)
        me = requests.get(f'{API}/auth/me', headers=_h(r.json()['token']), timeout=20).json()
        assert me['country_of_residence'] == 'GB'
        assert all(me['country_access']['permissions'].values()), me['country_access']
        assert me['country_access']['restriction_code'] is None
        email2 = f'ukuser_{_rand()}@example.com'
        _seed(email2, phone)
        r2 = _register(email2, 'GB', phone, '246810')
        if r2.status_code == 200:
            CREATED_EMAILS.append(email2)
        assert r2.status_code == 400, r2.text

    def test_invalid_country(self):
        r = _register(f'x_{_rand()}@example.com', 'ZZ')
        assert r.status_code == 422


# --- Restrictions for intl user
class TestIntlRestrictions:
    @pytest.mark.parametrize('path,body', [
        ('/orders/checkout', {'items': []}),
        ('/payments/wallet-topup/checkout', {'lookup_key': 'wallet_topup_10', 'origin_url': BASE_URL}),
        ('/wallet/topup', {'amount': 10}),
        ('/cashout/request', {'amount_tokens': 10, 'bank_account_id': 'x'}),
        ('/winnings/withdraw', {'amount_pence': 1000, 'account_holder': 'T', 'sort_code': '112233', 'account_number': '12345678'}),
        ('/promotion/join', None),
        ('/world/champion/session/start', {}),
    ])
    def test_blocked(self, intl_h, path, body):
        r = requests.post(f'{API}{path}', json=body, headers=intl_h, timeout=30)
        if path == '/wallet/topup' and r.status_code == 404:
            pytest.skip('mock wallet topup disabled in this environment (404 by design)')
        assert r.status_code == 403, f'{path}: {r.status_code} {r.text[:200]}'
        assert 'COUNTRY_RESTRICTED' in r.text or 'UK residents' in r.text, r.text[:300]

    def test_free_world_not_country_blocked(self, intl_h):
        r = requests.post(f'{API}/world/session/start', json={'level': 1}, headers=intl_h, timeout=30)
        assert 'COUNTRY_' not in r.text, r.text[:300]
        print('free world start', r.status_code, r.text[:200])


# --- Existing user without country (player1)
class TestPlayer1CountryPrompt:
    def test_prompt_and_set(self):
        _db.users.update_one({'email': PLAYER1[0]}, {'$unset': {'country_of_residence': '', 'country_set_at': '', 'country_set_source': ''}})
        tok = _login(*PLAYER1).json()['token']
        me = requests.get(f'{API}/auth/me', headers=_h(tok), timeout=20).json()
        assert me['country_access']['restriction_code'] == 'COUNTRY_REQUIRED'
        assert me['country_access']['permissions']['allow_paid_contests'] is False
        r = requests.post(f'{API}/auth/country', json={'country': 'GB'}, headers=_h(tok), timeout=20)
        assert r.status_code == 200, r.text
        r2 = requests.post(f'{API}/auth/country', json={'country': 'GB'}, headers=_h(tok), timeout=20)
        assert r2.status_code == 409
        me = requests.get(f'{API}/auth/me', headers=_h(tok), timeout=20).json()
        print('player1 access after GB:', me['country_access'])
        assert me['country_access']['permissions']['allow_paid_contests'] is True, \
            f"player1 still restricted (dob={me.get('dob')}): {me['country_access']}"


# --- Country change request + admin approve
class TestChangeRequest:
    def test_flow(self, intl_h, admin_h):
        _db.country_change_requests.delete_many({'email': INTL[0], 'status': 'pending'})
        r = requests.post(f'{API}/auth/country/change-request', json={'country': 'GB', 'reason': 'moved'}, headers=intl_h, timeout=20)
        assert r.status_code == 200, r.text
        rid = r.json()['request']['request_id']
        assert r.json()['request']['status'] == 'pending'
        r2 = requests.post(f'{API}/auth/country/change-request', json={'country': 'GB'}, headers=intl_h, timeout=20)
        assert r2.status_code == 409
        lst = requests.get(f'{API}/admin/countries/change-requests', headers=admin_h, timeout=20).json()['requests']
        assert any(x['request_id'] == rid for x in lst)
        d = requests.post(f'{API}/admin/countries/change-requests/{rid}', json={'approve': True}, headers=admin_h, timeout=20)
        assert d.status_code == 200
        d2 = requests.post(f'{API}/admin/countries/change-requests/{rid}', json={'approve': True}, headers=admin_h, timeout=20)
        assert d2.status_code == 404
        me = requests.get(f'{API}/auth/me', headers=intl_h, timeout=20).json()
        assert me['country_of_residence'] == 'GB'
        assert me['country_access']['restriction_code'] == 'COUNTRY_RESTRICTED'
        audit = requests.get(f'{API}/admin/countries/audit', headers=admin_h, timeout=20).json()['entries']
        assert any(a['action'] == 'country_change_approved' for a in audit[:20])


# --- Admin policy API
class TestAdminPolicy:
    def test_non_admin(self, intl_h):
        assert requests.get(f'{API}/admin/countries/policies', headers=intl_h, timeout=20).status_code in (401, 403)
        assert requests.get(f'{API}/admin/countries/policies', timeout=20).status_code in (401, 403)

    def test_policies_list(self, admin_h):
        d = requests.get(f'{API}/admin/countries/policies', headers=admin_h, timeout=30).json()
        assert len(d['permissions']) == 13
        gb = next(c for c in d['countries'] if c['code'] == 'GB')
        us = next(c for c in d['countries'] if c['code'] == 'US')
        assert all(gb[k['key']] for k in d['permissions'])
        assert us['allow_paid_contests'] is False and us['allow_registration'] is True and us['require_phone_otp'] is False

    def test_fr_login_block(self, admin_h):
        email = f'frtest_{_rand()}@example.com'
        _seed(email)
        r = _register(email, 'FR')
        assert r.status_code == 200, r.text
        CREATED_EMAILS.append(email)
        try:
            r = requests.put(f'{API}/admin/countries/policies', json={'codes': ['FR'], 'changes': {'allow_login': False}}, headers=admin_h, timeout=20)
            assert r.status_code == 428
            r = requests.put(f'{API}/admin/countries/policies', json={'codes': ['FR'], 'changes': {'allow_login': False}, 'confirm': True}, headers=admin_h, timeout=20)
            assert r.status_code == 200
            blocked = None
            for _ in range(4):
                lr = requests.post(f'{API}/auth/login', json={'email': email, 'password': 'Test@12345'}, timeout=20)
                blocked = lr.status_code
                if blocked == 403:
                    break
                time.sleep(6)
            assert blocked == 403
        finally:
            requests.post(f'{API}/admin/countries/policies/reset', json={'codes': ['FR']}, headers=admin_h, timeout=20)
        time.sleep(16)
        assert requests.post(f'{API}/auth/login', json={'email': email, 'password': 'Test@12345'}, timeout=20).status_code == 200

    def test_default_and_audit(self, admin_h):
        r = requests.put(f'{API}/admin/countries/default', json={'changes': {'allow_free_games': False}}, headers=admin_h, timeout=20)
        assert r.status_code == 428
        r = requests.put(f'{API}/admin/countries/default', json={'changes': {'sms_alert_at': 0}}, headers=admin_h, timeout=20)
        assert r.status_code == 200
        r = requests.put(f'{API}/admin/countries/default', json={'changes': {'bogus': True}}, headers=admin_h, timeout=20)
        assert r.status_code == 422
        audit = requests.get(f'{API}/admin/countries/audit', headers=admin_h, timeout=20).json()['entries']
        assert any(a['action'] == 'update_default' for a in audit[:10])
        assert any(a['action'] == 'update_countries' and 'FR' in a['codes'] for a in audit[:20])


# --- Admin analytics / export / OTP
class TestAdminAnalytics:
    def test_analytics(self, admin_h):
        r = requests.get(f'{API}/admin/countries/analytics?days=30', headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        assert isinstance(r.json()['countries'], list)

    @pytest.mark.parametrize('ds', ['users', 'wallet', 'tickets', 'promotions', 'withdrawals'])
    def test_export(self, admin_h, ds):
        r = requests.get(f'{API}/admin/countries/export?dataset={ds}&country=US', headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        assert 'text/csv' in r.headers['content-type']
        assert r.text.splitlines()[0].startswith('public_id')

    def test_export_bad(self, admin_h):
        assert requests.get(f'{API}/admin/countries/export?dataset=bad', headers=admin_h, timeout=20).status_code == 422

    def test_otp(self, admin_h):
        r = requests.get(f'{API}/admin/countries/otp', headers=admin_h, timeout=60)
        assert r.status_code == 200
        d = r.json()
        print('twilio this month:', d['twilio_this_month'])
        assert 'sms_by_country' in d and 'twilio_this_month' in d
