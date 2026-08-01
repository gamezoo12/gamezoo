#!/usr/bin/env python3
"""Seed a current-user game score so the signed-in UI can show the YOU badge."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from pymongo import MongoClient


def env(path):
    out = {}
    for line in Path(path).read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip().strip('"').strip("'")
    return out


fe = env("/app/frontend/.env")
be = env("/app/backend/.env")
base = fe["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
r = s.post(base + "/auth/login", json={"email": "bachanta8@gmail.com", "password": "Herts@910022"}, timeout=20)
r.raise_for_status()
u = r.json()["user"]
db = MongoClient(be["MONGO_URL"])[be.get("DB_NAME", "test_database")]
doc = {
    "score_id": f"s_{uuid.uuid4().hex[:12]}",
    "contest_id": "c_8f482282e502",
    "ticket_id": f"t_{uuid.uuid4().hex[:12]}",
    "user_id": u["user_id"],
    "user_name": u.get("name") or "Bachanta",
    "game_type": "math_sprint",
    "points": 1500,
    "duration_ms": 15000,
    "accuracy": 0.9,
    "attempts_used": 1,
    "created_at": datetime.now(timezone.utc),
}
db.game_scores.insert_one(doc)
out = {"seeded": True, "user_id": u["user_id"], "score": {k: str(v) for k, v in doc.items()}}
Path("/app/test_reports/bug_iter33_seed_current_user_score_output.json").write_text(json.dumps(out, indent=2))
print(json.dumps(out, indent=2))