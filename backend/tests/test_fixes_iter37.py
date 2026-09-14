"""Iteration 37: Verify 4 fixes (read-only, no DB writes)."""
import os
import sys
import importlib
from datetime import datetime, timezone, timedelta
import requests
import pytest

# Ensure backend on sys.path
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://import-verify-6.preview.emergentagent.com").rstrip("/")
LOCAL_URL = "http://localhost:8001"


# --- Fix 3: health/ready at ROOT ---
def test_health_root_local():
    r = requests.get(f"{LOCAL_URL}/health", timeout=10)
    assert r.status_code == 200, r.text

def test_ready_root_local():
    r = requests.get(f"{LOCAL_URL}/ready", timeout=10)
    assert r.status_code == 200, r.text


# --- Server import integrity ---
def test_server_import_and_route_count():
    if "server" in sys.modules:
        del sys.modules["server"]
    import server
    n = len(server.app.routes)
    print(f"route count = {n}")
    assert n == 175, f"expected 175 routes, got {n}"


# --- Fix 1: ensure_utc importable + bound in world_routes ---
def test_ensure_utc_in_service():
    mod = importlib.import_module("services.world_championship_schedule")
    assert hasattr(mod, "ensure_utc")
    dt = datetime.now(timezone.utc)
    out = mod.ensure_utc(dt)
    assert out.tzinfo is not None

def test_ensure_utc_bound_in_world_routes():
    mod = importlib.import_module("routers.world_routes")
    assert hasattr(mod, "ensure_utc"), "ensure_utc not bound in world_routes namespace"


# --- Fix 2: timedelta bound in scheduler ---
def test_timedelta_in_scheduler():
    mod = importlib.import_module("services.world_championship_scheduler")
    assert hasattr(mod, "timedelta")
    # exercise it
    delta = mod.datetime.now(mod.timezone.utc) - mod.timedelta(days=1)
    assert delta.tzinfo is not None


# --- Fix 4: mongo client timeouts ---
def test_mongo_client_timeouts():
    import deps
    client = deps._client
    opts = client.options
    # motor/pymongo options
    pool = opts.pool_options
    # server selection timeout stored on options directly
    sst = opts.server_selection_timeout
    ct = pool.connect_timeout
    print(f"server_selection_timeout={sst}, connect_timeout={ct}")
    assert abs(sst - 8.0) < 0.01, f"expected 8s, got {sst}"
    assert abs(ct - 8.0) < 0.01, f"expected 8s, got {ct}"


# --- Regression: public GET /api/ ---
def test_api_root_public():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    print(f"status={r.status_code} body={r.text[:200]}")
    assert r.status_code in (200, 404)  # accept 404 if no root
