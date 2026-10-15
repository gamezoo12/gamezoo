import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routers import world_routes

USER = "user-1"
SEASON = world_routes.WORLD_SEASON_ID


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    async def to_list(self, *_a, **_k):
        return [dict(r) for r in self.rows]


class Collection:
    def __init__(self, rows=None):
        self.rows = rows or []

    def _match(self, row, flt):
        if "$or" in flt and not any(self._match(row, sub) for sub in flt["$or"]):
            return False
        for key, cond in flt.items():
            if isinstance(cond, dict) and cond.get("$exists") is False and key in row:
                return False
        return all(row.get(k) == v for k, v in flt.items() if not isinstance(v, dict) and k != "$or")

    def find(self, flt=None, *_a, **_k):
        return Cursor([r for r in self.rows if self._match(r, flt or {})])

    async def find_one(self, flt=None, *_a, **_k):
        rows = [r for r in self.rows if self._match(r, flt or {})]
        return dict(rows[0]) if rows else None

    async def update_one(self, flt, update, **_k):
        for row in self.rows:
            if self._match(row, flt):
                row.update(update.get("$set", {}))
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def insert_one(self, doc):
        self.rows.append(doc)


def make_db(progress, attempts=()):
    return SimpleNamespace(
        world_progress=Collection([progress]),
        world_level_attempts=Collection(list(attempts)),
        world_level_skips=Collection(),
        world_progress_audit_log=Collection(),
        world_global_contests=Collection(
            [{"season_id": SEASON, "contest_number": n} for n in (1, 2, 3)]
        ),
    )


def base_progress(**extra):
    row = {
        "season_id": SEASON, "user_id": USER, "champion_stage": 2,
        "current_level": 1, "highest_unlocked_level": 1, "completed_levels": [],
        "champion_ready": False, "skipped_levels": [], "token_unlocked_levels": [],
        "season_complete": False, "personal_stage_started_at": None,
        "free_world_started_global_contest": 1,
    }
    row.update(extra)
    return row


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    async def no_contest(_db):
        return None

    async def cohort(_db, _uid, fallback=None):
        return 1

    monkeypatch.setattr(world_routes, "_active_contest", no_contest)
    monkeypatch.setattr(world_routes, "_free_world_signup_contest", cohort)


def attempts(*levels, stage=2):
    return [
        {"season_id": SEASON, "user_id": USER, "level": lv, "passed": True,
         "completed_at": "t", "champion_stage": stage}
        for lv in levels
    ]


def test_unpinned_progress_is_still_derived_from_verified_attempts():
    db = make_db(base_progress(current_level=5, highest_unlocked_level=5), attempts(1, 2))
    result = asyncio.run(world_routes._free_world_progress(db, USER))
    assert (result["current_level"], result["completed_levels"]) == (3, [1, 2])


def test_admin_pinned_progress_survives_reconciliation_for_same_championship():
    row = base_progress(current_level=5, highest_unlocked_level=5,
                        completed_levels=[1, 2, 3, 4], admin_override_stage=2)
    db = make_db(row, attempts(1, 2))
    result = asyncio.run(world_routes._free_world_progress(db, USER))
    assert (result["current_level"], result["highest_unlocked_level"]) == (5, 5)
    assert result["completed_levels"] == [1, 2, 3, 4]


def test_pin_from_an_earlier_championship_is_ignored():
    row = base_progress(current_level=5, highest_unlocked_level=5, admin_override_stage=1)
    db = make_db(row, attempts(1, 2))
    result = asyncio.run(world_routes._free_world_progress(db, USER))
    assert result["current_level"] == 3


def _edit(db, monkeypatch, **body):
    async def admin(_request):
        return {"user_id": "admin-1", "email": "a@example.com", "role": "admin"}

    async def detail(_uid, _request):
        return {"progress": {}, "audit": []}

    monkeypatch.setattr(world_routes, "require_admin", admin)
    monkeypatch.setattr(world_routes, "get_db", lambda: db)
    monkeypatch.setattr(world_routes, "admin_get_user_progress", detail)
    payload = world_routes.WorldProgressEditInput(**body)
    return asyncio.run(world_routes.admin_edit_user_progress(USER, payload, None))


def test_admin_raise_is_applied_to_free_world_progress_without_touching_attempts(monkeypatch):
    db = make_db(base_progress(), attempts(1, 2))
    attempts_before = [dict(r) for r in db.world_level_attempts.rows]
    result = _edit(db, monkeypatch, current_level=5, highest_unlocked_level=5, completed_levels=[1, 2, 3, 4])
    assert result["updated"] is True
    effective = asyncio.run(world_routes._free_world_progress(db, USER))
    assert (effective["current_level"], effective["completed_levels"]) == (5, [1, 2, 3, 4])
    assert db.world_level_attempts.rows == attempts_before
    assert db.world_progress_audit_log.rows[0]["changes"]


def test_admin_lowering_keeps_verified_attempt_records(monkeypatch):
    db = make_db(base_progress(current_level=4, highest_unlocked_level=4, completed_levels=[1, 2, 3]), attempts(1, 2, 3))
    attempts_before = [dict(r) for r in db.world_level_attempts.rows]
    _edit(db, monkeypatch, current_level=2, highest_unlocked_level=2, completed_levels=[1])
    effective = asyncio.run(world_routes._free_world_progress(db, USER))
    assert (effective["current_level"], effective["completed_levels"]) == (2, [1])
    assert db.world_level_attempts.rows == attempts_before


def test_admin_edit_returns_an_error_when_the_write_matches_no_record(monkeypatch):
    db = make_db(base_progress())

    async def no_match(*_a, **_k):
        return SimpleNamespace(matched_count=0, modified_count=0)

    monkeypatch.setattr(db.world_progress, "update_one", no_match)
    with pytest.raises(HTTPException) as err:
        _edit(db, monkeypatch, current_level=3, highest_unlocked_level=3, completed_levels=[1, 2])
    assert err.value.status_code == 409
    assert db.world_progress_audit_log.rows == []


def test_level_3_to_6_is_unlocked_in_free_world_after_reload(monkeypatch):
    from datetime import datetime, timedelta, timezone

    db = make_db(base_progress(current_level=3, highest_unlocked_level=3, completed_levels=[1, 2]), attempts(1, 2))
    _edit(db, monkeypatch, current_level=6, highest_unlocked_level=6, completed_levels=[1, 2, 3, 4, 5])

    reloaded = asyncio.run(world_routes._free_world_progress(db, USER))
    assert (reloaded["current_level"], reloaded["highest_unlocked_level"]) == (6, 6)
    assert world_routes._next_required_level(reloaded) == 6

    start = datetime.now(timezone.utc) - timedelta(days=30)
    level_six = world_routes._personal_unlock_context(6, reloaded, 1, start)
    assert level_six["available"] is True and level_six["locked"] is False
    assert all(
        world_routes._personal_unlock_context(n, reloaded, 1, start)["completed"] for n in range(1, 6)
    )


def test_override_resets_when_the_user_moves_to_a_new_championship(monkeypatch):
    from datetime import datetime, timedelta, timezone

    db = make_db(base_progress(), attempts(1, 2))
    _edit(db, monkeypatch, current_level=6, highest_unlocked_level=6, completed_levels=[1, 2, 3, 4, 5])
    assert db.world_progress.rows[0]["admin_override_stage"] == 2

    async def gc3(_db):
        return {"contest_number": 3, "start_at": datetime.now(timezone.utc) - timedelta(days=1)}

    monkeypatch.setattr(world_routes, "_active_contest", gc3)
    monkeypatch.setattr(world_routes, "expected_personal_championship", lambda *_a: 3)
    attempts_before = [dict(r) for r in db.world_level_attempts.rows]

    rolled = asyncio.run(world_routes._free_world_progress(db, USER))
    assert rolled["champion_stage"] == 3
    assert (rolled["current_level"], rolled["highest_unlocked_level"], rolled["completed_levels"]) == (1, 1, [])
    assert db.world_level_attempts.rows == attempts_before
