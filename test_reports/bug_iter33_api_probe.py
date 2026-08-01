#!/usr/bin/env python3
"""Focused API probe for token checkout + leaderboard normalization bug."""
import base64
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from pymongo import MongoClient


def read_env(path):
    out = {}
    if not Path(path).exists():
        return out
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k] = v.strip().strip('"').strip("'")
    return out


frontend_env = read_env("/app/frontend/.env")
backend_env = read_env("/app/backend/.env")
BASE = frontend_env.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
CONTEST_ID = "c_8f482282e502"
CONTEST_SLUG = "test-checkoutbug-dyn-7ccb65"


def decode_answer(challenge_token):
    body = challenge_token.split(".")[0]
    body += "=" * (-len(body) % 4)
    payload = json.loads(base64.urlsafe_b64decode(body.encode()).decode())
    return str(payload["a"])


def main():
    result = {
        "base": BASE,
        "steps": [],
        "errors": [],
        "checkout": None,
        "my_ticket": None,
        "contest_leaderboard_sample": None,
        "global_leaderboard_sample": None,
    }
    s = requests.Session()
    try:
        r = s.post(f"{BASE}/auth/login", json={"email": "bachanta8@gmail.com", "password": "Herts@910022"}, timeout=20)
        result["steps"].append({"login_status": r.status_code})
        r.raise_for_status()
        token = r.json()["token"]
        user = r.json()["user"]
        s.headers.update({"Authorization": f"Bearer {token}"})
        result["steps"].append({"logged_in_user": {"user_id": user.get("user_id"), "role": user.get("role"), "email": user.get("email")}})

        # Seed wallet through admin endpoint (test setup), so checkout can run.
        wallet = s.get(f"{BASE}/wallet/me", timeout=20).json()
        if float(wallet.get("balance", 0)) < 5:
            adj = s.post(
                f"{BASE}/admin/wallets/adjust",
                json={"user_id": user["user_id"], "amount": 10, "note": "iteration 33 checkout bug verification seed"},
                timeout=20,
            )
            result["steps"].append({"wallet_adjust_status": adj.status_code, "body": adj.text[:300]})
            adj.raise_for_status()
        result["steps"].append({"wallet_before": s.get(f"{BASE}/wallet/me", timeout=20).json()})

        contest = s.get(f"{BASE}/contests/{CONTEST_SLUG}", timeout=20)
        result["steps"].append({"contest_get_status": contest.status_code, "contest_body_head": contest.text[:300]})
        contest.raise_for_status()
        contest_json = contest.json()
        result["steps"].append({"contest_game_type": contest_json.get("game_type"), "entry_mode": contest_json.get("entry_mode"), "title": contest_json.get("title")})

        challenge = s.get(f"{BASE}/contests/{CONTEST_SLUG}/skill-challenge", timeout=20)
        result["steps"].append({"challenge_status": challenge.status_code, "challenge_body": challenge.text[:300]})
        challenge.raise_for_status()
        ch = challenge.json()
        answer = decode_answer(ch["challenge_token"])
        checkout = s.post(
            f"{BASE}/orders/checkout",
            json={"items": [{"contest_id": CONTEST_ID, "qty": 1, "skill_answer": answer, "challenge_token": ch["challenge_token"]}]},
            timeout=30,
        )
        result["steps"].append({"checkout_status": checkout.status_code, "checkout_body": checkout.text[:500]})
        checkout.raise_for_status()
        result["checkout"] = checkout.json()

        tickets = s.get(f"{BASE}/orders/my-tickets", timeout=20)
        result["steps"].append({"my_tickets_status": tickets.status_code})
        tickets.raise_for_status()
        first_ticket_id = result["checkout"].get("first_ticket_id")
        mine = next((t for t in tickets.json() if t.get("ticket_id") == first_ticket_id), None)
        result["my_ticket"] = mine

        # Seed deterministic score rows directly into preview DB so leaderboard endpoints have data.
        mongo_url = backend_env.get("MONGO_URL")
        db_name = backend_env.get("DB_NAME", "test_database")
        if mongo_url:
            db = MongoClient(mongo_url)[db_name]
            now = datetime.now(timezone.utc)
            seed_user = f"iter33_{uuid.uuid4().hex[:8]}"
            db.users.insert_one({
                "user_id": seed_user,
                "email": f"{seed_user}@test.local",
                "name": "Iter33 Seed Player",
                "username": "iter33seed",
                "public_id": "PLITER33",
                "role": "user",
                "method": "email",
                "created_at": now,
            })
            db.game_scores.insert_many([
                {
                    "score_id": f"s_{uuid.uuid4().hex[:12]}",
                    "contest_id": CONTEST_ID,
                    "ticket_id": f"t_iter33_{uuid.uuid4().hex[:8]}",
                    "user_id": seed_user,
                    "user_name": "Iter33 Seed Player",
                    "game_type": contest_json.get("game_type") or "math_sprint",
                    "points": 2000,
                    "duration_ms": 12000,
                    "accuracy": 1.0,
                    "attempts_used": 1,
                    "created_at": now,
                },
                {
                    "score_id": f"s_{uuid.uuid4().hex[:12]}",
                    "contest_id": CONTEST_ID,
                    "ticket_id": first_ticket_id or f"t_iter33_{uuid.uuid4().hex[:8]}",
                    "user_id": user["user_id"],
                    "user_name": user.get("name") or "Bachanta",
                    "game_type": contest_json.get("game_type") or "math_sprint",
                    "points": 1000,
                    "duration_ms": 20000,
                    "accuracy": 0.8,
                    "attempts_used": 1,
                    "created_at": now,
                },
            ])
            result["steps"].append({"seeded_game_scores": True, "seed_user": seed_user})
            time.sleep(0.5)

        clb = requests.get(f"{BASE}/contests/{CONTEST_ID}/leaderboard", params={"limit": 10}, timeout=20)
        result["steps"].append({"contest_lb_status": clb.status_code})
        clb.raise_for_status()
        cent = clb.json().get("entries", [])
        result["contest_leaderboard_sample"] = cent[:3]

        glb = requests.get(f"{BASE}/leaderboard/global", params={"limit": 10}, timeout=20)
        result["steps"].append({"global_lb_status": glb.status_code})
        glb.raise_for_status()
        grows = glb.json().get("leaderboard", [])
        result["global_leaderboard_sample"] = grows[:3]

        # Basic assertions are saved for later report, but do not hide details on failure.
        result["assertions"] = {
            "checkout_has_first_ticket": bool(result["checkout"].get("first_ticket_id")),
            "checkout_has_game_type": bool(result["checkout"].get("first_game_type")),
            "my_ticket_has_title": bool((mine or {}).get("contest", {}).get("title")),
            "my_ticket_has_image": bool((mine or {}).get("contest", {}).get("image")),
            "contest_lb_all_have_normalized": bool(cent) and all(isinstance(x.get("normalized_score"), (int, float)) for x in cent),
            "contest_lb_top_100": bool(cent) and float(cent[0].get("normalized_score", -1)) == 100.0,
            "contest_lb_details": bool(cent) and all("duration_s" in x and "accuracy_pct" in x for x in cent),
            "global_lb_all_have_normalized": bool(grows) and all(isinstance(x.get("normalized_score"), (int, float)) for x in grows),
            "global_lb_top_100": bool(grows) and float(grows[0].get("normalized_score", -1)) == 100.0,
        }
    except Exception as e:
        result["errors"].append(repr(e))
    finally:
        out_path = Path("/app/test_reports/bug_iter33_api_probe_output.json")
        out_path.write_text(json.dumps(result, indent=2, default=str))
        print(json.dumps(result, indent=2, default=str))
        return 0 if not result["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())