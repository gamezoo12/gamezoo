"""Isolated checks: Apply to Current GC, hybrid level bonuses, Free World pause/resume and preview isolation."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from auth import create_jwt
from services.world_championship_schedule import championship_window, ordered_contest_sequence
from tests.test_admin_dashboard_stats_live import API, db_insert, db_read
from tests import test_admin_dashboard_stats_live as _dash

GC = 52
LIVE = ("world_progress", "world_game_sessions", "world_champion_scores", "world_global_contests",
        "world_winner_awards", "wallets", "bonus_grants", "world_gc_level_bests", "world_gc_level_bonus_awards")


@pytest.fixture(scope="module")
def gc_db():
    return _dash._sanitize_db_name(_dash.os.environ["DB_NAME"])


def _fingerprint(db_name):
    async def run(db):
        out = {}
        for name in LIVE:
            docs = await db[name].find({}).to_list(100000)
            out[name] = hashlib.md5(json.dumps(sorted(json.dumps(d, default=str, sort_keys=True) for d in docs)).encode()).hexdigest()
        return out
    return db_read(db_name, run)


def _setup(db_name, now):
    rows = db_read(db_name, lambda db: db.world_global_contests.find(
        {"season_id": "season-1"}, {"_id": 0, "contest_number": 1}).to_list(200))
    numbers = {r.get("contest_number") for r in rows} | {GC}
    sequence = ordered_contest_sequence(numbers)
    slot = sequence.index(GC) + 1
    for offset in range(0, 48):
        start = now - timedelta(days=(slot - 1) * 12 + 4, hours=offset)
        window = championship_window(start, slot)
        if window["level_unlocks"][4] <= now - timedelta(hours=1) and window["level_unlocks"][5] > now + timedelta(hours=1):
            return start, window
    raise AssertionError("could not place GC into its Level 5 window")


def test_apply_current_pause_and_preview(gc_db):
    db_name = gc_db
    now = datetime.now(timezone.utc)
    admin_id = f"gc_live_sa_{uuid.uuid4().hex[:10]}"
    staff_id = f"gc_live_staff_{uuid.uuid4().hex[:10]}"
    player_id = f"gc_live_player_{uuid.uuid4().hex[:10]}"
    sa = {"Authorization": f"Bearer {create_jwt(admin_id)}"}
    staff = {"Authorization": f"Bearer {create_jwt(staff_id)}"}
    player = {"Authorization": f"Bearer {create_jwt(player_id)}"}
    previous_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one({"season_id": "season-1", "contest_number": GC}))
    season_start, window = _setup(db_name, now)

    def setup(db):
        async def run():
            await db.users.insert_many([
                {"user_id": admin_id, "email": f"{admin_id}@example.test", "role": "super_admin", "created_at": now},
                {"user_id": staff_id, "email": f"{staff_id}@example.test", "role": "admin", "created_at": now},
                {"user_id": player_id, "email": f"{player_id}@example.test", "role": "user", "name": "P",
                 "phone_verified": True, "email_verified": True, "created_at": now - timedelta(days=30)},
            ])
            await db.world_settings.replace_one(
                {"_id": "active_global_contest"},
                {"_id": "active_global_contest", "season_id": "season-1", "contest_number": GC,
                 "season_start_at": season_start, "championship_extensions": {}}, upsert=True)
            await db.world_global_contests.replace_one(
                {"season_id": "season-1", "contest_number": GC},
                {"season_id": "season-1", "contest_number": GC, "status": "active", "levels_config": [],
                 "start_at": window["level_unlocks"][0], "end_at": window["champion_closes_at"]}, upsert=True)
            await db.world_gc_competition_configs.delete_many({"season_id": "season-1", "gc_number": GC})
            await db.world_settings.delete_one({"_id": "free_world_pause"})
        return run()
    db_insert(db_name, setup)
    try:
        draft = {"model": "every_level", "levels": [
            {"level": n, "game_id": "colour_match" if n % 2 else "number_sequence",
             "game_config": {"colours": 4, "rounds": 5} if n % 2 else {},
             "bonus_rewards": {str(r): n * 10 + r for r in range(1, 6)}} for n in range(1, 11)],
            "champion": {"game_id": "colour_match", "game_config": {"colours": 6, "rounds": 20}}}
        saved = requests.put(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, json=draft, timeout=20)
        assert saved.status_code == 200 and saved.json()["config"]["activation_status"] == "draft"
        detail = requests.get(f"{API}/admin/world-gc/competitions/{GC}", headers=sa, timeout=20).json()
        assert detail["level_states"]["is_active_gc"] is True
        assert detail["level_states"]["next_unopened_level"] == 6

        assert requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-current", headers=staff,
                             json={"confirmation": f"APPLY GC{GC}"}, timeout=20).status_code == 403
        assert requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-future", headers=sa,
                             json={"confirmation": f"APPLY GC{GC} FUTURE"}, timeout=20).status_code == 409
        applied = requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-current", headers=sa,
                                json={"confirmation": f"APPLY GC{GC}"}, timeout=20)
        assert applied.status_code == 200, applied.text
        body = applied.json()
        assert body["affected_levels"] == [6, 7, 8, 9, 10] and body["champion_affected"] is True
        levels = body["config"]["levels"]
        assert all(levels[i]["locked"] and not levels[i].get("game_id") for i in range(5))
        assert levels[6]["game_id"] == "colour_match" and levels[6]["bonus_rewards"]["1"] == 71
        assert body["config"]["activation_status"] == "active" and body["config"]["engine"] == "legacy_hybrid"
        replay = requests.post(f"{API}/admin/world-gc/competitions/{GC}/apply-current", headers=sa,
                               json={"confirmation": f"APPLY GC{GC}"}, timeout=20).json()
        assert replay["idempotent_replay"] is True
        audits = db_read(db_name, lambda db: db.world_gc_config_audit.count_documents({"gc_number": GC, "action": "apply_current"}))
        assert audits == 1

        # Gameplay integration: opened Level 1 keeps the existing game; Level 7 uses the applied game.
        from routers import world_routes

        async def effective(db):
            return [await world_routes._effective_level_config(db, 1), await world_routes._effective_level_config(db, 7)]
        l1, l7 = db_read(db_name, effective)
        assert l1["game_id"] == "number_sequence" and l7["game_id"] == "colour_match"
        assert l7["game_config"]["colours"] == 4 and l7["gc_applied_model"] == "every_level"

        # Players cannot use the Memory Match engine for a hybrid GC.
        assert requests.get(f"{API}/world/gc/active-model", timeout=20).json()["active"] is False

        # Hybrid level bests, finalization and no-duplicate settlement.
        from routers.world_gc_live_routes import record_hybrid_level_best, settle_hybrid_level_bonuses
        from services.world_gc_competition_engine import finalize_due_world_gc_levels
        l6_open = window["level_unlocks"][5] + timedelta(minutes=5)

        async def hybrid(db):
            await record_hybrid_level_best(db, {"user_id": player_id, "name": "P"}, 6, 9000, "S1", l6_open)
            await record_hybrid_level_best(db, {"user_id": player_id, "name": "P"}, 6, 12000, "S2", l6_open)
            await record_hybrid_level_best(db, {"user_id": player_id, "name": "P"}, 2, 5000, "S3", now)
            first = await finalize_due_world_gc_levels(db, now=window["level_unlocks"][6] + timedelta(minutes=1))
            second = await finalize_due_world_gc_levels(db, now=window["level_unlocks"][6] + timedelta(minutes=2))
            best = await db.world_gc_level_bests.find({"gc_number": GC, "user_id": player_id}, {"_id": 0}).to_list(10)
            awards = await db.world_gc_level_bonus_awards.find({"gc_number": GC}, {"_id": 0}).to_list(10)
            return first, second, best, awards
        first, second, best, awards = db_read(db_name, hybrid)
        assert [b["level_key"] for b in best] == ["L6"] and best[0]["duration_ms"] == 9000
        assert len(awards) == 1 and awards[0]["bonus_tokens"] == 61 and awards[0]["status"] == "finalized_uncredited"

        async def settle(db):
            await db.world_global_contests.update_one({"contest_number": GC, "season_id": "season-1"}, {"$set": {"status": "settled"}})
            await db.world_winner_awards.insert_one({"season_id": "season-1", "global_contest_number": GC, "user_id": player_id, "rank": 1})
            await settle_hybrid_level_bonuses(db, GC, now)
            await settle_hybrid_level_bonuses(db, GC, now)
            return (await db.bonus_grants.count_documents({"user_id": player_id}),
                    await db.world_gc_level_bonus_awards.find_one({"gc_number": GC}, {"_id": 0}))
        grants, award = db_read(db_name, settle)
        assert grants == 1 and award["status"] == "credited"
        db_insert(db_name, lambda db: db.world_global_contests.update_one(
            {"contest_number": GC, "season_id": "season-1"}, {"$set": {"status": "active"}}))

        # Pause / resume.
        assert requests.post(f"{API}/admin/world-gc/free-world/pause", headers=staff, json={}, timeout=20).status_code == 403
        paused = requests.post(f"{API}/admin/world-gc/free-world/pause", headers=sa, json={"reason": "test"}, timeout=20).json()
        again = requests.post(f"{API}/admin/world-gc/free-world/pause", headers=sa, json={}, timeout=20).json()
        assert paused["idempotent_replay"] is False and again["idempotent_replay"] is True
        assert requests.get(f"{API}/world/pause-status", timeout=20).json()["paused"] is True
        blocked = requests.post(f"{API}/world/session/start", headers=player, json={"level": 1}, timeout=20)
        assert blocked.status_code == 423 and blocked.json()["detail"]["code"] == "FREE_WORLD_PAUSED"
        async def paused_finalize(db):
            return await finalize_due_world_gc_levels(db, now=window["champion_closes_at"] + timedelta(days=1))
        assert db_read(db_name, paused_finalize).get("paused") is True
        db_insert(db_name, lambda db: db.world_settings.update_one(
            {"_id": "free_world_pause"}, {"$set": {"paused_at": window["level_unlocks"][4] - timedelta(hours=1)}}))
        needs_ack = requests.post(f"{API}/admin/world-gc/free-world/resume", headers=sa, json={}, timeout=20)
        assert needs_ack.status_code == 409 and needs_ack.json()["detail"]["code"] == "SCHEDULE_PASSED_DURING_PAUSE"
        resumed = requests.post(f"{API}/admin/world-gc/free-world/resume", headers=sa, json={
            "acknowledge_schedule_passed": True, "confirmation": "RESUME ON EXISTING SCHEDULE"}, timeout=20).json()
        assert resumed["paused"] is False and resumed["schedule_changed"] is False
        assert requests.post(f"{API}/admin/world-gc/free-world/resume", headers=sa, json={}, timeout=20).json()["idempotent_replay"] is True
        setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
        assert setting["championship_extensions"] == {}

        # Preview never writes live collections.
        before = _fingerprint(db_name)
        assert requests.post(f"{API}/admin/world-gc/preview/reset", headers=staff, json={"gc_number": GC}, timeout=20).status_code == 403
        reset = requests.post(f"{API}/admin/world-gc/preview/reset", headers=sa, json={"gc_number": GC}, timeout=20)
        assert reset.status_code == 200, reset.text
        act = lambda **kw: requests.post(f"{API}/admin/world-gc/preview/action", headers=sa, json=kw, timeout=20)  # noqa: E731
        assert act(action="update_config", config={"model": "every_level", "levels": [{"level": 1, "game_id": "memory_match", "game_config": {"pair_count": 2}}]}).status_code == 200
        assert act(action="simulate_players", level="L1", count=6).status_code == 200
        start = act(action="memory_start", level="L1")
        assert start.status_code == 200 and start.json()["preview"]["memory"]["card_count"] == 4
        board = db_read(db_name, lambda db: db.world_gc_preview_sandboxes.find_one({"_id": admin_id}))["memory"]["board"]
        for symbol in set(board):
            for pos in [i for i, v in enumerate(board) if v == symbol]:
                last = act(action="memory_click", position=pos)
        assert last.json()["preview"]["memory"]["status"] == "completed"
        assert act(action="finalize_level", level="L1").status_code == 200
        assert act(action="finalize_level", level="L1").status_code == 409
        for n in range(2, 11):
            act(action="jump", level=f"L{n}")
        act(action="open_level", level="champion")
        act(action="simulate_players", level="champion", count=6)
        champ = act(action="finalize_level", level="champion").json()["preview"]
        assert len(champ["champion_result"]) == 5 and champ["champion_result"][0]["champion_prize_tokens"] > 0
        assert _fingerprint(db_name) == before
    finally:
        def cleanup(db):
            async def run():
                await db.users.delete_many({"user_id": {"$in": [admin_id, staff_id, player_id]}})
                for name in ("world_gc_competition_configs", "world_gc_level_bests", "world_gc_level_finalizations",
                             "world_gc_level_bonus_awards", "world_gc_config_audit"):
                    await db[name].delete_many({"gc_number": GC})
                await db.world_winner_awards.delete_many({"global_contest_number": GC})
                await db.bonus_grants.delete_many({"user_id": player_id})
                await db.world_gc_preview_sandboxes.delete_many({"_id": admin_id})
                await db.world_settings.delete_one({"_id": "free_world_pause"})
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
