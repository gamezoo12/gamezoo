"""
Deterministic test scenario for Free World token retry + early unlock.

Sets up:
- Active Free World contest #1 (open now; Level 1 available, Level 2 time-locked).
- player1@example.com : Level 1 completed, 350 tokens (success flows).
- player_broke@example.com : Level 1 completed, 0 tokens (insufficient flows).

Idempotent: safe to re-run. Does NOT touch paid contests/wallet of other users.
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

SEASON = "season-1"


async def ensure_user(db, email, name, public_id, password_hash):
    existing = await db.users.find_one({"email": email})
    if existing:
        return existing["user_id"]

    user_id = f"user_{public_id.lower()}"
    now = datetime.now(timezone.utc)
    await db.users.insert_one(
        {
            "user_id": user_id,
            "email": email,
            "name": name,
            "public_id": public_id,
            "role": "user",
            "method": "password",
            "password_hash": password_hash,
            "email_verified": True,
            "email_verified_at": now,
            "phone": "+447000000002",
            "phone_verified": True,
            "phone_verified_at": now,
            "terms_accepted_at": now,
            "suspended": False,
            "must_change_password": False,
            "referral_code": public_id,
            "created_at": now,
        }
    )
    return user_id


async def set_wallet(db, user_id, balance):
    await db.wallets.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                "balance": float(balance),
                "applied_tx_refs": [],
                "lifetime_spend": 0.0,
                "lifetime_tokens_spent": 0,
            }
        },
        upsert=True,
    )


async def set_progress(db, user_id):
    await db.world_progress.update_one(
        {"user_id": user_id, "season_id": SEASON},
        {
            "$set": {
                "user_id": user_id,
                "season_id": SEASON,
                "current_level": 2,
                "highest_unlocked_level": 2,
                "completed_levels": [1],
                "champion_stage": 1,
                "champion_ready": False,
                "token_unlocked_levels": [],
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    # Clear any prior token reservations for a clean idempotency test.
    await db.world_level_unlock_reservations.delete_many({"user_id": user_id})
    await db.world_token_retry_daily.delete_many({"user_id": user_id})
    await db.world_token_retry_reservations.delete_many({"user_id": user_id})


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]

    now = datetime.now(timezone.utc)

    # Activate contest 1 as an open season starting now.
    await db.world_global_contests.update_many(
        {"season_id": SEASON, "status": "active", "contest_number": {"$ne": 1}},
        {"$set": {"status": "closed", "updated_at": now}},
    )
    await db.world_global_contests.update_one(
        {"season_id": SEASON, "contest_number": 1},
        {
            "$set": {
                "status": "active",
                "start_at": now,
                "end_at": now + timedelta(days=200),
                "activated_at": now,
                "updated_at": now,
            }
        },
    )
    await db.world_settings.update_one(
        {"_id": "active_global_contest"},
        {"$set": {"_id": "active_global_contest", "season_id": SEASON, "contest_number": 1, "updated_at": now}},
        upsert=True,
    )

    p1 = await db.users.find_one({"email": "player1@example.com"})
    p1_id = p1["user_id"]
    p1_hash = p1["password_hash"]

    await set_wallet(db, p1_id, 350)
    await set_progress(db, p1_id)

    broke_id = await ensure_user(
        db, "player_broke@example.com", "Broke Player", "PL20002", p1_hash
    )
    await set_wallet(db, broke_id, 0)
    await set_progress(db, broke_id)

    # Report
    ac = await db.world_global_contests.find_one({"status": "active"})
    lc = ac.get("levels_config") or []
    print("Active contest:", ac.get("contest_number"), "start", ac.get("start_at"))
    print("L2 unlock_after_days:", lc[1].get("unlock_after_days") if len(lc) > 1 else None,
          "token_unlock_enabled:", lc[1].get("token_unlock_enabled") if len(lc) > 1 else None,
          "token_unlock_cost:", lc[1].get("token_unlock_cost") if len(lc) > 1 else None)
    print("player1:", p1_id, "balance 350, L1 completed")
    print("player_broke:", broke_id, "balance 0, L1 completed (password same as player1)")
    c.close()


if __name__ == "__main__":
    asyncio.run(main())
