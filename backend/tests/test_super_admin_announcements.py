"""Isolated (test DB only): Super Admin-only GC/announcement APIs and the announcement feed behaviour."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from auth import create_jwt
from tests import test_admin_dashboard_stats_live as _dash
from tests.test_admin_dashboard_stats_live import API, db_insert, db_read


@pytest.fixture(scope="module")
def env():
    db_name = _dash._sanitize_db_name(_dash.os.environ["DB_NAME"])
    assert db_name != "test_database"
    now = datetime.now(timezone.utc)
    ids = {r: f"rbac_{r}_{uuid.uuid4().hex[:8]}" for r in ("super_admin", "admin", "user")}

    def setup(db):
        async def run():
            await db.users.insert_many([{"user_id": uid, "email": f"{uid}@example.test", "role": role, "name": role,
                                         "phone_verified": True, "email_verified": True, "created_at": now - timedelta(days=30)}
                                        for role, uid in ids.items()])
        return run()
    db_insert(db_name, setup)
    headers = {r: {"Authorization": f"Bearer {create_jwt(uid)}"} for r, uid in ids.items()}
    yield db_name, headers, ids

    def cleanup(db):
        async def run():
            await db.users.delete_many({"user_id": {"$in": list(ids.values())}})
            await db.site_announcements.delete_many({"created_by": {"$in": list(ids.values())}})
            await db.site_announcement_audit.delete_many({"actor_id": {"$in": list(ids.values())}})
            await db.world_gc_preview_sandboxes.delete_many({"_id": {"$in": list(ids.values())}})
        return run()
    db_insert(db_name, cleanup)


def _call(method, path, headers=None, **kw):
    return requests.request(method, f"{API}{path}", headers=headers or {}, timeout=20, **kw)


PROTECTED_GC = [
    ("GET", "/admin/world-gc/competitions", None),
    ("GET", "/admin/world-gc/competitions/4", None),
    ("PUT", "/admin/world-gc/competitions/4", {"model": "champion_only"}),
    ("GET", "/admin/world-gc/competitions/4/report/L1", None),
    ("GET", "/admin/world-gc/competitions/4/audit", None),
    ("POST", "/admin/world-gc/competitions/4/apply-current", {"confirmation": "APPLY GC4"}),
    ("POST", "/admin/world-gc/competitions/4/apply-future", {"confirmation": "APPLY GC4 FUTURE"}),
    ("GET", "/admin/world-gc/free-world/pause", None),
    ("POST", "/admin/world-gc/free-world/pause", {"reason": "x"}),
    ("POST", "/admin/world-gc/free-world/resume", {}),
    ("GET", "/admin/world-gc/preview", None),
    ("POST", "/admin/world-gc/preview/reset", {"gc_number": 4}),
    ("POST", "/admin/world-gc/preview/action", {"action": "jump", "level": "L1"}),
    ("GET", "/admin/leaderboards/free-world/4", None),
    ("PUT", "/admin/leaderboards/free-world/score_x/time", {"duration_ms": 1000, "reason": "approved correction"}),
]
PROTECTED_ANN = [
    ("GET", "/admin/announcements", None),
    ("GET", "/admin/announcements/audit", None),
    ("POST", "/admin/announcements", {"title": "t", "text": "x"}),
    ("PUT", "/admin/announcements/ann_x", {"title": "t", "text": "x"}),
    ("POST", "/admin/announcements/ann_x/publish", None),
    ("POST", "/admin/announcements/ann_x/unpublish", None),
    ("POST", "/admin/announcements/ann_x/disable", None),
    ("POST", "/admin/announcements/ann_x/enable", None),
    ("POST", "/admin/announcements/reorder", {"ids": ["ann_x"]}),
    ("DELETE", "/admin/announcements/ann_x", None),
]


def test_regular_admin_and_players_get_403_on_every_protected_endpoint(env):
    _, headers, _ = env
    for method, path, body in PROTECTED_GC + PROTECTED_ANN:
        for role in ("admin", "user"):
            res = _call(method, path, headers[role], json=body)
            assert res.status_code == 403, (role, method, path, res.status_code, res.text[:120])
        assert _call(method, path, None, json=body).status_code in (401, 403), (method, path)


def test_super_admin_keeps_access_and_other_admin_permissions_unchanged(env):
    _, headers, _ = env
    sa, admin = headers["super_admin"], headers["admin"]
    for path in ("/admin/world-gc/competitions", "/admin/world-gc/competitions/4", "/admin/world-gc/free-world/pause",
                 "/admin/world-gc/competitions/4/report/L1", "/admin/announcements"):
        assert _call("GET", path, sa).status_code == 200, path
    assert _call("GET", "/admin/leaderboards/free-world/4", sa).status_code != 403
    contests = _call("GET", "/admin/leaderboards/contests", admin).json()
    assert contests["paid_contests"] is not None and contests["free_world_contests"] == []
    assert _call("GET", "/admin/leaderboards/contests", sa).json()["free_world_contests"] is not None
    assert _call("POST", "/admin/world-gc/preview/reset", sa, json={"gc_number": 4}).status_code == 200
    # Unrelated admin APIs still open to regular admins (and the +24h extension / contests list are untouched).
    for path in ("/admin/world/contests", "/admin/world/season-schedule?season_start_at=2026-09-15T00:00:00%2B01:00",
                 "/admin/world/ticker-winners", "/admin/winners"):
        assert _call("GET", path, admin).status_code == 200, path


def test_public_player_endpoints_stay_open(env):
    _, headers, _ = env
    assert _call("GET", "/world/public/leaderboard").status_code == 200
    assert _call("GET", "/world/public/champion/leaderboard").status_code in (200, 404)
    assert _call("GET", "/world/public/champion-winners").status_code == 200
    assert _call("GET", "/world/pause-status").status_code == 200
    assert _call("GET", "/world/gc/level-board/4/1", headers["user"]).status_code == 200
    assert _call("GET", "/announcements").status_code == 200


def _mk(sa, **over):
    body = {"title": "T", "text": "Hello players", "priority": 0, **over}
    res = _call("POST", "/admin/announcements", sa, json=body)
    assert res.status_code == 200, res.text
    return res.json()


def _public_ids():
    return [a["id"] for a in _call("GET", "/announcements").json()["announcements"]]


def test_announcement_lifecycle_visibility_priority_validation_and_audit(env):
    db_name, headers, ids = env
    sa = headers["super_admin"]
    iso = lambda delta: (datetime.now(timezone.utc) + delta).isoformat()  # noqa: E731

    draft = _mk(sa, title="Draft one", text="Draft text")
    aid = draft["announcement_id"]
    assert draft["status"] == "draft" and aid not in _public_ids()  # drafts never leak
    assert "Draft text" not in _call("GET", "/announcements").text

    edited = _call("PUT", f"/admin/announcements/{aid}", sa, json={"title": "Draft one", "text": "Edited text", "priority": 5}).json()
    assert edited["text"] == "Edited text" and edited["priority"] == 5
    assert edited["status"] == "draft"  # saving as draft never leaves a previously published item live
    assert _call("POST", f"/admin/announcements/{aid}/publish", sa).json()["status"] == "published"
    assert aid in _public_ids()
    public = [a for a in _call("GET", "/announcements").json()["announcements"] if a["id"] == aid][0]
    assert set(public) == {"id", "text", "icon", "link"}  # no admin metadata

    assert _call("POST", f"/admin/announcements/{aid}/disable", sa).json()["status"] == "disabled" and aid not in _public_ids()
    assert _call("POST", f"/admin/announcements/{aid}/enable", sa).json()["status"] == "published" and aid in _public_ids()
    assert _call("POST", f"/admin/announcements/{aid}/unpublish", sa).json()["status"] == "draft" and aid not in _public_ids()

    # Scheduling and expiry are enforced server-side.
    future = _mk(sa, text="Coming soon", start_at=iso(timedelta(hours=1)), publish=True)
    assert future["status"] == "scheduled" and future["announcement_id"] not in _public_ids()
    expired = _mk(sa, text="Old news", start_at=iso(-timedelta(hours=3)), end_at=iso(-timedelta(hours=1)), publish=True)
    assert expired["status"] == "expired" and expired["announcement_id"] not in _public_ids()
    db_insert(db_name, lambda db: db.site_announcements.update_one(
        {"announcement_id": future["announcement_id"]}, {"$set": {"start_at": datetime.now(timezone.utc) - timedelta(minutes=1)}}))
    assert future["announcement_id"] in _public_ids()  # appears automatically once its start time passes

    # Priority ordering, with manual order as tie-break.
    low = _mk(sa, text="Low", priority=1, publish=True)
    high = _mk(sa, text="High", priority=90, publish=True, link="/winners", icon="🏆")
    order = _public_ids()
    assert order.index(high["announcement_id"]) < order.index(low["announcement_id"])
    assert order[0] == high["announcement_id"]
    ext = _mk(sa, text="External", priority=2, publish=True, link="https://example.com/page")
    assert _call("POST", "/admin/announcements/reorder", sa, json={"ids": [low["announcement_id"], ext["announcement_id"]]}).status_code == 200

    # Input safety.
    for bad in ({"text": "<script>alert(1)</script>"}, {"text": "ok", "link": "javascript:alert(1)"},
                {"text": "ok", "link": "//evil.example"}, {"text": "ok", "icon": "<b>"},
                {"text": "ok", "start_at": iso(timedelta(hours=2)), "end_at": iso(timedelta(hours=1))},
                {"text": "ok", "start_at": "2026-01-01T10:00:00"}, {"text": "   "}):
        assert _call("POST", "/admin/announcements", sa, json={"title": "bad", **bad}).status_code == 422, bad

    # Delete + audit trail.
    assert _call("DELETE", f"/admin/announcements/{aid}", sa).status_code == 200
    assert aid not in [a["announcement_id"] for a in _call("GET", "/admin/announcements", sa).json()["announcements"]]
    assert _call("DELETE", f"/admin/announcements/{aid}", sa).status_code == 404
    actions = [r["action"] for r in _call("GET", f"/admin/announcements/audit?announcement_id={aid}", sa).json()["items"]]
    for expected in ("create_draft", "edit", "publish", "disable", "enable", "unpublish", "delete"):
        assert expected in actions, (expected, actions)
    sched = [r["action"] for r in _call("GET", f"/admin/announcements/audit?announcement_id={future['announcement_id']}", sa).json()["items"]]
    assert "create_published" in sched
    audit = _call("GET", "/admin/announcements/audit", sa).json()["items"]
    assert any(r["action"] == "reorder" for r in audit) and all(r["actor_id"] for r in audit if r["announcement_id"] == aid)
    assert any(r["actor_id"] == ids["super_admin"] for r in audit)


def test_winner_announcements_feed_is_independent_of_managed_announcements(env):
    _, headers, _ = env
    before = _call("GET", "/world/public/champion-winners").json()
    _mk(headers["super_admin"], text="Promo only", publish=True)
    after = _call("GET", "/world/public/champion-winners").json()
    assert before == after and "winners" in after  # managed announcements never touch winner data
