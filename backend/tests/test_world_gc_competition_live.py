"""Isolated API checks for the separately configured future-GC model."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import requests
from auth import create_jwt
from services.world_championship_schedule import championship_window, ensure_utc, ordered_contest_sequence
from tests.test_admin_dashboard_stats_live import API, db_insert, db_read, db_name


def test_memory_match_server_timing_best_rank_and_isolated_progress(db_name):
    gc_number = 53
    user_id = f"world_gc_player_{uuid.uuid4().hex[:12]}"
    admin_id = f"world_gc_admin_{uuid.uuid4().hex[:12]}"
    non_winner_id = f"world_gc_nonwinner_{uuid.uuid4().hex[:12]}"
    other_champion_winners = [f"world_gc_champion_{uuid.uuid4().hex[:12]}" for _ in range(4)]
    now = datetime.now(timezone.utc)
    token = create_jwt(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    level_rows = []
    for level in range(1, 11):
        level_rows.append({
            "level": level, "game_id": "memory_match", "game_config": {"pair_count": 2},
            "opens_at": (now - timedelta(minutes=2) if level == 1 else now + timedelta(days=level - 1)).isoformat(),
            "bonus_rewards": {"1": 5, "2": 4, "3": 3, "4": 2, "5": 1},
        })
    config = {
        "season_id": "season-1", "gc_number": gc_number, "model": "every_level", "activation_status": "scheduled",
        "levels": level_rows,
        "champion": {"game_id": "memory_match", "game_config": {"pair_count": 2},
                     "opens_at": (now + timedelta(days=10)).isoformat(),
                     "closes_at": (now + timedelta(days=11)).isoformat(),
                     "prize_source": "existing_world_champion_prizes"},
    }
    previous_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one(
        {"season_id": "season-1", "contest_number": gc_number}))

    def setup(db):
        async def run():
            await db.users.insert_one({
                "user_id": user_id, "email": f"{user_id}@example.test", "name": "GC Test Player",
                "role": "user", "phone_verified": True, "email_verified": True,
                "created_at": now - timedelta(days=1),
            })
            await db.users.insert_one({
                "user_id": admin_id, "email": f"{admin_id}@example.test", "name": "GC Test Admin",
                "role": "super_admin", "created_at": now - timedelta(days=1),
            })
            await db.users.insert_one({
                "user_id": non_winner_id, "email": f"{non_winner_id}@example.test", "name": "GC Test Nonwinner",
                "role": "user", "created_at": now - timedelta(days=1),
            })
            await db.world_settings.replace_one(
                {"_id": "active_global_contest"},
                {"_id": "active_global_contest", "season_id": "season-1", "contest_number": gc_number},
                upsert=True,
            )
            await db.world_global_contests.replace_one(
                {"season_id": "season-1", "contest_number": gc_number},
                {"season_id": "season-1", "contest_number": gc_number, "status": "active",
                 "game_id": "number_sequence", "start_at": now - timedelta(days=1), "end_at": now + timedelta(days=12)},
                upsert=True,
            )
            await db.world_gc_competition_configs.replace_one(
                {"season_id": "season-1", "gc_number": gc_number}, config, upsert=True,
            )
        return run()
    db_insert(db_name, setup)

    try:
        active = requests.get(f"{API}/world/gc/active-model", timeout=20).json()
        assert active["active"] is False and active["model"] == "champion_only"

        activation = requests.post(
            f"{API}/admin/world-gc/competitions/{gc_number}/activate",
            headers={"Authorization": f"Bearer {create_jwt(admin_id)}"},
            json={"confirmation": f"ACTIVATE GC{gc_number} EVERY_LEVEL"}, timeout=20,
        )
        assert activation.status_code == 410, activation.text

        def explicitly_activate_test_config(db):
            async def run():
                await db.world_gc_competition_configs.update_one(
                    {"season_id": "season-1", "gc_number": gc_number, "activation_status": "scheduled"},
                    {"$set": {"activation_status": "active"}},
                )
            return run()
        db_insert(db_name, explicitly_activate_test_config)
        active = requests.get(f"{API}/world/gc/active-model", timeout=20).json()
        assert active["active"] is True and active["gc_number"] == gc_number

        legacy_level = requests.get(f"{API}/world/level/1", headers=headers, timeout=20)
        assert legacy_level.status_code == 409, legacy_level.text
        legacy_start = requests.post(f"{API}/world/session/start", headers=headers,
                         json={"level": 1}, timeout=20)
        assert legacy_start.status_code == 409, legacy_start.text
        legacy_retry = requests.post(f"{API}/world/token/retry/reserve", headers=headers,
                         json={"level": 1}, timeout=20)
        assert legacy_retry.status_code == 409, legacy_retry.text
        legacy_board = requests.get(f"{API}/world/public/champion/leaderboard",
                        params={"contest_number": gc_number}, timeout=20)
        assert legacy_board.status_code == 409, legacy_board.text

        progress = requests.get(f"{API}/world/gc/progress/{gc_number}", headers=headers, timeout=20)
        assert progress.status_code == 200, progress.text
        assert progress.json()["levels"][0]["playable"] is True
        assert progress.json()["levels"][1]["playable"] is False

        started = requests.post(f"{API}/world/gc/memory-match/session/start",
                                headers=headers, json={"gc_number": gc_number, "level": "L1"}, timeout=20)
        assert started.status_code == 200, started.text
        prepared = started.json()
        begin = requests.post(f"{API}/world/gc/memory-match/session/{prepared['session_id']}/begin",
                              headers=headers, timeout=20)
        assert begin.status_code == 200, begin.text
        assert begin.json()["started_at"]

        board = db_read(db_name, lambda db: db.world_gc_level_sessions.find_one(
            {"session_id": prepared["session_id"]}, {"_id": 0, "board": 1}))['board']
        positions_by_symbol = {}
        for position, symbol in enumerate(board):
            positions_by_symbol.setdefault(symbol, []).append(position)
        response = None
        for positions in positions_by_symbol.values():
            for position in positions:
                response = requests.post(
                    f"{API}/world/gc/memory-match/session/{prepared['session_id']}/click",
                    headers=headers, json={"position": position}, timeout=20,
                )
                assert response.status_code == 200, response.text

        result = response.json()
        assert result["complete"] is True
        assert result["click_count"] == len(board)
        assert result["duration_ms"] >= 0
        assert result["rank"] == 1

        leaderboard = requests.get(f"{API}/world/gc/leaderboard/{gc_number}/L1", timeout=20)
        assert leaderboard.status_code == 200, leaderboard.text
        assert leaderboard.json()["leaderboard"][0]["duration_ms"] == result["duration_ms"]
        assert leaderboard.json()["rewards"]["1"] == 5

        progress_after = requests.get(f"{API}/world/gc/progress/{gc_number}", headers=headers, timeout=20).json()
        assert progress_after["levels"][0]["passed"] is True
        assert progress_after["levels"][1]["playable"] is False
        assert db_read(db_name, lambda db: db.bonus_grants.count_documents({"user_id": user_id})) == 0
        assert db_read(db_name, lambda db: db.world_progress.count_documents({"user_id": user_id})) == 0

        def finalize_level(db):
            async def run():
                await db.world_gc_competition_configs.update_one(
                    {"season_id": "season-1", "gc_number": gc_number},
                    {"$set": {"levels.1.opens_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}},
                )
                from services.world_gc_competition_engine import finalize_due_world_gc_levels
                await finalize_due_world_gc_levels(db, now=datetime.now(timezone.utc))
                frozen = await db.world_gc_level_finalizations.find_one(
                    {"season_id": "season-1", "gc_number": gc_number, "level_key": "L1"}, {"_id": 0},
                )
                assert frozen and frozen["status"] == "finalized"
                assert frozen["winners"][0]["user_id"] == user_id
                assert frozen["winners"][0]["bonus_tokens"] == 5
                await db.world_gc_competition_configs.update_one(
                    {"season_id": "season-1", "gc_number": gc_number},
                    {"$set": {"levels.0.bonus_rewards.1": 99}},
                )
                await finalize_due_world_gc_levels(db, now=datetime.now(timezone.utc))
                frozen_again = await db.world_gc_level_finalizations.find_one(
                    {"season_id": "season-1", "gc_number": gc_number, "level_key": "L1"}, {"_id": 0},
                )
                assert frozen_again["winners"][0]["bonus_tokens"] == 5
                award = await db.world_gc_level_bonus_awards.find_one(
                    {"season_id": "season-1", "gc_number": gc_number, "level_key": "L1", "user_id": user_id},
                    {"_id": 0},
                )
                assert award["status"] == "finalized_uncredited"
                assert await db.bonus_grants.count_documents({"user_id": user_id}) == 0
            return run()
        db_insert(db_name, finalize_level)

        frozen_board = requests.get(f"{API}/world/gc/leaderboard/{gc_number}/L1", timeout=20).json()
        assert frozen_board["reward_status"] == "finalized"
        assert frozen_board["rewards"]["1"] == 5
        closed_retry = requests.post(f"{API}/world/gc/memory-match/session/start",
                                     headers=headers, json={"gc_number": gc_number, "level": "L1"}, timeout=20)
        assert closed_retry.status_code == 409

        def settle_champion(db):
            async def run():
                settle_at = datetime.now(timezone.utc)
                await db.world_gc_competition_configs.update_one(
                    {"season_id": "season-1", "gc_number": gc_number},
                    {"$set": {"champion.opens_at": (settle_at - timedelta(minutes=2)).isoformat(),
                               "champion.closes_at": (settle_at - timedelta(minutes=1)).isoformat()}},
                )
                await db.world_gc_progress.update_one(
                    {"season_id": "season-1", "gc_number": gc_number, "user_id": user_id},
                    {"$set": {"passed_levels": [f"L{n}" for n in range(1, 11)]}},
                )
                for rank, champion_user in enumerate([user_id, *other_champion_winners]):
                    await db.world_gc_level_bests.insert_one({
                        "season_id": "season-1", "gc_number": gc_number, "level_key": "champion",
                        "user_id": champion_user, "user_name": "GC Test Player", "duration_ms": 1234 + rank,
                        "click_count": 4, "champion_stage_snapshot": 1, "completed_at": settle_at,
                    })
                await db.world_gc_level_bonus_awards.insert_one({
                    "season_id": "season-1", "gc_number": gc_number, "level_key": "L2",
                    "user_id": non_winner_id, "rank": 1, "bonus_tokens": 4,
                    "status": "finalized_uncredited", "finalized_at": settle_at - timedelta(days=1),
                })
                from services.world_gc_competition_engine import finalize_due_world_gc_levels
                await finalize_due_world_gc_levels(db, now=settle_at)
                await finalize_due_world_gc_levels(db, now=settle_at + timedelta(seconds=1))
                finalization = await db.world_gc_level_finalizations.find_one(
                    {"season_id": "season-1", "gc_number": gc_number, "level_key": "champion"}, {"_id": 0},
                )
                config_row = await db.world_gc_competition_configs.find_one(
                    {"season_id": "season-1", "gc_number": gc_number}, {"_id": 0},
                )
                from services.world_gc_competition_engine import _settle_champion_awards
                await _settle_champion_awards(db, config_row, finalization, settle_at + timedelta(seconds=2))
                award = await db.world_gc_champion_awards.find_one(
                    {"season_id": "season-1", "gc_number": gc_number, "user_id": user_id}, {"_id": 0},
                )
                assert award["status"] == "credited"
                assert award["champion_prize_tokens"] == 50
                assert award["accumulated_bonus_tokens"] == 5
                assert await db.wallet_tx.count_documents({"user_id": user_id, "kind": "champion_prize"}) == 1
                grants = await db.bonus_grants.find({"user_id": user_id}, {"_id": 0}).to_list(10)
                assert len(grants) == 1 and grants[0]["source"] == "world_competition"
                wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
                assert wallet["withdrawable"] == 50 and wallet["bonus"] == 5 and wallet["balance"] == 55
                forfeited = await db.world_gc_level_bonus_awards.find_one(
                    {"season_id": "season-1", "gc_number": gc_number, "level_key": "L2", "user_id": non_winner_id},
                    {"_id": 0},
                )
                assert forfeited["status"] == "forfeited"
                assert await db.wallets.count_documents({"user_id": non_winner_id}) == 0
                assert await db.wallet_tx.count_documents({
                    "user_id": {"$in": other_champion_winners}, "kind": "champion_prize",
                }) == 4
            return run()
        db_insert(db_name, settle_champion)
    finally:
        def cleanup(db):
            async def run():
                await db.users.delete_many({"user_id": user_id})
                await db.users.delete_many({"user_id": admin_id})
                await db.users.delete_many({"user_id": non_winner_id})
                await db.users.delete_many({"user_id": {"$in": other_champion_winners}})
                for collection in (
                    "world_gc_competition_configs", "world_gc_progress", "world_gc_level_sessions",
                    "world_gc_level_attempts", "world_gc_level_bests", "world_gc_level_finalizations",
                    "world_gc_level_bonus_awards", "world_gc_champion_awards", "bonus_grants", "wallets", "wallet_tx",
                ):
                    await db[collection].delete_many({"$or": [
                        {"user_id": {"$in": [user_id, *other_champion_winners]}}, {"user_id": non_winner_id}, {"gc_number": gc_number},
                        {"session_id": {"$regex": f"^{prepared['session_id']}"}} if "prepared" in locals() else {"session_id": ""},
                    ]})
                if previous_setting:
                    await db.world_settings.replace_one({"_id": "active_global_contest"}, previous_setting, upsert=True)
                else:
                    await db.world_settings.delete_one({"_id": "active_global_contest"})
                if previous_contest:
                    await db.world_global_contests.replace_one(
                        {"season_id": "season-1", "contest_number": gc_number}, previous_contest, upsert=True,
                    )
                else:
                    await db.world_global_contests.delete_one({"season_id": "season-1", "contest_number": gc_number})
            return run()
        db_insert(db_name, cleanup)


def test_admin_configure_and_schedule_sidecar_without_changing_legacy_schedule(db_name):
    gc_number = 52
    admin_id = f"world_gc_config_admin_{uuid.uuid4().hex[:12]}"
    season_start = datetime(2030, 1, 1, tzinfo=timezone.utc)
    previous_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one(
        {"season_id": "season-1", "contest_number": gc_number}))
    previous_config = db_read(db_name, lambda db: db.world_gc_competition_configs.find_one(
        {"season_id": "season-1", "gc_number": gc_number}))
    headers = {"Authorization": f"Bearer {create_jwt(admin_id)}"}
    contest_rows = db_read(db_name, lambda db: db.world_global_contests.find(
        {"season_id": "season-1"}, {"_id": 0, "contest_number": 1}).sort("contest_number", 1).to_list(100))
    contest_sequence = ordered_contest_sequence(row.get("contest_number") for row in contest_rows)
    schedule_slot = contest_sequence.index(gc_number) + 1 if gc_number in contest_sequence else 1
    schedule = championship_window(season_start, schedule_slot)
    levels = [{
        "level": level, "game_id": "memory_match", "game_config": {"pair_count": 4},
        "opens_at": schedule["level_unlocks"][level - 1].isoformat(),
        "bonus_rewards": {"1": 5, "2": 4, "3": 3, "4": 2, "5": 1},
    } for level in range(1, 11)]
    draft = {
        "model": "every_level", "levels": levels,
        "champion": {"game_id": "memory_match", "game_config": {"pair_count": 10},
                     "opens_at": schedule["champion_opens_at"].isoformat(),
                     "closes_at": schedule["champion_closes_at"].isoformat()},
    }

    def setup(db):
        async def run():
            await db.users.insert_one({"user_id": admin_id, "email": f"{admin_id}@example.test",
                                       "role": "super_admin", "created_at": datetime.now(timezone.utc)})
            await db.world_settings.replace_one(
                {"_id": "active_global_contest"},
                {"_id": "active_global_contest", "season_id": "season-1",
                 "season_start_at": season_start, "championship_extensions": {}},
                upsert=True,
            )
            await db.world_global_contests.replace_one(
                {"season_id": "season-1", "contest_number": gc_number},
                {"season_id": "season-1", "contest_number": gc_number, "status": "draft",
                 "game_id": "number_sequence", "levels_config": [], "start_at": None, "end_at": None},
                upsert=True,
            )
        return run()
    db_insert(db_name, setup)

    try:
        saved = requests.put(f"{API}/admin/world-gc/competitions/{gc_number}", headers=headers,
                             json=draft, timeout=20)
        assert saved.status_code == 200, saved.text
        assert saved.json()["config"]["activation_status"] == "draft"

        retired = requests.post(f"{API}/admin/world-gc/competitions/{gc_number}/schedule",
                                headers=headers, json={"confirmation": "yes"}, timeout=20)
        assert retired.status_code == 410
        bad_confirmation = requests.post(f"{API}/admin/world-gc/competitions/{gc_number}/apply-future",
                                         headers=headers, json={"confirmation": "yes"}, timeout=20)
        assert bad_confirmation.status_code == 400
        inactive_model = requests.get(f"{API}/world/gc/active-model", timeout=20).json()
        assert inactive_model["active"] is False
        applied = requests.post(f"{API}/admin/world-gc/competitions/{gc_number}/apply-future",
                                headers=headers, json={"confirmation": f"APPLY GC{gc_number} FUTURE"}, timeout=20)
        assert applied.status_code == 200, applied.text
        body = applied.json()["config"]
        assert body["activation_status"] == "active" and body["engine"] == "every_level_engine"
        assert body["levels"][0]["opens_at"] == schedule["level_unlocks"][0].isoformat()
        assert applied.json()["legacy_schedule_changed"] is False
        replay = requests.post(f"{API}/admin/world-gc/competitions/{gc_number}/apply-future",
                               headers=headers, json={"confirmation": f"APPLY GC{gc_number} FUTURE"}, timeout=20)
        assert replay.status_code == 409 or replay.json().get("idempotent_replay") is True

        stored_setting = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))
        assert ensure_utc(stored_setting["season_start_at"]) == season_start
        assert stored_setting.get("championship_extensions") == {}
        legacy = db_read(db_name, lambda db: db.world_global_contests.find_one(
            {"season_id": "season-1", "contest_number": gc_number}))
        assert legacy["status"] == "draft" and legacy["game_id"] == "number_sequence"
        actual_start = db_read(db_name, lambda db: db.world_settings.find_one({"_id": "active_global_contest"}))["season_start_at"]
        assert ensure_utc(actual_start) == season_start
    finally:
        def cleanup(db):
            async def run():
                await db.users.delete_many({"user_id": admin_id})
                for collection in ("world_gc_competition_configs", "world_gc_progress", "world_gc_level_sessions",
                                   "world_gc_level_attempts", "world_gc_level_bests", "world_gc_level_finalizations",
                                   "world_gc_level_bonus_awards", "world_gc_champion_awards"):
                    await db[collection].delete_many({"season_id": "season-1", "gc_number": gc_number})
                if previous_setting:
                    await db.world_settings.replace_one({"_id": "active_global_contest"}, previous_setting, upsert=True)
                else:
                    await db.world_settings.delete_one({"_id": "active_global_contest"})
                if previous_contest:
                    await db.world_global_contests.replace_one(
                        {"season_id": "season-1", "contest_number": gc_number}, previous_contest, upsert=True,
                    )
                else:
                    await db.world_global_contests.delete_one({"season_id": "season-1", "contest_number": gc_number})
                if previous_config:
                    await db.world_gc_competition_configs.replace_one(
                        {"season_id": "season-1", "gc_number": gc_number}, previous_config, upsert=True,
                    )
            return run()
        db_insert(db_name, cleanup)


def test_legacy_champion_settlement_credits_top5_once_and_replays(db_name):
    contest_number = 51
    run_id = uuid.uuid4().hex[:10]
    user_ids = [f"legacy_settle_{run_id}_{rank}" for rank in range(1, 6)]
    now = datetime.now(timezone.utc)
    previous_contest = db_read(db_name, lambda db: db.world_global_contests.find_one(
        {"season_id": "season-1", "contest_number": contest_number}))
    def previous_rows(db, collection):
        async def run():
            return await db[collection].find(
                {"season_id": "season-1", "global_contest_number": contest_number},
            ).to_list(1000)
        return run()
    previous_scores = db_read(db_name, lambda db: previous_rows(db, "world_champion_scores"))
    previous_awards = db_read(db_name, lambda db: previous_rows(db, "world_winner_awards"))

    def setup(db):
        async def run():
            await db.users.insert_many([{
                "user_id": user_id, "email": f"{user_id}@example.test", "name": f"Legacy winner {rank}",
                "role": "user", "created_at": now - timedelta(days=1),
            } for rank, user_id in enumerate(user_ids, 1)])
            await db.world_global_contests.update_one(
                {"season_id": "season-1", "contest_number": contest_number},
                {"$set": {"season_id": "season-1", "contest_number": contest_number,
                           "status": "closed", "winner_count": 5}},
                upsert=True,
            )
            await db.world_champion_scores.insert_many([{
                "score_id": f"legacy_score_{run_id}_{rank}", "season_id": "season-1",
                "global_contest_number": contest_number, "user_id": user_id,
                "user_name": f"Legacy winner {rank}", "score": 1000 - rank,
                "duration_ms": rank * 100, "accuracy": 1.0, "eligible": True,
                "submitted_at": now + timedelta(milliseconds=rank), "champion_stage_snapshot": 1,
                "prize_amount_snapshot": 50,
            } for rank, user_id in enumerate(user_ids, 1)])
        return run()
    db_insert(db_name, setup)

    try:
        from routers.world_routes import _settle_world_champion_contest

        def settle(db):
            async def run():
                first = await _settle_world_champion_contest(db, contest_number)
                replay = await _settle_world_champion_contest(db, contest_number)
                assert first["ok"] is True and first["status"] == "settled"
                assert first["award_count"] == 5
                assert replay["idempotent_replay"] is True and replay["award_count"] == 5
                awards = await db.world_winner_awards.find(
                    {"season_id": "season-1", "global_contest_number": contest_number},
                    {"_id": 0},
                ).sort("rank", 1).to_list(5)
                assert [row["winning_amount"] for row in awards] == [50, 20, 15, 10, 5]
                for user_id in user_ids:
                    assert await db.wallet_tx.count_documents({
                        "user_id": user_id, "kind": "champion_prize",
                        "ref_order_id": {"$regex": f"WORLD-CHAMPION-{contest_number}-"},
                    }) == 1
            return run()
        db_insert(db_name, settle)
    finally:
        def cleanup(db):
            async def run():
                await db.users.delete_many({"user_id": {"$in": user_ids}})
                await db.wallets.delete_many({"user_id": {"$in": user_ids}})
                await db.wallet_tx.delete_many({"user_id": {"$in": user_ids}})
                await db.world_champion_scores.delete_many({
                    "season_id": "season-1", "global_contest_number": contest_number,
                    "user_id": {"$in": user_ids},
                })
                await db.world_winner_awards.delete_many({
                    "season_id": "season-1", "global_contest_number": contest_number,
                    "user_id": {"$in": user_ids},
                })
                if previous_contest:
                    await db.world_global_contests.replace_one(
                        {"season_id": "season-1", "contest_number": contest_number}, previous_contest, upsert=True,
                    )
                else:
                    await db.world_global_contests.delete_one({"season_id": "season-1", "contest_number": contest_number})
                for row in previous_scores:
                    row.pop("_id", None)
                    await db.world_champion_scores.insert_one(row)
                for row in previous_awards:
                    row.pop("_id", None)
                    await db.world_winner_awards.insert_one(row)
            return run()
        db_insert(db_name, cleanup)