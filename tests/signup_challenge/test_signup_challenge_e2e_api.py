"""Signup Challenge public-URL regression (UK/intl QA users, admin RBAC). Run sequentially: pytest -p no:xdist.
Resets only QA users' participations via /app/tests/sc_reset_qa.py (never the seed script)."""
import os
import subprocess
import sys
import time
import uuid

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/frontend/.env')
load_dotenv('/app/backend/.env')
BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'
UK = ('sc.uk@example.com', 'Player@12345')
INTL = ('sc.intl@example.com', 'Player@12345')
OLD = ('player1@example.com', 'Player@12345')
SUPER = ('bachanta8@gmail.com', 'Herts@910022')


def _db():
    return MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]


def reset():
    subprocess.run(['python', '/app/tests/sc_reset_qa.py'], check=True, capture_output=True)


def login(creds):
    r = requests.post(f'{BASE}/auth/login', json={'email': creds[0], 'password': creds[1]}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers['Authorization'] = 'Bearer ' + r.json()['token']
    return s


def realistic_run(wait=1.5, n=20):
    time.sleep(3 + wait)
    dur = int(wait * 1000)
    return [int(dur * (i + 1) / n) for i in range(n)], list(range(1, n + 1)), dur


@pytest.fixture(scope='module')
def uk():
    reset()
    yield login(UK)
    reset()


# --- player flow (UK) ---
class TestUKFlow:
    ctx = {}

    def test_me_shows_challenge(self, uk):
        d = uk.get(f'{BASE}/signup-challenge/me').json()
        assert d['show'] is True, d
        assert d['challenge']['game_id'] == 'number_sequence'
        assert d['challenge']['attempts_allowed'] == 3 and d['remaining'] == 3
        assert d['challenge']['time_limit_s'] == 45 and d['challenge']['prize_label'] == '£50 GIVEAWAY'
        assert d['can_play_real'] is True and d['real_block_reason'] is None

    def test_demo_event_does_not_consume(self, uk):
        assert uk.post(f'{BASE}/signup-challenge/event', json={'type': 'demo_start'}).status_code == 200
        assert uk.post(f'{BASE}/signup-challenge/event', json={'type': 'bogus'}).status_code == 400
        assert uk.get(f'{BASE}/signup-challenge/me').json()['remaining'] == 3

    def test_attempt1_completed_time_score(self, uk):
        rid = uuid.uuid4().hex
        r = uk.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': rid})
        assert r.status_code == 200, r.text
        a = r.json()['attempt']
        assert a['attempt_no'] == 1 and sorted(a['board']['numbers']) == list(range(1, 21))
        assert 'expected' not in a
        r2 = uk.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': rid})
        assert r2.json()['attempt']['attempt_id'] == a['attempt_id']
        r3 = uk.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex})
        assert r3.status_code == 409
        stamps, taps, dur = realistic_run()
        r = uk.post(f'{BASE}/signup-challenge/attempts/{a["attempt_id"]}/submit',
                    json={'taps': taps, 'tap_ms': stamps, 'duration_ms': dur, 'finished': True})
        d = r.json()
        assert r.status_code == 200, d
        assert d['attempt']['status'] == 'completed' and d['attempt']['score'] == dur
        assert d['remaining'] == 2 and d['participation']['best_score'] == dur
        self.ctx['board1'] = a['board']['numbers']

    def test_attempt2_abandoned_on_reload_new_board(self, uk):
        a = uk.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}).json()['attempt']
        assert a['attempt_no'] == 2 and a['board']['numbers'] != self.ctx['board1']
        d = uk.get(f'{BASE}/signup-challenge/me').json()
        assert d['show'] and d['remaining'] == 1
        assert {x['attempt_no']: x['status'] for x in d['attempts']}[2] == 'abandoned'
        r = uk.post(f'{BASE}/signup-challenge/attempts/{a["attempt_id"]}/submit',
                    json={'taps': list(range(1, 21)), 'tap_ms': [], 'duration_ms': 500, 'finished': True})
        assert r.json()['attempt']['status'] == 'abandoned' and r.json()['remaining'] == 1

    def test_wrong_sequence_rejected_and_completes(self, uk):
        a = uk.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}).json()['attempt']
        assert a['attempt_no'] == 3
        time.sleep(4)
        d = uk.post(f'{BASE}/signup-challenge/attempts/{a["attempt_id"]}/submit',
                    json={'taps': [2, 1] + list(range(3, 21)), 'tap_ms': [], 'duration_ms': 900, 'finished': True}).json()
        assert d['attempt']['status'] == 'failed' and d['attempt']['score'] is None
        assert d['participation']['status'] == 'completed' and d['remaining'] == 0
        assert uk.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}).status_code == 409

    def test_final_seen_dismisses(self, uk):
        assert uk.post(f'{BASE}/signup-challenge/final-seen').status_code == 200
        d = uk.get(f'{BASE}/signup-challenge/me').json()
        assert d['show'] is False and d['reason'] == 'dismissed'


# --- anti-cheat probe: impossible time when tap_ms omitted ---
def test_fake_fast_submit_without_tap_stamps():
    reset()
    s = login(UK)
    s.get(f'{BASE}/signup-challenge/me')
    a = s.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}).json()['attempt']
    time.sleep(4)
    att = s.post(f'{BASE}/signup-challenge/attempts/{a["attempt_id"]}/submit',
                 json={'taps': list(range(1, 21)), 'tap_ms': [], 'duration_ms': 100, 'finished': True}).json()['attempt']
    reset()
    assert not (att['status'] == 'completed' and att['score'] < 1000), f'Accepted impossible score {att}'


def test_forfeit_without_completed():
    reset()
    s = login(UK)
    s.get(f'{BASE}/signup-challenge/me')
    r = s.post(f'{BASE}/signup-challenge/forfeit')
    assert r.status_code == 200 and r.json()['participation']['status'] == 'forfeited'
    assert s.get(f'{BASE}/signup-challenge/me').json()['show'] is False
    reset()


def test_intl_cannot_start_real():
    reset()
    s = login(INTL)
    d = s.get(f'{BASE}/signup-challenge/me').json()
    assert d['show'] is True and d['can_play_real'] is False and '+44' in d['real_block_reason']
    assert s.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}).status_code == 403
    reset()


def test_existing_user_not_shown():
    assert login(OLD).get(f'{BASE}/signup-challenge/me').json()['show'] is False


def test_unauth_401():
    assert requests.get(f'{BASE}/signup-challenge/me').status_code == 401


def test_super_admin_endpoints():
    s = login(SUPER)
    assert s.get(f'{BASE}/signup-challenge/me').json()['show'] is False
    for p in ('settings', 'challenges', 'games', 'audit'):
        assert s.get(f'{BASE}/admin/signup-challenge/{p}').status_code == 200, p
    g = s.get(f'{BASE}/admin/signup-challenge/games').json()['games']
    assert {x['id'] for x in g if x['supported']} == {'number_sequence', 'colour_match'}
    for p in ('participants', 'analytics'):
        assert s.get(f'{BASE}/admin/signup-challenge/challenges/SC-QA-WELCOME/{p}').status_code == 200


def test_publish_without_rules_fails():
    s = login(SUPER)
    r = s.post(f'{BASE}/admin/signup-challenge/challenges', json={'title': 'TEST_SC draft', 'game_id': 'number_sequence'})
    assert r.status_code == 200, r.text
    cid = r.json()['challenge_id']
    try:
        r = s.post(f'{BASE}/admin/signup-challenge/challenges/{cid}/status', json={'status': 'published'})
        assert r.status_code == 400 and r.json()['detail']['code'] == 'RULES_REQUIRED'
        assert s.post(f'{BASE}/admin/signup-challenge/challenges',
                      json={'title': 'TEST_SC bad', 'game_id': 'memory_match'}).status_code == 400
    finally:
        _db().signup_challenges.delete_one({'challenge_id': cid, 'title': 'TEST_SC draft'})
        _db().signup_challenge_audit.delete_many({'challenge_id': cid})


def test_normal_admin_403():
    sys.path.insert(0, '/app/backend')
    from auth import create_jwt
    uid = 'TEST_sc_admin_' + uuid.uuid4().hex[:6]
    _db().users.insert_one({'user_id': uid, 'email': f'{uid.lower()}@example.com', 'role': 'admin', 'name': 'TEST admin', 'email_verified': True})
    try:
        h = {'Authorization': 'Bearer ' + create_jwt(uid)}
        for p in ('settings', 'challenges', 'games', 'audit'):
            r = requests.get(f'{BASE}/admin/signup-challenge/{p}', headers=h)
            assert r.status_code == 403, (p, r.status_code, r.text)
        assert requests.put(f'{BASE}/admin/signup-challenge/settings', json={'enabled': False}, headers=h).status_code == 403
    finally:
        _db().users.delete_one({'user_id': uid})
