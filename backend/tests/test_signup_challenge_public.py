# Signup (Welcome) Challenge - public URL regression (preview DB, QA seed users only).
# Precondition: `python scripts/seed_signup_challenge_test.py --enable` run beforehand. Consumes sc.uk attempts -> reseed after.
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
PW = 'Player@12345'
CH = 'SC-QA-WELCOME'


def login(email, pw=PW):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={'email': email, 'password': pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope='module')
def admin():
    return login('bachanta8@gmail.com', 'Herts@910022')


@pytest.fixture(scope='module')
def uk():
    return login('sc.uk@example.com')


# RBAC: admin endpoints super admin only
class TestRBAC:
    @pytest.mark.parametrize('path', ['games', 'settings', 'challenges', f'challenges/{CH}/participants', f'challenges/{CH}/analytics', 'audit'])
    def test_non_admin_forbidden(self, path):
        s = login('player1@example.com')
        r = s.get(f"{BASE_URL}/api/admin/signup-challenge/{path}")
        assert r.status_code == 403, r.text

    def test_anon_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/admin/signup-challenge/challenges")
        assert r.status_code in (401, 403)

    def test_non_admin_cannot_toggle(self):
        s = login('player1@example.com')
        r = s.put(f"{BASE_URL}/api/admin/signup-challenge/settings", json={'enabled': False})
        assert r.status_code == 403


# Admin read endpoints
class TestAdmin:
    def test_games_supported_flags(self, admin):
        g = admin.get(f"{BASE_URL}/api/admin/signup-challenge/games").json()['games']
        sup = {x['id'] for x in g if x['supported']}
        assert sup == {'number_sequence', 'colour_match'}
        assert any(not x['supported'] for x in g)

    def test_list_has_qa(self, admin):
        d = admin.get(f"{BASE_URL}/api/admin/signup-challenge/challenges").json()
        assert d['enabled'] is True
        qa = [c for c in d['challenges'] if c['challenge_id'] == CH]
        assert qa and qa[0]['status'] == 'published'

    def test_create_unsupported_game_rejected(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/signup-challenge/challenges", json={'title': 'TEST_bad', 'game_id': 'memory_match'})
        assert r.status_code == 400

    def test_analytics_audit(self, admin):
        a = admin.get(f"{BASE_URL}/api/admin/signup-challenge/challenges/{CH}/analytics")
        assert a.status_code == 200 and 'impressions' in a.json()
        au = admin.get(f"{BASE_URL}/api/admin/signup-challenge/audit", params={'challenge_id': CH})
        assert au.status_code == 200 and isinstance(au.json()['audit'], list)


# Player eligibility
class TestPlayer:
    def test_existing_user_never_sees(self):
        r = login('player1@example.com').get(f"{BASE_URL}/api/signup-challenge/me").json()
        assert r['show'] is False

    def test_intl_demo_only(self):
        s = login('sc.intl@example.com')
        me = s.get(f"{BASE_URL}/api/signup-challenge/me").json()
        assert me['show'] is True and me['can_play_real'] is False and me['real_block_reason']
        r = s.post(f"{BASE_URL}/api/signup-challenge/attempts/start", json={'request_id': 'testintl0001'})
        assert r.status_code == 403

    def test_uk_full_flow_and_snapshot(self, uk, admin):
        me = uk.get(f"{BASE_URL}/api/signup-challenge/me").json()
        assert me['show'] and me['can_play_real'] and me['remaining'] == 3
        prize_before = me['challenge']['prize_label']
        # live edit snapshot
        ch = next(c for c in admin.get(f"{BASE_URL}/api/admin/signup-challenge/challenges").json()['challenges'] if c['challenge_id'] == CH)
        keep = {k: ch[k] for k in ch if k in ('title', 'description', 'prize_type', 'prize_amount_gbp', 'prize_label', 'prize_description', 'game_id',
                                             'game_config', 'attempts_allowed', 'time_limit_s', 'demo_enabled', 'demo_time_limit_s', 'demo_max_runs',
                                             'how_to_play', 'start_at', 'end_at', 'eligible_signups_from', 'uk_only', 'winner_count',
                                             'prize_distribution', 'tie_break', 'whatsapp_url', 'instagram_url', 'share_url', 'background_url',
                                             'scorecard_bg_url', 'rules_text', 'legal_reviewed')}
        try:
            r = admin.put(f"{BASE_URL}/api/admin/signup-challenge/challenges/{CH}", json={**keep, 'attempts_allowed': 5, 'prize_label': 'TEST_PRIZE'})
            assert r.status_code == 200, r.text
            me2 = uk.get(f"{BASE_URL}/api/signup-challenge/me").json()
            assert me2['challenge']['attempts_allowed'] == 3 and me2['challenge']['prize_label'] == prize_before
        finally:
            assert admin.put(f"{BASE_URL}/api/admin/signup-challenge/challenges/{CH}", json=keep).status_code == 200
        # attempt 1: valid full run
        st = uk.post(f"{BASE_URL}/api/signup-challenge/attempts/start", json={'request_id': 'testreq00001'})
        assert st.status_code == 200, st.text
        att = st.json()['attempt']
        assert st.json()['remaining'] == 2
        # idempotent start with same request_id
        again = uk.post(f"{BASE_URL}/api/signup-challenge/attempts/start", json={'request_id': 'testreq00001'}).json()
        assert again['attempt']['attempt_id'] == att['attempt_id']
        n = att['board']['target']
        time.sleep(3 + n * 0.08)
        sub = uk.post(f"{BASE_URL}/api/signup-challenge/attempts/{att['attempt_id']}/submit",
                      json={'taps': list(range(1, n + 1)), 'tap_ms': [80 * (i + 1) for i in range(n)], 'duration_ms': 80 * n + 20, 'finished': True}).json()
        assert sub['attempt']['status'] == 'completed' and sub['attempt']['score'] > n * 100
        assert sub['remaining'] == 2
        # attempt 2: abandoned via /me reload
        st2 = uk.post(f"{BASE_URL}/api/signup-challenge/attempts/start", json={'request_id': 'testreq00002'}).json()
        assert st2['remaining'] == 1
        me3 = uk.get(f"{BASE_URL}/api/signup-challenge/me").json()
        assert me3['remaining'] == 1
        assert [a['status'] for a in me3['attempts']] == ['completed', 'abandoned']
        # attempt 3: tampered sequence -> failed
        st3 = uk.post(f"{BASE_URL}/api/signup-challenge/attempts/start", json={'request_id': 'testreq00003'}).json()
        time.sleep(3.5)
        bad = uk.post(f"{BASE_URL}/api/signup-challenge/attempts/{st3['attempt']['attempt_id']}/submit",
                      json={'taps': [2, 1], 'tap_ms': [100, 200], 'duration_ms': 300, 'finished': False}).json()
        assert bad['attempt']['status'] == 'failed'
        assert bad['remaining'] == 0 and bad['participation']['status'] == 'completed'
        # no 4th attempt
        r4 = uk.post(f"{BASE_URL}/api/signup-challenge/attempts/start", json={'request_id': 'testreq00004'})
        assert r4.status_code == 409
        # admin participants shows provisional rank
        parts = admin.get(f"{BASE_URL}/api/admin/signup-challenge/challenges/{CH}/participants").json()['participants']
        mine = [p for p in parts if p['email'] == 'sc.uk@example.com']
        assert mine and mine[0]['best_score'] == sub['attempt']['score']
        assert all('board' not in a and 'expected' not in a for a in mine[0]['attempts'])
        # final seen -> never shown again
        assert uk.post(f"{BASE_URL}/api/signup-challenge/final-seen").status_code == 200
        assert uk.get(f"{BASE_URL}/api/signup-challenge/me").json()['show'] is False
