"""Draw Studio API regression via public URL (uses a temporary TEST_ contest seeded directly in local Mongo)."""
import io
import os
import struct
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api/admin/draw-studio"
SA = {"email": "bachanta8@gmail.com", "password": "Herts@910022"}
MONGO = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
DB = MONGO[os.environ.get("DB_NAME", "test_database")]
CID = f"TEST_c_ds_{uuid.uuid4().hex[:6]}"
STAFF_ID = f"TEST_ds_staff_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="module")
def sa():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=SA, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("token") or r.json().get("access_token")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module", autouse=True)
def seed():
    now = datetime.now(timezone.utc)
    prev_flag = (DB.settings.find_one({"_id": "company"}) or {}).get("random_draw_engine_enabled", False)
    DB.users.insert_one({"user_id": STAFF_ID, "email": f"{STAFF_ID}@x.test", "role": "admin", "created_at": now})
    DB.contests.insert_one({"contest_id": CID, "title": "TEST_ DS API", "prize_amount": 100.0, "status": "closed", "created_at": now})
    DB.tickets.insert_many([{"ticket_id": f"t_{CID}_{n}", "contest_id": CID, "user_id": STAFF_ID, "ticket_number": n,
                             "created_at": now, **({"refunded": True} if n == 3 else {})} for n in range(1, 21)])
    yield
    plans = [p["plan_id"] for p in DB.draw_studio_plans.find({"contest_id": CID})]
    for r in DB.draw_studio_results.find({"contest_id": CID}):
        if r.get("announcement_id"):
            DB.site_announcements.delete_one({"announcement_id": r["announcement_id"]})
    DB.draw_studio_results.delete_many({"contest_id": CID})
    DB.draw_studio_audit.delete_many({"plan_id": {"$in": plans}})
    DB.draw_studio_plans.delete_many({"contest_id": CID})
    DB.winners.delete_many({"contest_id": CID})
    DB.tickets.delete_many({"contest_id": CID})
    DB.contests.delete_one({"contest_id": CID})
    DB.users.delete_one({"user_id": STAFF_ID})
    DB.settings.update_one({"_id": "company"}, {"$set": {"random_draw_engine_enabled": prev_flag}})


ROUNDS = [{"name": "R1", "prize_amount": 50, "num_winners": 1, "duration_s": 10, "reveals": 2},
          {"name": "R2", "prize_amount": 25, "num_winners": 2, "duration_s": 10, "reveals": 2}]
STATE = {}


# Access control
def test_admin_role_gets_403():
    import sys
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    from auth import create_jwt
    h = {"Authorization": f"Bearer {create_jwt(STAFF_ID)}"}
    for path in ["/contests", f"/contests/{CID}/pool", "/plans", "/audio"]:
        assert requests.get(f"{API}{path}", headers=h, timeout=30).status_code == 403, path
    assert requests.post(f"{API}/plans", json={"contest_id": CID, "rounds": ROUNDS}, headers=h, timeout=30).status_code == 403


def test_unauthenticated_401():
    assert requests.get(f"{API}/contests", timeout=30).status_code in (401, 403)


# Pool & contests
def test_pool_excludes_refunded(sa):
    r = sa.get(f"{API}/contests/{CID}/pool", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 19 and len(d["pool_hash"]) == 64
    assert 3 not in [t["ticket_number"] for t in d["tickets"]]
    c = [x for x in sa.get(f"{API}/contests", timeout=30).json()["contests"] if x["contest_id"] == CID][0]
    assert c["eligible_tickets"] == 19


# Validation
def test_budget_over_published_422(sa):
    r = sa.post(f"{API}/plans", json={"contest_id": CID, "rounds": [{**ROUNDS[0], "prize_amount": 101}]}, timeout=30)
    assert r.status_code == 422 and "exceed" in r.json()["detail"]


def test_too_many_winners_422(sa):
    r = sa.post(f"{API}/plans", json={"contest_id": CID, "rounds": [{**ROUNDS[0], "prize_amount": 1, "num_winners": 20}]}, timeout=30)
    assert r.status_code == 422


def test_duration_bounds_422(sa):
    assert sa.post(f"{API}/plans", json={"contest_id": CID, "rounds": [{**ROUNDS[0], "duration_s": 5}]}, timeout=30).status_code == 422


# Plan lifecycle
def test_create_update_lock(sa):
    r = sa.post(f"{API}/plans", json={"contest_id": CID, "rounds": ROUNDS}, timeout=30)
    assert r.status_code == 200
    p = r.json()["plan"]
    assert p["status"] == "draft" and p["total_budget"] == 100 and "server_seed" not in p
    STATE["pid"] = p["plan_id"]
    u = sa.put(f"{API}/plans/{p['plan_id']}", json={"contest_id": CID, "rounds": ROUNDS}, timeout=30)
    assert u.status_code == 200
    assert sa.post(f"{API}/plans/{p['plan_id']}/lock", json={"confirmation": "nope"}, timeout=30).status_code == 400
    lk = sa.post(f"{API}/plans/{p['plan_id']}/lock", json={"confirmation": "LOCK DRAW"}, timeout=30)
    assert lk.status_code == 200
    lp = lk.json()["plan"]
    assert lp["status"] == "locked" and lp["pool_size"] == 19 and "server_seed" not in lp and len(lp["seed_commitment_sha256"]) == 64
    assert sa.put(f"{API}/plans/{p['plan_id']}", json={"contest_id": CID, "rounds": ROUNDS}, timeout=30).status_code == 409


def test_second_plan_lock_409(sa):
    p2 = sa.post(f"{API}/plans", json={"contest_id": CID, "rounds": ROUNDS[:1]}, timeout=30).json()["plan"]
    r = sa.post(f"{API}/plans/{p2['plan_id']}/lock", json={"confirmation": "LOCK DRAW"}, timeout=30)
    assert r.status_code == 409


def test_draw_flag_off_423(sa):
    DB.settings.update_one({"_id": "company"}, {"$set": {"random_draw_engine_enabled": False}})
    r = sa.post(f"{API}/plans/{STATE['pid']}/rounds/0/draw", json={"confirmation": "DRAW ROUND 1"}, timeout=30)
    assert r.status_code == 423


def test_draw_out_of_order_409_and_resume(sa):
    DB.settings.update_one({"_id": "company"}, {"$set": {"random_draw_engine_enabled": True}})
    pid = STATE["pid"]
    assert sa.post(f"{API}/plans/{pid}/rounds/1/draw", json={"confirmation": "DRAW ROUND 2"}, timeout=30).status_code == 409
    assert sa.post(f"{API}/plans/{pid}/rounds/0/draw", json={"confirmation": "DRAW ROUND 9"}, timeout=30).status_code == 400
    r1 = sa.post(f"{API}/plans/{pid}/rounds/0/draw", json={"confirmation": "DRAW ROUND 1"}, timeout=30)
    assert r1.status_code == 200 and r1.json()["resumed"] is False
    again = sa.post(f"{API}/plans/{pid}/rounds/0/draw", json={"confirmation": "DRAW ROUND 1"}, timeout=30).json()
    assert again["resumed"] is True
    assert [w["ticket_number"] for w in again["result"]["winners"]] == [w["ticket_number"] for w in r1.json()["result"]["winners"]]
    rep = sa.get(f"{API}/plans/{pid}/report", timeout=30).json()
    assert rep["verification"]["verified"] is None and "server_seed" not in rep["plan"]
    r2 = sa.post(f"{API}/plans/{pid}/rounds/1/draw", json={"confirmation": "DRAW ROUND 2"}, timeout=30).json()
    nums = [w["ticket_number"] for w in r2["result"]["winners"]]
    assert len(set(nums)) == 2 and r1.json()["result"]["winners"][0]["ticket_number"] not in nums
    assert sa.post(f"{API}/plans/{pid}/rounds/2/draw", json={"confirmation": "DRAW ROUND 3"}, timeout=30).status_code in (404, 409)


def test_winners_pending_and_report_verified(sa):
    pid = STATE["pid"]
    ws = list(DB.winners.find({"draw_plan_id": pid}))
    assert len(ws) == 3 and all(w["payment_status"] == "pending" and w["paid_out"] is False and w["source"] == "draw_studio" for w in ws)
    g = sa.get(f"{API}/plans/{pid}", timeout=30).json()
    assert g["plan"]["status"] == "completed" and len(g["results"]) == 2 and g["plan"]["server_seed"]
    rep = sa.get(f"{API}/plans/{pid}/report", timeout=30)
    assert "attachment" in rep.headers.get("content-disposition", "")
    assert rep.json()["verification"]["verified"] is True


def test_announce_idempotent(sa):
    pid = STATE["pid"]
    a = sa.post(f"{API}/plans/{pid}/rounds/0/announce", timeout=30)
    assert a.status_code == 200 and a.json()["idempotent_replay"] is False
    b = sa.post(f"{API}/plans/{pid}/rounds/0/announce", timeout=30).json()
    assert b["idempotent_replay"] is True and b["announcement_id"] == a.json()["announcement_id"]
    assert DB.site_announcements.count_documents({"announcement_id": a.json()["announcement_id"], "published": True}) == 1


def _wav():
    sr, n = 8000, 800
    data = b"".join(struct.pack("<h", 0) for _ in range(n))
    return b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16) + b"data" + struct.pack("<I", len(data)) + data


# Audio upload
def test_audio_upload_and_fetch(sa):
    bad = sa.post(f"{API}/audio/countdown", files={"file": ("x.txt", b"hi", "text/plain")}, timeout=30)
    assert bad.status_code == 415
    assert sa.post(f"{API}/audio/nope", files={"file": ("t.wav", _wav(), "audio/wav")}, timeout=30).status_code == 404
    up = sa.post(f"{API}/audio/countdown", files={"file": ("TEST_beep.wav", io.BytesIO(_wav()), "audio/wav")}, timeout=60)
    assert up.status_code == 200, up.text
    f = sa.get(f"{API}/audio/countdown/file", timeout=30)
    assert f.status_code == 200 and f.headers["content-type"].startswith("audio/") and f.content[:4] == b"RIFF"
