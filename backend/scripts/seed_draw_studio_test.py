"""DEV ONLY: seed a test Paid World contest with 1,000 real ticket records for Draw Studio testing."""
import asyncio
import os
import random
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
CONTEST_ID = "c_drawstudio_test"
NAMES = ["Amelia Hart", "Oliver Grant", "Isla Moore", "Noah Patel", "Ava Clarke", "Leo Byrne", "Mia Evans",
         "Harry Shah", "Grace Lee", "Jack Turner", "Sophie Wood", "Oscar King"]


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    users = [{"user_id": f"ds_test_user_{i}", "email": f"ds.test{i}@example.test", "name": n, "role": "user",
              "created_at": now, "is_test_account": True} for i, n in enumerate(NAMES)]
    for u in users:
        await db.users.update_one({"user_id": u["user_id"]}, {"$setOnInsert": u}, upsert=True)
    await db.contests.update_one({"contest_id": CONTEST_ID}, {"$setOnInsert": {
        "contest_id": CONTEST_ID, "title": "[TEST] Draw Studio £450 Prize Draw", "prize_amount": 450.0,
        "price": 1.0, "tickets_total": 1000, "tickets_sold": 1000, "status": "closed", "entry_mode": "random_tickets",
        "engine_type": "random_draw", "created_at": now, "is_test_contest": True}}, upsert=True)
    if await db.tickets.count_documents({"contest_id": CONTEST_ID}) == 0:
        rng = random.Random(42)
        await db.tickets.insert_many([{"ticket_id": f"t_ds_{n}", "order_id": f"o_ds_{n // 10}", "contest_id": CONTEST_ID,
                                       "user_id": rng.choice(users)["user_id"], "ticket_number": n, "created_at": now}
                                      for n in range(1, 1001)])
    print("seeded", await db.tickets.count_documents({"contest_id": CONTEST_ID}), "tickets")


asyncio.run(main())
