"""Authoritative activity sources shared by acquisition reports and the admin dashboard.

Nothing here writes to gameplay, wallet or payment data.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

from services.analytics_common import REPORT_TZ, STAFF_ROLES

# (collection, timestamp field, extra match) for a game START / COMPLETION by a user.
GAME_START_SOURCES = [
    ('world_level_attempts', 'created_at', {}, 'free_world'),
    ('world_champion_sessions', 'begun_at', {}, 'free_world'),
    ('special_challenge_attempts', 'started_at', {}, 'challenge'),
    ('acquisition_events', 'created_at', {'name': 'paid_game_start'}, 'paid'),
]
GAME_ACTIVITY_SOURCES = [*GAME_START_SOURCES, ('game_scores', 'created_at', {}, 'paid')]
GAME_COMPLETE_SOURCES = [
    ('world_level_attempts', 'completed_at', {}, 'free_world'),
    ('world_champion_sessions', 'submitted_at', {}, 'free_world'),
    ('special_challenge_attempts', 'completed_at', {}, 'challenge'),
    ('game_scores', 'created_at', {}, 'paid'),
]
FREE_ENTRY_SOURCE = ('world_contest_entries', 'entered_at', {})
PAID_ENTRY_SOURCE = ('orders', 'created_at', {'status': 'paid'})

CHUNK = 5000


def _chunks(items: list, size: int = CHUNK):
    for i in range(0, len(items), size):
        yield items[i:i + size]


async def staff_user_ids(db) -> list:
    rows = await db.users.find({'role': {'$in': list(STAFF_ROLES)}}, {'_id': 0, 'user_id': 1}).to_list(5000)
    return [r['user_id'] for r in rows]


async def record_staff_role_transition(db, user_id: str, old_role: str, new_role: str, at=None,
                                       transition_id: str | None = None) -> None:
    """Record role intervals so a later promotion does not erase earlier public traffic."""
    old_staff = old_role in STAFF_ROLES
    new_staff = new_role in STAFF_ROLES
    if old_staff == new_staff:
        return
    at = at or datetime.now(timezone.utc)
    if new_staff:
        record = {
            'user_id': user_id, 'role': new_role, 'started_at': at, 'ended_at': None,
        }
        if transition_id:
            record['transition_id'] = transition_id
            await db.staff_role_history.update_one(
                {'transition_id': transition_id}, {'$setOnInsert': record}, upsert=True)
        else:
            await db.staff_role_history.insert_one(record)
    else:
        await db.staff_role_history.update_one(
            {'user_id': user_id, 'ended_at': None}, {'$set': {'ended_at': at, 'end_role': new_role}},
        )


async def excluded_user_ids(db, include_test: bool = False) -> list:
    """Staff (server-verified role) plus flagged test accounts."""
    query = {'role': {'$in': list(STAFF_ROLES)}}
    if not include_test:
        query = {'$or': [query, {'is_test': True}, {'is_test_account': True}]}
    rows = await db.users.find(query, {'_id': 0, 'user_id': 1}).to_list(20000)
    return [r['user_id'] for r in rows]


async def public_traffic_filter(db, timestamp_field: str = 'created_at') -> dict:
    """Mongo filter for acquisition rows that count as public traffic.

    New rows carry is_staff=False captured when they were written, so a user who is
    promoted later keeps their earlier legitimate visits. Legacy rows have no flag, so
    they are excluded only when tied to a user who is staff today (best effort).
    """
    staff_ids = await staff_user_ids(db)
    test_ids = await excluded_user_ids(db, include_test=False)
    test_ids = [uid for uid in test_ids if uid not in set(staff_ids)]
    intervals: dict = {}
    async for row in db.staff_role_history.find(
        {'started_at': {'$exists': True}}, {'_id': 0, 'user_id': 1, 'started_at': 1, 'ended_at': 1},
    ).sort([('user_id', 1), ('started_at', 1)]):
        intervals.setdefault(row['user_id'], []).append((row['started_at'], row.get('ended_at')))

    # Legacy traffic lacks role-at-view-time. For users with recorded role intervals,
    # retain their pre-promotion and post-demotion activity; exclude only staff intervals.
    legacy_allow = []
    for uid, spans in intervals.items():
        spans = sorted(spans, key=lambda span: span[0])
        for index, (started, ended) in enumerate(spans):
            if index == 0:
                legacy_allow.append({'is_staff': {'$exists': False}, 'user_id': uid,
                                     timestamp_field: {'$lt': started}})
            if ended is not None:
                next_start = spans[index + 1][0] if index + 1 < len(spans) else None
                legacy_allow.append({
                    'is_staff': {'$exists': False}, 'user_id': uid,
                    timestamp_field: {'$gte': ended, **({'$lt': next_start} if next_start else {})},
                })
    return {
        '$and': [
            {'is_test': {'$ne': True}, 'user_id': {'$nin': test_ids}},
            {'$or': [
                {'is_staff': False},
                {'is_staff': {'$exists': False}, 'user_id': {'$nin': staff_ids + list(intervals)}},
                *legacy_allow,
            ]},
        ],
    }


async def users_registered_between(db, start: datetime, end: datetime, include_test: bool = False) -> list:
    """Non-staff users created in [start, end)."""
    excluded = await excluded_user_ids(db, include_test)
    rows = await db.users.find(
        {'created_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}},
        {'_id': 0, 'user_id': 1, 'created_at': 1, 'phone_verified': 1, 'phone_verified_at': 1},
    ).to_list(50000)
    return rows


async def user_game_activity(db, user_ids: Iterable[str]) -> dict:
    """{user_id: {'first_start', 'start_days', 'completed', 'free_entry', 'paid_entry', 'modes'}}."""
    ids = list(user_ids)
    out = {u: {'first_start': None, 'start_days': set(), 'completed': False,
               'free_entry': False, 'paid_entry': False, 'modes': set()} for u in ids}
    for chunk in _chunks(ids):
        for coll, field, extra, mode in GAME_START_SOURCES:
            pipeline = [
                {'$match': {'user_id': {'$in': chunk}, field: {'$ne': None}, **extra}},
                {'$group': {'_id': '$user_id', 'first': {'$min': f'${field}'},
                            'days': {'$addToSet': {'$dateToString': {'format': '%Y-%m-%d', 'date': f'${field}',
                                                                      'timezone': REPORT_TZ.key}}}}},
            ]
            async for row in db[coll].aggregate(pipeline):
                rec = out.get(row['_id'])
                if rec is None:
                    continue
                if rec['first_start'] is None or row['first'] < rec['first_start']:
                    rec['first_start'] = row['first']
                rec['start_days'].update(row['days'])
                rec['modes'].add(mode)
        for coll, field, extra, _mode in GAME_COMPLETE_SOURCES:
            async for row in db[coll].aggregate([
                {'$match': {'user_id': {'$in': chunk}, field: {'$ne': None}, **extra}},
                {'$group': {'_id': '$user_id'}},
            ]):
                if row['_id'] in out:
                    out[row['_id']]['completed'] = True
        for (coll, field, extra), key in ((FREE_ENTRY_SOURCE, 'free_entry'), (PAID_ENTRY_SOURCE, 'paid_entry')):
            async for row in db[coll].aggregate([
                {'$match': {'user_id': {'$in': chunk}, field: {'$ne': None}, **extra}},
                {'$group': {'_id': '$user_id'}},
            ]):
                if row['_id'] in out:
                    out[row['_id']][key] = True
    return out


async def distinct_users_with_events(db, sources, start: datetime, end: datetime,
                                     exclude_ids: Optional[list] = None, extra_by_coll: Optional[dict] = None) -> set:
    """Distinct non-excluded users with at least one event in [start, end) across sources."""
    users: set = set()
    for src in sources:
        coll, field, extra = src[0], src[1], src[2]
        match = {field: {'$gte': start, '$lt': end}, **extra}
        if exclude_ids:
            match['user_id'] = {'$nin': exclude_ids}
        async for row in db[coll].aggregate([{'$match': match}, {'$group': {'_id': '$user_id'}}]):
            if row['_id']:
                users.add(row['_id'])
    return users
