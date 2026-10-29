"""Idempotent daily analytics rollups and approval-gated raw-detail cleanup."""
from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta, timezone

from services.analytics_common import REPORT_TZ
from services.analytics_events import (
    GAME_COMPLETE_SOURCES, GAME_START_SOURCES, excluded_user_ids, public_traffic_filter,
)

DETAIL_COLLECTIONS = {
    'acquisition_visits': ('created_at',),
    'acquisition_page_views': ('created_at',),
    'acquisition_events': ('created_at',),
    'acquisition_sessions': ('last_seen_at',),
}


def _bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=REPORT_TZ).astimezone(timezone.utc)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=REPORT_TZ).astimezone(timezone.utc)
    return start, end


def _day_key(value: datetime) -> str:
    return value.astimezone(REPORT_TZ).date().isoformat()


def _match(base: dict, field: str, start: datetime, end: datetime) -> dict:
    return {'$and': [base, {field: {'$gte': start, '$lt': end}}]}


async def _count(db, collection: str, match: dict) -> int:
    return await db[collection].count_documents(match)


async def _distinct(db, collection: str, match: dict, field: str) -> set:
    values = set()
    async for row in db[collection].aggregate([
        {'$match': match}, {'$group': {'_id': f'${field}'}},
    ]):
        if row.get('_id'):
            values.add(row['_id'])
    return values


async def _buckets(db, collection: str, match: dict, field: str, limit: int = 100):
    rows = await db[collection].aggregate([
        {'$match': match}, {'$group': {'_id': f'${field}', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}}, {'$limit': limit},
    ]).to_list(limit)
    return {str(row.get('_id') or 'unknown'): int(row['count']) for row in rows}


async def rollup_day(db, day: date) -> dict:
    """Recompute one UK day from source records and atomically replace its summary."""
    start, end = _bounds(day)
    public_visits = _match(await public_traffic_filter(db, 'created_at'), 'created_at', start, end)
    public_views = _match(await public_traffic_filter(db, 'created_at'), 'created_at', start, end)
    public_events = _match(await public_traffic_filter(db, 'created_at'), 'created_at', start, end)
    public_sessions = _match(await public_traffic_filter(db, 'last_seen_at'), 'last_seen_at', start, end)
    excluded = await excluded_user_ids(db)

    visitors = await _distinct(db, 'acquisition_visits', public_visits, 'visitor_id')
    view_visitors = await _distinct(db, 'acquisition_page_views', public_views, 'visitor_id')
    session_ids = await _distinct(db, 'acquisition_sessions', public_sessions, 'session_id')
    user_ids = await _distinct(db, 'acquisition_page_views', public_views, 'user_id')

    world = {
        'free_world': {'starts': 0, 'completions': 0, 'entries': 0, 'players': set()},
        'paid_world': {'starts': 0, 'completions': 0, 'entries': 0, 'players': set()},
        'impossible_challenges': {'starts': 0, 'completions': 0, 'entries': 0, 'players': set()},
    }
    for collection, field, extra, category in GAME_START_SOURCES:
        match = _match({'user_id': {'$nin': excluded}, **extra}, field, start, end)
        world_key = {'free_world': 'free_world', 'paid': 'paid_world', 'challenge': 'impossible_challenges'}[category]
        world[world_key]['starts'] += await _count(db, collection, match)
        world[world_key]['players'].update(await _distinct(db, collection, match, 'user_id'))
    for collection, field, extra, category in GAME_COMPLETE_SOURCES:
        match = _match({'user_id': {'$nin': excluded}, **extra}, field, start, end)
        world_key = {'free_world': 'free_world', 'paid': 'paid_world', 'challenge': 'impossible_challenges'}[category]
        world[world_key]['completions'] += await _count(db, collection, match)
    free_entry_match = _match({'user_id': {'$nin': excluded}}, 'entered_at', start, end)
    world['free_world']['entries'] = await _count(db, 'world_contest_entries', free_entry_match)
    paid_order_match = _match({'user_id': {'$nin': excluded}, 'status': 'paid'}, 'created_at', start, end)
    world['paid_world']['entries'] = await _count(db, 'orders', paid_order_match)

    spend_match = _match({'user_id': {'$nin': excluded}, 'kind': 'spend'}, 'created_at', start, end)
    spend_rows = await db.wallet_tx.aggregate([
        {'$match': spend_match},
        {'$group': {
            '_id': None, 'total': {'$sum': '$amount'},
            'topup': {'$sum': {'$ifNull': ['$purchased_amount', 0]}},
            'bonus': {'$sum': {'$ifNull': ['$bonus_amount', 0]}},
            'winning': {'$sum': {'$ifNull': ['$withdrawable_amount', 0]}},
            'winning_bonus': {'$sum': {'$ifNull': ['$winning_bonus_amount', 0]}},
            'unclassified': {'$sum': {'$cond': [
                {'$eq': [{'$type': '$purchased_amount'}, 'missing']}, 1, 0,
            ]}},
        }},
    ]).to_list(1)
    spend = spend_rows[0] if spend_rows else {}

    doc = {
        '_id': day.isoformat(), 'day': day.isoformat(), 'timezone': REPORT_TZ.key,
        'generated_at': datetime.now(timezone.utc),
        'acquisition': {
            'visits': await _count(db, 'acquisition_visits', public_visits),
            'unique_visitors': len(visitors),
            'page_views': await _count(db, 'acquisition_page_views', public_views),
            'unique_page_view_visitors': len(view_visitors),
            'sessions': len(session_ids), 'registered_page_view_users': len(user_ids),
            'sources': await _buckets(db, 'acquisition_visits', public_visits, 'source'),
            'landing_pages': await _buckets(db, 'acquisition_visits', public_visits, 'landing_path'),
            'pages': await _buckets(db, 'acquisition_page_views', public_views, 'page_key'),
            'events': await _buckets(db, 'acquisition_events', public_events, 'name'),
        },
        'world_activity': {
            key: {**{name: item for name, item in value.items() if name != 'players'},
                  'unique_players': len(value['players'])}
            for key, value in world.items()
        },
        'token_spending': {
            'total': round(abs(float(spend.get('total') or 0)), 2),
            'topup': round(abs(float(spend.get('topup') or 0)), 2),
            'bonus': round(abs(float(spend.get('bonus') or 0)), 2),
            'winning': round(abs(float(spend.get('winning') or 0)), 2),
            'winning_bonus': round(abs(float(spend.get('winning_bonus') or 0)), 2),
            'unclassified_transactions': int(spend.get('unclassified') or 0),
        },
    }
    await db.analytics_daily_rollups.replace_one({'_id': doc['_id']}, doc, upsert=True)
    return doc


async def _earliest_detail_day(db) -> date | None:
    earliest = None
    for collection, (field,) in DETAIL_COLLECTIONS.items():
        row = await db[collection].find_one({field: {'$type': 'date'}}, {'_id': 0, field: 1}, sort=[(field, 1)])
        value = row.get(field) if row else None
        if isinstance(value, datetime):
            candidate = value.astimezone(REPORT_TZ).date() if value.tzinfo else value.replace(tzinfo=timezone.utc).astimezone(REPORT_TZ).date()
            earliest = min(earliest, candidate) if earliest else candidate
    return earliest


async def rollup_missing_days(db, now: datetime | None = None, limit: int = 3) -> dict:
    """Backfill sequential days with a persisted cursor and bounded work per tick."""
    now = now or datetime.now(timezone.utc)
    yesterday = now.astimezone(REPORT_TZ).date() - timedelta(days=1)
    earliest = await _earliest_detail_day(db)
    if earliest is None:
        return {'rolled_up': 0, 'through': None}
    state = await db.analytics_retention_state.find_one({'_id': 'daily_rollup'}, {'_id': 0, 'next_day': 1}) or {}
    try:
        day = date.fromisoformat(state.get('next_day') or '')
    except ValueError:
        day = earliest
    day = max(day, earliest)
    if day > yesterday:
        day = max(earliest, yesterday - timedelta(days=1))
    rolled_up = scanned = 0
    through = None
    while day <= yesterday and scanned < max(1, int(limit)):
        key = day.isoformat()
        if day >= yesterday - timedelta(days=2) or not await db.analytics_daily_rollups.find_one({'_id': key}, {'_id': 1}):
            await rollup_day(db, day)
            rolled_up += 1
        through = key
        day += timedelta(days=1)
        scanned += 1
    await db.analytics_retention_state.update_one(
        {'_id': 'daily_rollup'}, {'$set': {'next_day': day.isoformat(), 'updated_at': now}}, upsert=True,
    )
    return {'rolled_up': rolled_up, 'scanned': scanned, 'through': through}


async def cleanup_approved_details(db, now: datetime | None = None) -> dict:
    """Delete only rollup-covered acquisition detail after two explicit approval flags."""
    if os.getenv('ANALYTICS_ROLLUP_READS_ENABLED') != 'true':
        return {'enabled': False, 'blocked': 'reports_not_using_rollups', 'deleted': {}}
    report_state = await db.analytics_retention_state.find_one(
        {'_id': 'rollup_reports', 'enabled': True}, {'_id': 1},
    )
    if not report_state:
        return {'enabled': False, 'blocked': 'report_migration_not_acknowledged', 'deleted': {}}
    if os.getenv('ANALYTICS_EVENT_CLEANUP_ENABLED') != 'true' or os.getenv('ANALYTICS_RETENTION_APPROVED') != 'true':
        return {'enabled': False, 'deleted': {}}
    now = now or datetime.now(timezone.utc)
    cutoff_day = now.astimezone(REPORT_TZ).date() - timedelta(days=30)
    earliest = await _earliest_detail_day(db)
    if earliest is None or earliest >= cutoff_day:
        return {'enabled': True, 'deleted': {}}
    day = earliest
    while day < cutoff_day:
        if not await db.analytics_daily_rollups.find_one({'_id': day.isoformat()}, {'_id': 1}):
            return {'enabled': True, 'blocked': 'missing_daily_rollup', 'deleted': {}}
        day += timedelta(days=1)
    cutoff, _ = _bounds(cutoff_day)
    deleted = {}
    for collection, (field,) in DETAIL_COLLECTIONS.items():
        result = await db[collection].delete_many({field: {'$lt': cutoff}})
        deleted[collection] = result.deleted_count
    return {'enabled': True, 'cutoff': cutoff.isoformat(), 'deleted': deleted}
