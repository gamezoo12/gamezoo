# Tests for user profile & password endpoints:
#   GET  /api/users/me
#   PATCH /api/users/me
#   POST /api/users/me/password
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope='module')
def fresh_user():
    """Register a fresh user for isolated tests."""
    email = f"test_profile_{uuid.uuid4().hex[:10]}@example.com"
    password = "InitialPass123!"
    r = requests.post(f"{API}/auth/register", json={
        'email': email,
        'password': password,
        'name': 'Test Profile User',
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        'email': email,
        'password': password,
        'token': data['token'],
        'user_id': data['user']['user_id'],
    }


@pytest.fixture(scope='module')
def other_user():
    """Second fresh user (used to test duplicate-email rejection)."""
    email = f"test_profile_other_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        'email': email,
        'password': 'Password123!',
        'name': 'Other User',
    })
    assert r.status_code == 200
    return {'email': email, 'token': r.json()['token']}


# -------- GET /api/users/me --------

def test_get_me_requires_auth():
    r = requests.get(f"{API}/users/me")
    assert r.status_code == 401


def test_get_me_returns_full_profile(fresh_user):
    r = requests.get(f"{API}/users/me", headers={'Authorization': f"Bearer {fresh_user['token']}"})
    assert r.status_code == 200, r.text
    body = r.json()
    # Required keys per contract
    for key in ('name', 'email', 'role', 'kyc_status', 'ticket_count', 'order_count', 'unread_notifications'):
        assert key in body, f"missing key {key} in /users/me response"
    assert body['email'] == fresh_user['email'].lower()
    assert body['role'] == 'user'
    assert body['kyc_status'] == 'none'
    assert body['ticket_count'] == 0
    assert body['order_count'] == 0
    assert body['unread_notifications'] == 0


# -------- PATCH /api/users/me --------

def test_patch_me_requires_auth():
    r = requests.patch(f"{API}/users/me", json={'name': 'X'})
    assert r.status_code == 401


def test_patch_me_updates_name_and_phone(fresh_user):
    r = requests.patch(
        f"{API}/users/me",
        headers={'Authorization': f"Bearer {fresh_user['token']}"},
        json={'name': 'Updated Name', 'phone': '+44 7700 900123'},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get('ok') is True

    # Verify persistence via GET
    r = requests.get(f"{API}/users/me", headers={'Authorization': f"Bearer {fresh_user['token']}"})
    assert r.status_code == 200
    data = r.json()
    assert data['name'] == 'Updated Name'
    assert data.get('phone') == '+44 7700 900123'


def test_patch_me_rejects_invalid_email(fresh_user):
    r = requests.patch(
        f"{API}/users/me",
        headers={'Authorization': f"Bearer {fresh_user['token']}"},
        json={'email': 'not-an-email'},
    )
    assert r.status_code in (400, 422)


def test_patch_me_rejects_duplicate_email(fresh_user, other_user):
    r = requests.patch(
        f"{API}/users/me",
        headers={'Authorization': f"Bearer {fresh_user['token']}"},
        json={'email': other_user['email']},
    )
    assert r.status_code == 400, r.text
    assert 'already' in r.text.lower() or 'in use' in r.text.lower()


# -------- POST /api/users/me/password --------

def test_change_password_requires_auth():
    r = requests.post(f"{API}/users/me/password", json={'current_password': 'x', 'new_password': 'y'})
    assert r.status_code == 401


def test_change_password_wrong_current(fresh_user):
    r = requests.post(
        f"{API}/users/me/password",
        headers={'Authorization': f"Bearer {fresh_user['token']}"},
        json={'current_password': 'WRONG_pw_xyz', 'new_password': 'NewPassSecure123!'},
    )
    assert r.status_code == 400
    assert 'current' in r.text.lower()


def test_change_password_too_short(fresh_user):
    r = requests.post(
        f"{API}/users/me/password",
        headers={'Authorization': f"Bearer {fresh_user['token']}"},
        json={'current_password': fresh_user['password'], 'new_password': 'short7!'},
    )
    assert r.status_code == 400
    assert '8' in r.text or 'at least' in r.text.lower()


def test_change_password_success_and_relogin(fresh_user):
    new_pw = 'BrandNewPass_2026!'
    r = requests.post(
        f"{API}/users/me/password",
        headers={'Authorization': f"Bearer {fresh_user['token']}"},
        json={'current_password': fresh_user['password'], 'new_password': new_pw},
    )
    assert r.status_code == 200, r.text
    assert r.json().get('ok') is True

    # Old password no longer works
    r = requests.post(f"{API}/auth/login", json={'email': fresh_user['email'], 'password': fresh_user['password']})
    assert r.status_code == 401

    # New password succeeds
    r = requests.post(f"{API}/auth/login", json={'email': fresh_user['email'], 'password': new_pw})
    assert r.status_code == 200, r.text
    assert r.json().get('token')
    # update fixture so any later test uses new password
    fresh_user['password'] = new_pw
    fresh_user['token'] = r.json()['token']
