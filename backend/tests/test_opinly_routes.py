"""Isolated Opinly gateway regression tests; no network or API key required."""
import json
from unittest.mock import patch
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers import opinly_routes as o

@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(o.router)
    with TestClient(app) as c:
        yield c

def test_secret_missing_returns_503(client):
    o._cache.clear()
    with patch.dict("os.environ", {"OPINLY_API_KEY": ""}):
        r = client.get("/api/opinly/posts")
    assert r.status_code == 503
    assert "OPINLY_API_KEY" not in r.text

def test_reject_invalid_pagination(client):
    assert client.get("/api/opinly/posts?limit=1000").status_code == 400
    assert client.get("/api/opinly/posts?sort=invalid").status_code == 400

def test_proxy_does_not_expose_secret(client):
    o._cache.clear()
    with patch.object(o, "_fetch", return_value={"data": [{"slug": "example"}], "has_more": False, "next_cursor": None}) as fetch:
        r = client.get("/api/opinly/posts")
    assert r.status_code == 200
    assert r.json()["data"][0]["slug"] == "example"
    assert "Bearer" not in r.text
    assert fetch.call_args.args[0] == "/content/posts"

def test_webhook_rejects_invalid_signature(client):
    with patch.dict("os.environ", {"OPINLY_WEBHOOK_SIGNING_SECRET": "whsec_dGVzdA=="}):
        r = client.post("/api/opinly-webhook", content=json.dumps({"type": "content.routes-changed"}), headers={"content-type": "application/json"})
    assert r.status_code == 400

def test_sitemap_escapes_xml(client):
    o._cache.clear()
    with patch.object(o, "_fetch", return_value={"data": [{"type": "post", "slug": "a&b", "lastModified": "2026-10-01"}]}):
        r = client.get("/sitemap.xml")
    assert r.status_code == 200
    assert "&amp;" in r.text or "%26" in r.text
