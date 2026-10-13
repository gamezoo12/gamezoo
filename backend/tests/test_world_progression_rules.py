import asyncio
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from routers import world_routes
from scripts.preview_world_progression_migration import (
    _derive_cohort,
    _next_gc_boundary_window,
    _resolve_attempt_stage,
    _stage_for_timestamp,
)
from services.world_championship_schedule import (
    championship_window,
    contest_for_time,
    contest_for_time,
    expected_personal_championship,
    global_contest_for_stage,
    london_calendar_datetime,
)
from services import world_championship_scheduler


def test_expected_personal_championship_gc1_to_gc2():
    assert expected_personal_championship(2, 1) == 2


def test_expected_personal_championship_gc2_to_gc3_for_gc1_user():
    assert expected_personal_championship(3, 1) == 3


def test_expected_personal_championship_gc3_for_gc2_user():
    assert expected_personal_championship(3, 2) == 2


def test_registration_timestamp_overrides_stale_gc1_cohort():
    settings = {
        "season_start_at": datetime(2026, 9, 14, 23, tzinfo=timezone.utc),
    }
    user = {
        "created_at": datetime(2026, 10, 8, 18, tzinfo=timezone.utc),
        "free_world_started_global_contest": 1,
    }
    progress = {"free_world_started_global_contest": 1}
    cohort, source = world_routes._resolve_registration_cohort(
        user, progress, settings, [1, 2, 3, 4],
    )

    assert (cohort, source) == (2, "registration_timestamp")
    assert expected_personal_championship(3, cohort, [1, 2, 3, 4]) == 2


def test_admin_championship_snapshot_reports_timestamp_cohort_and_stale_stage():
    settings = {
        "season_start_at": datetime(2026, 9, 14, 23, tzinfo=timezone.utc),
    }
    user = {
        "created_at": datetime(2026, 10, 8, 18, tzinfo=timezone.utc),
        "free_world_started_global_contest": 1,
    }
    progress = {
        "champion_stage": 3,
        "free_world_started_global_contest": 1,
    }

    snapshot = asyncio.run(world_routes._admin_world_championship_snapshot(
        None, user, progress, 3, [1, 2, 3, 4], settings,
    ))

    assert snapshot["registration_global_contest"] == 2
    assert snapshot["calculated_personal_championship"] == 2
    assert snapshot["stored_personal_championship"] == 3
    assert snapshot["championship_mismatch"] is True
    assert snapshot["registration_cohort_mismatch"] is True
    assert "timestamp-derived GC2" in snapshot["championship_warning"]


def test_gc_boundary_rollover_targets_expected_stage_without_touching_ledgers():
    progress = {
        "champion_stage": 3,
        "current_level": 7,
        "highest_unlocked_level": 8,
        "completed_levels": [1, 2, 3, 4, 5, 6],
        "free_world_started_global_contest": 1,
        "verified_passes": [1, 2, 3, 4, 5, 6],
    }
    now = datetime(2026, 10, 9, 23, tzinfo=timezone.utc)

    patch = world_championship_scheduler._personal_stage_rollover_patch(
        progress, expected_stage=2, registration_gc=2,
        active_start=now, now=now,
    )

    assert patch["champion_stage"] == 2
    assert patch["current_level"] == 1
    assert patch["completed_levels"] == []
    assert patch["free_world_started_global_contest"] == 2
    assert "verified_passes" not in patch
    assert "wallet" not in patch
    assert "prizes" not in patch


def test_expected_personal_championship_before_registration_cohort():
    assert expected_personal_championship(1, 2) == 1


def test_expected_personal_championship_gc20_to_gc21():
    assert expected_personal_championship(21, 20) == 2


def test_expected_personal_championship_uses_ordered_sequence_with_gaps():
    assert expected_personal_championship(4, 2, [1, 2, 4, 5]) == 2


def test_expected_personal_championship_rejects_unconfigured_contest():
    try:
        expected_personal_championship(3, 1, [1, 2, 4])
    except ValueError as exc:
        assert "missing from the configured sequence" in str(exc)
    else:
        raise AssertionError("Expected an invalid configured sequence error")


def test_schedule_slot_maps_to_nonconsecutive_configured_contest():
    season_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    now = datetime(2026, 1, 26, tzinfo=timezone.utc)

    resolved = contest_for_time(
        season_start,
        now,
        [1, 2, 4, 5],
    )

    assert resolved["championship_number"] == 3
    assert resolved["global_contest_number"] == 4


def test_all_configured_season_one_slots_map_dynamically():
    season_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    sequence = list(range(1, 101))

    for slot, global_contest in enumerate(sequence, start=1):
        start = championship_window(season_start, slot)["start_at"]
        resolved = contest_for_time(season_start, start, sequence)
        assert resolved["global_contest_number"] == global_contest


def test_personal_stage_maps_through_configured_sequence():
    sequence = [1, 2, 4, 5]

    assert global_contest_for_stage(2, 2, sequence) == 4
    assert global_contest_for_stage(5, 2, sequence) is None


def test_active_level_gate_uses_next_verified_pass_not_skip_or_counter(monkeypatch):
    now = datetime(2026, 1, 6, tzinfo=timezone.utc)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(world_routes, "_utcnow", lambda: now)
    progress = {
        "completed_levels": [1],
        "skipped_levels": [2],
        "highest_unlocked_level": 6,
    }

    next_level = world_routes._personal_unlock_context(
        2, progress, active_number=4, active_start_at=start
    )
    later_level = world_routes._personal_unlock_context(
        5, progress, active_number=4, active_start_at=start
    )

    assert next_level["available"] is True
    assert later_level["available"] is False
    assert later_level["lock_reason"] == "progression"


def test_london_schedule_keeps_midnight_across_spring_dst():
    season_start = datetime(2026, 3, 28, tzinfo=timezone.utc)
    next_local_midnight = london_calendar_datetime(season_start, 2)

    assert next_local_midnight == datetime(2026, 3, 29, 23, tzinfo=timezone.utc)
    london_time = next_local_midnight.astimezone(ZoneInfo("Europe/London"))
    assert (london_time.year, london_time.month, london_time.day) == (2026, 3, 30)
    assert (london_time.hour, london_time.minute) == (0, 0)


def test_london_schedule_keeps_midnight_across_autumn_dst():
    season_start = datetime(2026, 10, 24, 23, tzinfo=timezone.utc)
    next_local_midnight = london_calendar_datetime(season_start, 1)

    assert next_local_midnight == datetime(2026, 10, 26, 0, tzinfo=timezone.utc)
    assert next_local_midnight - season_start == timedelta(hours=25)
    london_time = next_local_midnight.astimezone(ZoneInfo("Europe/London"))
    assert (london_time.year, london_time.month, london_time.day) == (2026, 10, 26)
    assert (london_time.hour, london_time.minute) == (0, 0)


def test_regular_championship_window_has_46_and_48_hour_offsets():
    season_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    window = championship_window(season_start, 2)

    assert window["champion_closes_at"] - window["champion_opens_at"] == timedelta(hours=46)
    assert window["next_start_at"] - window["champion_opens_at"] == timedelta(hours=48)


def test_migration_preview_boundary_uses_next_configured_gc_slot():
    setting = {"season_start_at": datetime(2026, 1, 1, tzinfo=timezone.utc)}
    sequence = [1, 2, 4, 5]

    boundary = _next_gc_boundary_window(setting, sequence, 2)
    expected = championship_window(setting["season_start_at"], 3)["start_at"]

    assert boundary["boundary"] == expected
    assert boundary["start"] == expected - timedelta(hours=24)
    assert boundary["end"] == expected + timedelta(hours=24)


def test_stage_less_attempt_uses_matching_session_snapshot_first():
    attempt = {"session_id": "session-1", "user_id": "user-1"}
    sessions = {("session-1", "user-1"): {"champion_stage": 3}}

    assert _resolve_attempt_stage(
        attempt,
        sessions,
        cohort=1,
        sequence=[1, 2, 4, 5],
        setting={},
    ) == (3, "matching_game_session_championship_snapshot")


def test_stage_less_attempt_uses_unique_london_schedule_window():
    season_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    timestamp = championship_window(season_start, 3)["start_at"]
    stage, basis = _stage_for_timestamp(
        timestamp,
        cohort=2,
        sequence=[1, 2, 4, 5],
        setting={"season_start_at": season_start},
    )

    assert stage == 2
    assert basis == "unique_london_schedule_window"


def test_stage_less_attempt_without_snapshot_or_time_remains_unresolved():
    stage, basis = _resolve_attempt_stage(
        {"user_id": "user-1"},
        {},
        cohort=1,
        sequence=[1, 2, 4],
        setting={},
    )

    assert stage is None
    assert basis == "missing_attempt_timestamp"


def test_missing_cohort_derives_from_created_at_and_configured_sequence():
    season_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    registered_at = championship_window(season_start, 3)["start_at"]

    assert _derive_cohort(
        {"created_at": registered_at},
        {"season_start_at": season_start},
        [1, 2, 4, 5],
    ) == (4, "created_at_london_schedule_window")


@pytest.mark.parametrize(
    ("sessions", "closed", "expected"),
    [
        ([{"status": "created"}], True, "missed"),
        ([{"status": "begun"}], True, "pending"),
        ([{"status": "submitted", "passed": False}], False, "failed"),
        ([{"status": "submitted", "passed": True}], True, "passed"),
        ([], False, None),
    ],
)
def test_champion_result_status_requires_valid_started_result(sessions, closed, expected):
    assert world_routes._champion_result_status(sessions, closed=closed) == expected


def test_verified_passes_repair_current_level_and_champion_readiness():
    progress = world_routes._verified_level_progress([1, 2, 4, 11])

    assert progress == {
        "completed_levels": [1, 2, 4],
        "current_level": 3,
        "highest_unlocked_level": 3,
        "champion_ready": False,
    }
    assert world_routes._verified_level_progress(range(1, 11))["champion_ready"] is True


def test_duplicate_progress_rows_are_refused_before_reconciliation():
    class Cursor:
        def limit(self, _count):
            return self

        async def to_list(self, _count):
            return [{"champion_stage": 1}, {"champion_stage": 2}]

    class ProgressCollection:
        def find(self, *_args):
            return Cursor()

    class Database:
        world_progress = ProgressCollection()

    with pytest.raises(HTTPException) as error:
        asyncio.run(world_routes._free_world_progress(Database(), "duplicate-user"))

    assert error.value.status_code == 409
    assert error.value.detail["code"] == "WORLD_PROGRESS_DUPLICATE"


@pytest.mark.parametrize(
    ("endpoint", "args", "expected_code"),
    [
        (world_routes.free_world_skip_level, (1, None), "SKIP_DISABLED"),
        (world_routes.continue_after_champion, (None,), "CONTINUE_DISABLED"),
    ],
)
def test_retired_progression_endpoints_reject_without_database_access(
    monkeypatch,
    endpoint,
    args,
    expected_code,
):
    async def authenticated_user(_request):
        return {"user_id": "test-user"}

    def database_must_not_be_accessed():
        raise AssertionError("Retired progression endpoint accessed the database")

    monkeypatch.setattr(world_routes, "get_current_user", authenticated_user)
    monkeypatch.setattr(world_routes, "get_db", database_must_not_be_accessed)

    with pytest.raises(HTTPException) as error:
        asyncio.run(endpoint(*args))

    assert error.value.status_code in (409, 410)
    assert error.value.detail["code"] == expected_code
