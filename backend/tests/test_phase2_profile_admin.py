"""Phase 2 backend regression tests.

Covers:
  - PATCH /api/users/me now accepts 'address' and persists it
  - GET /api/users/me returns username, phone_verified, dob, address, terms_accepted_at
  - Admin GET /api/admin/users lists users sorted newest-first with new columns
    (username, phone, dob, phone_verified, kyc_status, created_at)
  - /api/auth/register still works (regression) with OTP bypass
  - /api/auth/login regression (does not depend on new fields)
  - /api/public/winners returns 200 (used by Draw Centre)
  - twilio module actually importable at server boot (indirect check via /api/)
"""
import os
import time
import uuid
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
OTP = '000000'

ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'


def _fresh_email(tag='p2'):
    return f"e2e_{tag}_{uuid.uuid4().hex[:8]}@test.com"


_PC = [0]
def _fresh_phone():
    _PC[0] += 1
    seed = (int(time.time() * 1000) + _PC[0]) % 10000000
    return f"+1555{seed:07d}"


def _register():
    p = {
        'email': _fresh_email(),
        'password': 'Password123!',
        'name': 'Balaram Kumar',
        'phone': _fresh_phone(),
        'otp_code': OTP,
        'accept_terms': True,
        'dob': '2000-08-02',
        'address': '221B Baker St, London',
    }
    r = requests.post(f"{API}/auth/register", json=p, timeout=30)
    assert r.status_code == 200, r.text
    return p, r.json()


# ---------- /api/ health (twilio importable indirectly) --------------------
def test_health_root():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get('status') == 'ok'


# ---------- register regression -------------------------------------------
def test_register_still_works():
    _, data = _register()
    assert data['token']
    assert data['user']['phone_verified'] is True


# ---------- login regression: does NOT 500 for legacy users -----------------
def test_email_login_after_register():
    p, _ = _register()
    r = requests.post(f"{API}/auth/login", json={'email': p['email'], 'password': p['password']}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert 'token' in body
    # phone_verified default (True since we set it in register)
    assert body['user'].get('phone_verified') in (True, False)


# ---------- GET /api/users/me returns new fields ---------------------------
def test_get_users_me_returns_new_fields():
    p, data = _register()
    tok = data['token']
    r = requests.get(f"{API}/users/me", headers={'Authorization': f'Bearer {tok}'}, timeout=15)
    assert r.status_code == 200, r.text
    me = r.json()
    for k in ('username', 'phone_verified', 'dob', 'address', 'terms_accepted_at'):
        assert k in me, f"missing key {k}"
    assert me['dob'] == p['dob']
    assert me['address'] == p['address']
    assert me['phone_verified'] is True
    assert me['username']
    assert me['terms_accepted_at']


# ---------- PATCH /api/users/me accepts address ----------------------------
def test_patch_users_me_address_persists():
    _, data = _register()
    tok = data['token']
    new_addr = f"Flat 7, {uuid.uuid4().hex[:6]} Road, London"
    r = requests.patch(
        f"{API}/users/me",
        json={'address': new_addr},
        headers={'Authorization': f'Bearer {tok}'}, timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get('ok') is True
    # Verify persistence via GET
    r2 = requests.get(f"{API}/users/me", headers={'Authorization': f'Bearer {tok}'}, timeout=15)
    assert r2.status_code == 200
    assert r2.json().get('address') == new_addr


# ---------- PATCH /api/users/me allows full name update --------------------
def test_patch_users_me_name_persists():
    _, data = _register()
    tok = data['token']
    r = requests.patch(f"{API}/users/me", json={'name': 'Renamed User'},
                       headers={'Authorization': f'Bearer {tok}'}, timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/users/me", headers={'Authorization': f'Bearer {tok}'}, timeout=15)
    assert r2.json().get('name') == 'Renamed User'


# ---------- public winners endpoint --------------------------------------
def test_public_winners_endpoint():
    r = requests.get(f"{API}/public/winners", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    if body:
        w = body[0]
        for k in ('winner_id', 'contest_id', 'user_id', 'user_name', 'ticket_number',
                  'prize_amount', 'drawn_at'):
            assert k in w, f"public winner missing key {k}"


# ---------- Admin: users list has new columns/order ------------------------
def _admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()['token']


def test_admin_users_list_has_new_columns():
    # Create a fresh user first — will appear at the top of the newest-first list.
    p, data = _register()
    fresh_email = p['email']
    fresh_phone = data['user']['phone']

    tok = _admin_token()
    r = requests.get(f"{API}/admin/users",
                     headers={'Authorization': f'Bearer {tok}'}, timeout=30)
    assert r.status_code == 200, r.text
    users = r.json()
    assert isinstance(users, list) and users, 'user list should not be empty'

    # Newest-first: fresh user should be within the top 5 entries.
    top_emails = [u['email'] for u in users[:5]]
    assert fresh_email in top_emails, f"fresh user {fresh_email} not in top 5 {top_emails}"

    # Locate the fresh user record and inspect required columns
    me = next(u for u in users if u['email'] == fresh_email)
    for k in ('username', 'user_id', 'name', 'email', 'phone', 'dob',
              'created_at', 'phone_verified', 'kyc_status', 'tickets', 'spent',
              'role'):
        assert k in me, f"admin user missing column {k}: keys={list(me.keys())}"
    # `suspended` is optional (absent for active users) — accept either shape.
    assert me.get('suspended', False) in (True, False)

    assert me['phone_verified'] is True
    assert me['phone'] == fresh_phone
    assert me['dob'] == p['dob']
    assert me['username']
