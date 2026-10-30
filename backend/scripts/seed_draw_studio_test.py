"""DEV ONLY: seed test Paid World contests with real ticket records for Draw Studio testing.

`--reset-e2e` wipes draw plans/results/pending winners of the E2E contest so the full flow can be re-run.
"""
import sys
import asyncio
import os
import random
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
CONTEST_ID = "c_drawstudio_test"
E2E_ID = "c_drawstudio_e2e"
NAMES = ["Amelia Hart", "Oliver Grant", "Isla Moore", "Noah Patel", "Ava Clarke", "Leo Byrne", "Mia Evans",
         "Harry Shah", "Grace Lee", "Jack Turner", "Sophie Wood", "Oscar King"]


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    users = [{"user_id": f"ds_test_user_{i}", "email": f"ds.test{i}@example.test", "name": n, "role": "user",
              "username": n.split()[0].lower() + str(i),
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
    for u in users:
        await db.users.update_one({"user_id": u["user_id"], "username": {"$exists": False}}, {"$set": {"username": u["username"]}})
    await db.contests.update_one({"contest_id": E2E_ID}, {"$setOnInsert": {
        "contest_id": E2E_ID, "title": "[TEST] Draw Studio E2E £500 Grand Prize", "prize_amount": 500.0,
        "price": 1.0, "tickets_total": 1248, "tickets_sold": 1248, "status": "closed", "entry_mode": "random_tickets",
        "engine_type": "random_draw", "created_at": now, "is_test_contest": True}}, upsert=True)
    if await db.tickets.count_documents({"contest_id": E2E_ID}) == 0:
        rng = random.Random(7)
        await db.tickets.insert_many([{"ticket_id": f"t_dse_{n}", "order_id": f"o_dse_{n // 10}", "contest_id": E2E_ID,
                                       "user_id": rng.choice(users)["user_id"], "ticket_number": n, "created_at": now}
                                      for n in range(1, 1249)])
    if "--reset-e2e" in sys.argv:
        plans = [p["plan_id"] async for p in db.draw_studio_plans.find({"contest_id": E2E_ID}, {"plan_id": 1})]
        await db.draw_studio_results.delete_many({"plan_id": {"$in": plans}})
        await db.draw_studio_plans.delete_many({"contest_id": E2E_ID})
        await db.winners.delete_many({"contest_id": E2E_ID, "paid_out": {"$ne": True}})
        print("reset e2e draw plans", len(plans))
    print("seeded", await db.tickets.count_documents({"contest_id": CONTEST_ID}), "+",
          await db.tickets.count_documents({"contest_id": E2E_ID}), "tickets")


asyncio.run(main())
