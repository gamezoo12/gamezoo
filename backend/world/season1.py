"""
Prize League Free World - Season 1 contract.

This file defines Season 1 progression only.

Season 1:
- 100 Championships
- 10 normal levels per Championship
- 1000 normal levels total
- Championship challenge remains separate from the 10 normal levels

This does NOT modify paid contests, wallet, tickets, payments,
leaderboards, KYC, referrals or existing UI.
"""

SEASON_1_ID = "season-1"

SEASON_1_CHAMPIONSHIP_COUNT = 100
LEVELS_PER_CHAMPIONSHIP = 10
SEASON_1_TOTAL_LEVELS = (
    SEASON_1_CHAMPIONSHIP_COUNT * LEVELS_PER_CHAMPIONSHIP
)


def championship_level_range(championship_number: int):
    if (
        championship_number < 1
        or championship_number > SEASON_1_CHAMPIONSHIP_COUNT
    ):
        return None

    start_level = (
        (championship_number - 1) * LEVELS_PER_CHAMPIONSHIP
    ) + 1

    end_level = (
        championship_number * LEVELS_PER_CHAMPIONSHIP
    )

    return {
        "start_level": start_level,
        "end_level": end_level,
    }


def championship_for_level(level_number: int):
    if (
        level_number < 1
        or level_number > SEASON_1_TOTAL_LEVELS
    ):
        return None

    return (
        (level_number - 1) // LEVELS_PER_CHAMPIONSHIP
    ) + 1


def next_championship(championship_number: int):
    if championship_number >= SEASON_1_CHAMPIONSHIP_COUNT:
        return None

    return championship_number + 1


def championship_is_unlocked(
    *,
    championship_number: int,
    highest_unlocked_championship: int = 1,
    admin_unlocked_championships=None,
):
    admin_unlocked_championships = (
        admin_unlocked_championships or []
    )

    if championship_number == 1:
        return True

    if championship_number in admin_unlocked_championships:
        return True

    return championship_number <= highest_unlocked_championship


SEASON_1_CHAMPIONSHIPS = []

for championship_number in range(
    1,
    SEASON_1_CHAMPIONSHIP_COUNT + 1,
):
    level_range = championship_level_range(
        championship_number
    )

    SEASON_1_CHAMPIONSHIPS.append(
        {
            "season_id": SEASON_1_ID,
            "championship_number": championship_number,
            "championship_id": (
                f"season-1-championship-{championship_number}"
            ),
            "start_level": level_range["start_level"],
            "end_level": level_range["end_level"],
            "level_count": LEVELS_PER_CHAMPIONSHIP,
            "challenge_id": (
                f"season-1-championship-{championship_number}-challenge"
            ),
            "artwork": None,
            "default_unlocked": championship_number == 1,
        }
    )
