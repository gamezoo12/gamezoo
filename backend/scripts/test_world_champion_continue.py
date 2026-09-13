import asyncio
import copy
import os
import sys
from pathlib import Path

# Allow this script to be run directly from backend/scripts.
BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(
        0,
        str(BACKEND_DIR),
    )

from fastapi import HTTPException
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(".env")

mongo = os.environ["MONGO_URL"]
name = os.environ["DB_NAME"]

if name != "prizeleague_free_world_v2_local":
    raise RuntimeError(
        "REFUSED: Champion Continue regression test "
        "requires local V2 database."
    )

if not (
    mongo.startswith("mongodb://127.0.0.1")
    or mongo.startswith("mongodb://localhost")
):
    raise RuntimeError(
        "REFUSED: MongoDB must be localhost."
    )


async def main():
    client = AsyncIOMotorClient(mongo)

    test_user = (
        "local-champion-continue-regression-user"
    )

    db = client[name]

    import routers.world_routes as routes

    original_get_db = routes.get_db
    original_get_current_user = (
        routes.get_current_user
    )

    progress_before = await (
        db.world_progress.find_one(
            {
                "season_id": "season-1",
                "user_id": test_user,
            }
        )
    )

    contest3_before = await (
        db.world_global_contests.find_one(
            {
                "season_id": "season-1",
                "contest_number": 3,
            }
        )
    )

    contest4_before = await (
        db.world_global_contests.find_one(
            {
                "season_id": "season-1",
                "contest_number": 4,
            }
        )
    )

    contest100_before = await (
        db.world_global_contests.find_one(
            {
                "season_id": "season-1",
                "contest_number": 100,
            }
        )
    )

    async def fake_user(request):
        return {
            "user_id": test_user,
            "name": "Local Continue Test",
        }

    routes.get_db = lambda: db
    routes.get_current_user = fake_user

    class Request:
        pass

    request = Request()

    try:
        await db.world_progress.delete_one(
            {
                "season_id": "season-1",
                "user_id": test_user,
            }
        )

        # ====================================================
        # TEST A
        # User is Stage 3.
        # Championship 4 is closed.
        # Championship 3 is NOT closed.
        #
        # MUST refuse.
        # ====================================================

        await db.world_progress.insert_one(
            {
                "season_id": "season-1",
                "user_id": test_user,
                "current_level": 10,
                "highest_unlocked_level": 10,
                "completed_levels":
                    list(range(1, 11)),
                "champion_stage": 3,
                "champion_ready": True,
                "season_complete": False,
            }
        )

        await db.world_global_contests.update_one(
            {
                "season_id": "season-1",
                "contest_number": 3,
            },
            {
                "$set": {
                    "status": "draft",
                }
            },
        )

        await db.world_global_contests.update_one(
            {
                "season_id": "season-1",
                "contest_number": 4,
            },
            {
                "$set": {
                    "status": "closed",
                }
            },
        )

        refused = False

        try:
            await routes.continue_after_champion(
                request
            )

        except HTTPException as exc:
            refused = True

            assert exc.status_code == 409

            detail = exc.detail

            assert (
                detail["code"]
                == "CHAMPION_PERIOD_NOT_CLOSED"
            )

            assert detail["champion_stage"] == 3

        assert refused

        progress = await db.world_progress.find_one(
            {
                "season_id": "season-1",
                "user_id": test_user,
            }
        )

        assert progress["champion_stage"] == 3
        assert progress["champion_ready"] is True

        print(
            "PASS A: later closed Championship "
            "cannot unlock Stage 3"
        )

        # ====================================================
        # TEST B
        # Close matching Championship 3.
        # User should move exactly 3 -> 4.
        # ====================================================

        await db.world_global_contests.update_one(
            {
                "season_id": "season-1",
                "contest_number": 3,
            },
            {
                "$set": {
                    "status": "closed",
                }
            },
        )

        result = await (
            routes.continue_after_champion(
                request
            )
        )

        assert result["continued"] is True
        assert result["season_complete"] is False
        assert (
            result["previous_champion_stage"]
            == 3
        )
        assert result["champion_stage"] == 4

        progress = await db.world_progress.find_one(
            {
                "season_id": "season-1",
                "user_id": test_user,
            }
        )

        assert progress["champion_stage"] == 4
        assert progress["champion_ready"] is False
        assert progress["current_level"] == 1

        print(
            "PASS B: matching Championship 3 "
            "advances exactly to Stage 4"
        )

        # ====================================================
        # TEST C
        # Stage 100 matching Championship closes.
        #
        # Must mark Season complete.
        # Must NOT reset Level 1.
        # Must NOT create Stage 101.
        # ====================================================

        await db.world_progress.update_one(
            {
                "season_id": "season-1",
                "user_id": test_user,
            },
            {
                "$set": {
                    "champion_stage": 100,
                    "champion_ready": True,
                    "season_complete": False,
                    "current_level": 10,
                    "highest_unlocked_level": 10,
                    "completed_levels":
                        list(range(1, 11)),
                },
                "$unset": {
                    "season_completed_at": "",
                },
            },
        )

        await db.world_global_contests.update_one(
            {
                "season_id": "season-1",
                "contest_number": 100,
            },
            {
                "$set": {
                    "status": "closed",
                }
            },
        )

        result = await (
            routes.continue_after_champion(
                request
            )
        )

        assert result["continued"] is True
        assert result["season_complete"] is True
        assert (
            result["previous_champion_stage"]
            == 100
        )
        assert result["champion_stage"] == 100

        progress = await db.world_progress.find_one(
            {
                "season_id": "season-1",
                "user_id": test_user,
            }
        )

        assert progress["champion_stage"] == 100
        assert progress["champion_ready"] is False
        assert progress["season_complete"] is True

        # Critical regression guard:
        # Final Season completion must preserve the user's
        # final progression and never reset to Level 1.
        assert progress["current_level"] == 10
        assert (
            progress["highest_unlocked_level"]
            == 10
        )

        assert progress.get(
            "season_completed_at"
        ) is not None

        print(
            "PASS C: Stage 100 completes Season"
        )

        print(
            "PASS C: no Stage 101"
        )

        print(
            "PASS C: Stage 100 does not reset "
            "to Level 1"
        )

    finally:
        routes.get_db = original_get_db
        routes.get_current_user = (
            original_get_current_user
        )

        await db.world_progress.delete_one(
            {
                "season_id": "season-1",
                "user_id": test_user,
            }
        )

        if progress_before is not None:
            await db.world_progress.insert_one(
                copy.deepcopy(
                    progress_before
                )
            )

        for number, snapshot in (
            (3, contest3_before),
            (4, contest4_before),
            (100, contest100_before),
        ):
            await db.world_global_contests.delete_one(
                {
                    "season_id": "season-1",
                    "contest_number": number,
                }
            )

            if snapshot is not None:
                await db.world_global_contests.insert_one(
                    copy.deepcopy(snapshot)
                )

        client.close()


asyncio.run(main())
