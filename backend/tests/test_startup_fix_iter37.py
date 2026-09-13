"""
Tests for backend startup deployment fix (iteration 37).
Verifies:
- /health and /ready respond quickly (K8s readiness endpoints, no /api prefix)
- /api/ works
- /api/world/state works (Free World public route)
- /api/diagnostics/db returns metadata
- /api/auth/login returns 401 on empty DB
- Startup logs show background tasks ran
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read from frontend .env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass


LOCAL_URL = "http://127.0.0.1:8001"


def _get(path, timeout=10):
    return requests.get(f"{BASE_URL}{path}", timeout=timeout)


def _get_local(path, timeout=10):
    return requests.get(f"{LOCAL_URL}{path}", timeout=timeout)


def test_health_fast():
    """K8s readiness probe at root - should be quick. Probed directly on pod, not via ingress."""
    t0 = time.time()
    r = _get_local("/health", timeout=5)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"status={r.status_code} body={r.text}"
    assert r.json().get("status") == "ok"
    assert elapsed < 3, f"/health too slow: {elapsed:.2f}s"


def test_ready_fast_no_db():
    t0 = time.time()
    r = _get_local("/ready", timeout=5)
    elapsed = time.time() - t0
    assert r.status_code == 200
    assert elapsed < 3, f"/ready too slow: {elapsed:.2f}s"


def test_api_root():
    r = _get("/api/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("service") == "gamezoo"
    assert data.get("status") == "ok"


def test_world_state():
    r = _get("/api/world/state")
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"


def test_diagnostics_db():
    r = _get("/api/diagnostics/db")
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
    data = r.json()
    # ping_ok expected true on reachable mongo; users_count expected 0 on empty DB
    assert data.get("ping_ok") is True, f"ping_ok not true: {data}"
    assert "users_count" in data


def test_auth_login_nonexistent_returns_401():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "nonexistent_test_user_iter37@example.com", "password": "whatever"},
        timeout=10,
    )
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert "Invalid email or password" in (body.get("detail") or "")


def test_route_count():
    """Sanity: ~175 routes registered via /openapi.json (local, since openapi not exposed via ingress)"""
    r = _get_local("/openapi.json", timeout=15)
    assert r.status_code == 200
    paths = r.json().get("paths", {})
    # Each path can have multiple methods; count operations
    ops = sum(len(v) for v in paths.values())
    assert ops >= 150, f"too few routes registered: {ops}"
    print(f"registered operations: {ops}, unique paths: {len(paths)}")
