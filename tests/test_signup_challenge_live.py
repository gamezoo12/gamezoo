"""Live (public URL) Signup Challenge regression: QA users seeded by backend/scripts/seed_signup_challenge_test.py --enable.

Run: python -m pytest /app/tests/test_signup_challenge_live.py -v -p no:cacheprovider -c /dev/null
Consumes all 3 real attempts of sc.uk@example.com -> re-run the seed script afterwards.
"""
import os
import time
import uuid

import pytest
import requests

def _base():
    url = os.environ.get('REACT_APP_BACKEND_URL')
    if not url:
        for line in open('/app/frontend/.env'):
            if line.startswith('REACT_APP_BACKEND_URL='):
                url = line.split('=', 1)[1].strip()
    return url.rstrip('/') + '/api'


API = _base()
PW = 'Player@12345'


def _login(email, pw=PW):
    r = requests.post(f'{API}/auth/login', json={'email': email, 'password': pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f'login failed for {email}: {r.status_code}')
    return {'Authorization': f"Bearer {r.json()['token']}"}


@pytest.fixture(scope='module')
def uk():
    return _login('sc.uk@example.com')


@pytest.fixture(scope='module')
def intl():
    return _login('sc.intl@example.com')


def _me(h):
    r = requests.get(f'{API}/signup-challenge/me', headers=h, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _start(h):
    return requests.post(f'{API}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}, headers=h, timeout=20)


def _submit(h, aid, duration_ms, taps=None):
    taps = taps if taps is not None else list(range(1, 21))
    stamps = [int(duration_ms * (i + 1) / len(taps)) for i in range(len(taps))] if taps else []
    return requests.post(f'{API}/signup-challenge/attempts/{aid}/submit', headers=h, timeout=20,
                         json={'taps': taps, 'tap_ms': stamps, 'duration_ms': duration_ms, 'finished': len(taps) == 20})


# Eligibility / intro payload
def test_uk_me_shows_challenge(uk):
    d = _me(uk)
    assert d['show'] is True
    ch = d['challenge']
    assert ch['prize_label'] == '£50 GIVEAWAY' and ch['game_label'] == 'Number Sequence'
    assert ch['attempts_allowed'] == 3 and ch['time_limit_s'] == 45 and d['remaining'] == 3
    assert d['can_play_real'] is True and d['real_block_reason'] is None


# Demo never consumes attempts
def test_demo_event_keeps_attempts(uk):
    assert requests.post(f'{API}/signup-challenge/event', json={'type': 'demo_start'}, headers=uk, timeout=20).status_code == 200
    assert requests.post(f'{API}/signup-challenge/event', json={'type': 'bogus'}, headers=uk, timeout=20).status_code == 400
    assert _me(uk)['remaining'] == 3


# Real attempt 1 fast, attempt 2 slower -> best stays lowest time; attempt 3 abandoned by reload
def test_real_attempts_time_scoring_and_refresh(uk):
    r = _start(uk)
    assert r.status_code == 200, r.text
    a1 = r.json()['attempt']
    assert sorted(a1['board']['numbers']) == list(range(1, 21)) and r.json()['remaining'] == 2
    # Second concurrent start rejected
    assert _start(uk).status_code == 409
    time.sleep(5.5)
    s1 = _submit(uk, a1['attempt_id'], 2345)
    assert s1.status_code == 200, s1.text
    j1 = s1.json()
    assert j1['attempt']['status'] == 'completed' and j1['attempt']['score'] == 2345
    assert j1['participation']['best_score'] == 2345 and j1['remaining'] == 2

    a2 = _start(uk).json()['attempt']
    time.sleep(7.5)
    j2 = _submit(uk, a2['attempt_id'], 4100).json()
    assert j2['attempt']['status'] == 'completed' and j2['attempt']['score'] == 4100
    assert j2['participation']['best_score'] == 2345, 'slower attempt must not replace the best time'
    assert j2['remaining'] == 1

    a3 = _start(uk).json()['attempt']
    d = _me(uk)  # page refresh mid-attempt
    statuses = {a['attempt_no']: a['status'] for a in d['attempts']}
    assert statuses[a3['attempt_no']] == 'abandoned'
    assert d['remaining'] == 0 and d['participation']['status'] == 'completed'
    # Submitting the abandoned attempt afterwards must not score it
    late = _submit(uk, a3['attempt_id'], 2000).json()
    assert late['attempt']['status'] == 'abandoned' and late['attempt']['score'] is None
    assert _start(uk).status_code == 409


# Final seen -> never shown again
def test_final_seen_hides_forever(uk):
    assert requests.post(f'{API}/signup-challenge/final-seen', headers=uk, timeout=20).status_code == 200
    d = _me(uk)
    assert d['show'] is False and d['reason'] == 'dismissed'


# International user: demo only
def test_intl_demo_only(intl):
    d = _me(intl)
    assert d['show'] is True and d['can_play_real'] is False and d['real_block_reason']
    r = _start(intl)
    assert r.status_code == 403 and r.json()['detail']['code'] == 'NOT_ELIGIBLE'


# Unfinished run (intl cannot play) - verified via forfeit flow for intl
def test_intl_forfeit_hides(intl):
    r = requests.post(f'{API}/signup-challenge/forfeit', headers=intl, timeout=20)
    assert r.status_code == 200 and r.json()['participation']['status'] == 'forfeited'
    d = _me(intl)
    assert d['show'] is False and d['reason'] in ('forfeited', 'dismissed')


# Existing user never triggered
def test_existing_user_not_shown():
    h = _login('player1@example.com')
    d = _me(h)
    assert d['show'] is False and d['reason'] == 'existing_user'


# RBAC
def test_admin_endpoints_rbac(uk):
    assert requests.get(f'{API}/admin/signup-challenge/challenges', timeout=20).status_code in (401, 403)
    assert requests.get(f'{API}/admin/signup-challenge/challenges', headers=uk, timeout=20).status_code == 403
    assert requests.put(f'{API}/admin/signup-challenge/settings', json={'enabled': False}, headers=uk, timeout=20).status_code == 403


def test_super_admin_reads():
    h = _login('bachanta8@gmail.com', 'Herts@910022')
    lst = requests.get(f'{API}/admin/signup-challenge/challenges', headers=h, timeout=20).json()
    assert any(c['challenge_id'] == 'SC-QA-WELCOME' and c['status'] == 'published' for c in lst['challenges'])
    games = requests.get(f'{API}/admin/signup-challenge/games', headers=h, timeout=20).json()['games']
    assert {g['id'] for g in games if g['supported']} == {'number_sequence', 'colour_match'}
    p = requests.get(f'{API}/admin/signup-challenge/challenges/SC-QA-WELCOME/participants', headers=h, timeout=20).json()
    assert 'participants' in p
    a = requests.get(f'{API}/admin/signup-challenge/challenges/SC-QA-WELCOME/analytics', headers=h, timeout=20)
    assert a.status_code == 200 and 'impressions' in a.json()
    # Publish without rules/legal/closing date rejected
    c = requests.post(f'{API}/admin/signup-challenge/challenges', headers=h, timeout=20,
                      json={'title': 'TEST_ no rules', 'game_id': 'number_sequence'}).json()
    pub = requests.post(f"{API}/admin/signup-challenge/challenges/{c['challenge_id']}/status", json={'status': 'published'}, headers=h, timeout=20)
    assert pub.status_code == 400
    unsup = requests.post(f'{API}/admin/signup-challenge/challenges', headers=h, timeout=20, json={'title': 'TEST_ bad', 'game_id': 'memory_match'})
    assert unsup.status_code == 400
    requests.post(f"{API}/admin/signup-challenge/challenges/{c['challenge_id']}/status", json={'status': 'archived'}, headers=h, timeout=20)
