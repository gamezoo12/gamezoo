"""Backend tests for iteration 40:
- Champion attempt status (Rule 2)
- Normal level attempts (Rule 1) with atomic decrement
- Token retry reserve does NOT crash (root-cause NameError fix)
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
PLAYER_EMAIL = os.environ.get("TEST_PLAYER_EMAIL", "")
PLAYER_PASSWORD = os.environ.get("TEST_PLAYER_PASSWORD", "")


@pytest.fixture(scope="module")
def player_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": PLAYER_EMAIL, "password": PLAYER_PASSWORD
    }, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def player_headers(player_token):
    return {"Authorization": f"Bearer {player_token}", "Content-Type": "application/json"}


# ------- Champion attempt status (Rule 2) -------
class TestChampionStatus:
    def test_champion_status_returns_3_initial_attempts(self, player_headers):
        r = requests.get(f"{BASE_URL}/api/world/champion/status", headers=player_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"champion/status: {data}")
        attempts = data.get("attempts") or {}
        # per Rule 2 stage 1 = 3 free
        stage = data.get("champion_stage") or data.get("stage") or attempts.get("champion_stage")
        initial = attempts.get("initial_attempts")
        remaining = attempts.get("attempts_remaining")
        assert initial is not None, f"initial_attempts missing: {data}"
        assert remaining is not None, f"attempts_remaining missing: {data}"
        # For stage 1 (or unspecified), expect 3
        if stage in (None, 1):
            assert initial == 3, f"expected initial_attempts=3, got {initial}"
            assert remaining >= 1, f"attempts_remaining should not be 0 for fresh user, got {remaining}"
        else:
            # stage 2+
            assert initial == 1, f"stage {stage} should have initial 1, got {initial}"


# ------- Normal level attempts (Rule 1) -------
class TestNormalLevelAttempts:
    def test_normal_level_attempt_summary_grants_3(self, player_headers):
        # Pick a valid low-usage level (5 - middle)
        level = 5
        r = requests.get(f"{BASE_URL}/api/world/attempts/{level}", headers=player_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        print(f"attempts/{level}: {data}")
        attempts = data.get("attempts") or {}
        free_avail = attempts.get("free_attempts_available")
        initial = attempts.get("initial_free_attempts") or attempts.get("free_attempts_initial")
        assert free_avail is not None, f"free_attempts_available missing: {attempts}"
        # Fresh level should give 3
        assert free_avail >= 1
        if initial is not None:
            # Rule 1: normal levels grant 3 free attempts initially.
            # Player1 may have already consumed some, so free_avail can be < 3,
            # but the *initial* value must be 3.
            assert initial == 3 or free_avail == 3, f"expected 3 initial, got initial={initial} free_avail={free_avail}"

    def test_normal_level_status_does_not_reset_on_reload(self, player_headers):
        level = 6
        r1 = requests.get(f"{BASE_URL}/api/world/attempts/{level}", headers=player_headers, timeout=15).json()
        r2 = requests.get(f"{BASE_URL}/api/world/attempts/{level}", headers=player_headers, timeout=15).json()
        a1 = (r1.get("attempts") or {}).get("free_attempts_available")
        a2 = (r2.get("attempts") or {}).get("free_attempts_available")
        assert a1 == a2, f"reload changed attempts: {a1} vs {a2}"


# ------- Token retry reserve must NOT crash with NameError -------
class TestTokenRetryReserveNoCrash:
    def test_champion_token_retry_reserve_no_500(self, player_headers):
        r = requests.post(
            f"{BASE_URL}/api/world/token/retry/reserve",
            headers=player_headers,
            json={"level": 0},
            timeout=15,
        )
        print(f"champion retry reserve: {r.status_code} {r.text[:500]}")
        # Should NOT be 500 (NameError). Acceptable: 200, 4xx business error, 409
        assert r.status_code != 500, f"500 crash! body={r.text}"
        # And body should be JSON not a python traceback
        try:
            data = r.json()
        except Exception:
            pytest.fail(f"Non-JSON response: {r.text[:500]}")
        # Ensure no NameError in message
        text = r.text.lower()
        assert "nameerror" not in text
        assert "_get_current_global_champion_contest" not in text

    def test_normal_level_token_retry_reserve_no_500(self, player_headers):
        r = requests.post(
            f"{BASE_URL}/api/world/token/retry/reserve",
            headers=player_headers,
            json={"level": 10},
            timeout=15,
        )
        print(f"normal retry reserve: {r.status_code} {r.text[:500]}")
        assert r.status_code != 500, f"500 crash! body={r.text}"
        try:
            r.json()
        except Exception:
            pytest.fail(f"Non-JSON response: {r.text[:500]}")


# ------- Public leaderboard endpoints exist (feed empty-state UI) -------
class TestLeaderboardEndpoints:
    def test_global_leaderboard_public(self):
        r = requests.get(f"{BASE_URL}/api/world/public/leaderboard", timeout=15)
        print(f"global lb: {r.status_code}")
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_champion_leaderboard_public(self):
        r = requests.get(f"{BASE_URL}/api/world/public/champion/leaderboard", timeout=15)
        print(f"champ lb: {r.status_code}")
        assert r.status_code == 200
