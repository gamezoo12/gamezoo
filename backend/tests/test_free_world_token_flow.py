"""Backend tests: Free World token unlock/retry flow (iteration 35)."""
import os
import subprocess
import time
import requests
import pytest

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
    return v.rstrip("/")

BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

P1 = ("player1@example.com", "Player@12345")
BROKE = ("player_broke@example.com", "Player@12345")


def reseed():
    r = subprocess.run(
        ["python3", "/app/backend/scripts/seed_token_test_scenario.py"],
        capture_output=True, text=True, timeout=60
    )
    assert r.returncode == 0, r.stderr


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def wallet_balance(tok):
    r = requests.get(f"{API}/wallet/me", headers=h(tok), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("tokens", j.get("balance"))


# --- Early unlock happy path -------------------------------------------------
def test_early_unlock_happy_path():
    reseed()
    tok = login(*P1)
    start = wallet_balance(tok)
    assert start == 350
    r = requests.post(f"{API}/world/token/unlock/reserve", headers=h(tok), json={"level": 2}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("token_cost") == 1
    assert j.get("tokens_remaining") == 349
    assert wallet_balance(tok) == 349


# --- Double-charge safety on unlock ------------------------------------------
def test_early_unlock_double_charge_safety():
    reseed()
    tok = login(*P1)
    r1 = requests.post(f"{API}/world/token/unlock/reserve", headers=h(tok), json={"level": 2}, timeout=15)
    assert r1.status_code == 200, r1.text
    r2 = requests.post(f"{API}/world/token/unlock/reserve", headers=h(tok), json={"level": 2}, timeout=15)
    # idempotent 200 replay OR 409 LEVEL_ALREADY_AVAILABLE
    assert r2.status_code in (200, 409), r2.text
    if r2.status_code == 409:
        assert "LEVEL_ALREADY_AVAILABLE" in r2.text
    assert wallet_balance(tok) == 349


# --- Progression guard -------------------------------------------------------
def test_progression_guard_level3():
    reseed()
    tok = login(*P1)
    before = wallet_balance(tok)
    r = requests.post(f"{API}/world/token/unlock/reserve", headers=h(tok), json={"level": 3}, timeout=15)
    assert r.status_code == 409, r.text
    assert "PREVIOUS_LEVEL_NOT_COMPLETED" in r.text
    assert wallet_balance(tok) == before


# --- Insufficient balance ----------------------------------------------------
def test_insufficient_balance():
    reseed()
    tok = login(*BROKE)
    assert wallet_balance(tok) == 0
    r = requests.post(f"{API}/world/token/unlock/reserve", headers=h(tok), json={"level": 2}, timeout=15)
    assert r.status_code == 400, r.text
    assert "insufficient" in r.text.lower()
    assert wallet_balance(tok) == 0


# --- Retry double-charge safety ----------------------------------------------
def test_retry_double_charge_safety():
    reseed()
    tok = login(*P1)
    # Attempt to reserve retry on Level 1 twice. Behavior depends on whether attempts are exhausted,
    # but two rapid calls must not deduct twice.
    before = wallet_balance(tok)
    r1 = requests.post(f"{API}/world/token/retry/reserve", headers=h(tok), json={"level": 1}, timeout=15)
    r2 = requests.post(f"{API}/world/token/retry/reserve", headers=h(tok), json={"level": 1}, timeout=15)
    after = wallet_balance(tok)
    # In either scenario, total deduction <= 1
    delta = before - after
    assert delta in (0, 1), f"unexpected delta {delta} r1={r1.status_code} {r1.text} r2={r2.status_code} {r2.text}"
    if r1.status_code == 200 and r2.status_code == 200:
        # both 200 must be idempotent replay -> same tokens_remaining
        assert r1.json().get("tokens_remaining") == r2.json().get("tokens_remaining")
