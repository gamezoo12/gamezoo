"""Isolated (test DB only): all 30 registered games play in GC Preview; Apply to Current only touches unopened levels."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from auth import create_jwt
from routers.game_routes import GAME_TYPES
from tests import test_admin_dashboard_stats_live as _dash
from tests.test_admin_dashboard_stats_live import API, db_insert, db_read
from tests.test_world_gc_live_apply import GC, _fingerprint, _setup

ALL_GAMES = [g["id"] for g in GAME_TYPES]
WALLET_COLLECTIONS = ("wallets", "wallet_transactions", "bonus_grants", "world_winner_awards")


@pytest.fixture(scope="module")
def gc_db():
    name = _dash._sanitize_db_name(_dash.os.environ["DB_NAME"])
    assert "test" in name and name not in ("test_database",), "refusing to run against a non-isolated DB"
    return name


def _counts(db_name):
    async def run(db):
        return {n: await db[n].count_documents({}) for n in WALLET_COLLECTIONS}
    return db_read(db_name, run)


def test_all_games_playable_in_preview(gc_db):
    db_name = gc_db
    assert len(ALL_GAMES) == 30 and len(set(ALL_GAMES)) == 30
    admin_id = f"gc_prev_sa_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc)
    sa = {"Authorization": f"Bearer {create_jwt(admin_id)}"}
    db_insert(db_name, lambda db: db.users.insert_one(
        {"user_id": admin_id, "email": f"{admin_id}@example.test", "role": "super_admin", "created_at": now}))
    before_live, before_wallet = _fingerprint(db_name), _counts(db_name)
    act = lambda **kw: requests.post(f"{API}/admin/world-gc/preview/action", headers=sa, json=kw, timeout=20)  # noqa: E731
    results = {}
    try:
        reset = requests.post(f"{API}/admin/world-gc/preview/reset", headers=sa, json={"gc_number": GC}, timeout=20)
        assert reset.status_code == 200, reset.text
        for game in ALL_GAMES:
            try:
                assert act(action="update_config", config={"levels": [{"level": 1, "game_id": game}]}).status_code == 200
                assert act(action="open_level", level="L1").status_code == 200
                assert act(action="game_complete", level="L1", solved=True).status_code == 409 or game == "memory_match"
                if game == "memory_match":
                    assert act(action="memory_start", level="L1").status_code == 200
                    board = db_read(db_name, lambda db: db.world_gc_preview_sandboxes.find_one({"_id": admin_id}))["memory"]["board"]
                    last = None
                    for symbol in set(board):
                        for pos in [i for i, v in enumerate(board) if v == symbol]:
                            last = act(action="memory_click", position=pos)
                    mem = last.json()["preview"]["memory"]
                    assert mem["status"] == "completed" and mem["duration_ms"] >= 0
                    retry = act(action="memory_start", level="L1").json()["preview"]["memory"]
                    assert retry["retries"] >= 1
                else:
                    admin_scores = lambda p: len([s for s in p["scores"].get("L1", []) if s["player_id"] == "admin"])  # noqa: E731
                    admin_before = admin_scores(requests.get(f"{API}/admin/world-gc/preview", headers=sa, timeout=20).json()["preview"])
                    assert act(action="game_start", level="L1").status_code == 200
                    time.sleep(0.3)
                    failed = act(action="game_complete", level="L1", solved=False).json()["preview"]
                    assert failed["play"]["status"] == "failed" and failed["play"]["duration_ms"] >= 250
                    assert admin_scores(failed) == admin_before
                    assert act(action="game_complete", level="L1", solved=True).status_code == 409
                    again = act(action="game_start", level="L1").json()["preview"]["play"]
                    assert again["retries"] >= 1 and again["attempts"] >= 2 and again["status"] == "playing"
                    time.sleep(0.3)
                    done = act(action="game_complete", level="L1", solved=True).json()["preview"]
                    assert done["play"]["status"] == "completed" and done["play"]["duration_ms"] >= 250
                    assert admin_scores(done) == admin_before + 1
                    assert act(action="game_complete", level="L1", solved=True).status_code == 409
                sim = act(action="simulate_players", level="L1", count=6).json()["preview"]
                assert any(s["player_id"] == "admin" for s in sim["scores"]["L1"]) and len(sim["scores"]["L1"]) >= 7
                results[game] = "ok"
            except AssertionError as exc:
                results[game] = f"FAIL: {exc}"
        fin = act(action="finalize_level", level="L1")
        assert fin.status_code == 200
        ranked = fin.json()["preview"]["finalizations"]["L1"]
        assert len(ranked) == 5 and [r["rank"] for r in ranked] == [1, 2, 3, 4, 5]
        assert act(action="game_start", level="L1").status_code == 409  # finalized level cannot be played
        failures = {g: r for g, r in results.items() if r != "ok"}
        assert not failures, failures
        assert len(results) == 30
        assert _fingerprint(db_name) == before_live
        assert _counts(db_name) == before_wallet
    finally:
        db_insert(db_name, lambda db: db.users.delete_many({"user_id": admin_id}))
        db_insert(db_name, lambda db: db.world_gc_preview_sandboxes.delete_many({"_id": admin_id}))


def test_apply_current_only_changes_unopened_levels_for_all_games(gc_db):
    db_name = gc_db
    now = datetime.now(timezone.utc)
    admin_id = f"gc_apply_sa_{uuid.uuid4().hex[:10]}"
    sa = {"Authorization": f"Bearer {create_jwt(admin_id)}"}
    previous_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one({"season_id": "season-1", "contest_number": GC}))
    season_start, window = _setup(db_name, now)

    def setup(db):
        async def run():
            await db.users.insert_one({"user_id": admin_id, "email": f"{admin_id}@example.test", "role": "super_admin", "created_at": now})
            await db.world_settings.replace_one(
                {"_id": "active_global_contest"},
                {"_id": "active_global_contest", "season_id": "season-1", "contest_number": GC,
                 "season_start_at": season_start, "championship_extensions": {}}, upsert=True)
            await db.world_global_contests.replace_one(
                {"season_id": "season-1", "contest_number": GC},
                {"season_id": "season-1", "contest_number": GC, "status": "active", "levels_config": [],
                 "start_at": window["level_unlocks"][0], "end_at": window["champion_closes_at"]}, upsert=True)
            await db.world_gc_competition_configs.delete_many({"season_id": "season-1", "gc_number": GC})
        return run()
    db_insert(db_name, setup)
    before_wallet = _counts(db_name)
    try:
        applied_games = set()
        for round_no in range(5):
            chunk = [ALL_GAMES[(round_no * 6 + i) % 30] for i in range(6)]
            draft = {"model": "champion_only",
                     "levels": [{"level": n, "game_id": chunk[(n - 1) % 6], "bonus_rewards": {}} for n in range(1, 11)],
                     "champion": {"game_id": chunk[4]}}
            assert requests.put(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, json=draft, timeout=20).status_code == 200
            detail = requests.get(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, timeout=20).json()
            assert detail["level_states"]["next_unopened_level"] == 6
            res = requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-current", headers=sa,
                                json={"confirmation": f"APPLY GC{GC}"}, timeout=20)
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["affected_levels"] == [6, 7, 8, 9, 10] and body["locked_levels"] == [1, 2, 3, 4, 5]
            lv = body["config"]["levels"]
            assert all(not lv[i].get("game_id") and lv[i]["locked"] for i in range(5)), "opened levels must stay unchanged"
            for n in range(6, 11):
                assert lv[n - 1]["game_id"] == chunk[(n - 1) % 6]
                applied_games.add(lv[n - 1]["game_id"])
            applied_games.add(body["config"]["champion"]["game_id"])
        assert applied_games == set(ALL_GAMES), set(ALL_GAMES) - applied_games
        setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
        assert setting["championship_extensions"] == {} and abs((setting["season_start_at"].replace(tzinfo=timezone.utc) - season_start).total_seconds()) < 0.01
        assert _counts(db_name) == before_wallet
    finally:
        def cleanup(db):
            async def run():
                await db.users.delete_many({"user_id": admin_id})
                for name in ("world_gc_competition_configs", "world_gc_config_audit"):
                    await db[name].delete_many({"gc_number": GC})
                if previous_setting:
                    await db.world_settings.replace_one({"_id": "active_global_contest"}, previous_setting, upsert=True)
                else:
                    await db.world_settings.delete_one({"_id": "active_global_contest"})
                if previous_contest:
                    await db.world_global_contests.replace_one({"season_id": "season-1", "contest_number": GC}, previous_contest, upsert=True)
                else:
                    await db.world_global_contests.delete_one({"season_id": "season-1", "contest_number": GC})
            return run()
        db_insert(db_name, cleanup)
