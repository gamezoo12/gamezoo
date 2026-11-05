# Free-play practice games: 100-level progress API (/api/games/practice/progress)
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api/games/practice/progress"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get('token') or r.json().get('access_token')
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def player():
    return _login("player1@example.com", "Player@12345")


class TestPracticeAuth:
    def test_get_requires_auth(self):
        assert requests.get(API).status_code == 401

    def test_post_requires_auth(self):
        r = requests.post(API, json={"entries": [{"game_id": "number_sequence", "level": 1, "stars": 1}]})
        assert r.status_code == 401


class TestPracticeProgress:
    def test_get_shape(self, player):
        r = player.get(API)
        assert r.status_code == 200
        assert isinstance(r.json()["progress"], dict)

    def test_unknown_game_400(self, player):
        r = player.post(API, json={"entries": [{"game_id": "TEST_nope", "level": 1, "stars": 1}]})
        assert r.status_code == 400

    def test_themed_arcade_id_rejected(self, player):
        r = player.post(API, json={"entries": [{"game_id": "arc_balloon_pop_fruit", "level": 1, "stars": 1}]})
        assert r.status_code == 400

    def test_validation_bounds(self, player):
        for bad in [{"game_id": "number_sequence", "level": 101, "stars": 1},
                    {"game_id": "number_sequence", "level": 0, "stars": 1},
                    {"game_id": "number_sequence", "level": 1, "stars": 4},
                    {"game_id": "number_sequence", "level": 1, "stars": 0}]:
            assert player.post(API, json={"entries": [bad]}).status_code == 422
        assert player.post(API, json={"entries": []}).status_code == 422

    def test_skip_levels_above_unlocked(self, player):
        cur = player.get(API).json()["progress"].get("arc_balloon_pop", {"unlocked": 1})
        lv = cur["unlocked"] + 2
        if lv > 100:
            pytest.skip("already near max")
        r = player.post(API, json={"entries": [{"game_id": "arc_balloon_pop", "level": lv, "stars": 3}]})
        assert r.status_code == 200
        assert "arc_balloon_pop" not in r.json()["progress"]
        after = player.get(API).json()["progress"].get("arc_balloon_pop", {"unlocked": 1})
        assert after["unlocked"] == cur["unlocked"]

    def test_sequential_unlock_and_persist(self, player):
        entries = [{"game_id": "number_sequence", "level": i, "stars": 1} for i in range(1, 10)]
        r = player.post(API, json={"entries": entries})
        assert r.status_code == 200
        st = r.json()["progress"]["number_sequence"]
        assert st["unlocked"] == 10
        g = player.get(API).json()["progress"]["number_sequence"]
        assert g["unlocked"] == 10
        assert all(str(i) in g["stars"] for i in range(1, 10))

    def test_stars_keep_max(self, player):
        player.post(API, json={"entries": [{"game_id": "number_sequence", "level": 1, "stars": 3}]})
        player.post(API, json={"entries": [{"game_id": "number_sequence", "level": 1, "stars": 1}]})
        g = player.get(API).json()["progress"]["number_sequence"]
        assert g["stars"]["1"] == 3

    def test_level10_unlocks_tier2(self, player):
        player.post(API, json={"entries": [{"game_id": "number_sequence", "level": 10, "stars": 2}]})
        g = player.get(API).json()["progress"]["number_sequence"]
        assert g["unlocked"] >= 11 and g["stars"]["10"] >= 2

    def test_level100_caps_unlocked(self, player):
        entries = [{"game_id": "number_sequence", "level": i, "stars": 1} for i in range(1, 101)]
        assert player.post(API, json={"entries": entries}).status_code == 200
        g = player.get(API).json()["progress"]["number_sequence"]
        assert g["unlocked"] == 100 and "100" in g["stars"]

    def test_unlock_several_games_for_ui(self, player):
        for gid in ["arc_balloon_pop", "memory_match", "sudoku_mini", "tf2048_mini", "minesweeper_mini"]:
            entries = [{"game_id": gid, "level": i, "stars": 1} for i in range(1, 10)]
            r = player.post(API, json={"entries": entries})
            assert r.status_code == 200, gid
            assert r.json()["progress"][gid]["unlocked"] == 10


class TestGameTypesUnaffected:
    def test_types_list(self):
        r = requests.get(f"{BASE_URL}/api/games/types")
        assert r.status_code == 200
        ids = [g["id"] for g in r.json()["games"]]
        assert "number_sequence" in ids
