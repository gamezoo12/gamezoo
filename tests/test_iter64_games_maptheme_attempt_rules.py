# Iteration 64: new skill games in GC settings, number_sequence target_number, map theme, champion attempt rules
import os
import copy
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "bachanta8@gmail.com", "password": "Herts@910022"}
NEW_GAMES = ["pipe_connect", "ball_sort", "colour_flood", "code_breaker", "word_search", "speed_typing",
             "quick_count", "shape_rotation", "path_memory", "stack_tower", "sum_hunt"]
GC = 12


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


# --- Map theme ---
class TestMapTheme:
    def test_public_get(self):
        r = requests.get(f"{BASE_URL}/api/world/public/map-theme")
        assert r.status_code == 200
        d = r.json()
        assert d["theme"] in ("festive", "classic") and isinstance(d["effects"], bool)

    def test_put_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/admin/world/map-theme", json={"theme": "classic", "effects": True})
        assert r.status_code in (401, 403)

    def test_invalid_theme_rejected(self, admin):
        r = admin.put(f"{BASE_URL}/api/admin/world/map-theme", json={"theme": "halloween", "effects": True})
        assert r.status_code == 422

    def test_switch_classic_then_festive(self, admin):
        r = admin.put(f"{BASE_URL}/api/admin/world/map-theme", json={"theme": "classic", "effects": False})
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/world/public/map-theme").json()
        assert g == {"theme": "classic", "effects": False}
        r = admin.put(f"{BASE_URL}/api/admin/world/map-theme", json={"theme": "festive", "effects": True})
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/world/public/map-theme").json()
        assert g == {"theme": "festive", "effects": True}


# --- Champion attempt rules ---
class TestChampionAttemptRules:
    def test_get_defaults(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/world/champion-attempt-rules")
        assert r.status_code == 200
        d = r.json()
        assert d["late_from_stage"] == 5
        assert d["early"] == {"free_attempts": 3, "token_cost": 1}
        assert d["late"] == {"free_attempts": 0, "token_cost": 2}

    def test_get_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/admin/world/champion-attempt-rules").status_code in (401, 403)

    def test_put_and_restore(self, admin):
        r = admin.put(f"{BASE_URL}/api/admin/world/champion-attempt-rules", json={
            "late_from_stage": 6, "early_free_attempts": 2, "early_token_cost": 3,
            "late_free_attempts": 1, "late_token_cost": 4})
        assert r.status_code == 200
        d = admin.get(f"{BASE_URL}/api/admin/world/champion-attempt-rules").json()
        assert d == {"late_from_stage": 6, "early": {"free_attempts": 2, "token_cost": 3},
                     "late": {"free_attempts": 1, "token_cost": 4}}
        r = admin.put(f"{BASE_URL}/api/admin/world/champion-attempt-rules", json={
            "late_from_stage": 5, "early_free_attempts": 3, "early_token_cost": 1,
            "late_free_attempts": 0, "late_token_cost": 2})
        assert r.status_code == 200
        d = r.json()
        assert d["late_from_stage"] == 5 and d["late"]["token_cost"] == 2

    def test_put_validation(self, admin):
        r = admin.put(f"{BASE_URL}/api/admin/world/champion-attempt-rules", json={
            "late_from_stage": 1, "early_free_attempts": 3, "early_token_cost": 0,
            "late_free_attempts": 0, "late_token_cost": 2})
        assert r.status_code == 422


# --- GC config: new games, difficulty, number_sequence target ---
class TestGCConfigNewGames:
    def test_save_new_games_and_target_number(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/world-gc/competitions/{GC}")
        assert r.status_code == 200
        body = r.json()
        original = copy.deepcopy(body["draft"])
        status = body["config"].get("activation_status")
        if status not in (None, "draft"):
            pytest.skip(f"GC{GC} is {status}; not touching")
        levels = [{"level": i + 1, "game_id": g, "game_config": {"difficulty": (10 if i % 2 else 1)}}
                  for i, g in enumerate(NEW_GAMES[:9])]
        levels.append({"level": 10, "game_id": "number_sequence", "game_config": {"target_number": 37}})
        payload = {"model": original.get("model", "champion_only"), "levels": levels,
                   "champion": {"game_id": "sum_hunt", "game_config": {"difficulty": 7}}}
        try:
            r = admin.put(f"{BASE_URL}/api/admin/world-gc/competitions/{GC}", json=payload)
            assert r.status_code == 200, r.text
            d = admin.get(f"{BASE_URL}/api/admin/world-gc/competitions/{GC}").json()["draft"]
            by = {row["level"]: row for row in d["levels"]}
            for i, g in enumerate(NEW_GAMES[:9]):
                assert by[i + 1]["game_id"] == g
                assert by[i + 1]["game_config"]["difficulty"] == (10 if i % 2 else 1)
            assert by[10]["game_id"] == "number_sequence"
            assert by[10]["game_config"]["target_number"] == 37
            assert d["champion"]["game_id"] == "sum_hunt"
            assert d["champion"]["game_config"]["difficulty"] == 7
            # remaining 2 games accepted too
            r2 = admin.put(f"{BASE_URL}/api/admin/world-gc/competitions/{GC}", json={
                "levels": [{"level": 1, "game_id": "stack_tower", "game_config": {}},
                           {"level": 2, "game_id": "sum_hunt", "game_config": {}}],
                "champion": {"game_id": "number_sequence", "game_config": {"target_number": 55}}})
            assert r2.status_code == 200, r2.text
            d2 = admin.get(f"{BASE_URL}/api/admin/world-gc/competitions/{GC}").json()["draft"]
            assert d2["champion"]["game_config"]["target_number"] == 55
        finally:
            restore = {"model": original.get("model", "champion_only"),
                       "levels": [{"level": row["level"], "game_id": row.get("game_id"),
                                   "game_config": row.get("game_config") or {},
                                   "bonus_rewards": row.get("bonus_rewards")} for row in original["levels"]],
                       "champion": {"game_id": original["champion"].get("game_id"),
                                    "game_config": original["champion"].get("game_config") or {}}}
            rr = admin.put(f"{BASE_URL}/api/admin/world-gc/competitions/{GC}", json=restore)
            assert rr.status_code == 200, rr.text

    def test_unknown_game_rejected(self, admin):
        r = admin.put(f"{BASE_URL}/api/admin/world-gc/competitions/{GC}",
                      json={"levels": [{"level": 1, "game_id": "not_a_game"}]})
        assert r.status_code == 422
