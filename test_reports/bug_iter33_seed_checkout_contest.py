#!/usr/bin/env python3
"""Seed a live skill-game checkout contest for end-to-end browser verification."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pymongo import MongoClient


def env(path):
    out = {}
    for line in Path(path).read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip().strip('"').strip("'")
    return out


be = env("/app/backend/.env")
db = MongoClient(be["MONGO_URL"])[be.get("DB_NAME", "test_database")]
suffix = uuid.uuid4().hex[:8]
cid = f"c_iter33_{suffix}"
slug = f"iter33-skill-checkout-{suffix}"
image = "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80"
doc = {
    "contest_id": cid,
    "slug": slug,
    "title": "ITER33 Skill Checkout Game",
    "subtitle": "E2E checkout route verification",
    "category": "prize-draws",
    "tag": "Prize Draws",
    "price": 1.0,
    "tickets_sold": 0,
    "tickets_total": 20,
    "prize_amount": 10.0,
    "end_date": datetime.now(timezone.utc) + timedelta(days=7),
    "image": image,
    "jackpot": False,
    "featured": False,
    "skill_question": {"q": "2 + 2 = ?", "options": [3, 4, 5, 6], "answer": "4", "type": "math"},
    "skill_question_type": "addition",
    "skill_question_difficulty": "easy",
    "game_type": "math_sprint",
    "game_config": {},
    "entry_mode": "skill_game",
    "engine_type": "leaderboard",
    "max_attempts": 3,
    "attempts_per_ticket": 3,
    "status": "live",
    "publication_status": "published",
    "created_at": datetime.now(timezone.utc),
}
db.contests.insert_one(doc)
out = {"contest_id": cid, "slug": slug, "title": doc["title"], "image": image}
Path("/app/test_reports/bug_iter33_seed_checkout_contest_output.json").write_text(json.dumps(out, indent=2))
print(json.dumps(out, indent=2))