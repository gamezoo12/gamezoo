"""
Automatic Free World Championship rollover.

Runs from the existing application scheduler.

This worker does not create a second background loop.

It:
- resolves the correct Championship from the Season start
- activates only the correct Championship holder
- closes the holder at Champion close
- preserves the 2-hour results gap
- attempts the existing idempotent settlement engine
- does not block the next Championship if settlement requires
  later admin attention
"""

from __future__ import annotations

import logging
from datetime import (
    datetime,
    timedelta,
    timezone,
)

from services.world_championship_schedule import (
    SEASON_CHAMPIONSHIP_COUNT,
    championship_for_time,
    championship_window,
    ordered_contest_sequence,
)


log = logging.getLogger(
    "gz.world_scheduler"
)


WORLD_SEASON_ID = "season-1"

SETTLEMENT_RETRY_SECONDS = 15 * 60


async def _season_setting(db):
    return await db.world_settings.find_one(
        {
            "_id":
                "active_global_contest",
        }
    )


async def _close_contest(
    db,
    contest_number: int,
    now: datetime,
):
    contest_number = int(
        contest_number
    )

    await db.world_global_contests.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "contest_number":
                contest_number,

            "status":
                "active",
        },
        {
            "$set": {
                "status":
                    "closed",

                "closed_at":
                    now,

                "updated_at":
                    now,

                "updated_by":
                    "system_world_scheduler",
            }
        },
    )


async def _attempt_settlement(
    db,
    contest_number: int,
    now: datetime | None = None,
):
    """
    Attempt the existing idempotent Champion settlement.

    Scheduler retry policy:
    - never retry a contest already settled;
    - failed/pending settlement retries at most every 15 minutes;
    - retry state is stored in MongoDB so process restarts are safe;
    - settlement failure never blocks Championship rollover.
    """
    contest_number = int(contest_number)

    if now is None:
        now = datetime.now(timezone.utc)

    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    contest = await db.world_global_contests.find_one(
        {
            "season_id": WORLD_SEASON_ID,
            "contest_number": contest_number,
        },
        {
            "_id": 0,
            "status": 1,
            "settlement_last_attempt_at": 1,
        },
    )

    if not contest:
        log.warning(
            "[world-scheduler] settlement skipped; "
            "contest not found contest=%s",
            contest_number,
        )
        return {
            "ok": False,
            "action": "contest_not_found",
        }

    status = contest.get("status")

    if status in {
        "settled",
        "closed_settled",
    }:
        return {
            "ok": True,
            "action": "already_settled",
        }

    last_attempt = contest.get(
        "settlement_last_attempt_at"
    )

    if last_attempt is not None:
        if last_attempt.tzinfo is None:
            last_attempt = last_attempt.replace(
                tzinfo=timezone.utc
            )

        elapsed = (
            now.astimezone(timezone.utc)
            - last_attempt.astimezone(timezone.utc)
        ).total_seconds()

        if elapsed < SETTLEMENT_RETRY_SECONDS:
            return {
                "ok": True,
                "action": "retry_wait",
                "retry_after_seconds": max(
                    0,
                    int(
                        SETTLEMENT_RETRY_SECONDS
                        - elapsed
                    ),
                ),
            }

    # Claim this retry window before settlement begins.
    # This prevents every 60-second scheduler tick from
    # starting another settlement attempt.
    claim_before = (
        now
        - timedelta(
            seconds=SETTLEMENT_RETRY_SECONDS
        )
    )

    claim_filter = {
        "season_id": WORLD_SEASON_ID,
        "contest_number": contest_number,
        "status": {
            "$nin": [
                "settled",
                "closed_settled",
            ]
        },
        "$or": [
            {
                "settlement_last_attempt_at": {
                    "$exists": False
                }
            },
            {
                "settlement_last_attempt_at": None
            },
            {
                "settlement_last_attempt_at": {
                    "$lte": claim_before
                }
            },
        ],
    }

    claim = await db.world_global_contests.update_one(
        claim_filter,
        {
            "$set": {
                "settlement_last_attempt_at": now,
                "settlement_retry_managed": True,
            }
        },
    )

    if claim.modified_count != 1:
        return {
            "ok": True,
            "action": "retry_wait",
        }

    try:
        from routers.world_routes import (
            _settle_world_champion_contest,
        )

        result = await _settle_world_champion_contest(
            db,
            contest_number,
        )

        refreshed = await db.world_global_contests.find_one(
            {
                "season_id": WORLD_SEASON_ID,
                "contest_number": contest_number,
            },
            {
                "_id": 0,
                "status": 1,
            },
        )

        final_status = (
            refreshed.get("status")
            if refreshed
            else None
        )

        settled = final_status in {
            "settled",
            "closed_settled",
        }

        await db.world_global_contests.update_one(
            {
                "season_id": WORLD_SEASON_ID,
                "contest_number": contest_number,
            },
            {
                "$set": {
                    "settlement_last_result_at": now,
                    "settlement_last_result":
                        "settled"
                        if settled
                        else "completed_not_settled",
                },
                "$unset": {
                    "settlement_last_error": "",
                },
            },
        )

        log.info(
            "[world-scheduler] settlement contest=%s "
            "status=%s result=%s",
            contest_number,
            final_status,
            (
                result.get("status")
                if isinstance(result, dict)
                else result
            ),
        )

        return {
            "ok": True,
            "action":
                "settled"
                if settled
                else "attempted",
            "status": final_status,
        }

    except Exception as exc:
        error_text = str(exc)[:300]

        await db.world_global_contests.update_one(
            {
                "season_id": WORLD_SEASON_ID,
                "contest_number": contest_number,
            },
            {
                "$set": {
                    "settlement_last_error":
                        error_text,
                    "settlement_last_result":
                        "pending",
                    "settlement_last_result_at":
                        now,
                }
            },
        )

        log.warning(
            "[world-scheduler] settlement pending "
            "contest=%s; retry in %ss: %s",
            contest_number,
            SETTLEMENT_RETRY_SECONDS,
            error_text,
        )

        return {
            "ok": False,
            "action": "pending",
            "retry_after_seconds":
                SETTLEMENT_RETRY_SECONDS,
        }

def _normalise_level_offsets(
    levels_config,
):
    """
    Preserve every existing game/timer/retry setting.
    Only enforce the Season daily unlock offsets 0..9.
    """

    if not isinstance(
        levels_config,
        list,
    ):
        return levels_config

    result = []

    for index, item in enumerate(
        levels_config[:10]
    ):
        row = dict(
            item or {}
        )

        level = int(
            row.get(
                "level",
                index + 1,
            )
        )

        row[
            "unlock_after_days"
        ] = max(
            0,
            level - 1,
        )

        result.append(
            row
        )

    return result


async def _activate_contest(
    db,
    *,
    contest_number: int,
    start_at: datetime,
    end_at: datetime,
    now: datetime,
):
    contest_number = int(
        contest_number
    )

    contest = (
        await db.world_global_contests.find_one(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "contest_number":
                    contest_number,
            }
        )
    )

    if not contest:
        log.error(
            "[world-scheduler] missing Championship holder %s",
            contest_number,
        )
        return False

    levels_config = (
        _normalise_level_offsets(
            contest.get(
                "levels_config"
            )
        )
    )

    await db.world_global_contests.update_many(
        {
            "season_id":
                WORLD_SEASON_ID,

            "status":
                "active",

            "contest_number": {
                "$ne":
                    contest_number,
            },
        },
        {
            "$set": {
                "status":
                    "closed",

                "updated_at":
                    now,

                "updated_by":
                    "system_world_scheduler",
            }
        },
    )

    patch = {
        "status":
            "active",

        "start_at":
            start_at,

        "end_at":
            end_at,

        "updated_at":
            now,

        "updated_by":
            "system_world_scheduler",

        "schedule_managed":
            True,
    }

    if isinstance(
        levels_config,
        list,
    ):
        patch[
            "levels_config"
        ] = levels_config

    await db.world_global_contests.update_one(
        {
            "season_id":
                WORLD_SEASON_ID,

            "contest_number":
                contest_number,
        },
        {
            "$set":
                patch
        },
    )

    await db.world_settings.update_one(
        {
            "_id":
                "active_global_contest",
        },
        {
            "$set": {
                "season_id":
                    WORLD_SEASON_ID,

                "contest_number":
                    contest_number,

                "updated_at":
                    now,

                "updated_by":
                    "system_world_scheduler",
            }
        },
        upsert=True,
    )

    return True


async def tick_free_world(
    db,
    now: datetime | None = None,
):
    now = (
        now
        or datetime.now(
            timezone.utc
        )
    )

    setting = await _season_setting(
        db
    )

    if not setting:
        return {
            "ok":
                True,

            "action":
                "not_scheduled",
        }

    season_start = (
        setting.get(
            "season_start_at"
        )
    )

    extensions = (
        setting.get(
            "championship_extensions"
        )
        or {}
    )

    if not season_start:
        # Existing installations may have an active contest
        # but have not yet been launched through the new
        # Season scheduler.
        return {
            "ok":
                True,

            "action":
                "legacy_mode",
        }

    configured_contests = await db.world_global_contests.find(
        {"season_id": WORLD_SEASON_ID},
        {"_id": 0, "contest_number": 1},
    ).sort("contest_number", 1).to_list(SEASON_CHAMPIONSHIP_COUNT)
    contest_sequence = ordered_contest_sequence(
        row.get("contest_number") for row in configured_contests
    )

    resolved = (
        championship_for_time(
            season_start,
            now,
            extensions,
        )
    )

    phase = resolved[
        "phase"
    ]

    schedule_slot = resolved.get(
        "championship_number"
    )

    window = resolved.get(
        "window"
    )

    if phase == "before_season":
        return {
            "ok":
                True,

            "action":
                "waiting",

            "phase":
                phase,
        }

    if (
        phase ==
        "season_complete"
    ):
        contest_number = (
            contest_sequence[int(schedule_slot) - 1]
            if schedule_slot
            and int(schedule_slot) <= len(contest_sequence)
            else None
        )
        if contest_number:
            await _close_contest(
                db,
                contest_number,
                now,
            )

            await _attempt_settlement(
                db,
                contest_number,
                now=now,
            )

        return {
            "ok":
                True,

            "action":
                "season_complete",
        }

    if not schedule_slot or not window:
        return {
            "ok":
                True,

            "action":
                "nothing",
        }

    if int(schedule_slot) > len(contest_sequence):
        return {
            "ok": True,
            "action": "contest_not_configured",
            "schedule_slot": int(schedule_slot),
        }

    contest_number = contest_sequence[int(schedule_slot) - 1]

    # ------------------------------------------------------
    # RESULTS GAP
    # ------------------------------------------------------

    if phase == "results_gap":
        await _close_contest(
            db,
            contest_number,
            now,
        )

        await _attempt_settlement(
            db,
            contest_number,
            now=now,
        )

        return {
            "ok":
                True,

            "action":
                "results_gap",

            "championship_number":
                contest_number,
        }

    # ------------------------------------------------------
    # LEVELS / CHAMPION PERIOD
    # ------------------------------------------------------

    current = (
        await db.world_global_contests.find_one(
            {
                "season_id":
                    WORLD_SEASON_ID,

                "contest_number":
                    contest_number,
            },
            {
                "_id":
                    0,

                "status":
                    1,

                "start_at":
                    1,

                "end_at":
                    1,
            },
        )
    )

    expected_start = (
        window["start_at"]
    )

    expected_end = (
        window[
            "champion_closes_at"
        ]
    )

    already_correct = bool(
        current
        and current.get(
            "status"
        ) == "active"
        and current.get(
            "start_at"
        ) == expected_start
        and current.get(
            "end_at"
        ) == expected_end
        and int(
            setting.get(
                "contest_number"
            )
            or 0
        ) == contest_number
    )

    if not already_correct:
        activated = (
            await _activate_contest(
                db,
                contest_number=
                    contest_number,

                start_at=
                    expected_start,

                end_at=
                    expected_end,

                now=
                    now,
            )
        )

        if activated:
            log.info(
                "[world-scheduler] Championship %s active; phase=%s",
                contest_number,
                phase,
            )

    # Previous Championship may need settlement after rollover.
    previous_index = int(schedule_slot) - 2

    if previous_index >= 0:
        previous = contest_sequence[previous_index]
        previous_window = (
            championship_window(
                season_start,
                previous_index + 1,
                extensions,
            )
        )

        if (
            now >=
            previous_window[
                "champion_closes_at"
            ]
        ):
            previous_doc = (
                await db.world_global_contests.find_one(
                    {
                        "season_id":
                            WORLD_SEASON_ID,

                        "contest_number":
                            previous,
                    },
                    {
                        "_id":
                            0,

                        "status":
                            1,
                    },
                )
            )

            if (
                previous_doc
                and previous_doc.get(
                    "status"
                ) in {
                    "closed",
                    "settled",
                    "closed_settled",
                }
            ):
                await _attempt_settlement(
                    db,
                    previous,
                    now=now,
                )

    return {
        "ok":
            True,

        "action":
            "active",

        "championship_number":
            contest_number,

        "phase":
            phase,
    }
