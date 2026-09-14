"""Iter38: Backend tests for admin free world endpoints + health.
Read-only; does not mutate season/contest/users.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback for local shell env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

ADMIN_EMAIL = "bachanta8@gmail.com"
ADMIN_PASSWORD = "Herts@910022"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    # Also check role
    user = data.get("user") or {}
    assert user.get("role") == "super_admin", f"Unexpected role: {user}"
    return tok


def test_health_root():
    r = requests.get(f"{BASE_URL}/health", timeout=10)
    assert r.status_code == 200


def test_ready_root():
    r = requests.get(f"{BASE_URL}/ready", timeout=10)
    assert r.status_code == 200


def test_admin_login_returns_super_admin(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 10


def test_season_schedule_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/world/season-schedule", timeout=10)
    assert r.status_code == 401


def test_season_schedule_with_admin(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/world/season-schedule",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("scheduled") is True, f"Expected scheduled=true, got: {data.get('scheduled')}"
    champs = data.get("championships") or []
    assert len(champs) == 100, f"Expected 100 championships, got {len(champs)}"
    c1 = champs[0]
    assert c1.get("championship_number") == 1
    assert c1.get("status") == "scheduled", f"C1 status: {c1.get('status')}"


def test_admin_users_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/world/users", timeout=10)
    assert r.status_code == 401


def test_admin_users_safe_fields(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/world/users?page=1&page_size=10",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data.get("items") or data.get("users") or []
    assert isinstance(items, list)
    forbidden = {"password", "password_hash", "token", "access_token", "kyc"}
    for u in items:
        for k in forbidden:
            assert k not in u, f"Forbidden field '{k}' in user response: {list(u.keys())}"
    # pagination fields
    assert any(k in data for k in ("total", "page", "page_size"))
