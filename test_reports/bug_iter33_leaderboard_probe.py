#!/usr/bin/env python3
"""Focused leaderboard API probe. Seeds scores for required contest and verifies normalized fields."""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from pymongo import MongoClient


def read_env(path):
    out = {}
    for line in Path(path).read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip().strip('"').strip("'")
    return out


frontend_env = read_env("/app/frontend/.env")
backend_env = read_env("/app/backend/.env")
BASE = frontend_env.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
CONTEST_ID = "c_8f482282e502"


def main():
    db = MongoClient(backend_env["MONGO_URL"])[backend_env.get("DB_NAME", "test_database")]
    now = datetime.now(timezone.utc)
    u1 = f"iter33_lb_top_{uuid.uuid4().hex[:6]}"
    u2 = f"iter33_lb_low_{uuid.uuid4().hex[:6]}"
    db.users.insert_many([
        {"user_id": u1, "email": f"{u1}@test.local", "name": "Iter33 Top", "username": "iter33top", "public_id": "PL33TOP", "role": "user", "method": "email", "created_at": now},
        {"user_id": u2, "email": f"{u2}@test.local", "name": "Iter33 Low", "username": "iter33low", "public_id": "PL33LOW", "role": "user", "method": "email", "created_at": now},
    ])
    db.game_scores.insert_many([
        {"score_id": f"s_{uuid.uuid4().hex[:12]}", "contest_id": CONTEST_ID, "ticket_id": f"t_{uuid.uuid4().hex[:12]}", "user_id": u1, "user_name": "Iter33 Top", "game_type": "math_sprint", "points": 2000, "duration_ms": 10000, "accuracy": 1.0, "attempts_used": 1, "created_at": now},
        {"score_id": f"s_{uuid.uuid4().hex[:12]}", "contest_id": CONTEST_ID, "ticket_id": f"t_{uuid.uuid4().hex[:12]}", "user_id": u2, "user_name": "Iter33 Low", "game_type": "math_sprint", "points": 1000, "duration_ms": 20000, "accuracy": 0.75, "attempts_used": 1, "created_at": now},
    ])
    contest_resp = requests.get(f"{BASE}/contests/{CONTEST_ID}/leaderboard", params={"limit": 20}, timeout=20)
    global_resp = requests.get(f"{BASE}/leaderboard/global", params={"limit": 20}, timeout=20)
    contest_json = contest_resp.json()
    global_json = global_resp.json()
    entries = contest_json.get("entries", [])
    grows = global_json.get("leaderboard", [])
    report = {
        "seeded_users": [u1, u2],
        "contest_status": contest_resp.status_code,
        "global_status": global_resp.status_code,
        "contest_top_5": entries[:5],
        "global_top_5": grows[:5],
        "assertions": {
            "contest_entries_present": bool(entries),
            "contest_all_have_normalized_score": bool(entries) and all(isinstance(x.get("normalized_score"), (int, float)) for x in entries),
            "contest_top_is_100": bool(entries) and float(entries[0].get("normalized_score", -1)) == 100.0,
            "contest_rows_have_speed_accuracy": bool(entries) and all("duration_s" in x and "accuracy_pct" in x for x in entries),
            "global_rows_present": bool(grows),
            "global_all_have_normalized_score": bool(grows) and all(isinstance(x.get("normalized_score"), (int, float)) for x in grows),
            "global_top_is_100": bool(grows) and float(grows[0].get("normalized_score", -1)) == 100.0,
        },
    }
    Path("/app/test_reports/bug_iter33_leaderboard_probe_output.json").write_text(json.dumps(report, indent=2, default=str))
    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())