# Level Leaderboard (lb-tab-level) backend: /api/world/gc/level-board/{gc}/{level} for GC4 (legacy hybrid) and GC5 (every-level future)
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


@pytest.fixture(scope="module")
def player():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "player1@example.com", "password": "Player@12345"})
    if r.status_code != 200:
        pytest.skip("player login failed")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


def board(s, gc, lvl):
    r = s.get(f"{BASE_URL}/api/world/gc/level-board/{gc}/{lvl}")
    assert r.status_code == 200, r.text
    return r.json()


def test_gc4_l9_enabled_open_with_rows(player):
    d = board(player, 4, 9)
    print(d)
    assert d["enabled"] is True
    assert d["game_id"] == "colour_match"
    assert d["status"] in ("Open", "Closed", "Finalized")
    assert isinstance(d["leaderboard"], list) and len(d["leaderboard"]) >= 1
    assert "rewards" in d


def test_gc4_l10_state(player):
    d = board(player, 4, 10)
    print(d)
    assert d["enabled"] is True
    assert d["status"] == "Upcoming"


@pytest.mark.parametrize("lvl", [1, 2, 3, 4, 5, 6, 7, 8])
def test_gc4_other_levels_disabled(player, lvl):
    d = board(player, 4, lvl)
    assert d["enabled"] is False


@pytest.mark.parametrize("lvl", [1, 5, 10])
def test_gc5_levels_not_open(player, lvl):
    d = board(player, 5, lvl)
    print(lvl, d)
    assert (not d["enabled"]) or d["status"] == "Upcoming"


def test_invalid_level_404(player):
    assert player.get(f"{BASE_URL}/api/world/gc/level-board/4/11").status_code == 404
    assert player.get(f"{BASE_URL}/api/world/gc/level-board/2/1").status_code == 404


def test_anonymous_access(player):
    r = requests.get(f"{BASE_URL}/api/world/gc/level-board/4/9")
    assert r.status_code == 200
    assert r.json()["mine"] is None
