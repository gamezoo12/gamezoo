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
WORLD_CONTEST_COUNT = 50
WORLD_DEFAULT_CURRENCY = "GBP"

# Champion prize distribution.
#
# Final payout:
#   base rank prize Ã— PERSONAL Champion stage.
#
# Champion 1:
#   1st Â£50
#   2nd Â£20
#   3rd Â£15
#   4th Â£10
#   5th Â£5
#
# Champion 9 example:
#   4th = Â£10 Ã— 9 = Â£90
CHAMPION_BASE_RANK_PRIZES = {
    1: 50,
    2: 20,
    3: 15,
    4: 10,
    5: 5,
}

CHAMPION_WINNER_COUNT = 5

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
        return value.isoformat()
    return value


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
    contest_number: int = Field(
        ...,
        ge=1,
        le=WORLD_CONTEST_COUNT,
    )

    start_at: datetime
    end_at: datetime


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

    await db.world_attempt_counters.create_index(
        [
            ("season_id", 1),
            ("user_id", 1),
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

    await db.world_token_retry_daily.create_index(
        [
            ("season_id", 1),
            ("user_id", 1),
            ("level", 1),
        ],
        unique=True,
        name="world_token_retry_daily_unique",
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
    Creates the 50 contest HOLDERS and 50 personal prize stages.

    IMPORTANT:
    - Does NOT activate a contest.
    - Does NOT create scores.
    - Does NOT create winners.
    - Does NOT credit wallets.

    Contest 1 is pre-configured with Number Sequence because that is
    the first game currently being built.
    Contests 2-50 remain unconfigured until admin assigns their games.
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
                if number == 1
                else None
            ),
            "game_config": (
                {"target_number": 100}
                if number == 1
                else {}
            ),
            "winner_count": None,
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
        if number == 1:
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

                    "champion_config": {
                        "$exists": False,
                    },
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
            # Stage 1 = Â£100 ... Stage 50 = Â£5,000.
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

    if body.end_at <= body.start_at:
        raise HTTPException(
            status_code=400,
            detail=(
                "Contest end time must be "
                "after start time."
            ),
        )

    contest = await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number":
                body.contest_number,
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
        body.start_at
    )
    incoming_end = _ensure_aware_datetime(
        body.end_at
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
                "$ne": body.contest_number
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
                body.contest_number,
        },
        {
            "$set": {
                "status": "active",
                "start_at": body.start_at,
                "end_at": body.end_at,
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
                "contest_number":
                    body.contest_number,
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
                    body.contest_number,
                "start_at": body.start_at,
                "end_at": body.end_at,
                "at": now,
            }
        )

    updated = await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number":
                body.contest_number,
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


# ===========================================================================
# FREE WORLD PROGRESSION LEVELS â€” ROYAL VILLAGE
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
        "game_config": {
            "target_number": 20,
        },
        "time_limit_seconds": 25,
        "initial_free_attempts": 3,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    2: {
        "level": 2,
        "arena": 1,
        "location_name": "Market Square",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 25,
        },
        "time_limit_seconds": 27,
        "initial_free_attempts": 3,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    3: {
        "level": 3,
        "arena": 1,
        "location_name": "Royal Farm",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 30,
        },
        "time_limit_seconds": 30,
        "initial_free_attempts": 3,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    4: {
        "level": 4,
        "arena": 1,
        "location_name": "Riverside Trail",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 35,
        },
        "time_limit_seconds": 32,
        "initial_free_attempts": 3,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    5: {
        "level": 5,
        "arena": 1,
        "location_name": "King's Bridge",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 40,
        },
        "time_limit_seconds": 35,
        "initial_free_attempts": 3,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    6: {
        "level": 6,
        "arena": 1,
        "location_name": "Whispering Woods",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 45,
        },
        "time_limit_seconds": 38,
        "initial_free_attempts": 1,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    7: {
        "level": 7,
        "arena": 1,
        "location_name": "Ancient Ruins",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 50,
        },
        "time_limit_seconds": 42,
        "initial_free_attempts": 1,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    8: {
        "level": 8,
        "arena": 1,
        "location_name": "Watchtower Pass",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 60,
        },
        "time_limit_seconds": 48,
        "initial_free_attempts": 1,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    9: {
        "level": 9,
        "arena": 1,
        "location_name": "Castle Crossing",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 75,
        },
        "time_limit_seconds": 55,
        "initial_free_attempts": 1,
        "refresh_attempts": 0,
        "refresh_hours": 24,
        "token_retry_enabled": True,
    },

    10: {
        "level": 10,
        "arena": 1,
        "location_name": "Royal Gate",
        "game_id": "number_sequence",
        "game_config": {
            "target_number": 90,
        },
        "time_limit_seconds": 65,
        "initial_free_attempts": 1,
        "refresh_attempts": 0,
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
        "target_number": 100,
    },
    "time_limit_seconds": 75,
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

        "token_unlock_enabled":
            True,

        "token_unlock_cost":
            1,

        # Used later by the Championship cycle scheduler.
        # It does NOT currently auto-unlock the level.
        "unlock_after_days":
            max(
                0,
                (level - 1) * 2,
            ),
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
            int(
                ROYAL_VILLAGE_CHAMPION[
                    "time_limit_seconds"
                ]
            ),

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
                    "must be 5â€“900 seconds."
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
                3 if level <= 5 else 1,
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
                (level - 1) * 2,
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

                # No automatic free refresh in the
                # current revised attempt model.
                "refresh_attempts":
                    0,

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

    time_limit = int(
        raw.get(
            "time_limit_seconds",
            75,
        )
    )

    if (
        time_limit < 5
        or time_limit > 1800
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Champion time limit must be "
                "5â€“1800 seconds."
            ),
        )

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

    unlock_at = (
        start_at
        + timedelta(
            days=unlock_after_days
        )
    )

    scheduled_time_available = (
        now >= unlock_at
    )

    # A purchased unlock bypasses only this level's scheduled
    # time gate. Contest-open and progression requirements remain.
    time_available = bool(
        scheduled_time_available
        or token_unlocked
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
        level <= highest_unlocked
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


async def _assert_world_level_available(
    db,
    level: int,
    progress: dict,
):
    state = await _world_unlock_context(
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
) -> dict:
    """
    Active GLOBAL contest determines the game/config every user
    receives.

    If there is no active global contest, retain the original
    Royal Village defaults so development/local World still works.
    """

    default = _default_world_level_config(
        level
    )

    active = await _active_contest(
        db
    )

    if not active:
        return default

    rows = active.get(
        "levels_config"
    )

    if not isinstance(
        rows,
        list,
    ):
        return default

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
        return default

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

    return merged


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

        if "token_unlocked_levels" not in progress:
            patch["token_unlocked_levels"] = []

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

    progress = {
        "season_id": WORLD_SEASON_ID,
        "user_id": user_id,

        "current_level": 1,
        "highest_unlocked_level": 1,
        "completed_levels": [],

        "champion_stage": 1,
        "champion_ready": False,

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
    config = await _effective_level_config(db, level)

    counter = await db.world_attempt_counters.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
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
        "level": level,

        "initial_remaining":
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

    config = await _effective_level_config(
        db,
        level,
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

            "level":
                level,

            "initial_remaining":
                int(
                    config.get(
                        "initial_free_attempts",
                        3 if level <= 5 else 1,
                    )
                ),

            "next_free_at":
                None,
        }

    initial_remaining = max(
        0,
        int(
            counter.get(
                "initial_remaining",
                config.get(
                    "initial_free_attempts",
                    3 if level <= 5 else 1,
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
                    3 if level <= 5 else 1,
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
    else:
        # Public viewing state only.
        # No guest progress is created or persisted.
        progress = {
            "current_level": 1,
            "highest_unlocked_level": 1,
            "completed_levels": [],
            "champion_stage": 1,
            "champion_ready": False,
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

    current_config = (
        await _effective_level_config(
            db,
            current_level,
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
        await _world_unlock_context(
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
            )
        )

        level_unlock = (
            await _world_unlock_context(
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

    return {
        "season_id": WORLD_SEASON_ID,
        "arena": 1,
        "arena_name": "Royal Village",

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

    config = await _effective_level_config(db, level)

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
# FREE WORLD â€” CHAMPION CONTEST GAMEPLAY
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

        # GLOBAL â€” decides game everyone plays.
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

    counter = await db.world_champion_attempt_counters.find_one(
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

    initial_attempts = 3

    if not counter:
        return {
            "initial_attempts":
                initial_attempts,

            "attempts_remaining":
                initial_attempts,
        }

    remaining = max(
        0,
        int(
            counter.get(
                "attempts_remaining",
                initial_attempts,
            )
        ),
    )

    return {
        "initial_attempts":
            initial_attempts,

        "attempts_remaining":
            remaining,
    }


async def _consume_champion_attempt(
    db,
    user_id: str,
    contest_number: int,
):
    """
    Atomically consume one Champion attempt.

    No token retry is connected here yet.
    """

    now = _utcnow()

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

                "created_at":
                    now,
            }
        },
        upsert=True,
    )

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

    if not result:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "NO_CHAMPION_ATTEMPTS",

                "message":
                    (
                        "No Champion attempts remain "
                        "for this contest."
                    ),
            },
        )

    return max(
        0,
        int(
            result.get(
                "attempts_remaining",
                0,
            )
        ),
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

    game_id = contest.get(
        "game_id"
    )

    # First real Champion game currently supported.
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

    if (
        int(
            attempts[
                "attempts_remaining"
            ]
        )
        < 1
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "NO_CHAMPION_ATTEMPTS",

                "message":
                    (
                        "No Champion attempts remain "
                        "for this contest."
                    ),
            },
        )

    game_config = dict(
        contest.get(
            "game_config"
        ) or {}
    )

    target = int(
        game_config.get(
            "target_number",
            100,
        )
    )

    # Champion Number Sequence stays 1â€“100.
    target = max(
        5,
        min(
            100,
            target,
        ),
    )

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

            "time_limit_seconds":
                int(
                    session[
                        "time_limit_seconds"
                    ]
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

        "time_limit_seconds":
            int(
                session[
                    "time_limit_seconds"
                ]
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

    time_limit_ms = (
        int(
            session[
                "time_limit_seconds"
            ]
        )
        * 1000
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

    # Higher is better.
    score = (
        max(
            0,
            time_limit_ms
            - body.duration_ms,
        )
        if passed
        else 0
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
                body.duration_ms,

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
                and body.duration_ms
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
                and body.duration_ms
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
                                    body.duration_ms
                            },
                        },

                        {
                            "score":
                                score,

                            "duration_ms":
                                body.duration_ms,

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
            body.duration_ms,

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
# PHASE 2C REVISED â€” TOKEN / BEST-TIME / CHAMPION RULES
# ===========================================================================


class WorldTokenRetryInput(BaseModel):
    level: int = Field(
        ...,
        ge=1,
        le=10,
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
) -> int:
    """
    Example:
      rank 4 base = Â£10
      Champion 9
      final = Â£90
    """
    return (
        _champion_rank_base_prize(rank)
        * max(1, int(champion_stage))
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
# TOKEN RETRY â€” RESERVATION HOOK ONLY
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

    config = await _effective_level_config(
        db,
        level,
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

    holder_filter = {
        "season_id":
            WORLD_SEASON_ID,

        "user_id":
            user_id,

        "level":
            level,
    }

    # Ensure the one-per-user/level entitlement holder exists.
    await db.world_token_retry_daily.update_one(
        holder_filter,
        {
            "$setOnInsert": {
                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user_id,

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
            f"Free World Level {level} "
            f"token retry"
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
# TOKEN LEVEL UNLOCK â€” RESERVATION HOOK ONLY
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

    access = await _world_unlock_context(
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

    # Tokens bypass time only â€” never progression/start/closed rules.
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
# PAID-CONTEST QUALIFICATION EVIDENCE â€” SHADOW MODE
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

        item = {
            "rank":
                rank,

            "user_id":
                row.get(
                    "user_id"
                ),

            "user_name":
                row.get(
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

            "champion_badge": {
                "stage":
                    champion_stage,

                "label":
                    f"Champion {champion_stage}",
            },

            "winner":
                is_winner,
        }

        # Prize appears only AFTER settlement.
        if is_winner:
            item["winning_amount"] = (
                _champion_final_prize(
                    rank,
                    champion_stage,
                )
            )

            item["currency"] = (
                WORLD_DEFAULT_CURRENCY
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
        },

        "winner_count":
            CHAMPION_WINNER_COUNT,

        "base_rank_prizes":
            (
                CHAMPION_BASE_RANK_PRIZES
                if settled
                else None
            ),

        "leaderboard":
            leaderboard,
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
    Champion Contest numbers 1-50.
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

    latest_contest = await db.world_global_contests.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

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
        sort=[
            ("contest_number", -1),
        ],
    )

    if not latest_contest:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "CHAMPION_PERIOD_NOT_CLOSED",

                "message":
                    (
                        "The Champion prize period "
                        "has not closed yet."
                    ),
            },
        )

    next_stage = min(
        WORLD_CONTEST_COUNT,
        champion_stage + 1,
    )

    now = _utcnow()

    await db.world_progress.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],
        },
        {
            "$set": {
                "champion_stage":
                    next_stage,

                "champion_ready":
                    False,

                # New Championship starts from its
                # next normal progression segment.
                # Current Royal Village renderer still
                # displays its local 1-10 map.
                "current_level":
                    1,

                "highest_unlocked_level":
                    1,

                "completed_levels":
                    [],

                "updated_at":
                    now,
            }
        },
    )

    return {
        "continued":
            True,

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
# FREE WORLD â€” LEVEL ACCESS / TIMING
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

    levels = []

    for level in range(
        1,
        11,
    ):
        config = await _effective_level_config(
            db,
            level,
        )

        access = await _world_unlock_context(
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
            int(
                progress.get(
                    "champion_stage",
                    1,
                )
            ),

        "levels":
            levels,
    }
