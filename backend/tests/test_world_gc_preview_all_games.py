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


from datetime import timedelta as _td  # noqa: E402

from services.world_championship_schedule import championship_start_day, championship_window, ordered_contest_sequence  # noqa: E402


def _slot(db_name):
    rows = db_read(db_name, lambda db: db.world_global_contests.find(
        {"season_id": "season-1"}, {"_id": 0, "contest_number": 1}).to_list(200))
    return ordered_contest_sequence({r.get("contest_number") for r in rows} | {GC}).index(GC) + 1


def _start_with_open_levels(slot, now, last_open):
    """Season start placing GC so levels 1..last_open are open and the next level is still >1h away."""
    gc_offset_days = championship_start_day(slot)
    for hours in range(0, 24 * 14):
        start = now - _td(days=gc_offset_days) - _td(hours=hours)
        window = championship_window(start, slot)
        unlocks = window["level_unlocks"]
        if unlocks[last_open - 1] <= now - _td(hours=1) and unlocks[last_open] > now + _td(hours=1):
            return start, window
    raise AssertionError("no season start found")


def _gc_env(db_name, now, admin_id, player_ids, season_start, window, status):
    def setup(db):
        async def run():
            docs = [{"user_id": admin_id, "email": f"{admin_id}@example.test", "role": "super_admin", "created_at": now}]
            docs += [{"user_id": p, "email": f"{p}@example.test", "role": "user", "name": "P", "phone_verified": True,
                      "email_verified": True, "created_at": now - _td(days=30)} for p in player_ids]
            await db.users.insert_many(docs)
            await db.world_settings.replace_one(
                {"_id": "active_global_contest"},
                {"_id": "active_global_contest", "season_id": "season-1", "contest_number": GC,
                 "season_start_at": season_start, "championship_extensions": {}}, upsert=True)
            await db.world_global_contests.replace_one(
                {"season_id": "season-1", "contest_number": GC},
                {"season_id": "season-1", "contest_number": GC, "status": status, "levels_config": [],
                 "start_at": window["level_unlocks"][0], "end_at": window["champion_closes_at"]}, upsert=True)
            await db.world_gc_competition_configs.delete_many({"season_id": "season-1", "gc_number": GC})
            await db.world_settings.delete_one({"_id": "free_world_pause"})
        return run()
    db_insert(db_name, setup)


def _gc_cleanup(db_name, admin_id, player_ids, previous_setting, previous_contest):
    def cleanup(db):
        async def run():
            await db.users.delete_many({"user_id": {"$in": [admin_id, *player_ids]}})
            for name in ("world_gc_competition_configs", "world_gc_config_audit"):
                await db[name].delete_many({"gc_number": GC})
            for name in ("world_game_sessions", "world_progress"):
                await db[name].delete_many({"user_id": {"$in": player_ids}})
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


def test_opened_level_keeps_game_and_admin_shows_effective_vs_pending(gc_db):
    db_name = gc_db
    now = datetime.now(timezone.utc)
    admin_id = f"gc_l2_sa_{uuid.uuid4().hex[:10]}"
    sa = {"Authorization": f"Bearer {create_jwt(admin_id)}"}
    previous_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one({"season_id": "season-1", "contest_number": GC}))
    season_start, window = _start_with_open_levels(_slot(db_name), now, 2)  # Levels 1-2 open, 3+ upcoming
    _gc_env(db_name, now, admin_id, [], season_start, window, "active")
    before_wallet = _counts(db_name)
    try:
        draft = {"model": "champion_only", "levels": [
            {"level": n, "game_id": "sudoku_mini" if n in (2, 3) else "lights_out"} for n in range(1, 11)],
            "champion": {"game_id": "maze_solver"}}
        assert requests.put(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, json=draft, timeout=20).status_code == 200
        pre = requests.get(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, timeout=20).json()["level_states"]
        l2 = pre["levels"][1]
        # Level 2 is open and still on the legacy Number Sequence game; the new pick is pending only.
        assert l2["status"] == "Open" and l2["eligible"] is False
        assert l2["effective_game_id"] == "number_sequence" and l2["pending_game_id"] == "sudoku_mini"
        assert pre["levels"][2]["status"] == "Upcoming" and pre["levels"][2]["eligible"] is True

        res = requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-current", headers=sa,
                            json={"confirmation": f"APPLY GC{GC}"}, timeout=20)
        assert res.status_code == 200, res.text
        assert res.json()["affected_levels"] == [3, 4, 5, 6, 7, 8, 9, 10]
        post = requests.get(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, timeout=20).json()["level_states"]
        assert post["levels"][1]["effective_game_id"] == "number_sequence"  # unchanged, never silently replaced
        assert post["levels"][2]["effective_game_id"] == "sudoku_mini" and post["levels"][2]["pending_game_id"] is None
        assert post["levels"][5]["effective_game_id"] == "lights_out"
        assert post["champion"]["effective_game_id"] == "maze_solver"
        assert post["last_apply"]["scope"] == "current" and post["last_apply"]["levels"][0] == {"level": 3, "game_id": "sudoku_mini"}

        from routers import world_routes

        async def effective(db):
            return [(await world_routes._effective_level_config(db, n))["game_id"] for n in (1, 2, 3, 6)]
        assert db_read(db_name, effective) == ["number_sequence", "number_sequence", "sudoku_mini", "lights_out"]
        assert _counts(db_name) == before_wallet
    finally:
        _gc_cleanup(db_name, admin_id, [], previous_setting, previous_contest)


def test_players_receive_exact_applied_game_for_all_30(gc_db):
    db_name = gc_db
    assert len(ALL_GAMES) == 30
    now = datetime.now(timezone.utc)
    admin_id = f"gc_pl_sa_{uuid.uuid4().hex[:10]}"
    players = [f"gc_pl_p{i}_{uuid.uuid4().hex[:8]}" for i in range(30)]
    sa = {"Authorization": f"Bearer {create_jwt(admin_id)}"}
    previous_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one({"season_id": "season-1", "contest_number": GC}))
    slot = _slot(db_name)
    future_start = now - _td(days=(slot - 1) * 12) + _td(days=3)
    active_start, window = _start_with_open_levels(slot, now, 1)
    _gc_env(db_name, now, admin_id, players, future_start, window, "draft")
    before_wallet = _counts(db_name)
    failures = {}
    try:
        for game, pid in zip(ALL_GAMES, players):
            try:
                # GC not started: every level may take any supported game.
                db_insert(db_name, lambda db: db.world_settings.update_one(
                    {"_id": "active_global_contest"}, {"$set": {"season_start_at": future_start}}))
                db_insert(db_name, lambda db: db.world_global_contests.update_one(
                    {"season_id": "season-1", "contest_number": GC}, {"$set": {"status": "draft"}}))
                db_insert(db_name, lambda db: db.world_gc_competition_configs.delete_many({"gc_number": GC}))
                draft = {"model": "champion_only", "levels": [{"level": n, "game_id": game} for n in range(1, 11)],
                         "champion": {"game_id": game}}
                assert requests.put(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, json=draft, timeout=20).status_code == 200
                applied = requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-future", headers=sa,
                                        json={"confirmation": f"APPLY GC{GC} FUTURE"}, timeout=20)
                assert applied.status_code == 200, applied.text
                db_insert(db_name, lambda db: db.world_settings.update_one(
                    {"_id": "active_global_contest"}, {"$set": {"season_start_at": active_start}}))
                db_insert(db_name, lambda db: db.world_global_contests.update_one(
                    {"season_id": "season-1", "contest_number": GC}, {"$set": {"status": "active"}}))
                player = {"Authorization": f"Bearer {create_jwt(pid)}"}
                lvl = requests.get(f"{API}/world/level/1", headers=player, timeout=20)
                assert lvl.status_code == 200, lvl.text
                assert lvl.json()["level"]["game_id"] == game, (game, lvl.json()["level"]["game_id"])
                started = requests.post(f"{API}/world/session/start", headers=player, json={"level": 1}, timeout=20)
                assert started.status_code == 200, started.text
                session = started.json().get("session") or started.json()
                assert session.get("game_id") == game
                if game != "number_sequence":
                    sid = session["session_id"]
                    assert requests.post(f"{API}/world/session/begin", headers=player, json={"session_id": sid}, timeout=20).status_code == 200
                    time.sleep(1.1)
                    sub = requests.post(f"{API}/world/session/submit", headers=player,
                                        json={"session_id": sid, "duration_ms": 1500, "solved": True, "taps": []}, timeout=20)
                    assert sub.status_code == 200 and sub.json().get("passed") is True, sub.text
                    stored = db_read(db_name, lambda db: db.world_game_sessions.find_one({"session_id": sid}))
                    assert stored["duration_ms"] >= 1000  # server-measured stopwatch, not the client's claim
            except AssertionError as exc:
                failures[game] = str(exc)[:300]
        assert not failures, failures
        assert _counts(db_name) == before_wallet
    finally:
        _gc_cleanup(db_name, admin_id, players, previous_setting, previous_contest)


def _history_hash(db_name):
    import hashlib
    import json

    async def run(db):
        docs = await db.world_global_contests.find({"contest_number": {"$ne": GC}}).to_list(1000)
        return hashlib.md5(json.dumps(sorted(json.dumps(d, default=str, sort_keys=True) for d in docs)).encode()).hexdigest()
    return db_read(db_name, run)


def _play(player, level, hold_s, solved=True):
    sid = (lambda r: (r.json().get("session") or r.json())["session_id"])(
        requests.post(f"{API}/world/session/start", headers=player, json={"level": level}, timeout=20))
    assert requests.post(f"{API}/world/session/begin", headers=player, json={"session_id": sid}, timeout=20).status_code == 200
    time.sleep(hold_s)
    sub = requests.post(f"{API}/world/session/submit", headers=player,
                        json={"session_id": sid, "duration_ms": int(hold_s * 1000), "solved": solved, "taps": []}, timeout=20)
    assert sub.status_code == 200, sub.text
    return sub.json()


def test_every_level_end_to_end_five_players_and_champion_only_unbroken(gc_db):
    db_name = gc_db
    now = datetime.now(timezone.utc)
    admin_id = f"gc_e2e_sa_{uuid.uuid4().hex[:10]}"
    players = [f"gc_e2e_p{i}_{uuid.uuid4().hex[:8]}" for i in range(5)]
    sa = {"Authorization": f"Bearer {create_jwt(admin_id)}"}
    previous_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one({"season_id": "season-1", "contest_number": GC}))
    slot = _slot(db_name)
    future_start = now - _td(days=(slot - 1) * 12) + _td(days=3)
    active_start, window = _start_with_open_levels(slot, now, 1)
    _gc_env(db_name, now, admin_id, players, future_start, window, "draft")
    history_before, wallet_before = _history_hash(db_name), _counts(db_name)
    try:
        # --- Champion-Only first: no level boards, nothing recorded, player gets the selected game.
        draft = {"model": "champion_only", "levels": [{"level": n, "game_id": "lights_out"} for n in range(1, 11)],
                 "champion": {"game_id": "lights_out"}}
        assert requests.put(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, json=draft, timeout=20).status_code == 200
        assert requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-future", headers=sa,
                             json={"confirmation": f"APPLY GC{GC} FUTURE"}, timeout=20).status_code == 200
        db_insert(db_name, lambda db: db.world_settings.update_one({"_id": "active_global_contest"}, {"$set": {"season_start_at": active_start}}))
        db_insert(db_name, lambda db: db.world_global_contests.update_one({"season_id": "season-1", "contest_number": GC}, {"$set": {"status": "active"}}))
        p0 = {"Authorization": f"Bearer {create_jwt(players[0])}"}
        assert requests.get(f"{API}/world/level/1", headers=p0, timeout=20).json()["level"]["game_id"] == "lights_out"
        assert _play(p0, 1, 1.1)["passed"] is True
        board = requests.get(f"{API}/world/gc/level-board/{GC}/1", headers=p0, timeout=20).json()
        assert board["enabled"] is False
        assert db_read(db_name, lambda db: db.world_gc_level_bests.count_documents({"gc_number": GC})) == 0

        # --- Every-Level + Champion on a fresh GC (not started yet), different game per level.
        db_insert(db_name, lambda db: db.world_settings.update_one({"_id": "active_global_contest"}, {"$set": {"season_start_at": future_start}}))
        db_insert(db_name, lambda db: db.world_global_contests.update_one({"season_id": "season-1", "contest_number": GC}, {"$set": {"status": "draft"}}))
        db_insert(db_name, lambda db: db.world_gc_competition_configs.delete_many({"gc_number": GC}))
        db_insert(db_name, lambda db: db.world_game_sessions.delete_many({"user_id": {"$in": players}}))
        db_insert(db_name, lambda db: db.world_progress.delete_many({"user_id": {"$in": players}}))
        rewards = {str(r): 50 + 10 * (5 - r) for r in range(1, 6)}
        draft = {"model": "every_level", "levels": [
            {"level": n, "game_id": "sudoku_mini" if n == 1 else "tower_of_hanoi", "bonus_rewards": rewards} for n in range(1, 11)],
            "champion": {"game_id": "maze_solver"}}
        assert requests.put(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, json=draft, timeout=20).status_code == 200
        applied = requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-future", headers=sa,
                                json={"confirmation": f"APPLY GC{GC} FUTURE"}, timeout=20)
        assert applied.status_code == 200, applied.text
        stored = db_read(db_name, lambda db: db.world_gc_competition_configs.find_one({"gc_number": GC}))
        assert stored["model"] == "every_level" and stored["activation_status"] == "active" and stored["engine"] == "legacy_hybrid"
        db_insert(db_name, lambda db: db.world_settings.update_one({"_id": "active_global_contest"}, {"$set": {"season_start_at": active_start}}))
        db_insert(db_name, lambda db: db.world_global_contests.update_one({"season_id": "season-1", "contest_number": GC}, {"$set": {"status": "active"}}))
        am = requests.get(f"{API}/world/gc/active-model", timeout=20).json()
        assert am["gc_number"] == GC  # hybrid engine: players use the existing Free World UI + level boards

        holds = [1.1, 1.5, 1.9, 2.3, 2.7]
        for pid, hold in zip(players, holds):
            hdr = {"Authorization": f"Bearer {create_jwt(pid)}"}
            assert requests.get(f"{API}/world/level/1", headers=hdr, timeout=20).json()["level"]["game_id"] == "sudoku_mini"
            assert _play(hdr, 1, hold)["passed"] is True
        # Player 0 (fastest) retries slower: best valid result is preserved. Player 4 retries faster than their first.
        assert _play({"Authorization": f"Bearer {create_jwt(players[0])}"}, 1, 3.2)["passed"] is True
        assert _play({"Authorization": f"Bearer {create_jwt(players[4])}"}, 1, 1.3)["passed"] is True

        hdr4 = {"Authorization": f"Bearer {create_jwt(players[4])}"}
        board = requests.get(f"{API}/world/gc/level-board/{GC}/1", headers=hdr4, timeout=20).json()
        assert board["enabled"] and board["game_id"] == "sudoku_mini" and board["status"] == "Open"
        assert board["reward_status"] == "provisional" and board["rewards"]["1"] == 90
        order = [row["rank"] for row in board["leaderboard"]]
        assert order == [1, 2, 3, 4, 5]
        times = [row["duration_ms"] for row in board["leaderboard"]]
        assert times == sorted(times)
        assert board["mine"]["rank"] == 2 and board["mine"]["personal_best_ms"] < 1700  # retry improved P4 from last to 2nd
        assert board["leaderboard"][0]["duration_ms"] < 1400  # P0 slower retry did not overwrite the best
        # Boards never mix levels: other levels are empty/closed.
        l2 = requests.get(f"{API}/world/gc/level-board/{GC}/2", headers=hdr4, timeout=20).json()
        assert l2["enabled"] and l2["status"] == "Upcoming" and l2["leaderboard"] == []
        assert db_read(db_name, lambda db: db.world_gc_wallet_probe if False else db.world_gc_level_bests.count_documents({"gc_number": GC, "level_key": {"$ne": "L1"}})) == 0
        # Provisional rewards are not wallet credits.
        assert _counts(db_name) == wallet_before

        # --- Level closes -> finalization (idempotent) -> credits only after Champion settlement, once.
        from routers.world_gc_live_routes import settle_hybrid_level_bonuses
        from services.world_gc_competition_engine import finalize_due_world_gc_levels
        closes = window["level_unlocks"][1] + _td(minutes=1)

        async def finalize(db):
            await finalize_due_world_gc_levels(db, now=closes)
            await finalize_due_world_gc_levels(db, now=closes + _td(minutes=1))
            fin = await db.world_gc_level_finalizations.find_one({"gc_number": GC, "level_key": "L1"})
            awards = await db.world_gc_level_bonus_awards.find({"gc_number": GC}).sort("rank", 1).to_list(10)
            return fin, awards
        fin, awards = db_read(db_name, finalize)
        assert fin["status"] == "finalized" and [w["rank"] for w in fin["winners"]] == [1, 2, 3, 4, 5]
        assert [a["bonus_tokens"] for a in awards] == [90, 80, 70, 60, 50] and {a["status"] for a in awards} == {"finalized_uncredited"}
        assert _counts(db_name) == wallet_before  # finalization alone credits nothing

        winner_id = fin["winners"][0]["user_id"]

        async def settle(db):
            await db.world_global_contests.update_one({"contest_number": GC, "season_id": "season-1"}, {"$set": {"status": "settled"}})
            await db.world_winner_awards.insert_one({"season_id": "season-1", "global_contest_number": GC, "user_id": winner_id, "rank": 1})
            for _ in range(2):
                await settle_hybrid_level_bonuses(db, GC, now)
            grants = await db.bonus_grants.find({"user_id": {"$in": players}}).to_list(10)
            states = {a["user_id"]: a["status"] for a in await db.world_gc_level_bonus_awards.find({"gc_number": GC}).to_list(10)}
            return grants, states
        grants, states = db_read(db_name, settle)
        assert len(grants) == 1 and grants[0]["user_id"] == winner_id and float(grants[0]["original_amount"]) == 90
        assert states[winner_id] == "credited" and sum(s == "forfeited" for s in states.values()) == 4
        assert _history_hash(db_name) == history_before
    finally:
        def extra(db):
            async def run():
                await db.world_gc_level_bests.delete_many({"gc_number": GC})
                await db.world_gc_level_finalizations.delete_many({"gc_number": GC})
                await db.world_gc_level_bonus_awards.delete_many({"gc_number": GC})
                await db.world_winner_awards.delete_many({"global_contest_number": GC})
                await db.bonus_grants.delete_many({"user_id": {"$in": players}})
            return run()
        db_insert(db_name, extra)
        _gc_cleanup(db_name, admin_id, players, previous_setting, previous_contest)
