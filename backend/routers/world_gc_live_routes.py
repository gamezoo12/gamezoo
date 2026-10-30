"""Live GC settings application, Free World pause/resume and an isolated preview sandbox."""
from __future__ import annotations

import hashlib
import json
import secrets
from copy import deepcopy
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from auth import require_admin, require_super_admin
from deps import get_db
from services.world_championship_schedule import championship_window, ordered_contest_sequence
from services.world_gc_competition import (
    MAX_CONFIGURABLE_GC,
    MIN_CONFIGURABLE_GC,
    SUPPORTED_GAMES,
    apply_memory_match_click,
    build_memory_match_board,
    default_gc_config,
    memory_match_pair_count,
    normalize_gc_config,
)

SEASON_ID = "season-1"
LEGACY_GAMES = set(SUPPORTED_GAMES)
APPLY_SAFETY_SECONDS = 120
PAUSE_ID = "free_world_pause"
PAUSED_DETAIL = {"code": "FREE_WORLD_PAUSED",
                 "message": "Free World is temporarily paused. Your progress, scores and rewards are safe."}

admin_router = APIRouter(prefix="/api/admin/world-gc", tags=["world-gc-live-admin"])
public_router = APIRouter(prefix="/api/world", tags=["world-gc-live-public"])


def _utc(value):
    if not value:
        return None
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def config_engine(config: dict | None) -> str | None:
    """Which gameplay engine an applied config drives; None when not applied."""
    if not config or config.get("activation_status") not in ("active", "completed"):
        return None
    return config.get("engine") or ("every_level_engine" if config.get("model") == "every_level" else "legacy_hybrid")


# ---------------------------------------------------------------- schedule (read-only)

async def live_schedule(db, gc_number: int) -> dict | None:
    """Read the existing Free World scheduler's window for a GC; never writes."""
    settings = await db.world_settings.find_one(
        {"_id": "active_global_contest", "season_id": SEASON_ID},
        {"_id": 0, "season_start_at": 1, "championship_extensions": 1},
    ) or {}
    if not settings.get("season_start_at"):
        return None
    rows = await db.world_global_contests.find(
        {"season_id": SEASON_ID}, {"_id": 0, "contest_number": 1},
    ).sort("contest_number", 1).to_list(100)
    sequence = ordered_contest_sequence(row.get("contest_number") for row in rows)
    if int(gc_number) not in sequence:
        return None
    window = championship_window(settings["season_start_at"], sequence.index(int(gc_number)) + 1,
                                 settings.get("championship_extensions") or {})
    return {"levels": [_utc(v) for v in window["level_unlocks"]],
            "champion_opens_at": _utc(window["champion_opens_at"]),
            "champion_closes_at": _utc(window["champion_closes_at"])}


def overlay_schedule(config: dict, schedule: dict | None) -> dict:
    """Return a copy of the config whose times come from the existing scheduler."""
    if not schedule:
        return config
    merged = deepcopy(config)
    for row in merged.get("levels", []):
        row["opens_at"] = schedule["levels"][int(row["level"]) - 1].isoformat()
    merged.setdefault("champion", {})
    merged["champion"]["opens_at"] = schedule["champion_opens_at"].isoformat()
    merged["champion"]["closes_at"] = schedule["champion_closes_at"].isoformat()
    return merged


def _first_unopened(schedule: dict, now: datetime):
    cutoff = now + timedelta(seconds=APPLY_SAFETY_SECONDS)
    level = next((n for n in range(1, 11) if schedule["levels"][n - 1] > cutoff), None)
    return level, schedule["champion_opens_at"] > cutoff


# ---------------------------------------------------------------- pause / resume

async def is_world_paused(db) -> bool:
    return bool(await db.world_settings.find_one({"_id": PAUSE_ID, "paused": True}, {"_id": 1}))


async def assert_world_not_paused(db):
    if await is_world_paused(db):
        raise HTTPException(status_code=423, detail=PAUSED_DETAIL)


async def _audit(db, action: str, admin: dict, **fields):
    await db.world_gc_config_audit.insert_one({
        "audit_id": f"wga_{secrets.token_hex(8)}", "action": action,
        "actor_id": admin.get("user_id"), "actor_email": admin.get("email"),
        "created_at": datetime.now(timezone.utc), **fields,
    })


async def _events_since(db, since: datetime, now: datetime) -> list[dict]:
    from routers.world_routes import _active_contest

    active = await _active_contest(db)
    if not active:
        return []
    gc = int(active.get("contest_number") or 0)
    schedule = await live_schedule(db, gc)
    if not schedule:
        return []
    points = [(f"GC{gc} Level {n} opened", t) for n, t in enumerate(schedule["levels"], 1)]
    points += [(f"GC{gc} Champion Level opened", schedule["champion_opens_at"]),
               (f"GC{gc} Champion Level closed", schedule["champion_closes_at"])]
    return [{"event": label, "at": at.isoformat()} for label, at in points if since <= at <= now]


class ResumeInput(BaseModel):
    acknowledge_schedule_passed: bool = False
    confirmation: str | None = None


class PauseInput(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


@public_router.get("/pause-status")
async def public_pause_status():
    doc = await get_db().world_settings.find_one({"_id": PAUSE_ID}, {"_id": 0, "paused": 1, "paused_at": 1}) or {}
    return {"paused": bool(doc.get("paused")), "message": PAUSED_DETAIL["message"] if doc.get("paused") else None}


@admin_router.get("/free-world/pause")
async def admin_pause_status(request: Request):
    await require_super_admin(request)
    db = get_db()
    doc = await db.world_settings.find_one({"_id": PAUSE_ID}, {"_id": 0}) or {"paused": False}
    events = await _events_since(db, _utc(doc["paused_at"]), datetime.now(timezone.utc)) if doc.get("paused") else []
    audits = await db.world_gc_config_audit.find(
        {"action": {"$in": ["pause", "resume"]}}, {"_id": 0},
    ).sort("created_at", -1).to_list(10)
    return {"state": doc, "schedule_events_during_pause": events, "audit": audits}


@admin_router.post("/free-world/pause")
async def pause_free_world(payload: PauseInput, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    now = datetime.now(timezone.utc)
    try:
        result = await db.world_settings.update_one(
            {"_id": PAUSE_ID, "paused": {"$ne": True}},
            {"$set": {"paused": True, "paused_at": now, "paused_by": admin.get("user_id"),
                      "pause_reason": payload.reason, "pause_id": f"pz_{secrets.token_hex(6)}"}},
            upsert=True,
        )
        changed = bool(result.modified_count or result.upserted_id)
    except DuplicateKeyError:
        changed = False
    if changed:
        await _audit(db, "pause", admin, reason=payload.reason)
    return {"paused": True, "idempotent_replay": not changed, "schedule_changed": False}


@admin_router.post("/free-world/resume")
async def resume_free_world(payload: ResumeInput, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    doc = await db.world_settings.find_one({"_id": PAUSE_ID}, {"_id": 0}) or {}
    if not doc.get("paused"):
        return {"paused": False, "idempotent_replay": True, "schedule_changed": False}
    now = datetime.now(timezone.utc)
    events = await _events_since(db, _utc(doc["paused_at"]), now)
    if events and not (payload.acknowledge_schedule_passed and payload.confirmation == "RESUME ON EXISTING SCHEDULE"):
        raise HTTPException(status_code=409, detail={
            "code": "SCHEDULE_PASSED_DURING_PAUSE", "events": events,
            "message": ("Scheduled times passed while Free World was paused. Resuming keeps the existing schedule "
                        "unchanged (expired levels are not reopened). Use the existing +24h Champion extension first "
                        "if more time is needed, then confirm 'RESUME ON EXISTING SCHEDULE'."),
        })
    result = await db.world_settings.update_one(
        {"_id": PAUSE_ID, "paused": True, "pause_id": doc.get("pause_id")},
        {"$set": {"paused": False, "resumed_at": now, "resumed_by": admin.get("user_id"),
                  "last_pause_events": events}},
    )
    if result.modified_count == 1:
        await _audit(db, "resume", admin, paused_at=doc.get("paused_at"), schedule_events_during_pause=events)
    return {"paused": False, "idempotent_replay": result.modified_count != 1,
            "schedule_changed": False, "schedule_events_during_pause": events}


# ---------------------------------------------------------------- draft / apply

def draft_of(config: dict | None) -> dict | None:
    if not config:
        return None
    if config.get("pending_draft"):
        return config["pending_draft"]
    return config if config.get("activation_status") == "draft" else None


def strip_schedule_fields(payload: dict) -> dict:
    clean = deepcopy(payload or {})
    for row in clean.get("levels") or []:
        if isinstance(row, dict):
            row.pop("opens_at", None)
    if isinstance(clean.get("champion"), dict):
        clean["champion"].pop("opens_at", None)
        clean["champion"].pop("closes_at", None)
    return clean


def _validate_game(label: str, game_id: str, game_config: dict, allowed: set):
    if game_id not in allowed:
        names = "Memory Match only (full Every-Level engine)" if allowed == {"memory_match"} else "the registered skill games"
        raise HTTPException(status_code=422, detail=f"{label}: this engine supports {names}")
    if game_id == "colour_match":
        try:
            colours, rounds = int(game_config.get("colours", 6)), int(game_config.get("rounds", 10))
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail=f"{label}: Colour Match settings must be integers")
        if not 2 <= colours <= 11 or not 1 <= rounds <= 100:
            raise HTTPException(status_code=422, detail=f"{label}: Colour Match needs 2–11 colours and 1–100 rounds")


def _level_row(rows: list, level: int) -> dict:
    return next((r for r in rows or [] if int(r.get("level", 0)) == level), {"level": level})


def _fingerprint(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()


class ApplyInput(BaseModel):
    confirmation: str


async def level_states(db, gc_number: int, config: dict | None) -> dict:
    """Read-only per-level opened/applied view for the Admin page."""
    from routers.world_routes import _active_contest

    schedule = await live_schedule(db, gc_number)
    active = await _active_contest(db)
    active_gc = int(active.get("contest_number") or 0) if active else None
    now = datetime.now(timezone.utc)
    applied = config if config_engine(config) else None
    draft = draft_of(config) if config else None
    finalized = {row["level_key"] for row in await db.world_gc_level_finalizations.find(
        {"season_id": SEASON_ID, "gc_number": int(gc_number)}, {"_id": 0, "level_key": 1}).to_list(20)}
    cutoff = now + timedelta(seconds=APPLY_SAFETY_SECONDS)
    rows = []
    for n in range(1, 11):
        opens = schedule["levels"][n - 1] if schedule else None
        closes = (schedule["levels"][n] if n < 10 else schedule["champion_opens_at"]) if schedule else None
        live_row = _level_row((applied or {}).get("levels"), n)
        effective = live_row.get("game_id")
        if active_gc == int(gc_number):
            from routers.world_routes import _effective_level_config
            effective = (await _effective_level_config(db, n)).get("game_id")
        elif not effective and not applied:
            effective = "number_sequence"
        pending = _level_row((draft or {}).get("levels"), n).get("game_id")
        status = ("Finalized" if f"L{n}" in finalized else "Upcoming" if not opens or opens > now
                  else "Closed" if closes and closes <= now else "Open")
        rows.append({"level": n, "opens_at": opens.isoformat() if opens else None,
                     "effective_game_id": effective, "pending_game_id": pending if pending and pending != effective else None,
                     "status": status, "eligible": bool(opens and opens > cutoff and status == "Upcoming"),
                     "opened": bool(opens and opens <= now), "game_id": live_row.get("game_id"),
                     "applied_model": live_row.get("applied_model") or ((applied or {}).get("model") if applied and live_row.get("game_id") else None),
                     "bonus_rewards": live_row.get("bonus_rewards") if live_row.get("applied_model") == "every_level" else None})
    champ = (applied or {}).get("champion") or {}
    champ_effective = champ.get("game_id")
    if active_gc == int(gc_number):
        from routers.world_routes import _champion_game_for
        champ_effective = ((await _champion_game_for(db, gc_number)) or {}).get("game_id") or champ_effective
    next_level, champion_unopened = _first_unopened(schedule, now) if schedule else (None, False)
    return {
        "levels": rows,
        "champion": {"opens_at": schedule["champion_opens_at"].isoformat() if schedule else None,
                     "closes_at": schedule["champion_closes_at"].isoformat() if schedule else None,
                     "opened": bool(schedule and schedule["champion_opens_at"] <= now),
                     "game_id": champ.get("game_id"), "effective_game_id": champ_effective,
                     "pending_game_id": ((draft or {}).get("champion") or {}).get("game_id")
                     if ((draft or {}).get("champion") or {}).get("game_id") != champ_effective else None},
        "last_apply": ({"at": applied.get("applied_at"), "scope": applied.get("applied_scope"),
                        "from_level": applied.get("applied_from_level"),
                        "levels": [{"level": r["level"], "game_id": r.get("game_id")} for r in applied.get("levels", [])
                                   if not r.get("locked") and r.get("game_id")]} if applied else None),
        "active_gc": active_gc, "is_active_gc": active_gc == int(gc_number),
        "next_unopened_level": next_level, "champion_unopened": champion_unopened,
        "has_started": bool(schedule and schedule["levels"][0] <= now),
    }


@admin_router.post("/competitions/{gc_number}/apply-current")
async def apply_to_current_gc(gc_number: int, payload: ApplyInput, request: Request):
    from routers.world_routes import _active_contest

    admin = await require_super_admin(request)
    if not MIN_CONFIGURABLE_GC <= gc_number <= MAX_CONFIGURABLE_GC:
        raise HTTPException(status_code=404, detail="GC out of configurable range")
    db = get_db()
    active = await _active_contest(db)
    if not active or int(active.get("contest_number") or 0) != gc_number:
        raise HTTPException(status_code=409, detail=f"GC{gc_number} is not the currently active GC. Use Apply to Future GC instead.")
    if payload.confirmation != f"APPLY GC{gc_number}":
        raise HTTPException(status_code=400, detail=f"Type APPLY GC{gc_number} to confirm")
    key = {"season_id": SEASON_ID, "gc_number": gc_number}
    config = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    if config and config.get("activation_status") == "completed":
        raise HTTPException(status_code=409, detail="This GC is completed; its results are protected")
    draft = draft_of(config)
    if not draft and config_engine(config):
        return {"config": config, "idempotent_replay": True, "affected_levels": [], "champion_affected": False,
                "legacy_schedule_changed": False, "message": "Already applied; there are no new draft changes."}
    if not draft:
        raise HTTPException(status_code=409, detail="No saved draft to apply. Save a draft first.")
    schedule = await live_schedule(db, gc_number)
    if not schedule:
        raise HTTPException(status_code=409, detail="The existing scheduler has no window for this GC")
    now = datetime.now(timezone.utc)
    first_level, champion_unopened = _first_unopened(schedule, now)
    if first_level is None and not champion_unopened:
        raise HTTPException(status_code=409, detail=(
            f"Every level of GC{gc_number}, including the Champion Level, has already opened (or opens within "
            f"{APPLY_SAFETY_SECONDS // 60} minutes). Settings are never applied retroactively; save them for a future GC."))

    engine = config_engine(config) or "legacy_hybrid"
    model = draft.get("model") or "champion_only"
    if engine == "every_level_engine" and model != "every_level":
        raise HTTPException(status_code=409, detail="This GC runs the full Every-Level engine; its model cannot change mid-competition")
    allowed = {"memory_match"} if engine == "every_level_engine" else LEGACY_GAMES
    affected = list(range(first_level, 11)) if first_level else []
    live_levels = (config or {}).get("levels") if config_engine(config) else default_gc_config(gc_number)["levels"]
    new_levels, applied_parts = [], []
    for n in range(1, 11):
        current = deepcopy(_level_row(live_levels, n))
        current.pop("opens_at", None)
        if n not in affected:
            new_levels.append({**current, "level": n, "locked": True,
                               "applied_model": current.get("applied_model") or (config.get("model") if config_engine(config) and current.get("game_id") else None)})
            continue
        row = _level_row(draft.get("levels"), n)
        if not row.get("game_id"):
            raise HTTPException(status_code=422, detail=f"Choose a game for Level {n}")
        game_config = row.get("game_config") or {}
        _validate_game(f"Level {n}", row["game_id"], game_config, allowed)
        rewards = {str(r): int((row.get("bonus_rewards") or {}).get(str(r), 0)) for r in range(1, 6)}
        new_levels.append({"level": n, "game_id": row["game_id"], "game_config": deepcopy(game_config),
                           "bonus_rewards": rewards, "applied_model": model, "applied_at": now,
                           "applied_by": admin.get("user_id"), "locked": False})
        applied_parts.append([n, row["game_id"], game_config, rewards])

    live_champion = deepcopy((config or {}).get("champion") or {}) if config_engine(config) else {}
    draft_champion = draft.get("champion") or {}
    champion_affected = bool(champion_unopened and draft_champion.get("game_id") and (
        draft_champion.get("game_id") != live_champion.get("game_id")
        or (draft_champion.get("game_config") or {}) != (live_champion.get("game_config") or {})))
    if champion_affected:
        _validate_game("Champion", draft_champion["game_id"], draft_champion.get("game_config") or {}, allowed)
        live_champion.update({"game_id": draft_champion["game_id"],
                              "game_config": deepcopy(draft_champion.get("game_config") or {}),
                              "applied_at": now, "applied_by": admin.get("user_id")})
        applied_parts.append(["champion", draft_champion["game_id"], draft_champion.get("game_config") or {}])
    live_champion["prize_source"] = "existing_world_champion_prizes"
    if not applied_parts:
        raise HTTPException(status_code=409, detail="Nothing to apply: the remaining unopened levels have no new settings")

    fingerprint = _fingerprint(model, [p for p in applied_parts if p[0] != "champion"],
                               draft_champion.get("game_id"), draft_champion.get("game_config") or {})
    if config and config.get("activation_status") == "active" and config.get("last_apply_fingerprint") == fingerprint:
        await db.world_gc_competition_configs.update_one(key, {"$unset": {"pending_draft": ""}})
        return {"config": await db.world_gc_competition_configs.find_one(key, {"_id": 0}), "idempotent_replay": True,
                "affected_levels": [], "locked_levels": [], "champion_affected": False,
                "legacy_schedule_changed": False, "message": "Already applied; the draft matched the live settings."}
    if _first_unopened(schedule, datetime.now(timezone.utc)) != (first_level, champion_unopened):
        raise HTTPException(status_code=409, detail="A level opened while applying; reload and try again")

    previous = {k: (config or {}).get(k) for k in ("model", "engine", "activation_status", "levels", "champion")}
    revision = int((config or {}).get("revision") or 0)
    new_fields = {"model": model, "engine": engine, "activation_status": "active", "levels": new_levels,
                  "champion": live_champion, "revision": revision + 1, "last_apply_fingerprint": fingerprint,
                  "applied_scope": "current", "applied_from_level": first_level or "champion",
                  "applied_at": now, "applied_by": admin.get("user_id"), "updated_at": now}
    if config:
        result = await db.world_gc_competition_configs.update_one(
            {**key, "revision": (config.get("revision"))},
            {"$set": new_fields, "$unset": {"pending_draft": ""}},
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="Configuration changed concurrently; reload and try again")
    else:
        try:
            await db.world_gc_competition_configs.insert_one({**key, **new_fields, "created_at": now})
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="Configuration changed concurrently; reload and try again")
    await _audit(db, "apply_current", admin, gc_number=gc_number, previous=previous,
                 new={"model": model, "engine": engine, "levels": new_levels, "champion": live_champion},
                 affected_levels=affected, champion_affected=champion_affected,
                 locked_levels=[n for n in range(1, 11) if n not in affected])
    saved = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    return {"config": saved, "idempotent_replay": False, "affected_levels": affected,
            "locked_levels": [n for n in range(1, 11) if n not in affected],
            "champion_affected": champion_affected, "legacy_schedule_changed": False,
            "player_progress_changed": False}


@admin_router.post("/competitions/{gc_number}/apply-future")
async def apply_to_future_gc(gc_number: int, payload: ApplyInput, request: Request):
    from routers.world_routes import _active_contest

    admin = await require_super_admin(request)
    if not MIN_CONFIGURABLE_GC <= gc_number <= MAX_CONFIGURABLE_GC:
        raise HTTPException(status_code=404, detail="GC out of configurable range")
    if payload.confirmation != f"APPLY GC{gc_number} FUTURE":
        raise HTTPException(status_code=400, detail=f"Type APPLY GC{gc_number} FUTURE to confirm")
    db = get_db()
    active = await _active_contest(db)
    if active and int(active.get("contest_number") or 0) >= gc_number:
        raise HTTPException(status_code=409, detail=f"GC{gc_number} has already started; use Apply to Current GC")
    key = {"season_id": SEASON_ID, "gc_number": gc_number}
    config = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    draft = draft_of(config)
    if not draft:
        raise HTTPException(status_code=409, detail="No saved draft to apply. Save a draft first.")
    schedule = await live_schedule(db, gc_number)
    if not schedule:
        raise HTTPException(status_code=409, detail="The existing scheduler has no window for this GC yet")
    now = datetime.now(timezone.utc)
    if schedule["levels"][0] <= now + timedelta(seconds=APPLY_SAFETY_SECONDS):
        raise HTTPException(status_code=409, detail="This GC is about to start; use Apply to Current GC")
    for collection in ("world_gc_progress", "world_gc_level_bests", "world_gc_level_finalizations"):
        if await db[collection].count_documents(key):
            raise HTTPException(status_code=409, detail="This GC already has competition records")
    model = draft.get("model") or "champion_only"
    games = [(_level_row(draft.get("levels"), n).get("game_id")) for n in range(1, 11)]
    champion = draft.get("champion") or {}
    games_all = games + [champion.get("game_id")]
    if any(not g for g in games_all):
        raise HTTPException(status_code=422, detail="Choose a game for every level and the Champion Level")
    engine = ("every_level_engine" if model == "every_level" and all(g == "memory_match" for g in games_all)
              else "legacy_hybrid")
    allowed = {"memory_match"} if engine == "every_level_engine" else LEGACY_GAMES
    levels = []
    for n in range(1, 11):
        row = _level_row(draft.get("levels"), n)
        _validate_game(f"Level {n}", row["game_id"], row.get("game_config") or {}, allowed)
        levels.append({"level": n, "game_id": row["game_id"], "game_config": deepcopy(row.get("game_config") or {}),
                       "bonus_rewards": {str(r): int((row.get("bonus_rewards") or {}).get(str(r), 0)) for r in range(1, 6)},
                       "applied_model": model, "applied_at": now, "applied_by": admin.get("user_id"), "locked": False})
    _validate_game("Champion", champion["game_id"], champion.get("game_config") or {}, allowed)
    live_champion = {"game_id": champion["game_id"], "game_config": deepcopy(champion.get("game_config") or {}),
                     "prize_source": "existing_world_champion_prizes"}
    candidate = overlay_schedule({"gc_number": gc_number, "levels": levels, "champion": live_champion}, schedule)
    if engine == "every_level_engine":
        try:
            for level_key in [f"L{n}" for n in range(1, 11)] + ["champion"]:
                memory_match_pair_count(candidate, level_key)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    fingerprint = _fingerprint(model, engine, levels and [[r["level"], r["game_id"], r["game_config"], r["bonus_rewards"]] for r in levels], live_champion)
    if config and config.get("activation_status") == "active" and config.get("last_apply_fingerprint") == fingerprint:
        await db.world_gc_competition_configs.update_one(key, {"$unset": {"pending_draft": ""}})
        return {"config": config, "idempotent_replay": True}
    previous = {k: (config or {}).get(k) for k in ("model", "engine", "activation_status", "levels", "champion")}
    new_fields = {"model": model, "engine": engine, "activation_status": "active",
                  "levels": candidate["levels"], "champion": candidate["champion"],
                  "revision": int((config or {}).get("revision") or 0) + 1, "last_apply_fingerprint": fingerprint,
                  "applied_scope": "future", "applied_from_level": 1, "applied_at": now,
                  "applied_by": admin.get("user_id"), "updated_at": now}
    if config:
        result = await db.world_gc_competition_configs.update_one(
            {**key, "revision": config.get("revision")}, {"$set": new_fields, "$unset": {"pending_draft": ""}},
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="Configuration changed concurrently; reload and try again")
    else:
        await db.world_gc_competition_configs.insert_one({**key, **new_fields, "created_at": now})
    await _audit(db, "apply_future", admin, gc_number=gc_number, previous=previous,
                 new={"model": model, "engine": engine, "levels": levels, "champion": live_champion},
                 affected_levels=list(range(1, 11)), champion_affected=True)
    return {"config": await db.world_gc_competition_configs.find_one(key, {"_id": 0}),
            "idempotent_replay": False, "legacy_schedule_changed": False}


@admin_router.get("/competitions/{gc_number}/audit")
async def gc_config_audit(gc_number: int, request: Request):
    await require_super_admin(request)
    rows = await get_db().world_gc_config_audit.find(
        {"gc_number": gc_number}, {"_id": 0, "previous": 0},
    ).sort("created_at", -1).to_list(20)
    return {"items": rows}


# ---------------------------------------------------------------- hybrid (existing engine + level bonuses)

async def record_hybrid_level_best(db, user: dict, level: int, duration_ms: int, session_id: str, now: datetime):
    """For an Every-Level level applied to a GC on the existing engine, keep the player's best time."""
    from routers.world_routes import _active_contest

    active = await _active_contest(db)
    gc = int((active or {}).get("contest_number") or 0)
    if gc < MIN_CONFIGURABLE_GC:
        return
    config = await db.world_gc_competition_configs.find_one(
        {"season_id": SEASON_ID, "gc_number": gc, "activation_status": "active", "engine": "legacy_hybrid"},
        {"_id": 0, "levels": 1},
    )
    if not config or _level_row(config.get("levels"), level).get("applied_model") != "every_level":
        return
    schedule = await live_schedule(db, gc)
    if not schedule:
        return
    opens = schedule["levels"][level - 1]
    closes = schedule["levels"][level] if level < 10 else schedule["champion_opens_at"]
    if not opens <= now < closes:
        return
    best_key = {"season_id": SEASON_ID, "gc_number": gc, "level_key": f"L{level}", "user_id": user["user_id"]}
    best = {**best_key, "session_id": session_id, "attempt_id": session_id,
            "user_name": user.get("name") or user.get("email") or "Player",
            "duration_ms": int(duration_ms), "click_count": 0, "completed_at": now, "engine": "legacy_hybrid"}
    try:
        await db.world_gc_level_bests.update_one(
            {**best_key, "$or": [{"duration_ms": {"$gt": int(duration_ms)}}, {"duration_ms": {"$exists": False}}]},
            {"$set": best}, upsert=True,
        )
    except DuplicateKeyError:
        pass


async def settle_hybrid_level_bonuses(db, gc_number: int, now: datetime) -> bool:
    """After the existing Champion settlement, credit level bonuses to Champion Top 5; forfeit others."""
    contest = await db.world_global_contests.find_one(
        {"season_id": SEASON_ID, "contest_number": gc_number}, {"_id": 0, "status": 1},
    ) or {}
    if contest.get("status") not in ("settled", "closed_settled"):
        return False
    from services.bonus_grants import create_grant

    winners = {row["user_id"] for row in await db.world_winner_awards.find(
        {"season_id": SEASON_ID, "global_contest_number": gc_number}, {"_id": 0, "user_id": 1},
    ).to_list(10)}
    pending = await db.world_gc_level_bonus_awards.find(
        {"season_id": SEASON_ID, "gc_number": gc_number, "status": "finalized_uncredited",
         "user_id": {"$in": list(winners)}, "bonus_tokens": {"$gt": 0}}, {"_id": 0},
    ).to_list(100)
    for award in pending:
        grant = await create_grant(
            db, user_id=award["user_id"], amount=float(award["bonus_tokens"]), expires_at=None,
            actor_id="world-gc-system", actor_email="system",
            reason=f"GC{gc_number} {award['level_key']} finalized leaderboard bonus",
            ref_key=f"world-gc:{gc_number}:{award['level_key']}:{award['user_id']}", source="world_competition",
        )
        await db.world_gc_level_bonus_awards.update_one(
            {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": award["level_key"],
             "user_id": award["user_id"], "status": "finalized_uncredited"},
            {"$set": {"status": "credited", "credited_at": now, "bonus_grant_id": grant["grant_id"]}},
        )
    await db.world_gc_level_bonus_awards.update_many(
        {"season_id": SEASON_ID, "gc_number": gc_number, "status": "finalized_uncredited",
         "user_id": {"$nin": list(winners)}},
        {"$set": {"status": "forfeited", "forfeited_at": now, "forfeiture_reason": "not_in_champion_top_five"}},
    )
    return True


@public_router.get("/gc/level-board/{gc_number}/{level}")
async def hybrid_level_board(gc_number: int, level: int, request: Request):
    """Player view of one Every-Level level running on the existing Free World engine (read-only)."""
    from auth import get_current_user
    from routers.world_gc_competition_routes import future_gc_leaderboard_rows

    if not MIN_CONFIGURABLE_GC <= gc_number <= MAX_CONFIGURABLE_GC or not 1 <= level <= 10:
        raise HTTPException(status_code=404, detail="Level not found")
    db = get_db()
    config = await db.world_gc_competition_configs.find_one(
        {"season_id": SEASON_ID, "gc_number": gc_number, "activation_status": {"$in": ["active", "completed"]}},
        {"_id": 0})
    row = _level_row((config or {}).get("levels"), level)
    every_level = bool(config) and (
        row.get("applied_model") == "every_level" if config_engine(config) == "legacy_hybrid"
        else config.get("model") == "every_level")
    if not every_level:
        return {"enabled": False, "gc_number": gc_number, "level": level}
    try:
        user = await get_current_user(request)
    except HTTPException:
        user = None
    schedule = await live_schedule(db, gc_number)
    now = datetime.now(timezone.utc)
    opens = schedule["levels"][level - 1] if schedule else None
    closes = (schedule["levels"][level] if level < 10 else schedule["champion_opens_at"]) if schedule else None
    key = {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": f"L{level}"}
    finalization = await db.world_gc_level_finalizations.find_one(key, {"_id": 0})
    board = await future_gc_leaderboard_rows(db, gc_number, f"L{level}", (user or {}).get("user_id"))
    rewards = ({str(w["rank"]): int(w.get("bonus_tokens", 0)) for w in finalization.get("winners", [])}
               if finalization else {str(r): int(v) for r, v in (row.get("bonus_rewards") or {}).items()})
    status = ("Finalized" if finalization else "Upcoming" if not opens or opens > now
              else "Closed" if closes and closes <= now else "Open")
    return {
        "enabled": True, "gc_number": gc_number, "level": level, "game_id": row.get("game_id"), "status": status,
        "opens_at": opens.isoformat() if opens else None, "closes_at": closes.isoformat() if closes else None,
        "rewards": rewards, "reward_status": "finalized" if finalization else "provisional",
        "leaderboard": [{"rank": r["rank"], "user_name": r.get("user_name"), "duration_ms": r["duration_ms"],
                         "verified_reviewer": r.get("verified_reviewer", False)}
                        for r in board["rows"][:20]],
        "mine": {"rank": board["rank"], "personal_best_ms": board["personal_best_ms"],
                 "gap_to_next_ms": board["gap_to_next_ms"]} if board["mine"] else None,
    }


# ---------------------------------------------------------------- isolated preview sandbox

PREVIEW = "world_gc_preview_sandboxes"


def _preview_public(doc: dict) -> dict:
    out = {k: v for k, v in doc.items() if k not in ("_id", "memory")}
    memory = doc.get("memory")
    if memory:
        out["memory"] = {k: memory[k] for k in ("level", "card_count", "matched_positions", "click_count",
                                                 "started_at", "status", "duration_ms", "retries") if k in memory}
    return out


async def _preview_doc(db, admin: dict) -> dict:
    doc = await db[PREVIEW].find_one({"_id": admin["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="No preview session; reset preview to start one")
    return doc


def _rank(rows: list) -> list:
    best = {}
    for row in rows:
        pid = row["player_id"]
        if pid not in best or row["duration_ms"] < best[pid]["duration_ms"]:
            best[pid] = row
    return sorted(best.values(), key=lambda r: (r["duration_ms"], r["at"]))


class PreviewResetInput(BaseModel):
    gc_number: int = Field(..., ge=MIN_CONFIGURABLE_GC, le=MAX_CONFIGURABLE_GC)


class PreviewActionInput(BaseModel):
    action: str
    level: str | None = None
    sim_now: str | None = None
    opens_at: str | None = None
    count: int | None = Field(default=None, ge=1, le=20)
    config: dict | None = None
    position: int | None = Field(default=None, ge=0, le=31)
    solved: bool | None = None


@admin_router.get("/preview")
async def preview_get(request: Request):
    admin = await require_super_admin(request)
    doc = await get_db()[PREVIEW].find_one({"_id": admin["user_id"]})
    return {"preview": _preview_public(doc) if doc else None, "isolated": True}


@admin_router.post("/preview/reset")
async def preview_reset(payload: PreviewResetInput, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    config = await db.world_gc_competition_configs.find_one(
        {"season_id": SEASON_ID, "gc_number": payload.gc_number}, {"_id": 0},
    )
    source = draft_of(config) or config or default_gc_config(payload.gc_number)
    schedule = await live_schedule(db, payload.gc_number)
    base = schedule["levels"][0] if schedule else datetime.now(timezone.utc).replace(microsecond=0)
    levels = []
    for n in range(1, 11):
        row = _level_row(source.get("levels"), n)
        levels.append({"level": n, "game_id": row.get("game_id") or "memory_match",
                       "game_config": deepcopy(row.get("game_config") or {}),
                       "bonus_rewards": {str(r): int((row.get("bonus_rewards") or {}).get(str(r), 0)) for r in range(1, 6)},
                       "opens_at": (schedule["levels"][n - 1] if schedule else base + timedelta(days=n - 1)).isoformat(),
                       "state": "locked"})
    champion = source.get("champion") or {}
    doc = {
        "_id": admin["user_id"], "gc_number": payload.gc_number, "model": source.get("model") or "champion_only",
        "levels": levels,
        "champion": {"game_id": champion.get("game_id") or "memory_match",
                     "game_config": deepcopy(champion.get("game_config") or {}),
                     "opens_at": (schedule["champion_opens_at"] if schedule else base + timedelta(days=10)).isoformat(),
                     "closes_at": (schedule["champion_closes_at"] if schedule else base + timedelta(days=11, hours=22)).isoformat(),
                     "state": "locked"},
        "sim_now": base.isoformat(), "current_level": "L1",
        "players": [{"player_id": "admin", "name": "You (Admin)"}] +
                   [{"player_id": f"sim{i}", "name": f"Sim Player {i}"} for i in range(1, 7)],
        "scores": {}, "finalizations": {}, "wallet": {}, "champion_result": None,
        "log": [f"Preview reset from GC{payload.gc_number} settings"], "created_at": datetime.now(timezone.utc),
    }
    doc["levels"][0]["state"] = "open"
    await db[PREVIEW].replace_one({"_id": admin["user_id"]}, doc, upsert=True)
    return {"preview": _preview_public(doc), "isolated": True}


def _preview_level(doc: dict, level: str | None) -> dict:
    if level == "champion":
        return doc["champion"]
    try:
        n = int(str(level or "").lstrip("L"))
    except ValueError:
        raise HTTPException(status_code=422, detail="level must be L1–L10 or champion")
    if not 1 <= n <= 10:
        raise HTTPException(status_code=422, detail="level must be L1–L10 or champion")
    return doc["levels"][n - 1]


def _key(level: str) -> str:
    return "champion" if level == "champion" else f"L{int(str(level).lstrip('L'))}"


def _finalize_preview_level(doc: dict, level_key: str):
    ranked = _rank(doc["scores"].get(level_key, []))[:5]
    row = _preview_level(doc, level_key)
    if level_key == "champion":
        from routers.world_routes import _champion_final_prize

        winners = []
        for rank, entry in enumerate(ranked, 1):
            prize = _champion_final_prize(rank, max(1, doc["gc_number"] - 3))
            bonus = doc["wallet"].get(entry["player_id"], {}).get("bonus_pending", 0)
            winners.append({**entry, "rank": rank, "champion_prize_tokens": prize, "bonus_credited": bonus})
            wallet = doc["wallet"].setdefault(entry["player_id"], {})
            wallet["champion_tokens"] = wallet.get("champion_tokens", 0) + prize
            wallet["bonus_credited"] = wallet.get("bonus_credited", 0) + wallet.pop("bonus_pending", 0)
        winner_ids = {w["player_id"] for w in winners}
        for pid, wallet in doc["wallet"].items():
            if pid not in winner_ids and wallet.get("bonus_pending"):
                wallet["bonus_forfeited"] = wallet.get("bonus_forfeited", 0) + wallet.pop("bonus_pending")
        doc["champion_result"] = winners
    else:
        winners = []
        for rank, entry in enumerate(ranked, 1):
            tokens = int(row["bonus_rewards"].get(str(rank), 0)) if doc["model"] == "every_level" else 0
            winners.append({**entry, "rank": rank, "bonus_tokens": tokens})
            if tokens:
                wallet = doc["wallet"].setdefault(entry["player_id"], {})
                wallet["bonus_pending"] = wallet.get("bonus_pending", 0) + tokens
    doc["finalizations"][level_key] = winners
    row["state"] = "finalized"


@admin_router.post("/preview/action")
async def preview_action(payload: PreviewActionInput, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    doc = await _preview_doc(db, admin)
    action = payload.action
    now_iso = datetime.now(timezone.utc).isoformat()
    if action == "update_config":
        incoming = payload.config or {}
        if incoming.get("model") in ("champion_only", "every_level"):
            doc["model"] = incoming["model"]
        for row in incoming.get("levels") or []:
            target = _preview_level(doc, f"L{int(row.get('level'))}")
            for field in ("game_id", "game_config", "bonus_rewards", "opens_at"):
                if field in row:
                    target[field] = row[field]
        if isinstance(incoming.get("champion"), dict):
            for field in ("game_id", "game_config", "opens_at", "closes_at"):
                if field in incoming["champion"]:
                    doc["champion"][field] = incoming["champion"][field]
        try:
            normalize_gc_config(doc["gc_number"], {"model": doc["model"], "levels": [
                {k: v for k, v in r.items() if k in ("level", "game_id", "game_config", "bonus_rewards")} for r in doc["levels"]]})
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        doc["log"].append("Preview settings updated")
    elif action == "set_time":
        sim = _utc(payload.sim_now)
        doc["sim_now"] = payload.sim_now
        opens = [_utc(r["opens_at"]) for r in doc["levels"]] + [_utc(doc["champion"]["opens_at"])]
        for i, row in enumerate(doc["levels"] + [doc["champion"]]):
            if row.get("state") == "finalized":
                continue
            closes = opens[i + 1] if i < 10 else _utc(doc["champion"]["closes_at"])
            row["state"] = "locked" if sim < opens[i] else "open" if sim < closes else "closed"
        doc["log"].append(f"Simulated time set to {payload.sim_now}")
    elif action == "set_level_time":
        _utc(payload.opens_at)
        _preview_level(doc, payload.level)["opens_at"] = payload.opens_at
    elif action in ("open_level", "close_level", "jump"):
        row = _preview_level(doc, payload.level)
        if row.get("state") == "finalized" and action != "jump":
            raise HTTPException(status_code=409, detail="Level already finalized in preview; reset to repeat")
        row["state"] = "closed" if action == "close_level" else "open"
        if action == "jump":
            doc["current_level"] = _key(payload.level)
        doc["log"].append(f"{action.replace('_', ' ')} {_key(payload.level)}")
    elif action == "simulate_players":
        level_key = _key(payload.level)
        rng = secrets.SystemRandom()
        sims = [p for p in doc["players"] if p["player_id"] != "admin"][: payload.count or 5]
        doc["scores"].setdefault(level_key, []).extend(
            {"player_id": p["player_id"], "name": p["name"], "duration_ms": rng.randint(8000, 60000), "at": now_iso}
            for p in sims)
        doc["log"].append(f"Simulated {len(sims)} player scores on {level_key}")
    elif action == "finalize_level":
        level_key = _key(payload.level)
        if _preview_level(doc, level_key).get("state") == "finalized":
            raise HTTPException(status_code=409, detail="Already finalized in preview")
        _finalize_preview_level(doc, level_key)
        doc["log"].append(f"Finalized {level_key} (simulated payouts only)")
    elif action == "memory_start":
        level_key = _key(payload.level)
        row = _preview_level(doc, level_key)
        if row.get("game_id") != "memory_match":
            raise HTTPException(status_code=409, detail="This preview level is not Memory Match")
        if row.get("state") != "open":
            raise HTTPException(status_code=409, detail="Open this preview level first")
        try:
            pairs = memory_match_pair_count({"levels": doc["levels"], "champion": doc["champion"]}, level_key)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        retries = (doc.get("memory") or {}).get("retries", -1) + 1 if (doc.get("memory") or {}).get("level") == level_key else 0
        board = build_memory_match_board(pairs)
        doc["memory"] = {"level": level_key, "board": board, "card_count": len(board), "matched_positions": [],
                         "pending_position": None, "click_count": 0, "started_at": now_iso,
                         "status": "playing", "retries": retries}
    elif action == "game_start":
        level_key = _key(payload.level)
        row = _preview_level(doc, level_key)
        if row.get("game_id") not in SUPPORTED_GAMES or row.get("game_id") == "memory_match":
            raise HTTPException(status_code=409, detail="This preview level does not use a client-side game")
        if row.get("state") != "open":
            raise HTTPException(status_code=409, detail="Open this preview level first")
        prior = doc.get("play") or {}
        retries = prior.get("retries", -1) + 1 if prior.get("level") == level_key and prior.get("game_id") == row["game_id"] else 0
        doc["play"] = {"level": level_key, "game_id": row["game_id"], "started_at": now_iso,
                       "status": "playing", "retries": retries, "attempts": int(prior.get("attempts", 0)) + 1 if retries else 1}
        doc["log"].append(f"Admin started {level_key} {row['game_id']} (attempt {doc['play']['attempts']})")
    elif action == "game_complete":
        play = doc.get("play") or {}
        if play.get("status") != "playing" or play.get("level") != _key(payload.level):
            raise HTTPException(status_code=409, detail="Start a preview game first")
        row = _preview_level(doc, play["level"])
        if row.get("state") != "open":
            raise HTTPException(status_code=409, detail="This preview level is no longer open")
        duration = int((datetime.now(timezone.utc) - _utc(play["started_at"])).total_seconds() * 1000)
        play["duration_ms"] = duration
        if payload.solved:
            play["status"] = "completed"
            doc["scores"].setdefault(play["level"], []).append(
                {"player_id": "admin", "name": "You (Admin)", "duration_ms": duration, "at": now_iso})
        else:
            play["status"] = "failed"
        doc["play"] = play
        doc["log"].append(f"Admin {play['status']} {play['level']} {play['game_id']} in {duration / 1000:.2f}s")
    elif action == "memory_click":
        memory = doc.get("memory") or {}
        if memory.get("status") != "playing" or payload.position is None:
            raise HTTPException(status_code=409, detail="Start a preview Memory Match first")
        try:
            result = apply_memory_match_click(memory["board"], memory["matched_positions"],
                                              memory.get("pending_position"), payload.position)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        memory.update({"matched_positions": result["matched_positions"],
                       "pending_position": result["pending_position"], "click_count": memory["click_count"] + 1})
        reveal = {"position": payload.position, "symbol": result["symbol"], "match": result["match"]}
        if len(result["matched_positions"]) == len(memory["board"]):
            duration = int((datetime.now(timezone.utc) - _utc(memory["started_at"])).total_seconds() * 1000)
            memory.update({"status": "completed", "duration_ms": duration})
            doc["scores"].setdefault(memory["level"], []).append(
                {"player_id": "admin", "name": "You (Admin)", "duration_ms": duration, "at": now_iso})
            doc["log"].append(f"Admin completed {memory['level']} Memory Match in {duration / 1000:.2f}s")
        doc["memory"] = memory
        await db[PREVIEW].replace_one({"_id": admin["user_id"]}, doc)
        return {"preview": _preview_public(doc), "reveal": reveal, "isolated": True}
    else:
        raise HTTPException(status_code=422, detail="Unknown preview action")
    doc["log"] = doc["log"][-40:]
    await db[PREVIEW].replace_one({"_id": admin["user_id"]}, doc)
    return {"preview": _preview_public(doc), "isolated": True}
