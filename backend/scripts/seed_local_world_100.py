import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path.cwd()
sys.path.insert(0, str(ROOT))

load_dotenv(ROOT / ".env")

from routers.world_routes import (
    CHAMPION_WINNER_COUNT,
    WORLD_CONTEST_COUNT,
    WORLD_SEASON_ID,
    WORLD_DEFAULT_CURRENCY,
    _default_world_levels_config,
    _default_world_champion_config,
)

EXPECTED_DB = "prizeleague_free_world_v2_local"

mongo_url = os.getenv("MONGO_URL", "")
db_name = os.getenv("DB_NAME", "")

print("MONGO_URL:", mongo_url)
print("DB_NAME:", db_name)
print("WORLD_CONTEST_COUNT:", WORLD_CONTEST_COUNT)

if db_name != EXPECTED_DB:
    raise SystemExit(
        f"REFUSED: expected {EXPECTED_DB!r}, got {db_name!r}"
    )

if not (
    mongo_url.startswith("mongodb://127.0.0.1")
    or mongo_url.startswith("mongodb://localhost")
):
    raise SystemExit(
        f"REFUSED: MongoDB is not local: {mongo_url!r}"
    )

if WORLD_CONTEST_COUNT != 100:
    raise SystemExit(
        f"REFUSED: expected WORLD_CONTEST_COUNT=100, got {WORLD_CONTEST_COUNT}"
    )


async def main():
    client = AsyncIOMotorClient(mongo_url)

    try:
        db = client[db_name]

        await db.command("ping")

        print()
        print("PASS: local MongoDB safety guard")
        print("PASS: local MongoDB connected")

        existing = await db.world_global_contests.count_documents({
            "season_id": WORLD_SEASON_ID
        })

        print()
        print("Existing Season 1 holders:", existing)

        if existing not in (0, 100):
            raise RuntimeError(
                "REFUSED: local DB contains a partial Championship set "
                f"({existing}/100). No automatic overwrite performed."
            )

        now = datetime.now(timezone.utc)

        contests_created = 0
        prizes_created = 0

        print()
        print("===== SEED 100 CHAMPIONSHIP HOLDERS =====")

        for number in range(1, WORLD_CONTEST_COUNT + 1):

            contest_defaults = {
                "season_id": WORLD_SEASON_ID,
                "contest_number": number,
                "name": f"Champion Contest {number}",

                # Preserve the existing product convention:
                # Championship 1 starts with Number Sequence configured.
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

                "winner_count": CHAMPION_WINNER_COUNT,
                "status": "draft",
                "start_at": None,
                "end_at": None,
                "admin_notes": "",
                "created_at": now,
                "created_by": "local-rollover-test",
                "updated_at": now,

                # Every Championship has exactly
                # 10 normal progression levels.
                "levels_config":
                    _default_world_levels_config(),

                # Championship 1 keeps the existing
                # Champion Number Sequence default.
                # Later Championships remain available
                # for Admin game configuration.
                "champion_config": (
                    _default_world_champion_config()
                    if number == 1
                    else {}
                ),
            }

            result = await db.world_global_contests.update_one(
                {
                    "season_id": WORLD_SEASON_ID,
                    "contest_number": number,
                },
                {
                    "$setOnInsert": contest_defaults
                },
                upsert=True,
            )

            if result.upserted_id is not None:
                contests_created += 1

            prize_defaults = {
                "season_id": WORLD_SEASON_ID,
                "champion_stage": number,
                "amount": number * 100,
                "currency": WORLD_DEFAULT_CURRENCY,
                "created_at": now,
                "created_by": "local-rollover-test",
                "updated_at": now,
            }

            result = await db.world_champion_prizes.update_one(
                {
                    "season_id": WORLD_SEASON_ID,
                    "champion_stage": number,
                },
                {
                    "$setOnInsert": prize_defaults
                },
                upsert=True,
            )

            if result.upserted_id is not None:
                prizes_created += 1

        holder_count = await db.world_global_contests.count_documents({
            "season_id": WORLD_SEASON_ID
        })

        prize_count = await db.world_champion_prizes.count_documents({
            "season_id": WORLD_SEASON_ID
        })

        print("Championship holders created:", contests_created)
        print("Prize holders created:", prizes_created)
        print("Season 1 Championship holders:", holder_count)
        print("Season 1 prize holders:", prize_count)

        if holder_count != 100:
            raise RuntimeError(
                f"Expected 100 Championship holders, found {holder_count}"
            )

        if prize_count != 100:
            raise RuntimeError(
                f"Expected 100 prize holders, found {prize_count}"
            )

        print()
        print("===== VERIFY LEVEL STRUCTURE =====")

        bad = []

        cursor = db.world_global_contests.find(
            {"season_id": WORLD_SEASON_ID},
            {
                "_id": 0,
                "contest_number": 1,
                "winner_count": 1,
                "levels_config": 1,
            }
        ).sort("contest_number", 1)

        async for row in cursor:
            if row.get("winner_count") != CHAMPION_WINNER_COUNT:
                bad.append(
                    (
                        row.get("contest_number"),
                        "winner_count",
                        row.get("winner_count"),
                    )
                )

            levels = row.get("levels_config")

            if not isinstance(levels, list) or len(levels) != 10:
                bad.append(row.get("contest_number"))
                continue

            offsets = [
                int(level.get("unlock_after_days", -999))
                for level in levels
            ]

            if offsets != list(range(10)):
                bad.append(row.get("contest_number"))

        if bad:
            raise RuntimeError(
                "Invalid 10-level daily configuration for Championships: "
                + ", ".join(map(str, bad[:20]))
            )

        print("PASS: all 100 Championships have 10 normal levels")
        print("PASS: all unlock offsets are exactly 0,1,2,3,4,5,6,7,8,9")

        c1 = await db.world_global_contests.find_one(
            {
                "season_id": WORLD_SEASON_ID,
                "contest_number": 1,
            },
            {"_id": 0}
        )

        c100 = await db.world_global_contests.find_one(
            {
                "season_id": WORLD_SEASON_ID,
                "contest_number": 100,
            },
            {"_id": 0}
        )

        print()
        print("Championship 1 levels:",
              len(c1.get("levels_config", [])))

        print("Championship 100 levels:",
              len(c100.get("levels_config", [])))

        print()
        print("PASS: LOCAL 100-CHAMPIONSHIP HOLDERS READY")

    finally:
        client.close()


asyncio.run(main())
