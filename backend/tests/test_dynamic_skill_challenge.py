"""Regression tests for the dynamic skill-question engine (Feb 2026 launch).

Every visitor gets a fresh question generated server-side. The correct answer
is bundled inside an HMAC-signed challenge_token so it never leaks to the
browser. Verify-skill compares the user's typed answer against the token.
"""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://contest-arena-16.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_TEST_EMAIL", "bachanta8@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_TEST_PASSWORD", "Herts@910022")

OP_TO_LAMBDA = {
    'addition': lambda a, b: a + b,
    'subtraction': lambda a, b: a - b,
    'multiplication': lambda a, b: a * b,
    'division': lambda a, b: a // b,
}
SYMBOL_TO_OP = {'+': 'addition', '−': 'subtraction', '×': 'multiplication', '÷': 'division'}


def _login_admin():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return r.json().get("token")


@pytest.fixture(scope="module")
def admin_client():
    tok = _login_admin()
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def contest(admin_client):
    payload = {
        "title": "TEST_DynSkill",
        "prize_amount": 50,
        "price": 1,
        "tickets_total": 100,
        "skill_question_type": "addition",
        "skill_question_difficulty": "medium",
        "entry_mode": "skill_game",
        "status": "draft",
    }
    r = admin_client.post(f"{BASE_URL}/api/admin/contests", json=payload)
    assert r.status_code == 200, r.text
    c = r.json().get("contest")
    yield c
    admin_client.delete(f"{BASE_URL}/api/admin/contests/{c['contest_id']}")


def _parse_challenge(ch):
    """Extract (correct_answer, op) from a challenge response."""
    m = re.match(r"(\d+)\s*(.)\s*(\d+)\s*=", ch["question"])
    assert m, f"bad question format: {ch['question']}"
    a, sym, b = int(m.group(1)), m.group(2), int(m.group(3))
    op = SYMBOL_TO_OP[sym]
    return OP_TO_LAMBDA[op](a, b), op


class TestSkillChallenge:
    def test_challenge_returns_all_fields(self, contest):
        r = requests.get(f"{BASE_URL}/api/contests/{contest['slug']}/skill-challenge")
        assert r.status_code == 200
        j = r.json()
        assert "question" in j and "options" in j and "challenge_token" in j
        assert j["op"] == "addition" and j["difficulty"] == "medium"
        assert len(j["options"]) == 4
        assert isinstance(j["challenge_token"], str) and "." in j["challenge_token"]

    def test_two_challenges_differ(self, contest):
        r1 = requests.get(f"{BASE_URL}/api/contests/{contest['slug']}/skill-challenge").json()
        r2 = requests.get(f"{BASE_URL}/api/contests/{contest['slug']}/skill-challenge").json()
        # Tokens must always differ (unique nonce + random question)
        assert r1["challenge_token"] != r2["challenge_token"]

    def test_correct_answer_verifies(self, contest):
        ch = requests.get(f"{BASE_URL}/api/contests/{contest['slug']}/skill-challenge").json()
        correct, _op = _parse_challenge(ch)
        r = requests.post(
            f"{BASE_URL}/api/contests/{contest['slug']}/verify-skill",
            json={"answer": correct, "challenge_token": ch["challenge_token"]},
        )
        assert r.status_code == 200
        assert r.json()["correct"] is True

    def test_wrong_answer_rejected(self, contest):
        ch = requests.get(f"{BASE_URL}/api/contests/{contest['slug']}/skill-challenge").json()
        correct, _op = _parse_challenge(ch)
        r = requests.post(
            f"{BASE_URL}/api/contests/{contest['slug']}/verify-skill",
            json={"answer": correct + 100, "challenge_token": ch["challenge_token"]},
        )
        assert r.json()["correct"] is False
        assert r.json()["reason"] == "incorrect"

    def test_tampered_token_rejected(self, contest):
        ch = requests.get(f"{BASE_URL}/api/contests/{contest['slug']}/skill-challenge").json()
        correct, _op = _parse_challenge(ch)
        # Break the last hex char of the signature so HMAC fails
        broken = ch["challenge_token"][:-1] + ("0" if ch["challenge_token"][-1] != "0" else "1")
        r = requests.post(
            f"{BASE_URL}/api/contests/{contest['slug']}/verify-skill",
            json={"answer": correct, "challenge_token": broken},
        )
        assert r.json()["correct"] is False
        assert r.json()["reason"] == "invalid_token"

    def test_token_bound_to_contest(self, contest, admin_client):
        """A token issued for contest A must not verify against contest B."""
        # Create a second contest.
        r = admin_client.post(
            f"{BASE_URL}/api/admin/contests",
            json={"title": "TEST_DynSkill_B", "prize_amount": 25, "price": 1, "tickets_total": 50,
                  "skill_question_type": "addition", "skill_question_difficulty": "easy",
                  "entry_mode": "skill_game", "status": "draft"},
        )
        c2 = r.json()["contest"]
        try:
            ch = requests.get(f"{BASE_URL}/api/contests/{contest['slug']}/skill-challenge").json()
            correct, _op = _parse_challenge(ch)
            # Try to redeem A's token against B's slug.
            r2 = requests.post(
                f"{BASE_URL}/api/contests/{c2['slug']}/verify-skill",
                json={"answer": correct, "challenge_token": ch["challenge_token"]},
            )
            assert r2.json()["correct"] is False
            assert r2.json()["reason"] == "contest_mismatch"
        finally:
            admin_client.delete(f"{BASE_URL}/api/admin/contests/{c2['contest_id']}")


class TestOperationsAndDifficulties:
    @pytest.mark.parametrize("op,diff", [
        ("addition", "easy"),
        ("subtraction", "medium"),
        ("multiplication", "hard"),
        ("division", "medium"),
    ])
    def test_each_op_diff_returns_verifiable_challenge(self, admin_client, op, diff):
        r = admin_client.post(
            f"{BASE_URL}/api/admin/contests",
            json={"title": f"TEST_Dyn_{op}_{diff}", "prize_amount": 10, "price": 1,
                  "tickets_total": 25, "skill_question_type": op,
                  "skill_question_difficulty": diff, "entry_mode": "skill_game",
                  "status": "draft"},
        )
        c = r.json()["contest"]
        try:
            ch = requests.get(f"{BASE_URL}/api/contests/{c['slug']}/skill-challenge").json()
            assert ch["op"] == op and ch["difficulty"] == diff
            correct, _op = _parse_challenge(ch)
            v = requests.post(
                f"{BASE_URL}/api/contests/{c['slug']}/verify-skill",
                json={"answer": correct, "challenge_token": ch["challenge_token"]},
            ).json()
            assert v["correct"] is True, f"{op}/{diff} did not verify"
        finally:
            admin_client.delete(f"{BASE_URL}/api/admin/contests/{c['contest_id']}")
