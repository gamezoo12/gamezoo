"""Iteration 19 — Admin RBAC verification.

Verifies the fix in /app/backend/auth.py require_admin() which now accepts
role in ('admin', 'super_admin', 'operator', 'support').

Endpoints under test:
 - POST /api/auth/login   (super_admin login)
 - GET  /api/admin/stats
 - GET  /api/admin/users
 - GET  /api/admin/contests
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')

ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASSWORD = 'Herts@910022'


@pytest.fixture(scope='module')
def super_admin_token():
    r = requests.post(
        f'{BASE_URL}/api/auth/login',
        json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text}'
    data = r.json()
    assert data['user']['role'] == 'super_admin', f'expected super_admin, got {data["user"].get("role")}'
    return data['token']


@pytest.fixture(scope='module')
def admin_headers(super_admin_token):
    return {'Authorization': f'Bearer {super_admin_token}'}


class TestSuperAdminLogin:
    def test_super_admin_role_present(self, super_admin_token):
        assert isinstance(super_admin_token, str) and len(super_admin_token) > 20


class TestAdminEndpointsAccessibleBySuperAdmin:
    """Regression: previously require_admin rejected super_admin with 403 'Admin only'."""

    def test_admin_stats_200(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/admin/stats', headers=admin_headers, timeout=15)
        assert r.status_code == 200, f'GET /api/admin/stats failed: {r.status_code} {r.text[:300]}'
        j = r.json()
        assert isinstance(j, dict)

    def test_admin_users_200_and_populated(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/admin/users', headers=admin_headers, timeout=20)
        assert r.status_code == 200, f'GET /api/admin/users failed: {r.status_code} {r.text[:300]}'
        j = r.json()
        # Could be {users:[...]} or list
        users = j.get('users') if isinstance(j, dict) else j
        assert isinstance(users, list), f'expected list of users, got: {type(users)}'
        assert len(users) > 0, 'admin/users list is empty'
        # No raw ObjectId leaks
        for u in users[:5]:
            assert '_id' not in u, f'raw _id leaked in user: {list(u.keys())}'

    def test_admin_contests_200_and_populated(self, admin_headers):
        # Some deployments use /admin/contests, some /admin/competitions
        r = requests.get(f'{BASE_URL}/api/admin/contests', headers=admin_headers, timeout=20)
        if r.status_code == 404:
            r = requests.get(f'{BASE_URL}/api/admin/competitions', headers=admin_headers, timeout=20)
        assert r.status_code == 200, f'admin contests failed: {r.status_code} {r.text[:300]}'
        j = r.json()
        contests = j.get('contests') if isinstance(j, dict) else j
        assert isinstance(contests, list)
        assert len(contests) > 0, 'admin contests list is empty'

    def test_admin_stats_forbidden_without_token(self):
        r = requests.get(f'{BASE_URL}/api/admin/stats', timeout=10)
        assert r.status_code in (401, 403), f'unauthenticated call should be 401/403 not {r.status_code}'


class TestUserMeEndpointForMyAccountPage:
    """MyAccount profile panel depends on /api/users/me returning username/email/name/dob/address."""

    def test_users_me_ok(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/users/me', headers=admin_headers, timeout=10)
        assert r.status_code == 200
        me = r.json()
        # No raw ObjectId
        assert '_id' not in me
        # Expected keys
        for k in ('email', 'user_id', 'role'):
            assert k in me, f'missing {k} in /users/me'
