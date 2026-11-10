# Iteration 67: Unlimited Games toggle (public/admin) + finish-moment timer (_finish_moment_ms) for client games
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def admin_h():
    return _login("bachanta8@gmail.com", "Herts@910022")


@pytest.fixture(scope="module")
def player_h():
    return _login("player1@example.com", "Player@12345")


# --- Unlimited games toggle ---
class TestUnlimitedGames:
    def test_public_get(self):
        r = requests.get(f"{BASE_URL}/api/world/public/unlimited-games")
        assert r.status_code == 200
        assert isinstance(r.json()["enabled"], bool)

    def test_put_unauth(self):
        r = requests.put(f"{BASE_URL}/api/admin/world/unlimited-games", json={"enabled": False})
        assert r.status_code in (401, 403)

    def test_put_player_forbidden(self, player_h):
        r = requests.put(f"{BASE_URL}/api/admin/world/unlimited-games", json={"enabled": False}, headers=player_h)
        assert r.status_code in (401, 403)
        assert requests.get(f"{BASE_URL}/api/world/public/unlimited-games").json()["enabled"] is True

    def test_put_invalid_payload(self, admin_h):
        r = requests.put(f"{BASE_URL}/api/admin/world/unlimited-games", json={"enabled": "maybe"}, headers=admin_h)
        assert r.status_code == 422

    def test_admin_toggle_persists(self, admin_h):
        try:
            r = requests.put(f"{BASE_URL}/api/admin/world/unlimited-games", json={"enabled": False}, headers=admin_h)
            assert r.status_code == 200 and r.json() == {"enabled": False}
            assert requests.get(f"{BASE_URL}/api/world/public/unlimited-games").json()["enabled"] is False
        finally:
            r = requests.put(f"{BASE_URL}/api/admin/world/unlimited-games", json={"enabled": True}, headers=admin_h)
            assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/api/world/public/unlimited-games").json()["enabled"] is True


# --- Finish-moment timer on /world/session/submit (client game, solved=False to avoid progressing player1) ---
def _begin(h, level):
    s = requests.post(f"{BASE_URL}/api/world/session/start", json={"level": level}, headers=h)
    assert s.status_code == 200, s.text
    sid = s.json()["session_id"]
    b = requests.post(f"{BASE_URL}/api/world/session/begin", json={"session_id": sid}, headers=h)
    assert b.status_code == 200, b.text
    return sid, time.time()


@pytest.fixture(scope="module")
def level(player_h):
    st = requests.get(f"{BASE_URL}/api/world/state", headers=player_h).json()
    cur = st["current_level"]
    if not (cur.get("game_config") or {}).get("client_game"):
        pytest.skip("current level is not a client game")
    return int(cur["level"])


class TestFinishMoment:
    def test_client_time_trusted_when_close(self, player_h, level):
        sid, t0 = _begin(player_h, level)
        time.sleep(4)
        claimed = int((time.time() - t0) * 1000) - 300  # simulate latency gap
        r = requests.post(f"{BASE_URL}/api/world/session/submit",
                          json={"session_id": sid, "duration_ms": claimed, "solved": False, "taps": []}, headers=player_h)
        assert r.status_code == 200, r.text
        assert r.json()["duration_ms"] == claimed

    def test_faked_fast_time_falls_back_to_server(self, player_h, level):
        sid, t0 = _begin(player_h, level)
        time.sleep(6)
        r = requests.post(f"{BASE_URL}/api/world/session/submit",
                          json={"session_id": sid, "duration_ms": 100, "solved": False, "taps": []}, headers=player_h)
        assert r.status_code == 200, r.text
        d = r.json()["duration_ms"]
        assert d >= 5900, d
