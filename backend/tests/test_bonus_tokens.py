"""Bonus-token feature tests — grant on top-up ≥10, expiry sweep, admin stats aggregation.

Follows the sync-wrapper pattern used elsewhere in this suite: a plain
`def test_X()` that calls `asyncio.run(_run())`. Avoids the pytest-asyncio
config gymnastics.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Load backend .env so MONGO_URL/DB_NAME are available under pytest (matches
# the pattern used across other test files in this suite).
try:
    with open(os.path.join(os.path.dirname(__file__), '..', '.env')) as _f:
        for _line in _f:
            if '=' in _line and not _line.strip().startswith('#'):
                k, v = _line.strip().split('=', 1)
                os.environ.setdefault(k, v.strip().strip('"'))
except Exception:
    pass

from motor.motor_asyncio import AsyncIOMotorClient

from bonus import (
    BONUS_AMOUNT,
    BONUS_EXPIRY_DAYS,
    BONUS_MIN_TOPUP,
    get_bonus_stats,
    maybe_grant_bonus,
    sweep_expired_bonuses,
)


def _db():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    return client, client[os.environ['DB_NAME']]


def test_no_grant_below_threshold():
    async def _run():
        client, db = _db()
        try:
            await db.bonus_grants.delete_many({'user_id': 'test_bonus_u1'})
            r = await maybe_grant_bonus(db, 'test_bonus_u1', BONUS_MIN_TOPUP - 1)
            assert r is None
            count = await db.bonus_grants.count_documents({'user_id': 'test_bonus_u1'})
            assert count == 0
        finally:
            await db.bonus_grants.delete_many({'user_id': 'test_bonus_u1'})
            client.close()
    asyncio.run(_run())


def test_grant_at_threshold():
    async def _run():
        client, db = _db()
        try:
            await db.bonus_grants.delete_many({'user_id': 'test_bonus_u2'})
            r = await maybe_grant_bonus(db, 'test_bonus_u2', BONUS_MIN_TOPUP)
            assert r is not None
            assert r['amount'] == BONUS_AMOUNT
            assert r['status'] == 'active'
            delta = r['expires_at'] - r['granted_at']
            assert abs(delta - timedelta(days=BONUS_EXPIRY_DAYS)) < timedelta(seconds=5)
            # Second top-up should NOT grant again — one-time per user rule.
            r2 = await maybe_grant_bonus(db, 'test_bonus_u2', BONUS_MIN_TOPUP * 5)
            assert r2 is None
            count = await db.bonus_grants.count_documents({'user_id': 'test_bonus_u2'})
            assert count == 1, f'expected exactly 1 grant, got {count}'
        finally:
            await db.bonus_grants.delete_many({'user_id': 'test_bonus_u2'})
            client.close()
    asyncio.run(_run())


def test_sweep_flips_expired():
    async def _run():
        client, db = _db()
        try:
            await db.bonus_grants.delete_many({'grant_id': 'bg_expired_test'})
            now = datetime.now(timezone.utc)
            await db.bonus_grants.insert_one({
                'grant_id': 'bg_expired_test',
                'user_id': 'test_bonus_u3',
                'amount': BONUS_AMOUNT,
                'granted_at': now - timedelta(days=BONUS_EXPIRY_DAYS + 1),
                'expires_at': now - timedelta(hours=1),
                'status': 'active',
                'ref_session_id': None,
                'source': 'topup_bonus',
            })
            flipped = await sweep_expired_bonuses(db)
            assert flipped >= 1
            doc = await db.bonus_grants.find_one({'grant_id': 'bg_expired_test'})
            assert doc['status'] == 'expired'
            assert 'expired_at' in doc
        finally:
            await db.bonus_grants.delete_many({'grant_id': 'bg_expired_test'})
            client.close()
    asyncio.run(_run())


def test_admin_stats_shape():
    async def _run():
        client, db = _db()
        try:
            await db.bonus_grants.delete_many({'user_id': {'$in': ['test_bonus_u4', 'test_bonus_u5']}})
            await maybe_grant_bonus(db, 'test_bonus_u4', BONUS_MIN_TOPUP)
            now = datetime.now(timezone.utc)
            await db.bonus_grants.insert_one({
                'grant_id': 'bg_stats_expired',
                'user_id': 'test_bonus_u5',
                'amount': BONUS_AMOUNT,
                'granted_at': now - timedelta(days=BONUS_EXPIRY_DAYS + 2),
                'expires_at': now - timedelta(days=1),
                'status': 'active',
                'ref_session_id': None,
                'source': 'topup_bonus',
            })
            stats = await get_bonus_stats(db)
            assert stats['config']['min_topup_tokens'] == BONUS_MIN_TOPUP
            assert stats['config']['bonus_amount_tokens'] == BONUS_AMOUNT
            assert stats['config']['expiry_days'] == BONUS_EXPIRY_DAYS
            assert stats['active_grants'] >= 1
            assert stats['expired_grants'] >= 1
            assert stats['active_tokens'] >= BONUS_AMOUNT
            assert stats['expired_tokens'] >= BONUS_AMOUNT
        finally:
            await db.bonus_grants.delete_many({'user_id': {'$in': ['test_bonus_u4', 'test_bonus_u5']}})
            client.close()
    asyncio.run(_run())
