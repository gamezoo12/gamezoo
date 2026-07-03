"""Backend regression tests for GameZoo review request.

Covers:
- Health / basic API access
- Auth: /api/auth/login (admin), /api/auth/me
- Contests: /api/contests, /api/contests/{slug}, verify-skill
- Admin endpoints (with admin token)
- Meera AI public + admin chat
- Orders (mocked stripe) placeholder read-only checks
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://contest-arena-16.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = os.environ.get("ADMIN_TEST_EMAIL", "bachanta8@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_TEST_PASSWORD", "Herts@910022")


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    data = r.json()
    tok = data.get("token") or data.get("access_token") or data.get("session_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_client(api, admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


# ---------- Auth ----------
class TestAuth:
    def test_admin_login_success(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data or "access_token" in data or "session_token" in data
        assert "user" in data
        assert data["user"]["email"].lower() == ADMIN_EMAIL.lower()
        assert data["user"]["role"] in ("admin", "super_admin")

    def test_admin_login_invalid(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONGPASS"})
        assert r.status_code in (400, 401, 403)

    def test_auth_me_returns_admin(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, r.text
        me = r.json()
        assert me["email"].lower() == ADMIN_EMAIL.lower()
        assert me["role"] in ("admin", "super_admin")

    def test_auth_me_unauthenticated(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in (401, 403)


# ---------- Contests (public) ----------
class TestContests:
    def test_list_contests_public(self, api):
        r = api.get(f"{BASE_URL}/api/contests")
        assert r.status_code == 200, r.text
        data = r.json()
        contests = data if isinstance(data, list) else data.get("items") or data.get("contests") or []
        assert isinstance(contests, list)
        # Note: currently 0 live contests exist in DB - all are drafts. Flagged as issue.
        print(f"Public live contest count: {len(contests)}")

    def test_get_contest_detail(self, api, admin_client):
        # Grab any contest via admin (public list may be empty)
        r_adm = admin_client.get(f"{BASE_URL}/api/admin/contests")
        assert r_adm.status_code == 200
        arr = r_adm.json()
        contests = arr if isinstance(arr, list) else arr.get("items") or []
        if not contests:
            pytest.skip("No contests in DB")
        slug = contests[0].get("slug")
        r = api.get(f"{BASE_URL}/api/contests/{slug}")
        assert r.status_code == 200, r.text
        c = r.json()
        assert c.get("slug") == slug

    def test_verify_skill_endpoint(self, api, admin_client):
        r_adm = admin_client.get(f"{BASE_URL}/api/admin/contests")
        arr = r_adm.json()
        contests = arr if isinstance(arr, list) else arr.get("items") or []
        if not contests:
            pytest.skip("No contests")
        slug = contests[0].get("slug")
        # Wrong answer
        r = api.post(f"{BASE_URL}/api/contests/{slug}/verify-skill", json={"answer": "__wrong__"})
        assert r.status_code == 200, r.text
        assert r.json().get("correct") is False
        # Correct answer - fetch skill question
        c = api.get(f"{BASE_URL}/api/contests/{slug}").json()
        correct_q = c.get("skill_question_q")
        options = c.get("skill_question_options", [])
        assert correct_q, "Contest missing skill question"
        assert len(options) > 0
        # Try each option - one should be correct
        found = False
        for opt in options:
            r2 = api.post(f"{BASE_URL}/api/contests/{slug}/verify-skill", json={"answer": opt})
            assert r2.status_code == 200
            if r2.json().get("correct"):
                found = True
                break
        assert found, "No option was verified as correct"


# ---------- Admin routes ----------
class TestAdmin:
    def test_admin_stats(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)

    def test_admin_users_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/users")
        assert r.status_code == 200, r.text

    def test_admin_orders_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/orders")
        assert r.status_code == 200, r.text

    def test_admin_contests_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/contests")
        assert r.status_code == 200, r.text

    def test_admin_kyc_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/kyc")
        assert r.status_code == 200, r.text

    def test_admin_winners_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/winners")
        assert r.status_code == 200, r.text

    def test_admin_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code in (401, 403)


# ---------- Meera AI ----------
class TestMeera:
    def test_meera_public_chat(self, api):
        # Review request mentions /api/meera/public-chat but actual endpoint is /api/meera/chat
        r = api.post(f"{BASE_URL}/api/meera/chat", json={"message": "Hi Meera, how does GameZoo work?"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data
        assert isinstance(data["reply"], str) and len(data["reply"]) > 0

    def test_meera_admin_chat(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/meera/chat", json={"message": "Hello Meera"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data
