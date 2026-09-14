"""
Free World Season 1 calendar scheduler.

Authoritative timing rules:

- 100 Championships
- 10 numbered levels per Championship
- Level 1 opens on Championship Day 0 at 00:00 Europe/London
- Levels 2-10 open daily at local midnight
- Champion opens Day 10 at 00:00 Europe/London
- Champion closes Day 11 at 22:00 Europe/London
- Day 11 22:00 -> Day 12 00:00 is the results/reset gap
- Next Championship starts Day 12 at 00:00 Europe/London

All calendar calculations use Europe/London wall-clock dates so
BST/GMT changes do not move midnight unlocks to 23:00 or 01:00.
"""

from __future__ import annotations

from datetime import (
    date,
    datetime,
    time,
    timedelta,
    timezone,
)
from zoneinfo import ZoneInfo


LONDON_TZ = ZoneInfo("Europe/London")

SEASON_CHAMPIONSHIP_COUNT = 100
LEVELS_PER_CHAMPIONSHIP = 10

CHAMPIONSHIP_CYCLE_DAYS = 12
CHAMPION_OPEN_DAY = 10
CHAMPION_CLOSE_DAY = 11

CHAMPION_CLOSE_HOUR = 22
CHAMPION_CLOSE_MINUTE = 0


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(
            tzinfo=timezone.utc
        )

    return value.astimezone(
        timezone.utc
    )


def season_start_local_date(
    season_start: datetime,
) -> date:
    return (
        ensure_utc(season_start)
        .astimezone(LONDON_TZ)
        .date()
    )


def london_calendar_datetime(
    season_start: datetime,
    day_offset: int,
    *,
    hour: int = 0,
    minute: int = 0,
) -> datetime:
    """
    Return an aware UTC datetime for a Europe/London
    calendar-day offset from the Season start date.
    """

    local_date = (
        season_start_local_date(
            season_start
        )
        + timedelta(
            days=int(day_offset)
        )
    )

    local_dt = datetime.combine(
        local_date,
        time(
            hour=int(hour),
            minute=int(minute),
        ),
        tzinfo=LONDON_TZ,
    )

    return local_dt.astimezone(
        timezone.utc
    )


def championship_start_day(
    championship_number: int,
) -> int:
    number = int(
        championship_number
    )

    if (
        number < 1
        or number >
            SEASON_CHAMPIONSHIP_COUNT
    ):
        raise ValueError(
            "Invalid Championship number."
        )

    return (
        number - 1
    ) * CHAMPIONSHIP_CYCLE_DAYS


def championship_window(
    season_start: datetime,
    championship_number: int,
) -> dict:
    number = int(
        championship_number
    )

    base_day = championship_start_day(
        number
    )

    start_at = (
        london_calendar_datetime(
            season_start,
            base_day,
        )
    )

    level_unlocks = [
        london_calendar_datetime(
            season_start,
            base_day + level_index,
        )
        for level_index in range(
            LEVELS_PER_CHAMPIONSHIP
        )
    ]

    champion_opens_at = (
        london_calendar_datetime(
            season_start,
            base_day +
                CHAMPION_OPEN_DAY,
        )
    )

    champion_closes_at = (
        london_calendar_datetime(
            season_start,
            base_day +
                CHAMPION_CLOSE_DAY,
            hour=CHAMPION_CLOSE_HOUR,
            minute=
                CHAMPION_CLOSE_MINUTE,
        )
    )

    next_start_at = (
        london_calendar_datetime(
            season_start,
            base_day +
                CHAMPIONSHIP_CYCLE_DAYS,
        )
        if number <
            SEASON_CHAMPIONSHIP_COUNT
        else None
    )

    return {
        "championship_number":
            number,

        "start_at":
            start_at,

        "level_unlocks":
            level_unlocks,

        "champion_opens_at":
            champion_opens_at,

        "champion_closes_at":
            champion_closes_at,

        "next_start_at":
            next_start_at,
    }


def championship_for_time(
    season_start: datetime,
    now: datetime,
) -> dict:
    """
    Resolve the Championship calendar position for now.

    phase:
      before_season
      levels
      champion
      results_gap
      season_complete
    """

    season_start = ensure_utc(
        season_start
    )
    now = ensure_utc(
        now
    )

    first_start = (
        championship_window(
            season_start,
            1,
        )["start_at"]
    )

    if now < first_start:
        return {
            "phase":
                "before_season",

            "championship_number":
                None,

            "window":
                None,
        }

    now_local_date = (
        now
        .astimezone(LONDON_TZ)
        .date()
    )

    start_local_date = (
        season_start_local_date(
            season_start
        )
    )

    elapsed_days = (
        now_local_date -
        start_local_date
    ).days

    number = (
        elapsed_days //
        CHAMPIONSHIP_CYCLE_DAYS
    ) + 1

    if number > SEASON_CHAMPIONSHIP_COUNT:
        final_window = (
            championship_window(
                season_start,
                SEASON_CHAMPIONSHIP_COUNT,
            )
        )

        if (
            now <
            final_window[
                "champion_closes_at"
            ]
        ):
            number = (
                SEASON_CHAMPIONSHIP_COUNT
            )
        else:
            return {
                "phase":
                    "season_complete",

                "championship_number":
                    SEASON_CHAMPIONSHIP_COUNT,

                "window":
                    final_window,
            }

    number = max(
        1,
        min(
            SEASON_CHAMPIONSHIP_COUNT,
            number,
        ),
    )

    window = championship_window(
        season_start,
        number,
    )

    if (
        now <
        window["champion_opens_at"]
    ):
        phase = "levels"

    elif (
        now <
        window["champion_closes_at"]
    ):
        phase = "champion"

    else:
        next_start = (
            window.get(
                "next_start_at"
            )
        )

        if (
            next_start is not None
            and now < next_start
        ):
            phase = "results_gap"
        elif next_start is None:
            phase = "season_complete"
        else:
            phase = "results_gap"

    return {
        "phase":
            phase,

        "championship_number":
            number,

        "window":
            window,
    }


def level_unlock_at(
    championship_start: datetime,
    unlock_after_days: int,
) -> datetime:
    """
    Preserve local-midnight level opening through BST/GMT.

    championship_start is expected to represent the
    Championship local-midnight start.
    """

    return london_calendar_datetime(
        championship_start,
        int(unlock_after_days),
    )
