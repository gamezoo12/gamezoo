"""End-to-end backend tests for Cash-Out feature (iter42).

Covers:
- Config flag gating (disabled -> 403 on /request)
- Wallet summary shape (total, tokens, bonus, available)
- Bank account add/list (never exposing full account_number)
- Cash-out request while enabled (reserves withdrawable)
- My requests list masking (no account_number)
- Admin mark-paid (idempotent) + reject (releases tokens)
- Over-withdraw protection (400)
- Security: normal user cannot hit admin endpoints
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PLAYER = (os.environ.get("TEST_PLAYER_EMAIL", ""), os.environ.get("TEST_PLAYER_PASSWORD", ""))
ADMIN = (os.environ.get("TEST_ADMIN_EMAIL", ""), os.environ.get("TEST_ADMIN_PASSWORD", ""))


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_token():
    return _login(*PLAYER)


@pytest.fixture(scope="module")
def admin_token():
    return _login(*ADMIN)


def uh(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- Helpers to set the flag deterministically ----------

def _set_flag(admin_token, enabled: bool, extra=None):
    body = {"enabled": enabled}
    if extra:
        body.update(extra)
    r = requests.put(f"{API}/admin/cashout/config", json=body, headers=uh(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# =============================================================================
# 1. Flag off -> POST /cashout/request 403
# =============================================================================
class TestFlagGating:
    def test_disable_then_request_forbidden(self, admin_token, user_token):
        _set_flag(admin_token, False)
        cfg = requests.get(f"{API}/cashout/config", headers=uh(user_token), timeout=30).json()
        assert cfg["enabled"] is False

        # Need a bank id (add first, since bank creation is allowed regardless of flag)
        bank = requests.post(f"{API}/cashout/bank-accounts", headers=uh(user_token),
                             json={"account_holder": "TEST Player", "sort_code": "12-34-56",
                                   "account_number": "12345678"}, timeout=30)
        assert bank.status_code == 200, bank.text

        r = requests.post(f"{API}/cashout/request", headers=uh(user_token),
                          json={"amount_tokens": 5, "bank_account_id": bank.json()["bank_account_id"]},
                          timeout=30)
        assert r.status_code == 403, f"Expected 403 when disabled, got {r.status_code} {r.text}"


# =============================================================================
# 2. Wallet summary shape
# =============================================================================
class TestSummary:
    def test_summary_shape(self, user_token):
        r = requests.get(f"{API}/cashout/summary", headers=uh(user_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_tokens", "tokens", "bonus_tokens", "available_to_cash_out", "pending_cash_out"):
            assert k in d, f"missing {k}"
        # tokens = total - bonus (spendable purchase portion)
        assert d["tokens"] == d["total_tokens"] - d["bonus_tokens"], d
        # player1 should have withdrawable seeded
        assert d["available_to_cash_out"] >= 0


# =============================================================================
# 3. Security: normal user cannot access admin endpoints
# =============================================================================
class TestSecurity:
    def test_user_cannot_list_admin_withdrawals(self, user_token):
        r = requests.get(f"{API}/admin/cashout/withdrawals", headers=uh(user_token), timeout=30)
        assert r.status_code in (401, 403), f"Got {r.status_code}: {r.text}"

    def test_user_cannot_read_admin_config(self, user_token):
        r = requests.get(f"{API}/admin/cashout/config", headers=uh(user_token), timeout=30)
        assert r.status_code in (401, 403)

    def test_user_cannot_update_admin_config(self, user_token):
        r = requests.put(f"{API}/admin/cashout/config", headers=uh(user_token),
                         json={"enabled": True}, timeout=30)
        assert r.status_code in (401, 403)

    def test_user_requests_never_include_full_account_number(self, user_token):
        r = requests.get(f"{API}/cashout/requests", headers=uh(user_token), timeout=30)
        assert r.status_code == 200
        for row in r.json().get("items", []):
            assert "account_number" not in row, "Full account_number leaked in /cashout/requests"


# =============================================================================
# 4. Full flow: enable -> request -> admin mark paid (idempotent)
# =============================================================================
class TestFullFlow:
    def test_enable_and_full_lifecycle(self, admin_token, user_token):
        _set_flag(admin_token, True,
                  {"google_review_url": "https://g.example/review",
                   "trustpilot_review_url": "https://tp.example/review"})

        cfg = requests.get(f"{API}/cashout/config", headers=uh(user_token), timeout=30).json()
        assert cfg["enabled"] is True
        assert cfg["google_review_url"].startswith("http")
        assert cfg["trustpilot_review_url"].startswith("http")

        # summary snapshot
        s0 = requests.get(f"{API}/cashout/summary", headers=uh(user_token), timeout=30).json()
        avail0 = s0["available_to_cash_out"]
        pending0 = s0.get("pending_cash_out", 0)
        assert avail0 >= 20, f"Player1 seed expected >=20 withdrawable, got {avail0}"

        # add bank
        b = requests.post(f"{API}/cashout/bank-accounts", headers=uh(user_token),
                          json={"account_holder": "TEST P One", "sort_code": "11-22-33",
                                "account_number": "87654321"}, timeout=30).json()
        # ensure masked-only in list
        lst = requests.get(f"{API}/cashout/bank-accounts", headers=uh(user_token), timeout=30).json()
        for row in lst["items"]:
            assert "account_number" not in row
            assert "account_number_masked" in row

        # over-withdraw guard
        over = requests.post(f"{API}/cashout/request", headers=uh(user_token),
                             json={"amount_tokens": int(avail0) + 500,
                                   "bank_account_id": b["bank_account_id"]}, timeout=30)
        assert over.status_code == 400, f"Expected 400 over-withdraw, got {over.status_code}"

        # request cash out £20
        r = requests.post(f"{API}/cashout/request", headers=uh(user_token),
                          json={"amount_tokens": 20, "bank_account_id": b["bank_account_id"]},
                          timeout=30)
        assert r.status_code == 200, r.text
        wid = r.json()["withdrawal_id"]
        assert wid.startswith("WD-")
        assert r.json()["amount_gbp"] == 20.0
        assert r.json()["google_review_url"].startswith("http")

        # summary should now reflect reserved (available drops by 20, pending +20)
        s1 = requests.get(f"{API}/cashout/summary", headers=uh(user_token), timeout=30).json()
        assert s1["available_to_cash_out"] == avail0 - 20, s1
        assert s1["pending_cash_out"] == pending0 + 20, s1

        # admin list processing includes it
        lst = requests.get(f"{API}/admin/cashout/withdrawals?status=processing",
                           headers=uh(admin_token), timeout=30).json()
        assert any(x["withdrawal_id"] == wid for x in lst["items"])

        # admin detail exposes bank
        det = requests.get(f"{API}/admin/cashout/withdrawals/{wid}",
                           headers=uh(admin_token), timeout=30)
        assert det.status_code == 200
        assert det.json()["bank"]["account_number"] == "87654321"

        # mark paid
        mp = requests.post(f"{API}/admin/cashout/withdrawals/{wid}/mark-paid",
                           headers=uh(admin_token), timeout=30)
        assert mp.status_code == 200
        assert mp.json()["status"] == "paid"

        # idempotent
        mp2 = requests.post(f"{API}/admin/cashout/withdrawals/{wid}/mark-paid",
                            headers=uh(admin_token), timeout=30)
        assert mp2.status_code == 200
        assert mp2.json()["status"] == "paid"
        assert mp2.json().get("idempotent") is True

        # after paid: available should NOT return (permanently consumed).
        s2 = requests.get(f"{API}/cashout/summary", headers=uh(user_token), timeout=30).json()
        assert s2["available_to_cash_out"] == avail0 - 20, f"Post-paid: {s2}"
        assert s2["pending_cash_out"] == pending0, f"Post-paid pending should clear: {s2}"

    def test_reject_releases_tokens(self, admin_token, user_token):
        _set_flag(admin_token, True)
        s0 = requests.get(f"{API}/cashout/summary", headers=uh(user_token), timeout=30).json()
        avail0 = s0["available_to_cash_out"]
        if avail0 < 5:
            pytest.skip("Not enough withdrawable balance to test reject")

        # need a bank
        lst = requests.get(f"{API}/cashout/bank-accounts", headers=uh(user_token), timeout=30).json()
        bank_id = lst["items"][0]["bank_account_id"]

        r = requests.post(f"{API}/cashout/request", headers=uh(user_token),
                          json={"amount_tokens": 5, "bank_account_id": bank_id}, timeout=30)
        assert r.status_code == 200
        wid = r.json()["withdrawal_id"]

        s1 = requests.get(f"{API}/cashout/summary", headers=uh(user_token), timeout=30).json()
        assert s1["available_to_cash_out"] == avail0 - 5

        # reject requires reason
        bad = requests.post(f"{API}/admin/cashout/withdrawals/{wid}/reject",
                            headers=uh(admin_token), json={"reason": ""}, timeout=30)
        assert bad.status_code == 400

        rej = requests.post(f"{API}/admin/cashout/withdrawals/{wid}/reject",
                            headers=uh(admin_token), json={"reason": "test rejection"}, timeout=30)
        assert rej.status_code == 200
        assert rej.json()["status"] == "rejected"

        # tokens returned
        s2 = requests.get(f"{API}/cashout/summary", headers=uh(user_token), timeout=30).json()
        assert s2["available_to_cash_out"] == avail0, f"Expected {avail0}, got {s2}"


# =============================================================================
# 5. Teardown: disable flag at end (best effort)
# =============================================================================
@pytest.fixture(scope="module", autouse=True)
def _teardown(admin_token):
    yield
    try:
        _set_flag(admin_token, False)
    except Exception:
        pass
