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
CURRENT_CHAMPIONSHIP_EXTENSION_DAYS = 1
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


def _norm_extensions(extensions) -> dict:
    """Normalise an admin extension map to {int championship_number: int days}.

    Accepts None, or a dict keyed by int or str championship numbers.
    Days are clamped to a sane 0..60 range. Empty/None -> {}.
    """
    if not extensions:
        return {}
    out = {}
    for k, v in dict(extensions).items():
        try:
            num = int(k)
            days = int(v or 0)
        except (TypeError, ValueError):
            continue
        if num < 1 or num > SEASON_CHAMPIONSHIP_COUNT:
            continue
        days = max(0, min(60, days))
        if days:
            out[num] = days
    return out


def _prior_extension_days(extensions: dict, number: int) -> int:
    """Total extra days added to the START of `number` by all PRIOR
    championships' extensions (cumulative cascade)."""
    if not extensions:
        return 0
    return sum(
        int(days)
        for n, days in extensions.items()
        if int(n) < int(number)
    )


def championship_start_day(
    championship_number: int,
    extensions=None,
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

    # One-time Season 1 extension: Championship 1 receives one
    # extra day. Championships 2-100 keep their normal 12-day
    # duration but start one day later.
    base = (
        (number - 1) * CHAMPIONSHIP_CYCLE_DAYS
        + (
            CURRENT_CHAMPIONSHIP_EXTENSION_DAYS
            if number >= 2
            else 0
        )
    )

    # Admin-controlled dynamic extensions: every extension granted to an
    # EARLIER championship pushes this championship's start later, so the
    # whole downstream schedule shifts automatically.
    return base + _prior_extension_days(
        _norm_extensions(extensions),
        number,
    )


def championship_window(
    season_start: datetime,
    championship_number: int,
    extensions=None,
) -> dict:
    number = int(
        championship_number
    )

    ext_map = _norm_extensions(extensions)
    this_ext = int(ext_map.get(number, 0))

    base_day = championship_start_day(
        number,
        ext_map,
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
                CHAMPION_CLOSE_DAY +
                (
                    CURRENT_CHAMPIONSHIP_EXTENSION_DAYS
                    if number == 1
                    else 0
                ) +
                this_ext,
            hour=CHAMPION_CLOSE_HOUR,
            minute=
                CHAMPION_CLOSE_MINUTE,
        )
    )

    next_start_at = (
        london_calendar_datetime(
            season_start,
            championship_start_day(
                number + 1,
                ext_map,
            ),
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
    extensions=None,
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

    ext_map = _norm_extensions(extensions)

    first_start = (
        championship_window(
            season_start,
            1,
            ext_map,
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

    # When admin extensions are in play, the per-championship spans are no
    # longer uniform, so resolve by iterating the (bounded) 100-championship
    # calendar. Without extensions this agrees with the fast linear path.
    if ext_map:
        for number in range(1, SEASON_CHAMPIONSHIP_COUNT + 1):
            window = championship_window(
                season_start, number, ext_map
            )
            start = window["start_at"]
            close = window["champion_closes_at"]
            nxt = window["next_start_at"]

            if now < start:
                break

            upper = nxt if nxt is not None else close
            in_span = (
                start <= now < upper
                if nxt is not None
                else now < close
            )
            if in_span:
                if now < window["champion_opens_at"]:
                    phase = "levels"
                elif now < close:
                    phase = "champion"
                else:
                    phase = "results_gap"
                return {
                    "phase": phase,
                    "championship_number": number,
                    "window": window,
                }

        final_window = championship_window(
            season_start, SEASON_CHAMPIONSHIP_COUNT, ext_map
        )
        return {
            "phase": "season_complete",
            "championship_number": SEASON_CHAMPIONSHIP_COUNT,
            "window": final_window,
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

    first_cycle_days = (
        CHAMPIONSHIP_CYCLE_DAYS
        + CURRENT_CHAMPIONSHIP_EXTENSION_DAYS
    )

    if elapsed_days < first_cycle_days:
        number = 1
    else:
        number = (
            (
                elapsed_days
                - first_cycle_days
            ) // CHAMPIONSHIP_CYCLE_DAYS
        ) + 2

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
