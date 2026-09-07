"""Emergent object storage helper (S3-compatible via integration proxy).

Used for persisting user-uploaded files (e.g. KYC documents) off the app pod
so they remain accessible in deployed environments.
"""

import os
import requests

APP_NAME = "prize-league"

_storage_key = None


def _storage_url():
    base = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
    return base.rstrip("/") + "/objstore/api/v1/storage"


def init_storage():
    """Initialise once and reuse the session-scoped storage key."""
    global _storage_key
    if _storage_key:
        return _storage_key
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    resp = requests.post(
        f"{_storage_url()}/init",
        json={"emergent_key": emergent_key},
        timeout=30,
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes. Returns {"path": ..., "size": ..., "etag": ...}."""
    key = init_storage()
    resp = requests.put(
        f"{_storage_url()}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    """Download an object. Returns (content_bytes, content_type)."""
    key = init_storage()
    resp = requests.get(
        f"{_storage_url()}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
