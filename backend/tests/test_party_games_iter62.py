# Iteration 62: party banter AI endpoint + rate limit, 6 party games incl. pty_snake_arena, commentary leak sanitizer
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
P = f"{BASE_URL}/api/games/practice"
DS = f"{BASE_URL}/api/admin/draw-studio"
PTY = ["pty_colour_cards", "pty_ludo_royale", "pty_sweet_swap", "pty_four_in_row", "pty_snakes_ladders", "pty_snake_arena"]
LEAK = re.compile(r"no greeting|straight into it|mid-show|without a greeting|as instructed", re.I)
BANTER = {"game": "Ludo", "bot": "Rex", "persona": "cocky show-off", "event": "you captured the human token", "detail": "", "player_said": ""}


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get('token') or r.json().get('access_token')
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("bachanta8@gmail.com", "Herts@910022")


@pytest.fixture(scope="module")
def player():
    return _login("player1@example.com", "Player@12345")


# Banter endpoint
class TestBanter:
    def test_banter_returns_text(self):
        r = requests.post(f"{P}/banter", json=BANTER, timeout=60)
        assert r.status_code == 200, r.text
        t = r.json()["text"]
        print("BANTER:", t)
        assert isinstance(t, str) and 0 < len(t) <= 140
        assert len(t.split()) <= 22

    def test_banter_reply_to_player(self):
        r = requests.post(f"{P}/banter", json={**BANTER, "bot": "Nova", "event": "player sent a chat message", "player_said": "So lucky!"}, timeout=60)
        assert r.status_code == 200, r.text
        print("REPLY:", r.json()["text"])
        assert r.json()["text"]

    def test_banter_validation(self):
        r = requests.post(f"{P}/banter", json={"game": "Ludo", "bot": "", "event": "x"}, timeout=30)
        assert r.status_code == 422
        r = requests.post(f"{P}/banter", json={**BANTER, "player_said": "x" * 200}, timeout=30)
        assert r.status_code == 422

    def test_banter_rate_limit_429(self):
        # Use a unique forwarded IP so we do not starve the shared client IP
        ip = f"10.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
        codes = []
        for _ in range(23):
            r = requests.post(f"{P}/banter", json={**BANTER, "game": ""}, headers={"X-Forwarded-For": ip}, timeout=30)
            codes.append(r.status_code)
        print("codes", codes)
        # empty game -> 422 before limiter; so use valid payload but quick check below
        codes = []
        for _ in range(22):
            r = requests.post(f"{P}/banter", json=BANTER, headers={"X-Forwarded-For": ip}, timeout=60)
            codes.append(r.status_code)
            if r.status_code == 429:
                break
        print("codes2", codes)
        assert 429 in codes


# Party registry & practice endpoints
class TestParty:
    def test_types_include_6_party(self):
        r = requests.get(f"{BASE_URL}/api/games/types", timeout=30)
        assert r.status_code == 200
        d = r.json()
        items = d if isinstance(d, list) else d.get("types") or d.get("games") or []
        party = {g["id"]: g for g in items if g.get("family") == "party"}
        assert sorted(party) == sorted(PTY)
        assert party["pty_snake_arena"]["label"] == "Snake Arena"

    def test_progress_accepts_snake_arena(self, player):
        r = player.post(f"{P}/progress", json={"entries": [{"game_id": "pty_snake_arena", "level": 1, "stars": 2}]})
        assert r.status_code == 200, r.text
        prog = player.get(f"{P}/progress").json()["progress"]
        assert prog["pty_snake_arena"]["unlocked"] >= 2

    def test_event_snake_arena(self):
        r = requests.post(f"{P}/event", json={"game_id": "pty_snake_arena", "level": 1, "outcome": "start"})
        assert r.status_code == 200, r.text

    def test_leaderboard_all(self, player):
        for g in PTY:
            r = player.get(f"{P}/leaderboard", params={"game_id": g})
            assert r.status_code == 200, (g, r.text)
            assert "top" in r.json()


# Draw studio commentary: no leaked instructions
class TestCommentaryLeak:
    @pytest.mark.parametrize("stage", ["mixing", "drawing"])
    def test_no_leak(self, admin, stage):
        r = admin.post(f"{DS}/commentary", json={"stage": stage, "mode": "preview", "contest_title": "TEST draw", "eligible": 80,
                                                 "round_name": "Round 1", "prize_amount": 50, "total_prize": 100,
                                                 "override": {"enabled": True, "mode": "duo", "duo": ["max", "sophia"]}}, timeout=150)
        assert r.status_code == 200, r.text
        d = r.json()
        print(stage, d["text"])
        assert not LEAK.search(d["text"]), d["text"]
        for s in d["segments"]:
            assert not LEAK.search(s["text"])
            assert len(s["audio_b64"]) > 1000

    def test_clean_unit(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from services.draw_commentary import _clean
        out = _clean("No greeting, straight into it. The balls are spinning! [laughs] Mid-show energy here.")
        print(out)
        assert not LEAK.search(out)
        assert "balls are spinning" in out
