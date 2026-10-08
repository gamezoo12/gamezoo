"""
Iteration 46 — Targeted Alerts (Specific Users, Winners, Range regression),
per-notification read endpoint, and extension-aware champion_closes_at.

Scope (channels=['in_app'] only, NEVER sms per user instruction):
 - GET /api/admin/users/alerts/user-search
 - GET /api/admin/users/alerts/winner-sources
 - GET /api/admin/users/alerts/winners
 - POST /api/admin/users/alerts/campaigns (modes: users, winners, range)
 - POST /api/users/notifications/{id}/read & GET only_unread=true
 - POST /api/admin/world/contest/2/extend?days=1 -> /api/world/state
   (reset extensions afterwards)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
assert BASE_URL, 'REACT_APP_BACKEND_URL must be set'

ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASSWORD = 'Herts@910022'
PLAYER_EMAIL = 'player1@example.com'
PLAYER_PASSWORD = 'Player@12345'


def _login(email, password):
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': email, 'password': password}, timeout=30)
    assert r.status_code == 200, f'login {email} failed: {r.status_code} {r.text}'
    return r.json()['token']


@pytest.fixture(scope='module')
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope='module')
def player_token():
    return _login(PLAYER_EMAIL, PLAYER_PASSWORD)


@pytest.fixture
def admin_h(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


@pytest.fixture
def player_h(player_token):
    return {'Authorization': f'Bearer {player_token}'}


# ---------------- user-search ----------------
class TestUserSearch:
    def test_search_returns_pl10001(self, admin_h):
        r = requests.get(
            f'{BASE_URL}/api/admin/users/alerts/user-search',
            params={'q': 'earn'}, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        users = r.json().get('users', [])
        pids = {u.get('public_id') for u in users}
        assert 'PL10001' in pids, f'Expected PL10001 in {pids}'

    def test_short_q_empty(self, admin_h):
        r = requests.get(
            f'{BASE_URL}/api/admin/users/alerts/user-search',
            params={'q': 'a'}, headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert r.json()['users'] == []

    def test_requires_admin(self, player_h):
        r = requests.get(
            f'{BASE_URL}/api/admin/users/alerts/user-search',
            params={'q': 'earn'}, headers=player_h, timeout=30)
        assert r.status_code in (401, 403)


# ---------------- winner-sources & winners ----------------
class TestWinnerSources:
    def test_sources_structure(self, admin_h):
        r = requests.get(
            f'{BASE_URL}/api/admin/users/alerts/winner-sources',
            headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        srcs = r.json().get('sources', {})
        assert 'paid_contest' in srcs
        assert 'promotion_draw' in srcs
        assert 'free_world' in srcs
        fw = srcs['free_world']
        assert any(x.get('ref') == 'all' for x in fw), fw

    def test_winners_free_world_all(self, admin_h):
        r = requests.get(
            f'{BASE_URL}/api/admin/users/alerts/winners',
            params={'source': 'free_world', 'ref': 'all'},
            headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert 'count' in body
        assert isinstance(body.get('users'), list)


# ---------------- Campaigns ----------------
class TestCampaignUsers:
    def test_users_campaign_targets_two_ignores_bogus(self, admin_h, player_token):
        payload = {
            'title': 'TEST_targeted_users',
            'message': 'Hello specific users',
            'alert_type': 'custom',
            'channels': ['in_app'],
            'user_from': 1, 'user_to': 1,
            'audience': {
                'mode': 'users',
                'identifiers': ['PL10001', 'player1@example.com',
                                'bogus@none.com'],
            },
        }
        r = requests.post(
            f'{BASE_URL}/api/admin/users/alerts/campaigns',
            json=payload, headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get('targeted_count') == 2, body
        in_app = (body.get('counts') or {}).get('in_app') or {}
        assert in_app.get('sent') == 2, body
        campaign_id = body.get('campaign_id')
        assert campaign_id

        # Verify unknown_identifiers persisted in campaign audience_meta
        dr = requests.get(
            f'{BASE_URL}/api/admin/users/alerts/campaigns/{campaign_id}',
            headers=admin_h, timeout=30)
        assert dr.status_code == 200, dr.text
        camp = dr.json().get('campaign') or dr.json()
        audience = camp.get('audience') or {}
        unknown = audience.get('unknown_identifiers') or []
        assert 'bogus@none.com' in unknown, unknown

        # Give the background task a moment
        time.sleep(2)

        # Player should see an unread in-app notif
        pr = requests.get(
            f'{BASE_URL}/api/users/notifications',
            params={'only_unread': 'true'},
            headers={'Authorization': f'Bearer {player_token}'},
            timeout=30)
        assert pr.status_code == 200, pr.text
        notifs = pr.json().get('notifications', [])
        titles = [n.get('title') for n in notifs]
        assert 'TEST_targeted_users' in titles, titles

    def test_winners_campaign_zero_rejected(self, admin_h):
        payload = {
            'title': 'TEST_winners_empty',
            'message': 'Should not send',
            'alert_type': 'custom',
            'channels': ['in_app'],
            'user_from': 1, 'user_to': 1,
            'audience': {
                'mode': 'winners',
                'winner_source': 'free_world',
                'winner_ref': 'all',
            },
        }
        r = requests.post(
            f'{BASE_URL}/api/admin/users/alerts/campaigns',
            json=payload, headers=admin_h, timeout=60)
        assert r.status_code == 400, r.text
        assert 'winners' in (r.json().get('detail') or '').lower()

    def test_range_campaign_still_works(self, admin_h):
        payload = {
            'title': 'TEST_range_regression',
            'message': 'Range mode',
            'alert_type': 'custom',
            'channels': ['in_app'],
            'user_from': 1, 'user_to': 4,
            'audience': {'mode': 'range'},
        }
        r = requests.post(
            f'{BASE_URL}/api/admin/users/alerts/campaigns',
            json=payload, headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get('targeted_count', 0) >= 1
        in_app = (body.get('counts') or {}).get('in_app') or {}
        assert in_app.get('sent', 0) >= 1


# ---------------- Per-notification read ----------------
class TestPerNotifRead:
    def test_mark_single_read(self, admin_h, player_h, player_token):
        # Create a fresh in-app alert targeting player1
        payload = {
            'title': 'TEST_single_read',
            'message': 'Mark me read individually',
            'alert_type': 'custom',
            'channels': ['in_app'],
            'user_from': 1, 'user_to': 1,
            'audience': {
                'mode': 'users',
                'identifiers': ['player1@example.com'],
            },
        }
        r = requests.post(
            f'{BASE_URL}/api/admin/users/alerts/campaigns',
            json=payload, headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        time.sleep(2)

        # Find our notif
        gr = requests.get(
            f'{BASE_URL}/api/users/notifications',
            headers=player_h, timeout=30)
        assert gr.status_code == 200
        notifs = gr.json().get('notifications', [])
        target = next((n for n in notifs
                       if n.get('title') == 'TEST_single_read'), None)
        assert target is not None, [n.get('title') for n in notifs]
        nid = target.get('notification_id')
        assert nid, target

        # Mark it read
        mr = requests.post(
            f'{BASE_URL}/api/users/notifications/{nid}/read',
            headers=player_h, timeout=30)
        assert mr.status_code == 200, mr.text
        assert mr.json().get('ok') is True
        assert mr.json().get('updated') == 1

        # Verify it is no longer in unread
        ur = requests.get(
            f'{BASE_URL}/api/users/notifications',
            params={'only_unread': 'true'},
            headers=player_h, timeout=30)
        assert ur.status_code == 200
        unread_ids = [n.get('notification_id')
                      for n in ur.json().get('notifications', [])]
        assert nid not in unread_ids

        # History preserved — show up in full list with read=true
        hr = requests.get(f'{BASE_URL}/api/users/notifications',
                          headers=player_h, timeout=30)
        hist = hr.json().get('notifications', [])
        row = next((n for n in hist
                    if n.get('notification_id') == nid), None)
        assert row is not None, 'notification missing from history'
        assert row.get('read') is True


# ---------------- Extension timer ----------------
class TestExtensionTimer:
    def test_extend_contest2_shifts_state(self, admin_h, player_h):
        # Baseline — champion.champion_closes_at is where the player sees the
        # live championship close time.
        s0 = requests.get(f'{BASE_URL}/api/world/state',
                          headers=player_h, timeout=30)
        assert s0.status_code == 200, s0.text
        before = (s0.json().get('champion') or {}).get('champion_closes_at')

        # Extend contest 2 by 1 day
        er = requests.post(
            f'{BASE_URL}/api/admin/world/contest/2/extend',
            params={'days': 1}, headers=admin_h, timeout=30)
        assert er.status_code == 200, er.text
        new_close = er.json().get('new_champion_closes_at')
        assert new_close

        # Wait for scheduler tick (~60s)
        changed = False
        after = None
        for _ in range(16):
            time.sleep(5)
            s1 = requests.get(f'{BASE_URL}/api/world/state',
                              headers=player_h, timeout=30)
            if s1.status_code == 200:
                after = (s1.json().get('champion') or {}).get(
                    'champion_closes_at')
                if after and after != before:
                    changed = True
                    break

        # Reset extensions regardless of outcome
        rr = requests.post(
            f'{BASE_URL}/api/admin/world/contest-extensions/reset',
            headers=admin_h, timeout=30)
        assert rr.status_code == 200, rr.text

        assert changed, (
            f'champion_closes_at did not shift within 80s. '
            f'before={before}, after={after}, extend_resp={new_close}'
        )
