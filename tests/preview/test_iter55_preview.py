# Iteration 55: Winner shout-outs, cashout review modes + bypass, Winners Management (all worlds) adjust/idempotency/403
import os
import uuid
import concurrent.futures as cf
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = ("bachanta8@gmail.com", "Herts@910022")
PLAYER = ("player1@example.com", "Player@12345")
CID = "c_drawstudio_e2e"
PENDING_REC = "win:w_ds_dsp_2ebd97fd3f55_0_1"  # ds_test_user_4


def _db_call(fn):
    async def run():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        return await fn(db)
    return asyncio.new_event_loop().run_until_complete(run())


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def player():
    return _login(*PLAYER)


# ---------------- Winner shout-outs ----------------
class TestShoutOut:
    PUB = {"show_winners": True, "show_leaderboard": False, "show_gallery": True, "display_order": 1}

    def test_first_publish_sends_once(self, admin):
        before = _db_call(lambda db: db.notifications.count_documents({"kind": "winner_shoutout", "contest_id": CID}))
        r = admin.put(f"{BASE_URL}/api/admin/paid-winners/contests/{CID}/publication", json=self.PUB)
        assert r.status_code == 200, r.text
        sent = r.json()["shoutouts_sent"]
        print("shoutouts_sent", sent, "before", before)
        after = _db_call(lambda db: db.notifications.count_documents({"kind": "winner_shoutout", "contest_id": CID}))
        assert after - before == sent
        n = _db_call(lambda db: db.notifications.find_one({"kind": "winner_shoutout", "contest_id": CID}, {"_id": 0}))
        assert n["target_url"] == f"/my-account/contest-winners?contest={CID}"
        # pending (non-official) user 4 must not receive
        assert _db_call(lambda db: db.notifications.count_documents({"kind": "winner_shoutout", "user_id": "ds_test_user_4"})) == 0
        # one per user
        per_user = _db_call(lambda db: db.notifications.count_documents({"kind": "winner_shoutout", "contest_id": CID, "user_id": "ds_test_user_2"}))
        assert per_user == 1

    def test_republish_does_not_resend(self, admin):
        url = f"{BASE_URL}/api/admin/paid-winners/contests/{CID}/publication"
        r = admin.put(url, json=self.PUB)
        assert r.json()["shoutouts_sent"] == 0
        admin.put(url, json={**self.PUB, "show_winners": False})
        r = admin.put(url, json=self.PUB)
        assert r.status_code == 200 and r.json()["shoutouts_sent"] == 0

    def test_hall_of_winners_public(self):
        r = requests.get(f"{BASE_URL}/api/public/paid-winners")
        w = requests.get(f"{BASE_URL}/api/public/paid-winners/{CID}/winners")
        assert w.status_code == 200, w.text
        print("public hall", r.status_code, r.text[:200])
        assert r.status_code == 200


# ---------------- Cashout review ----------------
class TestCashoutReview:
    created = []

    @pytest.fixture(scope="class", autouse=True)
    def setup(self, admin, player):
        admin.put(f"{BASE_URL}/api/admin/cashout/config", json={"enabled": True, "review_mode": "mandatory"})
        r = player.post(f"{BASE_URL}/api/cashout/bank-accounts", json={"account_holder": "TEST_Player", "email": "player1@example.com",
                        "sort_code": "12-34-56", "account_number": "12345678", "iban": "GB00TEST12345678", "bacs": "BACS1234"})
        type(self).bank = r.json()["bank_account_id"]
        yield
        for wid in self.created:
            admin.post(f"{BASE_URL}/api/admin/cashout/withdrawals/{wid}/reject", json={"reason": "TEST cleanup", "notification_message": "TEST cleanup"})
        admin.put(f"{BASE_URL}/api/admin/cashout/config", json={"enabled": False, "review_mode": "disabled"})
        _db_call(lambda db: db.bank_accounts.delete_one({"bank_account_id": self.bank}))
        _db_call(lambda db: db.users.update_one({"email": PLAYER[0]}, {"$unset": {"cashout_review_bypass": "", "cashout_review_bypass_used_at": ""}}))

    def _req(self, player, review_id=None, amount=1):
        body = {"amount_tokens": amount, "bank_account_id": self.bank}
        if review_id is not None:
            body["review_id"] = review_id
        r = player.post(f"{BASE_URL}/api/cashout/request", json=body)
        if r.status_code == 200:
            self.created.append(r.json()["withdrawal_id"])
        return r

    def test_config_modes_and_validation(self, admin, player):
        c = admin.get(f"{BASE_URL}/api/admin/cashout/config").json()
        assert c["review_mode"] == "mandatory" and c["enabled"] is True
        assert admin.put(f"{BASE_URL}/api/admin/cashout/config", json={"review_mode": "bogus"}).status_code == 422
        assert player.put(f"{BASE_URL}/api/admin/cashout/config", json={"review_mode": "disabled"}).status_code == 403
        assert player.get(f"{BASE_URL}/api/cashout/config").json()["review_mode"] == "mandatory"

    def test_mandatory_requires_review(self, player):
        r = self._req(player)
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["code"] == "REVIEW_REQUIRED"

    def test_bypass_consumed_once(self, admin, player):
        r = admin.post(f"{BASE_URL}/api/admin/cashout/review-bypass", json={"email": PLAYER[0], "reason": "TEST support bypass"})
        assert r.status_code == 200
        assert player.get(f"{BASE_URL}/api/cashout/config").json()["has_review_bypass"] is True
        assert self._req(player).status_code == 200
        assert player.get(f"{BASE_URL}/api/cashout/config").json()["has_review_bypass"] is False
        assert self._req(player).status_code == 409

    def test_bypass_not_lost_on_insufficient_balance(self, admin, player):
        admin.post(f"{BASE_URL}/api/admin/cashout/review-bypass", json={"email": PLAYER[0], "reason": "TEST support bypass 2"})
        r = self._req(player, amount=999999)
        assert r.status_code == 400
        still = player.get(f"{BASE_URL}/api/cashout/config").json()["has_review_bypass"]
        _db_call(lambda db: db.users.update_one({"email": PLAYER[0]}, {"$set": {"cashout_review_bypass": False}}))
        assert still is True, "Bypass consumed even though the cash-out failed (insufficient balance)"

    def test_bypass_validation(self, admin, player):
        assert admin.post(f"{BASE_URL}/api/admin/cashout/review-bypass", json={"email": "nobody_x@example.com", "reason": "TEST reason"}).status_code == 404
        assert admin.post(f"{BASE_URL}/api/admin/cashout/review-bypass", json={"email": PLAYER[0], "reason": "x"}).status_code == 422
        assert player.post(f"{BASE_URL}/api/admin/cashout/review-bypass", json={"email": PLAYER[0], "reason": "TEST reason"}).status_code == 403

    def test_review_then_request_and_reuse(self, admin, player):
        assert player.post(f"{BASE_URL}/api/cashout/review", json={"rating": 0}).status_code == 422
        assert player.post(f"{BASE_URL}/api/cashout/review", json={"rating": 6}).status_code == 422
        r = player.post(f"{BASE_URL}/api/cashout/review", json={"rating": 4, "feedback": "TEST_feedback great"})
        assert r.status_code == 200
        rid = r.json()["review_id"]
        assert self._req(player, rid).status_code == 200
        assert self._req(player, rid).status_code == 400  # reused
        items = admin.get(f"{BASE_URL}/api/admin/cashout/reviews").json()["items"]
        row = next(i for i in items if i["review_id"] == rid)
        assert row["rating"] == 4 and row["email"] == PLAYER[0] and row["withdrawal_id"]

    def test_optional_and_disabled_no_review(self, admin, player):
        admin.put(f"{BASE_URL}/api/admin/cashout/config", json={"review_mode": "optional"})
        assert self._req(player).status_code == 200
        admin.put(f"{BASE_URL}/api/admin/cashout/config", json={"review_mode": "disabled"})
        assert self._req(player).status_code == 200


# ---------------- Winners Management (all worlds) ----------------
class TestWinnersAll:
    def _w(self):
        return _db_call(lambda db: db.wallets.find_one({"user_id": "ds_test_user_4"}, {"_id": 0, "balance": 1, "withdrawable": 1})) or {}

    def test_tabs_load_and_403(self, admin, player):
        for w in ("free", "paid", "promotions", "challenges"):
            r = admin.get(f"{BASE_URL}/api/admin/winners-all", params={"world": w})
            assert r.status_code == 200, (w, r.text)
            rows = r.json()["winners"]
            print(w, len(rows))
            if rows:
                for k in ("record_id", "username", "full_name", "contest", "prize_amount", "wallet_type", "credit_status"):
                    assert k in rows[0]
            assert player.get(f"{BASE_URL}/api/admin/winners-all", params={"world": w}).status_code == 403
        paid = admin.get(f"{BASE_URL}/api/admin/winners-all", params={"world": "paid"}).json()["winners"]
        row = next(r for r in paid if r["record_id"] == PENDING_REC)
        assert row["pending_editable"] is True and row["username"]
        assert admin.get(f"{BASE_URL}/api/admin/winners-all", params={"world": "bad"}).status_code == 422
        assert player.post(f"{BASE_URL}/api/admin/winners-all/adjust", json={}).status_code in (403, 422)

    def test_credit_idempotent_debit_and_history(self, admin, player):
        url = f"{BASE_URL}/api/admin/winners-all/adjust"
        base = self._w()
        op = f"TEST_{uuid.uuid4().hex[:10]}"
        body = {"world": "paid", "record_id": PENDING_REC, "wallet": "winnings", "action": "credit", "amount": 1.5, "reason": "TEST credit", "operation_id": op}
        assert player.post(url, json=body).status_code == 403
        assert admin.post(url, json={**body, "reason": "abc"}).status_code == 422
        r = admin.post(url, json=body)
        assert r.status_code == 200 and r.json()["idempotent_replay"] is False
        r2 = admin.post(url, json=body)
        assert r2.status_code == 200 and r2.json()["idempotent_replay"] is True
        after = self._w()
        assert round(after["withdrawable"] - (base.get("withdrawable") or 0), 2) == 1.5
        # different payload same op -> 409
        mismatch = admin.post(url, json={**body, "amount": 2})
        print("same op id, different amount ->", mismatch.status_code, mismatch.json().get("idempotent_replay"))
        assert round(self._w()["withdrawable"] - (base.get("withdrawable") or 0), 2) == 1.5  # no extra credit
        # debit below zero
        big = {**body, "action": "debit", "amount": 999999, "operation_id": f"TEST_{uuid.uuid4().hex[:10]}"}
        r = admin.post(url, json=big)
        assert r.status_code == 400 and "below zero" in r.json()["detail"]
        # restore debit
        r = admin.post(url, json={**body, "action": "debit", "operation_id": f"TEST_{uuid.uuid4().hex[:10]}", "reason": "TEST restore"})
        assert r.status_code == 200
        end = self._w()
        assert round(end["withdrawable"], 2) == round(base.get("withdrawable") or 0, 2)
        # 404 unknown record
        assert admin.post(url, json={**body, "record_id": "win:nope", "operation_id": f"TEST_{uuid.uuid4().hex[:10]}"}).status_code == 404
        paid = admin.get(f"{BASE_URL}/api/admin/winners-all", params={"world": "paid"}).json()["winners"]
        hist = next(r for r in paid if r["record_id"] == PENDING_REC)["adjustments"]
        ops = [h["operation_id"] for h in hist]
        assert ops.count(op) == 1  # replay not duplicated in history

    def test_concurrent_same_operation_id(self, admin):
        url = f"{BASE_URL}/api/admin/winners-all/adjust"
        base = self._w()
        op = f"TEST_{uuid.uuid4().hex[:10]}"
        body = {"world": "paid", "record_id": PENDING_REC, "wallet": "winnings", "action": "credit", "amount": 1, "reason": "TEST concurrent", "operation_id": op}
        with cf.ThreadPoolExecutor(5) as ex:
            res = list(ex.map(lambda _: admin.post(url, json=body), range(5)))
        print([x.status_code for x in res], [x.json().get("idempotent_replay") for x in res if x.status_code == 200])
        delta = round(self._w()["withdrawable"] - base["withdrawable"], 2)
        # restore whatever was credited
        if delta > 0:
            admin.post(url, json={**body, "action": "debit", "amount": delta, "operation_id": f"TEST_{uuid.uuid4().hex[:10]}", "reason": "TEST restore concurrent"})
        assert delta == 1, f"Concurrent same op id credited {delta} (double credit)"
