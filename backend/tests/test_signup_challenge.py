"""Signup Challenge: eligibility, demo-free attempts, atomic attempt limits, verified scoring, forfeits, admin RBAC, snapshots."""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

from auth import create_jwt
from deps import _sanitize_db_name

API = os.environ['TEST_BACKEND_URL'].rstrip('/') + '/api'
NOW = datetime.now(timezone.utc)
RULES = 'Single winner: highest verified score at the closing date. UK residents 18+ with a verified +44 mobile only. Tie: fastest time.'


@pytest.fixture(scope='module')
def db():
    c = MongoClient(os.environ['MONGO_URL'])
    d = c[_sanitize_db_name(os.environ['DB_NAME'])]
    prev = d.settings.find_one({'_id': 'signup_challenge'})
    published = [r['challenge_id'] for r in d.signup_challenges.find({'status': 'published'})]
    yield d
    d.users.delete_many({'email': {'$regex': '^sc_test_'}})
    d.signup_challenges.update_many({'title': {'$regex': '^SC TEST'}}, {'$set': {'status': 'archived'}})
    d.signup_challenges.update_many({'challenge_id': {'$in': published}}, {'$set': {'status': 'published'}})
    d.settings.update_one({'_id': 'signup_challenge'}, {'$set': {'enabled': bool(prev and prev.get('enabled'))}}, upsert=True)
    c.close()


def _user(db, *, role='user', country='GB', phone='+447700900123', created=None, verified=True):
    uid = 'sc_' + uuid.uuid4().hex[:10]
    db.users.insert_one({'user_id': uid, 'email': f'sc_test_{uid}@example.com', 'name': 'Sam Tester', 'role': role,
                         'country_of_residence': country, 'phone': phone, 'phone_verified': verified,
                         'phone_verified_at': NOW if verified else None, 'email_verified': True, 'terms_accepted_at': NOW,
                         'dob': '1990-01-01', 'created_at': created or datetime.now(timezone.utc), 'method': 'email'})
    return {'Authorization': f'Bearer {create_jwt(uid)}'}, uid


@pytest.fixture(scope='module')
def admin(db):
    return _user(db, role='super_admin')[0]


@pytest.fixture(scope='module')
def challenge(db, admin):
    body = {'title': 'SC TEST Welcome', 'game_id': 'number_sequence', 'game_config': {'target': 5}, 'attempts_allowed': 2,
            'time_limit_s': 30, 'rules_text': RULES, 'legal_reviewed': True,
            'end_at': (NOW + timedelta(days=7)).isoformat(), 'prize_label': '£50 GIVEAWAY'}
    r = requests.post(f'{API}/admin/signup-challenge/challenges', json=body, headers=admin)
    assert r.status_code == 200, r.text
    cid = r.json()['challenge_id']
    assert requests.post(f'{API}/admin/signup-challenge/challenges/{cid}/status', json={'status': 'published'}, headers=admin).status_code == 200
    assert requests.put(f'{API}/admin/signup-challenge/settings', json={'enabled': True}, headers=admin).json()['enabled'] is True
    return cid


def _play(h, att, taps=None, finished=True):
    board = att['board']
    taps = taps if taps is not None else list(range(1, board['target'] + 1))
    gap = 200
    time.sleep(3 + gap * len(taps) / 1000)
    return requests.post(f"{API}/signup-challenge/attempts/{att['attempt_id']}/submit",
                         json={'taps': taps, 'tap_ms': [gap * (i + 1) for i in range(len(taps))], 'duration_ms': gap * len(taps) + 20,
                               'finished': finished}, headers=h)


def test_forged_fast_time_rejected(db, challenge):
    h, _ = _user(db)
    requests.get(f'{API}/signup-challenge/me', headers=h)
    att = requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h).json()['attempt']
    time.sleep(4)
    r = requests.post(f"{API}/signup-challenge/attempts/{att['attempt_id']}/submit",
                      json={'taps': list(range(1, 6)), 'tap_ms': [], 'duration_ms': 100, 'finished': True}, headers=h).json()
    assert r['attempt']['status'] == 'failed' and r['attempt']['score'] is None


def test_admin_rbac(db):
    h, _ = _user(db, role='admin')
    assert requests.get(f'{API}/admin/signup-challenge/challenges', headers=h).status_code == 403
    assert requests.put(f'{API}/admin/signup-challenge/settings', json={'enabled': True}, headers=h).status_code == 403


def test_games_list_marks_unsupported(admin):
    games = requests.get(f'{API}/admin/signup-challenge/games', headers=admin).json()['games']
    sup = {g['id'] for g in games if g['supported']}
    assert sup == {'number_sequence', 'colour_match'}
    assert any(not g['supported'] for g in games)


def test_unsupported_game_rejected(admin):
    r = requests.post(f'{API}/admin/signup-challenge/challenges', json={'title': 'SC TEST bad', 'game_id': 'sudoku_mini'}, headers=admin)
    assert r.status_code == 400


def test_publish_requires_rules(admin):
    r = requests.post(f'{API}/admin/signup-challenge/challenges', json={'title': 'SC TEST norules', 'game_id': 'colour_match'}, headers=admin)
    cid = r.json()['challenge_id']
    r = requests.post(f'{API}/admin/signup-challenge/challenges/{cid}/status', json={'status': 'published'}, headers=admin)
    assert r.status_code == 400


def test_existing_user_not_triggered(db, challenge):
    h, _ = _user(db, created=NOW - timedelta(days=30))
    assert requests.get(f'{API}/signup-challenge/me', headers=h).json()['show'] is False


def test_unverified_not_triggered(db, challenge):
    h, _ = _user(db, verified=False)
    db.users.update_one({'phone_verified': False, 'email': {'$regex': '^sc_test_'}}, {'$set': {'method': 'google'}})
    assert requests.get(f'{API}/signup-challenge/me', headers=h).json()['show'] is False


def test_full_flow_attempts_and_forfeit_rules(db, challenge):
    h, uid = _user(db)
    me = requests.get(f'{API}/signup-challenge/me', headers=h).json()
    assert me['show'] and me['remaining'] == 2 and me['can_play_real']
    assert requests.post(f'{API}/signup-challenge/event', json={'type': 'demo_start'}, headers=h).status_code == 200
    me = requests.get(f'{API}/signup-challenge/me', headers=h).json()
    assert me['remaining'] == 2  # demo never consumes attempts

    rid = uuid.uuid4().hex
    a1 = requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': rid}, headers=h).json()
    again = requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': rid}, headers=h).json()
    assert again['attempt']['attempt_id'] == a1['attempt']['attempt_id']  # network retry is idempotent
    parallel = requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h)
    assert parallel.status_code == 409  # second device cannot open another attempt
    assert 'expected' not in a1['attempt']
    r = _play(h, a1['attempt']).json()
    assert r['attempt']['status'] == 'completed' and 900 <= r['attempt']['score'] <= 1100 and r['remaining'] == 1
    replay = requests.post(f"{API}/signup-challenge/attempts/{a1['attempt']['attempt_id']}/submit", json={'taps': [1], 'tap_ms': [200], 'duration_ms': 200}, headers=h).json()
    assert replay['attempt']['score'] == r['attempt']['score'] and replay['remaining'] == 1

    # Refresh mid-attempt: the open attempt is lost, never refunded.
    a2 = requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h).json()
    me = requests.get(f'{API}/signup-challenge/me', headers=h).json()
    assert me['remaining'] == 0 and me['participation']['status'] == 'completed'
    assert [a['status'] for a in me['attempts']] == ['completed', 'abandoned']
    late = requests.post(f"{API}/signup-challenge/attempts/{a2['attempt']['attempt_id']}/submit", json={'taps': [1], 'tap_ms': [200], 'duration_ms': 200}, headers=h).json()
    assert late['attempt']['status'] == 'abandoned'
    assert requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h).status_code == 409
    assert requests.post(f'{API}/signup-challenge/final-seen', headers=h).status_code == 200
    assert requests.get(f'{API}/signup-challenge/me', headers=h).json()['show'] is False


def test_invalid_sequence_scores_zero_and_forfeit(db, challenge):
    h, uid = _user(db)
    requests.get(f'{API}/signup-challenge/me', headers=h)
    a = requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h).json()
    r = _play(h, a['attempt'], taps=[2, 1, 3, 4, 5]).json()
    assert r['attempt']['status'] == 'failed' and r['attempt']['score'] is None
    f = requests.post(f'{API}/signup-challenge/forfeit', headers=h).json()
    assert f['participation']['status'] == 'forfeited' and f['remaining'] == 0
    assert requests.get(f'{API}/signup-challenge/me', headers=h).json()['show'] is False
    assert requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h).status_code in (404, 409)


def test_unfinished_run_has_no_time(db, challenge):
    h, _ = _user(db)
    requests.get(f'{API}/signup-challenge/me', headers=h)
    a = requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h).json()
    r = _play(h, a['attempt'], taps=[1, 2, 3], finished=False).json()
    assert r['attempt']['status'] == 'expired' and r['attempt']['score'] is None and r['participation']['best_score'] is None


def test_intl_demo_only(db, challenge):
    h, _ = _user(db, country='US', phone='+12025550100')
    me = requests.get(f'{API}/signup-challenge/me', headers=h).json()
    assert me['show'] and me['can_play_real'] is False and me['real_block_reason']
    assert requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h).status_code == 403


def test_live_edit_keeps_snapshot(db, admin, challenge):
    h, _ = _user(db)
    assert requests.get(f'{API}/signup-challenge/me', headers=h).json()['challenge']['attempts_allowed'] == 2
    ch = requests.get(f'{API}/admin/signup-challenge/challenges', headers=admin).json()['challenges']
    cur = next(c for c in ch if c['challenge_id'] == challenge)
    body = {k: cur[k] for k in ('title', 'game_id', 'game_config', 'time_limit_s', 'rules_text', 'legal_reviewed', 'end_at', 'prize_label')}
    body.update({'attempts_allowed': 5, 'prize_type': 'gift', 'prize_label': 'FREE HOODIE'})
    assert requests.put(f'{API}/admin/signup-challenge/challenges/{challenge}', json=body, headers=admin).status_code == 200
    me = requests.get(f'{API}/signup-challenge/me', headers=h).json()
    assert me['challenge']['attempts_allowed'] == 2 and me['challenge']['prize_label'] == '£50 GIVEAWAY'
    h2, _ = _user(db)
    assert requests.get(f'{API}/signup-challenge/me', headers=h2).json()['challenge']['prize_label'] == 'FREE HOODIE'


def test_participants_and_analytics(admin, challenge):
    p = requests.get(f'{API}/admin/signup-challenge/challenges/{challenge}/participants', headers=admin).json()
    assert p['participants'] and p['participants'][0].get('provisional_rank') == 1
    a = requests.get(f'{API}/admin/signup-challenge/challenges/{challenge}/analytics', headers=admin).json()
    assert a['eligible_signups'] >= 4 and a['demo_starts'] >= 1 and a['forfeits'] >= 1 and a['best_time_ms'] > 0
