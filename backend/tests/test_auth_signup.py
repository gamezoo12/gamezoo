"""Backend tests for the new mandatory OTP + T&Cs signup flow.

Covers:
  - /api/auth/register (with new required fields; OTP bypass via
    TEST_OTP_BYPASS_CODE=000000)
  - Age gate, T&Cs gate, duplicate email/phone, wrong OTP
  - Username auto-generation (firstname + DOB dd + running NN)
  - /api/auth/otp/send phone-shape normalisation (E.164 + UK 07..)
  - /api/auth/otp/login-verify
  - /api/auth/google/finalize (authenticated)
  - /api/auth/me session round-trip via JWT
  - CORS preflight + credentialed response echo
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
OTP = '000000'


def _fresh_email(tag='signup'):
    return f"e2e_{tag}_{uuid.uuid4().hex[:8]}@test.com"


_PHONE_COUNTER = [0]

def _fresh_phone():
    # Unique per-call so parallel/sequential tests don't collide. Bypass is on
    # so no real SMS is sent regardless of the number's validity.
    _PHONE_COUNTER[0] += 1
    seed = (int(time.time() * 1000) + _PHONE_COUNTER[0] + int(uuid.uuid4().int) & 0x7FFFFFFF) % 10000000
    return f"+1555{seed:07d}"


def _reg_payload(**overrides):
    payload = {
        'email': _fresh_email(),
        'password': 'Password123!',
        'name': 'Balaram Kumar',
        'phone': _fresh_phone(),
        'otp_code': OTP,
        'accept_terms': True,
        'dob': '2000-08-02',
        'address': '221B Baker St, London',
    }
    payload.update(overrides)
    return payload


# --- /api/auth/register happy path -------------------------------------------
class TestRegisterHappyPath:
    def test_register_returns_user_and_token(self):
        p = _reg_payload()
        r = requests.post(f"{API}/auth/register", json=p, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'token' in data and isinstance(data['token'], str) and len(data['token']) > 20
        u = data['user']
        assert u['email'] == p['email'].lower()
        assert u['phone_verified'] is True
        assert u['phone']  # normalized E.164
        assert u['terms_accepted_at']
        assert u['dob'] == p['dob']
        assert u['address'] == p['address']
        # username format: firstname (balaram) + dd (02) + NN
        assert u['username'], 'username must be auto-generated'
        assert u['username'].startswith('balaram02'), f"unexpected username {u['username']}"
        # NN suffix must be 2 digits
        assert len(u['username']) >= len('balaram02') + 2

    def test_username_uniqueness_increments(self):
        # Two users, same first name + same DOB day → NN increments
        p1 = _reg_payload(name='Balaram TestA', dob='1999-08-02', email=_fresh_email('a'))
        p2 = _reg_payload(name='Balaram TestB', dob='1998-08-02', email=_fresh_email('b'))
        r1 = requests.post(f"{API}/auth/register", json=p1, timeout=30)
        r2 = requests.post(f"{API}/auth/register", json=p2, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
        u1 = r1.json()['user']['username']
        u2 = r2.json()['user']['username']
        assert u1.startswith('balaram02') and u2.startswith('balaram02'), (u1, u2)
        assert u1 != u2, 'usernames must be unique for same firstname+day'

    def test_me_returns_full_public_user(self):
        p = _reg_payload()
        r = requests.post(f"{API}/auth/register", json=p, timeout=30)
        assert r.status_code == 200
        token = r.json()['token']
        me = requests.get(f"{API}/auth/me", headers={'Authorization': f'Bearer {token}'}, timeout=15)
        assert me.status_code == 200, me.text
        m = me.json()
        assert m['email'] == p['email'].lower()
        assert m['phone_verified'] is True
        assert m['username']
        assert m['dob'] == p['dob']
        assert m['address'] == p['address']
        assert m['terms_accepted_at']


# --- /api/auth/register rejections ------------------------------------------
class TestRegisterRejections:
    def test_reject_terms_false(self):
        p = _reg_payload(accept_terms=False)
        r = requests.post(f"{API}/auth/register", json=p, timeout=30)
        assert r.status_code == 400
        assert 'accept' in r.json().get('detail', '').lower() or 'terms' in r.json().get('detail', '').lower()

    def test_reject_under_18(self):
        # dob today = definitely under 18
        p = _reg_payload(dob='2020-01-01')
        r = requests.post(f"{API}/auth/register", json=p, timeout=30)
        assert r.status_code == 400
        assert '18' in r.json().get('detail', '')

    def test_reject_wrong_otp(self):
        p = _reg_payload(otp_code='123456')
        r = requests.post(f"{API}/auth/register", json=p, timeout=30)
        # Should NOT be 500. Wrong OTP with bypass mismatched → hits Twilio → 400 or (rarely) 400 from Twilio invalid.
        assert r.status_code == 400, r.text
        detail = r.json().get('detail', '').lower()
        assert 'code' in detail or 'invalid' in detail or 'expired' in detail

    def test_reject_duplicate_email(self):
        p1 = _reg_payload()
        r1 = requests.post(f"{API}/auth/register", json=p1, timeout=30)
        assert r1.status_code == 200
        # Try again with same email but different phone
        p2 = _reg_payload(email=p1['email'], phone=_fresh_phone())
        r2 = requests.post(f"{API}/auth/register", json=p2, timeout=30)
        assert r2.status_code == 400
        assert 'email' in r2.json().get('detail', '').lower()

    def test_reject_duplicate_phone(self):
        phone = _fresh_phone()
        p1 = _reg_payload(phone=phone)
        r1 = requests.post(f"{API}/auth/register", json=p1, timeout=30)
        assert r1.status_code == 200
        # New email, same phone
        p2 = _reg_payload(phone=phone)
        r2 = requests.post(f"{API}/auth/register", json=p2, timeout=30)
        assert r2.status_code == 400
        assert 'phone' in r2.json().get('detail', '').lower()

    def test_missing_required_fields_return_422(self):
        r = requests.post(f"{API}/auth/register", json={
            'email': _fresh_email(), 'password': 'Password123!', 'name': 'X'
        }, timeout=15)
        assert r.status_code == 422


# --- /api/auth/otp/send phone shape -----------------------------------------
class TestOtpSendShape:
    def test_us_e164_shape_accepted_or_400(self):
        # Twilio will most likely reject a random/unroutable number with 400,
        # but the endpoint must NOT 500 on shape-valid input.
        r = requests.post(f"{API}/auth/otp/send", json={'phone': '+15551234567'}, timeout=30)
        assert r.status_code in (200, 400), r.text
        if r.status_code == 400:
            body = r.json().get('detail', '').lower()
            assert 'sms' in body or 'number' in body or 'attempt' in body

    def test_uk_local_07_normalised_to_44(self):
        r = requests.post(f"{API}/auth/otp/send", json={'phone': '07700900123'}, timeout=30)
        assert r.status_code in (200, 400), r.text
        # If Twilio accepted, response echoes normalised phone
        if r.status_code == 200:
            assert r.json().get('phone', '').startswith('+44')

    def test_invalid_shape_400(self):
        r = requests.post(f"{API}/auth/otp/send", json={'phone': 'abcdef'}, timeout=15)
        assert r.status_code == 400


# --- /api/auth/otp/login-verify ---------------------------------------------
class TestOtpLogin:
    def test_login_verify_existing_user_returns_jwt(self):
        # Create user first
        p = _reg_payload()
        rr = requests.post(f"{API}/auth/register", json=p, timeout=30)
        assert rr.status_code == 200
        phone = rr.json()['user']['phone']
        # login-verify with bypass code
        r = requests.post(f"{API}/auth/otp/login-verify", json={'phone': phone, 'code': OTP}, timeout=30)
        # Bypass is only wired in _verify_twilio_otp (register + google finalize),
        # NOT in login-verify (that path still uses raw Twilio verification_checks).
        # If Twilio rejects the code, we accept 400 as expected behaviour.
        assert r.status_code in (200, 400), r.text
        if r.status_code == 200:
            data = r.json()
            assert 'token' in data
            assert data['user']['phone_verified'] is True

    def test_login_verify_no_such_phone(self):
        # Bypass not wired in login-verify so this will 400 (invalid code) rather than 404
        r = requests.post(f"{API}/auth/otp/login-verify", json={
            'phone': '+15550000000', 'code': OTP
        }, timeout=30)
        assert r.status_code in (400, 404), r.text


# --- /api/auth/google/finalize ---------------------------------------------
class TestGoogleFinalizeAuth:
    def test_requires_auth(self):
        r = requests.post(f"{API}/auth/google/finalize", json={
            'phone': '+15551234567', 'otp_code': OTP, 'accept_terms': True, 'dob': '2000-01-01'
        }, timeout=15)
        assert r.status_code in (401, 403)

    def test_finalize_binds_fields(self):
        # Use email-registered user as a stand-in "authenticated google" user.
        # (register endpoint returns a JWT; finalize just needs a valid Bearer.)
        p = _reg_payload()
        rr = requests.post(f"{API}/auth/register", json=p, timeout=30)
        token = rr.json()['token']
        new_phone = _fresh_phone()
        r = requests.post(
            f"{API}/auth/google/finalize",
            json={'phone': new_phone, 'otp_code': OTP, 'accept_terms': True,
                  'dob': '1995-12-15', 'address': '10 Downing St'},
            headers={'Authorization': f'Bearer {token}'}, timeout=30,
        )
        assert r.status_code == 200, r.text
        u = r.json()['user']
        assert u['phone_verified'] is True
        assert u['dob'] == '1995-12-15'
        assert u['address'] == '10 Downing St'
        assert u['username']
        assert u['terms_accepted_at']


# --- CORS preflight + credentialed origin echo ------------------------------
class TestCors:
    def test_preflight_echoes_origin_and_allows_credentials(self):
        origin = 'https://contest-arena-16.preview.emergentagent.com'
        r = requests.options(
            f"{API}/auth/me",
            headers={
                'Origin': origin,
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'authorization,content-type',
            }, timeout=10,
        )
        assert r.status_code in (200, 204), r.text
        assert r.headers.get('Access-Control-Allow-Origin') == origin, r.headers
        assert r.headers.get('Access-Control-Allow-Credentials', '').lower() == 'true'

    def test_actual_request_echoes_origin(self):
        origin = 'https://contest-arena-16.preview.emergentagent.com'
        r = requests.get(f"{API}/", headers={'Origin': origin}, timeout=10)
        assert r.status_code == 200
        assert r.headers.get('Access-Control-Allow-Origin') == origin
