# Draw Studio 3D rebuild: official multi-round flow, publish, approvals, settings, RBAC (via public URL)
import os
import subprocess

import pytest
import requests
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api/admin/draw-studio"
CID = "c_drawstudio_e2e"
MDB = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]
ROUNDS = [
    {"name": "TEST_Grand Prize", "prize_amount": 300, "num_winners": 1, "reward_type": "winnings", "load_duration_s": 3, "mix_duration_s": 3, "reveal_duration_s": 3},
    {"name": "TEST_2nd Prize", "prize_amount": 100, "num_winners": 1, "reward_type": "bonus", "load_duration_s": 3, "mix_duration_s": 3, "reveal_duration_s": 3},
    {"name": "TEST_3rd Prize", "prize_amount": 50, "num_winners": 2, "reward_type": "winnings", "load_duration_s": 3, "mix_duration_s": 3, "reveal_duration_s": 3},
]
S = {}


def _login(email, pw):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def sa():
    subprocess.run(["python3", "scripts/seed_draw_studio_test.py", "--reset-e2e"], cwd="/app/backend", check=True)
    return _login("bachanta8@gmail.com", "Herts@910022")


@pytest.fixture(scope="module")
def player():
    return _login("player1@example.com", "Player@12345")


# RBAC
def test_rbac_non_super_admin_403(player):
    for path in ["/contests", "/plans", "/winners", "/settings", "/backdrops", "/audio"]:
        assert requests.get(API + path, headers=player, timeout=30).status_code == 403, path
    assert requests.get(API + "/winners").status_code in (401, 403)


# Settings / audio / backdrops
def test_settings_audio_backdrops(sa):
    s = requests.get(API + "/settings", headers=sa, timeout=30).json()
    assert "bonus_expiry_enabled" in s and "bonus_expiry_days" in s
    r = requests.put(API + "/settings", headers=sa, json={"bonus_expiry_enabled": True, "bonus_expiry_days": 45,
                                                         "volumes": {"music": 1.7, "reveal": -1, "entry": 0.4, "bogus": 0.5}}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["bonus_expiry_enabled"] is True and d["bonus_expiry_days"] == 45
    assert d["volumes"] == {"music": 1.0, "reveal": 0.0, "entry": 0.4}
    assert requests.put(API + "/settings", headers=sa, json={"bonus_expiry_days": 0}, timeout=30).status_code == 422
    a = requests.get(API + "/audio", headers=sa, timeout=30).json()
    assert list(a["slots"]) == ["entry", "music", "heartbeat", "countdown", "drumroll", "reveal", "announcement", "celebration"]
    b = requests.get(API + "/backdrops", headers=sa, timeout=30).json()
    assert len(b["items"]) >= 1 and all("headline" in i for i in b["items"])


# Plan create / lock
def test_create_and_lock_plan(sa):
    over = requests.post(API + "/plans", headers=sa, json={"contest_id": CID, "rounds": ROUNDS + [ROUNDS[0]]}, timeout=30)
    assert over.status_code == 422
    r = requests.post(API + "/plans", headers=sa, json={"contest_id": CID, "rounds": ROUNDS}, timeout=60)
    assert r.status_code == 200, r.text
    plan = r.json()["plan"]
    assert plan["total_budget"] == 500.0 and plan["status"] == "draft"
    S["pid"] = plan["plan_id"]
    assert requests.post(f"{API}/plans/{S['pid']}/lock", headers=sa, json={"confirmation": "lock"}, timeout=30).status_code == 400
    r = requests.post(f"{API}/plans/{S['pid']}/lock", headers=sa, json={"confirmation": "LOCK DRAW"}, timeout=60)
    assert r.status_code == 200, r.text
    p = r.json()["plan"]
    assert p["status"] == "locked" and p["pool_size"] == 1248 and "server_seed" not in p


# Draw rounds sequentially, announce-all
def test_draw_rounds_resume_and_announce(sa):
    pid = S["pid"]
    assert requests.post(f"{API}/plans/{pid}/announce-all", headers=sa, timeout=30).status_code == 409
    assert requests.post(f"{API}/plans/{pid}/rounds/1/draw", headers=sa, json={"confirmation": "DRAW ROUND 2"}, timeout=30).status_code == 409
    assert requests.post(f"{API}/plans/{pid}/rounds/0/draw", headers=sa, json={"confirmation": "DRAW ROUND 2"}, timeout=30).status_code == 400
    results = []
    for i in range(3):
        r = requests.post(f"{API}/plans/{pid}/rounds/{i}/draw", headers=sa, json={"confirmation": f"DRAW ROUND {i + 1}"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["resumed"] is False and len(d["result"]["winners"]) == ROUNDS[i]["num_winners"]
        again = requests.post(f"{API}/plans/{pid}/rounds/{i}/draw", headers=sa, json={"confirmation": "x"}, timeout=30).json()
        assert again["resumed"] is True
        assert [w["ticket_number"] for w in again["result"]["winners"]] == [w["ticket_number"] for w in d["result"]["winners"]]
        assert requests.post(f"{API}/plans/{pid}/rounds/{i}/revealed", headers=sa, timeout=30).json()["ok"] is True
        results.append(d["result"])
        if i == 0:
            assert requests.post(f"{API}/plans/{pid}/announce-all", headers=sa, timeout=30).status_code == 409
    nums = [w["ticket_number"] for r in results for w in r["winners"]]
    assert len(set(nums)) == 4
    S["winner_ids"] = [w["winner_id"] for r in results for w in r["winners"]]
    # unpublished winners must NOT be public
    pub = requests.get(f"{BASE}/api/public/winners?limit=200", timeout=30).json()
    assert not any(w.get("draw_plan_id") == pid for w in pub)
    cw = requests.get(f"{BASE}/api/public/contest-winners", timeout=30).json()
    assert not any(w["winner_id"] in S["winner_ids"] for g in cw["contests"] for w in g["winners"])
    plan = requests.get(f"{API}/plans/{pid}", headers=sa, timeout=30).json()["plan"]
    assert plan["status"] == "completed" and plan.get("server_seed")
    rep = requests.get(f"{API}/plans/{pid}/report", headers=sa, timeout=60).json()
    assert rep["verification"]["verified"] is True
    a1 = requests.post(f"{API}/plans/{pid}/announce-all", headers=sa, timeout=30)
    assert a1.status_code == 200 and a1.json()["idempotent_replay"] is False
    a2 = requests.post(f"{API}/plans/{pid}/announce-all", headers=sa, timeout=30).json()
    assert a2["idempotent_replay"] is True and a2["announcement_id"] == a1.json()["announcement_id"]
    assert MDB.winners.count_documents({"draw_plan_id": pid, "published": True}) == 4


def test_public_contest_winners_after_publish():
    cw = requests.get(f"{BASE}/api/public/contest-winners", timeout=30).json()
    groups = cw["contests"]
    g = [g for g in groups if g["contest_id"] == CID]
    assert g, cw
    ids = {w["winner_id"] for w in g[0]["winners"]}
    assert set(S["winner_ids"]) <= ids
    assert "user_id" not in str(cw)


# Winners & approvals
def test_winners_list_pending(sa):
    d = requests.get(API + "/winners?status=pending", headers=sa, timeout=30).json()
    assert set(d["counts"]) == {"pending", "approved", "credited"}
    mine = [w for w in d["winners"] if w["winner_id"] in S["winner_ids"]]
    assert len(mine) == 4
    for w in mine:
        assert w["status"] == "pending" and w["user_id"] and w["contest_title"] and w["draw_round_name"]
        assert "user_full_name" in w and "username" in w


def test_edit_validation_and_history(sa):
    wid = S["winner_ids"][0]  # Grand £300 winnings
    url = f"{API}/winners/{wid}"
    assert requests.patch(url, headers=sa, json={"prize_amount": 250, "reward_type": "winnings", "reason": "abc"}, timeout=30).status_code == 422
    over = requests.patch(url, headers=sa, json={"prize_amount": 350, "reward_type": "winnings", "reason": "Raise it please"}, timeout=30)
    assert over.status_code == 422 and "budget" in over.text
    ok = requests.patch(url, headers=sa, json={"prize_amount": 250, "reward_type": "winnings", "reason": "TEST_adjusted by test"}, timeout=30)
    assert ok.status_code == 200, ok.text
    w = ok.json()["winner"]
    assert w["prize_amount"] == 250 and len(w["edit_history"]) == 1 and w["edit_history"][0]["reason"] == "TEST_adjusted by test"
    # legacy mark-paid refused
    lp = requests.post(f"{BASE}/api/admin/winners/{wid}/mark-paid", headers=sa, timeout=30)
    assert lp.status_code == 409


def test_approve_winnings_once(sa):
    wid = S["winner_ids"][0]
    uid = MDB.winners.find_one({"winner_id": wid})["user_id"]
    before = MDB.wallet_tx.count_documents({"user_id": uid, "kind": "paid_prize_cash"})
    r = requests.post(f"{API}/winners/{wid}/approve", headers=sa, timeout=60)
    assert r.status_code == 200, r.text
    assert r.json()["idempotent_replay"] is False and r.json()["winner"]["approval_status"] == "credited"
    r2 = requests.post(f"{API}/winners/{wid}/approve", headers=sa, timeout=60).json()
    assert r2["idempotent_replay"] is True
    after = MDB.wallet_tx.count_documents({"user_id": uid, "kind": "paid_prize_cash"})
    assert after == before + 1, (before, after)
    tx = MDB.wallet_tx.find_one({"ref_order_id": f"paid-world:winner:{wid}:cash"})
    assert tx and abs(float(tx.get("amount")) - 250) < 0.01
    assert requests.patch(f"{API}/winners/{wid}", headers=sa, json={"prize_amount": 200, "reward_type": "winnings", "reason": "late edit"}, timeout=30).status_code == 409


def test_approve_bonus_creates_grant(sa):
    wid = S["winner_ids"][1]
    r = requests.post(f"{API}/winners/{wid}/approve", headers=sa, timeout=60)
    assert r.status_code == 200, r.text
    w = r.json()["winner"]
    assert w["status"] if "status" in w else True
    assert w["paid_out"] is True and w.get("bonus_grant_id")
    g = MDB.bonus_grants.find_one({"grant_id": w["bonus_grant_id"]})
    assert g and g.get("source") == "paid_world_draw" and float(g["original_amount"]) == 100 and g.get("expires_at")
    assert requests.post(f"{API}/winners/{wid}/approve", headers=sa, timeout=60).json()["idempotent_replay"] is True
    assert MDB.bonus_grants.count_documents({"ref_key": f"paid-world-draw:{wid}"}) == 1
    h = requests.get(f"{API}/winners/{wid}/audit", headers=sa, timeout=30).json()["audit"]
    assert any(a["action"] == "reward_credited" for a in h)
