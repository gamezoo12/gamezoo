"""Isolated checks: every registered skill game is selectable for Free World GCs and loads/plays via the existing engine."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from auth import create_jwt
from routers.game_routes import GAME_TYPES
from services.world_championship_schedule import championship_window, ordered_contest_sequence
from tests import test_admin_dashboard_stats_live as _dash
from tests.test_admin_dashboard_stats_live import API, db_insert, db_read

GC = 51
ALL_GAMES = [g["id"] for g in GAME_TYPES]


@pytest.fixture(scope="module")
def games_db():
    return _dash._sanitize_db_name(_dash.os.environ["DB_NAME"])


def _slot(db_name):
    rows = db_read(db_name, lambda db: db.world_global_contests.find(
        {"season_id": "season-1"}, {"_id": 0, "contest_number": 1}).to_list(200))
    sequence = ordered_contest_sequence({r.get("contest_number") for r in rows} | {GC})
    return sequence.index(GC) + 1


def test_all_registered_games_selectable_and_playable(games_db):
    db_name = games_db
    assert len(ALL_GAMES) == 30
    now = datetime.now(timezone.utc)
    admin_id = f"gc_all_sa_{uuid.uuid4().hex[:10]}"
    player_id = f"gc_all_player_{uuid.uuid4().hex[:10]}"
    sa = {"Authorization": f"Bearer {create_jwt(admin_id)}"}
    player = {"Authorization": f"Bearer {create_jwt(player_id)}"}
    previous_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one({"season_id": "season-1", "contest_number": GC}))
    slot = _slot(db_name)
    future_start = now - timedelta(days=(slot - 1) * 12) + timedelta(days=3)

    def setup(db):
        async def run():
            await db.users.insert_many([
                {"user_id": admin_id, "email": f"{admin_id}@example.test", "role": "super_admin", "created_at": now},
                {"user_id": player_id, "email": f"{player_id}@example.test", "role": "user", "name": "P",
                 "phone_verified": True, "email_verified": True, "created_at": now - timedelta(days=30)},
            ])
            await db.world_settings.replace_one(
                {"_id": "active_global_contest"},
                {"_id": "active_global_contest", "season_id": "season-1", "season_start_at": future_start,
                 "championship_extensions": {}}, upsert=True)
            await db.world_global_contests.replace_one(
                {"season_id": "season-1", "contest_number": GC},
                {"season_id": "season-1", "contest_number": GC, "status": "draft", "levels_config": []}, upsert=True)
            await db.world_gc_competition_configs.delete_many({"season_id": "season-1", "gc_number": GC})
            await db.world_settings.delete_one({"_id": "free_world_pause"})
        return run()
    db_insert(db_name, setup)
    try:
        chunks = [ALL_GAMES[i:i + 11] for i in range(0, 30, 11)]
        for chunk in chunks:
            games = (chunk * 11)[:11]
            draft = {"model": "every_level",
                     "levels": [{"level": n, "game_id": games[n - 1], "bonus_rewards": {"1": 5}} for n in range(1, 11)],
                     "champion": {"game_id": games[10]}}
            saved = requests.put(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, json=draft, timeout=20)
            assert saved.status_code == 200, saved.text
            applied = requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-future", headers=sa,
                                    json={"confirmation": f"APPLY GC{GC} FUTURE"}, timeout=20)
            assert applied.status_code == 200, applied.text
            body = applied.json()["config"]
            assert [r["game_id"] for r in body["levels"]] == games[:10]
            assert body["engine"] == "legacy_hybrid"

        # Final applied set for gameplay: Level 1 = Sudoku Mini, Champion = Maze Solver.
        draft = {"model": "champion_only", "levels": [{"level": n, "game_id": "sudoku_mini" if n == 1 else "lights_out"} for n in range(1, 11)],
                 "champion": {"game_id": "maze_solver"}}
        assert requests.put(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, json=draft, timeout=20).status_code == 200
        assert requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-future", headers=sa,
                             json={"confirmation": f"APPLY GC{GC} FUTURE"}, timeout=20).status_code == 200

        # Time passes: the GC becomes active on its existing schedule (Level 1 open).
        for hours in range(0, 72):
            active_start = now - timedelta(days=(slot - 1) * 12, hours=hours)
            window = championship_window(active_start, slot)
            if window["level_unlocks"][0] <= now - timedelta(minutes=30) and now < window["level_unlocks"][1]:
                break
        assert window["level_unlocks"][0] <= now < window["level_unlocks"][1]
        db_insert(db_name, lambda db: db.world_settings.update_one(
            {"_id": "active_global_contest"}, {"$set": {"season_start_at": active_start, "contest_number": GC}}))
        db_insert(db_name, lambda db: db.world_global_contests.update_one(
            {"season_id": "season-1", "contest_number": GC},
            {"$set": {"status": "active", "start_at": window["level_unlocks"][0], "end_at": window["champion_closes_at"]}}))

        level = requests.get(f"{API}/world/level/1", headers=player, timeout=20)
        assert level.status_code == 200, level.text
        assert level.json()["level"]["game_id"] == "sudoku_mini"

        started = requests.post(f"{API}/world/session/start", headers=player, json={"level": 1}, timeout=20)
        assert started.status_code == 200, started.text
        session = started.json().get("session") or started.json()
        sid = session["session_id"]
        assert session.get("game_id") == "sudoku_mini"
        begun = requests.post(f"{API}/world/session/begin", headers=player, json={"session_id": sid}, timeout=20)
        assert begun.status_code == 200, begun.text
        time.sleep(1.2)
        # A faked ultra-fast time is rejected (server measured ~1.2s+).
        fake = requests.post(f"{API}/world/session/submit", headers=player,
                             json={"session_id": sid, "duration_ms": 100, "solved": True, "taps": []}, timeout=20)
        assert fake.status_code == 200, fake.text
        assert fake.json().get("passed") is True
        stored = db_read(db_name, lambda db: db.world_game_sessions.find_one({"session_id": sid}))
        assert stored["duration_ms"] >= 1100, stored["duration_ms"]

        started = requests.post(f"{API}/world/session/start", headers=player, json={"level": 1}, timeout=20)
        assert started.status_code == 200, started.text
        sid = (started.json().get("session") or started.json())["session_id"]
        requests.post(f"{API}/world/session/begin", headers=player, json={"session_id": sid}, timeout=20)
        time.sleep(1.2)
        honest = requests.post(f"{API}/world/session/submit", headers=player,
                               json={"session_id": sid, "duration_ms": 1300, "solved": True, "taps": []}, timeout=20)
        assert honest.status_code == 200, honest.text
        assert honest.json().get("passed") is True
        progress = db_read(db_name, lambda db: db.world_progress.find_one({"user_id": player_id}))
        assert 1 in progress.get("completed_levels", [])

        from routers import world_routes

        async def champion_game(db):
            return await world_routes._champion_game_for(db, GC)
        assert db_read(db_name, champion_game) == {"game_id": "maze_solver", "client_game": True}
    finally:
        def cleanup(db):
            async def run():
                await db.users.delete_many({"user_id": {"$in": [admin_id, player_id]}})
                for name in ("world_gc_competition_configs", "world_gc_config_audit", "world_gc_level_bests"):
                    await db[name].delete_many({"gc_number": GC})
                for name in ("world_progress", "world_game_sessions", "world_level_attempts"):
                    await db[name].delete_many({"user_id": player_id})
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
