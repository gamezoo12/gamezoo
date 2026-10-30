"""Isolated checks for the Visual Draw Studio (multi-round, verifiable, idempotent)."""
from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timezone

import pytest
import requests
from auth import create_jwt
from routers.draw_studio_routes import select_winners
from tests import test_admin_dashboard_stats_live as _dash
from tests.test_admin_dashboard_stats_live import API, db_insert, db_read


@pytest.fixture(scope="module")
def ds_db():
    return _dash._sanitize_db_name(_dash.os.environ["DB_NAME"])


def test_selection_is_uniform_and_distinct():
    counts = Counter()
    for i in range(3000):
        picks = select_winners(f"seed{i}", "p", 0, list(range(1, 11)), 3)
        assert len(set(picks)) == 3
        counts.update(picks)
    assert max(counts.values()) - min(counts.values()) < 300


def test_draw_studio_flow(ds_db):
    db_name = ds_db
    now = datetime.now(timezone.utc)
    sa_id, staff_id = f"ds_sa_{uuid.uuid4().hex[:8]}", f"ds_staff_{uuid.uuid4().hex[:8]}"
    cid = f"c_ds_{uuid.uuid4().hex[:8]}"
    users = [f"ds_u_{uuid.uuid4().hex[:6]}" for _ in range(5)]
    sa = {"Authorization": f"Bearer {create_jwt(sa_id)}"}
    staff = {"Authorization": f"Bearer {create_jwt(staff_id)}"}
    company = db_read(db_name, lambda db: db.settings.find_one({"_id": "company"}))

    def setup(db):
        async def run():
            await db.users.insert_many([{"user_id": sa_id, "email": f"{sa_id}@x.test", "role": "super_admin", "created_at": now},
                                        {"user_id": staff_id, "email": f"{staff_id}@x.test", "role": "admin", "created_at": now}] +
                                       [{"user_id": u, "email": f"{u}@x.test", "name": f"Test {u[-3:]} Person", "role": "user", "created_at": now} for u in users])
            await db.contests.insert_one({"contest_id": cid, "title": "DS test", "prize_amount": 450.0, "status": "closed", "created_at": now})
            await db.tickets.insert_many([{"ticket_id": f"t_{cid}_{n}", "order_id": "o", "contest_id": cid, "user_id": users[n % 5],
                                           "ticket_number": n, "created_at": now, **({"refunded": True} if n == 7 else {})} for n in range(1, 2001)])
            await db.settings.update_one({"_id": "company"}, {"$set": {"random_draw_engine_enabled": False}}, upsert=True)
        return run()
    db_insert(db_name, setup)
    try:
        assert requests.get(f"{API}/admin/draw-studio/contests", headers=staff, timeout=20).status_code == 403
        pool = requests.get(f"{API}/admin/draw-studio/contests/{cid}/pool", headers=sa, timeout=30).json()
        assert pool["count"] == 1999 and 7 not in [t["ticket_number"] for t in pool["tickets"]]
        rounds = [{"name": "Draw 1", "prize_amount": 300, "num_winners": 1, "duration_s": 20},
                  {"name": "Draw 2", "prize_amount": 50, "num_winners": 2, "duration_s": 20},
                  {"name": "Draw 3", "prize_amount": 25, "num_winners": 2, "duration_s": 20, "allow_previous_winners": True}]
        over = requests.post(f"{API}/admin/draw-studio/plans", headers=sa, json={"contest_id": cid, "rounds": rounds + [rounds[0]]}, timeout=20)
        assert over.status_code == 422
        plan = requests.post(f"{API}/admin/draw-studio/plans", headers=sa, json={"contest_id": cid, "rounds": rounds}, timeout=20).json()["plan"]
        assert plan["total_budget"] == 450 and "server_seed" not in plan
        pid = plan["plan_id"]
        assert requests.post(f"{API}/admin/draw-studio/plans/{pid}/rounds/0/draw", headers=sa, json={"confirmation": "DRAW ROUND 1"}, timeout=20).status_code == 423
        locked = requests.post(f"{API}/admin/draw-studio/plans/{pid}/lock", headers=sa, json={"confirmation": "LOCK DRAW"}, timeout=30).json()
        assert locked["plan"]["status"] == "locked" and locked["plan"]["pool_size"] == 1999 and "server_seed" not in locked["plan"]
        assert requests.put(f"{API}/admin/draw-studio/plans/{pid}", headers=sa, json={"contest_id": cid, "rounds": rounds}, timeout=20).status_code == 409
        second = requests.post(f"{API}/admin/draw-studio/plans", headers=sa, json={"contest_id": cid, "rounds": rounds[:1]}, timeout=20).json()["plan"]
        assert requests.post(f"{API}/admin/draw-studio/plans/{second['plan_id']}/lock", headers=sa, json={"confirmation": "LOCK DRAW"}, timeout=20).status_code == 409

        db_insert(db_name, lambda db: db.settings.update_one({"_id": "company"}, {"$set": {"random_draw_engine_enabled": True}}))
        assert requests.post(f"{API}/admin/draw-studio/plans/{pid}/rounds/1/draw", headers=sa, json={"confirmation": "DRAW ROUND 2"}, timeout=20).status_code == 409
        r0 = requests.post(f"{API}/admin/draw-studio/plans/{pid}/rounds/0/draw", headers=sa, json={"confirmation": "DRAW ROUND 1"}, timeout=20).json()
        again = requests.post(f"{API}/admin/draw-studio/plans/{pid}/rounds/0/draw", headers=sa, json={"confirmation": "DRAW ROUND 1"}, timeout=20).json()
        assert again["resumed"] is True and again["result"]["winners"] == r0["result"]["winners"]
        r1 = requests.post(f"{API}/admin/draw-studio/plans/{pid}/rounds/1/draw", headers=sa, json={"confirmation": "DRAW ROUND 2"}, timeout=20).json()
        first = {w["ticket_number"] for w in r0["result"]["winners"]}
        assert len(r1["result"]["winners"]) == 2 and not first & {w["ticket_number"] for w in r1["result"]["winners"]}
        assert r1["result"]["candidate_count"] == 1998
        r2 = requests.post(f"{API}/admin/draw-studio/plans/{pid}/rounds/2/draw", headers=sa, json={"confirmation": "DRAW ROUND 3"}, timeout=20).json()
        assert r2["result"]["candidate_count"] == 1999

        winners = db_read(db_name, lambda db: db.winners.find({"draw_plan_id": pid}, {"_id": 0}).to_list(20))
        assert len(winners) == 5 and all(w["payment_status"] == "pending" and not w["paid_out"] for w in winners)
        assert sum(w["prize_amount"] for w in winners) == 450
        wallet_tx = db_read(db_name, lambda db: db.wallet_transactions.count_documents({"user_id": {"$in": users}}))
        assert wallet_tx == 0

        report = requests.get(f"{API}/admin/draw-studio/plans/{pid}/report", headers=sa, timeout=30).json()
        assert report["verification"]["verified"] is True and report["plan"]["server_seed"]

        ann = requests.post(f"{API}/admin/draw-studio/plans/{pid}/rounds/0/announce", headers=sa, timeout=20).json()
        ann2 = requests.post(f"{API}/admin/draw-studio/plans/{pid}/rounds/0/announce", headers=sa, timeout=20).json()
        assert ann["announcement_id"] and ann2["idempotent_replay"] is True and ann2["announcement_id"] == ann["announcement_id"]
        tickets_after = db_read(db_name, lambda db: db.tickets.count_documents({"contest_id": cid}))
        assert tickets_after == 2000
    finally:
        def cleanup(db):
            async def run():
                await db.users.delete_many({"user_id": {"$in": [sa_id, staff_id, *users]}})
                await db.contests.delete_one({"contest_id": cid})
                await db.tickets.delete_many({"contest_id": cid})
                await db.winners.delete_many({"contest_id": cid})
                await db.draw_studio_plans.delete_many({"contest_id": cid})
                await db.draw_studio_results.delete_many({"contest_id": cid})
                await db.site_announcements.delete_many({"title": {"$regex": "^DS test"}})
                if company is not None:
                    await db.settings.replace_one({"_id": "company"}, company, upsert=True)
            return run()
        db_insert(db_name, cleanup)
