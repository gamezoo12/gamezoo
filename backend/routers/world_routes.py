"""
Prize League Free World / Champion Contest engine.

IMPORTANT:
- Independent from paid contests, paid tickets and paid game_scores.
- Global contest number determines the game everyone plays.
- User's PERSONAL Champion stage determines that user's private
  potential prize if they become a winner.
- Public leaderboard NEVER exposes Champion stage or prize amount.
- Entering a contest snapshots the user's stage and prize.
- Admin changes later must not mutate an existing user's snapshot.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import secrets
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request

from world.season1 import SEASON_1_CHAMPIONSHIP_COUNT

from services.world_championship_schedule import (
    championship_window,
    level_unlock_at,
    ensure_utc,
)
from pydantic import BaseModel, Field

from auth import get_current_user, require_admin
from deps import get_db
from routers.wallet_routes import _apply_tx_idempotent


router = APIRouter(
    prefix="/api/world",
    tags=["free-world"],
)

public_router = APIRouter(
    prefix="/api/world/public",
    tags=["free-world-public"],
)

admin_router = APIRouter(
    prefix="/api/admin/world",
    tags=["free-world-admin"],
)


WORLD_SEASON_ID = "season-1"
WORLD_CONTEST_COUNT = SEASON_1_CHAMPIONSHIP_COUNT
WORLD_DEFAULT_CURRENCY = "GBP"

# Champion prize distribution.
#
# Final payout:
#   base rank prize ÃƒÆ’Ã¢â‚¬â€ PERSONAL Champion stage.
#
# Champion 1:
#   1st Ãƒâ€šÃ‚Â£50
#   2nd Ãƒâ€šÃ‚Â£20
#   3rd Ãƒâ€šÃ‚Â£15
#   4th Ãƒâ€šÃ‚Â£10
#   5th Ãƒâ€šÃ‚Â£5
#
# Champion 9 example:
#   4th = Ãƒâ€šÃ‚Â£10 ÃƒÆ’Ã¢â‚¬â€ 9 = Ãƒâ€šÃ‚Â£90
CHAMPION_BASE_RANK_PRIZES = {
    1: 50,
    2: 20,
    3: 15,
    4: 10,
    5: 5,
}

CHAMPION_WINNER_COUNT = 5

# Token cost to purchase one additional Champion attempt after the
# free Champion attempt(s) for the contest are used.
CHAMPION_TOKEN_RETRY_COST = 1

# Technical capability exists, but prize qualification
# based on paid contest participation is not enforced
# until explicitly enabled and connected.
CHAMPION_PAID_QUALIFICATION_FEATURE_ENABLED = False
CHAMPION_PAID_QUALIFICATION_START_STAGE = 3

WORLD_TIMEZONE = "Europe/London"


def _utcnow():
    return datetime.now(timezone.utc)


def _serialize_datetime(value):
    if isinstance(value, datetime):
        # MongoDB/Motor returns naive datetimes that represent UTC. Tag them as
        # UTC so the ISO string carries an explicit offset (+00:00); otherwise
        # the browser parses it as local time and displays it 1h off in BST.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return value


# ---------------------------------------------------------------------------
# Phase 5 · Server-authoritative Free World activity tracking.
# Stores last login / visit / gameplay timestamps on the user document.
# Fire-and-forget: never blocks the caller and never raises on failure.
# ---------------------------------------------------------------------------
WORLD_ACTIVITY_FIELDS = {
    "login": "fw_last_login_at",
    "visit": "fw_last_visit_at",
    "gameplay": "fw_last_gameplay_at",
}


async def _touch_world_activity(db, user_id: str, kind: str):
    field = WORLD_ACTIVITY_FIELDS.get(kind)
    if not user_id or not field:
        return
    try:
        now = datetime.now(timezone.utc)
        # $max keeps the timestamp monotonic: a slow/out-of-order request can
        # never overwrite a newer last-activity value with an older one.
        await db.users.update_one(
            {"user_id": user_id},
            {"$max": {field: now, "fw_last_activity_at": now}},
        )
    except Exception:
        pass


def _clean_doc(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None

    result = dict(doc)
    result.pop("_id", None)

    for key, value in list(result.items()):
        if isinstance(value, datetime):
            result[key] = value.isoformat()

    return result


def _contest_public(doc: dict) -> dict:
    """
    Public/current-contest information.

    Deliberately excludes:
    - internal admin notes
    - individual Champion stage
    - individual potential prize
    """
    return {
        "season_id": doc.get("season_id"),
        "contest_number": doc.get("contest_number"),
        "name": doc.get("name"),
        "game_id": doc.get("game_id"),
        "game_config": doc.get("game_config") or {},
        "start_at": _serialize_datetime(doc.get("start_at")),
        "end_at": _serialize_datetime(doc.get("end_at")),
        "winner_count": doc.get("winner_count"),
        "status": doc.get("status"),
    }


class WorldContestUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=120,
    )

    game_id: Optional[str] = Field(
        default=None,
        max_length=120,
    )

    game_config: Optional[dict[str, Any]] = None

    # Per-global-contest progression configuration.
    #
    # Exactly 10 normal progression levels.
    # Champion Challenge remains separate and is NOT Level 11.
    levels_config: Optional[list[dict[str, Any]]] = None

    champion_config: Optional[dict[str, Any]] = None

    winner_count: Optional[int] = Field(
        default=None,
        ge=1,
        le=10000,
    )

    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None

    admin_notes: Optional[str] = Field(
        default=None,
        max_length=4000,
    )


class ActivateWorldContestInput(BaseModel):
    # Season 1 launches only from Championship 1.
    # Championships 2-100 are controlled automatically
    # by the authoritative Season scheduler.
    contest_number: int = Field(
        default=1,
        ge=1,
        le=1,
    )

    start_at: datetime

class ChampionPrizeUpdate(BaseModel):
    amount: int = Field(
        ...,
        ge=0,
        le=10_000_000,
    )

    currency: str = Field(
        default=WORLD_DEFAULT_CURRENCY,
        min_length=3,
        max_length=3,
    )


async def ensure_world_indexes():
    """
    Safe idempotent index creation.

    This creates indexes only. It does NOT create an active contest,
    score, winner, wallet transaction or prize award.
    """
    db = get_db()

    await db.world_global_contests.create_index(
        [
            ("season_id", 1),
            ("contest_number", 1),
        ],
        unique=True,
        name="world_global_contest_unique",
    )

    await db.world_champion_prizes.create_index(
        [
            ("season_id", 1),
            ("champion_stage", 1),
        ],
        unique=True,
        name="world_champion_prize_unique",
    )

    await db.world_contest_entries.create_index(
        [
            ("season_id", 1),
            ("global_contest_number", 1),
            ("user_id", 1),
        ],
        unique=True,
        name="world_entry_unique",
    )

    await db.world_champion_scores.create_index(
        [
            ("season_id", 1),
            ("global_contest_number", 1),
            ("user_id", 1),
        ],
        unique=True,
        name="world_scores_user_unique",
    )

    await db.world_champion_scores.create_index(
        [
            ("season_id", 1),
            ("global_contest_number", 1),
            ("score", -1),
            ("duration_ms", 1),
            ("submitted_at", 1),
        ],
        name="world_global_leaderboard",
    )

    await db.world_game_sessions.create_index(
        [
            ("session_id", 1),
        ],
        unique=True,
        name="world_session_unique",
    )

    await db.world_game_sessions.create_index(
        [
            ("season_id", 1),
            ("user_id", 1),
            ("status", 1),
        ],
        name="world_session_user_status",
    )

    await db.world_level_attempts.create_index(
        [
            ("session_id", 1),
        ],
        unique=True,
        name="world_level_attempt_session_unique",
    )

    await db.world_level_attempts.create_index(
        [
            ("season_id", 1),
            ("user_id", 1),
            ("level", 1),
            ("created_at", -1),
        ],
        name="world_level_attempt_history",
    )

    # Attempt balances are personal to each Champion stage.  Drop the
    # legacy season/user/level-only unique index before installing the
    # stage-scoped index; otherwise MongoDB would reject a fresh counter
    # for the same level in the user's next Championship.
    try:
        await db.world_attempt_counters.drop_index(
            "world_attempt_counter_unique"
        )
    except Exception:
        pass

    await db.world_attempt_counters.create_index(
        [
            ("season_id", 1),
            ("user_id", 1),
            ("champion_stage", 1),
            ("level", 1),
        ],
        unique=True,
        name="world_attempt_counter_unique",
    )

    await db.world_champion_sessions.create_index(
        [
            ("session_id", 1),
        ],
        unique=True,
        name="world_champion_session_unique",
    )

    await db.world_champion_sessions.create_index(
        [
            ("season_id", 1),
            ("global_contest_number", 1),
            ("user_id", 1),
            ("created_at", -1),
        ],
        name="world_champion_session_history",
    )

    await db.world_champion_attempt_counters.create_index(
        [
            ("season_id", 1),
            ("global_contest_number", 1),
            ("user_id", 1),
        ],
        unique=True,
        name="world_champion_attempt_counter_unique",
    )

    await db.world_champion_stage_counters.create_index(
        [
            ("season_id", 1),
            ("global_contest_number", 1),
            ("user_id", 1),
            ("champion_stage", 1),
        ],
        unique=True,
        name="world_champion_stage_counter_unique",
    )

    # Token-retry entitlements are personal to each Champion stage so an
    # unused purchased retry from Championship N cannot leak into N+1.
    # Drop the legacy season/user/level-only unique index first.
    try:
        await db.world_token_retry_daily.drop_index(
            "world_token_retry_daily_unique"
        )
    except Exception:
        pass

    await db.world_token_retry_daily.create_index(
        [
            ("season_id", 1),
            ("user_id", 1),
            ("champion_stage", 1),
            ("level", 1),
        ],
        unique=True,
        name="world_token_retry_daily_unique",
    )

    # Phase 4 per-(champion_stage, level) attempt-config overrides.
    await db.world_stage_level_config.create_index(
        [
            ("season_id", 1),
            ("champion_stage", 1),
            ("level", 1),
        ],
        unique=True,
        name="world_stage_level_config_unique",
    )

    # Every paid retry gets its own reservation.
    # There is deliberately NO daily paid-retry limit.
    await db.world_token_retry_reservations.create_index(
        [
            ("reservation_id", 1),
        ],
        unique=True,
        name="world_token_retry_reservation_id_unique",
    )

    await db.world_level_unlock_reservations.create_index(
        [
            ("reservation_id", 1),
        ],
        unique=True,
        name="world_level_unlock_reservation_unique",
    )

    await db.world_prize_qualifications.create_index(
        [
            ("season_id", 1),
            ("user_id", 1),
            ("champion_stage", 1),
            ("global_contest_number", 1),
        ],
        name="world_prize_qualification_lookup",
    )

    await db.world_winner_awards.create_index(
        [
            ("season_id", 1),
            ("global_contest_number", 1),
            ("user_id", 1),
        ],
        unique=True,
        name="world_award_unique",
    )


async def _active_contest(db):
    setting = await db.world_settings.find_one(
        {
            "_id": "active_global_contest",
            "season_id": WORLD_SEASON_ID,
        }
    )

    if not setting:
        return None

    contest_number = setting.get("contest_number")

    if not contest_number:
        return None

    return await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number": int(contest_number),
            "status": "active",
        }
    )


async def _user_champion_stage(db, user_id: str) -> int:
    """
    Personal Champion progression.

    Existing early World records may not yet contain champion_stage.
    Those users start at Champion 1.

    This is intentionally independent from the GLOBAL contest number.
    """
    progress = await db.world_progress.find_one(
        {
            "user_id": user_id,
            "season_id": WORLD_SEASON_ID,
        }
    )

    if not progress:
        return 1

    stage = int(
        progress.get("champion_stage")
        or progress.get("current_champion_stage")
        or 1
    )

    return max(
        1,
        min(WORLD_CONTEST_COUNT, stage),
    )


async def _champion_prize(db, champion_stage: int):
    return await db.world_champion_prizes.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "champion_stage": champion_stage,
        }
    )


# ===========================================================================
# AUTHENTICATED USER ROUTES
# ===========================================================================


@router.get("/active-contest")
async def get_active_world_contest(request: Request):
    await get_current_user(request)

    db = get_db()
    contest = await _active_contest(db)

    if not contest:
        return {
            "active": False,
            "season_id": WORLD_SEASON_ID,
            "contest": None,
        }

    return {
        "active": True,
        "season_id": WORLD_SEASON_ID,
        "contest": _contest_public(contest),
    }


@router.get("/contest/me")
async def get_my_world_contest(request: Request):
    user = await get_current_user(request)
    db = get_db()

    contest = await _active_contest(db)

    if not contest:
        return {
            "active": False,
            "entry": None,
        }

    entry = await db.world_contest_entries.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "global_contest_number": contest["contest_number"],
            "user_id": user["user_id"],
        }
    )

    # Private endpoint:
    # this user may see THEIR OWN Champion stage/prize snapshot.
    return {
        "active": True,
        "contest": _contest_public(contest),
        "entered": bool(entry),
        "entry": _clean_doc(entry),
    }


@router.post("/contest/enter")
async def enter_world_contest(request: Request):
    user = await get_current_user(request)
    db = get_db()

    contest = await _active_contest(db)

    if not contest:
        raise HTTPException(
            status_code=409,
            detail="There is no active Champion Contest.",
        )

    now = _utcnow()

    start_at = contest.get("start_at")
    end_at = contest.get("end_at")

    if start_at and start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)

    if end_at and end_at.tzinfo is None:
        end_at = end_at.replace(tzinfo=timezone.utc)

    if start_at and now < start_at:
        raise HTTPException(
            status_code=409,
            detail="The Champion Contest has not started yet.",
        )

    if end_at and now >= end_at:
        raise HTTPException(
            status_code=409,
            detail="The Champion Contest has ended.",
        )

    existing = await db.world_contest_entries.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "global_contest_number": contest["contest_number"],
            "user_id": user["user_id"],
        }
    )

    if existing:
        return {
            "created": False,
            "contest": _contest_public(contest),
            "entry": _clean_doc(existing),
        }

    # Champion Challenge unlocks ONLY after the player completes Level 10 of
    # their current Championship (champion_ready). The active-contest window is
    # already enforced above. Mirrors the gate in _ensure_champion_entry so a
    # premature entry can never be created and later bypass the Level-10 rule.
    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    if not bool(progress.get("champion_ready", False)):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "CHAMPION_NOT_READY",
                "message": (
                    "Complete the Royal Village progression before "
                    "entering the Champion challenge."
                ),
            },
        )

    champion_stage = await _user_champion_stage(
        db,
        user["user_id"],
    )

    prize = await _champion_prize(
        db,
        champion_stage,
    )

    if not prize:
        raise HTTPException(
            status_code=409,
            detail=(
                "Your Champion prize stage is not configured. "
                "Please contact support."
            ),
        )

    entry_id = (
        "WCE-"
        + secrets.token_hex(12).upper()
    )

    entry = {
        "entry_id": entry_id,
        "season_id": WORLD_SEASON_ID,

        # GLOBAL contest determines the game everyone plays.
        "global_contest_number":
            int(contest["contest_number"]),

        "game_id": contest.get("game_id"),
        "game_config_snapshot":
            contest.get("game_config") or {},

        # PERSONAL Champion stage determines this user's
        # private potential prize if they become a winner.
        "champion_stage_snapshot":
            champion_stage,

        "prize_amount_snapshot":
            int(prize.get("amount") or 0),

        "prize_currency_snapshot":
            prize.get("currency")
            or WORLD_DEFAULT_CURRENCY,

        "user_id": user["user_id"],
        "user_name_snapshot":
            user.get("name")
            or user.get("display_name")
            or user.get("email")
            or "Player",

        "entered_at": now,

        "status": "entered",
    }

    try:
        await db.world_contest_entries.insert_one(
            dict(entry)
        )
    except Exception:
        # Idempotent race-safe fallback.
        existing = await db.world_contest_entries.find_one(
            {
                "season_id": WORLD_SEASON_ID,
                "global_contest_number":
                    contest["contest_number"],
                "user_id": user["user_id"],
            }
        )

        if not existing:
            raise

        return {
            "created": False,
            "contest": _contest_public(contest),
            "entry": _clean_doc(existing),
        }

    return {
        "created": True,
        "contest": _contest_public(contest),
        "entry": _clean_doc(entry),
    }


# ===========================================================================
# PUBLIC LEADERBOARD
# ===========================================================================


@public_router.get("/leaderboard")
async def world_public_leaderboard(
    contest_number: Optional[int] = None,
    limit: int = 100,
):
    """
    ONE shared leaderboard for the GLOBAL contest.

    Deliberately NEVER returns:
    - champion_stage_snapshot
    - prize_amount_snapshot
    - prize_currency_snapshot
    """
    db = get_db()

    if contest_number is None:
        contest = await _active_contest(db)

        if not contest:
            return {
                "contest": None,
                "leaderboard": [],
            }

        contest_number = int(
            contest["contest_number"]
        )
    else:
        if (
            contest_number < 1
            or contest_number > WORLD_CONTEST_COUNT
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid contest number.",
            )

        contest = await db.world_global_contests.find_one(
            {
                "season_id": WORLD_SEASON_ID,
                "contest_number": contest_number,
            }
        )

    safe_limit = max(
        1,
        min(int(limit), 500),
    )

    rows = await db.world_champion_scores.find(
        {
            "season_id": WORLD_SEASON_ID,
            "global_contest_number":
                contest_number,
            "eligible": True,
        },
        {
            "_id": 0,

            # PUBLIC SAFE FIELDS ONLY
            "user_id": 1,
            "user_name": 1,
            "score": 1,
            "duration_ms": 1,
            "accuracy": 1,
            "submitted_at": 1,

            # Intentionally NOT projected:
            # champion_stage_snapshot
            # prize_amount_snapshot
            # prize_currency_snapshot
        },
    ).sort(
        [
            ("score", -1),
            ("duration_ms", 1),
            ("submitted_at", 1),
        ]
    ).to_list(safe_limit)

    leaderboard = []

    for index, row in enumerate(rows, 1):
        leaderboard.append(
            {
                "rank": index,
                "user_id": row.get("user_id"),
                "user_name": row.get(
                    "user_name"
                ) or "Player",
                "score": row.get("score"),
                "duration_ms":
                    row.get("duration_ms"),
                "accuracy":
                    row.get("accuracy"),
                "submitted_at":
                    _serialize_datetime(
                        row.get("submitted_at")
                    ),
            }
        )

    return {
        "contest": (
            _contest_public(contest)
            if contest
            else None
        ),
        "leaderboard": leaderboard,
    }


# ===========================================================================
# ADMIN
# ===========================================================================


@admin_router.post("/seed")
async def seed_world_engine(request: Request):
    """
    Creates the 100 contest HOLDERS and 100 personal prize stages.

    IMPORTANT:
    - Does NOT activate a contest.
    - Does NOT create scores.
    - Does NOT create winners.
    - Does NOT credit wallets.

    Contests 1-11 are pre-configured with the same Number Sequence
    game pattern, level configuration, and Champion configuration.
    Contests 12-100 remain unconfigured until admin assigns their games.
    """
    admin = await require_admin(request)
    db = get_db()

    now = _utcnow()

    contests_created = 0
    prizes_created = 0

    for number in range(
        1,
        WORLD_CONTEST_COUNT + 1,
    ):
        contest_defaults = {
            "season_id": WORLD_SEASON_ID,
            "contest_number": number,
            "name": f"Champion Contest {number}",
            "game_id": (
                "number_sequence"
                if 1 <= number <= 11
                else None
            ),
            "game_config": (
                {"target_number": 100}
                if 1 <= number <= 11
                else {}
            ),
            "winner_count": CHAMPION_WINNER_COUNT,
            "status": "draft",
            "start_at": None,
            "end_at": None,
            "admin_notes": "",
            "created_at": now,
            "created_by":
                admin.get("user_id"),
            "updated_at": now,
        }

        result = (
            await db.world_global_contests.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,
                    "contest_number":
                        number,
                },
                {
                    "$setOnInsert":
                        contest_defaults,
                },
                upsert=True,
            )
        )

        if result.upserted_id:
            contests_created += 1

        # Backfill the new configuration fields without
        # overwriting anything an admin has already saved.
        if 1 <= number <= 11:
            # Backfill the top-level Number Sequence game for
            # existing Championships 1-11 without overwriting
            # an admin-configured non-empty game.
            await db.world_global_contests.update_one(
                {
                    "season_id": WORLD_SEASON_ID,
                    "contest_number": number,
                    "$or": [
                        {
                            "game_id": {
                                "$exists": False,
                            }
                        },
                        {
                            "game_id": None,
                        },
                        {
                            "game_id": "",
                        },
                    ],
                },
                {
                    "$set": {
                        "game_id": "number_sequence",
                    }
                },
            )

            # Existing holders may already have an empty game_config.
            # Fill only missing/empty config; preserve custom config.
            await db.world_global_contests.update_one(
                {
                    "season_id": WORLD_SEASON_ID,
                    "contest_number": number,
                    "$or": [
                        {
                            "game_config": {
                                "$exists": False,
                            }
                        },
                        {
                            "game_config": {},
                        },
                    ],
                },
                {
                    "$set": {
                        "game_config": {
                            "target_number": 100,
                        },
                    }
                },
            )

            await db.world_global_contests.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "contest_number":
                        number,

                    "$or": [
                        {
                            "levels_config": {
                                "$exists": False,
                            }
                        },
                        {
                            "levels_config": [],
                        },
                    ],
                },
                {
                    "$set": {
                        "levels_config":
                            _default_world_levels_config(),
                    }
                },
            )

            await db.world_global_contests.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "contest_number":
                        number,

                    "$or": [
                        {
                            "champion_config": {
                                "$exists": False,
                            }
                        },
                        {
                            "champion_config": {},
                        },
                    ],
                },
                {
                    "$set": {
                        "champion_config":
                            _default_world_champion_config(),
                    }
                },
            )

        else:
            await db.world_global_contests.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "contest_number":
                        number,

                    "levels_config": {
                        "$exists": False,
                    },
                },
                {
                    "$set": {
                        "levels_config": [],
                    }
                },
            )

            await db.world_global_contests.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "contest_number":
                        number,

                    "champion_config": {
                        "$exists": False,
                    },
                },
                {
                    "$set": {
                        "champion_config": {},
                    }
                },
            )

        prize_defaults = {
            "season_id": WORLD_SEASON_ID,
            "champion_stage": number,

            # Locked product rule:
            # Stage 1 = Ãƒâ€šÃ‚Â£100 ... Stage 50 = Ãƒâ€šÃ‚Â£5,000.
            "amount": number * 100,
            "currency":
                WORLD_DEFAULT_CURRENCY,

            "created_at": now,
            "created_by":
                admin.get("user_id"),
            "updated_at": now,
        }

        result = (
            await db.world_champion_prizes.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,
                    "champion_stage":
                        number,
                },
                {
                    "$setOnInsert":
                        prize_defaults,
                },
                upsert=True,
            )
        )

        if result.upserted_id:
            prizes_created += 1

    return {
        "ok": True,
        "season_id": WORLD_SEASON_ID,
        "contests_created": contests_created,
        "prizes_created": prizes_created,
        "message": (
            "World holders created. "
            "No contest was activated."
        ),
    }


@admin_router.get("/contests")
async def admin_world_contests(request: Request):
    await require_admin(request)
    db = get_db()

    contests = await db.world_global_contests.find(
        {
            "season_id": WORLD_SEASON_ID,
        },
        {
            "_id": 0,
        },
    ).sort(
        "contest_number",
        1,
    ).to_list(WORLD_CONTEST_COUNT)

    active = await _active_contest(db)

    return {
        "season_id": WORLD_SEASON_ID,
        "server_time": _serialize_datetime(
            _utcnow()
        ),
        "active_contest_number": (
            active.get("contest_number")
            if active
            else None
        ),
        "contests": [
            _clean_doc(row)
            for row in contests
        ],
    }


@admin_router.get(
    "/contests/{contest_number}"
)
async def admin_world_contest(
    contest_number: int,
    request: Request,
):
    await require_admin(request)

    if (
        contest_number < 1
        or contest_number >
            WORLD_CONTEST_COUNT
    ):
        raise HTTPException(
            status_code=404,
            detail="Champion Contest not found.",
        )

    db = get_db()

    contest = await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number": contest_number,
        },
        {
            "_id": 0,
        },
    )

    if not contest:
        raise HTTPException(
            status_code=404,
            detail=(
                "Champion Contest is not seeded yet."
            ),
        )

    return _clean_doc(contest)


@admin_router.put(
    "/contests/{contest_number}"
)
async def update_admin_world_contest(
    contest_number: int,
    body: WorldContestUpdate,
    request: Request,
):
    admin = await require_admin(request)

    if (
        contest_number < 1
        or contest_number >
            WORLD_CONTEST_COUNT
    ):
        raise HTTPException(
            status_code=404,
            detail="Champion Contest not found.",
        )

    db = get_db()

    existing = await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number": contest_number,
        }
    )

    if not existing:
        raise HTTPException(
            status_code=404,
            detail=(
                "Seed the Free World holders first."
            ),
        )

    if existing.get("status") == "active":
        raise HTTPException(
            status_code=409,
            detail=(
                "Pause the active contest before "
                "changing its core configuration."
            ),
        )

    patch = body.model_dump(
        exclude_unset=True
    )

    if "levels_config" in patch:
        patch["levels_config"] = (
            _validate_world_level_config(
                patch["levels_config"]
            )
        )

    if "champion_config" in patch:
        patch["champion_config"] = (
            _validate_world_champion_config(
                patch["champion_config"]
            )
        )

        # Keep existing Champion session code compatible.
        patch["game_id"] = (
            patch[
                "champion_config"
            ][
                "game_id"
            ]
        )

        patch["game_config"] = {
            **patch[
                "champion_config"
            ][
                "game_config"
            ],

            "time_limit_seconds":
                patch[
                    "champion_config"
                ][
                    "time_limit_seconds"
                ],
        }

    if (
        "winner_count" in patch
        and patch["winner_count"]
        != CHAMPION_WINNER_COUNT
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Free World Champion contests "
                "currently use exactly 5 winners."
            ),
        )

    if (
        "start_at" in patch
        and "end_at" in patch
        and patch["start_at"]
        and patch["end_at"]
        and patch["end_at"]
            <= patch["start_at"]
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Contest end time must be "
                "after start time."
            ),
        )

    patch["updated_at"] = _utcnow()
    patch["updated_by"] = admin.get("user_id")

    await db.world_global_contests.update_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number": contest_number,
        },
        {
            "$set": patch,
        },
    )

    updated = await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number": contest_number,
        },
        {
            "_id": 0,
        },
    )

    return _clean_doc(updated)


@admin_router.post("/activate")
async def activate_admin_world_contest(
    body: ActivateWorldContestInput,
    request: Request,
):
    admin = await require_admin(request)
    db = get_db()

    if int(1 or 1) != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "Season 1 must be launched from "
                "Championship 1."
            ),
        )

    season_start_at = body.start_at

    if season_start_at.tzinfo is None:
        season_start_at = season_start_at.replace(
            tzinfo=timezone.utc
        )

    season_start_at = season_start_at.astimezone(
        timezone.utc
    )

    first_window = championship_window(
        season_start_at,
        1,
    )

    # Season 1 schedule is defined by Europe/London calendar days.
    # Admin may choose the launch DATE, but the launch time is
    # authoritative UK local midnight.
    if (
        ensure_utc(season_start_at)
        != first_window["start_at"]
    ):
        raise HTTPException(
            status_code=422,
            detail={
                "code":
                    "WORLD_SEASON_START_MUST_BE_UK_MIDNIGHT",

                "message":
                    (
                        "Season 1 must start at 00:00 "
                        "Europe/London."
                    ),

                "authoritative_start_at":
                    first_window[
                        "start_at"
                    ].isoformat(),
            },
        )


    authoritative_end_at = first_window[
        "champion_closes_at"
    ]

    contest = await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number":
                1,
        }
    )

    if not contest:
        raise HTTPException(
            status_code=404,
            detail=(
                "Seed the Free World holders first."
            ),
        )

    levels_config = contest.get(
        "levels_config"
    )

    champion_config = contest.get(
        "champion_config"
    )

    # Activation requires a complete 10-level progression
    # configuration and a separate Champion Challenge.
    _validate_world_level_config(
        levels_config
    )

    validated_champion = (
        _validate_world_champion_config(
            champion_config
        )
    )

    if not validated_champion.get(
        "game_id"
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Assign a Champion Challenge game "
                "before activating this contest."
            ),
        )

    winner_count = contest.get(
        "winner_count"
    )

    if (
        not isinstance(winner_count, int)
        or winner_count != CHAMPION_WINNER_COUNT
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Free World Champion contests "
                "must have exactly 5 winners."
            ),
        )

    now = _utcnow()

    # --- Free World Season Launch safety guard ---
    # Reuse of this activation endpoint as the authoritative Season
    # Launch requires two protections:
    #   1. Idempotency: a duplicated submit (double-click / retry /
    #      refresh) with the SAME start/end must NOT shift the season
    #      or write a second audit row.
    #   2. No-shift once live: once a season is LIVE (now >= start_at),
    #      its start time can no longer be changed. Controlled
    #      rescheduling is only allowed while still SCHEDULED
    #      (now < start_at).
    existing_status = contest.get("status")
    existing_start = _ensure_aware_datetime(
        contest.get("start_at")
    )
    existing_end = _ensure_aware_datetime(
        contest.get("end_at")
    )
    incoming_start = _ensure_aware_datetime(
        season_start_at
    )
    incoming_end = _ensure_aware_datetime(
        authoritative_end_at
    )

    already_live = (
        existing_status == "active"
        and existing_start is not None
        and now >= existing_start
    )

    if (
        already_live
        and incoming_start != existing_start
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Season is already live. The start "
                "time of a live season cannot be "
                "changed."
            ),
        )

    is_noop_relaunch = bool(
        existing_status == "active"
        and existing_start == incoming_start
        and existing_end == incoming_end
    )

    # Only one GLOBAL Champion Contest can be active.
    await db.world_global_contests.update_many(
        {
            "season_id": WORLD_SEASON_ID,
            "status": "active",
            "contest_number": {
                "$ne": 1
            },
        },
        {
            "$set": {
                "status": "closed",
                "updated_at": now,
                "updated_by":
                    admin.get("user_id"),
            }
        },
    )

    await db.world_global_contests.update_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number":
                1,
        },
        {
            "$set": {
                "status": "active",
                "start_at": season_start_at,
                "end_at": authoritative_end_at,
                "activated_at": now,
                "updated_at": now,
                "updated_by":
                    admin.get("user_id"),
            }
        },
    )

    await db.world_settings.update_one(
        {
            "_id": "active_global_contest",
        },
        {
            "$set": {
                "season_id": WORLD_SEASON_ID,

                # Authoritative start for the complete
                # 100-Championship Season calendar.
                "season_start_at":
                    season_start_at,

                "season_schedule_version":
                    1,

                "contest_number":
                    1,

                "updated_at": now,
                "updated_by":
                    admin.get("user_id"),
            }
        },
        upsert=True,
    )

    # Audit the launch (reuse existing db.audit_log). Skip on an
    # idempotent no-op re-launch so retries do not spam the log.
    if not is_noop_relaunch:
        await db.audit_log.insert_one(
            {
                "audit_id":
                    f"aud_{secrets.token_hex(6)}",
                "kind":
                    "free_world_season_launch",
                "action":
                    "FREE_WORLD_SEASON_LAUNCH",
                "admin_email":
                    admin.get("email"),
                "admin_user_id":
                    admin.get("user_id"),
                "season_id": WORLD_SEASON_ID,
                "contest_number":
                    1,
                "start_at": season_start_at,
                "end_at": authoritative_end_at,
                "at": now,
            }
        )

    updated = await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number":
                1,
        },
        {
            "_id": 0,
        },
    )

    return {
        "ok": True,
        "server_time": _serialize_datetime(
            now
        ),
        "launched": not is_noop_relaunch,
        "contest": _clean_doc(updated),
    }


@admin_router.post("/deactivate")
async def deactivate_admin_world_contest(
    request: Request,
):
    admin = await require_admin(request)
    db = get_db()

    active = await _active_contest(db)

    if not active:
        return {
            "ok": True,
            "message": "No active contest.",
        }

    now = _utcnow()

    await db.world_global_contests.update_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number":
                active["contest_number"],
        },
        {
            "$set": {
                "status": "closed",
                "updated_at": now,
                "updated_by":
                    admin.get("user_id"),
            }
        },
    )

    await db.world_settings.delete_one(
        {
            "_id": "active_global_contest",
        }
    )

    return {
        "ok": True,
        "closed_contest_number":
            active["contest_number"],
    }


@admin_router.get("/champion-prizes")
async def admin_champion_prizes(
    request: Request,
):
    await require_admin(request)
    db = get_db()

    rows = await db.world_champion_prizes.find(
        {
            "season_id": WORLD_SEASON_ID,
        },
        {
            "_id": 0,
        },
    ).sort(
        "champion_stage",
        1,
    ).to_list(WORLD_CONTEST_COUNT)

    return {
        "season_id": WORLD_SEASON_ID,
        "prizes": [
            _clean_doc(row)
            for row in rows
        ],
    }


@admin_router.put(
    "/champion-prizes/{champion_stage}"
)
async def update_admin_champion_prize(
    champion_stage: int,
    body: ChampionPrizeUpdate,
    request: Request,
):
    admin = await require_admin(request)

    if (
        champion_stage < 1
        or champion_stage >
            WORLD_CONTEST_COUNT
    ):
        raise HTTPException(
            status_code=404,
            detail="Champion stage not found.",
        )

    db = get_db()

    result = await db.world_champion_prizes.update_one(
        {
            "season_id": WORLD_SEASON_ID,
            "champion_stage":
                champion_stage,
        },
        {
            "$set": {
                "amount": body.amount,
                "currency":
                    body.currency.upper(),
                "updated_at": _utcnow(),
                "updated_by":
                    admin.get("user_id"),
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail=(
                "Seed the Free World holders first."
            ),
        )

    row = await db.world_champion_prizes.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "champion_stage":
                champion_stage,
        },
        {
            "_id": 0,
        },
    )

    return _clean_doc(row)


@admin_router.get("/entries")
async def admin_world_entries(
    request: Request,
    contest_number: Optional[int] = None,
    limit: int = 200,
):
    """
    ADMIN ONLY:
    includes private Champion stage and prize snapshots.
    """
    await require_admin(request)
    db = get_db()

    query = {
        "season_id": WORLD_SEASON_ID,
    }

    if contest_number is not None:
        query["global_contest_number"] = (
            contest_number
        )

    rows = await db.world_contest_entries.find(
        query,
        {
            "_id": 0,
        },
    ).sort(
        "entered_at",
        -1,
    ).to_list(
        max(1, min(int(limit), 1000))
    )

    return {
        "entries": [
            _clean_doc(row)
            for row in rows
        ],
    }


@admin_router.get("/season-schedule")
async def admin_world_season_schedule(
    request: Request,
    preview_start: Optional[str] = None,
):
    """Read-only. Derive the full 100-championship schedule from the
    authoritative season start using championship_window(). Never mutates.
    If the season is scheduled, its start is used; otherwise an optional
    ?preview_start=<ISO> lets the admin preview a prospective launch date.
    All datetimes are returned as UTC ISO; the admin UI renders Europe/London.
    """
    await require_admin(request)
    db = get_db()

    now = _utcnow()

    setting = await db.world_settings.find_one(
        {"_id": "active_global_contest", "season_id": WORLD_SEASON_ID}
    )
    scheduled_start = _ensure_aware_datetime(
        (setting or {}).get("season_start_at")
    )
    extensions = (setting or {}).get("championship_extensions") or {}

    season_start = scheduled_start
    source = "scheduled" if scheduled_start else None

    if season_start is None and preview_start:
        try:
            parsed = datetime.fromisoformat(
                preview_start.replace("Z", "+00:00")
            )
            season_start = ensure_utc(parsed)
            source = "preview"
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid preview_start timestamp.",
            )

    if season_start is None:
        return {
            "season_id": WORLD_SEASON_ID,
            "scheduled": False,
            "source": None,
            "season_start_at": None,
            "server_time": _serialize_datetime(now),
            "championship_count": WORLD_CONTEST_COUNT,
            "championships": [],
        }

    championships = []
    for number in range(1, WORLD_CONTEST_COUNT + 1):
        w = championship_window(season_start, number, extensions)
        start_at = ensure_utc(w["start_at"])
        close_at = ensure_utc(w["champion_closes_at"])
        next_start = w.get("next_start_at")
        next_start = ensure_utc(next_start) if next_start else None
        level_unlocks = w.get("level_unlocks") or []

        if now < start_at:
            status = "scheduled"
        elif now >= close_at:
            status = "completed"
        else:
            status = "live"

        championships.append({
            "championship_number": number,
            "start_at": _serialize_datetime(start_at),
            "l1_start": _serialize_datetime(
                ensure_utc(level_unlocks[0]) if level_unlocks else start_at
            ),
            "l10_start": _serialize_datetime(
                ensure_utc(level_unlocks[9])
                if len(level_unlocks) >= 10 else None
            ),
            "champion_opens_at": _serialize_datetime(
                ensure_utc(w["champion_opens_at"])
            ),
            "champion_closes_at": _serialize_datetime(close_at),
            "next_start_at": _serialize_datetime(next_start),
            "extension_days": int(
                extensions.get(str(number), extensions.get(number, 0)) or 0
            ),
            "status": status,
        })

    active = await _active_contest(db)

    return {
        "season_id": WORLD_SEASON_ID,
        "scheduled": source == "scheduled",
        "source": source,
        "season_start_at": _serialize_datetime(season_start),
        "server_time": _serialize_datetime(now),
        "championship_count": WORLD_CONTEST_COUNT,
        "championship_extensions": {
            str(k): int(v) for k, v in extensions.items()
        },
        "active_championship_number": (
            active.get("contest_number") if active else None
        ),
        "championships": championships,
    }


@admin_router.post("/contest/{contest_number}/extend")
async def admin_world_extend_contest(
    contest_number: int,
    request: Request,
    days: int = 1,
):
    """Phase 3 · Extend a championship by `days` (default 1 = 24h).

    The extension cascades: every championship AFTER this one shifts later
    by the same amount automatically (schedule is derived from the stored
    extension map). The live scheduler re-activates the current contest with
    the new end time on its next tick. Audited.
    """
    admin = await require_admin(request)
    db = get_db()

    if contest_number < 1 or contest_number > WORLD_CONTEST_COUNT:
        raise HTTPException(404, "Championship not found.")
    days = int(days)
    if days < 1 or days > 30:
        raise HTTPException(422, "days must be between 1 and 30.")

    setting = await db.world_settings.find_one(
        {"_id": "active_global_contest", "season_id": WORLD_SEASON_ID}
    )
    if not setting or not setting.get("season_start_at"):
        raise HTTPException(
            409, "Season is not launched yet; nothing to extend."
        )

    extensions = dict(setting.get("championship_extensions") or {})
    key = str(contest_number)
    before = int(extensions.get(key, extensions.get(contest_number, 0)) or 0)
    after = min(60, before + days)
    extensions.pop(contest_number, None)
    extensions[key] = after

    await db.world_settings.update_one(
        {"_id": "active_global_contest", "season_id": WORLD_SEASON_ID},
        {"$set": {
            "championship_extensions": extensions,
            "updated_at": _utcnow(),
            "updated_by": admin.get("user_id"),
        }},
    )

    await db.world_progress_audit_log.insert_one({
        "season_id": WORLD_SEASON_ID,
        "scope": "contest_extension",
        "contest_number": contest_number,
        "actor_user_id": admin.get("user_id"),
        "actor_email": admin.get("email"),
        "changes": [{
            "field": f"championship_{contest_number}_extension_days",
            "before": before,
            "after": after,
        }],
        "reason": f"Extended championship {contest_number} by {days} day(s)",
        "created_at": _utcnow(),
    })

    season_start = _ensure_aware_datetime(setting.get("season_start_at"))
    new_window = championship_window(
        season_start, contest_number, extensions
    )
    return {
        "contest_number": contest_number,
        "extension_days": after,
        "new_champion_closes_at": _serialize_datetime(
            ensure_utc(new_window["champion_closes_at"])
        ),
        "championship_extensions": {
            str(k): int(v) for k, v in extensions.items()
        },
        "note": (
            "Downstream championships shifted automatically. The live "
            "scheduler applies the new end time within ~60 seconds."
        ),
    }


@admin_router.post("/contest-extensions/reset")
async def admin_world_reset_extensions(request: Request):
    """Phase 3 · Clear all manual championship extensions."""
    admin = await require_admin(request)
    db = get_db()
    setting = await db.world_settings.find_one(
        {"_id": "active_global_contest", "season_id": WORLD_SEASON_ID}
    )
    before = dict((setting or {}).get("championship_extensions") or {})
    await db.world_settings.update_one(
        {"_id": "active_global_contest", "season_id": WORLD_SEASON_ID},
        {"$set": {
            "championship_extensions": {},
            "updated_at": _utcnow(),
            "updated_by": admin.get("user_id"),
        }},
    )
    if before:
        await db.world_progress_audit_log.insert_one({
            "season_id": WORLD_SEASON_ID,
            "scope": "contest_extension",
            "actor_user_id": admin.get("user_id"),
            "actor_email": admin.get("email"),
            "changes": [{
                "field": "championship_extensions",
                "before": {str(k): int(v) for k, v in before.items()},
                "after": {},
            }],
            "reason": "Reset all championship extensions",
            "created_at": _utcnow(),
        })
    return {"championship_extensions": {}, "cleared": bool(before)}


class StageLevelConfigInput(BaseModel):
    champion_stage: int = Field(..., ge=1, le=WORLD_CONTEST_COUNT)
    level: int = Field(..., ge=1, le=10)
    initial_free_attempts: Optional[int] = Field(default=None, ge=0, le=20)


@admin_router.get("/stage-level-config")
async def admin_get_stage_level_config(request: Request):
    """Phase 4 · List all per-(champion_stage, level) attempt-limit
    overrides. Absent entries fall back to the global level config."""
    await require_admin(request)
    db = get_db()
    rows = await db.world_stage_level_config.find(
        {"season_id": WORLD_SEASON_ID}, {"_id": 0},
    ).sort([("champion_stage", 1), ("level", 1)]).to_list(2000)
    for r in rows:
        r["updated_at"] = _serialize_datetime(r.get("updated_at"))
    return {"overrides": rows, "default_free_attempts": 3}


@admin_router.put("/stage-level-config")
async def admin_set_stage_level_config(
    payload: StageLevelConfigInput,
    request: Request,
):
    """Phase 4 · Create/update/clear a per-(stage, level) free-attempt
    override. Passing initial_free_attempts=null clears the override."""
    admin = await require_admin(request)
    db = get_db()

    key = {
        "season_id": WORLD_SEASON_ID,
        "champion_stage": int(payload.champion_stage),
        "level": int(payload.level),
    }

    if payload.initial_free_attempts is None:
        await db.world_stage_level_config.delete_one(key)
        action = "cleared"
    else:
        await db.world_stage_level_config.update_one(
            key,
            {"$set": {
                **key,
                "initial_free_attempts": int(payload.initial_free_attempts),
                "updated_at": _utcnow(),
                "updated_by": admin.get("user_id"),
            }},
            upsert=True,
        )
        action = "set"

    await db.world_progress_audit_log.insert_one({
        "season_id": WORLD_SEASON_ID,
        "scope": "stage_level_config",
        "champion_stage": int(payload.champion_stage),
        "level": int(payload.level),
        "actor_user_id": admin.get("user_id"),
        "actor_email": admin.get("email"),
        "changes": [{
            "field": "initial_free_attempts",
            "after": payload.initial_free_attempts,
        }],
        "reason": (
            f"{action} free-attempt override for C"
            f"{payload.champion_stage} L{payload.level}"
        ),
        "created_at": _utcnow(),
    })

    return {
        "action": action,
        "champion_stage": int(payload.champion_stage),
        "level": int(payload.level),
        "initial_free_attempts": payload.initial_free_attempts,
    }


@admin_router.get("/users")
async def admin_world_users(
    request: Request,
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    level: Optional[int] = None,
    championship: Optional[int] = None,
    completed: Optional[bool] = None,
    champion: Optional[bool] = None,
    qualified: Optional[bool] = None,
):
    """Read-only, server-side paginated Free World user progress for admin
    monitoring. Reuses world_progress + users. Exposes only safe fields ÃŽâ€œÃƒâ€¡ÃƒÂ¶
    never passwords, tokens, or KYC. Performs NO mutation.
    """
    await require_admin(request)
    db = get_db()

    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 100))

    query: dict[str, Any] = {"season_id": WORLD_SEASON_ID}

    if level is not None:
        query["current_level"] = int(level)
    if championship is not None:
        query["champion_stage"] = int(championship)
    if champion is True:
        query["champion_ready"] = True
    if qualified is True:
        query["qualified"] = True

    # Text search resolves against users, then constrains progress by user_id.
    if search:
        term = search.strip()
        user_matches = await db.users.find(
            {
                "$or": [
                    {"email": {"$regex": term, "$options": "i"}},
                    {"name": {"$regex": term, "$options": "i"}},
                    {"public_id": {"$regex": term, "$options": "i"}},
                    {"user_id": term},
                ]
            },
            {"_id": 0, "user_id": 1},
        ).to_list(500)
        ids = [u["user_id"] for u in user_matches]
        query["user_id"] = {"$in": ids or ["__none__"]}

    total = await db.world_progress.count_documents(query)

    rows = await db.world_progress.find(
        query, {"_id": 0}
    ).sort("updated_at", -1).skip(
        (page - 1) * page_size
    ).to_list(page_size)

    user_ids = [r.get("user_id") for r in rows if r.get("user_id")]
    users_map: dict[str, dict] = {}
    if user_ids:
        for u in await db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "public_id": 1,
             "fw_last_login_at": 1, "fw_last_visit_at": 1,
             "fw_last_gameplay_at": 1, "fw_last_activity_at": 1},
        ).to_list(len(user_ids)):
            users_map[u["user_id"]] = u

    active = await _active_contest(db)
    active_number = active.get("contest_number") if active else None

    items = []
    for r in rows:
        u = users_map.get(r.get("user_id"), {})
        completed_levels = [int(x) for x in (r.get("completed_levels") or [])]
        is_completed = len(completed_levels) >= 10
        if completed is True and not is_completed:
            continue
        if completed is False and is_completed:
            continue
        items.append({
            "user_id": r.get("user_id"),
            "public_id": u.get("public_id"),
            "name": u.get("name") or u.get("display_name"),
            "email": u.get("email"),
            "current_championship": active_number,
            "champion_stage": int(r.get("champion_stage") or 1),
            "current_level": int(r.get("current_level") or 1),
            "highest_unlocked_level": int(
                r.get("highest_unlocked_level") or 1
            ),
            "completed_levels": completed_levels,
            "completed_count": len(completed_levels),
            "all_levels_completed": is_completed,
            "champion_ready": bool(r.get("champion_ready")),
            "qualified": bool(r.get("qualified")),
            "winner_status": r.get("winner_status"),
            "last_activity": _serialize_datetime(
                u.get("fw_last_activity_at") or r.get("updated_at")
            ),
            "last_login_at": _serialize_datetime(u.get("fw_last_login_at")),
            "last_visit_at": _serialize_datetime(u.get("fw_last_visit_at")),
            "last_gameplay_at": _serialize_datetime(
                u.get("fw_last_gameplay_at")
            ),
        })

    return {
        "season_id": WORLD_SEASON_ID,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "server_time": _serialize_datetime(_utcnow()),
        "items": items,
    }


# ===========================================================================
# ADMIN · USER PROGRESS MANAGER (Phase 1)
# ===========================================================================
# Manually inspect and edit a single Free World user's progression with
# strict guardrails, atomic writes and a full audit trail.
#
# Rules (NON-NEGOTIABLE):
# - Never fabricate scores, attempts or leaderboard rows.
# - Never auto-award prizes during a manual edit.
# - Keep valid historical records intact (contest entries untouched).
# - Edits are atomic and always written to `world_progress_audit_log`.
# ===========================================================================

WORLD_PROGRESS_EDITABLE_FIELDS = (
    "current_level",
    "highest_unlocked_level",
    "completed_levels",
    "champion_stage",
    "champion_ready",
)


class WorldProgressEditInput(BaseModel):
    current_level: Optional[int] = None
    highest_unlocked_level: Optional[int] = None
    completed_levels: Optional[list[int]] = None
    champion_stage: Optional[int] = None
    champion_ready: Optional[bool] = None
    reason: Optional[str] = None


async def _world_progress_audit(db, user_id: str, limit: int = 50):
    rows = await db.world_progress_audit_log.find(
        {"season_id": WORLD_SEASON_ID, "user_id": user_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)
    for r in rows:
        r["created_at"] = _serialize_datetime(r.get("created_at"))
    return rows


@admin_router.get("/user-progress/{user_id}")
async def admin_get_user_progress(user_id: str, request: Request):
    """Full progression detail for a single user + recent audit trail."""
    await require_admin(request)
    db = get_db()

    progress = await _free_world_progress(db, user_id)

    user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "user_id": 1, "name": 1, "display_name": 1,
         "email": 1, "public_id": 1, "fw_last_login_at": 1,
         "fw_last_visit_at": 1, "fw_last_gameplay_at": 1},
    ) or {}

    active = await _active_contest(db)
    completed_levels = sorted(
        int(x) for x in (progress.get("completed_levels") or [])
    )

    return {
        "user": {
            "user_id": user_id,
            "public_id": user.get("public_id"),
            "name": user.get("name") or user.get("display_name"),
            "email": user.get("email"),
            "last_login_at": _serialize_datetime(user.get("fw_last_login_at")),
            "last_visit_at": _serialize_datetime(user.get("fw_last_visit_at")),
            "last_gameplay_at": _serialize_datetime(
                user.get("fw_last_gameplay_at")
            ),
        },
        "progress": {
            "current_level": int(progress.get("current_level") or 1),
            "highest_unlocked_level": int(
                progress.get("highest_unlocked_level") or 1
            ),
            "completed_levels": completed_levels,
            "completed_count": len(completed_levels),
            "champion_stage": int(progress.get("champion_stage") or 1),
            "champion_ready": bool(progress.get("champion_ready")),
            "qualified": bool(progress.get("qualified")),
            "season_complete": bool(progress.get("season_complete")),
            "updated_at": _serialize_datetime(progress.get("updated_at")),
        },
        "current_championship": (
            active.get("contest_number") if active else None
        ),
        "limits": {
            "max_level": 10,
            "max_championship": WORLD_CONTEST_COUNT,
        },
        "audit": await _world_progress_audit(db, user_id),
        "server_time": _serialize_datetime(_utcnow()),
    }


@admin_router.post("/user-progress/{user_id}")
async def admin_edit_user_progress(
    user_id: str,
    payload: WorldProgressEditInput,
    request: Request,
):
    """Atomically edit a user's progression under strict guardrails.

    Only the fields provided in the request body are changed. Every change
    is recorded in `world_progress_audit_log`. No prizes are awarded and no
    contest entries / scores / leaderboard rows are touched.
    """
    actor = await require_admin(request)
    db = get_db()

    before = await _free_world_progress(db, user_id)

    # --- Resolve the desired end state (provided fields override current) ---
    def _cur(field, default):
        v = getattr(payload, field)
        return v if v is not None else before.get(field, default)

    new_current = int(_cur("current_level", 1))
    new_highest = int(_cur("highest_unlocked_level", 1))
    new_stage = int(_cur("champion_stage", 1))
    new_ready = bool(_cur("champion_ready", False))

    if payload.completed_levels is not None:
        new_completed = sorted(set(int(x) for x in payload.completed_levels))
    else:
        new_completed = sorted(
            set(int(x) for x in (before.get("completed_levels") or []))
        )

    # --- Guardrails ---------------------------------------------------------
    if not (1 <= new_current <= 10):
        raise HTTPException(422, "current_level must be between 1 and 10")
    if not (1 <= new_highest <= 10):
        raise HTTPException(
            422, "highest_unlocked_level must be between 1 and 10"
        )
    if not (1 <= new_stage <= WORLD_CONTEST_COUNT):
        raise HTTPException(
            422,
            f"champion_stage must be between 1 and {WORLD_CONTEST_COUNT}",
        )
    for lvl in new_completed:
        if not (1 <= lvl <= 10):
            raise HTTPException(
                422, "completed_levels may only contain values 1-10"
            )
    if new_highest < new_current:
        raise HTTPException(
            422,
            "highest_unlocked_level cannot be lower than current_level",
        )
    # champion_ready can only be true when all 10 levels are completed.
    if new_ready and set(new_completed) != set(range(1, 11)):
        raise HTTPException(
            422,
            "champion_ready can only be enabled when levels 1-10 are all "
            "marked completed",
        )

    # --- Build atomic $set + before/after diff ------------------------------
    desired = {
        "current_level": new_current,
        "highest_unlocked_level": new_highest,
        "completed_levels": new_completed,
        "champion_stage": new_stage,
        "champion_ready": new_ready,
    }

    changes = []
    set_doc: dict[str, Any] = {}
    for field, new_val in desired.items():
        old_val = before.get(field)
        if field == "completed_levels":
            old_norm = sorted(set(int(x) for x in (old_val or [])))
            if old_norm != new_val:
                changes.append(
                    {"field": field, "before": old_norm, "after": new_val}
                )
                set_doc[field] = new_val
        else:
            # normalise ints for comparison
            if field in ("current_level", "highest_unlocked_level",
                         "champion_stage"):
                old_cmp = int(old_val) if old_val is not None else None
            else:
                old_cmp = bool(old_val)
            if old_cmp != new_val:
                changes.append(
                    {"field": field, "before": old_cmp, "after": new_val}
                )
                set_doc[field] = new_val

    if not set_doc:
        return {
            "updated": False,
            "message": "No changes detected.",
            "progress": (await admin_get_user_progress(user_id, request))[
                "progress"
            ],
        }

    set_doc["updated_at"] = _utcnow()

    await db.world_progress.update_one(
        {"season_id": WORLD_SEASON_ID, "user_id": user_id},
        {"$set": set_doc},
    )

    audit_entry = {
        "season_id": WORLD_SEASON_ID,
        "user_id": user_id,
        "actor_user_id": actor.get("user_id"),
        "actor_email": actor.get("email"),
        "actor_role": actor.get("role"),
        "changes": changes,
        "reason": (payload.reason or "").strip() or None,
        "created_at": _utcnow(),
    }
    await db.world_progress_audit_log.insert_one(dict(audit_entry))

    detail = await admin_get_user_progress(user_id, request)
    return {
        "updated": True,
        "changes": changes,
        "progress": detail["progress"],
        "audit": detail["audit"],
    }



# ===========================================================================
# FREE WORLD PROGRESSION LEVELS Ã¢â‚¬â€ ROYAL VILLAGE
# ===========================================================================
#
# IMPORTANT:
# This is the FREE WORLD gameplay configuration.
#
# It is NOT related to:
# - paid contests
# - tickets
# - orders
# - paid game_scores
# - paid leaderboard
#
# Royal Village:
# 10 progression levels + Champion challenge.
# Champion challenge is NOT called Level 11.
# ===========================================================================


ROYAL_VILLAGE_LEVELS = {
    1: {
        "level": 1,
        "arena": 1,
        "location_name": "Village Gate",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 60,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    2: {
        "level": 2,
        "arena": 1,
        "location_name": "Market Square",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 55,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    3: {
        "level": 3,
        "arena": 1,
        "location_name": "Royal Farm",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 50,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    4: {
        "level": 4,
        "arena": 1,
        "location_name": "Riverside Trail",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 45,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    5: {
        "level": 5,
        "arena": 1,
        "location_name": "King's Bridge",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 40,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    6: {
        "level": 6,
        "arena": 1,
        "location_name": "Whispering Woods",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 35,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    7: {
        "level": 7,
        "arena": 1,
        "location_name": "Ancient Ruins",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 30,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    8: {
        "level": 8,
        "arena": 1,
        "location_name": "Watchtower Pass",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 25,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    9: {
        "level": 9,
        "arena": 1,
        "location_name": "Castle Crossing",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 20,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
    10: {
        "level": 10,
        "arena": 1,
        "location_name": "Royal Gate",
        "game_id": "number_sequence",
        "game_config": {"target_number": 20},
        "time_limit_seconds": 18,
        "initial_free_attempts": 3,
        "refresh_attempts": 1,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },
}

ROYAL_VILLAGE_CHAMPION = {
    "arena": 1,
    "champion_stage": 1,
    "name": "Champion Arena I",
    "game_id": "number_sequence",
    "game_config": {
        "target_number": 30,
        "timer_mode": "stopwatch",
    },
    # Champion uses fastest verified completion.
    # There is no countdown failure limit.
    "time_limit_seconds": None,
}



# ===========================================================================
# GLOBAL CONTEST CONFIG HELPERS
# ===========================================================================


def _default_world_level_config(
    level: int,
) -> dict:
    """
    Convert the original Royal Village configuration into the
    admin-controlled configuration shape.

    These values are fallback defaults only.
    """

    source = dict(
        ROYAL_VILLAGE_LEVELS[level]
    )

    result = {
        **source,

        "game_config":
            dict(
                source.get(
                    "game_config"
                ) or {}
            ),

        # Future game engines can use move_limit instead
        # of, or together with, a timer.
        "move_limit":
            source.get(
                "move_limit"
            ),

        "demo_enabled":
            True,

        "demo_skippable":
            True,

        # After the initial free-attempt batch is exhausted,
        # exactly one free attempt becomes available every 24 hours.
        "refresh_attempts":
            1,

        "refresh_hours":
            24,

        "token_retry_cost":
            1,

        # Early token unlock is available by default on the immediate-next
        # time-locked level (Levels 2-10). Admin may still disable it per level
        # via levels_config (token_unlock_enabled: false).
        "token_unlock_enabled":
            True,

        "token_unlock_cost":
            1,

        # Used later by the Championship cycle scheduler.
        # It does NOT currently auto-unlock the level.
        "unlock_after_days":
            max(0, (level - 1)),
    }

    return result


def _default_world_levels_config() -> list[dict]:
    return [
        _default_world_level_config(
            level
        )
        for level in range(1, 11)
    ]


def _default_world_champion_config() -> dict:
    return {
        "name":
            ROYAL_VILLAGE_CHAMPION[
                "name"
            ],

        "game_id":
            ROYAL_VILLAGE_CHAMPION[
                "game_id"
            ],

        "game_config":
            dict(
                ROYAL_VILLAGE_CHAMPION[
                    "game_config"
                ]
            ),

        "time_limit_seconds":
            ROYAL_VILLAGE_CHAMPION[
                "time_limit_seconds"
            ],

        "move_limit":
            None,

        "demo_enabled":
            True,

        "demo_skippable":
            True,

        "initial_attempts":
            3,
    }


def _validate_world_level_config(
    raw: Any,
) -> list[dict]:
    if not isinstance(raw, list):
        raise HTTPException(
            status_code=400,
            detail=(
                "levels_config must be a list."
            ),
        )

    if len(raw) != 10:
        raise HTTPException(
            status_code=400,
            detail=(
                "Exactly 10 normal progression "
                "levels are required."
            ),
        )

    levels = []
    seen = set()

    for item in raw:
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Every level configuration "
                    "must be an object."
                ),
            )

        try:
            level = int(
                item.get("level")
            )
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid level number.",
            )

        if (
            level < 1
            or level > 10
            or level in seen
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "levels_config must contain "
                    "levels 1 through 10 exactly once."
                ),
            )

        seen.add(level)

        game_id = str(
            item.get(
                "game_id"
            )
            or ""
        ).strip()

        if not game_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Assign a game to Level {level}."
                ),
            )

        game_config = item.get(
            "game_config"
        )

        if game_config is None:
            game_config = {}

        if not isinstance(
            game_config,
            dict,
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Level {level} game_config "
                    "must be an object."
                ),
            )

        time_limit = int(
            item.get(
                "time_limit_seconds",
                30,
            )
        )

        if (
            time_limit < 5
            or time_limit > 900
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Level {level} time limit "
                    "must be 5Ã¢â‚¬â€œ900 seconds."
                ),
            )

        move_limit = item.get(
            "move_limit"
        )

        if (
            move_limit is not None
            and str(move_limit) != ""
        ):
            move_limit = int(
                move_limit
            )

            if (
                move_limit < 1
                or move_limit > 100000
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Level {level} move limit "
                        "is invalid."
                    ),
                )
        else:
            move_limit = None

        free_attempts = int(
            item.get(
                "initial_free_attempts",
                3,
            )
        )

        if (
            free_attempts < 0
            or free_attempts > 100
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Level {level} free attempts "
                    "must be between 0 and 100."
                ),
            )

        retry_cost = int(
            item.get(
                "token_retry_cost",
                1,
            )
        )

        unlock_cost = int(
            item.get(
                "token_unlock_cost",
                1,
            )
        )

        if retry_cost < 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Level {level} retry token "
                    "cost must be at least 1."
                ),
            )

        if unlock_cost < 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Level {level} unlock token "
                    "cost must be at least 1."
                ),
            )

        unlock_after_days = int(
            item.get(
                "unlock_after_days",
                (level - 1),
            )
        )

        if (
            unlock_after_days < 0
            or unlock_after_days > 365
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Level {level} unlock offset "
                    "is invalid."
                ),
            )

        levels.append(
            {
                "level":
                    level,

                "arena":
                    int(
                        item.get(
                            "arena",
                            1,
                        )
                    ),

                "location_name":
                    str(
                        item.get(
                            "location_name"
                        )
                        or f"Level {level}"
                    )[:120],

                "game_id":
                    game_id,

                "game_config":
                    game_config,

                "time_limit_seconds":
                    time_limit,

                "move_limit":
                    move_limit,

                "initial_free_attempts":
                    free_attempts,

                # Free World V2:
                # after the initial attempts are exhausted,
                # one free attempt refreshes every 24 hours.
                "refresh_attempts":
                    1,

                "refresh_hours":
                    24,

                "demo_enabled":
                    bool(
                        item.get(
                            "demo_enabled",
                            True,
                        )
                    ),

                "demo_skippable":
                    bool(
                        item.get(
                            "demo_skippable",
                            True,
                        )
                    ),

                "token_retry_enabled":
                    bool(
                        item.get(
                            "token_retry_enabled",
                            True,
                        )
                    ),

                "token_retry_cost":
                    retry_cost,

                # Early token unlock of the immediate-next time-locked level
                # (Levels 2-10). Defaults ON; admin may disable per level.
                # Tokens still only bypass the scheduled TIME lock — never
                # progression, contest-open or previous-level rules.
                "token_unlock_enabled":
                    bool(
                        item.get(
                            "token_unlock_enabled",
                            True,
                        )
                    ),

                "token_unlock_cost":
                    unlock_cost,

                "unlock_after_days":
                    unlock_after_days,
            }
        )

    levels.sort(
        key=lambda row:
            row["level"]
    )

    return levels


def _validate_world_champion_config(
    raw: Any,
) -> dict:
    if not isinstance(
        raw,
        dict,
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "champion_config must be an object."
            ),
        )

    game_id = str(
        raw.get(
            "game_id"
        )
        or ""
    ).strip()

    if not game_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "Assign a Champion Challenge game."
            ),
        )

    game_config = raw.get(
        "game_config"
    )

    if game_config is None:
        game_config = {}

    if not isinstance(
        game_config,
        dict,
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Champion game_config must be an object."
            ),
        )

    timer_mode = str(
        game_config.get(
            "timer_mode",
            "countdown",
        )
        or "countdown"
    ).strip().lower()

    if timer_mode not in {
        "countdown",
        "stopwatch",
    }:
        raise HTTPException(
            status_code=400,
            detail=(
                "Champion timer_mode must be "
                "'countdown' or 'stopwatch'."
            ),
        )

    if timer_mode == "stopwatch":
        time_limit = None
    else:
        raw_time_limit = raw.get(
            "time_limit_seconds",
            75,
        )

        if raw_time_limit is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Countdown Champion requires "
                    "time_limit_seconds."
                ),
            )

        time_limit = int(raw_time_limit)

        if (
            time_limit < 5
            or time_limit > 1800
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Champion time limit must be "
                    "5-1800 seconds."
                ),
            )

    game_config = {
        **game_config,
        "timer_mode": timer_mode,
    }

    move_limit = raw.get(
        "move_limit"
    )

    if (
        move_limit is not None
        and str(move_limit) != ""
    ):
        move_limit = int(
            move_limit
        )
    else:
        move_limit = None

    return {
        "name":
            str(
                raw.get(
                    "name"
                )
                or "Champion Challenge"
            )[:120],

        "game_id":
            game_id,

        "game_config":
            game_config,

        "time_limit_seconds":
            time_limit,

        "move_limit":
            move_limit,

        "demo_enabled":
            bool(
                raw.get(
                    "demo_enabled",
                    True,
                )
            ),

        "demo_skippable":
            bool(
                raw.get(
                    "demo_skippable",
                    True,
                )
            ),

        "initial_attempts":
            max(
                1,
                min(
                    100,
                    int(
                        raw.get(
                            "initial_attempts",
                            3,
                        )
                    ),
                ),
            ),
    }



def _ensure_aware_datetime(
    value,
):
    if not isinstance(
        value,
        datetime,
    ):
        return None

    if value.tzinfo is None:
        return value.replace(
            tzinfo=timezone.utc
        )

    return value


async def _world_unlock_context(
    db,
    level: int,
    progress: dict,
):
    """
    Server-authoritative level availability.

    Rules:
    - Active GLOBAL contest controls the schedule.
    - Level 1 unlocks at contest start.
    - Levels 2-10 unlock using each level's unlock_after_days.
    - Completing the previous level cannot bypass the time lock.
    - Token unlock is handled separately later.
    """

    config = await _effective_level_config(
        db,
        level,
        int(progress.get("champion_stage") or 1),
    )

    active = await _active_contest(
        db
    )

    now = _utcnow()

    completed_levels = set(
        int(x)
        for x in (
            progress.get(
                "completed_levels"
            )
            or []
        )
    )

    completed = (
        level in completed_levels
    )

    token_unlocked_levels = set(
        int(x)
        for x in (
            progress.get(
                "token_unlocked_levels"
            )
            or []
        )
    )

    token_unlocked = (
        level in token_unlocked_levels
    )

    highest_unlocked = int(
        progress.get(
            "highest_unlocked_level",
            1,
        )
    )

    # Development/fallback mode:
    # when no active global contest exists,
    # preserve existing progression behaviour.
    if not active:
        sequence_available = (
            level <= highest_unlocked
        )

        return {
            "available":
                bool(
                    completed
                    or sequence_available
                ),

            "completed":
                completed,

            "locked":
                not bool(
                    completed
                    or sequence_available
                ),

            "lock_reason":
                (
                    None
                    if (
                        completed
                        or sequence_available
                    )
                    else "progression"
                ),

            "unlock_at":
                None,

            "seconds_until_unlock":
                0,

            "contest_number":
                None,

            "contest_status":
                None,

            "contest_start_at":
                None,

            "contest_end_at":
                None,

            "unlock_after_days":
                int(
                    config.get(
                        "unlock_after_days",
                        0,
                    )
                ),

            "sequence_available":
                sequence_available,

            "time_available":
                True,
        }

    start_at = _ensure_aware_datetime(
        active.get(
            "start_at"
        )
    )

    end_at = _ensure_aware_datetime(
        active.get(
            "end_at"
        )
    )

    if start_at is None:
        return {
            "available":
                False,

            "completed":
                completed,

            "locked":
                True,

            "lock_reason":
                "contest_not_started",

            "unlock_at":
                None,

            "seconds_until_unlock":
                None,

            "contest_number":
                active.get(
                    "contest_number"
                ),

            "contest_status":
                active.get(
                    "status"
                ),

            "contest_start_at":
                None,

            "contest_end_at":
                _serialize_datetime(
                    end_at
                ),

            "unlock_after_days":
                int(
                    config.get(
                        "unlock_after_days",
                        0,
                    )
                ),

            "sequence_available":
                level <= highest_unlocked,

            "time_available":
                False,
        }

    unlock_after_days = max(
        0,
        int(
            config.get(
                "unlock_after_days",
                0,
            )
        ),
    )

    unlock_at = level_unlock_at(
        start_at,
        unlock_after_days,
    )

    scheduled_time_available = (
        now >= unlock_at
    )

    # A purchased unlock bypasses only this level's scheduled
    # time gate. Contest-open and progression requirements remain.
    time_available = bool(
        True
        if 1 <= level <= 10
        else (
            scheduled_time_available
            or token_unlocked
        )
    )

    contest_started = (
        now >= start_at
    )

    contest_open = (
        contest_started
        and (
            end_at is None
            or now < end_at
        )
    )

    sequence_available = (
        True
        if 1 <= level <= 10
        else level <= highest_unlocked
    )

    available = bool(
        completed
        or (
            contest_open
            and time_available
            and sequence_available
        )
    )

    if completed:
        lock_reason = None
    elif not contest_started:
        lock_reason = (
            "contest_not_started"
        )
    elif (
        end_at is not None
        and now >= end_at
    ):
        lock_reason = (
            "contest_closed"
        )
    elif not time_available:
        lock_reason = (
            "time"
        )
    elif not sequence_available:
        lock_reason = (
            "progression"
        )
    else:
        lock_reason = None

    seconds_until_unlock = max(
        0,
        int(
            (
                unlock_at - now
            ).total_seconds()
        ),
    )

    return {
        "available":
            available,

        "completed":
            completed,

        "locked":
            not available,

        "lock_reason":
            lock_reason,

        "unlock_at":
            _serialize_datetime(
                unlock_at
            ),

        "seconds_until_unlock":
            (
                seconds_until_unlock
                if not time_available
                else 0
            ),

        "contest_number":
            active.get(
                "contest_number"
            ),

        "contest_status":
            active.get(
                "status"
            ),

        "contest_start_at":
            _serialize_datetime(
                start_at
            ),

        "contest_end_at":
            _serialize_datetime(
                end_at
            ),

        "unlock_after_days":
            unlock_after_days,

        "sequence_available":
            sequence_available,

        "time_available":
            time_available,

        "scheduled_time_available":
            scheduled_time_available,

        "token_unlocked":
            token_unlocked,
    }


def _next_unpassed_level(progress: dict) -> int:
    """Smallest normal level (1-10) the user has neither completed nor skipped."""
    passed = set(
        int(x) for x in (progress.get("completed_levels") or [])
    ) | set(
        int(x) for x in (progress.get("skipped_levels") or [])
    )
    for lvl in range(1, 11):
        if lvl not in passed:
            return lvl
    return 0


def _personal_unlock_context(level: int, progress: dict, active_number: int | None = None, active_start_at=None):
    """
    Personal progression with GLOBAL level-unlock timing.

    The CURRENT GLOBAL Championship start is the shared time clock for every
    Championship that is already globally available. Personal progression
    still controls sequence, but signup time / personal_stage_started_at never
    creates a separate level-unlock clock.

    Example while Global C2 is active:
      - C1 and C2 share the same L1-L10 global unlock clock.
      - If global L3 is open, L1-L3 are time-unlocked in both C1 and C2.
      - A new user in personal C1 must still progress L1 -> L2 -> L3.
      - L4 remains time-locked until the shared global L4 unlock time.
    """
    now = _utcnow()
    stage = int(progress.get("champion_stage") or 1)
    started = int(progress.get("free_world_started_global_contest") or 1)

    completed_levels = set(
        int(x) for x in (progress.get("completed_levels") or [])
    )
    completed = level in completed_levels

    token_unlocked_levels = set(
        int(x) for x in (progress.get("token_unlocked_levels") or [])
    )
    token_unlocked = level in token_unlocked_levels

    highest_unlocked = int(progress.get("highest_unlocked_level", 1) or 1)
    sequence_available = level <= highest_unlocked

    behind = active_number is not None and stage < active_number
    catchup = behind and (started <= stage)

    # ONLY CHANGE: level time unlocks use the current GLOBAL Championship
    # start for everyone. Never use personal_stage_started_at as the clock.
    anchor = _ensure_aware_datetime(active_start_at) or now

    unlock_at = level_unlock_at(anchor, max(0, level - 1))
    scheduled_time_available = now >= unlock_at
    time_available = bool(scheduled_time_available or token_unlocked)

    # OLD/BEHIND users are in catch-up mode. Their old personal Championship
    # levels L1-L10 must not be blocked by the CURRENT live Championship's
    # level-number timer. Progression is still strictly sequential, and each
    # next level may be PLAYED or SKIPPED.
    if catchup and 1 <= level <= 10:
        time_available = True
        scheduled_time_available = True
        unlock_at = None

    seconds_until_unlock = (
        0
        if time_available
        else max(0, int((unlock_at - now).total_seconds()))
    )

    # Level 1 of any already-available personal Championship is always open.
    if level == 1:
        time_available = True
        scheduled_time_available = True
        unlock_at = None
        seconds_until_unlock = 0

    available = bool(completed or (time_available and sequence_available))

    if completed:
        lock_reason = None
    elif not time_available:
        lock_reason = "time"
    elif not sequence_available:
        lock_reason = "progression"
    else:
        lock_reason = None

    next_unpassed = _next_unpassed_level(progress)
    skippable = bool(
        catchup
        and time_available
        and not completed
        and level == next_unpassed
        and 1 <= level <= 10
    )

    return {
        "available": available,
        "completed": completed,
        "locked": not available,
        "lock_reason": lock_reason,
        "unlock_at": _serialize_datetime(unlock_at) if unlock_at else None,
        "seconds_until_unlock": seconds_until_unlock,
        "contest_number": stage,
        "contest_status": "personal",
        "contest_start_at": _serialize_datetime(anchor),
        "contest_end_at": None,
        "unlock_after_days": max(0, level - 1),
        "sequence_available": sequence_available,
        "time_available": time_available,
        "scheduled_time_available": scheduled_time_available,
        "token_unlocked": token_unlocked,
        "personal_mode": "catchup" if catchup else "daily",
        "skippable": skippable,
    }


def _personal_champion_transition_schedule(
    progress: dict,
    active_contest: dict | None = None,
) -> dict:
    """
    Map-only/personal progression timing for the Champion transition.

    The global Champion contest/leaderboard schedule is intentionally NOT
    changed here.  This schedule controls only the user's personal map:

      Level 10 unlock -> +24h Champion opens
      Champion opens  -> +46h Champion window closes
      Champion opens  -> +48h next personal Championship Level 1 opens

    It is generic for personal Championships 1..100.
    """
    now = _utcnow()

    # Champion 1-100 all share their Global Contest's start/end window. When a
    # Global Contest is active, every personal Championship (live OR behind)
    # anchors its Champion timer to that same shared contest start, so Champion
    # 1 and Champion 2 display identical timestamps within the same Global
    # Contest cycle. Only when no contest is active do we fall back to the
    # personal stage start. This preserves the cyclic behaviour for all future
    # Global Contests.
    if active_contest is not None:
        anchor = _ensure_aware_datetime(active_contest.get("start_at")) or now
    else:
        anchor = _ensure_aware_datetime(
            progress.get("personal_stage_started_at")
        ) or now

    level_10_unlock_at = level_unlock_at(anchor, 9)
    champion_opens_at = level_10_unlock_at + timedelta(hours=24)

    # Champion close is authoritative from the active Global Contest's end_at
    # (the scheduler keeps this in sync with any admin 24h extensions). Only
    # when no contest is active do we fall back to the fixed +46h window. The
    # results gap to the next personal Championship is a fixed +2h after close,
    # so with no extension this reproduces the original +46h / +48h timings.
    contest_end_at = (
        _ensure_aware_datetime(active_contest.get("end_at"))
        if active_contest is not None else None
    )
    if contest_end_at is not None:
        champion_closes_at = contest_end_at
        next_start_at = contest_end_at + timedelta(hours=2)
    else:
        champion_closes_at = champion_opens_at + timedelta(hours=46)
        next_start_at = champion_opens_at + timedelta(hours=48)

    return {
        "level_10_unlock_at": _serialize_datetime(level_10_unlock_at),
        "champion_opens_at": _serialize_datetime(champion_opens_at),
        "champion_closes_at": _serialize_datetime(champion_closes_at),
        "next_start_at": _serialize_datetime(next_start_at),
    }


async def _resolve_unlock_context(db, level: int, progress: dict):
    """
    Route to the correct availability model.

    - When an active Championship exists, ALL users use the CURRENT GLOBAL
      Championship start as the shared level-unlock clock. Personal progression
      still controls sequence. Level 1 is always open; Levels 2-10 unlock one
      per global day at the existing 00:00 Europe/London boundary. Behind users
      retain catch-up Play/Skip sequentially through all remaining normal
      levels of Championships behind the live Championship. Once they catch up
      to the live Championship, Skip disappears and the global timer applies.
      This never changes the global scheduler, Championship windows,
      leaderboard, settlement or prizes.
    - Fallback (no active contest) -> existing _world_unlock_context.
    """
    active = await _active_contest(db)
    active_number = (
        int(active.get("contest_number"))
        if active and active.get("contest_number")
        else None
    )

    if active_number is None:
        return await _world_unlock_context(db, level, progress)

    return _personal_unlock_context(
        level,
        progress,
        active_number,
        active.get("start_at"),
    )



async def _assert_world_level_available(
    db,
    level: int,
    progress: dict,
):
    state = await _resolve_unlock_context(
        db,
        level,
        progress,
    )

    if state["available"]:
        return state

    code_map = {
        "time":
            "LEVEL_TIME_LOCKED",

        "progression":
            "LEVEL_PROGRESSION_LOCKED",

        "contest_not_started":
            "WORLD_CONTEST_NOT_STARTED",

        "contest_closed":
            "WORLD_CONTEST_CLOSED",
    }

    message_map = {
        "time":
            "This level has not unlocked yet.",

        "progression":
            (
                "Complete the required previous "
                "progression before playing this level."
            ),

        "contest_not_started":
            (
                "The current Free World contest "
                "has not started yet."
            ),

        "contest_closed":
            (
                "The current Free World contest "
                "has already closed."
            ),
    }

    reason = state.get(
        "lock_reason"
    )

    raise HTTPException(
        status_code=403,
        detail={
            "code":
                code_map.get(
                    reason,
                    "LEVEL_LOCKED",
                ),

            "message":
                message_map.get(
                    reason,
                    "This level is locked.",
                ),

            "unlock":
                state,
        },
    )


async def _effective_level_config(
    db,
    level: int,
    champion_stage: Optional[int] = None,
) -> dict:
    """
    Active GLOBAL contest determines the game/config every user
    receives.

    If there is no active global contest, retain the original
    Royal Village defaults so development/local World still works.

    Phase 4: when `champion_stage` is supplied, an admin per-(stage, level)
    override in `world_stage_level_config` can further override the
    `initial_free_attempts` for that specific Championship + Level only.
    """

    default = _default_world_level_config(
        level
    )

    # Phase 4: resolve any per-(champion_stage, level) admin override ONCE,
    # then apply it on every return path (including the default paths).
    _stage_ifa = None
    if champion_stage is not None:
        try:
            _so = await db.world_stage_level_config.find_one(
                {
                    "season_id": WORLD_SEASON_ID,
                    "champion_stage": int(champion_stage),
                    "level": int(level),
                },
                {"_id": 0, "initial_free_attempts": 1},
            )
            if _so and _so.get("initial_free_attempts") is not None:
                _stage_ifa = max(0, int(_so["initial_free_attempts"]))
        except Exception:
            _stage_ifa = None

    def _apply_stage_override(cfg: dict) -> dict:
        if _stage_ifa is not None:
            cfg = {
                **cfg,
                "initial_free_attempts": _stage_ifa,
                "stage_level_override": True,
            }
        return cfg

    active = await _active_contest(
        db
    )

    if not active:
        return _apply_stage_override(default)

    rows = active.get(
        "levels_config"
    )

    if not isinstance(
        rows,
        list,
    ):
        return _apply_stage_override(default)

    override = next(
        (
            item
            for item in rows
            if int(
                item.get(
                    "level",
                    -1,
                )
            ) == level
        ),
        None,
    )

    if not override:
        return _apply_stage_override(default)

    merged = {
        **default,
        **override,
    }

    merged["game_config"] = {
        **default.get(
            "game_config",
            {}
        ),
        **(
            override.get(
                "game_config"
            )
            or {}
        ),
    }

    # Free World V2 locked normal-level game rules.
    #
    # Existing contest/admin configuration may still control the
    # non-game metadata for a level, but old Season 1 game settings
    # must never restore the previous variable number sequences.
    #
    # Levels 1-10 always use the same 1-20 Number Sequence game.
    # Difficulty increases only through the time limit.
    locked_times = {
        1: 60,
        2: 55,
        3: 50,
        4: 45,
        5: 40,
        6: 35,
        7: 30,
        8: 25,
        9: 20,
        10: 18,
    }

    merged["game_id"] = "number_sequence"

    merged["game_config"] = {
        **merged.get(
            "game_config",
            {}
        ),
        "target_number": 20,
    }

    merged["time_limit_seconds"] = (
        locked_times[level]
    )

    # Normal Free World levels 1-10 default to 3 initial free attempts, but
    # Admin may override per level via levels_config. Default stays 3.
    _ifa = override.get(
        "initial_free_attempts",
        merged.get("initial_free_attempts", 3),
    )
    try:
        merged["initial_free_attempts"] = max(0, int(_ifa))
    except (TypeError, ValueError):
        merged["initial_free_attempts"] = 3

    return _apply_stage_override(merged)


class FreeWorldSessionStartInput(BaseModel):
    level: int = Field(
        ...,
        ge=1,
        le=10,
    )


class FreeWorldSessionBeginInput(BaseModel):
    session_id: str = Field(
        ...,
        min_length=10,
        max_length=120,
    )


class FreeWorldSessionSubmitInput(BaseModel):
    session_id: str = Field(
        ...,
        min_length=10,
        max_length=120,
    )

    duration_ms: int = Field(
        ...,
        ge=100,
        le=300000,
    )

    solved: bool = True

    taps: list[int] = Field(
        default_factory=list,
        max_length=100,
    )


def _secure_shuffle_numbers(target: int):
    values = list(
        range(1, target + 1)
    )

    # Fisher-Yates using secrets.randbelow.
    for index in range(
        len(values) - 1,
        0,
        -1,
    ):
        swap_index = secrets.randbelow(
            index + 1
        )

        values[index], values[swap_index] = (
            values[swap_index],
            values[index],
        )

    return values


async def _free_world_progress(
    db,
    user_id: str,
):
    progress = await db.world_progress.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
        },
        {
            "_id": 0,
        },
    )

    if progress:
        # Migration-safe defaults for existing World users.
        patch = {}

        if "current_level" not in progress:
            patch["current_level"] = 1

        if "highest_unlocked_level" not in progress:
            patch["highest_unlocked_level"] = 1

        if "completed_levels" not in progress:
            patch["completed_levels"] = []

        if "champion_stage" not in progress:
            patch["champion_stage"] = 1

        if "champion_ready" not in progress:
            patch["champion_ready"] = False

        if "season_complete" not in progress:
            patch["season_complete"] = False

        if "token_unlocked_levels" not in progress:
            patch["token_unlocked_levels"] = []

        # New personal-progression state (additive, migration-safe).
        # Existing users predate Championship 2 -> started at global contest 1.
        if "free_world_started_global_contest" not in progress:
            patch["free_world_started_global_contest"] = 1

        if "skipped_levels" not in progress:
            patch["skipped_levels"] = []

        if "personal_stage_started_at" not in progress:
            patch["personal_stage_started_at"] = (
                progress.get("created_at") or _utcnow()
            )

        if patch:
            patch["updated_at"] = _utcnow()

            await db.world_progress.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,
                    "user_id":
                        user_id,
                },
                {
                    "$set": patch,
                },
            )

            progress.update(patch)

        return progress

    now = _utcnow()

    # New users join at whatever Championship is globally active NOW. This is
    # the old/new boundary: users created at/after Championship 2 start get the
    # current global contest number here; existing users are backfilled to 1
    # above. Personal Champion stage still starts at 1 regardless.
    active = await _active_contest(db)
    started_global = (
        int(active.get("contest_number"))
        if active and active.get("contest_number")
        else 1
    )

    progress = {
        "season_id": WORLD_SEASON_ID,
        "user_id": user_id,

        "current_level": 1,
        "highest_unlocked_level": 1,
        "completed_levels": [],

        "champion_stage": 1,
        "champion_ready": False,
        "season_complete": False,

        # Personal-progression state.
        "free_world_started_global_contest": started_global,
        "skipped_levels": [],
        "personal_stage_started_at": now,

        # Token unlock bypasses only the scheduled TIME gate.
        # It never marks a level completed.
        "token_unlocked_levels": [],

        "created_at": now,
        "updated_at": now,
    }

    await db.world_progress.update_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
        },
        {
            "$setOnInsert": progress,
        },
        upsert=True,
    )

    return await db.world_progress.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
        },
        {
            "_id": 0,
        },
    )


async def _free_attempt_counter(
    db,
    user_id: str,
    level: int,
):
    champion_stage = await _user_champion_stage(db, user_id)
    config = await _effective_level_config(db, level, champion_stage)

    counter = await db.world_attempt_counters.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "champion_stage": champion_stage,
            "level": level,
        },
        {
            "_id": 0,
        },
    )

    if counter:
        return counter

    now = _utcnow()

    counter = {
        "season_id": WORLD_SEASON_ID,
        "user_id": user_id,
        "champion_stage": champion_stage,
        "level": level,

        "initial_remaining":
            int(
                config[
                    "initial_free_attempts"
                ]
            ),

        "free_attempt_policy":
            int(
                config[
                    "initial_free_attempts"
                ]
            ),

        "next_free_at": None,

        "created_at": now,
        "updated_at": now,
    }

    await db.world_attempt_counters.update_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "champion_stage": champion_stage,
            "level": level,
        },
        {
            "$setOnInsert": counter,
        },
        upsert=True,
    )

    return await db.world_attempt_counters.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "champion_stage": champion_stage,
            "level": level,
        },
        {
            "_id": 0,
        },
    )


async def _normalise_free_attempt_refresh(
    db,
    user_id: str,
    level: int,
    counter: dict,
):
    """
    Ensure an exhausted attempt counter has a refresh_next_at.

    Existing users created before Phase 3D are safely migrated
    when they next access this level.

    The first refreshed attempt becomes available exactly
    24 hours after the last initial free attempt was consumed.
    """

    champion_stage = int(
        counter.get("champion_stage")
        or await _user_champion_stage(db, user_id)
    )

    if int(
        counter.get(
            "initial_remaining",
            0,
        )
    ) > 0:
        return counter

    refresh_next_at = counter.get(
        "refresh_next_at"
    )

    if isinstance(
        refresh_next_at,
        datetime,
    ):
        if refresh_next_at.tzinfo is None:
            refresh_next_at = (
                refresh_next_at.replace(
                    tzinfo=timezone.utc
                )
            )

        counter[
            "refresh_next_at"
        ] = refresh_next_at

        return counter

    anchor = counter.get(
        "initial_exhausted_at"
    )

    if not isinstance(
        anchor,
        datetime,
    ):
        anchor = counter.get(
            "last_attempt_at"
        )

    if not isinstance(
        anchor,
        datetime,
    ):
        anchor = _utcnow()

    if anchor.tzinfo is None:
        anchor = anchor.replace(
            tzinfo=timezone.utc
        )

    refresh_next_at = (
        anchor
        + timedelta(
            hours=24
        )
    )

    await db.world_attempt_counters.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user_id,
                "champion_stage": champion_stage,

            "level":
                level,

            "refresh_next_at": {
                "$exists":
                    False,
            },
        },
        {
            "$set": {
                "refresh_next_at":
                    refresh_next_at,

                "initial_exhausted_at":
                    anchor,

                "updated_at":
                    _utcnow(),
            }
        },
    )

    counter[
        "refresh_next_at"
    ] = refresh_next_at

    counter[
        "initial_exhausted_at"
    ] = anchor

    return counter


async def _free_attempt_status(
    db,
    user_id: str,
    level: int,
):
    """
    Free World attempt policy.

    Levels 1-5:
      initial batch defaults to 3 attempts.

    Levels 6-10:
      initial batch defaults to 1 attempt.

    After the initial batch reaches zero:
      exactly ONE refreshed free attempt becomes available
      after 24 hours.

    After that refreshed attempt is consumed:
      another single free attempt becomes available
      24 hours later.

    Refreshed attempts do not accumulate.
    """

    champion_stage = await _user_champion_stage(db, user_id)
    config = await _effective_level_config(
        db,
        level,
        champion_stage,
    )

    # --------------------------------------------------------
    # READ-ONLY ATTEMPT STATUS
    # --------------------------------------------------------
    #
    # Merely viewing World state / attempt status must not
    # create persistent gameplay state.
    #
    # The real counter is still created by the gameplay
    # consumption path before an attempt is consumed.
    #
    counter = await db.world_attempt_counters.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user_id,
                "champion_stage": champion_stage,

            "level":
                level,
        },
        {
            "_id":
                0,
        },
    )

    if not counter:
        counter = {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user_id,

            "champion_stage":
                champion_stage,

            "level":
                level,

            "initial_remaining":
                int(
                    config.get(
                        "initial_free_attempts",
                        3,
                    )
                ),

            "free_attempt_policy":
                int(
                    config.get(
                        "initial_free_attempts",
                        3,
                    )
                ),

            "next_free_at":
                None,
        }

    elif (
        6 <= level <= 10
        and int(
            config.get(
                "initial_free_attempts",
                3,
            )
        ) == 3
        and counter.get(
            "free_attempt_policy"
        ) != 3
        and int(
            counter.get(
                "initial_remaining",
                0,
            )
        ) <= 1
    ):
        migrated_remaining = min(
            3,
            max(
                0,
                int(
                    counter.get(
                        "initial_remaining",
                        0,
                    )
                ),
            ) + 2,
        )

        result = await db.world_attempt_counters.find_one_and_update(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user_id,
                    "champion_stage": champion_stage,

                "level":
                    level,

                "free_attempt_policy": {
                    "$ne": 3,
                },

                "initial_remaining": {
                    "$lte": 1,
                },
            },
            {
                "$set": {
                    "initial_remaining":
                        migrated_remaining,

                    "free_attempt_policy":
                        3,

                    "updated_at":
                        _utcnow(),
                },

                "$unset": {
                    "initial_exhausted_at":
                        "",

                    "refresh_next_at":
                        "",
                },
            },
            return_document=True,
        )

        if result:
            counter = result

    initial_remaining = max(
        0,
        int(
            counter.get(
                "initial_remaining",
                config.get(
                    "initial_free_attempts",
                    3,
                ),
            )
        ),
    )

    now = _utcnow()

    refresh_available = False
    refresh_next_at = None
    seconds_until_refresh = None

    if initial_remaining <= 0:
        counter = (
            await _normalise_free_attempt_refresh(
                db,
                user_id,
                level,
                counter,
            )
        )

        refresh_next_at = (
            counter.get(
                "refresh_next_at"
            )
        )

        if isinstance(
            refresh_next_at,
            datetime,
        ):
            if refresh_next_at.tzinfo is None:
                refresh_next_at = (
                    refresh_next_at.replace(
                        tzinfo=timezone.utc
                    )
                )

            refresh_available = (
                now >= refresh_next_at
            )

            seconds_until_refresh = (
                0
                if refresh_available
                else max(
                    0,
                    int(
                        (
                            refresh_next_at
                            - now
                        ).total_seconds()
                    ),
                )
            )

    free_attempts_available = (
        initial_remaining
        if initial_remaining > 0
        else (
            1
            if refresh_available
            else 0
        )
    )

    token_retry = (
        await db.world_token_retry_daily.find_one(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user_id,

                "champion_stage":
                    champion_stage,

                "level":
                    level,
            },
            {
                "_id": 0,
            },
        )
    )

    today_key = (
        now.astimezone(
            ZoneInfo(
                WORLD_TIMEZONE
            )
        ).strftime(
            "%Y-%m-%d"
        )
    )

    token_retry_used_today = bool(
        token_retry
        and token_retry.get(
            "day_key"
        ) == today_key
        and token_retry.get(
            "used"
        ) is True
    )

    # Purchased retries are NOT calendar-day limited.
    # This document represents at most one currently-unused
    # purchased retry entitlement for this level.
    token_retry_entitlement_remaining = (
        max(
            0,
            int(
                token_retry.get(
                    "entitlement_remaining",
                    0,
                )
            ),
        )
        if token_retry
        else 0
    )

    total_attempts_available = (
        int(
            free_attempts_available
        )
        + token_retry_entitlement_remaining
    )

    return {
        "initial_free_attempts":
            int(
                config.get(
                    "initial_free_attempts",
                    3,
                )
            ),

        "initial_remaining":
            initial_remaining,

        "refresh_attempts":
            1,

        "refresh_hours":
            24,

        "refresh_available":
            refresh_available,

        "refresh_next_at":
            _serialize_datetime(
                refresh_next_at
            ),

        "seconds_until_refresh":
            seconds_until_refresh,

        "free_attempts_available":
            free_attempts_available,

        "attempt_source":
            (
                "initial"
                if initial_remaining > 0
                else (
                    "refresh"
                    if refresh_available
                    else None
                )
            ),

        "automatic_free_refresh":
            True,

        "refresh_accumulates":
            False,

        "token_retry_enabled":
            bool(
                config.get(
                    "token_retry_enabled",
                    True,
                )
            ),

        "token_retry_entitlement_remaining":
            token_retry_entitlement_remaining,

        "total_attempts_available":
            total_attempts_available,

        "token_retry_available":
            bool(
                free_attempts_available == 0
                and token_retry_entitlement_remaining == 0
                and config.get(
                    "token_retry_enabled",
                    True,
                )
            ),

        "token_retry_used_today":
            token_retry_used_today,

        "token_retry_reset_rule":
            "none",

        "token_retry_purchase_limit":
            "no daily limit",

        "token_retry_stockpiling":
            False,

        "token_retry_cost":
            int(
                config.get(
                    "token_retry_cost",
                    1,
                )
            ),
    }


async def _consume_free_attempt(
    db,
    user_id: str,
    level: int,
):
    """
    Atomically consume either:

      A) one remaining initial free attempt, OR
      B) the single 24-hour refreshed attempt.

    A refreshed attempt never increases the stored balance.
    Instead, consuming it advances refresh_next_at by
    another 24 hours.

    This keeps refreshed entitlement capped at one.
    """

    now = _utcnow()
    champion_stage = await _user_champion_stage(db, user_id)

    await _free_attempt_counter(
        db,
        user_id,
        level,
    )

    # --------------------------------------------------------
    # FIRST: consume initial attempt.
    # --------------------------------------------------------

    result = (
        await db.world_attempt_counters.find_one_and_update(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user_id,
                    "champion_stage": champion_stage,

                "level":
                    level,

                "initial_remaining": {
                    "$gt": 0,
                },
            },
            {
                "$inc": {
                    "initial_remaining":
                        -1,
                },

                "$set": {
                    "updated_at":
                        now,

                    "last_attempt_at":
                        now,
                },
            },
            return_document=True,
        )
    )

    if result:
        remaining = max(
            0,
            int(
                result.get(
                    "initial_remaining",
                    0,
                )
            ),
        )

        # Last initial attempt consumed:
        # start the first 24-hour refresh clock.
        if remaining == 0:
            first_refresh_at = (
                now
                + timedelta(
                    hours=24
                )
            )

            await db.world_attempt_counters.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "user_id":
                        user_id,
                        "champion_stage": champion_stage,

                    "level":
                        level,

                    "initial_remaining":
                        0,
                },
                {
                    "$set": {
                        "initial_exhausted_at":
                            now,

                        "refresh_next_at":
                            first_refresh_at,

                        "updated_at":
                            now,
                    }
                },
            )

        return {
            "source":
                "free_initial",

            "consumed_at":
                now,

            "initial_remaining":
                remaining,
        }

    # --------------------------------------------------------
    # SECOND: normalise old counters then atomically consume
    # a matured 24-hour refresh.
    # --------------------------------------------------------

    counter = await db.world_attempt_counters.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user_id,
                "champion_stage": champion_stage,

            "level":
                level,
        }
    )

    if not counter:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "NO_FREE_ATTEMPTS",

                "message":
                    "No free attempt is available.",
            },
        )

    counter = await _normalise_free_attempt_refresh(
        db,
        user_id,
        level,
        counter,
    )

    refresh_next_at = counter.get(
        "refresh_next_at"
    )

    if (
        not isinstance(
            refresh_next_at,
            datetime,
        )
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "NO_FREE_ATTEMPTS",

                "message":
                    "No free attempt is available.",
            },
        )

    if refresh_next_at.tzinfo is None:
        refresh_next_at = (
            refresh_next_at.replace(
                tzinfo=timezone.utc
            )
        )

    if now < refresh_next_at:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "FREE_ATTEMPT_REFRESH_PENDING",

                "message":
                    (
                        "Your next free attempt "
                        "is not available yet."
                    ),

                "refresh_next_at":
                    _serialize_datetime(
                        refresh_next_at
                    ),

                "seconds_until_refresh":
                    max(
                        0,
                        int(
                            (
                                refresh_next_at
                                - now
                            ).total_seconds()
                        ),
                    ),
            },
        )

    # Exact old refresh_next_at is included in the query.
    # If two requests race, only one can advance it.
    next_refresh_at = (
        now
        + timedelta(
            hours=24
        )
    )

    refreshed = (
        await db.world_attempt_counters.find_one_and_update(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user_id,
                    "champion_stage": champion_stage,

                "level":
                    level,

                "initial_remaining":
                    0,

                "refresh_next_at":
                    refresh_next_at,
            },
            {
                "$set": {
                    "refresh_last_used_at":
                        now,

                    "refresh_next_at":
                        next_refresh_at,

                    "last_attempt_at":
                        now,

                    "updated_at":
                        now,
                },

                "$inc": {
                    "refresh_attempts_used":
                        1,
                },
            },
            return_document=True,
        )
    )

    if not refreshed:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "FREE_ATTEMPT_ALREADY_USED",

                "message":
                    (
                        "This refreshed attempt "
                        "was already consumed."
                    ),
            },
        )

    return {
        "source":
            "free_refresh",

        "consumed_at":
            now,

        "refresh_next_at":
            next_refresh_at,
    }




async def _consume_world_attempt(
    db,
    user_id: str,
    level: int,
):
    """
    Consume one valid play entitlement.

    Priority:
      1. Free attempt
      2. Purchased token retry

    A purchased retry:
      - is exactly one attempt
      - does not complete a level
      - does not alter score
      - does not advance Champion stage
    """

    status = await _free_attempt_status(
        db,
        user_id,
        level,
    )

    if int(
        status.get(
            "free_attempts_available",
            0,
        )
    ) > 0:
        try:
            return await _consume_free_attempt(
                db,
                user_id,
                level,
            )

        except HTTPException as exc:
            # Another concurrent request may have consumed the
            # free entitlement after our status read. Continue
            # to the paid entitlement check rather than creating
            # another free attempt.
            detail = exc.detail

            code = (
                detail.get("code")
                if isinstance(
                    detail,
                    dict,
                )
                else None
            )

            if code not in {
                "NO_FREE_ATTEMPTS",
                "FREE_ATTEMPT_REFRESH_PENDING",
                "FREE_ATTEMPT_ALREADY_USED",
            }:
                raise

    now = _utcnow()

    paid = (
        await db.world_token_retry_daily.find_one_and_update(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user_id,

                "champion_stage":
                    await _user_champion_stage(db, user_id),

                "level":
                    level,

                "entitlement_remaining": {
                    "$gt": 0,
                },
            },
            {
                "$inc": {
                    "entitlement_remaining":
                        -1,
                },

                "$set": {
                    "used":
                        True,

                    "used_at":
                        now,

                    "updated_at":
                        now,
                },
            },
            return_document=True,
        )
    )

    if paid:
        return {
            "source":
                "token_retry",

            "consumed_at":
                now,

            "reservation_id":
                paid.get(
                    "granted_reservation_id"
                ),

            "token_cost":
                int(
                    paid.get(
                        "token_cost",
                        1,
                    )
                ),
        }

    raise HTTPException(
        status_code=409,
        detail={
            "code":
                "NO_PLAY_ATTEMPTS",

            "message":
                "No free or purchased retry attempt is available.",
        },
    )


# ===========================================================================
# FREE WORLD STATE
# ===========================================================================

@router.get("/state")
async def free_world_state(
    request: Request,
):
    db = get_db()

    try:
        user = await get_current_user(request)
    except HTTPException as exc:
        if exc.status_code != 401:
            raise
        user = None

    if user:
        progress = await _free_world_progress(
            db,
            user["user_id"],
        )
        await _touch_world_activity(db, user["user_id"], "visit")
    else:
        # Public viewing state only.
        # No guest progress is created or persisted.
        progress = {
            "current_level": 1,
            "highest_unlocked_level": 1,
            "completed_levels": [],
            "champion_stage": 1,
            "champion_ready": False,
            "season_complete": False,
        }

    current_level = max(
        1,
        min(
            10,
            int(
                progress.get(
                    "current_level",
                    1,
                )
            ),
        ),
    )

    # Current-Championship display repair (read-only/in-memory only).
    #
    # Reaching Level N means Levels 1..N-1 in THIS personal Championship
    # were already passed. Preserve explicit skips as skips; every other
    # prior level must render as completed. This does not write to the DB,
    # award anything, consume attempts, or change progression.
    current_stage_skips = {
        int(x)
        for x in (progress.get("skipped_levels") or [])
    }
    current_stage_completed = {
        int(x)
        for x in (progress.get("completed_levels") or [])
    }
    for passed_level in range(1, current_level):
        if passed_level not in current_stage_skips:
            current_stage_completed.add(passed_level)

    # Feed the repaired current-stage completion view through the existing
    # unlock/state renderer so C2 L1/L2 show completed when the user is on L3.
    progress["completed_levels"] = sorted(current_stage_completed)

    current_config = (
        await _effective_level_config(
            db,
            current_level,
            int(progress.get("champion_stage") or 1),
        )
    )

    if user:
        attempt_status = (
            await _free_attempt_status(
                db,
                user["user_id"],
                current_level,
            )
        )
    else:
        # Public viewers do not receive or consume attempts.
        attempt_status = None

    unlock_state = (
        await _resolve_unlock_context(
            db,
            current_level,
            progress,
        )
    )

    levels_state = []

    for level_number in range(
        1,
        11,
    ):
        level_config = (
            await _effective_level_config(
                db,
                level_number,
                int(progress.get("champion_stage") or 1),
            )
        )

        level_unlock = (
            await _resolve_unlock_context(
                db,
                level_number,
                progress,
            )
        )

        levels_state.append(
            {
                **level_config,
                **level_unlock,
            }
        )

    active_contest = (
        await _active_contest(
            db
        )
    )

    champion_config = (
        (
            active_contest.get(
                "champion_config"
            )
            if active_contest
            else None
        )
        or ROYAL_VILLAGE_CHAMPION
    )

    champion_stage = int(
        progress.get(
            "champion_stage",
            1,
        )
    )

    setting = await db.world_settings.find_one(
        {
            "_id":
                "active_global_contest",

            "season_id":
                WORLD_SEASON_ID,
        }
    )

    season_start = _ensure_aware_datetime(
        (setting or {}).get(
            "season_start_at"
        )
    )

    champion_schedule = _personal_champion_transition_schedule(
        progress,
        active_contest,
    )

    # -------------------------------------------------------------------
    # PREVIOUS CHAMPIONSHIP MAP HISTORY (read-only, display only).
    #
    # For every personal Championship the user has already advanced past
    # (stage < current champion_stage), all 10 levels were passed to reach
    # the next stage. Levels recorded in world_level_skips were catch-up
    # SKIPPED; every other level is a genuine COMPLETED. This never changes
    # progression, scores, attempts, prizes or historical records — it only
    # lets the map render past sections correctly instead of "locked".
    # -------------------------------------------------------------------
    championship_history = []

    if user and champion_stage > 1:
        skip_rows = await db.world_level_skips.find(
            {
                "season_id": WORLD_SEASON_ID,
                "user_id": user["user_id"],
            },
            {
                "_id": 0,
                "champion_stage": 1,
                "level": 1,
            },
        ).to_list(4000)

        skipped_by_stage = {}
        for row in skip_rows:
            st = int(row.get("champion_stage") or 0)
            lv = int(row.get("level") or 0)
            if st and lv:
                skipped_by_stage.setdefault(st, set()).add(lv)

        for stage_number in range(1, champion_stage):
            stage_skips = skipped_by_stage.get(stage_number, set())
            championship_history.append(
                {
                    "championship": stage_number,
                    "levels": [
                        {
                            "level": lv,
                            "status": (
                                "skipped"
                                if lv in stage_skips
                                else "completed"
                            ),
                        }
                        for lv in range(1, 11)
                    ],
                    "champion_status": "completed",
                }
            )

    return {
        "season_id": WORLD_SEASON_ID,
        "arena": 1,
        "arena_name": "Royal Village",

        "championship_history": championship_history,

        "progress": {
            "current_level":
                current_level,

            "highest_unlocked_level":
                int(
                    progress.get(
                        "highest_unlocked_level",
                        1,
                    )
                ),

            "completed_levels":
                progress.get(
                    "completed_levels",
                    []
                ),

            "champion_stage":
                int(
                    progress.get(
                        "champion_stage",
                        1,
                    )
                ),

            "champion_ready":
                bool(
                    progress.get(
                        "champion_ready",
                        False,
                    )
                ),

            "season_complete":
                bool(
                    progress.get(
                        "season_complete",
                        False,
                    )
                ),

            "skipped_levels":
                [
                    int(x)
                    for x in (
                        progress.get(
                            "skipped_levels"
                        )
                        or []
                    )
                ],

            "free_world_started_global_contest":
                int(
                    progress.get(
                        "free_world_started_global_contest",
                        1,
                    )
                    or 1
                ),

            "catchup_mode":
                bool(
                    active_contest
                    and int(
                        active_contest.get(
                            "contest_number"
                        )
                        or 0
                    )
                    > champion_stage
                    and int(
                        progress.get(
                            "free_world_started_global_contest",
                            1,
                        )
                        or 1
                    )
                    <= champion_stage
                ),
        },

        "current_level": {
            **current_config,
            **unlock_state,

            "attempts":
                attempt_status,
        },

        "levels":
            levels_state,

        "champion": {
            **champion_config,

            "unlocked":
                bool(
                    progress.get(
                        "champion_ready",
                        False,
                    )
                ),

            "champion_opens_at":
                (
                    champion_schedule[
                        "champion_opens_at"
                    ]
                    if champion_schedule
                    else None
                ),

            "champion_closes_at":
                (
                    champion_schedule[
                        "champion_closes_at"
                    ]
                    if champion_schedule
                    else None
                ),

            "next_level_opens_at":
                (
                    champion_schedule[
                        "next_start_at"
                    ]
                    if champion_schedule
                    else None
                ),
        },
    }


@router.get("/level/{level}")
async def free_world_level(
    level: int,
    request: Request,
):
    user = await get_current_user(request)

    if level not in ROYAL_VILLAGE_LEVELS:
        raise HTTPException(
            status_code=404,
            detail="World level not found.",
        )

    db = get_db()

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    unlock_state = (
        await _assert_world_level_available(
            db,
            level,
            progress,
        )
    )

    attempts = await _free_attempt_status(
        db,
        user["user_id"],
        level,
    )

    config = await _effective_level_config(
        db, level, int(progress.get("champion_stage") or 1)
    )

    return {
        "season_id": WORLD_SEASON_ID,

        "level": {
            **config,
            **unlock_state,

            "attempts":
                attempts,
        },
    }


# ===========================================================================
# FREE NUMBER SEQUENCE SESSION
# ===========================================================================


@router.post("/session/start")
async def free_world_session_start(
    body: FreeWorldSessionStartInput,
    request: Request,
):
    """
    Creates a challenge.

    Does NOT consume an attempt yet.
    Attempt is consumed only when /session/begin succeeds.
    """
    user = await get_current_user(request)
    db = get_db()

    level = body.level

    config = await _effective_level_config(
        db,
        level,
        await _user_champion_stage(db, user["user_id"]),
    )

    if not config:
        raise HTTPException(
            status_code=404,
            detail="World level not found.",
        )

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    unlock_state = (
        await _assert_world_level_available(
            db,
            level,
            progress,
        )
    )

    attempts = await _free_attempt_status(
        db,
        user["user_id"],
        level,
    )

    if (
        int(
            attempts.get(
                "total_attempts_available",
                attempts.get(
                    "free_attempts_available",
                    0,
                ),
            )
        )
        < 1
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "NO_FREE_ATTEMPTS",

                "message":
                    "No free attempts available.",

                "attempts":
                    attempts,
            },
        )

    target = int(
        config[
            "game_config"
        ][
            "target_number"
        ]
    )

    challenge_numbers = (
        _secure_shuffle_numbers(
            target
        )
    )

    now = _utcnow()

    session_id = (
        "WGS-"
        + secrets.token_hex(16).upper()
    )

    session = {
        "session_id": session_id,

        "season_id":
            WORLD_SEASON_ID,

        "user_id":
            user["user_id"],

        "level":
            level,

        "arena":
            int(
                config["arena"]
            ),

        "game_id":
            config["game_id"],

        "target_number":
            target,

        "challenge_numbers":
            challenge_numbers,

        "time_limit_seconds":
            int(
                config[
                    "time_limit_seconds"
                ]
            ),

        "unlock_snapshot":
            unlock_state,

        "status":
            "created",

        "created_at":
            now,

        "begun_at":
            None,

        "submitted_at":
            None,

        "attempt_source":
            None,
    }

    await db.world_game_sessions.insert_one(
        dict(session)
    )

    return {
        "session_id":
            session_id,

        "level":
            level,

        "game_id":
            config["game_id"],

        "game_config": {
            "target_number":
                target,

            "numbers":
                challenge_numbers,
        },

        "time_limit_seconds":
            session[
                "time_limit_seconds"
            ],

        "attempts":
            attempts,

        "status":
            "created",
    }


@router.post("/session/begin")
async def free_world_session_begin(
    body: FreeWorldSessionBeginInput,
    request: Request,
):
    """
    Consumes one real FREE World attempt and starts server timer.
    """
    user = await get_current_user(request)
    db = get_db()
    await _touch_world_activity(db, user["user_id"], "gameplay")

    session = await db.world_game_sessions.find_one(
        {
            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="World game session not found.",
        )

    if session.get("status") == "begun":
        return {
            "session_id":
                body.session_id,

            "status":
                "begun",

            "begun_at":
                _serialize_datetime(
                    session.get(
                        "begun_at"
                    )
                ),

            "time_limit_seconds":
                session[
                    "time_limit_seconds"
                ],
        }

    if session.get("status") != "created":
        raise HTTPException(
            status_code=409,
            detail=(
                "This World session cannot "
                "be started."
            ),
        )

    level = int(
        session["level"]
    )

    attempt = await _consume_world_attempt(
        db,
        user["user_id"],
        level,
    )

    now = _utcnow()

    update_result = (
        await db.world_game_sessions.update_one(
            {
                "session_id":
                    body.session_id,

                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user["user_id"],

                "status":
                    "created",
            },
            {
                "$set": {
                    "status":
                        "begun",

                    "begun_at":
                        now,

                    "attempt_source":
                        attempt[
                            "source"
                        ],
                }
            },
        )
    )

    if update_result.modified_count != 1:
        raise HTTPException(
            status_code=409,
            detail=(
                "World session was already "
                "started."
            ),
        )

    attempt_id = (
        "WLA-"
        + secrets.token_hex(12).upper()
    )

    await db.world_level_attempts.insert_one(
        {
            "attempt_id":
                attempt_id,

            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            "level":
                level,

            "source":
                attempt[
                    "source"
                ],

            "status":
                "started",

            "created_at":
                now,

            "completed_at":
                None,

            "passed":
                None,
        }
    )

    return {
        "session_id":
            body.session_id,

        "attempt_id":
            attempt_id,

        "status":
            "begun",

        "begun_at":
            now.isoformat(),

        "time_limit_seconds":
            int(
                session[
                    "time_limit_seconds"
                ]
            ),
    }


@router.post("/session/submit")
async def free_world_session_submit(
    body: FreeWorldSessionSubmitInput,
    request: Request,
):
    """
    Verify Number Sequence result.

    V1 verification:
    - server-issued session
    - server-issued shuffled board
    - server start timestamp
    - exact required tap sequence 1..target
    - submitted duration within configured limit
    - server elapsed time within small transport grace

    This does NOT touch paid game_scores.
    """
    user = await get_current_user(request)
    db = get_db()

    session = await db.world_game_sessions.find_one(
        {
            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="World game session not found.",
        )

    await _touch_world_activity(db, user["user_id"], "gameplay")

    if session.get("status") == "submitted":
        raise HTTPException(
            status_code=409,
            detail=(
                "This World game result "
                "was already submitted."
            ),
        )

    if session.get("status") != "begun":
        raise HTTPException(
            status_code=409,
            detail=(
                "Begin the World session "
                "before submitting."
            ),
        )

    begun_at = session.get(
        "begun_at"
    )

    if not isinstance(
        begun_at,
        datetime,
    ):
        raise HTTPException(
            status_code=409,
            detail="Session start time is invalid.",
        )

    if begun_at.tzinfo is None:
        begun_at = begun_at.replace(
            tzinfo=timezone.utc
        )

    now = _utcnow()

    server_elapsed_ms = int(
        (
            now - begun_at
        ).total_seconds()
        * 1000
    )

    time_limit_ms = (
        int(
            session[
                "time_limit_seconds"
            ]
        )
        * 1000
    )

    target = int(
        session[
            "target_number"
        ]
    )

    expected_taps = list(
        range(
            1,
            target + 1,
        )
    )

    sequence_valid = (
        body.taps
        == expected_taps
    )

    submitted_in_time = (
        body.duration_ms
        <= time_limit_ms
    )

    # Small allowance for the result HTTP request itself.
    server_in_time = (
        server_elapsed_ms
        <= (
            time_limit_ms
            + 5000
        )
    )

    passed = bool(
        body.solved
        and sequence_valid
        and submitted_in_time
        and server_in_time
    )

    score = (
        max(
            0,
            time_limit_ms
            - body.duration_ms,
        )
        if passed
        else 0
    )

    await db.world_game_sessions.update_one(
        {
            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            "status":
                "begun",
        },
        {
            "$set": {
                "status":
                    "submitted",

                "submitted_at":
                    now,

                "duration_ms":
                    body.duration_ms,

                "server_elapsed_ms":
                    server_elapsed_ms,

                "sequence_valid":
                    sequence_valid,

                "passed":
                    passed,

                "score":
                    score,
            }
        },
    )

    await db.world_level_attempts.update_one(
        {
            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        },
        {
            "$set": {
                "status":
                    "completed",

                "completed_at":
                    now,

                "duration_ms":
                    body.duration_ms,

                "server_elapsed_ms":
                    server_elapsed_ms,

                "passed":
                    passed,

                "score":
                    score,
            }
        },
    )

    level = int(
        session["level"]
    )

    if passed:
        if level < 10:
            next_level = (
                level + 1
            )

            await db.world_progress.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "user_id":
                        user["user_id"],
                },
                {
                    "$addToSet": {
                        "completed_levels":
                            level,
                    },

                    "$max": {
                        "highest_unlocked_level":
                            next_level,

                        "current_level":
                            next_level,
                    },

                    "$set": {
                        "updated_at":
                            now,
                    },
                },
                upsert=True,
            )

        else:
            # Level 10 complete:
            # user is now ready for their PERSONAL Champion challenge.
            # Champion stage is NOT incremented here.
            await db.world_progress.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "user_id":
                        user["user_id"],
                },
                {
                    "$addToSet": {
                        "completed_levels":
                            level,
                    },

                    "$set": {
                        "champion_ready":
                            True,

                        "current_level":
                            10,

                        "highest_unlocked_level":
                            10,

                        "updated_at":
                            now,
                    },
                },
                upsert=True,
            )

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    attempts = await _free_attempt_status(
        db,
        user["user_id"],
        level,
    )

    return {
        "session_id":
            body.session_id,

        "passed":
            passed,

        "result":
            (
                "congratulations"
                if passed
                else "encore"
            ),

        "score":
            score,

        "duration_ms":
            body.duration_ms,

        "server_elapsed_ms":
            server_elapsed_ms,

        "verification": {
            "sequence_valid":
                sequence_valid,

            "submitted_in_time":
                submitted_in_time,

            "server_in_time":
                server_in_time,
        },

        "progress": {
            "current_level":
                int(
                    progress.get(
                        "current_level",
                        1,
                    )
                ),

            "highest_unlocked_level":
                int(
                    progress.get(
                        "highest_unlocked_level",
                        1,
                    )
                ),

            "completed_levels":
                progress.get(
                    "completed_levels",
                    [],
                ),

            "champion_ready":
                bool(
                    progress.get(
                        "champion_ready",
                        False,
                    )
                ),
        },

        "attempts":
            attempts,
    }


# ===========================================================================
# FREE WORLD Ã¢â‚¬â€ CHAMPION CONTEST GAMEPLAY
# ===========================================================================
#
# GLOBAL CONTEST NUMBER:
#   determines which game EVERY eligible user plays.
#
# PERSONAL CHAMPION STAGE:
#   determines that user's PRIVATE potential prize.
#
# PUBLIC LEADERBOARD:
#   contains no Champion stage and no prize amount.
#
# IMPORTANT:
#   This engine is completely separate from paid contest tickets,
#   orders, paid game_scores and paid leaderboards.
# ===========================================================================


class ChampionSessionStartInput(BaseModel):
    pass


class ChampionSessionBeginInput(BaseModel):
    session_id: str = Field(
        ...,
        min_length=10,
        max_length=120,
    )


class ChampionSessionSubmitInput(BaseModel):
    session_id: str = Field(
        ...,
        min_length=10,
        max_length=120,
    )

    duration_ms: int = Field(
        ...,
        ge=100,
        le=300000,
    )

    solved: bool = True

    taps: list[int] = Field(
        default_factory=list,
        max_length=100,
    )


async def _ensure_champion_entry(
    db,
    user: dict,
    contest: dict,
):
    """
    Create immutable private Champion entry snapshot.

    Existing entry is always reused.
    Admin changes later cannot alter the user's stored
    Champion stage/prize for this contest.
    """

    user_id = user["user_id"]
    contest_number = int(
        contest["contest_number"]
    )

    existing = await db.world_contest_entries.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,

            "user_id":
                user_id,
        },
        {
            "_id": 0,
        },
    )

    if existing:
        return existing

    progress = await _free_world_progress(
        db,
        user_id,
    )

    if not bool(
        progress.get(
            "champion_ready",
            False,
        )
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code":
                    "CHAMPION_NOT_READY",

                "message":
                    (
                        "Complete the Royal Village "
                        "progression before entering "
                        "the Champion challenge."
                    ),
            },
        )

    champion_stage = max(
        1,
        min(
            WORLD_CONTEST_COUNT,
            int(
                progress.get(
                    "champion_stage",
                    1,
                )
            ),
        ),
    )

    prize = await _champion_prize(
        db,
        champion_stage,
    )

    if not prize:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_PRIZE_NOT_CONFIGURED",

                "message":
                    (
                        "This Champion stage is not "
                        "configured yet."
                    ),
            },
        )

    now = _utcnow()

    entry = {
        "entry_id":
            "WCE-"
            + secrets
                .token_hex(12)
                .upper(),

        "season_id":
            WORLD_SEASON_ID,

        # GLOBAL Ã¢â‚¬â€ decides game everyone plays.
        "global_contest_number":
            contest_number,

        "game_id":
            contest.get(
                "game_id"
            ),

        "game_config_snapshot":
            dict(
                contest.get(
                    "game_config"
                ) or {}
            ),

        # PRIVATE PERSONAL ENTITLEMENT.
        "champion_stage_snapshot":
            champion_stage,

        "prize_amount_snapshot":
            int(
                prize.get(
                    "amount",
                    0,
                )
            ),

        "prize_currency_snapshot":
            prize.get(
                "currency",
                WORLD_DEFAULT_CURRENCY,
            ),

        "user_id":
            user_id,

        "user_name_snapshot":
            user.get("name")
            or user.get("display_name")
            or user.get("username")
            or "Player",

        "entered_at":
            now,

        "status":
            "entered",
    }

    try:
        await db.world_contest_entries.insert_one(
            dict(entry)
        )

        return entry

    except Exception:
        # Handles duplicate race safely.
        existing = await db.world_contest_entries.find_one(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "global_contest_number":
                    contest_number,

                "user_id":
                    user_id,
            },
            {
                "_id": 0,
            },
        )

        if existing:
            return existing

        raise


async def _champion_attempt_status(
    db,
    user_id: str,
    contest_number: int,
):
    """
    Champion attempts are intentionally kept separate
    from normal World level attempts.

    Initial rule:
      3 official Champion attempts per GLOBAL contest.

    We can make this fully admin-configurable in the
    Free World admin panel later.
    """

    # Personal Champion stage decides only the counter STORE; the free-attempt
    # POLICY is now standardised to 3 across ALL 100 championships (same game,
    # same rules as the normal levels). Already-consumed attempts are preserved.
    stage = 1
    try:
        stage = int(await _user_champion_stage(db, user_id) or 1)
    except Exception:
        stage = 1

    if stage >= 2:
        initial_attempts = 3
        scoped = await db.world_champion_stage_counters.find_one(
            {
                "season_id": WORLD_SEASON_ID,
                "global_contest_number": contest_number,
                "user_id": user_id,
                "champion_stage": stage,
            },
            {"_id": 0},
        )
        if not scoped:
            attempts_remaining = initial_attempts
        else:
            # Upgrade legacy stage counters (created under the old 1-free
            # policy) to 3 while preserving attempts already consumed.
            if int(scoped.get("free_attempt_policy", 1) or 1) != 3:
                old_policy = int(scoped.get("free_attempt_policy", 1) or 1)
                old_remaining = max(
                    0, int(scoped.get("attempts_remaining", 0))
                )
                consumed = max(0, old_policy - old_remaining)
                migrated_remaining = max(0, initial_attempts - consumed)

                result = await db.world_champion_stage_counters.find_one_and_update(
                    {
                        "season_id": WORLD_SEASON_ID,
                        "global_contest_number": contest_number,
                        "user_id": user_id,
                        "champion_stage": stage,
                        "free_attempt_policy": {"$ne": 3},
                    },
                    {
                        "$set": {
                            "attempts_remaining": migrated_remaining,
                            "free_attempt_policy": 3,
                            "updated_at": _utcnow(),
                        },
                    },
                    return_document=True,
                )
                if result:
                    scoped = result

            attempts_remaining = max(
                0,
                int(scoped.get("attempts_remaining", initial_attempts)),
            )
    else:
        initial_attempts = 3
        counter = await db.world_champion_attempt_counters.find_one(
            {
                "season_id": WORLD_SEASON_ID,
                "global_contest_number": contest_number,
                "user_id": user_id,
            },
            {"_id": 0},
        )

        if not counter:
            attempts_remaining = initial_attempts
        else:
            # One-time upgrade for counters created under the old
            # one-free-attempt Championship policy. Preserve any
            # attempts the user already used.
            if counter.get("free_attempt_policy") != 3:
                old_policy = int(
                    counter.get("free_attempt_policy", 1) or 1
                )
                old_remaining = max(
                    0,
                    int(counter.get("attempts_remaining", 0)),
                )
                consumed = max(0, old_policy - old_remaining)
                migrated_remaining = max(0, initial_attempts - consumed)

                result = await db.world_champion_attempt_counters.find_one_and_update(
                    {
                        "season_id": WORLD_SEASON_ID,
                        "global_contest_number": contest_number,
                        "user_id": user_id,
                        "free_attempt_policy": {"$ne": 3},
                    },
                    {
                        "$set": {
                            "attempts_remaining": migrated_remaining,
                            "free_attempt_policy": 3,
                            "updated_at": _utcnow(),
                        },
                    },
                    return_document=True,
                )

                if result:
                    counter = result

            attempts_remaining = max(
                0,
                int(counter.get("attempts_remaining", initial_attempts)),
            )

    # Champion token-retry entitlement (sentinel level 0), isolated per
    # personal Champion stage so retries never leak across championships.
    champion_retry = await db.world_token_retry_daily.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "champion_stage": stage,
            "level": 0,
        },
        {"_id": 0},
    )
    entitlement_remaining = max(
        0,
        int((champion_retry or {}).get("entitlement_remaining", 0)),
    )

    return {
        # Canonical Champion counters (backend-authoritative).
        "initial_attempts": initial_attempts,
        "attempts_remaining": attempts_remaining,

        # Frontend-facing fields — mirror the normal-level attempt
        # status shape so the Champion play UI shows the correct
        # "PLAY AGAIN — FREE" / "RETRY WITH TOKEN" state.
        "free_attempts_available": attempts_remaining,
        "token_retry_enabled": True,
        "token_retry_entitlement_remaining": entitlement_remaining,
        "total_attempts_available": (
            attempts_remaining + entitlement_remaining
        ),
        "token_retry_available": bool(
            attempts_remaining == 0
            and entitlement_remaining == 0
        ),
        "token_retry_cost": CHAMPION_TOKEN_RETRY_COST,
    }



async def _consume_champion_stage2_attempt(
    db,
    user_id: str,
    contest_number: int,
    stage: int,
    now,
):
    """
    Consume one Champion play for Champion Level 2 and later.

    Policy: THREE free attempts per (season + contest + user + stage) —
    standardised to match Championship 1 and the normal levels — then a
    purchased token retry (shared level-0 champion entitlement).
    Atomic; simultaneous begins cannot double-consume.
    """
    key = {
        "season_id": WORLD_SEASON_ID,
        "global_contest_number": contest_number,
        "user_id": user_id,
        "champion_stage": stage,
    }

    await db.world_champion_stage_counters.update_one(
        key,
        {
            "$setOnInsert": {
                **key,
                "attempts_remaining": 3,
                "free_attempt_policy": 3,
                "created_at": now,
            }
        },
        upsert=True,
    )

    # Upgrade any legacy 1-free counter to the standardised 3-free policy
    # (all 100 championships share the same rules), preserving consumed.
    legacy = await db.world_champion_stage_counters.find_one(
        {**key, "free_attempt_policy": {"$ne": 3}},
        {"_id": 0},
    )
    if legacy:
        old_policy = int(legacy.get("free_attempt_policy", 1) or 1)
        old_remaining = max(0, int(legacy.get("attempts_remaining", 0)))
        consumed = max(0, old_policy - old_remaining)
        await db.world_champion_stage_counters.update_one(
            {**key, "free_attempt_policy": {"$ne": 3}},
            {
                "$set": {
                    "attempts_remaining": max(0, 3 - consumed),
                    "free_attempt_policy": 3,
                    "updated_at": now,
                }
            },
        )

    # 1. FREE (3 per stage)
    scoped = await db.world_champion_stage_counters.find_one_and_update(
        {**key, "attempts_remaining": {"$gt": 0}},
        {
            "$inc": {"attempts_remaining": -1},
            "$set": {"updated_at": now, "last_attempt_at": now},
        },
        return_document=True,
    )
    if scoped is not None:
        return max(0, int(scoped.get("attempts_remaining", 0)))

    # 2. PURCHASED CHAMPION RETRY (level-0 entitlement, isolated per stage)
    paid = await db.world_token_retry_daily.find_one_and_update(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "champion_stage": stage,
            "level": 0,
            "entitlement_remaining": {"$gt": 0},
        },
        {
            "$inc": {"entitlement_remaining": -1},
            "$set": {"used": True, "used_at": now, "updated_at": now},
        },
        return_document=True,
    )
    if paid:
        reservation_id = paid.get("granted_reservation_id")
        if reservation_id:
            await db.world_token_retry_reservations.update_one(
                {"reservation_id": reservation_id},
                {"$set": {"status": "consumed", "consumed_at": now, "updated_at": now}},
            )
        return 0

    raise HTTPException(
        status_code=409,
        detail={
            "code": "NO_CHAMPION_ATTEMPTS",
            "message": (
                "No Champion attempt is available. "
                "Purchase a token retry to play again."
            ),
        },
    )


async def _consume_champion_attempt(
    db,
    user_id: str,
    contest_number: int,
):
    """
    Atomically consume one Champion play entitlement.

    Priority:
      1. Three free Champion attempts per GLOBAL contest.
      2. One purchased Champion token retry.

    Purchased retries are not stockpiled. After one purchased
    retry is consumed, the player may purchase another and repeat
    while the Championship contest remains active.
    """

    now = _utcnow()

    # Champion Level 2+ use a dedicated per-stage counter (1 free
    # attempt, then token retry). Delegate so the stage-1 path below
    # remains completely unchanged.
    stage = 1
    try:
        stage = int(await _user_champion_stage(db, user_id) or 1)
    except Exception:
        stage = 1

    if stage >= 2:
        return await _consume_champion_stage2_attempt(
            db,
            user_id,
            contest_number,
            stage,
            now,
        )

    # Ensure the three-free-attempt counter exists for this
    # user + GLOBAL Champion contest.
    await db.world_champion_attempt_counters.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,

            "user_id":
                user_id,
        },
        {
            "$setOnInsert": {
                "season_id":
                    WORLD_SEASON_ID,

                "global_contest_number":
                    contest_number,

                "user_id":
                    user_id,

                "attempts_remaining":
                    3,


                "free_attempt_policy":
                    3,
                "created_at":
                    now,
            }
        },
        upsert=True,
    )

    # ---------------------------------------------------------
    # 1. FREE CHAMPIONSHIP ATTEMPTS (3 PER GLOBAL CONTEST)
    # ---------------------------------------------------------
    result = await db.world_champion_attempt_counters.find_one_and_update(
        {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,

            "user_id":
                user_id,

            "attempts_remaining": {
                "$gt": 0,
            },
        },
        {
            "$inc": {
                "attempts_remaining":
                    -1,
            },

            "$set": {
                "updated_at":
                    now,

                "last_attempt_at":
                    now,
            },
        },
        return_document=True,
    )

    if result:
        return max(
            0,
            int(
                result.get(
                    "attempts_remaining",
                    0,
                )
            ),
        )

    # ---------------------------------------------------------
    # 2. PURCHASED CHAMPIONSHIP RETRY
    #
    # Champion retry entitlement uses API sentinel level 0.
    # Champion is NOT a normal World level.
    # Consume exactly ONE already-paid retry entitlement.
    # find_one_and_update makes simultaneous begin requests
    # unable to consume the same entitlement twice.
    # ---------------------------------------------------------
    paid = await db.world_token_retry_daily.find_one_and_update(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user_id,

            "champion_stage":
                stage,

            "level":
                0,

            "entitlement_remaining": {
                "$gt": 0,
            },
        },
        {
            "$inc": {
                "entitlement_remaining":
                    -1,
            },

            "$set": {
                "used":
                    True,

                "used_at":
                    now,

                "updated_at":
                    now,
            },
        },
        return_document=True,
    )

    if paid:
        reservation_id = paid.get(
            "granted_reservation_id"
        )

        # Keep the reservation audit trail synchronized with the
        # entitlement that has now actually been consumed.
        if reservation_id:
            await db.world_token_retry_reservations.update_one(
                {
                    "reservation_id":
                        reservation_id,
                },
                {
                    "$set": {
                        "status":
                            "consumed",

                        "consumed_at":
                            now,

                        "updated_at":
                            now,
                    }
                },
            )

        # Champion session/begin currently expects an integer
        # attempts_remaining value. The free counter remains zero;
        # this play was authorized by the paid entitlement.
        return 0

    # ---------------------------------------------------------
    # No free attempts remaining and no purchased retry.
    # ---------------------------------------------------------
    raise HTTPException(
        status_code=409,
        detail={
            "code":
                "NO_CHAMPION_ATTEMPTS",

            "message":
                (
                    "No Champion attempt is available. "
                    "Purchase a token retry to play again."
                ),
        },
    )


# ===========================================================================
# CHAMPION STATUS
# ===========================================================================


@router.get("/champion/status")
async def champion_status(
    request: Request,
):
    user = await get_current_user(request)
    db = get_db()

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    active = await _active_contest(
        db
    )

    if not active:
        return {
            "champion_ready":
                bool(
                    progress.get(
                        "champion_ready",
                        False,
                    )
                ),

            "active_contest":
                None,

            "entry":
                None,

            "attempts":
                None,
        }

    contest_number = int(
        active[
            "contest_number"
        ]
    )

    entry = await db.world_contest_entries.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,

            "user_id":
                user["user_id"],
        },
        {
            "_id": 0,
        },
    )

    attempts = await _champion_attempt_status(
        db,
        user["user_id"],
        contest_number,
    )

    return {
        "champion_ready":
            bool(
                progress.get(
                    "champion_ready",
                    False,
                )
            ),

        "active_contest":
            _contest_public(
                active
            ),

        # PRIVATE authenticated user's own entry.
        "entry":
            _clean_doc(
                entry
            ),

        "attempts":
            attempts,
    }


# ===========================================================================
# CHAMPION SESSION START
# ===========================================================================


@router.post("/champion/session/start")
async def champion_session_start(
    body: ChampionSessionStartInput,
    request: Request,
):
    """
    Prepare Champion challenge.

    Does NOT consume attempt yet.
    """

    user = await get_current_user(
        request
    )

    db = get_db()

    contest = await _active_contest(
        db
    )

    if not contest:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "NO_ACTIVE_CHAMPION_CONTEST",

                "message":
                    (
                        "There is currently no active "
                        "Champion Contest."
                    ),
            },
        )

    now = _utcnow()

    start_at = contest.get(
        "start_at"
    )

    end_at = contest.get(
        "end_at"
    )

    if (
        isinstance(
            start_at,
            datetime,
        )
        and start_at.tzinfo is None
    ):
        start_at = start_at.replace(
            tzinfo=timezone.utc
        )

    if (
        isinstance(
            end_at,
            datetime,
        )
        and end_at.tzinfo is None
    ):
        end_at = end_at.replace(
            tzinfo=timezone.utc
        )

    if (
        start_at
        and now < start_at
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CONTEST_NOT_STARTED",

                "message":
                    (
                        "The Champion Contest has "
                        "not started yet."
                    ),
            },
        )

    if (
        end_at
        and now >= end_at
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CONTEST_ENDED",

                "message":
                    (
                        "The Champion Contest has ended."
                    ),
            },
        )

    # All personal Champion stages C1-C100 use the official
    # Number Sequence engine, even when a legacy global contest
    # record has an empty or older game_id. Preserve all other
    # contest settings and the existing eligibility checks.
    game_id = "number_sequence"

    if game_id != "number_sequence":
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "GAME_NOT_AVAILABLE",

                "message":
                    (
                        "This Champion game's official "
                        "engine is not available yet."
                    ),
            },
        )

    contest_number = int(
        contest[
            "contest_number"
        ]
    )

    # -------------------------------------------------------
    # QUALIFICATION MUST HAPPEN BEFORE CHAMPION ENTRY CREATION.
    #
    # An unqualified Champion 3+ player must not receive a
    # Champion entry snapshot merely by attempting this route.
    # -------------------------------------------------------

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    champion_stage_for_qualification = max(
        1,
        int(
            progress.get(
                "champion_stage",
                1,
            )
        ),
    )

    qualification = (
        await _enforce_champion_paid_qualification(
            db,
            user["user_id"],
            champion_stage_for_qualification,
            contest_number,
        )
    )

    # Only a player who passed the qualification gate reaches
    # Champion entry creation.
    entry = await _ensure_champion_entry(
        db,
        user,
        contest,
    )

    champion_stage_snapshot = int(
        entry[
            "champion_stage_snapshot"
        ]
    )

    # Defensive consistency check:
    # eligibility and immutable entry snapshot must represent
    # the same personal Champion stage.
    if (
        champion_stage_snapshot
        != champion_stage_for_qualification
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_STAGE_SNAPSHOT_MISMATCH",

                "message":
                    (
                        "Champion progression changed while "
                        "preparing this challenge. Refresh "
                        "and try again."
                    ),
            },
        )

    attempts = await _champion_attempt_status(
        db,
        user["user_id"],
        contest_number,
    )

    free_champion_attempts = int(
        attempts[
            "attempts_remaining"
        ]
    )

    # Championship has exactly one free attempt.
    # After that free attempt is consumed, a purchased
    # Level-11 token retry may authorize another session.
    paid_retry = await db.world_token_retry_daily.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            "champion_stage":
                await _user_champion_stage(db, user["user_id"]),

            "level":
                0,

            "entitlement_remaining": {
                "$gt": 0,
            },
        }
    )

    paid_retry_available = bool(
        paid_retry
    )

    if (
        free_champion_attempts < 1
        and not paid_retry_available
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "NO_CHAMPION_ATTEMPTS",

                "message":
                    (
                        "No Champion attempts remain. "
                        "Purchase a token retry to play again."
                    ),
            },
        )

    game_config = dict(
        contest.get(
            "game_config"
        ) or {}
    )

    # All Champion stages use Number Sequence 1-30.
    target = 30

    timer_mode = str(
        game_config.get(
            "timer_mode",
            "stopwatch",
        )
        or "stopwatch"
    ).strip().lower()

    if timer_mode == "stopwatch":
        time_limit_seconds = None
    else:
        time_limit_seconds = int(
            game_config.get(
                "time_limit_seconds",
                75,
            )
        )

    numbers = _secure_shuffle_numbers(
        target
    )

    session_id = (
        "WCS-"
        + secrets
            .token_hex(16)
            .upper()
    )

    session = {
        "session_id":
            session_id,

        "season_id":
            WORLD_SEASON_ID,

        "global_contest_number":
            contest_number,

        "entry_id":
            entry["entry_id"],

        "user_id":
            user["user_id"],

        "user_name":
            entry[
                "user_name_snapshot"
            ],

        # PRIVATE snapshots copied to session.
        "champion_stage_snapshot":
            int(
                entry[
                    "champion_stage_snapshot"
                ]
            ),

        "prize_amount_snapshot":
            int(
                entry[
                    "prize_amount_snapshot"
                ]
            ),

        "prize_currency_snapshot":
            entry[
                "prize_currency_snapshot"
            ],

        "game_id":
            game_id,

        "target_number":
            target,

        "challenge_numbers":
            numbers,

        "timer_mode":
            timer_mode,

        "time_limit_seconds":
            time_limit_seconds,

        "status":
            "created",

        "created_at":
            now,

        "begun_at":
            None,

        "submitted_at":
            None,
    }

    await db.world_champion_sessions.insert_one(
        dict(session)
    )

    # Response to authenticated user may identify
    # their own stage/prize.
    return {
        "session_id":
            session_id,

        "contest":
            _contest_public(
                contest
            ),

        "personal_champion": {
            "stage":
                int(
                    entry[
                        "champion_stage_snapshot"
                    ]
                ),

            "prize_amount":
                int(
                    entry[
                        "prize_amount_snapshot"
                    ]
                ),

            "currency":
                entry[
                    "prize_currency_snapshot"
                ],
        },

        "game_id":
            game_id,

        "game_config": {
            "target_number":
                target,

            "numbers":
                numbers,
        },

        "timer_mode":
            timer_mode,

        "time_limit_seconds":
            time_limit_seconds,

        "attempts":
            attempts,

        "status":
            "created",
    }


# ===========================================================================
# CHAMPION SESSION BEGIN
# ===========================================================================


@router.post("/champion/session/begin")
async def champion_session_begin(
    body: ChampionSessionBeginInput,
    request: Request,
):
    user = await get_current_user(
        request
    )

    db = get_db()
    await _touch_world_activity(db, user["user_id"], "gameplay")

    session = await db.world_champion_sessions.find_one(
        {
            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail=(
                "Champion session not found."
            ),
        )

    if (
        session.get("status")
        == "begun"
    ):
        return {
            "session_id":
                body.session_id,

            "status":
                "begun",

            "begun_at":
                _serialize_datetime(
                    session.get(
                        "begun_at"
                    )
                ),

            "timer_mode":
                session.get(
                    "timer_mode",
                    "stopwatch",
                ),

            "time_limit_seconds":
                (
                    int(
                        session[
                            "time_limit_seconds"
                        ]
                    )
                    if session.get(
                        "time_limit_seconds"
                    ) is not None
                    else None
                ),
        }

    if (
        session.get("status")
        != "created"
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "This Champion session cannot "
                "be started."
            ),
        )

    contest_number = int(
        session[
            "global_contest_number"
        ]
    )

    # Re-check active contest.
    active = await _active_contest(
        db
    )

    if (
        not active
        or int(
            active[
                "contest_number"
            ]
        )
        != contest_number
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "This Champion Contest is no "
                "longer active."
            ),
        )

    remaining = await _consume_champion_attempt(
        db,
        user["user_id"],
        contest_number,
    )

    now = _utcnow()

    updated = await db.world_champion_sessions.update_one(
        {
            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            "status":
                "created",
        },
        {
            "$set": {
                "status":
                    "begun",

                "begun_at":
                    now,

                "attempts_remaining_after_begin":
                    remaining,
            }
        },
    )

    if (
        updated.modified_count
        != 1
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Champion session was already "
                "started."
            ),
        )

    return {
        "session_id":
            body.session_id,

        "status":
            "begun",

        "begun_at":
            now.isoformat(),

        "timer_mode":
            session.get(
                "timer_mode",
                "stopwatch",
            ),

        "time_limit_seconds":
            (
                int(
                    session[
                        "time_limit_seconds"
                    ]
                )
                if session.get(
                    "time_limit_seconds"
                ) is not None
                else None
            ),

        "attempts_remaining":
            remaining,
    }


# ===========================================================================
# CHAMPION SESSION SUBMIT
# ===========================================================================


@router.post("/champion/session/submit")
async def champion_session_submit(
    body: ChampionSessionSubmitInput,
    request: Request,
):
    """
    Verify official Champion Number Sequence score.

    Only verified solved games become leaderboard scores.
    PRIVATE prize/stage values are stored internally but
    never exposed from public leaderboard.
    """

    user = await get_current_user(
        request
    )

    db = get_db()

    session = await db.world_champion_sessions.find_one(
        {
            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        }
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail=(
                "Champion session not found."
            ),
        )

    await _touch_world_activity(db, user["user_id"], "gameplay")

    if (
        session.get("status")
        == "submitted"
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "This Champion result was "
                "already submitted."
            ),
        )

    if (
        session.get("status")
        != "begun"
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Begin the Champion session "
                "before submitting."
            ),
        )

    begun_at = session.get(
        "begun_at"
    )

    if not isinstance(
        begun_at,
        datetime,
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Champion session start time "
                "is invalid."
            ),
        )

    if begun_at.tzinfo is None:
        begun_at = begun_at.replace(
            tzinfo=timezone.utc
        )

    now = _utcnow()

    server_elapsed_ms = int(
        (
            now - begun_at
        ).total_seconds()
        * 1000
    )

    target = int(
        session[
            "target_number"
        ]
    )

    timer_mode = str(
        session.get(
            "timer_mode",
            "stopwatch",
        )
        or "stopwatch"
    ).strip().lower()

    expected_taps = list(
        range(
            1,
            target + 1,
        )
    )

    sequence_valid = (
        body.taps
        == expected_taps
    )

    if timer_mode == "stopwatch":
        # No Champion countdown.
        # Backend elapsed time is authoritative.
        submitted_in_time = True
        server_in_time = True

        passed = bool(
            body.solved
            and sequence_valid
        )

        # Every verified 1 -> 20 completion receives the same score.
        # Leaderboard then ranks duration_ms ascending.
        score = target if passed else 0

        authoritative_duration_ms = (
            server_elapsed_ms
        )

    else:
        time_limit_ms = (
            int(
                session[
                    "time_limit_seconds"
                ]
            )
            * 1000
        )

        submitted_in_time = (
            server_elapsed_ms
            <= time_limit_ms
        )

        server_in_time = (
            server_elapsed_ms
            <= (
                time_limit_ms
                + 5000
            )
        )

        passed = bool(
            body.solved
            and sequence_valid
            and submitted_in_time
            and server_in_time
        )

        score = (
            max(
                0,
                time_limit_ms
                - server_elapsed_ms,
            )
            if passed
            else 0
        )

        authoritative_duration_ms = (
            server_elapsed_ms
        )

    accuracy = (
        1.0
        if passed
        else 0.0
    )

    submit_update = await db.world_champion_sessions.update_one(
        {
            "session_id":
                body.session_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            # Atomic submission claim.
            #
            # Only ONE concurrent request may transition
            # begun -> submitted.
            "status":
                "begun",
        },
        {
            "$set": {
                "status":
                    "submitted",

                "submitted_at":
                    now,

                "duration_ms":
                    authoritative_duration_ms,

                "client_duration_ms":
                    body.duration_ms,

                "server_elapsed_ms":
                    server_elapsed_ms,

                "sequence_valid":
                    sequence_valid,

                "passed":
                    passed,

                "score":
                    score,

                "accuracy":
                    accuracy,
            }
        },
    )

    # -------------------------------------------------------
    # CONCURRENT SUBMIT SAFETY
    # -------------------------------------------------------
    #
    # Two requests may both have read the session while it
    # was still "begun". The conditional update above is the
    # authoritative winner.
    #
    # The request that did NOT modify the document MUST stop
    # here before touching Champion scores/leaderboard.
    if submit_update.modified_count != 1:
        current = (
            await db.world_champion_sessions.find_one(
                {
                    "session_id":
                        body.session_id,

                    "season_id":
                        WORLD_SEASON_ID,

                    "user_id":
                        user["user_id"],
                },
                {
                    "_id": 0,
                    "status": 1,
                    "submitted_at": 1,
                    "score": 1,
                    "passed": 1,
                },
            )
        )

        if (
            current
            and current.get("status")
            == "submitted"
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_RESULT_ALREADY_SUBMITTED",

                    "message":
                        "This Champion result was already submitted.",
                },
            )

        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_SUBMIT_CONFLICT",

                "message":
                    (
                        "This Champion result could not be "
                        "submitted because the session state "
                        "changed. Refresh and check the result."
                    ),
            },
        )



    contest_number = int(
        session[
            "global_contest_number"
        ]
    )

    # -------------------------------------------------------
    # ONLY VERIFIED PASS GOES TO GLOBAL LEADERBOARD
    # -------------------------------------------------------

    if passed:
        score_selector = {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,

            "user_id":
                user["user_id"],
        }

        candidate_score = {
            "score_id":
                "WCSCORE-"
                + secrets
                  .token_hex(12)
                  .upper(),

            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,

            "session_id":
                body.session_id,

            "entry_id":
                session[
                    "entry_id"
                ],

            "user_id":
                user["user_id"],

            "user_name":
                session.get(
                    "user_name",
                    "Player",
                ),

            "game_id":
                session[
                    "game_id"
                ],

            "score":
                score,

            "duration_ms":
                authoritative_duration_ms,

            "accuracy":
                accuracy,

            "eligible":
                True,

            "submitted_at":
                now,

            "champion_stage_snapshot":
                int(
                    session[
                        "champion_stage_snapshot"
                    ]
                ),

            "prize_amount_snapshot":
                int(
                    session[
                        "prize_amount_snapshot"
                    ]
                ),

            "prize_currency_snapshot":
                session[
                    "prize_currency_snapshot"
                ],
        }

        existing_best = await db.world_champion_scores.find_one(
            score_selector,
            {
                "_id": 0,
            },
        )

        should_replace = (
            not existing_best
            or score
                > int(
                    existing_best.get(
                        "score",
                        -1,
                    )
                )
            or (
                score
                == int(
                    existing_best.get(
                        "score",
                        -1,
                    )
                )
                and authoritative_duration_ms
                < int(
                    existing_best.get(
                        "duration_ms",
                        999999999,
                    )
                )
            )
            or (
                score
                == int(
                    existing_best.get(
                        "score",
                        -1,
                    )
                )
                and authoritative_duration_ms
                == int(
                    existing_best.get(
                        "duration_ms",
                        999999999,
                    )
                )
                and (
                    existing_best.get(
                        "submitted_at"
                    ) is None
                    or now
                    < existing_best.get(
                        "submitted_at"
                    )
                )
            )
        )

        if should_replace:
            if not existing_best:
                try:
                    await db.world_champion_scores.insert_one(
                        dict(
                            candidate_score
                        )
                    )

                except Exception:
                    # Another concurrent session may have
                    # created this user's unique score slot
                    # after our read. Re-evaluate against the
                    # authoritative row instead of creating
                    # a duplicate.
                    existing_best = (
                        await db.world_champion_scores.find_one(
                            score_selector,
                            {
                                "_id": 0,
                            },
                        )
                    )

            if existing_best:
                replace_filter = {
                    **score_selector,

                    "$or": [
                        {
                            "score": {
                                "$lt":
                                    score
                            }
                        },

                        {
                            "score":
                                score,

                            "duration_ms": {
                                "$gt":
                                    authoritative_duration_ms
                            },
                        },

                        {
                            "score":
                                score,

                            "duration_ms":
                authoritative_duration_ms,

                            "submitted_at": {
                                "$gt":
                                    now
                            },
                        },
                    ],
                }

                await db.world_champion_scores.update_one(
                    replace_filter,
                    {
                        "$set":
                            candidate_score
                    },
                )

    attempts = await _champion_attempt_status(
        db,
        user["user_id"],
        contest_number,
    )

    return {
        "session_id":
            body.session_id,

        "passed":
            passed,

        "result":
            (
                "submitted"
                if passed
                else "encore"
            ),

        "score":
            score,

        "duration_ms":
                authoritative_duration_ms,

        "verification": {
            "sequence_valid":
                sequence_valid,

            "submitted_in_time":
                submitted_in_time,

            "server_in_time":
                server_in_time,
        },

        "leaderboard_eligible":
            passed,

        "attempts":
            attempts,

        # User's own private snapshot.
        "personal_champion": {
            "stage":
                int(
                    session[
                        "champion_stage_snapshot"
                    ]
                ),

            "prize_amount":
                int(
                    session[
                        "prize_amount_snapshot"
                    ]
                ),

            "currency":
                session[
                    "prize_currency_snapshot"
                ],
        },
    }


# ===========================================================================
# USER'S OWN CHAMPION HISTORY
# ===========================================================================


@router.get("/champion/me")
async def champion_my_history(
    request: Request,
):
    user = await get_current_user(
        request
    )

    db = get_db()

    entries = await db.world_contest_entries.find(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        },
        {
            "_id": 0,
        },
    ).sort(
        "entered_at",
        -1,
    ).to_list(100)

    scores = await db.world_champion_scores.find(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        },
        {
            "_id": 0,
        },
    ).sort(
        "submitted_at",
        -1,
    ).to_list(100)

    # Authenticated user can see THEIR OWN private amounts.
    return {
        "entries": [
            _clean_doc(
                row
            )
            for row in entries
        ],

        "scores": [
            _clean_doc(
                row
            )
            for row in scores
        ],
    }


# ===========================================================================
# PHASE 2C REVISED Ã¢â‚¬â€ TOKEN / BEST-TIME / CHAMPION RULES
# ===========================================================================


class WorldTokenRetryInput(BaseModel):
    # Levels 1-11 = normal Free World levels.
    # Level 0 = Champion retry sentinel used by the frontend
    # and handled explicitly by reserve_world_token_retry().
    level: int = Field(
        ...,
        ge=0,
        le=11,
    )


class WorldTokenUnlockInput(BaseModel):
    level: int = Field(
        ...,
        ge=1,
        le=10,
    )


def _world_day_key() -> str:
    return _utcnow().astimezone(
        ZoneInfo(WORLD_TIMEZONE)
    ).strftime("%Y-%m-%d")


def _champion_rank_base_prize(
    rank: int,
) -> int:
    return int(
        CHAMPION_BASE_RANK_PRIZES.get(
            int(rank),
            0,
        )
    )


def _champion_final_prize(
    rank: int,
    champion_stage: int,
):
    """
    Authoritative live and final Championship prize.

    Multiplier:
      Championship 1 = x1
      Championship 2 = x1.5
      Championship 3 = x2
      Championship 4 = x2.5
      Championship 5 = x3

    Formula:
      1 + ((champion_stage - 1) * 0.5)
    """

    stage = max(
        1,
        int(champion_stage),
    )

    multiplier = (
        1
        + (
            (stage - 1)
            * 0.5
        )
    )

    amount = (
        _champion_rank_base_prize(rank)
        * multiplier
    )

    if float(amount).is_integer():
        return int(amount)

    return round(
        amount,
        2,
    )


async def _world_best_verified_time(
    db,
    user_id: str,
    level: int,
):
    best = await db.world_level_attempts.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "level": level,
            "passed": True,
        },
        {
            "_id": 0,
            "duration_ms": 1,
        },
        sort=[
            ("duration_ms", 1),
        ],
    )

    if not best:
        return None

    return int(
        best.get(
            "duration_ms",
            0,
        )
    )


# ===========================================================================
# TOKEN RETRY Ã¢â‚¬â€ RESERVATION HOOK ONLY
# ===========================================================================


@router.post("/token/retry/reserve")
async def reserve_world_token_retry(
    body: WorldTokenRetryInput,
    request: Request,
):
    """
    Purchase exactly ONE additional skill-game attempt.

    Production rules:
    - use available free attempt first
    - one unused purchased retry at a time
    - no daily paid-retry limit
    - after purchased retry is consumed another may be bought
    - server controls cost
    - concurrent requests share one purchase reservation
    - crashed/incomplete purchase resumes using same reservation
    - same reservation cannot debit wallet twice
    """

    user = await get_current_user(
        request
    )

    db = get_db()

    user_id = user["user_id"]
    level = int(body.level)

    if level != 0:
        config = await _effective_level_config(
            db,
            level,
            await _user_champion_stage(db, user_id),
        )

        if not bool(
            config.get(
                "token_retry_enabled",
                True,
            )
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "TOKEN_RETRY_DISABLED",

                    "message":
                        "Token retry is disabled for this level.",
                },
            )
    else:
        # Champion retry has its own entitlement rules.
        config = {
            "token_retry_enabled": True,
            "token_retry_cost": 1,
        }

    # Championship uses three free attempts per global contest.
    # After those attempts are consumed, token retries may be
    # purchased repeatedly, one retry at a time.
    if level == 0:
        champion_contest = await _active_contest(
            db,
        )

        if not champion_contest:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "CHAMPIONSHIP_NOT_ACTIVE",
                    "message": "Championship is not active.",
                },
            )

        contest_number = int(
            champion_contest.get(
                "global_contest_number",
                champion_contest.get(
                    "contest_number",
                    0,
                ),
            )
        )

        status = await _champion_attempt_status(
            db,
            user_id,
            contest_number,
        )

        free_attempts_available = int(
            status.get(
                "attempts_remaining",
                0,
            )
        )
    else:
        status = await _free_attempt_status(
            db,
            user_id,
            level,
        )

        free_attempts_available = int(
            status.get(
                "free_attempts_available",
                0,
            )
        )

    if free_attempts_available > 0:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "FREE_ATTEMPT_AVAILABLE",

                "message":
                    (
                        "Use the available free attempt "
                        "before buying a token retry."
                    ),
            },
        )

    now = _utcnow()

    # Isolate the entitlement holder per personal Champion stage so a
    # purchased retry can never be used in a different championship.
    reserve_champion_stage = await _user_champion_stage(db, user_id)

    holder_filter = {
        "season_id":
            WORLD_SEASON_ID,

        "user_id":
            user_id,

        "champion_stage":
            reserve_champion_stage,

        "level":
            level,
    }

    # Ensure the one-per-user/stage/level entitlement holder exists.
    await db.world_token_retry_daily.update_one(
        holder_filter,
        {
            "$setOnInsert": {
                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user_id,

                "champion_stage":
                    reserve_champion_stage,

                "level":
                    level,

                "entitlement_remaining":
                    0,

                "used":
                    False,

                "created_at":
                    now,

                "updated_at":
                    now,
            },
        },
        upsert=True,
    )

    holder = await db.world_token_retry_daily.find_one(
        holder_filter
    )

    # If an entitlement already exists, do not allow stockpiling.
    if int(
        (holder or {}).get(
            "entitlement_remaining",
            0,
        )
    ) > 0:
        granted_reservation_id = (
            (holder or {}).get(
                "granted_reservation_id"
            )
        )

        # Repair reservation state if a previous request crashed
        # after granting entitlement but before marking it active.
        if granted_reservation_id:
            await db.world_token_retry_reservations.update_one(
                {
                    "reservation_id":
                        granted_reservation_id,
                },
                {
                    "$set": {
                        "status":
                            "active",

                        "entitlement_granted":
                            True,

                        "updated_at":
                            _utcnow(),
                    },
                },
            )

        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "TOKEN_RETRY_ALREADY_READY",

                "message":
                    (
                        "Use your purchased retry before "
                        "buying another."
                    ),

                "reservation_id":
                    granted_reservation_id,
            },
        )

    # ---------------------------------------------------------
    # Acquire ONE purchase lock.
    #
    # Two simultaneous requests cannot acquire different
    # reservations because this happens atomically on the
    # single entitlement-holder document.
    # ---------------------------------------------------------

    candidate_reservation_id = (
        "WTR-"
        + secrets.token_hex(12).upper()
    )

    acquired = (
        await db.world_token_retry_daily.find_one_and_update(
            {
                **holder_filter,

                "entitlement_remaining": {
                    "$lte": 0,
                },

                "$or": [
                    {
                        "purchase_lock_reservation_id": {
                            "$exists": False,
                        }
                    },
                    {
                        "purchase_lock_reservation_id":
                            None,
                    },
                ],
            },
            {
                "$set": {
                    "purchase_lock_reservation_id":
                        candidate_reservation_id,

                    "purchase_lock_acquired_at":
                        now,

                    "updated_at":
                        now,
                },
            },
            return_document=True,
        )
    )

    if acquired:
        reservation_id = (
            candidate_reservation_id
        )

    else:
        # Another request already owns the purchase lock.
        # Resume the SAME reservation rather than creating and
        # charging a second one.
        holder = await db.world_token_retry_daily.find_one(
            holder_filter
        )

        if int(
            (holder or {}).get(
                "entitlement_remaining",
                0,
            )
        ) > 0:
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "TOKEN_RETRY_ALREADY_READY",

                    "message":
                        (
                            "A purchased retry is already ready."
                        ),
                },
            )

        reservation_id = (
            (holder or {}).get(
                "purchase_lock_reservation_id"
            )
        )

        if not reservation_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "TOKEN_RETRY_PURCHASE_BUSY",

                    "message":
                        (
                            "Retry purchase state changed. "
                            "Please try again."
                        ),
                },
            )

    token_cost = int(
        config.get(
            "token_retry_cost",
            1,
        )
    )

    # Stable reservation document.
    await db.world_token_retry_reservations.update_one(
        {
            "reservation_id":
                reservation_id,
        },
        {
            "$setOnInsert": {
                "reservation_id":
                    reservation_id,

                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user_id,

                "level":
                    level,

                "token_cost":
                    token_cost,

                "token_payment_verified":
                    False,

                "status":
                    "awaiting_token_verification",

                "created_at":
                    now,
            },

            "$set": {
                "updated_at":
                    _utcnow(),
            },
        },
        upsert=True,
    )

    reservation = (
        await db.world_token_retry_reservations.find_one(
            {
                "reservation_id":
                    reservation_id,
            }
        )
    )

    # Preserve original server-authoritative price for a resumed
    # reservation even if admin changes cost midway through it.
    token_cost = int(
        reservation.get(
            "token_cost",
            token_cost,
        )
    )

    await db.world_token_retry_reservations.update_one(
        {
            "reservation_id":
                reservation_id,
        },
        {
            "$set": {
                "status":
                    "charging",

                "updated_at":
                    _utcnow(),
            },
        },
    )

    # Idempotent wallet debit.
    #
    # Same reservation_id => same wallet marker =>
    # repeating/resuming this operation cannot charge twice.
    spend = await _apply_tx_idempotent(
        db,
        user_id,
        "spend",
        -float(token_cost),
        note=(
            "Free World Champion token retry"
            if level == 0
            else f"Free World Level {level} token retry"
        ),
        ref_order_id=
            reservation_id,
    )

    await db.world_token_retry_reservations.update_one(
        {
            "reservation_id":
                reservation_id,
        },
        {
            "$set": {
                "token_payment_verified":
                    True,

                "wallet_tx_id":
                    spend[
                        "tx"
                    ].get(
                        "tx_id"
                    ),

                "paid_at":
                    _utcnow(),

                "status":
                    "paid_pending_entitlement",

                "updated_at":
                    _utcnow(),
            },
        },
    )

    # ---------------------------------------------------------
    # Grant exactly one entitlement AND release purchase lock.
    # ---------------------------------------------------------

    granted = (
        await db.world_token_retry_daily.find_one_and_update(
            {
                **holder_filter,

                "purchase_lock_reservation_id":
                    reservation_id,

                "entitlement_remaining": {
                    "$lte": 0,
                },
            },
            {
                "$set": {
                    "entitlement_remaining":
                        1,

                    "used":
                        False,

                    "token_cost":
                        token_cost,

                    "granted_reservation_id":
                        reservation_id,

                    "purchased_at":
                        _utcnow(),

                    "updated_at":
                        _utcnow(),
                },

                "$unset": {
                    "purchase_lock_reservation_id":
                        "",

                    "purchase_lock_acquired_at":
                        "",
                },
            },
            return_document=True,
        )
    )

    if not granted:
        # Determine whether entitlement was already granted during
        # a previous/replayed request.
        holder = await db.world_token_retry_daily.find_one(
            holder_filter
        )

        already_granted = bool(
            holder
            and holder.get(
                "granted_reservation_id"
            ) == reservation_id
            and int(
                holder.get(
                    "entitlement_remaining",
                    0,
                )
            ) > 0
        )

        if not already_granted:
            # Do not charge again. The wallet debit is already
            # idempotently associated with this reservation.
            await db.world_token_retry_reservations.update_one(
                {
                    "reservation_id":
                        reservation_id,
                },
                {
                    "$set": {
                        "status":
                            "paid_pending_entitlement",

                        "recovery_required":
                            True,

                        "updated_at":
                            _utcnow(),
                    },
                },
            )

            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "TOKEN_RETRY_RECOVERY_PENDING",

                    "message":
                        (
                            "Token payment is recorded and "
                            "entitlement recovery is pending. "
                            "The same payment will not be charged again."
                        ),

                    "reservation_id":
                        reservation_id,
                },
            )

    await db.world_token_retry_reservations.update_one(
        {
            "reservation_id":
                reservation_id,
        },
        {
            "$set": {
                "status":
                    "active",

                "entitlement_granted":
                    True,

                "activated_at":
                    _utcnow(),

                "recovery_required":
                    False,

                "updated_at":
                    _utcnow(),
            },
        },
    )

    return {
        "reserved":
            True,

        "purchased":
            True,

        "active":
            True,

        "reservation_id":
            reservation_id,

        "level":
            level,

        "token_cost":
            token_cost,

        "tokens_remaining":
            spend["tokens"],

        "idempotent_replay":
            spend.get(
                "idempotent_replay",
                False,
            ),

        "message":
            (
                "1 additional skill-game attempt is ready."
            ),
    }


# ===========================================================================
# TOKEN LEVEL UNLOCK Ã¢â‚¬â€ RESERVATION HOOK ONLY
# ===========================================================================


@router.post("/token/unlock/reserve")
async def reserve_world_level_unlock(
    body: WorldTokenUnlockInput,
    request: Request,
):
    """
    Purchase early access to ONE normal level.

    IMPORTANT:
    - previous level must already be completed
    - only the scheduled TIME lock is bypassed
    - contest must already be open
    - does not complete the level
    - does not award score
    - does not award a win
    - does not increase Champion stage
    """

    user = await get_current_user(
        request
    )

    db = get_db()

    level = int(
        body.level
    )

    if level < 2 or level > 10:
        raise HTTPException(
            status_code=400,
            detail=(
                "Token early unlock applies to "
                "normal Levels 2 through 10."
            ),
        )

    level_config = (
        await _effective_level_config(
            db,
            level,
        )
    )

    if not bool(
        level_config.get(
            "token_unlock_enabled",
            True,
        )
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "TOKEN_LEVEL_UNLOCK_DISABLED",

                "message":
                    (
                        "Token level unlock is disabled "
                        "for this level."
                    ),
            },
        )

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    completed_levels = set(
        int(x)
        for x in (
            progress.get(
                "completed_levels"
            )
            or []
        )
    )

    previous_level = (
        level - 1
    )

    if previous_level not in completed_levels:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "PREVIOUS_LEVEL_NOT_COMPLETED",

                "message":
                    (
                        f"Complete Level {previous_level} "
                        "before unlocking this level early."
                    ),
            },
        )

    access = await _resolve_unlock_context(
        db,
        level,
        progress,
    )

    if access.get(
        "available"
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "LEVEL_ALREADY_AVAILABLE",

                "message":
                    "This level is already available.",
            },
        )

    # Tokens bypass time only Ã¢â‚¬â€ never progression/start/closed rules.
    if access.get(
        "lock_reason"
    ) != "time":
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "TOKEN_CANNOT_BYPASS_THIS_LOCK",

                "message":
                    (
                        "A token can bypass only the "
                        "scheduled level-unlock timer."
                    ),

                "lock_reason":
                    access.get(
                        "lock_reason"
                    ),
            },
        )

    champion_stage = int(
        progress.get(
            "champion_stage",
            1,
        )
    )

    # Deterministic reservation = stable idempotency key.
    reservation_id = (
        f"WLU-{WORLD_SEASON_ID}-"
        f"{user['user_id']}-"
        f"C{champion_stage}-"
        f"L{level}"
    )

    now = _utcnow()

    token_cost = int(
        level_config.get(
            "token_unlock_cost",
            1,
        )
    )

    await db.world_level_unlock_reservations.update_one(
        {
            "reservation_id":
                reservation_id,
        },
        {
            "$setOnInsert": {
                "reservation_id":
                    reservation_id,

                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user["user_id"],

                "champion_stage":
                    champion_stage,

                "level":
                    level,

                "token_cost":
                    token_cost,

                "token_payment_verified":
                    False,

                "status":
                    "awaiting_token_verification",

                "created_at":
                    now,
            },
        },
        upsert=True,
    )

    reservation = (
        await db.world_level_unlock_reservations.find_one(
            {
                "reservation_id":
                    reservation_id,
            }
        )
    )

    if reservation.get(
        "status"
    ) == "active":
        wallet = await db.wallets.find_one(
            {
                "user_id":
                    user["user_id"],
            },
            {
                "_id": 0,
                "balance": 1,
            },
        )

        return {
            "reserved":
                True,

            "purchased":
                True,

            "active":
                True,

            "idempotent_replay":
                True,

            "reservation_id":
                reservation_id,

            "level":
                level,

            "token_cost":
                int(
                    reservation.get(
                        "token_cost",
                        token_cost,
                    )
                ),

            "tokens_remaining":
                int(
                    round(
                        (
                            wallet
                            or {}
                        ).get(
                            "balance",
                            0,
                        )
                    )
                ),

            "message":
                "This level is already token-unlocked.",
        }

    token_cost = int(
        reservation.get(
            "token_cost",
            token_cost,
        )
    )

    await db.world_level_unlock_reservations.update_one(
        {
            "reservation_id":
                reservation_id,
        },
        {
            "$set": {
                "status":
                    "charging",

                "updated_at":
                    now,
            }
        },
    )

    spend = await _apply_tx_idempotent(
        db,
        user["user_id"],
        "spend",
        -float(token_cost),
        note=(
            f"Free World Level {level} "
            f"early unlock"
        ),
        ref_order_id=
            reservation_id,
    )

    await db.world_level_unlock_reservations.update_one(
        {
            "reservation_id":
                reservation_id,
        },
        {
            "$set": {
                "token_payment_verified":
                    True,

                "wallet_tx_id":
                    spend[
                        "tx"
                    ].get(
                        "tx_id"
                    ),

                "paid_at":
                    _utcnow(),

                "status":
                    "paid_pending_unlock",

                "updated_at":
                    _utcnow(),
            }
        },
    )

    # Idempotent access grant.
    # NO completed_levels write occurs here.
    await db.world_progress.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        },
        {
            "$addToSet": {
                "token_unlocked_levels":
                    level,
            },

            "$set": {
                "updated_at":
                    _utcnow(),
            },
        },
        upsert=True,
    )

    await db.world_level_unlock_reservations.update_one(
        {
            "reservation_id":
                reservation_id,
        },
        {
            "$set": {
                "status":
                    "active",

                "unlock_granted":
                    True,

                "activated_at":
                    _utcnow(),

                "updated_at":
                    _utcnow(),
            }
        },
    )

    return {
        "reserved":
            True,

        "purchased":
            True,

        "active":
            True,

        "reservation_id":
            reservation_id,

        "level":
            level,

        "token_cost":
            token_cost,

        "tokens_remaining":
            spend["tokens"],

        "idempotent_replay":
            spend.get(
                "idempotent_replay",
                False,
            ),

        "message":
            (
                f"Level {level} is unlocked for play. "
                "The level is NOT marked completed."
            ),
    }


# ===========================================================================
# LEVEL ATTEMPT SUMMARY
# ===========================================================================


@router.get("/attempts/{level}")
async def free_world_level_attempt_summary(
    level: int,
    request: Request,
):
    user = await get_current_user(request)

    if level not in ROYAL_VILLAGE_LEVELS:
        raise HTTPException(
            status_code=404,
            detail="World level not found.",
        )

    db = get_db()

    status = await _free_attempt_status(
        db,
        user["user_id"],
        level,
    )

    best_time = await _world_best_verified_time(
        db,
        user["user_id"],
        level,
    )

    recent = await db.world_level_attempts.find(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            "level":
                level,
        },
        {
            "_id": 0,
        },
    ).sort(
        "created_at",
        -1,
    ).to_list(20)

    return {
        "level":
            level,

        "attempts":
            status,

        "best_verified_time_ms":
            best_time,

        "history": [
            _clean_doc(row)
            for row in recent
        ],
    }


# ===========================================================================
# CHAMPION PRIZE QUALIFICATION
# ===========================================================================



# ===========================================================================
# PAID-CONTEST QUALIFICATION EVIDENCE Ã¢â‚¬â€ SHADOW MODE
# ===========================================================================
#
# IMPORTANT:
# - READS the existing paid contest data only.
# - NEVER creates/modifies paid tickets, orders or contests.
# - NEVER changes paid game routes.
# - NEVER credits/debits wallet.
# - NEVER marks a user qualified by itself.
# - Enforcement remains controlled separately.
#
# A qualifying paid entry requires:
#   1. ticket belongs to this user
#   2. ticket is not refunded/disqualified
#   3. ticket has a real order_id
#   4. matching order belongs to this user
#   5. order is not refunded/cancelled/failed
#   6. order total is greater than zero
#   7. matching paid contest exists
#   8. paid entry occurred inside the applicable
#      Free World GLOBAL contest window
#
# This is deliberately fail-closed. Missing/legacy evidence does
# not silently qualify the player.


async def _paid_contest_qualification_evidence(
    db,
    user_id: str,
    global_contest_number: Optional[int] = None,
) -> dict:
    """
    Read-only authoritative paid-entry evidence resolver.

    It does NOT write world_prize_qualifications and does NOT
    alter any paid-contest collection.
    """

    if global_contest_number is None:
        world_contest = await _active_contest(
            db
        )
    else:
        world_contest = (
            await db.world_global_contests.find_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "contest_number":
                        int(
                            global_contest_number
                        ),
                },
                {
                    "_id": 0,
                },
            )
        )

    if not world_contest:
        return {
            "qualified": False,
            "reason":
                "world_contest_not_found",
            "global_contest_number":
                global_contest_number,
            "evidence": None,
        }

    resolved_contest_number = int(
        world_contest[
            "contest_number"
        ]
    )

    start_at = _ensure_aware_datetime(
        world_contest.get(
            "start_at"
        )
    )

    end_at = _ensure_aware_datetime(
        world_contest.get(
            "end_at"
        )
    )

    # A qualification window must be real and bounded.
    # Fail closed instead of accepting a ticket when timing
    # information is missing.
    if start_at is None:
        return {
            "qualified": False,
            "reason":
                "qualification_window_not_started",
            "global_contest_number":
                resolved_contest_number,
            "evidence": None,
        }

    ticket_query = {
        "user_id":
            user_id,

        "refunded": {
            "$ne": True,
        },

        "disqualified": {
            "$ne": True,
        },
    }

    tickets = await db.tickets.find(
        ticket_query,
        {
            "_id": 0,
            "ticket_id": 1,
            "contest_id": 1,
            "order_id": 1,
            "user_id": 1,
            "created_at": 1,
            "refunded": 1,
            "disqualified": 1,
        },
    ).sort(
        "created_at",
        -1,
    ).limit(
        500
    ).to_list(
        length=500
    )

    checked_ticket_count = 0

    rejected = {
        "missing_order_id": 0,
        "missing_order": 0,
        "invalid_order_status": 0,
        "non_paid_order": 0,
        "missing_paid_contest": 0,
        "missing_timestamp": 0,
        "outside_world_window": 0,
    }

    invalid_order_statuses = {
        "refunded",
        "cancelled",
        "canceled",
        "failed",
        "void",
        "voided",
    }

    for ticket in tickets:
        checked_ticket_count += 1

        order_id = ticket.get(
            "order_id"
        )

        paid_contest_id = ticket.get(
            "contest_id"
        )

        if not order_id:
            rejected[
                "missing_order_id"
            ] += 1
            continue

        order = await db.orders.find_one(
            {
                "order_id":
                    order_id,

                "user_id":
                    user_id,
            },
            {
                "_id": 0,
                "order_id": 1,
                "user_id": 1,
                "status": 1,
                "total": 1,
                "created_at": 1,
            },
        )

        if not order:
            rejected[
                "missing_order"
            ] += 1
            continue

        order_status = str(
            order.get(
                "status"
            )
            or ""
        ).strip().lower()

        if order_status in invalid_order_statuses:
            rejected[
                "invalid_order_status"
            ] += 1
            continue

        try:
            order_total = float(
                order.get(
                    "total"
                )
                or 0
            )
        except (
            TypeError,
            ValueError,
        ):
            order_total = 0.0

        # The requirement is participation in a PAID contest.
        # A zero-value/free order is not qualifying evidence.
        if order_total <= 0:
            rejected[
                "non_paid_order"
            ] += 1
            continue

        if not paid_contest_id:
            rejected[
                "missing_paid_contest"
            ] += 1
            continue

        paid_contest = await db.contests.find_one(
            {
                "contest_id":
                    paid_contest_id,
            },
            {
                "_id": 0,
                "contest_id": 1,
                "title": 1,
                "slug": 1,
                "status": 1,
                "entry_mode": 1,
                "game_type": 1,
                "price": 1,
            },
        )

        if not paid_contest:
            rejected[
                "missing_paid_contest"
            ] += 1
            continue

        occurred_at = (
            _ensure_aware_datetime(
                ticket.get(
                    "created_at"
                )
            )
            or
            _ensure_aware_datetime(
                order.get(
                    "created_at"
                )
            )
        )

        if occurred_at is None:
            rejected[
                "missing_timestamp"
            ] += 1
            continue

        if occurred_at < start_at:
            rejected[
                "outside_world_window"
            ] += 1
            continue

        if (
            end_at is not None
            and occurred_at >= end_at
        ):
            rejected[
                "outside_world_window"
            ] += 1
            continue

        # Valid read-only evidence found.
        return {
            "qualified": True,

            "reason":
                "verified_paid_contest_entry",

            "global_contest_number":
                resolved_contest_number,

            "world_window": {
                "start_at":
                    _serialize_datetime(
                        start_at
                    ),

                "end_at":
                    _serialize_datetime(
                        end_at
                    ),
            },

            "evidence": {
                "ticket_id":
                    ticket.get(
                        "ticket_id"
                    ),

                "order_id":
                    order_id,

                "paid_contest_id":
                    paid_contest_id,

                "paid_contest_title":
                    paid_contest.get(
                        "title"
                    ),

                "entry_mode":
                    paid_contest.get(
                        "entry_mode"
                    ),

                "game_type":
                    paid_contest.get(
                        "game_type"
                    ),

                "order_status":
                    order.get(
                        "status"
                    ),

                "order_total":
                    order_total,

                "entered_at":
                    _serialize_datetime(
                        occurred_at
                    ),
            },

            "checked_ticket_count":
                checked_ticket_count,

            "rejected":
                rejected,
        }

    return {
        "qualified": False,

        "reason":
            "no_verified_paid_contest_entry",

        "global_contest_number":
            resolved_contest_number,

        "world_window": {
            "start_at":
                _serialize_datetime(
                    start_at
                ),

            "end_at":
                _serialize_datetime(
                    end_at
                ),
        },

        "evidence":
            None,

        "checked_ticket_count":
            checked_ticket_count,

        "rejected":
            rejected,
    }


@router.get(
    "/champion/qualification-preview"
)
async def champion_qualification_preview(
    request: Request,
):
    """
    PRIVATE authenticated shadow-mode endpoint.

    Shows whether existing paid-ticket evidence WOULD satisfy
    Champion 3+ qualification.

    It does NOT enforce qualification and performs NO writes.
    """

    user = await get_current_user(
        request
    )

    db = get_db()

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    champion_stage = max(
        1,
        int(
            progress.get(
                "champion_stage",
                1,
            )
        ),
    )

    active = await _active_contest(
        db
    )

    global_contest_number = (
        int(
            active[
                "contest_number"
            ]
        )
        if active
        else None
    )

    evidence = (
        await _paid_contest_qualification_evidence(
            db,
            user["user_id"],
            global_contest_number,
        )
    )

    required = bool(
        champion_stage
        >= CHAMPION_PAID_QUALIFICATION_START_STAGE
    )

    return {
        "shadow_mode":
            True,

        "enforcement_enabled":
            bool(
                CHAMPION_PAID_QUALIFICATION_FEATURE_ENABLED
            ),

        "user_id":
            user["user_id"],

        "champion_stage":
            champion_stage,

        "qualification_required":
            required,

        # Champion 1-2 are product-rule exempt.
        # Champion 3+ would need verified paid evidence.
        "would_be_qualified":
            (
                True
                if not required
                else bool(
                    evidence.get(
                        "qualified"
                    )
                )
            ),

        "paid_entry_evidence":
            evidence,
    }



async def _enforce_champion_paid_qualification(
    db,
    user_id: str,
    champion_stage: int,
    global_contest_number: int,
) -> dict:
    """
    Free World Champion prize-level qualification gate.

    Champion 1-2:
      paid contest participation is not required.

    Champion 3+:
      at least one verified paid Prize League contest entry
      must exist inside the applicable GLOBAL World contest
      window.

    This helper is READ-ONLY against paid contest data.

    It does NOT:
      - modify paid tickets
      - modify paid orders
      - modify paid contests
      - modify paid game routes
      - modify wallet
      - advance World progression
      - award any prize
    """

    champion_stage = max(
        1,
        int(champion_stage),
    )

    if champion_stage < (
        CHAMPION_PAID_QUALIFICATION_START_STAGE
    ):
        return {
            "required": False,
            "qualified": True,
            "reason":
                "not_required_for_this_champion",
            "champion_stage":
                champion_stage,
            "global_contest_number":
                int(global_contest_number),
        }

    evidence = (
        await _paid_contest_qualification_evidence(
            db,
            user_id,
            int(global_contest_number),
        )
    )

    if not bool(
        evidence.get("qualified")
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code":
                    "CHAMPION_PAID_QUALIFICATION_REQUIRED",

                "message":
                    (
                        "Enter at least one paid Prize League "
                        "contest during this Championship "
                        "period to qualify for this Champion "
                        "prize challenge."
                    ),

                "champion_stage":
                    champion_stage,

                "global_contest_number":
                    int(
                        global_contest_number
                    ),

                "qualification_required":
                    True,

                "qualified":
                    False,

                "reason":
                    evidence.get(
                        "reason"
                    ),
            },
        )

    return {
        "required":
            True,

        "qualified":
            True,

        "reason":
            "verified_paid_contest_entry",

        "champion_stage":
            champion_stage,

        "global_contest_number":
            int(
                global_contest_number
            ),

        "evidence":
            evidence.get(
                "evidence"
            ),
    }


async def _champion_prize_qualification(
    db,
    user_id: str,
    champion_stage: int,
    global_contest_number: Optional[int] = None,
):
    """
    Champion 1-2:
      prize qualification automatically satisfied.

    Champion 3+:
      technical qualification field exists.

    Paid-contest participation lookup is deliberately NOT
    connected yet because paid contest routes/data are being
    protected from this Free World build.
    """

    if champion_stage < (
        CHAMPION_PAID_QUALIFICATION_START_STAGE
    ):
        return {
            "required": False,
            "qualified": True,
            "reason":
                "not_required_for_this_champion",
        }

    if not (
        CHAMPION_PAID_QUALIFICATION_FEATURE_ENABLED
    ):
        return {
            "required": True,

            # Not enforced while feature is disabled.
            "qualified": True,

            "enforcement_enabled": False,

            "reason":
                "qualification_feature_not_enabled",
        }

    record = await db.world_prize_qualifications.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user_id,

            "champion_stage":
                champion_stage,

            **(
                {
                    "global_contest_number":
                        global_contest_number
                }
                if global_contest_number is not None
                else {}
            ),
        },
        {
            "_id": 0,
        },
    )

    return {
        "required": True,
        "qualified": bool(
            record
            and record.get(
                "qualified"
            ) is True
        ),
        "enforcement_enabled": True,
        "record":
            _clean_doc(record),
    }


# ===========================================================================
# PUBLIC CHAMPION LEADERBOARD / RESULTS
# ===========================================================================


@public_router.get("/champion/leaderboard")
async def public_champion_leaderboard(
    contest_number: Optional[int] = None,
    limit: int = 500,
):
    """
    During LIVE contest:
      show all participants/ranks/badges.
      no provisional prize amount.

    After SETTLEMENT:
      top 5 show WINNER + final winning amount.

    Champion badge is public by product design.
    """

    db = get_db()

    if contest_number is None:
        contest = await _active_contest(db)

        if not contest:
            return {
                "contest": None,
                "leaderboard": [],
            }

        contest_number = int(
            contest["contest_number"]
        )
    else:
        contest = await db.world_global_contests.find_one(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "contest_number":
                    int(contest_number),
            },
            {
                "_id": 0,
            },
        )

    if not contest:
        raise HTTPException(
            status_code=404,
            detail="Champion Contest not found.",
        )

    rows = await db.world_champion_scores.find(
        {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                int(contest_number),

            # Only server-verified, leaderboard-eligible
            # Champion results may affect public ranking.
            "eligible":
                True,
        },
        {
            "_id": 0,
        },
    ).sort(
        [
            ("score", -1),
            ("duration_ms", 1),
            ("submitted_at", 1),
        ]
    ).to_list(
        max(
            1,
            min(
                int(limit),
                1000,
            ),
        )
    )

    settled = (
        contest.get("status")
        in (
            "settled",
            "closed_settled",
        )
    )

    # Resolve current account names so admin profile-name changes
    # are reflected on the public Champion leaderboard.
    user_ids = [
        row.get("user_id")
        for row in rows
        if row.get("user_id")
    ]
    current_names = {}
    if user_ids:
        async for current_user in db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "name": 1},
        ):
            current_names[current_user["user_id"]] = current_user.get("name")

    leaderboard = []

    for index, row in enumerate(
        rows,
        1,
    ):
        rank = index

        champion_stage = int(
            row.get(
                "champion_stage_snapshot",
                1,
            )
        )

        is_winner = bool(
            settled
            and rank <= CHAMPION_WINNER_COUNT
            and row.get(
                "prize_eligible",
                True,
            )
        )

        # LIVE provisional winning amount.
        #
        # Uses exactly the same authoritative prize formula
        # as final Champion settlement:
        #
        #   rank base prize x player's Champion stage
        #
        # Rank 1 = £50
        # Rank 2 = £20
        # Rank 3 = £15
        # Rank 4 = £10
        # Rank 5 = £5
        #
        # Rank 6+ currently has no winning amount.
        current_win = (
            _champion_final_prize(
                rank,
                champion_stage,
            )
            if rank <= CHAMPION_WINNER_COUNT
            else 0
        )

        item = {
            "rank":
                rank,

            "user_id":
                row.get(
                    "user_id"
                ),

            "user_name":
                current_names.get(
                    row.get("user_id")
                )
                or row.get(
                    "user_name"
                )
                or "Player",

            "score":
                row.get(
                    "score"
                ),

            "duration_ms":
                row.get(
                    "duration_ms"
                ),

            # Public personal Championship.
            "championship":
                champion_stage,

            "champion_badge": {
                "stage":
                    champion_stage,

                "label":
                    f"Champion {champion_stage}",
            },

            # LIVE display amount.
            # This moves automatically whenever rank changes.
            "current_win":
                current_win,

            "currency":
                WORLD_DEFAULT_CURRENCY,

            "winner":
                is_winner,
        }

        # After settlement the frozen winning_amount is
        # authoritative. Existing settlement logic is unchanged.
        if is_winner:
            item["winning_amount"] = (
                _champion_final_prize(
                    rank,
                    champion_stage,
                )
            )

        leaderboard.append(
            item
        )

    return {
        "contest": {
            "season_id":
                contest.get(
                    "season_id"
                ),

            "contest_number":
                contest.get(
                    "contest_number"
                ),

            "name":
                contest.get(
                    "name"
                ),

            "status":
                contest.get(
                    "status"
                ),

            "settled":
                settled,

            # Existing authoritative contest timestamps.
            # Frontend leaderboard countdown uses end_at.
            "start_at":
                contest.get(
                    "start_at"
                ),

            "end_at":
                contest.get(
                    "end_at"
                ),
        },

        "winner_count":
            CHAMPION_WINNER_COUNT,

        # Public calculation reference for the leaderboard UI.
        # These are BASE amounts; each player's personal
        # Championship multiplier is applied separately.
        "base_rank_prizes":
            CHAMPION_BASE_RANK_PRIZES,

        "leaderboard":
            leaderboard,
    }


@public_router.get("/champion-winners")
async def public_champion_winners():
    """
    Global Championship Winners ticker source.

    Returns ONLY the winners of the LATEST fully-finalized Championship,
    read from the immutable `world_winner_awards` ledger (status == "paid").
    Never uses provisional leaderboard positions and never recalculates
    prizes: the stored `winning_amount` is the source of truth.

    Auto-replacement is inherent: because we always select the highest
    `global_contest_number` that has paid awards, a newer settled
    Championship automatically supersedes the previous one.
    """
    db = get_db()

    latest = await db.world_winner_awards.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "status": "paid",
        },
        {"_id": 0, "global_contest_number": 1},
        sort=[("global_contest_number", -1)],
    )

    if not latest:
        return {"contest_number": None, "winners": []}

    contest_number = int(latest["global_contest_number"])

    awards = await db.world_winner_awards.find(
        {
            "season_id": WORLD_SEASON_ID,
            "global_contest_number": contest_number,
            "status": "paid",
        },
        {"_id": 0},
    ).sort("rank", 1).to_list(length=CHAMPION_WINNER_COUNT)

    # Resolve each winner's CURRENT public/display name from their profile
    # (matches the public leaderboard). The frozen award remains the source of
    # truth for user_id, rank, prize amount and Championship; only the display
    # name is refreshed. Falls back to the stored snapshot name if unavailable.
    award_user_ids = [a.get("user_id") for a in awards if a.get("user_id")]
    current_names = {}
    if award_user_ids:
        async for u in db.users.find(
            {"user_id": {"$in": award_user_ids}},
            {"_id": 0, "user_id": 1, "name": 1},
        ):
            if u.get("name"):
                current_names[u["user_id"]] = u["name"]

    winners = [
        {
            "rank": int(a.get("rank") or 0),
            "user_name": (
                current_names.get(a.get("user_id"))
                or a.get("user_name")
                or "Player"
            ),
            "prize_amount": float(a.get("winning_amount") or 0),
            "currency": a.get("currency") or WORLD_DEFAULT_CURRENCY,
        }
        for a in awards
    ]

    return {
        "contest_number": contest_number,
        "winners": winners,
    }



# ===========================================================================
# CHAMPION CONTEST SETTLEMENT
# ===========================================================================


async def _settle_world_champion_contest(
    db,
    contest_number: int,
) -> dict:
    """
    Recoverable / idempotent Champion settlement engine.

    State machine:

      closed
        -> freeze authoritative top-5 awards
        -> idempotent wallet credit
        -> verify wallet transaction
        -> finalize each award
        -> verify every award
        -> settled

    Safety:

    - Never settles an active/draft contest.
    - Uses only eligible Champion scores.
    - Ranking is authoritative:
        score DESC,
        duration_ms ASC,
        submitted_at ASC.
    - Award rows are protected by world_award_unique.
    - Wallet credits use deterministic idempotent references.
    - Crash after wallet credit is recoverable on replay.
    - Contest becomes settled only after every winner payment
      and award ledger row has been independently verified.
    """

    contest_number = int(
        contest_number
    )

    contest = await db.world_global_contests.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "contest_number":
                contest_number,
        },
        {
            "_id": 0,
        },
    )

    if not contest:
        raise HTTPException(
            status_code=404,
            detail={
                "code":
                    "WORLD_CONTEST_NOT_FOUND",

                "message":
                    "Champion Contest not found.",
            },
        )

    status = str(
        contest.get(
            "status"
        )
        or ""
    ).strip().lower()

    # Full-helper replay after successful settlement.
    if status in (
        "settled",
        "closed_settled",
    ):
        awards = await db.world_winner_awards.find(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "global_contest_number":
                    contest_number,
            },
            {
                "_id": 0,
            },
        ).sort(
            "rank",
            1,
        ).to_list(
            length=CHAMPION_WINNER_COUNT
        )

        return {
            "ok":
                True,

            "idempotent_replay":
                True,

            "contest_number":
                contest_number,

            "status":
                status,

            "award_count":
                len(awards),

            "settlement_total":
                float(
                    contest.get(
                        "settlement_total",
                        0,
                    )
                    or 0
                ),

            "currency":
                contest.get(
                    "settlement_currency"
                )
                or WORLD_DEFAULT_CURRENCY,
        }

    if status != "closed":
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "WORLD_CONTEST_NOT_CLOSED",

                "message":
                    (
                        "Champion settlement is allowed "
                        "only after the contest is closed."
                    ),

                "status":
                    status,
            },
        )

    winner_count = int(
        contest.get(
            "winner_count"
        )
        or CHAMPION_WINNER_COUNT
    )

    # Current product contract is exactly Top 5.
    if winner_count != CHAMPION_WINNER_COUNT:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "INVALID_CHAMPION_WINNER_COUNT",

                "message":
                    (
                        "Champion settlement currently "
                        "requires exactly five winners."
                    ),

                "winner_count":
                    winner_count,
            },
        )

    scores = await db.world_champion_scores.find(
        {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,

            "eligible":
                True,
        },
        {
            "_id": 0,
        },
    ).sort(
        [
            ("score", -1),
            ("duration_ms", 1),
            ("submitted_at", 1),
        ]
    ).limit(
        CHAMPION_WINNER_COUNT
    ).to_list(
        length=CHAMPION_WINNER_COUNT
    )

    if len(scores) != CHAMPION_WINNER_COUNT:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "INSUFFICIENT_CHAMPION_WINNERS",

                "message":
                    (
                        "Settlement requires five "
                        "eligible Champion results."
                    ),

                "eligible_winner_count":
                    len(scores),
            },
        )

    now = _utcnow()

    # -------------------------------------------------------
    # FREEZE AUTHORITATIVE AWARD LEDGER
    # -------------------------------------------------------

    for rank, score_row in enumerate(
        scores,
        start=1,
    ):
        user_id = str(
            score_row.get(
                "user_id"
            )
            or ""
        )

        if not user_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "INVALID_CHAMPION_SCORE",

                    "message":
                        (
                            "Winner score is missing "
                            "its user identity."
                        ),

                    "rank":
                        rank,
                },
            )

        champion_stage = max(
            1,
            int(
                score_row.get(
                    "champion_stage_snapshot",
                    1,
                )
            ),
        )

        base_rank_prize = int(
            CHAMPION_BASE_RANK_PRIZES[
                rank
            ]
        )

        winning_amount = (
            base_rank_prize
            * champion_stage
        )

        frozen_award = {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,

            "user_id":
                user_id,

            "user_name":
                score_row.get(
                    "user_name"
                )
                or "Player",

            "rank":
                rank,

            "score_id":
                score_row.get(
                    "score_id"
                ),

            "session_id":
                score_row.get(
                    "session_id"
                ),

            "score":
                int(
                    score_row.get(
                        "score",
                        0,
                    )
                ),

            "duration_ms":
                int(
                    score_row.get(
                        "duration_ms",
                        0,
                    )
                ),

            "champion_stage_snapshot":
                champion_stage,

            "base_rank_prize":
                base_rank_prize,

            "winning_amount":
                winning_amount,

            "currency":
                WORLD_DEFAULT_CURRENCY,

            "status":
                "frozen_unpaid",

            "wallet_credited":
                False,

            "wallet_ref":
                None,

            "frozen_at":
                now,
        }

        try:
            await db.world_winner_awards.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "global_contest_number":
                        contest_number,

                    "user_id":
                        user_id,
                },
                {
                    "$setOnInsert":
                        frozen_award,
                },
                upsert=True,
            )

        except Exception:
            # Unique award index may race with another
            # settlement call. Re-read authoritative row.
            pass

    awards = await db.world_winner_awards.find(
        {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,
        },
        {
            "_id": 0,
        },
    ).sort(
        "rank",
        1,
    ).to_list(
        length=CHAMPION_WINNER_COUNT + 1
    )

    if len(awards) != CHAMPION_WINNER_COUNT:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_AWARD_FREEZE_INCOMPLETE",

                "message":
                    (
                        "Winner award ledger could not "
                        "be frozen safely."
                    ),

                "award_count":
                    len(awards),
            },
        )

    # Immutable freeze verification.
    for rank, (
        score_row,
        award,
    ) in enumerate(
        zip(
            scores,
            awards,
        ),
        start=1,
    ):
        expected_stage = max(
            1,
            int(
                score_row.get(
                    "champion_stage_snapshot",
                    1,
                )
            ),
        )

        expected_base = int(
            CHAMPION_BASE_RANK_PRIZES[
                rank
            ]
        )

        expected_amount = (
            expected_base
            * expected_stage
        )

        if (
            int(
                award.get(
                    "rank",
                    -1,
                )
            )
            != rank
            or award.get(
                "user_id"
            )
            != score_row.get(
                "user_id"
            )
            or award.get(
                "score_id"
            )
            != score_row.get(
                "score_id"
            )
            or int(
                award.get(
                    "score",
                    -1,
                )
            )
            != int(
                score_row.get(
                    "score",
                    -2,
                )
            )
            or int(
                award.get(
                    "duration_ms",
                    -1,
                )
            )
            != int(
                score_row.get(
                    "duration_ms",
                    -2,
                )
            )
            or int(
                award.get(
                    "champion_stage_snapshot",
                    -1,
                )
            )
            != expected_stage
            or int(
                award.get(
                    "base_rank_prize",
                    -1,
                )
            )
            != expected_base
            or float(
                award.get(
                    "winning_amount",
                    -1,
                )
            )
            != float(
                expected_amount
            )
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_AWARD_FREEZE_MISMATCH",

                    "message":
                        (
                            "Frozen winner ledger does "
                            "not match authoritative ranking."
                        ),

                    "rank":
                        rank,
                },
            )

    # -------------------------------------------------------
    # WALLET CREDIT + RECOVERY-SAFE AWARD FINALIZATION
    # -------------------------------------------------------

    for award in awards:
        rank = int(
            award["rank"]
        )

        user_id = str(
            award["user_id"]
        )

        amount = float(
            award[
                "winning_amount"
            ]
        )

        ref = (
            f"WORLD-CHAMPION-"
            f"{contest_number}-"
            f"RANK-{rank}-"
            f"{user_id}"
        )

        # If award is already paid, we still verify the
        # deterministic wallet transaction below.
        if award.get(
            "status"
        ) != "paid":
            await _apply_tx_idempotent(
                db,
                user_id,
                "champion_prize",
                amount,
                note=(
                    f"Prize League Champion Contest "
                    f"{contest_number} "
                    f"Rank {rank} prize"
                ),
                ref_order_id=
                    ref,
            )

        # Resolve deterministic transaction using the
        # reference rather than trusting award state alone.
        wallet_tx = await db.wallet_tx.find_one(
            {
                "user_id":
                    user_id,

                "kind":
                    "champion_prize",

                "ref_order_id":
                    ref,
            },
            {
                "_id": 0,
            },
        )

        if not wallet_tx:
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_WALLET_HISTORY_MISSING",

                    "message":
                        (
                            "Champion wallet credit could "
                            "not be independently verified."
                        ),

                    "rank":
                        rank,
                },
            )

        if float(
            wallet_tx.get(
                "amount",
                0,
            )
        ) != amount:
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_WALLET_AMOUNT_MISMATCH",

                    "message":
                        (
                            "Champion wallet transaction "
                            "does not match frozen award."
                        ),

                    "rank":
                        rank,
                },
            )

        tx_id = wallet_tx.get(
            "tx_id"
        )

        if not tx_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_WALLET_TX_INVALID",

                    "message":
                        (
                            "Champion wallet transaction "
                            "has no transaction id."
                        ),

                    "rank":
                        rank,
                },
            )

        # Crash recovery:
        # wallet may already be credited while the award
        # is still frozen_unpaid.
        if award.get(
            "status"
        ) != "paid":
            result = await db.world_winner_awards.update_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "global_contest_number":
                        contest_number,

                    "user_id":
                        user_id,

                    "status":
                        "frozen_unpaid",

                    "wallet_credited":
                        False,
                },
                {
                    "$set": {
                        "status":
                            "paid",

                        "wallet_credited":
                            True,

                        "wallet_ref":
                            tx_id,

                        "paid_at":
                            _utcnow(),
                    }
                },
            )

            if result.modified_count != 1:
                refreshed = (
                    await db.world_winner_awards.find_one(
                        {
                            "season_id":
                                WORLD_SEASON_ID,

                            "global_contest_number":
                                contest_number,

                            "user_id":
                                user_id,
                        },
                        {
                            "_id": 0,
                        },
                    )
                )

                if (
                    not refreshed
                    or refreshed.get(
                        "status"
                    )
                    != "paid"
                    or refreshed.get(
                        "wallet_credited"
                    )
                    is not True
                    or refreshed.get(
                        "wallet_ref"
                    )
                    != tx_id
                ):
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code":
                                "CHAMPION_AWARD_FINALIZE_FAILED",

                            "message":
                                (
                                    "Winner award could "
                                    "not be finalized safely."
                                ),

                            "rank":
                                rank,
                        },
                    )

    # -------------------------------------------------------
    # FINAL SETTLEMENT GATE
    # -------------------------------------------------------

    final_awards = await db.world_winner_awards.find(
        {
            "season_id":
                WORLD_SEASON_ID,

            "global_contest_number":
                contest_number,
        },
        {
            "_id": 0,
        },
    ).sort(
        "rank",
        1,
    ).to_list(
        length=CHAMPION_WINNER_COUNT + 1
    )

    if len(
        final_awards
    ) != CHAMPION_WINNER_COUNT:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_SETTLEMENT_INCOMPLETE",

                "message":
                    (
                        "Contest cannot settle until "
                        "all five awards are complete."
                    ),
            },
        )

    settlement_total = 0.0

    for award in final_awards:
        rank = int(
            award.get(
                "rank",
                0,
            )
        )

        if (
            award.get(
                "status"
            )
            != "paid"
            or award.get(
                "wallet_credited"
            )
            is not True
            or not award.get(
                "wallet_ref"
            )
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_SETTLEMENT_UNPAID_AWARD",

                    "message":
                        (
                            "Contest cannot settle while "
                            "a winner payment is unverified."
                        ),

                    "rank":
                        rank,
                },
            )

        ref = (
            f"WORLD-CHAMPION-"
            f"{contest_number}-"
            f"RANK-{rank}-"
            f"{award['user_id']}"
        )

        tx = await db.wallet_tx.find_one(
            {
                "tx_id":
                    award[
                        "wallet_ref"
                    ],

                "user_id":
                    award[
                        "user_id"
                    ],

                "kind":
                    "champion_prize",

                "ref_order_id":
                    ref,
            },
            {
                "_id": 0,
            },
        )

        if not tx:
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_SETTLEMENT_TX_MISSING",

                    "message":
                        (
                            "Contest settlement failed "
                            "wallet verification."
                        ),

                    "rank":
                        rank,
                },
            )

        award_amount = float(
            award[
                "winning_amount"
            ]
        )

        if float(
            tx.get(
                "amount",
                0,
            )
        ) != award_amount:
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_SETTLEMENT_TX_MISMATCH",

                    "message":
                        (
                            "Winner payment amount does "
                            "not match frozen award."
                        ),

                    "rank":
                        rank,
                },
            )

        settlement_total += (
            award_amount
        )

    settlement_total = round(
        settlement_total,
        2,
    )

    settled_at = _utcnow()

    result = await db.world_global_contests.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "contest_number":
                contest_number,

            "status":
                "closed",
        },
        {
            "$set": {
                "status":
                    "settled",

                "settled_at":
                    settled_at,

                "settlement_award_count":
                    CHAMPION_WINNER_COUNT,

                "settlement_total":
                    settlement_total,

                "settlement_currency":
                    WORLD_DEFAULT_CURRENCY,

                "updated_at":
                    settled_at,
            }
        },
    )

    if result.modified_count != 1:
        refreshed_contest = (
            await db.world_global_contests.find_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "contest_number":
                        contest_number,
                },
                {
                    "_id": 0,
                },
            )
        )

        if (
            not refreshed_contest
            or refreshed_contest.get(
                "status"
            )
            not in (
                "settled",
                "closed_settled",
            )
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code":
                        "CHAMPION_CONTEST_SETTLE_FAILED",

                    "message":
                        (
                            "Champion Contest could "
                            "not be finalized safely."
                        ),
                },
            )

    return {
        "ok":
            True,

        "idempotent_replay":
            False,

        "contest_number":
            contest_number,

        "status":
            "settled",

        "award_count":
            CHAMPION_WINNER_COUNT,

        "settlement_total":
            settlement_total,

        "currency":
            WORLD_DEFAULT_CURRENCY,

        "awards": [
            _clean_doc(
                award
            )
            for award in final_awards
        ],
    }


@admin_router.post(
    "/contests/{contest_number}/settle"
)
async def settle_admin_world_contest(
    contest_number: int,
    request: Request,
):
    """
    Explicit admin settlement action.

    Real production endpoint accepts only seeded
    Champion Contest numbers 1-100.
    """

    admin = await require_admin(
        request
    )

    if (
        contest_number < 1
        or contest_number >
            WORLD_CONTEST_COUNT
    ):
        raise HTTPException(
            status_code=404,
            detail="Champion Contest not found.",
        )

    db = get_db()

    result = await _settle_world_champion_contest(
        db,
        contest_number,
    )

    result["settled_by"] = (
        admin.get(
            "user_id"
        )
    )

    return result




# ===========================================================================
# CHAMPION PROGRESSION AFTER CONTEST CLOSE
# ===========================================================================


@router.post("/level/{level}/skip")
async def free_world_skip_level(level: int, request: Request):
    """
    Catch-up SKIP for OLD users who fell behind when a newer Championship
    started. Server-validated: only eligible catch-up users may skip, and only
    the next un-passed level in sequence.

    SKIP does NOT create a score, grant any reward, or consume a free attempt
    or token. It only advances personal progression and is recorded for audit.
    """
    from deps import get_db

    user = await get_current_user(request)
    db = get_db()
    user_id = user["user_id"]

    progress = await _free_world_progress(db, user_id)

    stage = int(progress.get("champion_stage") or 1)
    started = int(progress.get("free_world_started_global_contest") or 1)

    active = await _active_contest(db)
    active_number = (
        int(active.get("contest_number"))
        if active and active.get("contest_number")
        else None
    )

    # Eligibility: user must be an OLD user behind the live Championship.
    eligible = bool(
        active_number is not None
        and stage < active_number
        and started <= stage
    )
    if not eligible:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "SKIP_NOT_ELIGIBLE",
                "message": "Level skip is only available for catch-up.",
            },
        )

    if level < 1 or level > 10:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_LEVEL", "message": "Invalid level."},
        )

    if stage == 1 and level == 10:
        raise HTTPException(
            status_code=409,
            detail={"code": "CHAMPION_PLAY_REQUIRED", "message": "Championship 1 Level 10 cannot be skipped."},
        )

    completed_levels = set(
        int(x) for x in (progress.get("completed_levels") or [])
    )
    if level in completed_levels:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "LEVEL_ALREADY_COMPLETED",
                "message": "That level is already completed.",
            },
        )

    next_level = _next_unpassed_level(progress)
    if level != next_level:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "SKIP_OUT_OF_ORDER",
                "message": "You can only skip the next level in sequence.",
                "next_level": next_level,
            },
        )

    now = _utcnow()

    skipped_levels = [
        int(x) for x in (progress.get("skipped_levels") or [])
    ]
    if level not in skipped_levels:
        skipped_levels.append(level)

    patch = {
        "skipped_levels": sorted(skipped_levels),
        "updated_at": now,
    }

    if level < 10:
        patch["highest_unlocked_level"] = max(
            int(progress.get("highest_unlocked_level", 1) or 1),
            level + 1,
        )
        patch["current_level"] = level + 1
        champion_ready = bool(progress.get("champion_ready", False))
    else:
        # Catch-up rule: SKIPPING Level 10 completes this OLD personal
        # Championship for progression purposes and moves directly to Level 1
        # of the next personal Championship. There is deliberately NO separate
        # Champion-level Skip button.
        #
        # If the next stage is the currently-live Championship, catch-up ends
        # immediately there: Level 1 is normal play and Skip disappears.
        next_stage = stage + 1

        if next_stage > WORLD_CONTEST_COUNT:
            patch["champion_stage"] = WORLD_CONTEST_COUNT
            patch["champion_ready"] = False
            patch["season_complete"] = True
            patch["current_level"] = 10
            champion_ready = False
        else:
            patch.update(
                {
                    "champion_stage": next_stage,
                    "champion_ready": False,
                    "current_level": 1,
                    "highest_unlocked_level": 1,
                    "completed_levels": [],
                    "skipped_levels": [],
                    "token_unlocked_levels": [],
                    "personal_stage_started_at": now,
                }
            )
            champion_ready = False

    await db.world_progress.update_one(
        {"season_id": WORLD_SEASON_ID, "user_id": user_id},
        {"$set": patch},
    )

    await db.world_level_skips.insert_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "champion_stage": stage,
            "level": level,
            "skipped_at": now,
        }
    )

    return {
        "skipped": level,
        "champion_stage": int(patch.get("champion_stage", stage)),
        "current_level": patch["current_level"],
        "champion_ready": champion_ready,
        "next_level": _next_unpassed_level(
            {
                "completed_levels": list(completed_levels),
                "skipped_levels": skipped_levels,
            }
        ),
    }



@router.post("/champion/continue")
async def continue_after_champion(
    request: Request,
):
    """
    A user does NOT have to win, qualify or participate
    in the Champion prize level to continue.

    Progression unlocks only when the relevant global
    Champion contest has closed.

    This endpoint does not award a prize.
    """

    user = await get_current_user(request)
    db = get_db()

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    champion_stage = int(
        progress.get(
            "champion_stage",
            1,
        )
    )

    if not bool(
        progress.get(
            "champion_ready",
            False,
        )
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_NOT_READY",

                "message":
                    "Complete the normal progression first.",
            },
        )

    # C1 cannot be bypassed: the user must actually submit their personal
    # Championship 1 Champion Challenge before moving to Championship 2.
    if champion_stage == 1:
        submitted_c1 = await db.world_champion_sessions.find_one(
            {
                "season_id": WORLD_SEASON_ID,
                "user_id": user["user_id"],
                "champion_stage_snapshot": 1,
                "status": "submitted",
            },
            {"_id": 1},
        )
        if not submitted_c1:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "CHAMPION_PLAY_REQUIRED",
                    "message": "Play and submit Championship 1 Champion Challenge before entering Championship 2.",
                },
            )

    # The user may advance only when THEIR matching global
    # Championship has closed. A later closed Championship must
    # never unlock an earlier personal Champion stage.
    stage_contest = await db.world_global_contests.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "contest_number":
                champion_stage,

            "status": {
                "$in": [
                    "closed",
                    "settled",
                    "closed_settled",
                ]
            },
        },
        {
            "_id": 0,
        },
    )

    if not stage_contest:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_PERIOD_NOT_CLOSED",

                "message":
                    (
                        "Your current Champion stage "
                        "has not closed yet."
                    ),

                "champion_stage":
                    champion_stage,
            },
        )

    now = _utcnow()

    # The personal map does not enter the next Championship until exactly
    # 48 hours after this user's Champion opens.  The Champion itself closes
    # after 46 hours, leaving the intended two-hour transition gap.  This does
    # not alter the global leaderboard/settlement schedule.
    active_contest = await _active_contest(db)
    personal_transition = _personal_champion_transition_schedule(
        progress,
        active_contest,
    )
    personal_next_open = _ensure_aware_datetime(
        personal_transition.get("next_start_at")
    )
    if personal_next_open is not None and now < personal_next_open:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "NEXT_CHAMPIONSHIP_NOT_OPEN",
                "message": "Your next Championship Level 1 is not open yet.",
                "champion_stage": champion_stage,
                "next_level_opens_at": _serialize_datetime(personal_next_open),
            },
        )

    # -------------------------------------------------------
    # FINAL CHAMPIONSHIP
    # -------------------------------------------------------
    #
    # Stage 100 has no Stage 101. Completing the final
    # Champion period completes Season 1 and must NOT reset
    # the player back to Stage 100 / Level 1.
    # -------------------------------------------------------

    if champion_stage >= WORLD_CONTEST_COUNT:
        result = await db.world_progress.update_one(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user["user_id"],

                "champion_stage":
                    champion_stage,

                "champion_ready":
                    True,
            },
            {
                "$set": {
                    "champion_stage":
                        WORLD_CONTEST_COUNT,

                    "champion_ready":
                        False,

                    "season_complete":
                        True,

                    "season_completed_at":
                        now,

                    "updated_at":
                        now,
                }
            },
        )

        if result.modified_count == 0:
            refreshed = await db.world_progress.find_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "user_id":
                        user["user_id"],
                }
            )

            if not (
                refreshed
                and bool(
                    refreshed.get(
                        "season_complete",
                        False,
                    )
                )
            ):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code":
                            "CHAMPION_PROGRESS_CHANGED",

                        "message":
                            (
                                "Champion progression changed "
                                "while completing the Season. "
                                "Refresh and try again."
                            ),
                    },
                )

        return {
            "continued":
                True,

            "season_complete":
                True,

            "previous_champion_stage":
                champion_stage,

            "champion_stage":
                WORLD_CONTEST_COUNT,

            "prize_required_to_continue":
                False,

            "participation_required_to_continue":
                False,

            "qualification_required_to_continue":
                False,
        }

    next_stage = champion_stage + 1

    result = await db.world_progress.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            # Atomic progression guard prevents two concurrent
            # Continue requests from advancing two stages.
            "champion_stage":
                champion_stage,

            "champion_ready":
                True,
        },
        {
            "$set": {
                "champion_stage":
                    next_stage,

                "champion_ready":
                    False,

                "season_complete":
                    False,

                # New Championship starts from Level 1 of its
                # own 10-level normal progression.
                "current_level":
                    1,

                "highest_unlocked_level":
                    1,

                "completed_levels":
                    [],

                # Reset personal-progression state for the new stage: fresh
                # daily anchor (00:00 Europe/London aligned) and no skips.
                "skipped_levels":
                    [],

                "personal_stage_started_at":
                    now,

                # Token unlocks belong to the previous personal Championship's
                # levels; clear them so a C1 token unlock never opens C2's
                # same-numbered level.
                "token_unlocked_levels":
                    [],

                "updated_at":
                    now,
            },

            "$unset": {
                "season_completed_at":
                    "",
            },
        },
    )

    if result.modified_count != 1:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_PROGRESS_CHANGED",

                "message":
                    (
                        "Champion progression changed while "
                        "continuing. Refresh and try again."
                    ),
            },
        )

    # Fresh free attempts per personal Championship: clear the live attempt
    # COUNTERS (tallies) for this user so the new stage's Levels 1-10 start
    # with their configured free attempts and never inherit the previous
    # Championship's exhausted counters. Historical per-attempt records in
    # `world_level_attempts` are preserved for audit.
    await db.world_attempt_counters.delete_many(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user["user_id"],
        }
    )

    return {
        "continued":
            True,

        "season_complete":
            False,

        "previous_champion_stage":
            champion_stage,

        "champion_stage":
            next_stage,

        "prize_required_to_continue":
            False,

        "participation_required_to_continue":
            False,

        "qualification_required_to_continue":
            False,
    }


# ===========================================================================
# FREE WORLD - LEVEL ACCESS / TIMING
# ===========================================================================


@router.get("/access")
async def free_world_access(
    request: Request,
):
    user = await get_current_user(
        request
    )

    db = get_db()

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    active = await _active_contest(
        db
    )

    champion_stage = int(
        progress.get(
            "champion_stage",
            1,
        )
    )

    setting = await db.world_settings.find_one(
        {
            "_id":
                "active_global_contest",

            "season_id":
                WORLD_SEASON_ID,
        }
    )

    season_start = _ensure_aware_datetime(
        (setting or {}).get(
            "season_start_at"
        )
    )

    champion_schedule = _personal_champion_transition_schedule(
        progress,
        active,
    )

    levels = []

    for level in range(
        1,
        11,
    ):
        config = await _effective_level_config(
            db,
            level,
            int(progress.get("champion_stage") or 1),
        )

        access = await _resolve_unlock_context(
            db,
            level,
            progress,
        )

        levels.append(
            {
                "level":
                    level,

                "location_name":
                    config.get(
                        "location_name"
                    ),

                "game_id":
                    config.get(
                        "game_id"
                    ),

                **access,
            }
        )

    return {
        "season_id":
            WORLD_SEASON_ID,

        "timezone":
            WORLD_TIMEZONE,

        "active_contest":
            (
                _contest_public(
                    active
                )
                if active
                else None
            ),

        "personal_champion_stage":
            champion_stage,

        "champion_opens_at":
            (
                champion_schedule[
                    "champion_opens_at"
                ]
                if champion_schedule
                else None
            ),

        "champion_closes_at":
            (
                champion_schedule[
                    "champion_closes_at"
                ]
                if champion_schedule
                else None
            ),

        "next_level_opens_at":
            (
                champion_schedule[
                    "next_start_at"
                ]
                if champion_schedule
                else None
            ),

        "levels":
            levels,
    }