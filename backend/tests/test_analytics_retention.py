from __future__ import annotations

import asyncio
import os
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from deps import _mongo_url, _sanitize_db_name
from services.analytics_retention import cleanup_approved_details, rollup_day


@pytest.fixture(scope='module')
def safe_db():
    name = os.environ.get('DB_NAME', '')
    if not name.startswith('test_'):
        pytest.skip('Integration test requires an isolated test_* database')
    return {'url': _mongo_url, 'name': _sanitize_db_name(name)}


def run_db(target, fn):
    async def run():
        client = AsyncIOMotorClient(target['url'])
        try:
            return await fn(client[target['name']])
        finally:
            client.close()
    return asyncio.run(run())


def test_daily_rollup_is_idempotent_and_preserves_world_and_source_counts(safe_db):
    tag = uuid.uuid4().hex
    uid = f'analytics_rollup_{tag}'
    day = datetime.now(ZoneInfo('Europe/London')).date() - timedelta(days=4)
    at = datetime.combine(day, time(12), tzinfo=ZoneInfo('Europe/London')).astimezone(timezone.utc)

    async def run(db):
        await db.users.insert_one({'user_id': uid, 'email': f'{tag}@example.test', 'role': 'user', 'is_test': False})
        await db.acquisition_visits.insert_one({
            'visit_id': tag, 'visitor_id': f'visitor_{tag}', 'user_id': uid, 'source': 'instagram',
            'landing_path': '/free-world', 'created_at': at, 'is_staff': False, 'is_test': False,
        })
        await db.acquisition_page_views.insert_one({
            'view_id': tag, 'visitor_id': f'visitor_{tag}', 'user_id': uid, 'session_id': f'session_{tag}',
            'page_key': 'free_world', 'created_at': at, 'is_staff': False, 'is_test': False,
        })
        await db.acquisition_sessions.insert_one({
            'session_id': f'session_{tag}', 'visitor_id': f'visitor_{tag}', 'last_seen_at': at,
            'is_staff': False, 'is_test': False,
        })
        await db.acquisition_events.insert_one({
            'dedupe': tag, 'name': 'paid_game_start', 'visitor_id': f'visitor_{tag}',
            'user_id': uid, 'created_at': at, 'is_staff': False, 'is_test': False,
        })
        await db.world_level_attempts.insert_one({
            'attempt_id': f'level_{tag}', 'session_id': f'level_session_{tag}',
            'user_id': uid, 'created_at': at, 'completed_at': at,
        })
        await db.special_challenge_attempts.insert_one({
            'attempt_id': f'challenge_{tag}', 'user_id': uid, 'started_at': at, 'completed_at': at,
        })
        await db.world_contest_entries.insert_one({'user_id': uid, 'entered_at': at})
        await db.orders.insert_one({'order_id': f'order_{tag}', 'user_id': uid, 'status': 'paid', 'created_at': at})
        await db.wallet_tx.insert_one({
            'tx_id': tag, 'user_id': uid, 'kind': 'spend', 'amount': -5,
            'purchased_amount': -2, 'bonus_amount': -1, 'withdrawable_amount': -1,
            'winning_bonus_amount': -1, 'created_at': at,
        })

        try:
            first = await rollup_day(db, day)
            second = await rollup_day(db, day)
            assert first['acquisition']['visits'] >= 1
            assert first['acquisition']['page_views'] >= 1
            assert first['acquisition']['sessions'] >= 1
            assert first['acquisition']['sources']['instagram'] >= 1
            assert first['acquisition']['events']['paid_game_start'] >= 1
            assert first['world_activity']['free_world']['starts'] >= 1
            assert first['world_activity']['free_world']['completions'] >= 1
            assert first['world_activity']['free_world']['entries'] >= 1
            assert first['world_activity']['paid_world']['entries'] >= 1
            assert first['world_activity']['impossible_challenges']['unique_players'] >= 1
            assert first['token_spending']['total'] >= 5
            assert second['_id'] == first['_id']
            assert await db.analytics_daily_rollups.count_documents({'_id': day.isoformat()}) == 1
        finally:
            await db.users.delete_one({'user_id': uid})
            await db.acquisition_visits.delete_many({'visit_id': tag})
            await db.acquisition_page_views.delete_many({'view_id': tag})
            await db.acquisition_sessions.delete_many({'session_id': f'session_{tag}'})
            await db.acquisition_events.delete_many({'dedupe': tag})
            await db.world_level_attempts.delete_many({'attempt_id': f'level_{tag}'})
            await db.special_challenge_attempts.delete_many({'attempt_id': f'challenge_{tag}'})
            await db.world_contest_entries.delete_many({'user_id': uid})
            await db.orders.delete_many({'order_id': f'order_{tag}'})
            await db.wallet_tx.delete_many({'tx_id': tag})

    run_db(safe_db, run)


def test_analytics_cleanup_is_off_by_default_and_blocks_missing_rollups(safe_db, monkeypatch):
    tag = uuid.uuid4().hex
    day = date.today() - timedelta(days=45)
    at = datetime.combine(day, time(12), tzinfo=timezone.utc)

    async def run(db):
        await db.acquisition_events.insert_one({'dedupe': tag, 'name': 'page_view', 'created_at': at})
        monkeypatch.delenv('ANALYTICS_EVENT_CLEANUP_ENABLED', raising=False)
        monkeypatch.delenv('ANALYTICS_RETENTION_APPROVED', raising=False)
        disabled = await cleanup_approved_details(db, now=datetime.now(timezone.utc))
        assert disabled['enabled'] is False
        assert await db.acquisition_events.count_documents({'dedupe': tag}) == 1

        monkeypatch.setenv('ANALYTICS_EVENT_CLEANUP_ENABLED', 'true')
        monkeypatch.setenv('ANALYTICS_RETENTION_APPROVED', 'true')
        blocked_reports = await cleanup_approved_details(db, now=datetime.now(timezone.utc))
        assert blocked_reports.get('blocked') == 'reports_not_using_rollups'
        assert await db.acquisition_events.count_documents({'dedupe': tag}) == 1

        monkeypatch.setenv('ANALYTICS_ROLLUP_READS_ENABLED', 'true')
        unacknowledged = await cleanup_approved_details(db, now=datetime.now(timezone.utc))
        assert unacknowledged.get('blocked') == 'report_migration_not_acknowledged'
        assert await db.acquisition_events.count_documents({'dedupe': tag}) == 1

        await db.analytics_retention_state.insert_one({'_id': 'rollup_reports', 'enabled': True})
        blocked = await cleanup_approved_details(db, now=datetime.now(timezone.utc))
        assert blocked.get('blocked') == 'missing_daily_rollup'
        assert await db.acquisition_events.count_documents({'dedupe': tag}) == 1
        await db.analytics_retention_state.delete_one({'_id': 'rollup_reports'})
        await db.acquisition_events.delete_one({'dedupe': tag})

    run_db(safe_db, run)
