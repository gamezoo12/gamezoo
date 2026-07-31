"""Regression tests for the four bugs found in the Feb 2026 code review:
  HIGH-1: checkout must accept dynamic-engine contest purchases end-to-end
  HIGH-2: refund must actually credit the buyer's wallet
  MEDIUM-3: wallet spend must be atomic (no lost update under concurrency)
  MEDIUM-4: ticket reservations must not oversell under concurrency
"""
import asyncio
import os
import re
import sys
import uuid
import pytest
import requests

# Allow importing backend modules from /app/backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://contest-arena-16.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_TEST_EMAIL", "bachanta8@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_TEST_PASSWORD", "Herts@910022")

OP_TO_LAMBDA = {'+': lambda a, b: a + b, '−': lambda a, b: a - b, '×': lambda a, b: a * b, '÷': lambda a, b: a // b}


def _solve(question: str) -> int:
    m = re.match(r"(\d+)\s*(.)\s*(\d+)\s*=", question)
    return OP_TO_LAMBDA[m.group(2)](int(m.group(1)), int(m.group(3)))


async def _seed_user_direct(email: str, name: str = "Buyer") -> str:
    """Insert a test user + verified state DIRECTLY into MongoDB, bypassing
    the OTP-gated /register endpoint. Returns the user_id."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    from auth import hash_password  # local util
    from models import User

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    u = User(
        email=email, name=name, password_hash=hash_password("TestPass!23"),
        phone="+447700900000", postcode="AA1 1AA", role="user",
        terms_accepted_at=None,  # tests skip the terms gate by calling APIs directly
    )
    doc = u.model_dump()
    doc["terms_accepted_at"] = doc.get("created_at")
    doc["phone_verified"] = True
    await db.users.insert_one(doc)
    return u.user_id


def _login_direct(email: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "TestPass!23"})
    assert r.status_code == 200, f"seed login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture()
def buyer(admin_token):
    """DB-seeded test user + wallet-seed helper."""
    email = f"buyer.{uuid.uuid4().hex[:10]}@example.com"
    user_id = asyncio.get_event_loop().run_until_complete(_seed_user_direct(email))
    token = _login_direct(email)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

    def seed_wallet(gbp: float):
        admin = _admin(admin_token)
        admin.post(f"{BASE_URL}/api/admin/wallets/adjust", json={"user_id": user_id, "amount": float(gbp), "note": "test-seed"})

    yield {"session": s, "user_id": user_id, "email": email, "seed_wallet": seed_wallet}


def _admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture()
def live_dynamic_contest(admin_token):
    """Create a fresh LIVE dynamic-engine contest, yield it, then clean it up."""
    admin = _admin(admin_token)
    r = admin.post(f"{BASE_URL}/api/admin/contests", json={
        "title": "TEST_CheckoutBug_Dyn", "prize_amount": 25, "price": 1,
        "tickets_total": 5, "skill_question_type": "addition",
        "skill_question_difficulty": "easy", "entry_mode": "skill_game",
        "status": "live",
    })
    assert r.status_code == 200, r.text
    c = r.json()["contest"]
    yield c
    admin.delete(f"{BASE_URL}/api/admin/contests/{c['contest_id']}")


class TestHigh1DynamicCheckout:
    def test_dynamic_contest_purchase_with_valid_token_succeeds(self, buyer, live_dynamic_contest):
        buyer["seed_wallet"](5)
        ch = requests.get(f"{BASE_URL}/api/contests/{live_dynamic_contest['slug']}/skill-challenge").json()
        r = buyer["session"].post(f"{BASE_URL}/api/orders/checkout", json={
            "items": [{
                "contest_id": live_dynamic_contest["contest_id"], "qty": 1,
                "skill_answer": str(_solve(ch["question"])),
                "challenge_token": ch["challenge_token"],
            }],
        })
        assert r.status_code == 200, f"HIGH-1 REGRESSION: {r.text}"
        assert r.json()["total"] == 1.0

    def test_dynamic_contest_purchase_without_token_rejected(self, buyer, live_dynamic_contest):
        buyer["seed_wallet"](5)
        r = buyer["session"].post(f"{BASE_URL}/api/orders/checkout", json={
            "items": [{
                "contest_id": live_dynamic_contest["contest_id"], "qty": 1,
                "skill_answer": "1",
            }],
        })
        assert r.status_code == 400
        assert "skill" in r.json()["detail"].lower()

    def test_dynamic_contest_purchase_wrong_answer_rejected(self, buyer, live_dynamic_contest):
        buyer["seed_wallet"](5)
        ch = requests.get(f"{BASE_URL}/api/contests/{live_dynamic_contest['slug']}/skill-challenge").json()
        r = buyer["session"].post(f"{BASE_URL}/api/orders/checkout", json={
            "items": [{
                "contest_id": live_dynamic_contest["contest_id"], "qty": 1,
                "skill_answer": str(_solve(ch["question"]) + 999),
                "challenge_token": ch["challenge_token"],
            }],
        })
        assert r.status_code == 400


class TestHigh2RefundCreditsWallet:
    def test_refund_credits_wallet_exactly_once(self, buyer, live_dynamic_contest, admin_token):
        buyer["seed_wallet"](10)
        ch = requests.get(f"{BASE_URL}/api/contests/{live_dynamic_contest['slug']}/skill-challenge").json()
        r = buyer["session"].post(f"{BASE_URL}/api/orders/checkout", json={
            "items": [{"contest_id": live_dynamic_contest["contest_id"], "qty": 3,
                       "skill_answer": str(_solve(ch["question"])), "challenge_token": ch["challenge_token"]}],
        })
        assert r.status_code == 200
        order_id = r.json()["order_id"]

        w = buyer["session"].get(f"{BASE_URL}/api/wallet/me").json()
        assert abs(w["balance"] - 7.0) < 0.001

        admin = _admin(admin_token)
        rr = admin.post(f"{BASE_URL}/api/admin/orders/{order_id}/refund")
        assert rr.status_code == 200, rr.text
        assert rr.json().get("refunded_amount") == 3.0

        w2 = buyer["session"].get(f"{BASE_URL}/api/wallet/me").json()
        assert abs(w2["balance"] - 10.0) < 0.001, f"HIGH-2 REGRESSION — refund did not credit. balance={w2['balance']}"

        # Idempotent
        rr2 = admin.post(f"{BASE_URL}/api/admin/orders/{order_id}/refund")
        assert rr2.json().get("already") is True
        w3 = buyer["session"].get(f"{BASE_URL}/api/wallet/me").json()
        assert abs(w3["balance"] - 10.0) < 0.001


class TestMedium3AtomicWallet:
    def test_concurrent_spends_do_not_go_negative(self, buyer, admin_token):
        buyer["seed_wallet"](10)
        admin = _admin(admin_token)
        user_id = buyer["user_id"]
        results = []

        def spend():
            r = admin.post(f"{BASE_URL}/api/admin/wallets/adjust", json={"user_id": user_id, "amount": -7, "note": "race"})
            results.append(r.status_code)

        import threading
        ts = [threading.Thread(target=spend) for _ in range(2)]
        for t in ts: t.start()
        for t in ts: t.join()

        successes = sum(1 for s in results if s == 200)
        assert successes == 1, f"MEDIUM-3 REGRESSION — both spends succeeded: {results}"

        w = buyer["session"].get(f"{BASE_URL}/api/wallet/me").json()
        assert w["balance"] >= 0
        assert abs(w["balance"] - 3.0) < 0.001


class TestMedium4NoOversell:
    def test_concurrent_last_ticket_buyers_do_not_oversell(self, admin_token):
        admin = _admin(admin_token)
        r = admin.post(f"{BASE_URL}/api/admin/contests", json={
            "title": "TEST_Oversell", "prize_amount": 5, "price": 1,
            "tickets_total": 1, "skill_question_type": "addition",
            "skill_question_difficulty": "easy", "entry_mode": "skill_game",
            "status": "live",
        })
        c = r.json()["contest"]
        try:
            buyers_sessions = []
            for _ in range(2):
                email = f"racer.{uuid.uuid4().hex[:10]}@example.com"
                uid = asyncio.get_event_loop().run_until_complete(_seed_user_direct(email))
                tok = _login_direct(email)
                admin.post(f"{BASE_URL}/api/admin/wallets/adjust", json={"user_id": uid, "amount": 5, "note": "seed"})
                buyers_sessions.append(tok)

            results = []

            def race(token):
                ch = requests.get(f"{BASE_URL}/api/contests/{c['slug']}/skill-challenge").json()
                rr = requests.post(
                    f"{BASE_URL}/api/orders/checkout",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json={"items": [{
                        "contest_id": c["contest_id"], "qty": 1,
                        "skill_answer": str(_solve(ch["question"])),
                        "challenge_token": ch["challenge_token"],
                    }]},
                )
                results.append(rr.status_code)

            import threading
            threads = [threading.Thread(target=race, args=(t,)) for t in buyers_sessions]
            for t in threads: t.start()
            for t in threads: t.join()

            successes = sum(1 for s in results if s == 200)
            assert successes == 1, f"MEDIUM-4 REGRESSION — oversold: {results}"

            cc = requests.get(f"{BASE_URL}/api/contests/{c['slug']}").json()
            assert cc["tickets_sold"] == 1
        finally:
            admin.delete(f"{BASE_URL}/api/admin/contests/{c['contest_id']}")
