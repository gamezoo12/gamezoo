"""Backend mobile-OTP gate: new unverified users are blocked server-side from
gameplay / contest entry / checkout / top-ups; verified, legacy and staff are not.

Runs against the dev server with TEST_OTP_BYPASS_CODE (000000) and the dev Mongo.
"""
import os
import time
import uuid
import requests
import subprocess
import json

BASE = (os.environ.get('REACT_APP_BACKEND_URL') or 'http://localhost:8001').rstrip('/')
API = f'{BASE}/api'
OTP = os.environ.get('TEST_OTP_BYPASS_CODE', '000000')
MONGO = os.environ.get('MONGO_URL', 'mongodb://localhost:27017') + '/' + os.environ.get('DB_NAME', 'test_database')

SID = 'sess_' + 'x' * 12
GATED = [
    ('post', '/world/contest/enter', None),
    ('post', '/world/session/start', {'level': 1}),
    ('post', '/world/session/begin', {'session_id': SID}),
    ('post', '/world/session/submit', {'session_id': SID, 'duration_ms': 5000, 'accuracy': 1.0}),
    ('post', '/world/champion/session/start', {}),
    ('post', '/world/champion/session/begin', {'session_id': SID}),
    ('post', '/world/champion/session/submit', {'session_id': SID, 'duration_ms': 5000}),
    ('post', '/world/token/retry/reserve', {'level': 1}),
    ('post', '/world/token/unlock/reserve', {'level': 2}),
    ('post', '/winnings/challenge/start', {}),
    ('post', '/orders/checkout', {'items': [{'contest_id': 'c', 'qty': 1, 'skill_answer': '1'}]}),
    ('post', '/games/submit', {'ticket_id': 't', 'duration_ms': 1000, 'accuracy': 1.0}),
    ('post', '/payments/wallet-topup/custom', {'amount': 5, 'origin_url': 'http://localhost'}),
    ('post', '/promotion/join', None),
    ('post', '/promotion/campaigns/any-campaign/claim', None),
    ('post', '/cashout/request', {'amount_tokens': 1, 'bank_account_id': 'test'}),
    ('post', '/winnings/withdraw', {'amount_pence': 1, 'account_holder': 'Test', 'sort_code': '000000', 'account_number': '00000000'}),
]


def _mongo(js: str) -> str:
    return subprocess.check_output(['mongosh', '--quiet', MONGO, '--eval', js], text=True)


def _insert_user(method='google', verified=False, created='now', role='user'):
    uid = 'gate_' + uuid.uuid4().hex[:10]
    token = 'tok_' + uuid.uuid4().hex
    created_js = 'new Date()' if created == 'now' else f'new Date("{created}")'
    _mongo(f'''
    db.users.insertOne({{user_id:"{uid}",email:"{uid}@example.test",name:"Gate Test",role:"{role}",method:"{method}",
      phone_verified:{str(verified).lower()},created_at:{created_js}}});
    db.user_sessions.insertOne({{session_token:"{token}",user_id:"{uid}",expires_at:new Date(Date.now()+86400000)}});''')
    return uid, {'Authorization': f'Bearer {token}'}


def _cleanup(uid):
    _mongo(f'db.users.deleteOne({{user_id:"{uid}"}}); db.user_sessions.deleteMany({{user_id:"{uid}"}});')


def _call(headers, method, path, body):
    return requests.request(method, API + path, json=body, headers=headers, timeout=30)


def _is_gate(r):
    try:
        return r.status_code == 403 and r.json()['detail']['code'] == 'PHONE_VERIFICATION_REQUIRED'
    except Exception:
        return False


def test_new_unverified_google_user_blocked_everywhere_then_unblocked_after_otp():
    uid, h = _insert_user(method='google', verified=False)
    try:
        for m, p, b in GATED:
            r = _call(h, m, p, b)
            assert _is_gate(r), f'{p} not gated: {r.status_code} {r.text[:150]}'
        me = requests.get(f'{API}/auth/me', headers=h, timeout=30).json()
        assert me['phone_verification_required'] is True and me['phone_verified'] is False

        phone = '+1555' + ''.join(c for c in uuid.uuid4().hex if c.isdigit())[:7].ljust(7, '1')
        r = requests.post(f'{API}/auth/otp/verify-bind', json={'phone': phone, 'code': OTP}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        doc = json.loads(_mongo(f'JSON.stringify(db.users.findOne({{user_id:"{uid}"}},{{_id:0,phone_verified:1,phone_verified_at:1}}))'))
        assert doc['phone_verified'] is True and doc.get('phone_verified_at')

        for m, p, b in GATED:
            r = _call(h, m, p, b)
            assert not _is_gate(r), f'{p} still gated after OTP'
    finally:
        _cleanup(uid)


def test_mock_wallet_topup_is_not_available():
    # The mock endpoint must be invisible (404) for everyone unless explicitly opted in for dev.
    for verified in (False, True):
        uid, h = _insert_user(method='email', verified=verified)
        try:
            r = _call(h, 'post', '/wallet/topup', {'amount': 5})
            assert r.status_code == 404, r.text
        finally:
            _cleanup(uid)


def test_legacy_unverified_not_blocked_and_not_auto_verified():
    uid, h = _insert_user(method='email', verified=False, created='2026-01-01T00:00:00Z')
    try:
        for m, p, b in GATED:
            assert not _is_gate(_call(h, m, p, b)), f'legacy user blocked at {p}'
        doc = json.loads(_mongo(f'JSON.stringify(db.users.findOne({{user_id:"{uid}"}},{{_id:0,phone_verified:1}}))'))
        assert doc['phone_verified'] is False
    finally:
        _cleanup(uid)


def test_legacy_unverified_google_user_is_blocked():
    uid, h = _insert_user(method='google', verified=False, created='2026-01-01T00:00:00Z')
    try:
        for m, p, b in GATED:
            r = _call(h, m, p, b)
            assert _is_gate(r), f'legacy google user not gated at {p}: {r.status_code}'
        me = requests.get(f'{API}/auth/me', headers=h, timeout=30).json()
        assert me['phone_verification_required'] is True
    finally:
        _cleanup(uid)


def test_verified_user_not_blocked():
    uid, h = _insert_user(method='email', verified=True)
    try:
        for m, p, b in GATED:
            assert not _is_gate(_call(h, m, p, b)), p
    finally:
        _cleanup(uid)


def test_register_requires_phone_and_otp():
    email = f'gate_{int(time.time() * 1000)}@example.com'
    base = {'email': email, 'password': 'Passw0rd!x', 'name': 'Gate Reg', 'accept_terms': True, 'dob': '1990-01-01'}
    r = requests.post(f'{API}/auth/register', json=base, timeout=30)
    assert r.status_code in (400, 422), r.text
    r = requests.post(f'{API}/auth/register', json={**base, 'phone': '+15550001234'}, timeout=30)
    assert r.status_code in (400, 422), r.text
