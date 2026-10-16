"""Free World admin accuracy: effective vs cached progress, edits, unlocks, Champion data."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from routers import world_routes
from tests.test_world_admin_progress_override import (  # noqa: F401  (isolate is an autouse fixture)
    SEASON, USER, Collection, _edit, attempts, base_progress, isolate, make_db,
)


def view(progress, *levels, stage=2):
    verified = world_routes._verified_levels_from_attempts(progress, attempts(*levels, stage=stage))
    return world_routes._admin_progress_view(progress, verified)


# --- Problem 1: displayed completed levels come from verified records -------------

def test_stale_cache_with_nine_levels_shows_ten_when_level_ten_is_verified():
    progress = base_progress(current_level=10, highest_unlocked_level=10,
                             completed_levels=list(range(1, 10)))
    v = view(progress, *range(1, 11))
    assert v["completed_count"] == 10
    assert v["champion_ready"] is True
    assert v["cached_completed_levels"] == list(range(1, 10))
    assert v["cache_out_of_date"] is True


@pytest.mark.parametrize("passed, current, count, ready", [
    ((), 1, 0, False),                      # level 1 user
    (tuple(range(1, 9)), 9, 8, False),      # level 9 user
    (tuple(range(1, 10)), 10, 9, False),    # 9 passed: Champion not unlocked
    (tuple(range(1, 11)), 10, 10, True),    # all ten: Champion unlocked
])
def test_progress_by_level(passed, current, count, ready):
    v = view(base_progress(), *passed)
    assert (v["current_level"], v["completed_count"], v["champion_ready"]) == (current, count, ready)


def test_champion_attempts_never_count_as_normal_levels():
    db = make_db(base_progress(), attempts(1, 2, 3))
    db.world_contest_entries = Collection([{"season_id": SEASON, "user_id": USER, "global_contest_number": 2,
                                            "champion_stage_snapshot": 2, "status": "entered"}])
    db.world_champion_sessions = Collection([
        {"season_id": SEASON, "user_id": USER, "global_contest_number": 2, "begun_at": "t"},
        {"season_id": SEASON, "user_id": USER, "global_contest_number": 2, "begun_at": "t"},
    ])
    db.world_champion_scores = Collection([{"season_id": SEASON, "user_id": USER, "global_contest_number": 2,
                                            "score": 30, "duration_ms": 35000}])
    progress = base_progress()
    v = view(progress, 1, 2, 3)
    detail = asyncio.run(world_routes._admin_level_and_champion_detail(db, USER, progress, v, 2))
    assert v["completed_count"] == 3
    assert detail["champion"]["attempts_total"] == 2
    assert detail["champion"]["scores"][0]["duration_ms"] == 35000
    assert [l["passes"] for l in detail["levels"]][:4] == [1, 1, 1, 0]


def test_earlier_championship_passes_are_reported_separately():
    rows = attempts(*range(1, 11), stage=1) + attempts(1, stage=2)
    db = make_db(base_progress(), rows)
    for name in ("world_contest_entries", "world_champion_sessions", "world_champion_scores"):
        setattr(db, name, Collection())
    progress = base_progress()
    v = view(progress, 1)
    detail = asyncio.run(world_routes._admin_level_and_champion_detail(db, USER, progress, v, 2))
    assert detail["earlier_championships"] == [{"stage": "1", "verified_passed_levels": list(range(1, 11))}]
    assert v["completed_count"] == 1


# --- Problem 2: edits persist, survive refresh and reconciliation -------------------

def effective(db):
    return asyncio.run(world_routes._free_world_progress(db, USER))


def test_edit_from_level_nine_to_ten_persists_and_unlocks_champion(monkeypatch):
    db = make_db(base_progress(current_level=9, highest_unlocked_level=9,
                               completed_levels=list(range(1, 9))), attempts(*range(1, 9)))
    result = _edit(db, monkeypatch, completed_levels=list(range(1, 11)))
    assert result["updated"] is True
    for _ in range(2):  # refresh + repeated backend reconciliation
        now = effective(db)
        assert now["completed_levels"] == list(range(1, 11))
        assert now["champion_ready"] is True and now["current_level"] == 10
    stored = db.world_progress.rows[0]
    assert stored["admin_override_by"] == "admin-1" and stored["admin_override_stage"] == 2
    audit = db.world_progress_audit_log.rows[0]
    assert audit["kind"] == "admin_progress_override" and audit["actor_email"] == "a@example.com"


def test_stale_cache_is_corrected_by_saving_what_the_admin_sees(monkeypatch):
    # Cache says 9, verified attempts say 10: the form shows 10; changing the level must keep 10.
    db = make_db(base_progress(current_level=9, highest_unlocked_level=9,
                               completed_levels=list(range(1, 10))), attempts(*range(1, 11)))
    assert effective(db)["completed_levels"] == list(range(1, 11))
    _edit(db, monkeypatch, current_level=9, highest_unlocked_level=10)
    now = effective(db)
    assert now["completed_levels"] == list(range(1, 11)) and now["champion_ready"] is True


def test_lowering_below_ten_removes_champion_eligibility_without_touching_attempts(monkeypatch):
    db = make_db(base_progress(), attempts(*range(1, 11)))
    rows_before = [dict(r) for r in db.world_level_attempts.rows]
    _edit(db, monkeypatch, completed_levels=list(range(1, 10)))
    now = effective(db)
    assert now["completed_levels"] == list(range(1, 10)) and now["champion_ready"] is False
    assert db.world_level_attempts.rows == rows_before


def test_unlock_grants_access_without_fabricating_completions(monkeypatch):
    db = make_db(base_progress(), attempts(1, 2))
    _edit(db, monkeypatch, highest_unlocked_level=6)
    now = effective(db)
    assert now["completed_levels"] == [1, 2]
    start = datetime.now(timezone.utc) - timedelta(hours=1)  # level 6 is time-locked on schedule
    six = world_routes._personal_unlock_context(6, now, 1, start)
    seven = world_routes._personal_unlock_context(7, now, 1, start)
    assert six["available"] is True and six["completed"] is False
    assert seven["available"] is False


def test_without_an_override_the_schedule_still_locks_future_levels():
    progress = base_progress(completed_levels=[1, 2])
    start = datetime.now(timezone.utc) - timedelta(hours=1)
    assert world_routes._personal_unlock_context(4, progress, 1, start)["available"] is False


def test_unlocks_are_ignored_after_the_championship_changes(monkeypatch):
    db = make_db(base_progress(), attempts(1, 2))
    _edit(db, monkeypatch, highest_unlocked_level=6)
    assert world_routes._admin_unlocked_level(db.world_progress.rows[0], 5) is True

    async def gc3(_db):
        return {"contest_number": 3, "start_at": datetime.now(timezone.utc) - timedelta(days=1)}

    monkeypatch.setattr(world_routes, "_active_contest", gc3)
    monkeypatch.setattr(world_routes, "expected_personal_championship", lambda *_a: 3)
    rolled = effective(db)
    assert rolled["champion_stage"] == 3 and rolled["admin_unlocked_levels"] == []
    assert world_routes._admin_unlocked_level(rolled, 5) is False


# --- Authorization ---------------------------------------------------------------

@pytest.mark.parametrize("role", ["support", "operator"])
def test_only_admins_can_edit_progress(monkeypatch, role):
    db = make_db(base_progress(), attempts(1))

    async def staff(_request):
        return {"user_id": "s-1", "email": "s@example.com", "role": role}

    monkeypatch.setattr(world_routes, "require_admin", staff)
    monkeypatch.setattr(world_routes, "get_db", lambda: db)
    payload = world_routes.WorldProgressEditInput(completed_levels=[1, 2])
    with pytest.raises(HTTPException) as err:
        asyncio.run(world_routes.admin_edit_user_progress(USER, payload, None))
    assert err.value.status_code == 403
    assert db.world_progress_audit_log.rows == []
