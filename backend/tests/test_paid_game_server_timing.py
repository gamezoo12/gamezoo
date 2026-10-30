"""Isolated Paid World regression: official score duration comes from a server session."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from auth import create_jwt
from tests import test_admin_dashboard_stats_live as _dash
from tests.test_admin_dashboard_stats_live import API, db_insert, db_read


@pytest.fixture
def game_fixture():
    db_name = _dash._sanitize_db_name(_dash.os.environ["DB_NAME"])
    assert db_name.startswith("test_") and db_name not in ("test_database",)
    suffix = uuid.uuid4().hex[:12]
    user_id, contest_id, ticket_id = f"paid_timer_user_{suffix}", f"paid_timer_contest_{suffix}", f"paid_timer_ticket_{suffix}"
    now = datetime.now(timezone.utc)
    end_date = now + timedelta(hours=1)

    def setup(db):
        async def run():
            await db.users.insert_one({"user_id": user_id, "email": f"{user_id}@example.test", "name": "Timer Player",
                                       "role": "user", "method": "email", "phone_verified": True,
                                       "created_at": now - timedelta(days=30)})
            await db.contests.insert_one({"contest_id": contest_id, "slug": contest_id, "title": "Timing test",
                                          "status": "live", "game_type": "memory_match", "attempts_per_ticket": 2,
                                          "end_date": end_date})
            await db.tickets.insert_one({"ticket_id": ticket_id, "contest_id": contest_id, "user_id": user_id,
                                         "ticket_number": f"T-{suffix}", "status": "active", "created_at": now})
        return run()
    db_insert(db_name, setup)
    yield {"db_name": db_name, "user_id": user_id, "contest_id": contest_id, "ticket_id": ticket_id,
           "headers": {"Authorization": f"Bearer {create_jwt(user_id)}"}}

    def cleanup(db):
        async def run():
            await db.game_attempt_sessions.delete_many({"ticket_id": ticket_id})
            await db.game_scores.delete_many({"ticket_id": ticket_id})
            await db.tickets.delete_many({"ticket_id": ticket_id})
            await db.contests.delete_many({"contest_id": contest_id})
            await db.users.delete_many({"user_id": user_id})
        return run()
    db_insert(db_name, cleanup)


def test_server_measures_paid_game_duration_and_preserves_attempt_cap(game_fixture):
    headers = game_fixture["headers"]
    ticket = game_fixture["ticket_id"]
    no_session = requests.post(f"{API}/games/submit", headers=headers,
                               json={"ticket_id": ticket, "duration_ms": 100, "accuracy": 1, "solved": True}, timeout=20)
    assert no_session.status_code == 409, no_session.text

    started = requests.post(f"{API}/games/session/start", headers=headers, json={"ticket_id": ticket}, timeout=20)
    assert started.status_code == 200, started.text
    first_session = started.json()["session_id"]
    time.sleep(0.25)
    first = requests.post(f"{API}/games/submit", headers=headers,
                          json={"ticket_id": ticket, "session_id": first_session, "duration_ms": 100,
                                "accuracy": 1, "solved": True}, timeout=20)
    assert first.status_code == 200, first.text
    assert first.json()["duration_ms"] >= 200
    assert first.json()["attempts_left"] == 1
    saved = db_read(game_fixture["db_name"], lambda db: db.game_scores.find_one({"ticket_id": ticket}, {"_id": 0}))
    assert saved["duration_ms"] == first.json()["duration_ms"] and saved["duration_ms"] >= 200

    duplicate = requests.post(f"{API}/games/submit", headers=headers,
                              json={"ticket_id": ticket, "session_id": first_session, "duration_ms": 1200000,
                                    "accuracy": 1, "solved": True}, timeout=20)
    assert duplicate.status_code == 200 and duplicate.json().get('idempotent_replay') is True
    assert duplicate.json()['duration_ms'] == first.json()['duration_ms']

    second_session = requests.post(f"{API}/games/session/start", headers=headers, json={"ticket_id": ticket}, timeout=20)
    assert second_session.status_code == 200, second_session.text
    time.sleep(0.15)
    second = requests.post(f"{API}/games/submit", headers=headers,
                           json={"ticket_id": ticket, "session_id": second_session.json()["session_id"],
                                 "duration_ms": 1200000, "accuracy": 0.8, "solved": True}, timeout=20)
    assert second.status_code == 200 and second.json()["attempts_left"] == 0, second.text
    exhausted = requests.post(f"{API}/games/session/start", headers=headers, json={"ticket_id": ticket}, timeout=20)
    assert exhausted.status_code == 400 and "No attempts left" in exhausted.text
    async def get_scores(db):
        return await db.game_scores.find({"ticket_id": ticket}, {"_id": 0}).to_list(10)
    scores = db_read(game_fixture["db_name"], get_scores)
    assert len(scores) == 2 and all(score["game_type"] == "memory_match" for score in scores)
    assert scores[0]["duration_ms"] < 1200000 and scores[1]["duration_ms"] < 1200000
