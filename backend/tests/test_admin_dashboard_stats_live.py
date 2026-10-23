"""Admin user/wallet reporting checks against throw-away records in DB_NAME containing 'test'."""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from deps import _mongo_url, _sanitize_db_name
from auth import create_jwt
from services.analytics_common import REPORT_TZ, utcnow

BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f'{BASE}/api'


@pytest.fixture(scope='module')
def db_name():
    raw = os.environ.get('DB_NAME', '')
    if 'test' not in raw.lower():
        pytest.skip('Integration test requires DB_NAME containing "test"')
    return _sanitize_db_name(raw)


def seed(db_name, *, role='user', extra=None):
    user_id = 'dash_itest_' + uuid.uuid4().hex[:10]
    now = utcnow()
    document = {
        'user_id': user_id, 'email': f'{user_id}@example.test', 'name': 'Dashboard test',
        'role': role, 'method': 'email', 'phone_verified': False, 'created_at': now - timedelta(days=2),
    }
    document.update(extra or {})
    async def write(db):
        await db.users.insert_one(document)
        await db.wallets.insert_one({'user_id': user_id, 'balance': 0, 'bonus': 0, 'bonus_untracked': 0,
                                     'withdrawable': 0, 'withdrawable_pending': 0, 'source_migrated': True})
    db_insert(db_name, write)
    return user_id, {'Authorization': f'Bearer {create_jwt(user_id)}'}, now


def cleanup(db_name, user_id):
    async def run():
        client = AsyncIOMotorClient(_mongo_url)
        try:
            db = client[db_name]
            for coll in ('users', 'wallets', 'wallet_tx', 'payment_transactions', 'bonus_grants', 'winnings_wallets',
                         'withdrawal_requests', 'cashout_requests', 'user_activity_days', 'world_level_attempts',
                         'world_champion_sessions', 'special_challenge_attempts', 'game_scores', 'world_contest_entries',
                         'orders', 'tickets'):
                await db[coll].delete_many({'user_id': user_id})
        finally:
            client.close()
    asyncio.run(run())


def db_insert(db_name, fn):
    async def run():
        client = AsyncIOMotorClient(_mongo_url)
        try:
            await fn(client[db_name])
        finally:
            client.close()
    asyncio.run(run())


def db_read(db_name, fn):
    async def run():
        client = AsyncIOMotorClient(_mongo_url)
        try:
            return await fn(client[db_name])
        finally:
            client.close()
    return asyncio.run(run())


def get_stats(headers, refresh=True):
    r = requests.get(f'{API}/admin/dashboard/user-stats', params={'refresh': str(refresh).lower()}, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_user_stats_activity_days_modes_and_staff_exclusion(db_name):
    admin_id, admin_headers, _ = seed(db_name, role='admin')
    user_id, player_headers, now = seed(db_name)
    staff_id, staff_headers, _ = seed(db_name, role='support')
    try:
        before = get_stats(admin_headers)['activity']
        day_today = now.astimezone(REPORT_TZ).date().isoformat()
        day_yesterday = (now - timedelta(days=1)).astimezone(REPORT_TZ).date().isoformat()
        def fill(db):
            async def run():
                await db.users.update_one({'user_id': user_id}, {'$set': {'phone_verified': True, 'phone_verified_at': now}})
                await db.user_activity_days.insert_many([
                    {'user_id': user_id, 'day': day_today, 'kind': 'presence', 'first_at': now},
                    {'user_id': user_id, 'day': day_yesterday, 'kind': 'presence', 'first_at': now - timedelta(days=1)},
                ])
                await db.user_activity_days.insert_one({'user_id': staff_id, 'day': day_today, 'kind': 'presence', 'first_at': now})
                await db.world_level_attempts.insert_one({'attempt_id': uuid.uuid4().hex, 'session_id': uuid.uuid4().hex,
                    'user_id': user_id, 'season_id': 'season-1', 'champion_stage': 1, 'level': 1,
                    'created_at': now, 'completed_at': now, 'passed': True})
                await db.world_contest_entries.insert_one({'entry_id': uuid.uuid4().hex, 'user_id': user_id,
                    'season_id': 'season-1', 'global_contest_number': 1, 'entered_at': now})
                await db.orders.insert_one({'order_id': uuid.uuid4().hex, 'user_id': user_id, 'status': 'paid', 'created_at': now})
            return run()
        db_insert(db_name, fill)
        assert requests.post(f'{API}/activity/ping', json={'kind': 'presence'}, headers=player_headers,
                     timeout=20).status_code == 200
        assert requests.post(f'{API}/activity/ping', json={'kind': 'presence'}, headers=staff_headers,
                     timeout=20).json()['recorded'] is False
        stats = get_stats(admin_headers)
        assert stats['registrations']['verified'] >= 1
        assert stats['activity']['dau'] >= before['dau'] + 1
        assert stats['activity']['wau'] >= before['wau'] + 1
        assert stats['active_players_today']['free_world'] >= 1
        assert stats['activity']['currently_active'] >= 1
        assert stats['entering_today']['free_competitions'] >= 1
        assert stats['entering_today']['paid_competitions'] >= 1
        assert stats['definitions']['currently_active'].startswith('Authenticated user with a server login')
        assert 'first recorded' in stats['data_notes'][0]
    finally:
        cleanup(db_name, admin_id)
        cleanup(db_name, user_id)
        cleanup(db_name, staff_id)


def test_wallet_report_reconciles_types_and_gbp_without_mutating(db_name):
    admin_id, headers, _ = seed(db_name, role='admin')
    user_id, _user_headers, now = seed(db_name)
    try:
        before_response = requests.get(f'{API}/admin/dashboard/wallet-report', params={'refresh': 'true'},
                                       headers=headers, timeout=30)
        assert before_response.status_code == 200, before_response.text
        before = before_response.json()
        def fill(db):
            async def run():
                await db.wallets.update_one({'user_id': user_id}, {'$set': {
                    'balance': 51.0, 'bonus': 6.0, 'bonus_untracked': 0.0,
                    'withdrawable': 15.0, 'withdrawable_pending': 10.0,
                }})
                rows = [
                    ('topup', 20.0, 0, 20.0, 0), ('bonus_grant', 10.0, 10.0, 0, 0),
                    ('spend', -4.0, -4.0, 0, 0), ('champion_prize', 25.0, 0, 0, 25.0),
                ]
                for kind, amount, bonus, purchased, withdrawable in rows:
                    await db.wallet_tx.insert_one({'tx_id': uuid.uuid4().hex, 'user_id': user_id, 'kind': kind,
                        'amount': amount, 'bonus_amount': bonus, 'purchased_amount': purchased,
                        'withdrawable_amount': withdrawable, 'balance_after': 55, 'created_at': now})
                await db.payment_transactions.insert_one({'session_id': uuid.uuid4().hex, 'user_id': user_id,
                    'kind': 'wallet_topup', 'payment_status': 'paid', 'currency': 'gbp', 'amount': 2000, 'created_at': now})
                await db.bonus_grants.insert_one({'grant_id': 'bg_' + user_id, 'ref_key': user_id, 'user_id': user_id,
                    'original_amount': 10, 'remaining_amount': 6, 'granted_at': now - timedelta(days=1),
                    'expires_at': now + timedelta(hours=12), 'status': 'active', 'expired_amount': 0, 'revoked_amount': 0})
                await db.cashout_requests.insert_one({'withdrawal_id': uuid.uuid4().hex, 'user_id': user_id,
                    'amount_tokens': 10, 'amount_gbp': 10, 'status': 'processing', 'created_at': now})
                await db.winnings_wallets.insert_one({'user_id': user_id, 'total_won_pence': 5000,
                    'available_pence': 2500, 'pending_pence': 500, 'total_paid_pence': 2000})
                await db.withdrawal_requests.insert_one({'withdrawal_id': uuid.uuid4().hex, 'user_id': user_id,
                    'amount_pence': 700, 'status': 'processing', 'created_at': now})
            return run()
        db_insert(db_name, fill)
        r = requests.get(f'{API}/admin/dashboard/wallet-report', params={'refresh': 'true'}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        report = r.json()
        assert report['bonus_tokens']['available'] - before['bonus_tokens']['available'] == 6
        assert report['bonus_tokens']['due_to_expire_24h'] - before['bonus_tokens']['due_to_expire_24h'] == 6
        assert report['purchased_tokens']['held'] - before['purchased_tokens']['held'] == 20
        assert report['purchased_tokens']['topup_value_gbp'] - before['purchased_tokens']['topup_value_gbp'] == 20
        assert report['winnings']['championship_prize_tokens']['held_withdrawable'] - before['winnings']['championship_prize_tokens']['held_withdrawable'] == 15
        assert report['winnings']['championship_prize_tokens']['pending_requests_tokens'] - before['winnings']['championship_prize_tokens']['pending_requests_tokens'] == 10
        assert report['winnings']['challenge_winnings_gbp']['held'] - before['winnings']['challenge_winnings_gbp']['held'] == 25
        assert report['winnings']['challenge_winnings_gbp']['pending_withdrawals'] - before['winnings']['challenge_winnings_gbp']['pending_withdrawals'] == 7
        assert report['integrity']['wallet_balance_total_tokens'] - before['integrity']['wallet_balance_total_tokens'] == 51
        assert report['integrity']['components_total_tokens'] - before['integrity']['components_total_tokens'] == 51
        # Reporting is read-only.
        async def read(db):
            return await db.wallets.find_one({'user_id': user_id}, {'_id': 0, 'balance': 1, 'bonus': 1})
        wallet = db_read(db_name, read)
        assert wallet == {'balance': 51.0, 'bonus': 6.0}
    finally:
        cleanup(db_name, admin_id)
        cleanup(db_name, user_id)


def test_wallet_report_does_not_guess_legacy_source_split(db_name):
    admin_id, headers, _ = seed(db_name, role='admin')
    user_id, _, _ = seed(db_name)
    try:
        before = requests.get(f'{API}/admin/dashboard/wallet-report', params={'refresh': 'true'},
                      headers=headers, timeout=30).json()
        def make_legacy(db):
            async def run():
                await db.wallets.update_one({'user_id': user_id}, {'$set': {'balance': 20.0},
                                                '$unset': {'bonus': '', 'bonus_untracked': '', 'withdrawable': '',
                                                           'withdrawable_pending': '', 'source_migrated': ''}})
            return run()
        db_insert(db_name, make_legacy)
        report = requests.get(f'{API}/admin/dashboard/wallet-report', params={'refresh': 'true'},
                              headers=headers, timeout=30).json()
        assert report['integrity']['unclassified_wallets'] >= 1
        assert report['integrity']['unclassified_balance_tokens'] >= 20
        assert report['purchased_tokens']['held'] == before['purchased_tokens']['held']
        assert report['integrity']['components_match'] is None
    finally:
        cleanup(db_name, admin_id)
        cleanup(db_name, user_id)
