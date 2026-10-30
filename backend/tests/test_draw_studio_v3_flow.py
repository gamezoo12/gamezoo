# Draw Studio v3 (3D manual stages) — full API regression: plans, lock, rounds, announce-all, approvals, credit, public, promotion, settings, game lock
import os
import subprocess
import pytest
import requests
import pymongo
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CID = "c_drawstudio_e2e"
PID = "promo_drawstudio_test"
S = {}


@pytest.fixture(scope="module")
def db():
    return pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def api():
    subprocess.run(["python3", "scripts/seed_draw_studio_test.py", "--reset-e2e"], cwd="/app/backend", check=True,
                   capture_output=True)
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "bachanta8@gmail.com", "password": "Herts@910022"})
    if r.status_code != 200:
        pytest.skip("login failed")
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


def _ds(p):
    return f"{BASE_URL}/api/admin/draw-studio{p}"


# --- contests & pool
def test_contests_include_paid_and_promotion(api):
    r = api.get(_ds("/contests"))
    assert r.status_code == 200
    rows = r.json()["contests"]
    ids = {c["contest_id"]: c for c in rows}
    assert CID in ids and ids[CID]["kind"] == "paid_world" and ids[CID]["eligible_tickets"] == 1248
    assert PID in ids and ids[PID]["kind"] == "promotion"


@pytest.mark.parametrize("cid,count", [(CID, 1248), (PID, 300)])
def test_pool(api, cid, count):
    r = api.get(_ds(f"/contests/{cid}/pool"))
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == count and len(d["tickets"]) == count and d["official_draws_enabled"] is True


# --- full flow
def test_plan_lock_draw(api, db):
    rounds = [
        {"name": "Grand", "prize_amount": 300, "num_winners": 1, "reward_type": "winnings",
         "load_duration_s": 5, "mix_duration_s": 5, "reveal_duration_s": 5},
        {"name": "Runner", "prize_amount": 50, "num_winners": 2, "reward_type": "bonus",
         "load_duration_s": 5, "mix_duration_s": 5, "reveal_duration_s": 5},
    ]
    over = api.post(_ds("/plans"), json={"contest_id": CID, "rounds": [{**rounds[0], "prize_amount": 600}]})
    assert over.status_code == 422
    r = api.post(_ds("/plans"), json={"contest_id": CID, "rounds": rounds})
    assert r.status_code == 200, r.text
    plan = r.json()["plan"]
    assert plan["total_budget"] == 400 and plan["status"] == "draft"
    pid = S["plan"] = plan["plan_id"]
    assert api.post(_ds(f"/plans/{pid}/lock"), json={"confirmation": "nope"}).status_code == 400
    lk = api.post(_ds(f"/plans/{pid}/lock"), json={"confirmation": "LOCK DRAW"})
    assert lk.status_code == 200 and lk.json()["plan"]["status"] == "locked"
    assert "server_seed" not in lk.json()["plan"]
    # announce-all before draws -> 409
    assert api.post(_ds(f"/plans/{pid}/announce-all")).status_code == 409
    # out-of-order
    assert api.post(_ds(f"/plans/{pid}/rounds/1/draw"), json={"confirmation": "DRAW ROUND 2"}).status_code == 409
    d0 = api.post(_ds(f"/plans/{pid}/rounds/0/draw"), json={"confirmation": "DRAW ROUND 1"})
    assert d0.status_code == 200 and d0.json()["resumed"] is False
    w0 = d0.json()["result"]["winners"]
    rep = api.post(_ds(f"/plans/{pid}/rounds/0/draw"), json={"confirmation": "DRAW ROUND 1"})
    assert rep.json()["resumed"] is True
    assert [w["ticket_number"] for w in rep.json()["result"]["winners"]] == [w["ticket_number"] for w in w0]
    d1 = api.post(_ds(f"/plans/{pid}/rounds/1/draw"), json={"confirmation": "DRAW ROUND 2"})
    assert d1.status_code == 200
    w1 = d1.json()["result"]["winners"]
    assert len(w1) == 2 and w0[0]["ticket_number"] not in [w["ticket_number"] for w in w1]
    assert d1.json()["result"]["candidate_count"] == 1247
    S["w0"], S["w1"] = w0, w1
    for i in (0, 1):
        assert api.post(_ds(f"/plans/{pid}/rounds/{i}/revealed")).json()["ok"] is True
    g = api.get(_ds(f"/plans/{pid}")).json()
    assert g["plan"]["status"] == "completed" and len(g["results"]) == 2 and g["plan"].get("server_seed")
    rpt = api.get(_ds(f"/plans/{pid}/report")).json()
    assert rpt["verification"]["verified"] is True


def test_unpublished_not_public(api):
    ids = {w["winner_id"] for w in S["w0"] + S["w1"]}
    pub = requests.get(f"{BASE_URL}/api/public/winners?limit=200").json()
    assert not ids & {w["winner_id"] for w in pub}
    cw = requests.get(f"{BASE_URL}/api/public/contest-winners").json()["contests"]
    assert not ids & {w["winner_id"] for c in cw for w in c["winners"]}


def test_announce_all_and_public(api):
    pid = S["plan"]
    a = api.post(_ds(f"/plans/{pid}/announce-all"))
    assert a.status_code == 200 and a.json()["idempotent_replay"] is False
    b = api.post(_ds(f"/plans/{pid}/announce-all"))
    assert b.json()["idempotent_replay"] is True and b.json()["announcement_id"] == a.json()["announcement_id"]
    ids = {w["winner_id"] for w in S["w0"] + S["w1"]}
    cw = requests.get(f"{BASE_URL}/api/public/contest-winners").json()["contests"]
    grp = [c for c in cw if c["contest_id"] == CID]
    assert grp and ids <= {w["winner_id"] for w in grp[0]["winners"]}
    pub = requests.get(f"{BASE_URL}/api/public/winners?limit=200").json()
    assert ids <= {w["winner_id"] for w in pub}


# --- approvals
def test_pending_list(api):
    r = api.get(_ds("/winners?status=pending"))
    assert r.status_code == 200
    mine = [w for w in r.json()["winners"] if w.get("draw_plan_id") == S["plan"]]
    assert len(mine) == 3
    for w in mine:
        assert w["user_id"] and "username" in w and "user_full_name" in w and w["status"] == "pending"


def test_legacy_mark_paid_blocked(api):
    r = api.post(f"{BASE_URL}/api/admin/winners/{S['w0'][0]['winner_id']}/mark-paid")
    assert r.status_code == 409


def test_edit_validation(api):
    wid = S["w1"][0]["winner_id"]
    assert api.patch(_ds(f"/winners/{wid}"), json={"prize_amount": 40, "reward_type": "bonus", "reason": "abc"}).status_code == 422
    assert api.patch(_ds(f"/winners/{wid}"), json={"prize_amount": 200, "reward_type": "bonus", "reason": "too much"}).status_code == 422
    ok = api.patch(_ds(f"/winners/{wid}"), json={"prize_amount": 40, "reward_type": "bonus", "reason": "QA adjust"})
    assert ok.status_code == 200 and ok.json()["winner"]["prize_amount"] == 40
    assert ok.json()["winner"]["edit_history"][-1]["reason"] == "QA adjust"


def _bal(db, uid):
    w = db.wallets.find_one({"user_id": uid}) or {}
    return float(w.get("balance") or 0), float(w.get("withdrawable") or 0), float(w.get("bonus") or 0)


def test_approve_winnings_once(api, db):
    w = S["w0"][0]
    before = _bal(db, w["user_id"])
    a = api.post(_ds(f"/winners/{w['winner_id']}/approve"))
    assert a.status_code == 200, a.text
    assert a.json()["idempotent_replay"] is False and a.json()["winner"]["status" if "status" in a.json()["winner"] else "approval_status"] == "credited"
    b = api.post(_ds(f"/winners/{w['winner_id']}/approve"))
    assert b.json()["idempotent_replay"] is True
    after = _bal(db, w["user_id"])
    S["win_delta"] = (before, after)
    assert round(after[0] - before[0], 2) == 300.0
    assert api.patch(_ds(f"/winners/{w['winner_id']}"), json={"prize_amount": 10, "reward_type": "winnings", "reason": "after credit"}).status_code == 409


def test_approve_bonus_grant(api, db):
    w = S["w1"][0]
    a = api.post(_ds(f"/winners/{w['winner_id']}/approve"))
    assert a.status_code == 200, a.text
    g = db.bonus_grants.find_one({"ref_key": f"paid-world-draw:{w['winner_id']}"}) or \
        db.bonus_grants.find_one({"source": "paid_world_draw", "user_id": w["user_id"]})
    assert g and g.get("source") == "paid_world_draw"
    assert float(g.get("original_amount") or 0) == 40.0
    assert api.post(_ds(f"/winners/{w['winner_id']}/approve")).json()["idempotent_replay"] is True
    assert db.bonus_grants.count_documents({"ref_key": f"paid-world-draw:{w['winner_id']}"}) <= 1


def test_audit(api):
    r = api.get(_ds(f"/winners/{S['w1'][0]['winner_id']}/audit"))
    acts = [x["action"] for x in r.json()["audit"]]
    assert "reward_edited" in acts and "reward_credited" in acts


# --- promotion
def test_promotion_flow(api):
    r = api.post(_ds("/plans"), json={"contest_id": PID, "rounds": [{"name": "Main", "prize_amount": 100, "num_winners": 2,
                                                                        "load_duration_s": 5, "mix_duration_s": 5, "reveal_duration_s": 5}]})
    assert r.status_code == 200, r.text
    pid = r.json()["plan"]["plan_id"]
    assert api.post(_ds(f"/plans/{pid}/lock"), json={"confirmation": "LOCK DRAW"}).status_code == 200
    legacy = api.post(f"{BASE_URL}/api/admin/promotion/draw?promotion_id={PID}")
    assert legacy.status_code == 409
    d = api.post(_ds(f"/plans/{pid}/rounds/0/draw"), json={"confirmation": "DRAW ROUND 1"})
    assert d.status_code == 200 and len(d.json()["result"]["winners"]) == 2


# --- settings
def test_settings_and_backdrops(api):
    g = api.get(_ds("/settings"))
    assert g.status_code == 200
    orig = g.json()
    p = api.put(_ds("/settings"), json={"bonus_expiry_enabled": True, "bonus_expiry_days": 45, "volumes": {"music": 0.4, "bogus": 1}})
    assert p.status_code == 200 and p.json()["bonus_expiry_days"] == 45 and p.json()["volumes"].get("music") == 0.4
    assert "bogus" not in p.json()["volumes"]
    api.put(_ds("/settings"), json={"bonus_expiry_enabled": orig["bonus_expiry_enabled"], "bonus_expiry_days": orig["bonus_expiry_days"],
                                     "volumes": orig["volumes"]})
    b = api.get(_ds("/backdrops"))
    assert b.status_code == 200 and len(b.json().get("items") or b.json().get("backdrops") or []) > 0


# --- contest game lock
def test_contest_difficulty_validation(api, db):
    c = db.contests.find_one({"tickets_sold": 0, "game_type": {"$ne": None}}, {"_id": 0, "contest_id": 1, "game_type": 1}) or {}
    cid = c.get("contest_id") or CID
    r = api.put(f"{BASE_URL}/api/admin/contests/{cid}", json={"game_config": {"difficulty": 11}})
    assert r.status_code == 400, r.text


def test_contest_game_locked_with_tickets(api):
    r = api.put(f"{BASE_URL}/api/admin/contests/{CID}", json={"game_type": "memory_match", "game_config": {"difficulty": 3}})
    assert r.status_code == 409, r.text
