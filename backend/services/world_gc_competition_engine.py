"""Isolated finalization and settlement for explicitly scheduled Every-Level GCs."""
from __future__ import annotations

from datetime import datetime, timezone

from services.world_gc_competition import normalize_level_key

SEASON_ID = "season-1"


def _as_utc(value):
    if not value:
        return None
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _level_config(config: dict, level_key: str) -> dict:
    if level_key == "champion":
        return config.get("champion") or {}
    number = int(level_key[1:])
    return next((row for row in config.get("levels", []) if int(row.get("level", 0)) == number), {})


def _finalization_due_at(config: dict, level_key: str):
    if level_key == "champion":
        return _as_utc(_level_config(config, level_key).get("closes_at"))
    number = int(level_key[1:])
    next_key = f"L{number + 1}" if number < 10 else "champion"
    return _as_utc(_level_config(config, next_key).get("opens_at"))


async def _freeze_level(db, config: dict, level_key: str, now: datetime) -> dict | None:
    due_at = _finalization_due_at(config, level_key)
    if due_at is None or now < due_at:
        return None

    gc_number = int(config["gc_number"])
    key = {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": level_key}
    existing = await db.world_gc_level_finalizations.find_one(key, {"_id": 0})
    if existing:
        return existing

    rows = await db.world_gc_level_bests.find(
        key, {"_id": 0},
    ).sort([("duration_ms", 1), ("completed_at", 1), ("user_id", 1)]).limit(5).to_list(5)
    if level_key == "champion" and len(rows) < 5:
        return None

    winners = []
    if level_key != "champion":
        rewards = _level_config(config, level_key).get("bonus_rewards") or {}
        for rank, row in enumerate(rows, 1):
            winners.append({**row, "rank": rank, "bonus_tokens": int(rewards.get(str(rank), 0))})
    else:
        from routers.world_routes import _champion_final_prize

        for rank, row in enumerate(rows, 1):
            progress = await db.world_progress.find_one(
                {"season_id": SEASON_ID, "user_id": row["user_id"]},
                {"_id": 0, "champion_stage": 1},
            ) or {}
            stage = max(1, int(row.get("champion_stage_snapshot") or progress.get("champion_stage") or 1))
            awards = await db.world_gc_level_bonus_awards.find(
                {"season_id": SEASON_ID, "gc_number": gc_number, "user_id": row["user_id"]},
                {"_id": 0, "bonus_tokens": 1},
            ).to_list(10)
            accumulated = round(sum(float(item.get("bonus_tokens") or 0) for item in awards), 2)
            winners.append({
                **row, "rank": rank, "champion_stage": stage,
                "champion_prize_tokens": _champion_final_prize(rank, stage),
                "accumulated_bonus_tokens": accumulated,
            })

    frozen = {
        **key, "status": "finalized", "winners": winners,
        "finalized_at": due_at, "recorded_at": now,
    }
    await db.world_gc_level_finalizations.update_one(key, {"$setOnInsert": frozen}, upsert=True)
    return await db.world_gc_level_finalizations.find_one(key, {"_id": 0})


async def _materialize_level_awards(db, finalization: dict):
    if finalization.get("level_key") == "champion":
        return
    key = {field: finalization[field] for field in ("season_id", "gc_number", "level_key")}
    for winner in finalization.get("winners", []):
        award_key = {**key, "user_id": winner["user_id"]}
        await db.world_gc_level_bonus_awards.update_one(
            award_key,
            {"$setOnInsert": {
                **award_key, "rank": winner["rank"], "duration_ms": winner["duration_ms"],
                "bonus_tokens": int(winner["bonus_tokens"]), "status": "finalized_uncredited",
                "finalized_at": finalization["finalized_at"],
            }},
            upsert=True,
        )


async def _settle_champion_awards(db, config: dict, finalization: dict, now: datetime):
    from routers.wallet_routes import _apply_tx_idempotent

    gc_number = int(config["gc_number"])
    champion_winners = {row["user_id"] for row in finalization.get("winners", [])}
    for winner in finalization.get("winners", []):
        user_id = winner["user_id"]
        award_key = {"season_id": SEASON_ID, "gc_number": gc_number, "user_id": user_id}
        frozen_award = {
            **award_key, "rank": winner["rank"], "duration_ms": winner["duration_ms"],
            "champion_stage": winner["champion_stage"],
            "champion_prize_tokens": float(winner["champion_prize_tokens"]),
            "accumulated_bonus_tokens": float(winner["accumulated_bonus_tokens"]),
            "status": "frozen_uncredited", "frozen_at": finalization["finalized_at"],
        }
        await db.world_gc_champion_awards.update_one(
            award_key, {"$setOnInsert": frozen_award}, upsert=True,
        )
        award = await db.world_gc_champion_awards.find_one(award_key, {"_id": 0})
        if award.get("status") == "credited":
            continue

        cash_ref = f"world-gc-every-level:{gc_number}:champion:{user_id}:cash"
        cash_tx = await _apply_tx_idempotent(
            db, user_id, "champion_prize", float(award["champion_prize_tokens"]),
            note=f"GC{gc_number} Every-Level Champion rank {award['rank']} prize",
            ref_order_id=cash_ref,
        )

        bonus_rows = await db.world_gc_level_bonus_awards.find(
            {"season_id": SEASON_ID, "gc_number": gc_number, "user_id": user_id,
                "status": "finalized_uncredited", "bonus_tokens": {"$gt": 0}},
            {"_id": 0},
        ).to_list(10)
        from services.bonus_grants import create_grant

        grant_ids = []
        for level_award in bonus_rows:
            level_key = level_award["level_key"]
            grant = await create_grant(
                db, user_id=user_id, amount=float(level_award["bonus_tokens"]), expires_at=None,
                actor_id="world-gc-system", actor_email="system",
                reason=f"GC{gc_number} {level_key} finalized leaderboard bonus",
                ref_key=f"world-gc:{gc_number}:{level_key}:{user_id}", source="world_competition",
            )
            grant_ids.append(grant["grant_id"])
            await db.world_gc_level_bonus_awards.update_one(
                {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": level_key,
                 "user_id": user_id, "status": "finalized_uncredited"},
                {"$set": {"status": "credited", "credited_at": now, "bonus_grant_id": grant["grant_id"]}},
            )

        await db.world_gc_champion_awards.update_one(
            {**award_key, "status": "frozen_uncredited"},
            {"$set": {"status": "credited", "credited_at": now, "wallet_tx_id": cash_tx["tx"]["tx_id"],
                       "bonus_grant_ids": grant_ids}},
        )

    await db.world_gc_level_bonus_awards.update_many(
        {"season_id": SEASON_ID, "gc_number": gc_number, "status": "finalized_uncredited",
         "user_id": {"$nin": list(champion_winners)}},
        {"$set": {"status": "forfeited", "forfeited_at": now,
                   "forfeiture_reason": "not_in_champion_top_five"}},
    )


async def finalize_due_world_gc_levels(db, now: datetime | None = None) -> dict:
    """Freeze due leaderboards and retry pending Champion credits using only sidecar data."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    from routers.world_gc_live_routes import (
        config_engine, is_world_paused, live_schedule, overlay_schedule, settle_hybrid_level_bonuses,
    )

    if await is_world_paused(db):
        return {"finalized": 0, "configs_checked": 0, "paused": True}
    configs = await db.world_gc_competition_configs.find(
        {"season_id": SEASON_ID, "activation_status": "active",
         "$or": [{"model": "every_level"}, {"engine": "legacy_hybrid"}]},
        {"_id": 0},
    ).to_list(50)
    finalized = 0
    for stored in configs:
        config = overlay_schedule(stored, await live_schedule(db, int(stored["gc_number"])))
        if config_engine(stored) == "legacy_hybrid":
            for row in config.get("levels", []):
                if row.get("applied_model") != "every_level":
                    continue
                result = await _freeze_level(db, config, f"L{int(row['level'])}", now)
                if result:
                    await _materialize_level_awards(db, result)
                    finalized += 1
            if await settle_hybrid_level_bonuses(db, int(config["gc_number"]), now):
                await db.world_gc_competition_configs.update_one(
                    {"season_id": SEASON_ID, "gc_number": int(config["gc_number"]), "activation_status": "active"},
                    {"$set": {"activation_status": "completed", "completed_at": now}},
                )
            continue
        for number in range(1, 11):
            result = await _freeze_level(db, config, f"L{number}", now)
            if result:
                await _materialize_level_awards(db, result)
                finalized += 1
        champion = await _freeze_level(db, config, "champion", now)
        if champion:
            await _settle_champion_awards(db, config, champion, now)
            finalized += 1
            await db.world_gc_competition_configs.update_one(
                {"season_id": SEASON_ID, "gc_number": int(config["gc_number"]),
                 "activation_status": "active"},
                {"$set": {"activation_status": "completed", "completed_at": now}},
            )
    return {"finalized": finalized, "configs_checked": len(configs)}
