# Iteration 67: UI theme + Unlimited Games toggle endpoints + finish-moment timer rule
import os
import sys
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


# --- Unit: _finish_moment_ms rule ---
class TestFinishMomentUnit:
    def test_rule(self):
        import ast
        src = open("/app/backend/routers/world_routes.py").read()
        node = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "_finish_moment_ms")
        ns = {}
        exec(ast.get_source_segment(src, node), ns)
        f = ns["_finish_moment_ms"]
        assert f(543, 830) == 543
        assert f(5000, 8000) == 5000
        assert f(4999, 8000) == 8000
        assert f(9500, 8000) == 9500
        assert f(9501, 8000) == 8000
        assert f(10, 50) == 100


# --- UI theme ---
class TestUiTheme:
    def test_public_get(self):
        r = requests.get(f"{BASE_URL}/api/world/public/ui-theme")
        assert r.status_code == 200
        assert isinstance(r.json()["theme_id"], str)

    def test_unauth_put(self):
        r = requests.put(f"{BASE_URL}/api/admin/world/ui-theme", json={"theme_id": "emerald-classic"})
        assert r.status_code in (401, 403)

    def test_player_put_forbidden(self, player_h):
        r = requests.put(f"{BASE_URL}/api/admin/world/ui-theme", json={"theme_id": "emerald-classic"}, headers=player_h)
        assert r.status_code in (401, 403)

    @pytest.mark.parametrize("bad", ["X!", "ab", "UPPER-case", "a" * 41])
    def test_invalid(self, admin_h, bad):
        r = requests.put(f"{BASE_URL}/api/admin/world/ui-theme", json={"theme_id": bad}, headers=admin_h)
        assert r.status_code == 422

    def test_unknown_but_valid_pattern_accepted(self, admin_h):
        # Backend has no whitelist of the 100 theme IDs - record behaviour
        try:
            r = requests.put(f"{BASE_URL}/api/admin/world/ui-theme", json={"theme_id": "not-a-real-theme"}, headers=admin_h)
            print("unknown theme status", r.status_code)
        finally:
            requests.put(f"{BASE_URL}/api/admin/world/ui-theme", json={"theme_id": "royal-purple-classic"}, headers=admin_h)

    def test_admin_set_persists_and_restore(self, admin_h):
        try:
            r = requests.put(f"{BASE_URL}/api/admin/world/ui-theme", json={"theme_id": "emerald-classic"}, headers=admin_h)
            assert r.status_code == 200 and r.json() == {"theme_id": "emerald-classic"}
            assert requests.get(f"{BASE_URL}/api/world/public/ui-theme").json()["theme_id"] == "emerald-classic"
        finally:
            requests.put(f"{BASE_URL}/api/admin/world/ui-theme", json={"theme_id": "royal-purple-classic"}, headers=admin_h)
        assert requests.get(f"{BASE_URL}/api/world/public/ui-theme").json()["theme_id"] == "royal-purple-classic"


# --- Unlimited games ---
class TestUnlimited:
    def test_get(self):
        r = requests.get(f"{BASE_URL}/api/world/public/unlimited-games")
        assert r.status_code == 200 and isinstance(r.json()["enabled"], bool)

    def test_player_forbidden(self, player_h):
        r = requests.put(f"{BASE_URL}/api/admin/world/unlimited-games", json={"enabled": False}, headers=player_h)
        assert r.status_code in (401, 403)

    def test_toggle(self, admin_h):
        try:
            r = requests.put(f"{BASE_URL}/api/admin/world/unlimited-games", json={"enabled": False}, headers=admin_h)
            assert r.status_code == 200 and r.json() == {"enabled": False}
            assert requests.get(f"{BASE_URL}/api/world/public/unlimited-games").json()["enabled"] is False
        finally:
            requests.put(f"{BASE_URL}/api/admin/world/unlimited-games", json={"enabled": True}, headers=admin_h)
        assert requests.get(f"{BASE_URL}/api/world/public/unlimited-games").json()["enabled"] is True


# --- Integration: session submit keeps client duration ---
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
    cur = st.get("current_level") or {}
    if not (cur.get("game_config") or {}).get("client_game"):
        pytest.skip(f"current level not client game: {cur.get('level')} {cur.get('game_config')}")
    return int(cur["level"])


class TestSubmitTimer:
    def test_client_value_kept(self, player_h, level):
        sid, t0 = _begin(player_h, level)
        time.sleep(3)
        claimed = int((time.time() - t0) * 1000) - 400
        r = requests.post(f"{BASE_URL}/api/world/session/submit",
                          json={"session_id": sid, "duration_ms": claimed, "solved": False, "taps": []}, headers=player_h)
        assert r.status_code == 200, r.text
        assert r.json()["duration_ms"] == claimed

    def test_slightly_above_server_kept(self, player_h, level):
        sid, t0 = _begin(player_h, level)
        time.sleep(2)
        claimed = int((time.time() - t0) * 1000) + 800
        r = requests.post(f"{BASE_URL}/api/world/session/submit",
                          json={"session_id": sid, "duration_ms": claimed, "solved": False, "taps": []}, headers=player_h)
        assert r.status_code == 200, r.text
        assert r.json()["duration_ms"] == claimed

    def test_fake_fast_rejected(self, player_h, level):
        sid, t0 = _begin(player_h, level)
        time.sleep(5)
        r = requests.post(f"{BASE_URL}/api/world/session/submit",
                          json={"session_id": sid, "duration_ms": 150, "solved": False, "taps": []}, headers=player_h)
        assert r.status_code == 200, r.text
        assert r.json()["duration_ms"] >= 4900
