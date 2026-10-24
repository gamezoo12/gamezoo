"""Iteration 43 backend tests:
- world state: championship_history + token_unlock_enabled defaults
- acquisition tracking (public + admin)
- user 360 world block
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD},
                      timeout=20)
    assert r.status_code == 200, f'Login failed: {r.status_code} {r.text}'
    tok = r.json().get('token') or r.json().get('access_token')
    assert tok, f'No token: {r.json()}'
    return tok


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


# ---------- world/state ----------
class TestWorldState:
    def test_championship_history(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/world/state', headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'championship_history' in data
        hist = data['championship_history']
        # One history entry per completed prior championship, so none for a user still in championship 1.
        assert isinstance(hist, list)
        assert len(hist) == max(int(data.get('champion_stage') or 1) - 1, 0), f'Unexpected history: {hist}'
        for entry in hist:
            levels = entry['levels']
            assert len(levels) == 10
            for lv in levels:
                assert lv['status'] in ('completed', 'skipped', 'pending', 'missed')

    def test_level2_token_unlock_enabled(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/world/state', headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        levels = data.get('levels') or []
        assert len(levels) == 10, f'Expected 10 levels, got {len(levels)}'
        lv2 = next((l for l in levels if int(l.get('level')) == 2), None)
        assert lv2, 'Level 2 missing'
        # New default: token_unlock_enabled True for levels 2-10
        assert lv2.get('token_unlock_enabled') is True, f'Level 2 token_unlock_enabled={lv2.get("token_unlock_enabled")}, full={lv2}'
        # Level 2 is time-locked (season starts UK midnight; C2 level 2 not yet unlocked)
        # Note: current admin is on stage 2 already, so level 2 within stage 2 is presumably time-locked
        assert lv2.get('lock_reason') in ('time', None), f'lv2 lock_reason={lv2.get("lock_reason")}'


# ---------- acquisition ----------
class TestAcquisitionTracking:
    def test_track_google_organic(self):
        payload = {
            'visitor_id': f'TEST_vg_{uuid.uuid4().hex[:10]}',
            'landing_path': '/',
            'referrer': 'https://www.google.com/search?q=prize+league',
        }
        r = requests.post(f'{BASE_URL}/api/acquisition/track', json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['ok'] is True
        assert d['recorded'] is True
        assert d['channel'] == 'organic_search', d

    def test_track_utm_campaign(self):
        payload = {
            'visitor_id': f'TEST_vc_{uuid.uuid4().hex[:10]}',
            'landing_path': '/promo',
            'utm_source': 'newsletter',
            'utm_medium': 'email',
            'utm_campaign': 'launch',
        }
        r = requests.post(f'{BASE_URL}/api/acquisition/track', json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['channel'] == 'campaign'
        assert d['source'] == 'newsletter'

    def test_track_direct(self):
        payload = {
            'visitor_id': f'TEST_vd_{uuid.uuid4().hex[:10]}',
            'landing_path': '/',
            'referrer': '',
        }
        r = requests.post(f'{BASE_URL}/api/acquisition/track', json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['channel'] == 'direct'
        assert d['source'] == 'direct'


class TestAcquisitionAdmin:
    def test_summary_admin(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/admin/acquisition/summary?days=30', headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ['total_visits', 'unique_visitors', 'by_source', 'by_channel',
                    'by_device', 'by_browser', 'by_landing', 'by_campaign', 'trend']:
            assert key in d, f'missing {key}'
        assert isinstance(d['by_source'], list)
        assert isinstance(d['trend'], list)

    def test_visits_admin(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/admin/acquisition/visits?limit=10', headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'visits' in d
        assert 'total' in d
        assert isinstance(d['visits'], list)

    def test_summary_unauth(self):
        r = requests.get(f'{BASE_URL}/api/admin/acquisition/summary', timeout=15)
        assert r.status_code in (401, 403)

    def test_visits_unauth(self):
        r = requests.get(f'{BASE_URL}/api/admin/acquisition/visits', timeout=15)
        assert r.status_code in (401, 403)


# ---------- user 360 world block ----------
class TestUser360World:
    @pytest.fixture(scope='class')
    def admin_user_id(self, admin_token):
        from datetime import datetime, timezone
        from pymongo import MongoClient
        me = requests.get(f'{BASE_URL}/api/auth/me', headers={'Authorization': f'Bearer {admin_token}'}, timeout=20)
        assert me.status_code == 200, me.text
        uid = me.json()['user_id']
        session_id = f'sess_iter43_{uuid.uuid4().hex[:10]}'
        client = MongoClient(os.environ['MONGO_URL'])
        attempts = client[os.environ['DB_NAME']].world_level_attempts
        now = datetime.now(timezone.utc)
        attempts.insert_one({'session_id': session_id, 'season_id': 'season-1', 'user_id': uid, 'level': 1,
                             'champion_stage': 1, 'passed': True, 'status': 'passed',
                             'created_at': now, 'completed_at': now})
        yield uid
        attempts.delete_one({'session_id': session_id})
        client.close()

    def test_user_360_has_world(self, admin_headers, admin_user_id):
        r = requests.get(f'{BASE_URL}/api/admin/users/{admin_user_id}/360', headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'world' in d, 'world block missing'
        world = d['world']
        for key in ['progress', 'level_attempts', 'level_skips', 'winnings',
                    'winnings_total', 'token_history', 'stats']:
            assert key in world, f'world.{key} missing'
        attempts = world['level_attempts']
        assert isinstance(attempts, list)
        assert len(attempts) > 0, 'level_attempts empty for admin user'
        first = attempts[0]
        for f in ['level', 'passed', 'status', 'created_at']:
            assert f in first, f'attempt field {f} missing, keys={list(first.keys())}'
