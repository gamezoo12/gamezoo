# Iteration 70: Super-admin-only country endpoints, user-countries map, suggest, legal drafts (read-only)
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
sys.path.insert(0, '/app/backend')
from auth import hash_password  # noqa: E402

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f'{BASE_URL}/api'
ADMIN = ('bachanta8@gmail.com', 'Herts@910022')
PLAYER1 = ('player1@example.com', 'Player@12345')
_db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
TEMP_PW = 'TempStaff@12345'
CREATED_IDS = []

SUPER_GETS = ['/admin/countries/policies', '/admin/countries/audit', '/admin/countries/change-requests',
              '/admin/countries/analytics', '/admin/countries/export?dataset=users', '/admin/countries/otp',
              '/admin/countries/legal-drafts']


def _login(email, pw):
    return requests.post(f'{API}/auth/login', json={'email': email, 'password': pw}, timeout=30)


def _h(tok):
    return {'Authorization': f'Bearer {tok}'}


def _make_staff(role):
    uid = f'user_test_{uuid.uuid4().hex[:10]}'
    email = f'test_{role}_{uuid.uuid4().hex[:6]}@example.com'
    _db.users.insert_one({'user_id': uid, 'email': email, 'name': f'TEST_{role}', 'role': role, 'method': 'email',
                          'password_hash': hash_password(TEMP_PW), 'email_verified': True, 'must_change_password': False,
                          'terms_accepted_at': datetime.now(timezone.utc), 'created_at': datetime.now(timezone.utc)})
    CREATED_IDS.append(uid)
    return email


@pytest.fixture(scope='module', autouse=True)
def cleanup():
    yield
    for uid in CREATED_IDS:
        _db.users.delete_one({'user_id': uid})
        _db.user_sessions.delete_many({'user_id': uid})


@pytest.fixture(scope='module')
def super_h():
    r = _login(*ADMIN)
    if r.status_code != 200:
        pytest.skip(f'super admin login failed {r.status_code}')
    return _h(r.json()['token'])


@pytest.fixture(scope='module')
def player_h():
    r = _login(*PLAYER1)
    if r.status_code != 200:
        pytest.skip(f'player login failed {r.status_code}')
    return _h(r.json()['token'])


@pytest.fixture(scope='module', params=['admin', 'support', 'operator'])
def staff_h(request):
    email = _make_staff(request.param)
    r = _login(email, TEMP_PW)
    if r.status_code != 200:
        pytest.skip(f'{request.param} login failed {r.status_code} {r.text[:200]}')
    return request.param, _h(r.json()['token'])


# --- super admin only (GET) ---
@pytest.mark.parametrize('path', SUPER_GETS)
def test_super_admin_gets_200(super_h, path):
    r = requests.get(f'{API}{path}', headers=super_h, timeout=60)
    assert r.status_code == 200, f'{path} -> {r.status_code} {r.text[:200]}'


@pytest.mark.parametrize('path', SUPER_GETS)
def test_staff_gets_403(staff_h, path):
    role, h = staff_h
    r = requests.get(f'{API}{path}', headers=h, timeout=60)
    assert r.status_code == 403, f'{role} {path} -> {r.status_code}'


def test_staff_writes_403(staff_h):
    role, h = staff_h
    for method, path, body in [('put', '/admin/countries/policies', {'changes': {}}),
                               ('put', '/admin/countries/default', {'changes': {}}),
                               ('post', '/admin/countries/change-requests/ccr_none/decision', {'approve': False})]:
        r = getattr(requests, method)(f'{API}{path}', headers=h, json=body, timeout=30)
        assert r.status_code in (403, 404, 405, 422), f'{role} {method} {path} -> {r.status_code}'
        assert r.status_code != 200


# --- user-countries map (any admin role) ---
def test_user_countries_super(super_h):
    r = requests.get(f'{API}/admin/user-countries', headers=super_h, timeout=30)
    assert r.status_code == 200
    m = r.json()['map']
    assert m.get('user_bc4a0bc3220c') == 'GB'
    assert all('_id' not in str(k) for k in m)


def test_user_countries_staff(staff_h):
    role, h = staff_h
    r = requests.get(f'{API}/admin/user-countries', headers=h, timeout=30)
    assert r.status_code == 200, f'{role} -> {r.status_code}'
    assert isinstance(r.json()['map'], dict)


def test_user_countries_player_forbidden(player_h):
    r = requests.get(f'{API}/admin/user-countries', headers=player_h, timeout=30)
    assert r.status_code in (401, 403)


def test_user_countries_anon():
    r = requests.get(f'{API}/admin/user-countries', timeout=30)
    assert r.status_code in (401, 403)


# --- suggest (public) ---
def test_suggest_public():
    r = requests.get(f'{API}/countries/suggest', timeout=30)
    assert r.status_code == 200
    code = r.json()['code']
    assert code is None or (isinstance(code, str) and len(code) == 2)
    print('suggest code', code)


def test_suggest_with_cf_header():
    r = requests.get(f'{API}/countries/suggest', headers={'CF-IPCountry': 'US'}, timeout=30)
    assert r.status_code == 200
    print('suggest with header', r.json())


# --- legal drafts read-only ---
def test_legal_drafts_no_writes(super_h):
    before = list(_db.legal_documents.find({}, {'_id': 0}).sort('slug', 1))
    r = requests.get(f'{API}/admin/countries/legal-drafts', headers=super_h, timeout=30)
    assert r.status_code == 200
    d = r.json()
    slugs = [x['slug'] for x in d['drafts']]
    assert slugs == ['terms', 'competition-terms', 'privacy', 'age-eligibility']
    assert all(x['title'] and len(x['text']) > 50 for x in d['drafts'])
    after = list(_db.legal_documents.find({}, {'_id': 0}).sort('slug', 1))
    assert before == after
