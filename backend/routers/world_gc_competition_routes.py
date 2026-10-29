"""Separate, opt-in configuration and gameplay for future Free World GCs."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from auth import require_admin, require_verified_user
from deps import get_db
from services.world_gc_competition import (
    MAX_CONFIGURABLE_GC,
    MIN_CONFIGURABLE_GC,
    default_gc_config,
    apply_memory_match_click,
    build_memory_match_board,
    memory_match_pair_count,
    normalize_gc_config,
    normalize_level_key,
)
from services.world_championship_schedule import championship_window, ordered_contest_sequence

admin_router = APIRouter(prefix="/api/admin/world-gc", tags=["future-world-gc-admin"])
public_router = APIRouter(prefix="/api/world/gc", tags=["future-world-gc"])
router = APIRouter(prefix="/api/world/gc", tags=["future-world-gc-player"])
SEASON_ID = "season-1"


class MemoryMatchStartInput(BaseModel):
    gc_number: int = Field(..., ge=MIN_CONFIGURABLE_GC, le=MAX_CONFIGURABLE_GC)
    level: str


class MemoryMatchClickInput(BaseModel):
    position: int = Field(..., ge=0, le=31)


async def ensure_world_gc_competition_indexes():
    """Create indexes only on the new model's isolated collections."""
    db = get_db()
    await db.world_gc_competition_configs.create_index(
        [("season_id", 1), ("gc_number", 1)], unique=True, name="world_gc_config_unique",
    )
    await db.world_gc_progress.create_index(
        [("season_id", 1), ("gc_number", 1), ("user_id", 1)],
        unique=True, name="world_gc_progress_unique",
    )
    await db.world_gc_level_sessions.create_index(
        [("session_id", 1)], unique=True, name="world_gc_session_unique",
    )
    await db.world_gc_level_sessions.create_index(
        [("season_id", 1), ("gc_number", 1), ("user_id", 1), ("status", 1)],
        name="world_gc_session_user_status",
    )
    await db.world_gc_level_attempts.create_index(
        [("attempt_id", 1)], unique=True, name="world_gc_attempt_unique",
    )
    await db.world_gc_level_attempts.create_index(
        [("season_id", 1), ("gc_number", 1), ("level_key", 1), ("user_id", 1), ("created_at", -1)],
        name="world_gc_attempt_history",
    )
    await db.world_gc_level_bests.create_index(
        [("season_id", 1), ("gc_number", 1), ("level_key", 1), ("user_id", 1)],
        unique=True, name="world_gc_best_unique",
    )
    await db.world_gc_level_bests.create_index(
        [("season_id", 1), ("gc_number", 1), ("level_key", 1), ("duration_ms", 1), ("completed_at", 1)],
        name="world_gc_level_leaderboard",
    )
    await db.world_gc_level_finalizations.create_index(
        [("season_id", 1), ("gc_number", 1), ("level_key", 1)],
        unique=True, name="world_gc_finalization_unique",
    )
    await db.world_gc_level_bonus_awards.create_index(
        [("season_id", 1), ("gc_number", 1), ("level_key", 1), ("user_id", 1)],
        unique=True, name="world_gc_level_bonus_award_unique",
    )
    await db.world_gc_champion_awards.create_index(
        [("season_id", 1), ("gc_number", 1), ("user_id", 1)],
        unique=True, name="world_gc_champion_award_unique",
    )


def _validate_gc(gc_number: int) -> int:
    if not MIN_CONFIGURABLE_GC <= gc_number <= MAX_CONFIGURABLE_GC:
        raise HTTPException(
            status_code=404,
            detail=f"Future GC must be between {MIN_CONFIGURABLE_GC} and {MAX_CONFIGURABLE_GC}",
        )
    return gc_number


async def _legacy_context(db, gc_number: int) -> dict:
    legacy = await db.world_global_contests.find_one(
        {"season_id": SEASON_ID, "contest_number": gc_number},
        {"_id": 0, "contest_number": 1, "name": 1, "status": 1, "start_at": 1, "end_at": 1,
         "levels_config": 1, "champion_config": 1, "game_id": 1, "game_config": 1},
    )
    settings = await db.world_settings.find_one(
        {"_id": "active_global_contest", "season_id": SEASON_ID},
        {"_id": 0, "contest_number": 1, "season_start_at": 1, "championship_extensions": 1},
    ) or {}
    existing_schedule = None
    season_start = settings.get("season_start_at")
    if season_start:
        rows = await db.world_global_contests.find(
            {"season_id": SEASON_ID}, {"_id": 0, "contest_number": 1},
        ).sort("contest_number", 1).to_list(100)
        sequence = ordered_contest_sequence(row.get("contest_number") for row in rows)
        if gc_number in sequence:
            slot = sequence.index(gc_number) + 1
            window = championship_window(season_start, slot, settings.get("championship_extensions") or {})
            existing_schedule = {
                "timezone": "Europe/London", "gc_number": gc_number,
                "levels": [value.isoformat() for value in window["level_unlocks"]],
                "champion_opens_at": window["champion_opens_at"].isoformat(),
                "champion_closes_at": window["champion_closes_at"].isoformat(),
            }
    return {"legacy_contest": legacy, "season_schedule_settings": settings,
            "existing_schedule": existing_schedule}


async def _explicitly_active_gc(db, gc_number: int) -> dict:
    from routers.world_routes import _active_contest
    from routers.world_gc_live_routes import live_schedule, overlay_schedule

    active_contest = await _active_contest(db)
    if not active_contest or int(active_contest.get("contest_number") or 0) != int(gc_number):
        raise HTTPException(status_code=409, detail="This GC is not the active global contest")
    config = await db.world_gc_competition_configs.find_one(
        {"season_id": SEASON_ID, "gc_number": int(gc_number),
         "activation_status": "active", "engine": {"$ne": "legacy_hybrid"}},
        {"_id": 0},
    )
    if not config or config.get("model") != "every_level":
        raise HTTPException(status_code=409, detail="Every-Level mode is not explicitly active for this GC")
    return overlay_schedule(config, await live_schedule(db, int(gc_number)))


def _level_schedule(config: dict, level_key: str) -> dict:
    if level_key == "champion":
        return config.get("champion") or {}
    level = int(level_key[1:])
    return next((row for row in config.get("levels", []) if int(row.get("level", 0)) == level), {})


def _schedule_time(row: dict, field: str) -> datetime | None:
    value = row.get(field)
    if not value:
        return None
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _stored_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _level_close_time(config: dict, level_key: str) -> datetime | None:
    if level_key == "champion":
        return _schedule_time(_level_schedule(config, level_key), "closes_at")
    number = int(level_key[1:])
    next_key = f"L{number + 1}" if number < 10 else "champion"
    return _schedule_time(_level_schedule(config, next_key), "opens_at")


async def _assert_level_open(db, config: dict, user_id: str, level_key: str, now: datetime):
    schedule = _level_schedule(config, level_key)
    opens_at = _schedule_time(schedule, "opens_at")
    if opens_at is None or now < opens_at:
        raise HTTPException(status_code=409, detail="This level has not opened")
    closes_at = _level_close_time(config, level_key)
    if closes_at is not None and now >= closes_at:
        raise HTTPException(status_code=409, detail="This level is closed")
    progress = await db.world_gc_progress.find_one(
        {"season_id": SEASON_ID, "gc_number": int(config["gc_number"]), "user_id": user_id},
        {"_id": 0},
    ) or {"passed_levels": []}
    passed = {str(value) for value in progress.get("passed_levels", [])}
    if level_key == "champion":
        if not all(f"L{level}" in passed for level in range(1, 11)):
            raise HTTPException(status_code=403, detail="Complete Levels 1–10 before Champion Level")
    else:
        level = int(level_key[1:])
        if level > 1 and f"L{level - 1}" not in passed:
            raise HTTPException(status_code=403, detail=f"Pass Level {level - 1} before progressing")
    return progress


@admin_router.get("/competitions")
async def list_future_gc_configs(request: Request):
    await require_admin(request)
    db = get_db()
    stored = await db.world_gc_competition_configs.find(
        {"season_id": SEASON_ID, "gc_number": {"$gte": MIN_CONFIGURABLE_GC, "$lte": MAX_CONFIGURABLE_GC}},
        {"_id": 0},
    ).sort("gc_number", 1).to_list(MAX_CONFIGURABLE_GC - MIN_CONFIGURABLE_GC + 1)
    by_gc = {int(row["gc_number"]): row for row in stored}
    return {
        "items": [by_gc.get(gc, default_gc_config(gc)) for gc in range(MIN_CONFIGURABLE_GC, MAX_CONFIGURABLE_GC + 1)],
        "legacy_active_gc": (await db.world_settings.find_one(
            {"_id": "active_global_contest", "season_id": SEASON_ID}, {"_id": 0, "contest_number": 1},
        ) or {}).get("contest_number"),
    }


@admin_router.get("/competitions/{gc_number}")
async def get_future_gc_config(gc_number: int, request: Request):
    await require_admin(request)
    gc_number = _validate_gc(gc_number)
    db = get_db()
    config = await db.world_gc_competition_configs.find_one(
        {"season_id": SEASON_ID, "gc_number": gc_number}, {"_id": 0},
    )
    from routers.world_gc_live_routes import draft_of, level_states

    draft = draft_of(config) or {k: v for k, v in (config or default_gc_config(gc_number)).items()}
    audits = await db.world_gc_config_audit.find(
        {"gc_number": gc_number}, {"_id": 0, "previous": 0, "new": 0},
    ).sort("created_at", -1).to_list(10)
    return {"config": config or default_gc_config(gc_number), "draft": draft,
            "has_unapplied_draft": bool(draft_of(config)),
            "level_states": await level_states(db, gc_number, config), "audit": audits,
            **await _legacy_context(db, gc_number)}


@admin_router.put("/competitions/{gc_number}")
async def save_future_gc_config(gc_number: int, payload: dict, request: Request):
    admin = await require_admin(request)
    gc_number = _validate_gc(gc_number)
    db = get_db()
    key = {"season_id": SEASON_ID, "gc_number": gc_number}
    existing = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    from routers.world_gc_live_routes import strip_schedule_fields

    payload = strip_schedule_fields(payload)
    if existing and existing.get("activation_status") == "completed":
        raise HTTPException(status_code=409, detail="This GC is completed; its configuration is protected")
    now = datetime.now(timezone.utc)
    if existing and existing.get("activation_status") != "draft":
        base = existing.get("pending_draft") or {k: existing.get(k) for k in ("model", "levels", "champion")}
        try:
            normalized = normalize_gc_config(gc_number, payload, {**default_gc_config(gc_number), **base})
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        pending = {"model": normalized["model"], "levels": normalized["levels"], "champion": normalized["champion"],
                   "saved_at": now, "saved_by": admin.get("user_id")}
        await db.world_gc_competition_configs.update_one(key, {"$set": {"pending_draft": pending}})
        saved = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
        return {"config": saved, "draft": pending, "activation_required": True}
    try:
        normalized = normalize_gc_config(gc_number, payload, existing)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    normalized.update({"updated_at": now, "updated_by": admin.get("user_id")})
    if not existing:
        normalized.update({"created_at": now, "created_by": admin.get("user_id")})
    await db.world_gc_competition_configs.update_one(
        key,
        {"$set": {key_name: value for key_name, value in normalized.items()
                  if key_name not in {"season_id", "gc_number", "created_at", "created_by"}},
         "$setOnInsert": key | {"created_at": now, "created_by": admin.get("user_id")}},
        upsert=True,
    )
    saved = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    return {"config": saved, "draft": saved, "activation_required": True}


class ScheduleFutureGCInput(BaseModel):
    confirmation: str


class ActivateFutureGCInput(BaseModel):
    confirmation: str


@admin_router.post("/competitions/{gc_number}/schedule")
async def schedule_future_gc_model(gc_number: int, payload: ScheduleFutureGCInput, request: Request):
    await require_admin(request)
    raise HTTPException(status_code=410, detail="Schedules come only from the Free World scheduler. Use Apply to Future GC.")
    admin = await require_admin(request)
    _validate_gc(gc_number)
    db = get_db()
    key = {"season_id": SEASON_ID, "gc_number": gc_number}
    config = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    if not config or config.get("activation_status") != "draft":
        raise HTTPException(status_code=409, detail="Only a draft GC configuration can be scheduled")
    model = config.get("model")
    confirmation = f"SCHEDULE GC{gc_number} {model.upper()}"
    if model not in ("champion_only", "every_level") or payload.confirmation != confirmation:
        raise HTTPException(status_code=400, detail="Explicit GC/model confirmation is required")
    active_contest = await _legacy_context(db, gc_number)
    legacy = active_contest.get("legacy_contest") or {}
    if legacy.get("status") == "active":
        raise HTTPException(status_code=409, detail="An active legacy GC cannot be switched to Every-Level")

    levels = config.get("levels") or []
    if len(levels) != 10 or any(not row.get("game_id") or not row.get("opens_at") for row in levels):
        raise HTTPException(status_code=422, detail="Configure a game and opening time for every level")
    champion = config.get("champion") or {}
    if not champion.get("game_id") or not champion.get("opens_at") or not champion.get("closes_at"):
        raise HTTPException(status_code=422, detail="Configure the Champion game and its open/close times")
    allowed_games = {"memory_match"} if model == "every_level" else {"number_sequence", "colour_match"}
    if any(row.get("game_id") not in allowed_games for row in levels) or champion.get("game_id") not in allowed_games:
        expected = "Memory Match" if model == "every_level" else "Number Sequence or Colour Match"
        raise HTTPException(status_code=422, detail=f"{model} currently supports {expected}")
    if model == "champion_only":
        for label, game_id, game_config in [
            *[(f"Level {row['level']}", row.get("game_id"), row.get("game_config") or {}) for row in levels],
            ("Champion", champion.get("game_id"), champion.get("game_config") or {}),
        ]:
            if game_id == "colour_match":
                try:
                    colours = int(game_config.get("colours", 6))
                    rounds = int(game_config.get("rounds", 10))
                except (TypeError, ValueError):
                    raise HTTPException(status_code=422, detail=f"{label} Colour Match settings must be integers")
                if not 2 <= colours <= 11 or not 1 <= rounds <= 100:
                    raise HTTPException(status_code=422, detail=f"{label} Colour Match requires 2–11 colours and 1–100 rounds")
    settings = await db.world_settings.find_one(
        {"_id": "active_global_contest", "season_id": SEASON_ID}, {"_id": 0},
    ) or {}
    season_start = settings.get("season_start_at")
    if not season_start:
        raise HTTPException(status_code=409, detail="Cannot schedule a new model without the stored authoritative season schedule")
    contest_rows = await db.world_global_contests.find(
        {"season_id": SEASON_ID}, {"_id": 0, "contest_number": 1},
    ).sort("contest_number", 1).to_list(100)
    sequence = ordered_contest_sequence(row.get("contest_number") for row in contest_rows)
    if gc_number not in sequence:
        raise HTTPException(status_code=409, detail="This GC is not present in the existing schedule")
    slot = sequence.index(gc_number) + 1
    expected = championship_window(season_start, slot, settings.get("championship_extensions") or {})
    if _schedule_time(levels[0], "opens_at") != expected["level_unlocks"][0]:
        raise HTTPException(status_code=409, detail="Level 1 must match the existing GC start schedule")
    for level, row in enumerate(levels, 1):
        if _schedule_time(row, "opens_at") != expected["level_unlocks"][level - 1]:
            raise HTTPException(status_code=409, detail=f"Level {level} must match the existing GC schedule")
    if (_schedule_time(champion, "opens_at") != expected["champion_opens_at"] or
            _schedule_time(champion, "closes_at") != expected["champion_closes_at"]):
        raise HTTPException(status_code=409, detail="Champion open/close times must match the existing schedule and extension")
    if model == "every_level":
        for level in range(1, 11):
            try:
                memory_match_pair_count({"levels": levels, "champion": champion}, f"L{level}")
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        try:
            memory_match_pair_count({"levels": levels, "champion": champion}, "champion")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        normalized = normalize_gc_config(gc_number, config, config)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    now = datetime.now(timezone.utc)
    await db.world_gc_competition_configs.update_one(
        {**key, "activation_status": "draft"},
        {"$set": {"model": "every_level", "levels": normalized["levels"], "champion": normalized["champion"],
                   "activation_status": "scheduled", "scheduled_at": now, "scheduled_by": admin.get("user_id")}},
    )
    saved = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    return {"config": saved, "legacy_schedule_changed": False,
            "activation_rule": "The selected model is used only when this GC becomes active under its existing schedule."}


@admin_router.post("/competitions/{gc_number}/activate")
async def activate_future_gc_model(gc_number: int, payload: ActivateFutureGCInput, request: Request):
    await require_admin(request)
    raise HTTPException(status_code=410, detail="Use Apply to Future GC or Apply to Current GC.")
    admin = await require_admin(request)
    if admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only a Super Admin may activate a future GC model")
    _validate_gc(gc_number)
    db = get_db()
    key = {"season_id": SEASON_ID, "gc_number": gc_number}
    config = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    if not config or config.get("activation_status") != "scheduled":
        raise HTTPException(status_code=409, detail="Only a scheduled sidecar configuration can be activated")
    expected = f"ACTIVATE GC{gc_number} {str(config.get('model') or '').upper()}"
    if payload.confirmation != expected:
        raise HTTPException(status_code=400, detail="Explicit GC/model activation confirmation is required")
    legacy = await db.world_global_contests.find_one(
        {"season_id": SEASON_ID, "contest_number": gc_number}, {"_id": 0, "status": 1},
    ) or {}
    if legacy.get("status") == "active":
        raise HTTPException(status_code=409, detail="An active legacy GC cannot be switched to the new model")
    first_open = _schedule_time((config.get("levels") or [{}])[0], "opens_at")
    if first_open is None or datetime.now(timezone.utc) >= first_open:
        raise HTTPException(status_code=409, detail="A model must be activated before the GC's existing Level 1 start")
    for collection in ("world_gc_progress", "world_gc_level_sessions", "world_gc_level_attempts", "world_gc_level_bests",
                       "world_gc_level_finalizations", "world_gc_level_bonus_awards", "world_gc_champion_awards"):
        if await db[collection].count_documents({"season_id": SEASON_ID, "gc_number": gc_number}):
            raise HTTPException(status_code=409, detail="This GC already has new-model activity or finalized results")
    result = await db.world_gc_competition_configs.update_one(
        {**key, "activation_status": "scheduled"},
        {"$set": {"activation_status": "active", "activated_at": datetime.now(timezone.utc),
                   "activated_by": admin.get("user_id"), "activation_confirmation": expected}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="GC configuration changed; reload before activating")
    saved = await db.world_gc_competition_configs.find_one(key, {"_id": 0})
    return {"config": saved, "legacy_schedule_changed": False, "player_progress_changed": False}


@public_router.get("/active-model")
async def active_future_gc_model():
    """Expose the new mode only after an explicit activation transition."""
    db = get_db()
    from routers.world_routes import _active_contest

    contest = await _active_contest(db)
    if not contest:
        return {"active": False, "model": "champion_only", "gc_number": None}
    gc_number = int(contest.get("contest_number") or 0)
    config = await db.world_gc_competition_configs.find_one(
        {"season_id": SEASON_ID, "gc_number": gc_number,
         "activation_status": "active", "engine": {"$ne": "legacy_hybrid"}},
        {"_id": 0},
    )
    if not config:
        return {"active": False, "model": "champion_only", "gc_number": gc_number}
    return {"active": config.get("model") == "every_level", "model": config.get("model", "champion_only"),
            "gc_number": gc_number}


@public_router.get("/progress/{gc_number}")
async def future_gc_progress(gc_number: int, request: Request):
    user = await require_verified_user(request)
    _validate_gc(gc_number)
    db = get_db()
    config = await _explicitly_active_gc(db, gc_number)
    progress = await db.world_gc_progress.find_one(
        {"season_id": SEASON_ID, "gc_number": gc_number, "user_id": user["user_id"]},
        {"_id": 0},
    ) or {"passed_levels": []}
    now = datetime.now(timezone.utc)
    passed = {str(value) for value in progress.get("passed_levels", [])}
    champion_open_time = _schedule_time(config.get("champion") or {}, "opens_at")
    levels = []
    for level in range(1, 11):
        key = f"L{level}"
        opens_at = _schedule_time(_level_schedule(config, key), "opens_at")
        prerequisite = level == 1 or f"L{level - 1}" in passed
        levels.append({
            "level": level, "passed": key in passed,
            "opened": bool(opens_at and now >= opens_at), "opens_at": opens_at.isoformat() if opens_at else None,
            "closes_at": _level_close_time(config, key).isoformat() if _level_close_time(config, key) else None,
            "playable": bool(opens_at and now >= opens_at and prerequisite and
                              (not _level_close_time(config, key) or now < _level_close_time(config, key))),
            "action": "next_level" if key in passed and (
                level < 10 and
                (next_open := _schedule_time(_level_schedule(config, f"L{level + 1}"), "opens_at")) and now >= next_open
                or level == 10 and champion_open_time is not None and now >= champion_open_time
            ) else "retry" if key in passed else "play",
        })
    champion = config.get("champion") or {}
    champion_opens = _schedule_time(champion, "opens_at")
    levels.append({
        "level": "champion", "passed": "champion" in passed,
        "opened": bool(champion_opens and now >= champion_opens),
        "opens_at": champion_opens.isoformat() if champion_opens else None,
        "closes_at": _level_close_time(config, "champion").isoformat() if _level_close_time(config, "champion") else None,
        "playable": bool(champion_opens and now >= champion_opens and all(f"L{n}" in passed for n in range(1, 11)) and
                  (not _level_close_time(config, "champion") or now < _level_close_time(config, "champion"))),
        "action": "retry" if "champion" in passed else "play",
    })
    return {"gc_number": gc_number, "model": config["model"], "levels": levels}


@router.post("/memory-match/session/start")
async def start_future_memory_match(body: MemoryMatchStartInput, request: Request):
    user = await require_verified_user(request)
    _validate_gc(body.gc_number)
    try:
        level_key = normalize_level_key(body.level)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db = get_db()
    from routers.world_gc_live_routes import assert_world_not_paused

    await assert_world_not_paused(db)
    config = await _explicitly_active_gc(db, body.gc_number)
    now = datetime.now(timezone.utc)
    progress = await _assert_level_open(db, config, user["user_id"], level_key, now)
    champion_stage_snapshot = None
    if level_key == "champion":
        from routers.world_routes import _user_champion_stage
        champion_stage_snapshot = await _user_champion_stage(db, user["user_id"])
    level_config = _level_schedule(config, level_key)
    if level_config.get("game_id") != "memory_match":
        raise HTTPException(status_code=409, detail="This level is not configured for Memory Match")
    try:
        pair_count = memory_match_pair_count(config, level_key)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    session_id = f"WGC-{secrets.token_hex(16).upper()}"
    attempt_id = f"WGCA-{secrets.token_hex(12).upper()}"
    board = build_memory_match_board(pair_count)
    session = {
        "session_id": session_id, "attempt_id": attempt_id, "season_id": SEASON_ID,
        "gc_number": body.gc_number, "level_key": level_key, "user_id": user["user_id"],
        "champion_stage_snapshot": champion_stage_snapshot,
        "board": board, "matched_positions": [], "pending_position": None, "click_count": 0,
        "status": "created", "started_at": None,
        "created_at": now, "updated_at": now,
    }
    await db.world_gc_level_sessions.insert_one(dict(session))
    await db.world_gc_level_attempts.insert_one({
        "attempt_id": attempt_id, "session_id": session_id, "season_id": SEASON_ID,
        "gc_number": body.gc_number, "level_key": level_key, "user_id": user["user_id"],
        "status": "created", "created_at": now, "click_count": 0,
    })
    await db.world_gc_progress.update_one(
        {"season_id": SEASON_ID, "gc_number": body.gc_number, "user_id": user["user_id"]},
        {"$setOnInsert": {"season_id": SEASON_ID, "gc_number": body.gc_number,
                           "user_id": user["user_id"], "passed_levels": [], "created_at": now}},
        upsert=True,
    )
    return {"session_id": session_id, "attempt_id": attempt_id, "gc_number": body.gc_number,
            "level": level_key, "card_count": len(board), "started_at": None,
            "champion_stage": champion_stage_snapshot,
            "click_count": 0, "matched_positions": [], "cards": list(range(len(board)))}


@router.post("/memory-match/session/{session_id}/begin")
async def begin_future_memory_match(session_id: str, request: Request):
    user = await require_verified_user(request)
    db = get_db()
    session = await db.world_gc_level_sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Memory Match session not found")
    if session.get("status") == "playing":
        return {"session_id": session_id, "started_at": _stored_utc(session["started_at"]).isoformat(), "idempotent_replay": True}
    if session.get("status") != "created":
        raise HTTPException(status_code=409, detail="This Memory Match session cannot begin")
    from routers.world_gc_live_routes import assert_world_not_paused

    await assert_world_not_paused(db)
    config = await _explicitly_active_gc(db, int(session["gc_number"]))
    now = datetime.now(timezone.utc)
    await _assert_level_open(db, config, user["user_id"], session["level_key"], now)
    updated = await db.world_gc_level_sessions.update_one(
        {"session_id": session_id, "user_id": user["user_id"], "status": "created"},
        {"$set": {"status": "playing", "started_at": now, "updated_at": now}},
    )
    if updated.modified_count != 1:
        raise HTTPException(status_code=409, detail="Session state changed before gameplay began")
    await db.world_gc_level_attempts.update_one(
        {"attempt_id": session["attempt_id"], "status": "created"},
        {"$set": {"status": "playing", "started_at": now}},
    )
    return {"session_id": session_id, "started_at": now.isoformat(), "idempotent_replay": False}


@router.post("/memory-match/session/{session_id}/click")
async def click_future_memory_match_card(session_id: str, body: MemoryMatchClickInput, request: Request):
    user = await require_verified_user(request)
    db = get_db()
    session = await db.world_gc_level_sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"], "status": "playing"}, {"_id": 0},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Active Memory Match session not found")
    config = await _explicitly_active_gc(db, int(session["gc_number"]))
    now = datetime.now(timezone.utc)
    await _assert_level_open(db, config, user["user_id"], session["level_key"], now)
    try:
        result = apply_memory_match_click(session["board"], session.get("matched_positions", []),
                                          session.get("pending_position"), body.position)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    click_count = int(session.get("click_count", 0)) + 1
    complete = len(result["matched_positions"]) == len(session["board"])
    duration_ms = max(0, int((now - _stored_utc(session["started_at"])).total_seconds() * 1000)) if complete else None
    updated = await db.world_gc_level_sessions.update_one(
        {"session_id": session_id, "user_id": user["user_id"], "status": "playing",
         "click_count": int(session.get("click_count", 0))},
        {"$set": {"matched_positions": result["matched_positions"],
                  "pending_position": result["pending_position"], "click_count": click_count,
                  "updated_at": now,
                  **({"status": "completed", "completed_at": now, "duration_ms": duration_ms} if complete else {})}},
    )
    if updated.modified_count != 1:
        raise HTTPException(status_code=409, detail="Session changed; refresh its state before another click")
    await db.world_gc_level_attempts.update_one(
        {"attempt_id": session["attempt_id"], "status": "playing"},
        {"$set": {"click_count": click_count, "last_clicked_at": now}},
    )

    if complete:
        await db.world_gc_level_attempts.update_one(
            {"attempt_id": session["attempt_id"], "status": "playing"},
            {"$set": {"status": "completed", "passed": True, "completed_at": now,
                      "duration_ms": duration_ms, "click_count": click_count}},
        )
        best_key = {"season_id": SEASON_ID, "gc_number": session["gc_number"],
                    "level_key": session["level_key"], "user_id": user["user_id"]}
        best = {**best_key, "attempt_id": session["attempt_id"], "session_id": session_id,
                "user_name": user.get("name") or user.get("email") or "Player",
            "duration_ms": duration_ms, "click_count": click_count, "completed_at": now,
            "champion_stage_snapshot": session.get("champion_stage_snapshot")}
        try:
            await db.world_gc_level_bests.update_one(
                {**best_key, "$or": [{"duration_ms": {"$gt": duration_ms}}, {"duration_ms": {"$exists": False}}]},
                {"$set": best}, upsert=True,
            )
        except DuplicateKeyError:
            current = await db.world_gc_level_bests.find_one(best_key, {"_id": 0, "duration_ms": 1})
            if current and int(current.get("duration_ms", duration_ms)) > duration_ms:
                await db.world_gc_level_bests.update_one(best_key, {"$set": best})
        progress_patch = {"$addToSet": {"passed_levels": session["level_key"]},
                          "$set": {"updated_at": now}}
        if session["level_key"] == "champion":
            progress_patch["$set"]["champion_completed_at"] = now
        await db.world_gc_progress.update_one(
            {"season_id": SEASON_ID, "gc_number": int(session["gc_number"]), "user_id": user["user_id"]},
            progress_patch,
        )

    rank_data = await future_gc_leaderboard_rows(db, int(session["gc_number"]), session["level_key"], user["user_id"])
    champion_prize_tokens = None
    accumulated_bonus_tokens = None
    if session["level_key"] == "champion" and rank_data.get("rank") and rank_data["rank"] <= 5:
        from routers.world_routes import _champion_final_prize
        champion_prize_tokens = _champion_final_prize(rank_data["rank"], int(session.get("champion_stage_snapshot") or 1))
        awards = await db.world_gc_level_bonus_awards.find(
            {"season_id": SEASON_ID, "gc_number": int(session["gc_number"]), "user_id": user["user_id"]},
            {"_id": 0, "bonus_tokens": 1},
        ).to_list(10)
        accumulated_bonus_tokens = round(sum(float(item.get("bonus_tokens") or 0) for item in awards), 2)
    return {"position": body.position, "symbol": result["symbol"], "match": result["match"],
            "matched_positions": result["matched_positions"], "click_count": click_count,
            "complete": complete, "duration_ms": duration_ms,
            "personal_best_ms": rank_data.get("personal_best_ms"), "rank": rank_data.get("rank"),
            "gap_to_next_ms": rank_data.get("gap_to_next_ms"),
            "champion_prize_tokens": champion_prize_tokens,
            "accumulated_bonus_tokens": accumulated_bonus_tokens}


async def future_gc_leaderboard_rows(db, gc_number: int, level_key: str, user_id: str | None = None):
    base = {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": level_key}
    rows = await db.world_gc_level_bests.find(base, {"_id": 0}).sort(
        [("duration_ms", 1), ("completed_at", 1), ("user_id", 1)],
    ).to_list(1000)
    for rank, row in enumerate(rows, 1):
        row["rank"] = rank
    mine = await db.world_gc_level_bests.find_one({**base, "user_id": user_id}, {"_id": 0}) if user_id else None
    rank = None
    gap = None
    if mine:
        earlier = {**base, "$or": [
            {"duration_ms": {"$lt": mine["duration_ms"]}},
            {"duration_ms": mine["duration_ms"], "completed_at": {"$lt": mine["completed_at"]}},
            {"duration_ms": mine["duration_ms"], "completed_at": mine["completed_at"], "user_id": {"$lt": user_id}},
        ]}
        rank = await db.world_gc_level_bests.count_documents(earlier) + 1
        faster = await db.world_gc_level_bests.find(earlier, {"_id": 0, "duration_ms": 1}).sort(
            [("duration_ms", -1), ("completed_at", -1), ("user_id", -1)],
        ).limit(1).to_list(1)
        gap = max(0, int(mine["duration_ms"]) - int(faster[0]["duration_ms"])) if faster else None
        mine["rank"] = rank
    return {"rows": rows, "mine": mine, "rank": rank,
            "personal_best_ms": mine.get("duration_ms") if mine else None, "gap_to_next_ms": gap}


@public_router.get("/leaderboard/{gc_number}/{level}")
async def future_gc_leaderboard(gc_number: int, level: str):
    _validate_gc(gc_number)
    try:
        level_key = normalize_level_key(level)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db = get_db()
    config = await db.world_gc_competition_configs.find_one(
        {"season_id": SEASON_ID, "gc_number": gc_number,
         "activation_status": {"$in": ["active", "completed"]}, "model": "every_level"},
        {"_id": 0},
    )
    if not config:
        raise HTTPException(status_code=404, detail="No Every-Level leaderboard is available for this GC")
    result = await future_gc_leaderboard_rows(db, gc_number, level_key)
    finalization = await db.world_gc_level_finalizations.find_one(
        {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": level_key}, {"_id": 0},
    )
    schedule = _level_schedule(config, level_key)
    rewards = schedule.get("bonus_rewards", {}) if level_key != "champion" else {}
    if finalization and level_key != "champion":
        rewards = {str(row["rank"]): int(row.get("bonus_tokens", 0))
                   for row in finalization.get("winners", [])}
    champion_rewards = []
    if level_key == "champion":
        from routers.world_routes import _champion_final_prize
        for row in result["rows"]:
            awards = await db.world_gc_level_bonus_awards.find(
                {"season_id": SEASON_ID, "gc_number": gc_number, "user_id": row["user_id"]},
                {"_id": 0, "bonus_tokens": 1},
            ).to_list(10)
            champion_rewards.append({
                "rank": row["rank"], "user_id": row["user_id"],
                "champion_prize_tokens": _champion_final_prize(row["rank"], int(row.get("champion_stage_snapshot") or 1)) if row["rank"] <= 5 else 0,
                "accumulated_bonus_tokens": round(sum(float(item.get("bonus_tokens") or 0) for item in awards), 2) if row["rank"] <= 5 else 0,
            })
    return {"gc_number": gc_number, "level": level_key, "leaderboard": result["rows"],
            "rewards": rewards, "reward_status": "finalized" if finalization else "provisional",
            "champion_rewards": champion_rewards, "finalization": finalization}


@admin_router.get("/competitions/{gc_number}/report/{level}")
async def future_gc_level_report(gc_number: int, level: str, request: Request, limit: int = 100):
    await require_admin(request)
    _validate_gc(gc_number)
    try:
        level_key = normalize_level_key(level)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db = get_db()
    safe_limit = max(1, min(int(limit), 500))
    attempts = await db.world_gc_level_attempts.find(
        {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": level_key}, {"_id": 0},
    ).sort("started_at", -1).to_list(safe_limit)
    bests = await future_gc_leaderboard_rows(db, gc_number, level_key)
    finalization = await db.world_gc_level_finalizations.find_one(
        {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": level_key}, {"_id": 0},
    )
    bonus_awards = await db.world_gc_level_bonus_awards.find(
        {"season_id": SEASON_ID, "gc_number": gc_number, "level_key": level_key}, {"_id": 0},
    ).sort("rank", 1).to_list(5)
    champion_awards = await db.world_gc_champion_awards.find(
        {"season_id": SEASON_ID, "gc_number": gc_number}, {"_id": 0},
    ).sort("rank", 1).to_list(5) if level_key == "champion" else []
    config = await db.world_gc_competition_configs.find_one(
        {"season_id": SEASON_ID, "gc_number": gc_number}, {"_id": 0},
    ) or default_gc_config(gc_number)
    level_config = _level_schedule(config, level_key)
    rewards = level_config.get("bonus_rewards", {}) if level_key != "champion" and config.get("model") == "every_level" else {}
    if finalization and level_key != "champion":
        rewards = {str(row["rank"]): int(row.get("bonus_tokens", 0))
                   for row in finalization.get("winners", [])}
    return {"gc_number": gc_number, "level": level_key, "attempts": attempts,
            "leaderboard": bests["rows"], "finalization": finalization,
            "bonus_awards": bonus_awards, "champion_awards": champion_awards, "rewards": rewards}