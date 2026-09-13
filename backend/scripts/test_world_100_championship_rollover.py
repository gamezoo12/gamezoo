"""
LOCAL-ONLY Free World Season scheduler integration test.

Safety:
- Requires localhost MongoDB.
- Requires DB_NAME=prizeleague_free_world_v2_local.
- Refuses all other databases.
- Does not run Champion wallet settlement.
- Snapshots and restores scheduler-controlled local documents.
"""

from __future__ import annotations

import asyncio
import copy
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from zoneinfo import ZoneInfo


BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(
        0,
        str(BACKEND_DIR),
    )

load_dotenv(
    BACKEND_DIR / ".env"
)


EXPECTED_DB = (
    "prizeleague_free_world_v2_local"
)

MONGO_URL = (
    os.getenv("MONGO_URL")
    or ""
)

DB_NAME = (
    os.getenv("DB_NAME")
    or ""
)

WORLD_SEASON_ID = "season-1"

LONDON = ZoneInfo(
    "Europe/London"
)


def safety_check():
    allowed_hosts = (
        "mongodb://127.0.0.1",
        "mongodb://localhost",
    )

    if not any(
        MONGO_URL.startswith(host)
        for host in allowed_hosts
    ):
        raise RuntimeError(
            "REFUSED: MONGO_URL is not local. "
            f"Current value: {MONGO_URL!r}"
        )

    if DB_NAME != EXPECTED_DB:
        raise RuntimeError(
            "REFUSED: wrong database. "
            f"Expected {EXPECTED_DB!r}, "
            f"got {DB_NAME!r}"
        )


def london(dt):
    if dt is None:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(
            tzinfo=timezone.utc
        )

    return (
        dt
        .astimezone(LONDON)
        .strftime(
            "%Y-%m-%d %H:%M:%S %Z"
        )
    )



def same_instant(left, right):
    """
    Mongo/Motor may return UTC datetimes without tzinfo.
    Compare the actual UTC instant rather than Python
    aware-vs-naive datetime object identity.
    """

    if left is None or right is None:
        return left is right

    if left.tzinfo is None:
        left = left.replace(
            tzinfo=timezone.utc
        )

    if right.tzinfo is None:
        right = right.replace(
            tzinfo=timezone.utc
        )

    return (
        left.astimezone(timezone.utc)
        == right.astimezone(timezone.utc)
    )


async def snapshot_collection(
    collection,
    query,
):
    return [
        copy.deepcopy(row)
        async for row in collection.find(
            query
        )
    ]


async def restore_collection(
    collection,
    query,
    snapshot,
):
    await collection.delete_many(
        query
    )

    if snapshot:
        await collection.insert_many(
            snapshot
        )


async def migrate_level_offsets(
    db,
):
    print()
    print(
        "===== LOCAL LEVEL OFFSET MIGRATION ====="
    )

    rows = await (
        db.world_global_contests
        .find(
            {
                "season_id":
                    WORLD_SEASON_ID,
            }
        )
        .sort(
            "contest_number",
            1,
        )
        .to_list(
            length=200
        )
    )

    print(
        "Free World holders found:",
        len(rows),
    )

    if len(rows) != 100:
        raise RuntimeError(
            "Expected exactly 100 "
            "Championship holders before migration."
        )

    changed = 0
    already_correct = 0

    for contest in rows:
        levels = contest.get(
            "levels_config"
        )

        if not isinstance(
            levels,
            list,
        ):
            raise RuntimeError(
                "Championship "
                f"{contest.get('contest_number')} "
                "has no valid levels_config."
            )

        if len(levels) != 10:
            raise RuntimeError(
                "Championship "
                f"{contest.get('contest_number')} "
                f"has {len(levels)} levels, expected 10."
            )

        updated_levels = []

        contest_changed = False

        for index, row in enumerate(
            levels
        ):
            level_row = dict(
                row or {}
            )

            level = int(
                level_row.get(
                    "level",
                    index + 1,
                )
            )

            expected = max(
                0,
                level - 1,
            )

            previous = (
                level_row.get(
                    "unlock_after_days"
                )
            )

            if previous != expected:
                contest_changed = True

            level_row[
                "unlock_after_days"
            ] = expected

            updated_levels.append(
                level_row
            )

        if contest_changed:
            await (
                db.world_global_contests
                .update_one(
                    {
                        "_id":
                            contest["_id"],
                    },
                    {
                        "$set": {
                            "levels_config":
                                updated_levels,
                        }
                    },
                )
            )

            changed += 1
        else:
            already_correct += 1

    print(
        "Updated holders:",
        changed,
    )

    print(
        "Already correct:",
        already_correct,
    )

    verify = await (
        db.world_global_contests
        .find(
            {
                "season_id":
                    WORLD_SEASON_ID,
            },
            {
                "_id":
                    0,

                "contest_number":
                    1,

                "levels_config":
                    1,
            },
        )
        .sort(
            "contest_number",
            1,
        )
        .to_list(
            length=100
        )
    )

    for contest in verify:
        offsets = [
            int(
                row.get(
                    "unlock_after_days",
                    -999,
                )
            )
            for row in (
                contest.get(
                    "levels_config"
                )
                or []
            )
        ]

        if offsets != list(
            range(10)
        ):
            raise RuntimeError(
                "Migration verification failed "
                "for Championship "
                f"{contest.get('contest_number')}: "
                f"{offsets}"
            )

    print(
        "PASS: all 100 local holders now use "
        "0,1,2,3,4,5,6,7,8,9"
    )


async def run_simulation(
    db,
):
    print()
    print(
        "===== ACCELERATED SCHEDULER SIMULATION ====="
    )

    import services.world_championship_scheduler as worker
    from services.world_championship_schedule import (
        championship_window,
    )

    global_query = {
        "season_id":
            WORLD_SEASON_ID,
    }

    settings_query = {
        "_id":
            "active_global_contest",
    }

    contests_snapshot = (
        await snapshot_collection(
            db.world_global_contests,
            global_query,
        )
    )

    settings_snapshot = (
        await snapshot_collection(
            db.world_settings,
            settings_query,
        )
    )

    settlement_calls = []

    async def fake_settlement(
        db_arg,
        contest_number,
        now=None,
    ):
        settlement_calls.append(
            int(contest_number)
        )

        print(
            "SIMULATION: settlement requested "
            f"for Championship {contest_number}"
        )

        return {
            "ok":
                True,

            "status":
                "simulated_only",
        }

    original_settlement = (
        worker._attempt_settlement
    )

    worker._attempt_settlement = (
        fake_settlement
    )

    season_start = datetime(
        2026,
        9,
        13,
        23,
        0,
        0,
        tzinfo=timezone.utc,
    )

    try:
        await db.world_settings.update_one(
            settings_query,
            {
                "$set": {
                    "season_id":
                        WORLD_SEASON_ID,

                    "season_start_at":
                        season_start,

                    "season_schedule_version":
                        1,

                    "contest_number":
                        1,

                    "updated_at":
                        datetime.now(
                            timezone.utc
                        ),

                    "updated_by":
                        "local_simulation",
                }
            },
            upsert=True,
        )

        c1 = championship_window(
            season_start,
            1,
        )

        c2 = championship_window(
            season_start,
            2,
        )

        scenarios = [
            (
                "BEFORE SEASON",
                datetime(
                    2026,
                    9,
                    13,
                    22,
                    30,
                    tzinfo=timezone.utc,
                ),
                "waiting",
                None,
            ),
            (
                "C1 LEVELS",
                datetime(
                    2026,
                    9,
                    14,
                    12,
                    0,
                    tzinfo=timezone.utc,
                ),
                "active",
                1,
            ),
            (
                "C1 CHAMPION",
                datetime(
                    2026,
                    9,
                    24,
                    12,
                    0,
                    tzinfo=timezone.utc,
                ),
                "active",
                1,
            ),
            (
                "C1 RESULTS GAP",
                datetime(
                    2026,
                    9,
                    25,
                    21,
                    30,
                    tzinfo=timezone.utc,
                ),
                "results_gap",
                1,
            ),
            (
                "C2 START",
                datetime(
                    2026,
                    9,
                    25,
                    23,
                    1,
                    tzinfo=timezone.utc,
                ),
                "active",
                2,
            ),
        ]

        for (
            label,
            when,
            expected_action,
            expected_number,
        ) in scenarios:
            result = (
                await worker.tick_free_world(
                    db,
                    now=when,
                )
            )

            print()
            print(
                label,
                london(when),
            )

            print(
                " result:",
                result,
            )

            assert (
                result.get("action")
                == expected_action
            ), (
                label,
                result,
            )

            if expected_number is not None:
                assert (
                    int(
                        result.get(
                            "championship_number"
                        )
                    )
                    == expected_number
                )

        c1_doc = await (
            db.world_global_contests
            .find_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "contest_number":
                        1,
                },
                {
                    "_id":
                        0,
                },
            )
        )

        c2_doc = await (
            db.world_global_contests
            .find_one(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "contest_number":
                        2,
                },
                {
                    "_id":
                        0,
                },
            )
        )

        active_count = await (
            db.world_global_contests
            .count_documents(
                {
                    "season_id":
                        WORLD_SEASON_ID,

                    "status":
                        "active",
                }
            )
        )

        setting = await (
            db.world_settings
            .find_one(
                settings_query,
                {
                    "_id":
                        0,
                },
            )
        )

        print()
        print(
            "===== POST-ROLLOVER STATE ====="
        )

        print(
            "C1 status:",
            c1_doc.get(
                "status"
            ),
        )

        print(
            "C2 status:",
            c2_doc.get(
                "status"
            ),
        )

        print(
            "C2 start:",
            london(
                c2_doc.get(
                    "start_at"
                )
            ),
        )

        print(
            "C2 end:",
            london(
                c2_doc.get(
                    "end_at"
                )
            ),
        )

        print(
            "active holder count:",
            active_count,
        )

        print(
            "active_global_contest:",
            setting.get(
                "contest_number"
            ),
        )

        print(
            "settlement calls:",
            settlement_calls,
        )

        assert (
            c1_doc.get(
                "status"
            )
            in {
                "closed",
                "settled",
                "closed_settled",
            }
        )

        assert (
            c2_doc.get(
                "status"
            )
            == "active"
        )

        assert (
            active_count
            == 1
        )

        assert (
            int(
                setting.get(
                    "contest_number"
                )
            )
            == 2
        )

        assert same_instant(
            c2_doc.get(
                "start_at"
            ),
            c2[
                "start_at"
            ],
        )

        assert same_instant(
            c2_doc.get(
                "end_at"
            ),
            c2[
                "champion_closes_at"
            ],
        )

        assert 1 in (
            settlement_calls
        )

        print()
        print(
            "PASS: Championship 1 closes automatically"
        )

        print(
            "PASS: settlement is requested after Champion close"
        )

        print(
            "PASS: Championship 2 activates automatically"
        )

        print(
            "PASS: exactly one Championship remains active"
        )

        print(
            "PASS: active_global_contest advances to 2"
        )

        print(
            "PASS: C2 uses authoritative London schedule"
        )

    finally:
        worker._attempt_settlement = (
            original_settlement
        )

        await restore_collection(
            db.world_global_contests,
            global_query,
            contests_snapshot,
        )

        await restore_collection(
            db.world_settings,
            settings_query,
            settings_snapshot,
        )

        print()
        print(
            "PASS: simulation state restored"
        )


async def main():
    safety_check()

    print(
        "MONGO_URL:",
        MONGO_URL,
    )

    print(
        "DB_NAME:",
        DB_NAME,
    )

    print(
        "PASS: local database safety guard"
    )

    client = AsyncIOMotorClient(
        MONGO_URL
    )

    try:
        db = client[
            DB_NAME
        ]

        await db.command(
            "ping"
        )

        print(
            "PASS: local MongoDB connected"
        )

        await migrate_level_offsets(
            db
        )

        await run_simulation(
            db
        )

        # Migration intentionally remains.
        # Simulation state is restored.
        rows = await (
            db.world_global_contests
            .find(
                {
                    "season_id":
                        WORLD_SEASON_ID,
                },
                {
                    "_id":
                        0,

                    "contest_number":
                        1,

                    "levels_config":
                        1,
                },
            )
            .sort(
                "contest_number",
                1,
            )
            .to_list(
                length=100
            )
        )

        assert (
            len(rows)
            == 100
        )

        for contest in rows:
            offsets = [
                int(
                    level.get(
                        "unlock_after_days",
                        -1,
                    )
                )
                for level in (
                    contest.get(
                        "levels_config"
                    )
                    or []
                )
            ]

            assert (
                offsets
                == list(
                    range(10)
                )
            )

        print()
        print(
            "PASS: local migration remains applied"
        )

        print(
            "PASS: simulation did not remain applied"
        )

    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(
        main()
    )
