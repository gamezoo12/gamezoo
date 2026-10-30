# Paid World Winners (isolated API): admin approvals + wallet credit idempotency, winner visibility, publication,
# public Hall of Winners (winners / leaderboards / gallery), media validation, round-media hide, admin contests 'phase'.
# Run: TEST_DB_NAME=test_pw_iter54 scripts/run_isolated_backend_tests.sh tests/test_paid_winners.py -n 0
# (object storage is unavailable in the isolated API, so actual media upload/streaming is verified separately against preview)
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
P = "TEST_pw_"
SKILL, DRAW, PROMO, LIVE = f"c_{P}skill", f"c_{P}draw", f"promo_{P}x", f"c_{P}live"
AWAIT_PLAIN, AWAIT_PLAN, SKILL_ENDED_LIVE = f"c_{P}await1", f"c_{P}await2", f"c_{P}skill_live_ended"
LB_W, DS_PEND, DS_DONE, DS_HIDDEN, PROMO_W = f"w_{P}lb", f"w_{P}ds_pend", f"w_{P}ds_done", f"w_{P}ds_hidden", f"w_{P}promo"
CLIP, SHOT = f"rec_{P}clip", f"rec_{P}shot"
USERS = [(f"u_{P}{i}", n) for i, n in enumerate(["Jack Turner", "Sophie Wood", "Oscar King"])]
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000")


def _db():
    return MongoClient(MONGO_URL)[os.environ["DB_NAME"]]


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(os.environ["TEST_ADMIN_EMAIL"], os.environ["TEST_ADMIN_PASSWORD"])


@pytest.fixture(scope="module")
def player():
    return _login(os.environ["TEST_PLAYER_EMAIL"], os.environ["TEST_PLAYER_PASSWORD"])


def _cleanup(db):
    db.contests.delete_many({"contest_id": {"$regex": P}})
    db.game_scores.delete_many({"contest_id": {"$regex": P}})
    db.winners.delete_many({"winner_id": {"$regex": P}})
    db.draw_studio_plans.delete_many({"contest_id": {"$regex": P}})
    db.draw_studio_recordings.delete_many({"contest_id": {"$regex": P}})
    db.paid_winner_publication.delete_many({"contest_id": {"$regex": P}})
    db.users.delete_many({"user_id": {"$regex": P}})
    db.wallets.delete_many({"user_id": {"$regex": P}})
    db.wallet_tx.delete_many({"user_id": {"$regex": P}})
    db.wallet_admin_adjustments.delete_many({"user_id": {"$regex": P}})


@pytest.fixture(scope="module", autouse=True)
def seed():
    db = _db()
    _cleanup(db)
    now = datetime.now(timezone.utc)
    past = now - timedelta(days=1)
    for uid, name in USERS:
        db.users.insert_one({"user_id": uid, "email": f"{uid}@example.test", "name": name, "role": "user"})
    base = {"price": 1, "tickets_total": 100, "prize_amount": 100, "start_date": now - timedelta(days=5), "end_date": past}
    db.contests.insert_many([
        {**base, "contest_id": SKILL, "title": "[TEST] PW Skill", "status": "drawn", "game_type": "cryptogram"},
        {**base, "contest_id": DRAW, "title": "[TEST] PW Draw", "status": "closed", "game_type": None},
        {**base, "contest_id": PROMO, "title": "[TEST] PW Promo", "status": "closed", "game_type": None},
        {**base, "contest_id": LIVE, "title": "[TEST] PW Live", "status": "live", "game_type": None, "end_date": now + timedelta(days=30)},
        {**base, "contest_id": AWAIT_PLAIN, "title": "[TEST] PW await", "status": "closed", "game_type": None},
        {**base, "contest_id": AWAIT_PLAN, "title": "[TEST] PW await plan", "status": "closed", "game_type": None},
        {**base, "contest_id": SKILL_ENDED_LIVE, "title": "[TEST] PW skill ended", "status": "closed", "game_type": "memory_match"},
    ])
    db.draw_studio_plans.insert_many([{"plan_id": f"pl_{P}1", "contest_id": DRAW, "status": "completed"},
                                      {"plan_id": f"pl_{P}2", "contest_id": AWAIT_PLAN, "status": "draft"}])
    for i, (uid, name) in enumerate(USERS):
        db.game_scores.insert_one({"score_id": f"gs_{P}{i}", "contest_id": SKILL, "ticket_id": f"t_{P}{i}", "user_id": uid,
                                   "user_name": name, "points": 900 - i * 100, "accuracy": 0.9, "duration_ms": 10000 + i, "created_at": now})
    ds = {"contest_id": DRAW, "source": "draw_studio", "draw_round_index": 0, "drawn_at": now, "published": True}
    db.winners.insert_many([
        {"winner_id": LB_W, "contest_id": SKILL, "user_id": USERS[0][0], "user_name": "Jack Turner", "prize_amount": 20.0,
         "prize_bonus_tokens": 5.0, "paid_out": False, "drawn_at": now},
        {**ds, "winner_id": DS_PEND, "user_id": USERS[1][0], "user_name": "Sophie Wood", "prize_amount": 30.0, "approval_status": "pending",
         "paid_out": False},
        {**ds, "winner_id": DS_DONE, "user_id": USERS[2][0], "user_name": "Oscar King", "prize_amount": 50.0, "approval_status": "credited",
         "paid_out": True, "credited_at": now},
        {**ds, "winner_id": DS_HIDDEN, "user_id": USERS[0][0], "user_name": "Jack Turner", "prize_amount": 10.0, "approval_status": "credited",
         "paid_out": True, "credited_at": now, "public_hidden": True},
        {**ds, "winner_id": PROMO_W, "contest_id": PROMO, "user_id": USERS[0][0], "user_name": "Jack Turner", "prize_amount": 10.0,
         "approval_status": "pending", "paid_out": False},
    ])
    rec = {"contest_id": DRAW, "mode": "official", "status": "ready", "round_index": 0, "completed_at": now,
           "storage_path": "none/none", "content_type": "video/webm"}
    db.draw_studio_recordings.insert_many([{**rec, "recording_id": CLIP, "kind": "clip"},
                                           {**rec, "recording_id": SHOT, "kind": "screenshot", "content_type": "image/png"}])
    yield
    _cleanup(db)


def _wallet(uid):
    return _db().wallets.find_one({"user_id": uid}, {"_id": 0}) or {}


def _pub(admin, cid, w, lb, g, order=100):
    return admin.put(f"{BASE_URL}/api/admin/paid-winners/contests/{cid}/publication",
                     json={"show_winners": w, "show_leaderboard": lb, "show_gallery": g, "display_order": order})


# --- auth gating
class TestPaidWinners:  # single class: xdist loadscope keeps the shared seed on one worker
    def test_player_forbidden(self, player):
        assert player.get(f"{BASE_URL}/api/admin/paid-winners/winners").status_code == 403
        assert player.get(f"{BASE_URL}/api/admin/paid-winners/contests").status_code == 403
        assert player.post(f"{BASE_URL}/api/admin/paid-winners/winners/{LB_W}/approve", json={"wallet": "bonus"}).status_code == 403
        assert player.put(f"{BASE_URL}/api/admin/paid-winners/winners/{LB_W}/visibility", json={"visible": False}).status_code == 403
        assert player.put(f"{BASE_URL}/api/admin/paid-winners/contests/{SKILL}/publication",
                          json={"show_winners": True, "show_leaderboard": True, "show_gallery": True}).status_code == 403

    def test_anonymous_forbidden(self):
        assert requests.get(f"{BASE_URL}/api/admin/paid-winners/winners").status_code in (401, 403)


# --- admin winners list
    # ---- TestWinnersList
    def test_all_kinds_and_promo_excluded(self, admin):
        ws = admin.get(f"{BASE_URL}/api/admin/paid-winners/winners?kind=all").json()["winners"]
        ids = {w["winner_id"]: w for w in ws}
        assert PROMO_W not in ids and not any(w["contest_id"].startswith("promo_") for w in ws)
        assert ids[LB_W]["kind"] == "leaderboard" and ids[DS_PEND]["kind"] == "draw"
        assert ids[DS_HIDDEN]["public_visible"] is False and ids[DS_DONE]["public_visible"] is True

    def test_kind_and_status_filters(self, admin):
        d = admin.get(f"{BASE_URL}/api/admin/paid-winners/winners?kind=draw").json()["winners"]
        lb = admin.get(f"{BASE_URL}/api/admin/paid-winners/winners?kind=leaderboard").json()["winners"]
        assert all(w["kind"] == "draw" for w in d) and DS_PEND in [w["winner_id"] for w in d]
        assert all(w["kind"] == "leaderboard" for w in lb) and LB_W in [w["winner_id"] for w in lb]
        pend = admin.get(f"{BASE_URL}/api/admin/paid-winners/winners?status=pending").json()["winners"]
        assert all(w["status"] == "pending" for w in pend) and {LB_W, DS_PEND} <= {w["winner_id"] for w in pend}
        assert admin.get(f"{BASE_URL}/api/admin/paid-winners/winners?kind=bogus").status_code == 422


# --- approve & credit exactly once
    # ---- TestApprove
    def test_promo_and_unknown_404_invalid_wallet_422(self, admin):
        assert admin.post(f"{BASE_URL}/api/admin/paid-winners/winners/{PROMO_W}/approve", json={"wallet": "winnings"}).status_code == 404
        assert admin.post(f"{BASE_URL}/api/admin/paid-winners/winners/nope/approve", json={"wallet": "winnings"}).status_code == 404
        assert admin.post(f"{BASE_URL}/api/admin/paid-winners/winners/{LB_W}/approve", json={"wallet": "cash"}).status_code == 422

    def test_leaderboard_winner_bonus_wallet_once(self, admin):
        uid = USERS[0][0]
        before = _wallet(uid)
        r = admin.post(f"{BASE_URL}/api/admin/paid-winners/winners/{LB_W}/approve", json={"wallet": "bonus"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["idempotent_replay"] is False and d["winner"]["paid_out"] is True
        assert d["winner"]["credited_wallet"] == "bonus" and len(d["winner"]["wallet_transaction_ids"]) == 2
        after = _wallet(uid)
        assert round(after.get("bonus", 0) - before.get("bonus", 0), 2) == 20.0
        assert round(after.get("winning_bonus", 0) - before.get("winning_bonus", 0), 2) == 5.0
        assert round(after.get("balance", 0) - before.get("balance", 0), 2) == 25.0
        r2 = admin.post(f"{BASE_URL}/api/admin/paid-winners/winners/{LB_W}/approve", json={"wallet": "topup"})
        assert r2.status_code == 200 and r2.json()["idempotent_replay"] is True
        assert _wallet(uid).get("balance") == after.get("balance")
        assert _db().wallet_tx.count_documents({"user_id": uid}) == 2

    def test_draw_winner_topup_wallet_once(self, admin):
        uid = USERS[1][0]
        r = admin.post(f"{BASE_URL}/api/admin/paid-winners/winners/{DS_PEND}/approve", json={"wallet": "topup"})
        assert r.status_code == 200, r.text
        w = r.json()["winner"]
        assert w["approval_status"] == "credited" and w["credited_wallet"] == "topup" and w["approved_reward_type"] == "topup"
        wal = _wallet(uid)
        assert round(wal.get("balance", 0), 2) == 30.0 and not wal.get("bonus") and not wal.get("withdrawable")
        assert admin.post(f"{BASE_URL}/api/admin/paid-winners/winners/{DS_PEND}/approve", json={"wallet": "winnings"}).json()["idempotent_replay"] is True
        assert round(_wallet(uid).get("balance", 0), 2) == 30.0
        st = admin.get(f"{BASE_URL}/api/admin/paid-winners/winners?status=credited").json()["winners"]
        assert DS_PEND in [x["winner_id"] for x in st]


# --- publication, public list/detail, leaderboard, winner visibility, round media
    # ---- TestPublication
    def test_unpublished_hidden(self, admin):
        for t in ("winners", "leaderboards", "gallery"):
            ids = [c["contest_id"] for c in requests.get(f"{BASE_URL}/api/public/paid-winners?tab={t}").json()["contests"]]
            assert SKILL not in ids and DRAW not in ids
        for path in (f"{SKILL}/winners", f"{SKILL}/leaderboard", f"{DRAW}/gallery", f"round-media/{DRAW}/{CLIP}"):
            assert requests.get(f"{BASE_URL}/api/public/paid-winners/{path}").status_code == 404, path

    def test_publish_non_completed_404(self, admin):
        assert _pub(admin, LIVE, True, False, False).status_code == 404
        assert _pub(admin, SKILL, True, True, False, order=-1).status_code == 422

    def test_publish_tabs(self, admin):
        assert _pub(admin, SKILL, True, True, False, 2).status_code == 200
        assert _pub(admin, DRAW, True, False, True, 1).status_code == 200
        w = [c["contest_id"] for c in requests.get(f"{BASE_URL}/api/public/paid-winners?tab=winners").json()["contests"]]
        lb = [c["contest_id"] for c in requests.get(f"{BASE_URL}/api/public/paid-winners?tab=leaderboards").json()["contests"]]
        g = [c["contest_id"] for c in requests.get(f"{BASE_URL}/api/public/paid-winners?tab=gallery").json()["contests"]]
        assert w.index(DRAW) < w.index(SKILL)  # display order
        assert SKILL in lb and DRAW not in lb and DRAW in g and SKILL not in g

    def test_public_winners_masked_and_official_only(self, admin):
        r = requests.get(f"{BASE_URL}/api/public/paid-winners/{DRAW}/winners")
        assert r.status_code == 200
        names = [x["name"] for x in r.json()["winners"]]
        assert "Oscar K." in names and "Sophie W." in names  # credited + just credited
        assert "Jack T." not in names  # public_hidden
        assert all("user_id" not in x for x in r.json()["winners"])

    def test_leaderboard_masked_ranks(self, admin):
        r = requests.get(f"{BASE_URL}/api/public/paid-winners/{SKILL}/leaderboard")
        assert r.status_code == 200
        rows = r.json()["leaderboard"]
        assert [x["rank"] for x in rows] == [1, 2, 3] and [x["name"] for x in rows] == ["Jack T.", "Sophie W.", "Oscar K."]
        assert requests.get(f"{BASE_URL}/api/public/paid-winners/{DRAW}/leaderboard").status_code == 404

    def test_winner_visibility_toggle(self, admin):
        assert any(x["name"] == "Jack T." for x in requests.get(f"{BASE_URL}/api/public/paid-winners/{SKILL}/winners").json()["winners"])
        assert admin.put(f"{BASE_URL}/api/admin/paid-winners/winners/{LB_W}/visibility", json={"visible": False}).status_code == 200
        assert not requests.get(f"{BASE_URL}/api/public/paid-winners/{SKILL}/winners").json()["winners"]
        assert admin.put(f"{BASE_URL}/api/admin/paid-winners/winners/{LB_W}/visibility", json={"visible": True}).status_code == 200
        assert requests.get(f"{BASE_URL}/api/public/paid-winners/{SKILL}/winners").json()["winners"]
        assert admin.put(f"{BASE_URL}/api/admin/paid-winners/winners/nope/visibility", json={"visible": False}).status_code == 404

    def test_round_media_hide_show(self, admin):
        g = requests.get(f"{BASE_URL}/api/public/paid-winners/{DRAW}/gallery").json()
        assert g["round_media"] and g["round_media"][0].get("clip") == CLIP and g["round_media"][0].get("screenshot") == SHOT
        assert admin.put(f"{BASE_URL}/api/admin/paid-winners/contests/{DRAW}/round-media/{CLIP}/visibility", json={"visible": False}).status_code == 200
        g = requests.get(f"{BASE_URL}/api/public/paid-winners/{DRAW}/gallery").json()
        assert g["round_media"][0].get("clip") is None and g["round_media"][0].get("screenshot") == SHOT
        assert requests.get(f"{BASE_URL}/api/public/paid-winners/round-media/{DRAW}/{CLIP}").status_code == 404
        admin.put(f"{BASE_URL}/api/admin/paid-winners/contests/{DRAW}/round-media/{CLIP}/visibility", json={"visible": True})
        g = requests.get(f"{BASE_URL}/api/public/paid-winners/{DRAW}/gallery").json()
        assert g["round_media"][0].get("clip") == CLIP

    def test_admin_contests_listing(self, admin):
        cs = {c["contest_id"]: c for c in admin.get(f"{BASE_URL}/api/admin/paid-winners/contests").json()["contests"]}
        assert SKILL in cs and DRAW in cs and PROMO not in cs and LIVE not in cs
        assert cs[SKILL]["kind"] == "leaderboard" and cs[DRAW]["kind"] == "draw"
        assert cs[DRAW]["publication"]["show_gallery"] is True and cs[DRAW]["round_media"]
        assert cs[DRAW]["winner_counts"]["official"] == 2

    def test_media_upload_validation(self, admin):
        up = lambda cid, kind, name, data, ct: admin.post(f"{BASE_URL}/api/admin/paid-winners/contests/{cid}/media",
                                                          data={"kind": kind}, files={"file": (name, data, ct)})
        assert up(DRAW, "cover", "v.mp4", b"\x00" * 32, "video/mp4").status_code == 415
        assert up(DRAW, "gallery", "x.txt", b"hello", "text/plain").status_code == 415
        assert up(LIVE, "gallery", "a.png", PNG, "image/png").status_code == 404
        assert up(DRAW, "other", "a.png", PNG, "image/png").status_code == 422
        assert requests.get(f"{BASE_URL}/api/public/paid-winners/media/{DRAW}/nope").status_code == 404


# --- admin contests phase
    # ---- TestPhase
    def test_phase_values(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/contests")
        assert r.status_code == 200
        rows = {c["contest_id"]: c for c in r.json()}
        assert all("phase" in c for c in rows.values())
        assert rows[SKILL]["phase"] == "completed"
        assert rows[SKILL_ENDED_LIVE]["phase"] == "completed"
        assert rows[DRAW]["phase"] == "completed"
        assert rows[LIVE]["phase"] == "live"
        assert rows[AWAIT_PLAIN]["phase"] == "awaiting_draw"
        assert rows[AWAIT_PLAN]["phase"] == "awaiting_draw"
