#!/usr/bin/env python3
"""Focused fixture helper for CompetitionCard mobile_image bug verification.

Usage:
  python mobile_image_fixture.py save
  python mobile_image_fixture.py set <mobile_url>
  python mobile_image_fixture.py clear
  python mobile_image_fixture.py restore
  python mobile_image_fixture.py api-check [expected|null]
"""
import json
import os
import re
import sys
from pathlib import Path

import requests
from pymongo import MongoClient


CONTEST_ID = "c_fd360e20adad"
STATE_FILE = Path("/app/test_reports/mobile_image_original_state.json")


def env(path):
    text = Path(path).read_text()
    return dict(re.findall(r'^(\w+)="?([^"\n]+)"?', text, re.M))


def db():
    vals = env("/app/backend/.env")
    return MongoClient(vals["MONGO_URL"])[vals["DB_NAME"]]


def backend_base():
    vals = env("/app/frontend/.env")
    return vals["REACT_APP_BACKEND_URL"].rstrip("/")


def public_fields(doc):
    if not doc:
        return None
    return {
        "contest_id": doc.get("contest_id"),
        "slug": doc.get("slug"),
        "title": doc.get("title"),
        "image": doc.get("image"),
        "mobile_image": doc.get("mobile_image"),
        "status": doc.get("status"),
        "featured": doc.get("featured"),
        "jackpot": doc.get("jackpot"),
    }


def save_original():
    doc = db().contests.find_one({"contest_id": CONTEST_ID}, {"_id": 0})
    if not doc:
        raise SystemExit(f"Contest {CONTEST_ID} not found")
    STATE_FILE.write_text(json.dumps(public_fields(doc), indent=2, default=str))
    print(json.dumps({"saved": str(STATE_FILE), "contest": public_fields(doc)}, indent=2))


def set_mobile(mobile_url):
    r = db().contests.update_one(
        {"contest_id": CONTEST_ID},
        {"$set": {"mobile_image": mobile_url, "status": "live"}},
    )
    print(json.dumps({"matched": r.matched_count, "modified": r.modified_count, "set_mobile_image": mobile_url}))


def clear_mobile():
    r = db().contests.update_one(
        {"contest_id": CONTEST_ID},
        {"$set": {"mobile_image": None, "status": "live"}},
    )
    print(json.dumps({"matched": r.matched_count, "modified": r.modified_count, "set_mobile_image": None}))


def restore_original():
    if not STATE_FILE.exists():
        raise SystemExit(f"Missing {STATE_FILE}; cannot restore safely")
    original = json.loads(STATE_FILE.read_text())
    updates = {k: original.get(k) for k in ["mobile_image", "status", "featured", "jackpot"]}
    r = db().contests.update_one({"contest_id": CONTEST_ID}, {"$set": updates})
    doc = db().contests.find_one({"contest_id": CONTEST_ID}, {"_id": 0})
    print(json.dumps({"matched": r.matched_count, "restored": updates, "current": public_fields(doc)}, indent=2, default=str))


def api_check(expected_arg=None):
    url = f"{backend_base()}/api/contests"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    contests = resp.json()
    item = next((c for c in contests if c.get("contest_id") == CONTEST_ID), None)
    print(json.dumps({"api_url": url, "found": bool(item), "item": item}, indent=2, default=str))
    if not item:
        raise SystemExit("contest not returned by public /api/contests")
    if expected_arg is not None:
        expected = None if expected_arg == "null" else expected_arg
        if item.get("mobile_image") != expected:
            raise SystemExit(f"mobile_image mismatch: expected {expected!r}, got {item.get('mobile_image')!r}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "save":
        save_original()
    elif cmd == "set":
        set_mobile(sys.argv[2])
    elif cmd == "clear":
        clear_mobile()
    elif cmd == "restore":
        restore_original()
    elif cmd == "api-check":
        api_check(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        raise SystemExit(__doc__)