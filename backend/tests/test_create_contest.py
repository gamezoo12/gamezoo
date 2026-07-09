"""Tests for the new POST /api/admin/contests create-contest endpoint.

Covers:
- Auth: unauthenticated → 401/403
- Validation: missing/invalid skill question → 400
- Success (draft): contest inserted and visible in /api/admin/contests; deletable
- Success (live): status=live surfaces in public /api/contests
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://contest-arena-16.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_TEST_EMAIL", "bachanta8@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_TEST_PASSWORD", "Herts@910022")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


VALID_PAYLOAD = {
    "title": "TEST_CreateContest £77",
    "subtitle": "TEST subtitle",
    "category": "prize-draws",
    "image": "https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    "price": 1.0,
    "tickets_total": 50,
    "prize_amount": 77,
    "jackpot": False,
    "featured": False,
    "skill_question": {"q": "What is 2 + 2?", "options": ["3", "4", "5", "6"], "answer": "4", "type": "math"},
    "status": "draft",
}


class TestCreateContestAuth:
    def test_unauthenticated_rejected(self, api):
        r = api.post(f"{BASE_URL}/api/admin/contests", json=VALID_PAYLOAD)
        assert r.status_code in (401, 403), r.text


class TestCreateContestValidation:
    def test_missing_skill_question_400(self, admin_client):
        bad = {k: v for k, v in VALID_PAYLOAD.items() if k != "skill_question"}
        r = admin_client.post(f"{BASE_URL}/api/admin/contests", json=bad)
        assert r.status_code == 400, r.text

    def test_incomplete_skill_question_400(self, admin_client):
        bad = dict(VALID_PAYLOAD)
        bad["skill_question"] = {"q": "What is 2+2?", "options": ["4"], "answer": "4"}  # < 2 options
        r = admin_client.post(f"{BASE_URL}/api/admin/contests", json=bad)
        assert r.status_code == 400, r.text


class TestCreateContestSuccess:
    def test_create_draft_and_verify_and_cleanup(self, admin_client):
        # CREATE
        r = admin_client.post(f"{BASE_URL}/api/admin/contests", json=VALID_PAYLOAD)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        contest = data.get("contest")
        assert contest and contest.get("contest_id")
        assert contest["title"] == VALID_PAYLOAD["title"]
        assert contest["prize_amount"] == 77
        assert contest["tickets_total"] == 50
        assert contest["status"] == "draft"
        assert contest["category"] == "prize-draws"
        assert contest["skill_question"]["answer"] == "4"
        cid = contest["contest_id"]

        try:
            # VERIFY presence in admin list
            r_list = admin_client.get(f"{BASE_URL}/api/admin/contests")
            assert r_list.status_code == 200
            ids = {c.get("contest_id") for c in r_list.json()}
            assert cid in ids, f"Newly created contest {cid} not in /api/admin/contests"

            # Draft should NOT be on public /api/contests
            r_pub = admin_client.get(f"{BASE_URL}/api/contests")
            pub_ids = {c.get("contest_id") for c in r_pub.json()}
            assert cid not in pub_ids, "Draft contest leaking into public list"
        finally:
            # CLEANUP
            r_del = admin_client.delete(f"{BASE_URL}/api/admin/contests/{cid}")
            assert r_del.status_code == 200
            # Confirm gone
            r_list2 = admin_client.get(f"{BASE_URL}/api/admin/contests")
            ids2 = {c.get("contest_id") for c in r_list2.json()}
            assert cid not in ids2

    def test_create_live_contest_visible_publicly(self, admin_client):
        payload = dict(VALID_PAYLOAD)
        payload["title"] = "TEST_CreateContest LIVE £42"
        payload["prize_amount"] = 42
        payload["status"] = "live"
        r = admin_client.post(f"{BASE_URL}/api/admin/contests", json=payload)
        assert r.status_code == 200, r.text
        contest = r.json()["contest"]
        cid = contest["contest_id"]
        assert contest["status"] == "live"
        try:
            # Should show in public listing
            r_pub = admin_client.get(f"{BASE_URL}/api/contests")
            assert r_pub.status_code == 200
            pub_ids = {c.get("contest_id") for c in r_pub.json()}
            assert cid in pub_ids, "Live contest missing from public /api/contests"
        finally:
            admin_client.delete(f"{BASE_URL}/api/admin/contests/{cid}")
