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
                         'orders', 'tickets', 'acquisition_page_views', 'acquisition_events',
                         'special_challenge_rewards', 'wallet_tx'):
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
        today_local = now.astimezone(REPORT_TZ).date()
        day_today = today_local.isoformat()
        day_yesterday = (today_local - timedelta(days=1)).isoformat()
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
                    'winning_bonus': 5.0, 'withdrawable': 15.0, 'withdrawable_pending': 10.0,
                }})
                rows = [
                    ('topup', 20.0, 0, 20.0, 0), ('bonus_grant', 10.0, 10.0, 0, 0),
                    ('spend', -4.0, -4.0, 0, 0), ('champion_prize', 25.0, 0, 0, 25.0),
                ]
                for kind, amount, bonus, purchased, withdrawable in rows:
                    await db.wallet_tx.insert_one({'tx_id': uuid.uuid4().hex, 'user_id': user_id, 'kind': kind,
                        'amount': amount, 'bonus_amount': bonus, 'purchased_amount': purchased,
                        'withdrawable_amount': withdrawable, 'balance_after': 55, 'created_at': now})
                await db.wallet_tx.insert_one({'tx_id': uuid.uuid4().hex, 'user_id': user_id,
                    'kind': 'paid_prize_bonus', 'amount': 5.0, 'winning_bonus_amount': 5.0,
                    'balance_after': 51, 'created_at': now})
                await db.payment_transactions.insert_one({'session_id': uuid.uuid4().hex, 'user_id': user_id,
                    'kind': 'wallet_topup', 'payment_status': 'paid', 'currency': 'gbp', 'stripe_livemode': True,
                    'amount': 2000, 'created_at': now})
                await db.payment_transactions.insert_one({'session_id': uuid.uuid4().hex, 'user_id': user_id,
                    'kind': 'wallet_topup', 'payment_status': 'paid', 'currency': 'gbp', 'stripe_livemode': False,
                    'amount': 9000, 'created_at': now})
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
        assert report['bonus_tokens']['by_source']['admin']['issued'] - before['bonus_tokens']['by_source']['admin']['issued'] == 10
        assert report['bonus_tokens']['by_source']['admin']['outstanding_tracked'] - before['bonus_tokens']['by_source']['admin']['outstanding_tracked'] == 6
        assert report['bonus_tokens']['due_to_expire_24h'] - before['bonus_tokens']['due_to_expire_24h'] == 6
        assert report['purchased_tokens']['held'] - before['purchased_tokens']['held'] == 15
        assert report['purchased_tokens']['topup_value_gbp'] - before['purchased_tokens']['topup_value_gbp'] == 20
        assert report['purchased_tokens']['live_stripe_cash_received_gbp'] - before['purchased_tokens']['live_stripe_cash_received_gbp'] == 20
        assert report['purchased_tokens']['recognized_revenue_gbp'] is None
        assert report['purchased_tokens']['stripe_fees_gbp'] is None
        assert report['purchased_tokens']['net_revenue_gbp'] is None
        assert report['winning_bonus_tokens']['held'] - before['winning_bonus_tokens']['held'] == 5
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


def test_token_accounting_reconciles_categories_and_cashout_lifecycle(db_name):
    admin_id, headers, _ = seed(db_name, role='admin')
    user_id, _, now = seed(db_name)
    try:
        before = requests.get(f'{API}/admin/dashboard/token-accounting', params={'period': 'all_time'},
                              headers=headers, timeout=30)
        assert before.status_code == 200, before.text
        before = before.json()

        def fill(db):
            async def run():
                await db.wallets.update_one({'user_id': user_id}, {'$set': {
                    'balance': 58.0, 'bonus': 8.0, 'bonus_untracked': 0.0,
                    'winning_bonus': 5.0, 'withdrawable': 16.0,
                    'withdrawable_pending': 2.0, 'source_migrated': True,
                }})
                rows = [
                    ('topup', 30, 0, 30, 0, 0),
                    ('bonus_grant', 10, 10, 0, 0, 0),
                    ('paid_prize_bonus', 5, 0, 0, 0, 5),
                    ('paid_prize_cash', 20, 0, 0, 20, 0),
                    ('spend', -6, -3, -3, 0, 0),
                    ('admin_adjust', 3, 3, 0, 0, 0),
                    ('admin_adjust_negative', -1, -1, 0, 0, 0),
                    ('bonus_expiry', -1, -1, 0, 0, 0),
                ]
                for kind, amount, bonus, topup, winning, winning_bonus in rows:
                    tx_kind = 'admin_adjust' if kind == 'admin_adjust_negative' else kind
                    order_id = f'accounting_order_{user_id}' if kind == 'spend' else None
                    await db.wallet_tx.insert_one({
                        'tx_id': f'{user_id}_{kind}', 'user_id': user_id, 'kind': tx_kind,
                        'amount': amount, 'balance_after': 58.0, 'created_at': now - timedelta(days=1),
                        'bonus_amount': bonus, 'purchased_amount': topup,
                        'withdrawable_amount': winning, 'winning_bonus_amount': winning_bonus,
                        'ref_order_id': order_id or f'ref_{kind}_{user_id}', 'note': f'test {kind}',
                    })
                order_id = f'accounting_order_{user_id}'
                await db.orders.insert_one({'order_id': order_id, 'user_id': user_id,
                    'items': [{'contest_id': f'contest_{user_id}', 'qty': 1}], 'status': 'paid', 'created_at': now})
                await db.tickets.insert_one({'ticket_id': f'ticket_{user_id}', 'order_id': order_id,
                    'contest_id': f'contest_{user_id}', 'user_id': user_id, 'ticket_number': 1, 'created_at': now})
                await db.cashout_requests.insert_many([
                    {'withdrawal_id': f'paid_{user_id}', 'user_id': user_id, 'amount_tokens': 2,
                     'amount_gbp': 2, 'status': 'paid', 'created_at': now - timedelta(days=3),
                     'paid_at': now - timedelta(days=1), 'updated_at': now - timedelta(days=1)},
                    {'withdrawal_id': f'pending_{user_id}', 'user_id': user_id, 'amount_tokens': 2,
                     'amount_gbp': 2, 'status': 'processing', 'created_at': now - timedelta(hours=2)},
                    {'withdrawal_id': f'rejected_{user_id}', 'user_id': user_id, 'amount_tokens': 1,
                     'amount_gbp': 1, 'status': 'rejected', 'created_at': now - timedelta(days=3),
                     'updated_at': now - timedelta(days=1), 'reject_reason': 'test reversal'},
                ])
            return run()
        db_insert(db_name, fill)

        response = requests.get(f'{API}/admin/dashboard/token-accounting', params={'period': 'all_time'},
                                headers=headers, timeout=30)
        assert response.status_code == 200, response.text
        report = response.json()
        current = report['current']
        assert current['topup_tokens'] - before['current']['topup_tokens'] == 27
        assert current['bonus_tokens'] - before['current']['bonus_tokens'] == 8
        assert current['winning_bonus_tokens'] - before['current']['winning_bonus_tokens'] == 5
        assert current['winning_tokens'] - before['current']['winning_tokens'] == 16
        assert current['total_outstanding_tokens'] - before['current']['total_outstanding_tokens'] == 58
        bonus_movements = report['categories']['bonus_tokens']
        before_bonus_movements = before['categories']['bonus_tokens']
        assert bonus_movements['period_admin_positive'] - before_bonus_movements['period_admin_positive'] == 3
        assert bonus_movements['period_admin_negative'] - before_bonus_movements['period_admin_negative'] == 1
        assert bonus_movements['period_expired'] - before_bonus_movements['period_expired'] == 1
        assert bonus_movements['period_spent'] - before_bonus_movements['period_spent'] == 3
        assert report['cashouts']['completed_tokens_all_time'] - before['cashouts']['completed_tokens_all_time'] == 2
        assert report['cashouts']['pending_tokens_current'] - before['cashouts']['pending_tokens_current'] == 2
        assert report['cashouts']['rejected_tokens_in_period'] - before['cashouts']['rejected_tokens_in_period'] == 1
        assert report['categories']['winning_tokens']['current_reserved'] == 2
        winning_reconciliation = report['categories']['winning_tokens']
        if winning_reconciliation['reconciliation'] == 'verified':
            assert winning_reconciliation['opening_balance'] is not None
            assert winning_reconciliation['period_closing_balance'] == winning_reconciliation['current_remaining']
        else:
            assert winning_reconciliation['opening_balance'] is None
            assert winning_reconciliation['period_closing_balance'] is None

        ledger = requests.get(f'{API}/admin/dashboard/token-ledger', params={
            'period': 'all_time', 'category': 'winning_tokens', 'user_id': f'{user_id}@example.test',
        }, headers=headers, timeout=30)
        assert ledger.status_code == 200, ledger.text
        rows = ledger.json()['transactions']
        assert any(row['kind'] == 'cashout_requested' and row['status'] == 'pending' for row in rows), ledger.json()
        assert any(row['kind'] == 'cashout_completed' and row['status'] == 'paid' for row in rows)
        assert any(row['kind'] == 'cashout_rejected' and row['status'] == 'reversed' for row in rows)
        winning_bonus = requests.get(f'{API}/admin/dashboard/token-ledger', params={
            'period': 'all_time', 'category': 'winning_bonus_tokens', 'user_id': user_id,
        }, headers=headers, timeout=30)
        assert winning_bonus.status_code == 200
        assert any(row.get('kind') == 'paid_prize_bonus' and row.get('amount_in_view') == 5 for row in winning_bonus.json()['transactions'])
        world_ledger = requests.get(f'{API}/admin/dashboard/token-ledger', params={
            'period': 'all_time', 'category': 'bonus_tokens', 'user_id': user_id,
            'world': 'paid_world', 'contest_id': f'contest_{user_id}',
        }, headers=headers, timeout=30)
        assert world_ledger.status_code == 200, world_ledger.text
        spend_row = next(row for row in world_ledger.json()['transactions'] if row['kind'] == 'spend')
        assert spend_row['world'] == 'paid_world' and spend_row['contest_id'] == f'contest_{user_id}'
        csv_response = requests.get(f'{API}/admin/dashboard/token-ledger.csv', params={
            'period': 'all_time', 'category': 'winning_bonus_tokens', 'user_id': user_id,
        }, headers=headers, timeout=30)
        assert csv_response.status_code == 200 and 'text/csv' in csv_response.headers.get('content-type', '')
        assert 'paid_prize_bonus' in csv_response.text
        integrity = requests.get(f'{API}/admin/dashboard/wallet-integrity', params={'limit': 500}, headers=headers, timeout=30)
        assert integrity.status_code == 200, integrity.text
        assert not any(row['user_id'] == user_id for row in integrity.json()['sample'])
    finally:
        cleanup(db_name, admin_id)
        cleanup(db_name, user_id)


def test_token_accounting_and_ledger_require_admin(db_name):
    for path in ('token-accounting', 'token-ledger', 'token-ledger.csv'):
        response = requests.get(f'{API}/admin/dashboard/{path}', timeout=20)
        assert response.status_code in (401, 403), response.text


def test_world_activity_reports_three_worlds_and_source_labeled_spend(db_name):
    admin_id, headers, _ = seed(db_name, role='admin')
    user_id, _, now = seed(db_name)
    try:
        attempt = 'challenge_' + uuid.uuid4().hex
        order_id = 'order_' + uuid.uuid4().hex
        def fill(db):
            async def run():
                await db.world_level_attempts.insert_one({
                    'attempt_id': 'level_' + uuid.uuid4().hex, 'user_id': user_id,
                    'created_at': now, 'completed_at': now, 'passed': True,
                })
                await db.world_level_unlock_reservations.insert_one({
                    'reservation_id': 'unlock_' + uuid.uuid4().hex, 'user_id': user_id,
                    'created_at': now, 'wallet_tx_id': 'tx_free',
                })
                await db.wallet_tx.insert_one({
                    'tx_id': 'tx_free', 'user_id': user_id, 'kind': 'spend', 'amount': -5,
                    'purchased_amount': -3, 'bonus_amount': -2, 'winning_bonus_amount': 0,
                    'withdrawable_amount': 0, 'ref_order_id': 'unlock', 'created_at': now,
                })
                await db.acquisition_events.insert_one({
                    'event_id': uuid.uuid4().hex, 'user_id': user_id, 'name': 'paid_game_start', 'created_at': now,
                })
                await db.game_scores.insert_one({
                    'score_id': uuid.uuid4().hex, 'user_id': user_id, 'game_type': 'memory_match', 'created_at': now,
                })
                await db.tickets.insert_one({
                    'ticket_id': uuid.uuid4().hex, 'user_id': user_id, 'contest_id': 'contest-report-test',
                    'order_id': order_id, 'created_at': now,
                })
                await db.wallet_tx.insert_one({
                    'tx_id': 'tx_paid', 'user_id': user_id, 'kind': 'spend', 'amount': -4,
                    'purchased_amount': 0, 'bonus_amount': 0, 'winning_bonus_amount': -4,
                    'withdrawable_amount': 0, 'ref_order_id': order_id, 'created_at': now,
                })
                await db.special_challenge_attempts.insert_one({
                    'attempt_id': attempt, 'challenge_id': 'impossible-test', 'user_id': user_id,
                    'started_at': now, 'completed_at': now, 'entry_tokens': 1, 'status': 'complete',
                })
                await db.wallet_tx.insert_one({
                    'tx_id': 'tx_challenge', 'user_id': user_id, 'kind': 'spend', 'amount': -1,
                    'purchased_amount': -1, 'bonus_amount': 0, 'winning_bonus_amount': 0,
                    'withdrawable_amount': 0, 'ref_order_id': f'impossible_challenge_entry:{attempt}', 'created_at': now,
                })
                for path in ('/world', '/paid-leagues', '/challenge'):
                    await db.acquisition_page_views.insert_one({
                        'view_id': uuid.uuid4().hex, 'visitor_id': f'visitor_{path}_{user_id}',
                        'user_id': user_id, 'is_staff': False, 'is_test': False,
                        'page_path': path, 'created_at': now,
                    })
                await db.special_challenge_rewards.insert_one({
                    'reward_id': uuid.uuid4().hex, 'attempt_id': attempt, 'user_id': user_id,
                    'reward_pence': 500, 'reward_status': 'credited', 'created_at': now,
                    'credited_at': now,
                })
            return run()
        db_insert(db_name, fill)
        response = requests.get(f'{API}/admin/dashboard/world-activity', params={'period': 'today'},
                                headers=headers, timeout=30)
        assert response.status_code == 200, response.text
        worlds = response.json()['worlds']
        assert set(worlds) == {'free_world', 'paid_world', 'impossible_challenges'}
        assert worlds['free_world']['game_starts'] >= 1 and worlds['free_world']['completed_plays'] >= 1
        assert worlds['free_world']['token_spend_by_category']['topup_tokens'] >= 3
        assert worlds['paid_world']['entries'] >= 1 and worlds['paid_world']['completed_plays'] >= 1
        assert worlds['paid_world']['token_spend_by_category']['winning_bonus_tokens'] >= 4
        assert worlds['impossible_challenges']['game_starts'] >= 1
        assert worlds['impossible_challenges']['winnings']['cash_pence'] >= 500
    finally:
        cleanup(db_name, admin_id)
        cleanup(db_name, user_id)


def test_recent_activity_is_bounded_filtered_and_excludes_staff(db_name):
    admin_id, headers, now = seed(db_name, role='admin')
    user_id, _, _ = seed(db_name)
    try:
        def fill(db):
            async def run():
                await db.users.update_one({'user_id': user_id}, {'$set': {'created_at': now}})
                await db.wallet_tx.insert_many([
                    {'tx_id': f'tx_{uuid.uuid4().hex}', 'user_id': user_id, 'kind': 'topup', 'amount': 8,
                     'created_at': now, 'ref_order_id': 'stripe-test-ref'},
                    {'tx_id': f'tx_{uuid.uuid4().hex}', 'user_id': user_id, 'kind': 'bonus_expiry', 'amount': -2,
                     'created_at': now, 'ref_order_id': 'grant-test-ref'},
                    {'tx_id': f'tx_{uuid.uuid4().hex}', 'user_id': admin_id, 'kind': 'topup', 'amount': 100,
                     'created_at': now, 'ref_order_id': 'staff-ref'},
                ])
                await db.game_scores.insert_one({'score_id': uuid.uuid4().hex, 'user_id': user_id,
                                                   'created_at': now, 'contest_id': 'contest-feed-test'})
                await db.cashout_requests.insert_one({'withdrawal_id': uuid.uuid4().hex, 'user_id': user_id,
                    'amount_gbp': 3.5, 'status': 'processing', 'created_at': now})
                await db.world_level_attempts.insert_one({'attempt_id': uuid.uuid4().hex, 'user_id': user_id,
                                                            'created_at': now})
                await db.users.update_one({'user_id': user_id}, {'$set': {'created_at': now - timedelta(days=60)}})
            return run()
        db_insert(db_name, fill)
        response = requests.get(f'{API}/admin/dashboard/recent-activity', params={'period': '30d', 'limit': 100},
                                headers=headers, timeout=30)
        assert response.status_code == 200, response.text
        items = response.json()['items']
        titles = {item['title'] for item in items if item['user_id'] == user_id}
        assert {'Top-up', 'Bonus tokens expired', 'Paid World game played', 'Cashout processing',
            'Free World level played'} <= titles, f'activity titles returned: {titles!r}'
        assert not any(item['user_id'] == admin_id for item in items)
        topup = next(item for item in items if item.get('reference') == 'stripe-test-ref')
        cashout = next(item for item in items if item['title'] == 'Cashout processing')
        assert topup['amount_tokens'] == 8 and topup['amount_gbp'] is None
        assert cashout['amount_gbp'] == 3.5 and cashout['amount_tokens'] is None
        outside = requests.get(f'{API}/admin/dashboard/recent-activity', params={'period': 'today', 'limit': 100},
                               headers=headers, timeout=30)
        assert outside.status_code == 200
        assert not any(item['title'] == 'Registration' and item['user_id'] == user_id
                       for item in outside.json()['items'])
    finally:
        cleanup(db_name, admin_id)
        cleanup(db_name, user_id)
