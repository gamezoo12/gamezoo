"""Business Review: shared periods, staff exclusion, separate token categories and Impossible Challenges."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

from services.analytics_common import resolve_range
from tests.test_admin_dashboard_stats_live import API, cleanup, db_insert, db_name, seed  # noqa: F401
from routers.admin_routes import _range_match


def test_shared_periods_resolve_to_expected_windows():
    now = datetime(2026, 7, 1, 12, 30, tzinfo=timezone.utc)
    for key, hours in (('1h', 1), ('6h', 6), ('24h', 24)):
        window = resolve_range(key, now=now)
        assert window['end'] - window['start'] == timedelta(hours=hours, seconds=1)
    yesterday = resolve_range('yesterday', now=now)
    assert yesterday['end'] - yesterday['start'] == timedelta(days=1)
    assert (resolve_range('7d', now=now)['end'] - resolve_range('7d', now=now)['start']).days == 7
    assert (resolve_range('1m', now=now)['end'] - resolve_range('1m', now=now)['start']).days == 30
    assert (resolve_range('1y', now=now)['end'] - resolve_range('1y', now=now)['start']).days == 365
    everything = resolve_range('all_time', now=now)
    assert everything['start'].year == 2000 and everything['end'] > now
    assert resolve_range('lifetime', now=now)['start'] == everything['start']
    assert _range_match('all_time')[0] == {}
    assert '$lt' in _range_match('6h')[0]['created_at']


def _get(path, headers, **params):
    response = requests.get(f'{API}/admin/dashboard/{path}', params=params, headers=headers, timeout=60)
    assert response.status_code == 200, response.text
    return response.json()


def test_business_review_rejects_unknown_period(db_name):
    admin_id, headers, _ = seed(db_name, role='admin')
    try:
        response = requests.get(f'{API}/admin/dashboard/business-review', params={'period': 'fortnight'},
                                headers=headers, timeout=30)
        assert response.status_code == 400
    finally:
        cleanup(db_name, admin_id)


def test_business_review_counts_recent_repeat_activity_after_daily_first_ping(db_name):
    admin_id, headers, now = seed(db_name, role='admin')
    user_id, _, _ = seed(db_name)
    old_ping = now - timedelta(hours=3)
    recent_ping = now - timedelta(minutes=10)
    try:
        def fill(db):
            async def run():
                await db.users.update_one({'user_id': user_id}, {'$set': {'last_active_at': recent_ping}})
                await db.user_activity_days.insert_one({
                    'user_id': user_id, 'day': old_ping.date().isoformat(), 'kind': 'presence', 'first_at': old_ping,
                })
            return run()
        db_insert(db_name, fill)
        report = _get('details', headers, metric='active_users', period='1h', q=user_id)
        assert report['total'] == 1
    finally:
        cleanup(db_name, admin_id)
        cleanup(db_name, user_id)


def test_business_review_periods_staff_exclusion_and_tokens(db_name):
    admin_id, headers, now = seed(db_name, role='admin')
    user_id = google_id = staff_id = 'not_created'
    visitor, staff_visitor, legacy_staff_visitor = (f'visitor_{uuid.uuid4().hex[:8]}' for _ in range(3))
    attempt_id = f'attempt_{uuid.uuid4().hex[:8]}'
    session = f'session_{uuid.uuid4().hex[:8]}'
    try:
        before = {key: _get('business-review', headers, period=key) for key in ('1h', '7d', 'all_time', 'yesterday')}
        user_id, _, _ = seed(db_name, extra={'phone_verified': True})
        google_id, _, _ = seed(db_name, extra={'method': 'google'})
        staff_id, _, _ = seed(db_name, role='support')
        paid_session, failed_session = f'paid_{user_id}', f'failed_{user_id}'

        def fill(db):
            async def run():
                recent, old = now - timedelta(minutes=20), now - timedelta(days=3)

                def view(vid, uid, at, **extra):
                    return {'view_id': uuid.uuid4().hex, 'visitor_id': vid, 'session_id': extra.pop('session_id', session),
                            'user_id': uid, 'page_path': extra.pop('path', '/challenge'), 'page_key': 'special_challenges',
                            'source_key': 'direct', 'device_type': 'desktop', 'created_at': at, 'is_staff': False, **extra}
                legacy_row = view(legacy_staff_visitor, staff_id, recent)
                del legacy_row['is_staff']  # rows written before role-at-view-time was stored
                await db.acquisition_page_views.insert_many([
                    view(visitor, user_id, recent),
                    view(visitor, user_id, old, session_id=f'old_{session}', path='/competitions'),
                    view(staff_visitor, staff_id, recent, is_staff=True),
                    legacy_row,
                ])
                await db.user_activity_days.insert_many([
                    {'user_id': user_id, 'day': recent.date().isoformat(), 'kind': 'presence', 'first_at': recent},
                    {'user_id': staff_id, 'day': recent.date().isoformat(), 'kind': 'presence', 'first_at': recent},
                ])
                await db.payment_transactions.insert_many([
                    {'session_id': paid_session, 'user_id': user_id, 'kind': 'wallet_topup', 'payment_status': 'paid',
                     'amount': 2000, 'amount_received_pence': 2000, 'created_at': recent},
                    {'session_id': failed_session, 'user_id': user_id, 'kind': 'wallet_topup', 'payment_status': 'failed',
                     'amount': 5000, 'created_at': recent},
                ])
                rows = [
                    ('topup', 20, 0, 20, 0, 0, recent), ('bonus_grant', 10, 10, 0, 0, 0, recent),
                    ('admin_adjust', 3, 3, 0, 0, 0, recent), ('bonus_expiry', -1, -1, 0, 0, 0, recent),
                    ('paid_prize_cash', 20, 0, 0, 20, 0, recent), ('paid_prize_bonus', 5, 0, 0, 0, 5, recent),
                    ('spend', -6, -3, -3, 0, 0, recent), ('topup', 99, 0, 99, 0, 0, old),
                ]
                for index, (kind, amount, bonus, topup, winning, winning_bonus, at) in enumerate(rows):
                    await db.wallet_tx.insert_one({
                        'tx_id': f'{user_id}_{index}', 'user_id': user_id, 'kind': kind, 'amount': amount,
                        'balance_after': 0, 'created_at': at, 'bonus_amount': bonus, 'purchased_amount': topup,
                        'withdrawable_amount': winning, 'winning_bonus_amount': winning_bonus,
                        'ref_order_id': f'impossible_challenge_entry:{attempt_id}' if index == 6 else f'ref_{index}_{user_id}',
                    })
                await db.cashout_requests.insert_one({
                    'withdrawal_id': f'paid_{user_id}', 'user_id': user_id, 'amount_tokens': 2, 'amount_gbp': 2,
                    'status': 'paid', 'created_at': recent, 'paid_at': recent, 'updated_at': recent})
                await db.special_challenge_attempts.insert_one({
                    'attempt_id': attempt_id, 'user_id': user_id, 'challenge_id': 'challenge_itest',
                    'started_at': recent, 'completed_at': recent})
            return run()
        db_insert(db_name, fill)
        after = {key: _get('business-review', headers, period=key) for key in before}

        def delta(period, *path):
            def dig(payload):
                for step in path:
                    payload = payload[step]
                return payload
            return round(dig(after[period]) - dig(before[period]), 2)

        # Staff, the failed payment and the older rows never leak into the recent window.
        assert delta('1h', 'traffic', 'page_views') == 1
        assert delta('1h', 'traffic', 'unique_visitors') == 1
        assert delta('7d', 'traffic', 'page_views') == 2
        assert delta('1h', 'users', 'active') == 1
        assert delta('1h', 'topups', 'count') == 1 and delta('1h', 'topups', 'amount_gbp') == 20
        assert after['1h']['topups']['unpaid_attempts_excluded'] - before['1h']['topups']['unpaid_attempts_excluded'] == 1
        # Registered users: only the player and the google account, not the admin or support account.
        assert delta('all_time', 'users', 'registered_total') == 2
        assert delta('7d', 'users', 'signups') == 2 and delta('7d', 'signups', 'google') == 1
        assert delta('1h', 'users', 'signups') == 0 and delta('yesterday', 'users', 'signups') == 0

        # Each token category is reported separately and the old Top-up Tokens only count in a wider window.
        assert delta('1h', 'tokens', 'topup_tokens', 'issued') == 20
        assert delta('all_time', 'tokens', 'topup_tokens', 'issued') == 119
        assert delta('1h', 'tokens', 'topup_tokens', 'used') == 3
        assert delta('1h', 'tokens', 'winning_tokens', 'issued') == 20
        assert delta('1h', 'tokens', 'winning_tokens', 'withdrawn') == 2
        assert delta('1h', 'tokens', 'winning_bonus_tokens', 'issued') == 5
        assert delta('1h', 'tokens', 'bonus_tokens', 'issued') == 13
        assert delta('1h', 'tokens', 'bonus_tokens', 'used') == 3
        assert delta('1h', 'tokens', 'bonus_tokens', 'expired') == 1
        assert after['1h']['definitions']['balances'].startswith('Remaining balances are as of the end')

        # Impossible Challenges carry the same reporting fields as the other worlds.
        assert delta('1h', 'worlds', 'impossible_challenges', 'participants') == 1
        assert delta('1h', 'worlds', 'impossible_challenges', 'entries') == 1
        assert delta('1h', 'worlds', 'impossible_challenges', 'visits') == 1
        assert delta('1h', 'worlds', 'impossible_challenges', 'page_views') == 1
        assert delta('1h', 'worlds', 'impossible_challenges', 'revenue_tokens') == 6
        assert 'visitors_to_players_pct' in after['1h']['worlds']['impossible_challenges']['conversions']

        # Drill-downs use the same period and exclusions as the cards.
        users = _get('details', headers, metric='users', period='all_time', q=user_id)
        assert users['total'] == 1
        assert _get('details', headers, metric='users', period='all_time', q=staff_id)['total'] == 0
        assert _get('details', headers, metric='active_users', period='1h', q=user_id)['total'] == 1
        assert _get('details', headers, metric='active_users', period='1h', q=staff_id)['total'] == 0
        assert _get('details', headers, metric='visitors', period='1h', q=visitor)['total'] == 1
        assert _get('details', headers, metric='visitors', period='1h', q=staff_visitor)['total'] == 0
        assert _get('details', headers, metric='visitors', period='1h', q=legacy_staff_visitor)['total'] == 0
        assert _get('details', headers, metric='page_views', period='1h', q=visitor)['total'] == 1
        assert _get('details', headers, metric='page_views', period='7d', q=visitor)['total'] == 2
        topups = _get('details', headers, metric='topups', period='1h', q=user_id)
        assert topups['total'] == 1 and topups['items'][0]['session_id'] == paid_session
    finally:
        async def drop(db):
            await db.acquisition_page_views.delete_many({'visitor_id': {'$in': [visitor, staff_visitor, legacy_staff_visitor]}})
            await db.cashout_requests.delete_many({'user_id': user_id})
            await db.special_challenge_attempts.delete_many({'attempt_id': attempt_id})
        db_insert(db_name, drop)
        for uid in (admin_id, user_id, google_id, staff_id):
            cleanup(db_name, uid)


PERIODS = ('1h', '6h', '24h', 'yesterday', '7d', '1m', '1y', 'all_time')


def test_every_shared_period_works_across_dashboard_acquisition_and_analytics(db_name):
    admin_id, headers, _ = seed(db_name, role='admin')
    try:
        for period in PERIODS:
            summary = _get('summary', headers, period=period)
            assert {'paid_world', 'free_world', 'impossible_challenges', 'summary'} <= set(summary)
            review = _get('business-review', headers, period=period)
            assert review['period'] == period and set(review['worlds']) == {'free_world', 'paid_world', 'impossible_challenges'}
            assert review['tokens'] is not None
            assert review['traffic']['page_views'] == summary['summary']['page_views']
            assert review['traffic']['unique_visitors'] == summary['summary']['unique_visitors']
            assert review['users']['signups'] == summary['summary']['signups']
            assert _get('token-accounting', headers, period=period)['categories']
            assert 'transactions' in _get('token-ledger', headers, period=period)
            assert _get('world-activity', headers, period=period)['worlds']
            for report in ('overview', 'sources', 'pages', 'funnel', 'journeys', 'events'):
                response = requests.get(f'{API}/admin/acquisition/analytics/{report}', params={'range': period},
                                        headers=headers, timeout=60)
                assert response.status_code == 200, (period, report, response.text)
            for path in ('summary', 'visits', 'page-views'):
                response = requests.get(f'{API}/admin/acquisition/{path}', params={'period': period},
                                        headers=headers, timeout=60)
                assert response.status_code == 200, (period, path, response.text)
            for metric in ('users', 'signups', 'active_users', 'topups', 'visitors', 'page_views'):
                assert _get('details', headers, metric=metric, period=period)['total'] >= 0
    finally:
        cleanup(db_name, admin_id)
