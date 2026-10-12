"""Read-only cohort and data-safety preview for World progression changes."""

from __future__ import annotations

import asyncio
import argparse
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env")

from services.world_championship_schedule import (
    championship_for_time,
    championship_window,
    ensure_utc,
    expected_personal_championship,
    ordered_contest_sequence,
)


WORLD_SEASON_ID = "season-1"


def _as_int(value, fallback=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _derive_cohort(user, setting, sequence):
    registered_at = user.get("created_at")
    season_start = setting.get("season_start_at")
    if not isinstance(registered_at, datetime) or not isinstance(season_start, datetime):
        return None, "missing_created_at_or_season_start"
    resolved = championship_for_time(
        ensure_utc(season_start),
        ensure_utc(registered_at),
        setting.get("championship_extensions") or {},
    )
    slot = _as_int(resolved.get("championship_number"))
    if resolved.get("phase") == "before_season":
        slot = 1
    if slot is None or slot < 1 or slot > len(sequence):
        return None, "registration_slot_not_configured"
    return sequence[slot - 1], "created_at_london_schedule_window"


def _subject_id(user_id):
    if not user_id:
        return "unknown"
    return hashlib.sha256(str(user_id).encode("utf-8")).hexdigest()[:12]


def _stage_for_timestamp(value, cohort, sequence, setting):
    if not isinstance(value, datetime):
        return None, "missing_attempt_timestamp"
    if cohort not in sequence:
        return None, "cohort_not_in_configured_sequence"
    season_start = setting.get("season_start_at")
    if not isinstance(season_start, datetime):
        return None, "season_start_not_configured"

    timestamp = ensure_utc(value)
    cohort_index = sequence.index(cohort)
    matches = []
    for schedule_index in range(cohort_index, len(sequence)):
        window = championship_window(
            ensure_utc(season_start),
            schedule_index + 1,
            setting.get("championship_extensions") or {},
        )
        start = ensure_utc(window["start_at"])
        end = ensure_utc(window.get("next_start_at") or window["champion_closes_at"])
        if start <= timestamp < end:
            matches.append(schedule_index - cohort_index + 1)

    if len(matches) == 1:
        return matches[0], "unique_london_schedule_window"
    if matches:
        return None, "multiple_schedule_windows_match"
    return None, "timestamp_outside_configured_cohort_windows"


def _resolve_attempt_stage(attempt, sessions_by_key, cohort, sequence, setting):
    session_id = attempt.get("session_id")
    user_id = attempt.get("user_id")
    session = sessions_by_key.get((session_id, user_id)) if session_id else None
    session_stage = _as_int((session or {}).get("champion_stage"))
    if session_stage is not None and 1 <= session_stage <= 100:
        return session_stage, "matching_game_session_championship_snapshot"
    timestamp = attempt.get("created_at") or attempt.get("started_at")
    if timestamp is None:
        timestamp = attempt.get("completed_at")
    return _stage_for_timestamp(timestamp, cohort, sequence, setting)


def _next_gc_boundary_window(setting, sequence, active_gc):
    if active_gc is None or not sequence or setting.get("season_start_at") is None:
        return None
    try:
        active_index = sequence.index(int(active_gc))
    except ValueError:
        return None

    next_schedule_slot = active_index + 2
    if next_schedule_slot > len(sequence):
        return None

    window = championship_window(
        ensure_utc(setting["season_start_at"]),
        next_schedule_slot,
        setting.get("championship_extensions") or {},
    )
    boundary = ensure_utc(window["start_at"])
    return {
        "boundary": boundary,
        "start": boundary - timedelta(hours=24),
        "end": boundary + timedelta(hours=24),
    }


async def _rows(collection, query=None, projection=None):
    return await collection.find(query or {}, projection or {"_id": 0}).to_list(None)


async def preview(db):
    setting = await db.world_settings.find_one(
        {"_id": "active_global_contest", "season_id": WORLD_SEASON_ID},
        {"_id": 0, "season_start_at": 1, "championship_extensions": 1},
    ) or {}
    contests = await _rows(
        db.world_global_contests,
        {"season_id": WORLD_SEASON_ID},
        {"_id": 0, "contest_number": 1, "status": 1},
    )
    sequence = ordered_contest_sequence(
        row.get("contest_number") for row in sorted(
            contests, key=lambda row: _as_int(row.get("contest_number"), 0)
        )
    )
    active_rows = [row for row in contests if row.get("status") == "active"]
    active_gc = _as_int(active_rows[0].get("contest_number")) if active_rows else None

    users = await _rows(
        db.users,
        {},
        {
            "_id": 0, "user_id": 1, "role": 1, "created_at": 1,
            "free_world_started_global_contest": 1,
        },
    )
    progress_rows = await _rows(
        db.world_progress,
        {"season_id": WORLD_SEASON_ID},
        {
            "_id": 0, "user_id": 1, "champion_stage": 1,
            "current_level": 1, "highest_unlocked_level": 1,
            "completed_levels": 1, "skipped_levels": 1,
            "free_world_started_global_contest": 1,
        },
    )
    duplicate_progress = await db.world_progress.aggregate([
        {
            "$match": {
                "season_id": {"$type": "string"},
                "user_id": {"$type": "string"},
            }
        },
        {
            "$group": {
                "_id": {"season_id": "$season_id", "user_id": "$user_id"},
                "records": {"$sum": 1},
            }
        },
        {"$match": {"records": {"$gt": 1}}},
    ]).to_list(None)
    attempts = await _rows(
        db.world_level_attempts,
        {"season_id": WORLD_SEASON_ID},
        {
            "_id": 0, "attempt_id": 1, "session_id": 1, "user_id": 1,
            "champion_stage": 1, "level": 1, "status": 1, "passed": 1,
            "created_at": 1, "started_at": 1, "completed_at": 1,
        },
    )
    skips = await _rows(
        db.world_level_skips,
        {"season_id": WORLD_SEASON_ID},
        {"_id": 0, "user_id": 1, "champion_stage": 1, "level": 1},
    )
    champion_sessions = await _rows(
        db.world_champion_sessions,
        {"season_id": WORLD_SEASON_ID},
        {
            "_id": 0, "user_id": 1, "global_contest_number": 1,
            "champion_stage_snapshot": 1, "status": 1, "passed": 1,
        },
    )
    game_sessions = await _rows(
        db.world_game_sessions,
        {"season_id": WORLD_SEASON_ID},
        {
            "_id": 0, "session_id": 1, "user_id": 1,
            "champion_stage": 1, "level": 1, "status": 1,
            "created_at": 1, "begun_at": 1,
        },
    )
    entries = await _rows(
        db.world_contest_entries,
        {"season_id": WORLD_SEASON_ID},
        {"_id": 0, "user_id": 1, "global_contest_number": 1, "champion_stage_snapshot": 1,
         "prize_amount_snapshot": 1, "status": 1},
    )
    unlock_reservations = await _rows(
        db.world_level_unlock_reservations,
        {"season_id": WORLD_SEASON_ID},
        {
            "_id": 0, "user_id": 1, "champion_stage": 1, "level": 1,
            "status": 1, "token_cost": 1, "created_at": 1, "paid_at": 1,
        },
    )
    winner_awards = await _rows(
        db.world_winner_awards,
        {"season_id": WORLD_SEASON_ID},
        {
            "_id": 0, "user_id": 1, "global_contest_number": 1,
            "champion_stage_snapshot": 1, "rank": 1, "status": 1,
            "wallet_credited": 1,
        },
    )

    users_by_id = {row.get("user_id"): row for row in users if row.get("user_id")}
    progress_by_id = {row.get("user_id"): row for row in progress_rows if row.get("user_id")}
    sessions_by_key = {
        (row.get("session_id"), row.get("user_id")): row
        for row in game_sessions
        if row.get("session_id")
    }
    user_rows = {row.get("user_id"): row for row in users if row.get("user_id")}
    progress_lists = defaultdict(list)
    for row in progress_rows:
        if row.get("user_id"):
            progress_lists[row["user_id"]].append(row)

    passes = defaultdict(set)
    attempts_by_user_level = defaultdict(list)
    unscoped_attempt_details = []
    pending_levels = 0
    unscoped_resolved = 0
    unscoped_unresolved = 0
    for attempt_index, row in enumerate(attempts):
        stage = _as_int(row.get("champion_stage"))
        level = _as_int(row.get("level"))
        user_id = row.get("user_id")
        if row.get("status") == "started":
            pending_levels += 1
        if level is not None:
            attempts_by_user_level[(user_id, level)].append(row)

        resolution = None
        resolution_basis = "stored_championship_stage"
        if stage is None:
            user = user_rows.get(user_id) or {}
            user_progress = (progress_lists.get(user_id) or [{}])[0]
            cohort = _as_int(user.get("free_world_started_global_contest"))
            if cohort is None:
                cohort = _as_int(user_progress.get("free_world_started_global_contest"))
            if cohort is None:
                cohort, _ = _derive_cohort(user, setting, sequence)
            resolution, resolution_basis = _resolve_attempt_stage(
                row,
                sessions_by_key,
                cohort,
                sequence,
                setting,
            )
            if resolution is None:
                unscoped_unresolved += 1
            else:
                unscoped_resolved += 1
                stage = resolution
            attempt_id = row.get("attempt_id") or row.get("session_id") or f"{user_id}:{attempt_index}"
            unscoped_attempt_details.append({
                "attempt_ref": _subject_id(attempt_id),
                "subject": _subject_id(user_id),
                "level": level,
                "status": row.get("status"),
                "passed": row.get("passed"),
                "inferred_championship": resolution,
                "resolution": resolution_basis,
                "written": False,
            })

        if row.get("passed") is True and stage is not None and level is not None:
            passes[(user_id, stage)].add(level)

    skipped = defaultdict(set)
    for row in skips:
        stage = _as_int(row.get("champion_stage"))
        level = _as_int(row.get("level"))
        if stage is not None and level is not None:
            skipped[(row.get("user_id"), stage)].add(level)

    cohort_counts = Counter()
    stage_counts = Counter()
    migration_counts = Counter()
    incomplete_history = set()
    users_missing_stored_cohort = 0
    users_missing_creation_time = 0
    cohort_errors = 0
    user_assignments = []
    stored_completion_conflicts = []
    assignment_conflicts = []

    player_user_ids = {
        user_id
        for user_id, user in user_rows.items()
        if user.get("role") == "user" or user_id in progress_lists
    }

    for user_id in sorted(player_user_ids):
        user = user_rows[user_id]
        matching_progress = progress_lists.get(user_id, [])
        progress = matching_progress[0] if len(matching_progress) == 1 else {}
        cohort_source = "user_registration_cohort"
        cohort = _as_int(user.get("free_world_started_global_contest"))
        if cohort is None:
            users_missing_stored_cohort += 1
            cohort = _as_int(progress.get("free_world_started_global_contest"))
            cohort_source = "progress_registration_cohort"
        if cohort is None:
            cohort, cohort_source = _derive_cohort(user, setting, sequence)
            if cohort is None:
                users_missing_creation_time += 1

        subject = _subject_id(user_id)
        if len(matching_progress) > 1:
            assignment_conflicts.append({
                "subject": subject,
                "reason": "multiple_progress_records_for_user",
                "records": len(matching_progress),
                "decision": "manual_review_no_assignment",
            })
            user_assignments.append({
                "subject": subject,
                "registration_gc": cohort,
                "registration_basis": cohort_source,
                "existing_championship": None,
                "expected_championship": None,
                "decision": "duplicate_progress_conflict",
            })
            continue

        if cohort is None or cohort not in sequence:
            cohort_errors += 1
            user_assignments.append({
                "subject": subject,
                "registration_gc": cohort,
                "registration_basis": cohort_source,
                "existing_championship": _as_int(progress.get("champion_stage")),
                "expected_championship": None,
                "decision": "cohort_conflict_no_assignment",
            })
            continue
        cohort_counts[cohort] += 1

        if active_gc is None:
            user_assignments.append({
                "subject": subject,
                "registration_gc": cohort,
                "registration_basis": cohort_source,
                "existing_championship": _as_int(progress.get("champion_stage")),
                "expected_championship": None,
                "decision": "no_active_gc_no_assignment",
            })
            continue
        try:
            expected = expected_personal_championship(active_gc, cohort, sequence)
        except ValueError:
            cohort_errors += 1
            user_assignments.append({
                "subject": subject,
                "registration_gc": cohort,
                "registration_basis": cohort_source,
                "existing_championship": _as_int(progress.get("champion_stage")),
                "expected_championship": None,
                "decision": "sequence_conflict_no_assignment",
            })
            continue

        if not progress:
            migration_counts["users_without_progress"] += 1
            user_assignments.append({
                "subject": subject,
                "registration_gc": cohort,
                "registration_basis": cohort_source,
                "existing_championship": None,
                "expected_championship": expected,
                "decision": "would_initialize_at_expected_stage",
            })
            continue

        actual = _as_int(progress.get("champion_stage"), 1)
        stage_counts[str(actual)] += 1
        if actual == expected:
            migration_counts["already_correct"] += 1
        elif actual < expected:
            migration_counts["would_advance"] += 1
            decision = "would_advance"
        else:
            migration_counts["ahead_of_schedule_conflicts"] += 1
            decision = "ahead_of_schedule_conflict"
        if actual == expected:
            decision = "already_correct"
        user_assignments.append({
            "subject": subject,
            "registration_gc": cohort,
            "registration_basis": cohort_source,
            "existing_championship": actual,
            "expected_championship": expected,
            "decision": decision,
        })

        for stage in range(1, expected):
            if len(passes[(user_id, stage)]) < 10:
                incomplete_history.add((user_id, stage))

        completed = set(_as_int(level) for level in progress.get("completed_levels") or [])
        completed.discard(None)
        verified = passes[(user_id, actual)]
        for level in sorted(completed - verified):
            level_attempts = attempts_by_user_level.get((user_id, level), [])
            other_verified_stages = sorted({
                _as_int(row.get("champion_stage"))
                for row in level_attempts
                if row.get("passed") is True and _as_int(row.get("champion_stage")) is not None
            })
            unresolved_for_level = [
                row for row in unscoped_attempt_details
                if row["subject"] == subject and row["level"] == level
                and row["inferred_championship"] is None
            ]
            if unresolved_for_level:
                reason = "matching_stage_less_attempt_is_ambiguous"
            elif actual in other_verified_stages:
                reason = "no_matching_verified_pass_in_stage"
            elif other_verified_stages:
                reason = "verified_pass_exists_only_in_other_stages"
            elif any(row.get("status") == "started" for row in level_attempts):
                reason = "attempt_pending_finalization"
            elif level_attempts:
                reason = "attempts_exist_but_none_passed"
            else:
                reason = "no_verified_attempt_record"
            stored_completion_conflicts.append({
                "subject": subject,
                "championship": actual,
                "level": level,
                "reason": reason,
                "attempt_records": len(level_attempts),
                "verified_pass_stages": other_verified_stages,
                "preserve_verified_history": True,
            })
            migration_counts["unverified_completed_level_conflicts"] += 1

    champion_statuses = Counter(row.get("status", "missing") for row in champion_sessions)
    champion_records = [
        {
            "subject": _subject_id(row.get("user_id")),
            "championship": _as_int(row.get("champion_stage_snapshot")),
            "global_contest": _as_int(row.get("global_contest_number")),
            "status": row.get("status"),
            "passed": row.get("passed"),
        }
        for row in champion_sessions
    ]
    skip_groups = defaultdict(set)
    for row in skips:
        skip_groups[(row.get("user_id"), _as_int(row.get("champion_stage")))].add(
            _as_int(row.get("level"))
        )
    skip_records = [
        {
            "subject": _subject_id(user_id),
            "championship": stage,
            "levels": sorted(level for level in levels if level is not None),
            "new_records_created": False,
        }
        for (user_id, stage), levels in skip_groups.items()
    ]
    unlock_records = [
        {
            "subject": _subject_id(row.get("user_id")),
            "championship": _as_int(row.get("champion_stage")),
            "level": _as_int(row.get("level")),
            "status": row.get("status"),
            "token_cost": _as_int(row.get("token_cost")),
        }
        for row in unlock_reservations
    ]
    award_records = [
        {
            "subject": _subject_id(row.get("user_id")),
            "global_contest": _as_int(row.get("global_contest_number")),
            "championship": _as_int(row.get("champion_stage_snapshot")),
            "rank": _as_int(row.get("rank")),
            "status": row.get("status"),
            "wallet_credited": bool(row.get("wallet_credited")),
            "amount_or_wallet_data_changed": False,
        }
        for row in winner_awards
    ]
    entry_records = [
        {
            "subject": _subject_id(row.get("user_id")),
            "global_contest": _as_int(row.get("global_contest_number")),
            "championship_snapshot": _as_int(row.get("champion_stage_snapshot")),
            "status": row.get("status"),
            "entry_changed": False,
        }
        for row in entries
    ]
    order_rows = await _rows(
        db.orders,
        {},
        {"_id": 0, "order_id": 1, "user_id": 1, "status": 1, "created_at": 1, "items.contest_id": 1},
    )
    ticket_rows = await _rows(
        db.tickets,
        {},
        {
            "_id": 0, "ticket_id": 1, "user_id": 1, "contest_id": 1,
            "order_id": 1, "ticket_number": 1, "created_at": 1,
        },
    )
    next_boundary = _next_gc_boundary_window(
        setting,
        sequence,
        active_gc,
    )

    def count_near_boundary(rows):
        if next_boundary is None:
            return None
        return sum(
            1
            for row in rows
            if isinstance(row.get("created_at"), type(next_boundary["start"]))
            and next_boundary["start"] <= ensure_utc(row["created_at"]) < next_boundary["end"]
        )

    return {
        "season_id": WORLD_SEASON_ID,
        "active_global_contest": active_gc,
        "configured_contest_count": len(sequence),
        "accounts_total": len(users),
        "users_total": len(player_user_ids),
        "progress_records": len(progress_rows),
        "duplicate_progress_users": len(duplicate_progress),
        "duplicate_progress_records": sum(row["records"] for row in duplicate_progress),
        "duplicate_progress_keys": [
            {
                "season_id": row["_id"]["season_id"],
                "subject": _subject_id(row["_id"]["user_id"]),
                "records": row["records"],
            }
            for row in duplicate_progress
        ],
        "users_missing_stored_cohort": users_missing_stored_cohort,
        "users_missing_creation_time_or_season_anchor": users_missing_creation_time,
        "derived_cohort_counts": dict(sorted(cohort_counts.items())),
        "stored_stage_counts": dict(sorted(stage_counts.items())),
        "migration_preview": dict(migration_counts),
        "before_after_assignments": user_assignments,
        "assignment_conflicts": assignment_conflicts,
        "stored_completion_conflicts": stored_completion_conflicts,
        "attempts_missing_championship_stage": {
            "total": unscoped_resolved + unscoped_unresolved,
            "uniquely_recoverable": unscoped_resolved,
            "unresolved_no_guess": unscoped_unresolved,
            "details": unscoped_attempt_details,
        },
        "incomplete_historical_championships": len(incomplete_history),
        "pending_level_attempts": pending_levels,
        "champion_session_statuses": dict(champion_statuses),
        "champion_results": champion_records,
        "pending_champion_results": [
            row for row in champion_records if row["status"] == "begun"
        ],
        "unbegun_champion_sessions": [
            row for row in champion_records if row["status"] == "created"
        ],
        "historical_skips": skip_records,
        "free_world_entries_to_preserve": len(entries),
        "free_world_entry_records": entry_records,
        "early_unlock_reservations_to_preserve": len(unlock_reservations),
        "early_unlock_purchases": unlock_records,
        "winner_awards_to_preserve": len(winner_awards),
        "winner_award_records": award_records,
        "world_game_session_statuses": dict(Counter(row.get("status", "missing") for row in game_sessions)),
        "active_world_game_sessions": [
            {
                "subject": _subject_id(row.get("user_id")),
                "championship": _as_int(row.get("champion_stage")),
                "level": _as_int(row.get("level")),
                "status": row.get("status"),
            }
            for row in game_sessions if row.get("status") in {"created", "begun"}
        ],
        "paid_orders_to_preserve": len(order_rows),
        "paid_order_statuses": dict(Counter(row.get("status", "missing") for row in order_rows)),
        "paid_order_records": [
            {
                "order_ref": _subject_id(row.get("order_id")),
                "subject": _subject_id(row.get("user_id")),
                "status": row.get("status"),
                "created_at": row.get("created_at").isoformat() if isinstance(row.get("created_at"), datetime) else None,
                "contest_ids": sorted({item.get("contest_id") for item in row.get("items", []) if item.get("contest_id")}),
            }
            for row in order_rows
        ],
        "paid_tickets_to_preserve": len(ticket_rows),
        "paid_ticket_statuses": dict(Counter(row.get("status", "missing") for row in ticket_rows)),
        "paid_ticket_records": [
            {
                "ticket_ref": _subject_id(row.get("ticket_id")),
                "subject": _subject_id(row.get("user_id")),
                "contest_id": row.get("contest_id"),
                "order_ref": _subject_id(row.get("order_id")),
                "created_at": row.get("created_at").isoformat() if isinstance(row.get("created_at"), datetime) else None,
            }
            for row in ticket_rows
        ],
        "next_gc_boundary_utc": next_boundary["boundary"].isoformat() if next_boundary else None,
        "paid_orders_within_24h_of_next_gc_boundary": count_near_boundary(order_rows),
        "paid_tickets_within_24h_of_next_gc_boundary": count_near_boundary(ticket_rows),
        "configured_global_contests": [
            {"global_contest": contest, "schedule_slot": index + 1}
            for index, contest in enumerate(sequence)
        ],
        "season_1_limit": 100,
        "writes_performed": False,
        "sequence_conflicts": cohort_errors,
    }


async def main():
    parser = argparse.ArgumentParser(description="Read-only World progression migration preview")
    parser.add_argument("--confirm-read-only", action="store_true")
    parser.add_argument("--expected-environment", required=True)
    parser.add_argument("--expected-database", required=True)
    args = parser.parse_args()

    environment = (
        os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("NODE_ENV")
        or "not-set"
    )
    database = os.getenv("DB_NAME") or "gamezoo"
    mongo_url = os.getenv("MONGO_URL", "")
    host = urlparse(mongo_url).hostname
    host_class = (
        "localhost"
        if host in {"localhost", "127.0.0.1", "::1"}
        else "remote"
        if host
        else "unknown"
    )

    if not args.confirm_read_only:
        parser.error("--confirm-read-only is required; this script never writes data")
    if environment != args.expected_environment:
        parser.error(
            f"Environment confirmation mismatch: configured {environment!r}, "
            f"expected {args.expected_environment!r}"
        )
    if database != args.expected_database:
        parser.error(
            f"Database confirmation mismatch: configured {database!r}, "
            f"expected {args.expected_database!r}"
        )

    print(json.dumps({
        "inspection_mode": "read-only",
        "environment": environment,
        "database": database,
        "host_class": host_class,
    }, sort_keys=True))

    from deps import get_client, get_db

    db = get_db()
    try:
        result = await preview(db)
        print(json.dumps(result, indent=2, sort_keys=True, default=str))
    finally:
        get_client().close()


if __name__ == "__main__":
    asyncio.run(main())