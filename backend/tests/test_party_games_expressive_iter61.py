# Iteration 61: expressive commentary (mood/action), no re-greet mid-show, test-stage sample facts, party games (pty_*)
import os
import re
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
P = f"{BASE_URL}/api/games/practice"
DS = f"{BASE_URL}/api/admin/draw-studio"
PTY = ["pty_colour_cards", "pty_ludo_royale", "pty_sweet_swap", "pty_four_in_row", "pty_snakes_ladders", "pty_snake_arena"]
MOODS = {"excited", "laughing", "teasing", "suspense", "warm", "shocked"}
ACTIONS = {"talk", "laugh", "celebrate", "wave", "point", "suspense"}
GREET = re.compile(r"\b(welcome|good evening|hello everyone|hi everyone)\b", re.I)


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


def _check_segs(segs, hosts):
    assert 1 <= len(segs) <= 4
    for s in segs:
        assert s["mood"] in MOODS, s
        assert s["action"] in ACTIONS, s
        assert s["host"] in hosts
        assert len(s["audio_b64"]) > 1000


# Expressive commentary segments
class TestExpressive:
    def test_mixing_no_regreet(self, admin):
        r = admin.post(f"{DS}/commentary", json={"stage": "mixing", "mode": "preview", "contest_title": "TEST draw", "eligible": 80,
                                                 "round_name": "Round 1", "prize_amount": 50, "total_prize": 100,
                                                 "override": {"enabled": True, "mode": "duo", "duo": ["max", "sophia"]}}, timeout=120)
        assert r.status_code == 200, r.text
        segs = r.json()["segments"]
        print("MIXING", [(s["name"], s["mood"], s["action"], s["text"]) for s in segs])
        _check_segs(segs, {"max", "sophia"})
        assert not GREET.search(r.json()["text"]), r.json()["text"]

    def test_drawing_no_regreet(self, admin):
        r = admin.post(f"{DS}/commentary", json={"stage": "drawing", "mode": "preview", "contest_title": "TEST draw", "eligible": 80,
                                                 "override": {"enabled": True, "mode": "solo", "host": "ruby"}}, timeout=120)
        assert r.status_code == 200, r.text
        segs = r.json()["segments"]
        print("DRAWING", [(s["name"], s["mood"], s["action"], s["text"]) for s in segs])
        _check_segs(segs, {"ruby"})
        assert not GREET.search(r.json()["text"])

    def test_test_stage_sample_facts(self, admin):
        r = admin.post(f"{DS}/commentary", json={"stage": "test", "mode": "test",
                                                 "override": {"enabled": True, "mode": "duo", "duo": ["leo", "ruby"]}}, timeout=120)
        assert r.status_code == 200, r.text
        txt = r.json()["text"]
        print("TEST", [(s["name"], s["mood"], s["action"], s["text"]) for s in r.json()["segments"]])
        _check_segs(r.json()["segments"], {"leo", "ruby"})
        assert "£0" not in txt and not re.search(r"\b0 tickets", txt)


# Party games registry + progress + leaderboard
class TestParty:
    def test_types_include_party(self):
        r = requests.get(f"{BASE_URL}/api/games/types", timeout=30)
        assert r.status_code == 200
        d = r.json()
        items = d if isinstance(d, list) else d.get("types") or d.get("games") or []
        party = [g for g in items if g.get("family") == "party"]
        assert sorted(g["id"] for g in party) == sorted(PTY)

    def test_progress_accepts_pty(self, player):
        r = player.post(f"{P}/progress", json={"entries": [{"game_id": g, "level": 1, "stars": 2} for g in PTY]})
        assert r.status_code == 200, r.text
        prog = player.get(f"{P}/progress").json()["progress"]
        for g in PTY:
            assert prog[g]["unlocked"] >= 2 and prog[g]["stars"]["1"] >= 2

    def test_event_accepts_pty(self):
        r = requests.post(f"{P}/event", json={"game_id": "pty_sweet_swap", "level": 1, "outcome": "start"})
        assert r.status_code == 200

    def test_leaderboard_pty(self, player):
        for g in PTY:
            r = player.get(f"{P}/leaderboard", params={"game_id": g})
            assert r.status_code == 200, (g, r.text)
            assert "top" in r.json()

    def test_unknown_pty_rejected(self, player):
        r = player.post(f"{P}/progress", json={"entries": [{"game_id": "pty_nope", "level": 1, "stars": 1}]})
        assert r.status_code == 400
