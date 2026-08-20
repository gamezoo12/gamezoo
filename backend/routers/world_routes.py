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
#   base rank prize × PERSONAL Champion stage.
#
# Champion 1:
#   1st £50
#   2nd £20
#   3rd £15
#   4th £10
#   5th £5
#
# Champion 9 example:
#   4th = £10 × 9 = £90
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
        name="world_scores_user_lookup",
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

    await db.world_token_retry_reservations.create_index(
        [
            ("season_id", 1),
            ("user_id", 1),
            ("level", 1),
            ("day_key", 1),
        ],
        unique=True,
        name="world_token_retry_reservation_daily_unique",
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

        prize_defaults = {
            "season_id": WORLD_SEASON_ID,
            "champion_stage": number,

            # Locked product rule:
            # Stage 1 = £100 ... Stage 50 = £5,000.
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

    if not contest.get("game_id"):
        raise HTTPException(
            status_code=409,
            detail=(
                "Assign a game before activating "
                "this Champion Contest."
            ),
        )

    winner_count = contest.get(
        "winner_count"
    )

    if (
        not isinstance(winner_count, int)
        or winner_count < 1
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Set the winner count before "
                "activating this contest."
            ),
        )

    now = _utcnow()

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
# FREE WORLD PROGRESSION LEVELS — ROYAL VILLAGE
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
    config = ROYAL_VILLAGE_LEVELS[level]

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


async def _free_attempt_status(
    db,
    user_id: str,
    level: int,
):
    """
    Revised Free World attempt model:

    Levels 1-5:
      3 initial free attempts per level.

    Levels 6-10:
      1 initial free attempt per level.

    Once initial free attempts are exhausted:
      Free attempt count stays at 0.

    Token retry is a separate entitlement.
    Actual token deduction is NOT connected yet.

    One token-retry entitlement can be used per
    Europe/London calendar day once the real token
    system is connected.
    """

    config = ROYAL_VILLAGE_LEVELS[level]

    counter = await _free_attempt_counter(
        db,
        user_id,
        level,
    )

    initial_remaining = max(
        0,
        int(
            counter.get(
                "initial_remaining",
                config["initial_free_attempts"],
            )
        ),
    )

    token_retry = await db.world_token_retry_daily.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "level": level,
        },
        {
            "_id": 0,
        },
    )

    today_key = _utcnow().astimezone(
        ZoneInfo(WORLD_TIMEZONE)
    ).strftime("%Y-%m-%d")

    token_retry_used_today = bool(
        token_retry
        and token_retry.get("day_key") == today_key
        and token_retry.get("used") is True
    )

    return {
        "initial_free_attempts":
            int(config["initial_free_attempts"]),

        "initial_remaining":
            initial_remaining,

        "free_attempts_available":
            initial_remaining,

        "automatic_free_refresh":
            False,

        "token_retry_enabled":
            bool(config["token_retry_enabled"]),

        # Hook only. No token wallet is charged yet.
        "token_retry_available":
            (
                initial_remaining == 0
                and bool(config["token_retry_enabled"])
                and not token_retry_used_today
            ),

        "token_retry_used_today":
            token_retry_used_today,

        "token_retry_reset_rule":
            "Europe/London midnight",

        "token_retry_cost":
            1,

        "next_free_attempt_at":
            None,
    }


async def _consume_free_attempt(
    db,
    user_id: str,
    level: int,
):
    """
    Atomically consume an INITIAL free attempt only.

    Token retries never pass through this function.
    """

    now = _utcnow()

    await _free_attempt_counter(
        db,
        user_id,
        level,
    )

    result = await db.world_attempt_counters.find_one_and_update(
        {
            "season_id": WORLD_SEASON_ID,
            "user_id": user_id,
            "level": level,
            "initial_remaining": {
                "$gt": 0,
            },
        },
        {
            "$inc": {
                "initial_remaining": -1,
            },
            "$set": {
                "updated_at": now,
                "last_attempt_at": now,
            },
        },
        return_document=True,
    )

    if result:
        return {
            "source": "free_initial",
            "consumed_at": now,
        }

    raise HTTPException(
        status_code=409,
        detail={
            "code": "NO_FREE_ATTEMPTS",
            "message": (
                "No free attempts remain for this level."
            ),
        },
    )


# ===========================================================================
# FREE WORLD STATE
# ===========================================================================


@router.get("/state")
async def free_world_state(
    request: Request,
):
    user = await get_current_user(request)
    db = get_db()

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

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
        ROYAL_VILLAGE_LEVELS[
            current_level
        ]
    )

    attempt_status = (
        await _free_attempt_status(
            db,
            user["user_id"],
            current_level,
        )
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
            "attempts":
                attempt_status,
        },

        "champion": {
            **ROYAL_VILLAGE_CHAMPION,
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

    highest_unlocked = int(
        progress.get(
            "highest_unlocked_level",
            1,
        )
    )

    if level > highest_unlocked:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "LEVEL_LOCKED",
                "message": (
                    "Complete the previous level "
                    "to unlock this level."
                ),
            },
        )

    attempts = await _free_attempt_status(
        db,
        user["user_id"],
        level,
    )

    config = ROYAL_VILLAGE_LEVELS[level]

    return {
        "season_id": WORLD_SEASON_ID,

        "level": {
            **config,

            "completed":
                level
                in progress.get(
                    "completed_levels",
                    [],
                ),

            "attempts": attempts,
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

    config = ROYAL_VILLAGE_LEVELS.get(
        level
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

    if level > int(
        progress.get(
            "highest_unlocked_level",
            1,
        )
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "LEVEL_LOCKED",
                "message": (
                    "Complete the previous level "
                    "first."
                ),
            },
        )

    attempts = await _free_attempt_status(
        db,
        user["user_id"],
        level,
    )

    if (
        attempts[
            "free_attempts_available"
        ]
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

    attempt = await _consume_free_attempt(
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
# FREE WORLD — CHAMPION CONTEST GAMEPLAY
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

        # GLOBAL — decides game everyone plays.
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

    entry = await _ensure_champion_entry(
        db,
        user,
        contest,
    )

    contest_number = int(
        contest[
            "contest_number"
        ]
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

    # Champion Number Sequence stays 1–100.
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

    await db.world_champion_sessions.update_one(
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

                "accuracy":
                    accuracy,
            }
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
        existing_best = await db.world_champion_scores.find_one(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "global_contest_number":
                    contest_number,

                "user_id":
                    user["user_id"],
            },
            sort=[
                (
                    "score",
                    -1,
                ),
                (
                    "duration_ms",
                    1,
                ),
            ],
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
        )

        if should_replace:
            await db.world_champion_scores.delete_many(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "global_contest_number":
                        contest_number,

                    "user_id":
                        user["user_id"],
                }
            )

            await db.world_champion_scores.insert_one(
                {
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

                    # PRIVATE — never public projection.
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
# PHASE 2C REVISED — TOKEN / BEST-TIME / CHAMPION RULES
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
      rank 4 base = £10
      Champion 9
      final = £90
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
# TOKEN RETRY — RESERVATION HOOK ONLY
# ===========================================================================


@router.post("/token/retry/reserve")
async def reserve_world_token_retry(
    body: WorldTokenRetryInput,
    request: Request,
):
    """
    IMPORTANT:
    This endpoint does NOT deduct any real token yet.

    It only validates/reserves the Free World retry entitlement
    so the UI/backend flow can be completed safely.

    Real token wallet deduction will be connected in a dedicated
    production verification phase.
    """

    user = await get_current_user(request)
    db = get_db()

    level = int(body.level)

    status = await _free_attempt_status(
        db,
        user["user_id"],
        level,
    )

    if (
        status["free_attempts_available"]
        > 0
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "FREE_ATTEMPT_AVAILABLE",

                "message":
                    (
                        "Use the available free attempt "
                        "before using a token retry."
                    ),
            },
        )

    if not status[
        "token_retry_available"
    ]:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "TOKEN_RETRY_NOT_AVAILABLE",

                "message":
                    (
                        "A token retry is not currently "
                        "available for this level."
                    ),
            },
        )

    day_key = _world_day_key()
    now = _utcnow()

    reservation_id = (
        "WTR-"
        + secrets.token_hex(12).upper()
    )

    await db.world_token_retry_reservations.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            "level":
                level,

            "day_key":
                day_key,
        },
        {
            "$setOnInsert": {
                "reservation_id":
                    reservation_id,

                "season_id":
                    WORLD_SEASON_ID,

                "user_id":
                    user["user_id"],

                "level":
                    level,

                "day_key":
                    day_key,

                "token_cost":
                    1,

                # Hook only.
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

    reservation = await db.world_token_retry_reservations.find_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            "level":
                level,

            "day_key":
                day_key,
        },
        {
            "_id": 0,
        },
    )

    return {
        "reserved": True,

        "reservation":
            _clean_doc(
                reservation
            ),

        "message":
            (
                "Token retry reservation created. "
                "Real token deduction is not connected yet."
            ),
    }


# ===========================================================================
# TOKEN LEVEL UNLOCK — RESERVATION HOOK ONLY
# ===========================================================================


@router.post("/token/unlock/reserve")
async def reserve_world_level_unlock(
    body: WorldTokenUnlockInput,
    request: Request,
):
    """
    1 token can unlock ONE locked normal level inside
    the user's CURRENT Championship.

    This reservation DOES NOT:
    - complete the level
    - award a score
    - award a win
    - increase Champion stage
    - deduct a real token yet
    """

    user = await get_current_user(request)
    db = get_db()

    level = int(body.level)

    progress = await _free_world_progress(
        db,
        user["user_id"],
    )

    highest = int(
        progress.get(
            "highest_unlocked_level",
            1,
        )
    )

    if level <= highest:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "LEVEL_ALREADY_UNLOCKED",

                "message":
                    "This level is already unlocked.",
            },
        )

    if level > 10:
        raise HTTPException(
            status_code=400,
            detail="Only normal levels can be token-unlocked.",
        )

    # Prevent jumping the entire board in one request.
    if level > highest + 1:
        raise HTTPException(
            status_code=409,
            detail={
                "code":
                    "UNLOCK_IN_SEQUENCE",

                "message":
                    (
                        "Token level unlocks must follow "
                        "the normal level sequence."
                    ),
            },
        )

    reservation_id = (
        "WLU-"
        + secrets.token_hex(12).upper()
    )

    now = _utcnow()

    await db.world_level_unlock_reservations.insert_one(
        {
            "reservation_id":
                reservation_id,

            "season_id":
                WORLD_SEASON_ID,

            "user_id":
                user["user_id"],

            "champion_stage":
                int(
                    progress.get(
                        "champion_stage",
                        1,
                    )
                ),

            "level":
                level,

            "token_cost":
                1,

            "token_payment_verified":
                False,

            "status":
                "awaiting_token_verification",

            "created_at":
                now,
        }
    )

    return {
        "reserved": True,

        "reservation_id":
            reservation_id,

        "level":
            level,

        "token_cost":
            1,

        "message":
            (
                "Level unlock reservation created. "
                "The level has NOT been unlocked yet "
                "because real token verification is not connected."
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
