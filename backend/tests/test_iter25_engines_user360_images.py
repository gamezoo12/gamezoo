"""
Iteration 25 backend regression:
  1) Engine 2 — Random Draw (locks, draw, redraw guards, publish, list, report)
  2) Engine 3 — Instant Win (lock, commit, encryption, reveal + idempotency)
  3) User 360 aggregate + suspend / erase RBAC
  4) Contest image processor (5 variants, no EXIF, 415 for non-image)
"""
import os
import io
import json
import uuid
import time
import hashlib
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient
from PIL import Image

def _load_react_env():
    v = os.environ.get('REACT_APP_BACKEND_URL')
    if v:
        return v
    try:
        for line in open('/app/frontend/.env'):
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    raise RuntimeError('REACT_APP_BACKEND_URL missing')

BASE_URL = _load_react_env().rstrip('/')
MONGO_URL = 'mongodb://localhost:27017'
DB_NAME = 'test_database'

SUPER_ADMIN_EMAIL = 'bachanta8@gmail.com'
SUPER_ADMIN_PASSWORD = 'Herts@910022'

# --- mongo helpers --------------------------------------------------
_mc = MongoClient(MONGO_URL)
db = _mc[DB_NAME]


# --- shared session / token ---------------------------------------
@pytest.fixture(scope='session')
def super_token():
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': SUPER_ADMIN_EMAIL, 'password': SUPER_ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f'super admin login failed: {r.status_code} {r.text}'
    return r.json()['token']


@pytest.fixture(scope='session')
def super_client(super_token):
    s = requests.Session()
    s.headers.update({'Authorization': f'Bearer {super_token}', 'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='session', autouse=True)
def restore_flags_at_end(super_client):
    """Guarantee company flags off + c_fd360e20adad engine_type restored."""
    yield
    try:
        super_client.put(f'{BASE_URL}/api/admin/company',
                         json={'random_draw_engine_enabled': False,
                               'instant_win_engine_enabled': False}, timeout=15)
    except Exception:
        pass
    try:
        super_client.put(f'{BASE_URL}/api/admin/contests/c_fd360e20adad',
                         json={'engine_type': 'leaderboard'}, timeout=15)
    except Exception:
        pass


def _create_contest(super_client, engine_type: str, title: str) -> str:
    payload = {
        'title': title,
        'category': 'prize-draws',
        'price': 1,
        'tickets_total': 150,
        'prize_amount': 100,
        'skill_question': {'q': 'What is 2+2?', 'options': ['3', '4', '5'], 'answer': '4', 'type': 'trivia'},
        'status': 'draft',
    }
    r = super_client.post(f'{BASE_URL}/api/admin/contests', json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    contest = r.json()['contest']
    cid = contest['contest_id']
    # set engine_type via PUT
    r2 = super_client.put(f'{BASE_URL}/api/admin/contests/{cid}',
                          json={'engine_type': engine_type}, timeout=15)
    assert r2.status_code == 200, r2.text
    return cid


# =====================================================================
# ENGINE 2 — Random Draw
# =====================================================================
class TestRandomDraw:
    contest_id: str = ''

    def test_00_setup_create_contest(self, super_client):
        # ensure flag is OFF at start
        super_client.put(f'{BASE_URL}/api/admin/company',
                         json={'random_draw_engine_enabled': False}, timeout=15)
        cid = _create_contest(super_client, 'random_draw', 'TEST_RandomDraw_iter25')
        TestRandomDraw.contest_id = cid
        assert cid.startswith('c_')

    def test_01_locked_when_flag_off(self, super_client):
        cid = TestRandomDraw.contest_id
        r = super_client.post(f'{BASE_URL}/api/admin/engines/random-draw/{cid}',
                              json={'num_winners': 5}, timeout=15)
        assert r.status_code == 423, f'expected 423 got {r.status_code}: {r.text}'

    def test_02_enable_flag_then_400_no_tickets(self, super_client):
        r = super_client.put(f'{BASE_URL}/api/admin/company',
                             json={'random_draw_engine_enabled': True}, timeout=15)
        assert r.status_code == 200, r.text
        # clear any leftover tickets
        db.tickets.delete_many({'contest_id': TestRandomDraw.contest_id})
        r = super_client.post(f'{BASE_URL}/api/admin/engines/random-draw/{TestRandomDraw.contest_id}',
                              json={'num_winners': 5}, timeout=15)
        assert r.status_code == 400
        assert '0 eligible' in r.text or 'cannot pick' in r.text

    def test_03_wrong_engine_type_400(self, super_client):
        # c_fd360e20adad is 'leaderboard'
        r = super_client.post(f'{BASE_URL}/api/admin/engines/random-draw/c_fd360e20adad',
                              json={'num_winners': 1}, timeout=15)
        assert r.status_code == 400
        assert 'random_draw' in r.text

    def test_04_happy_path_5_of_20(self, super_client):
        cid = TestRandomDraw.contest_id
        # insert 20 synthetic tickets
        docs = [{'ticket_number': i, 'contest_id': cid, 'user_id': f'test_user_{i}',
                 'refunded': False, 'disqualified': False} for i in range(1, 21)]
        db.tickets.insert_many(docs)
        r = super_client.post(f'{BASE_URL}/api/admin/engines/random-draw/{cid}',
                              json={'num_winners': 5}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()['draw']
        assert d['algorithm_version'] == 'secrets.SystemRandom.sample-v1'
        assert len(d['winning_ticket_numbers']) == 5
        assert d['winning_ticket_numbers'] == sorted(set(d['winning_ticket_numbers']))
        assert d['pool_hash_sha256'] and len(d['pool_hash_sha256']) == 64
        assert d['operator_admin_email'] == SUPER_ADMIN_EMAIL
        assert d['confirmed'] is False
        # audit_log entry
        audit = db.audit_log.find_one({'draw_id': d['draw_id'], 'kind': 'contest_random_draw'})
        assert audit is not None
        TestRandomDraw.draw_id = d['draw_id']

    def test_05_redraw_no_reason_409(self, super_client):
        r = super_client.post(
            f'{BASE_URL}/api/admin/engines/random-draw/{TestRandomDraw.contest_id}',
            json={'num_winners': 5}, timeout=15)
        assert r.status_code == 409
        assert 'reason' in r.text.lower()

    def test_06_redraw_no_approver_409(self, super_client):
        r = super_client.post(
            f'{BASE_URL}/api/admin/engines/random-draw/{TestRandomDraw.contest_id}',
            json={'num_winners': 5, 'reason': 'audit test'}, timeout=15)
        assert r.status_code == 409
        assert 'approver' in r.text.lower()

    def test_07_redraw_with_second_super_admin(self, super_client):
        # Create a second super admin directly in DB
        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
        u_id = f'user_test_super_{uuid.uuid4().hex[:8]}'
        temp_email = f'temp_super_{uuid.uuid4().hex[:6]}@test.com'
        db.users.insert_one({
            'user_id': u_id, 'email': temp_email, 'name': 'Temp Super',
            'role': 'super_admin', 'password_hash': pwd_ctx.hash('X'),
            'public_id': f'PL_TEST_{uuid.uuid4().hex[:6]}',
        })
        try:
            r = super_client.post(
                f'{BASE_URL}/api/admin/engines/random-draw/{TestRandomDraw.contest_id}',
                json={'num_winners': 5, 'reason': 'audit test', 'approver_admin_email': temp_email},
                timeout=15)
            assert r.status_code == 200, r.text
            d = r.json()['draw']
            assert d['is_redraw'] is True
            assert d['approver_admin_email'] == temp_email
            TestRandomDraw.redraw_id = d['draw_id']
        finally:
            db.users.delete_one({'user_id': u_id})

    def test_08_confirm_publish(self, super_client):
        cid = TestRandomDraw.contest_id
        draw_id = TestRandomDraw.redraw_id
        r = super_client.post(
            f'{BASE_URL}/api/admin/engines/random-draw/{cid}/confirm/{draw_id}', timeout=15)
        assert r.status_code == 200, r.text
        contest = db.contests.find_one({'contest_id': cid})
        assert contest.get('winner_published') is True
        assert contest.get('status') == 'drawn'
        assert isinstance(contest.get('winning_ticket_numbers'), list)

    def test_09_list_and_report(self, super_client):
        cid = TestRandomDraw.contest_id
        r = super_client.get(f'{BASE_URL}/api/admin/engines/random-draw/{cid}', timeout=15)
        assert r.status_code == 200
        assert len(r.json()['draws']) >= 2
        r2 = super_client.get(
            f'{BASE_URL}/api/admin/engines/random-draw/{cid}/report/{TestRandomDraw.redraw_id}',
            timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        assert body['draw_id'] == TestRandomDraw.redraw_id

    def test_99_cleanup(self, super_client):
        cid = TestRandomDraw.contest_id
        db.tickets.delete_many({'contest_id': cid})
        db.contest_draws.delete_many({'contest_id': cid})
        db.audit_log.delete_many({'contest_id': cid})
        db.contests.delete_one({'contest_id': cid})
        # Restore feature flag to safe default (must remain OFF pending legal review).
        super_client.put(f'{BASE_URL}/api/admin/company',
                         json={'random_draw_engine_enabled': False}, timeout=15)


# =====================================================================
# ENGINE 3 — Instant Win
# =====================================================================
class TestInstantWin:
    contest_id: str = ''
    ticket_number: int = 7

    def test_00_setup_flag_off_and_contest(self, super_client):
        super_client.put(f'{BASE_URL}/api/admin/company',
                         json={'instant_win_engine_enabled': False}, timeout=15)
        cid = _create_contest(super_client, 'instant_win', 'TEST_InstantWin_iter25')
        TestInstantWin.contest_id = cid

    def test_01_commit_locked_when_flag_off(self, super_client):
        cid = TestInstantWin.contest_id
        r = super_client.post(f'{BASE_URL}/api/admin/engines/instant-win/{cid}/commit',
                              json={'prizes': [{'ticket_number': 7, 'rank': 1, 'amount': 50,
                                                 'description': 'Fifty quid'}]}, timeout=15)
        assert r.status_code == 423, r.text

    def test_02_commit_success(self, super_client):
        r = super_client.put(f'{BASE_URL}/api/admin/company',
                             json={'instant_win_engine_enabled': True}, timeout=15)
        assert r.status_code == 200
        cid = TestInstantWin.contest_id
        db.tickets.delete_many({'contest_id': cid})
        prizes = [{'ticket_number': 7, 'rank': 1, 'amount': 50, 'description': 'Fifty quid'}]
        r = super_client.post(f'{BASE_URL}/api/admin/engines/instant-win/{cid}/commit',
                              json={'prizes': prizes}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['config_hash'] and len(body['config_hash']) == 64
        # DB should NOT contain raw prizes
        doc = db.instant_win_configs.find_one({'contest_id': cid})
        assert doc is not None
        assert 'encrypted_map' in doc
        assert 'prizes' not in doc
        # ensure raw ticket_number 7 not visible in serialized doc string form
        as_text = json.dumps({k: str(v) for k, v in doc.items() if k != '_id'})
        assert '"prizes"' not in as_text

    def test_03_commit_again_409(self, super_client):
        cid = TestInstantWin.contest_id
        r = super_client.post(f'{BASE_URL}/api/admin/engines/instant-win/{cid}/commit',
                              json={'prizes': [{'ticket_number': 8, 'rank': 1, 'amount': 25,
                                                 'description': 'Twenty-five'}]}, timeout=15)
        assert r.status_code == 409, r.text

    def test_04_reveal_flow_and_idempotency(self, super_client):
        cid = TestInstantWin.contest_id
        # Insert a fake ticket owned by super admin + a game_score for it
        me = db.users.find_one({'email': SUPER_ADMIN_EMAIL})
        assert me
        uid = me['user_id']
        db.tickets.insert_one({'contest_id': cid, 'ticket_number': 7, 'user_id': uid,
                                'refunded': False, 'disqualified': False})
        db.game_scores.insert_one({'contest_id': cid, 'user_id': uid, 'ticket_number': 7,
                                    'score': 100, 'created_at': datetime.now(timezone.utc)})
        r = super_client.post(
            f'{BASE_URL}/api/engines/instant-win/{cid}/reveal?ticket_number=7', timeout=15)
        # Note reveal is under /api/admin — should still work as super_admin is logged in
        assert r.status_code == 200, r.text
        first = r.json()
        assert first['result'] == 'win'
        assert first['prize']['amount'] == 50
        # Idempotent
        r2 = super_client.post(
            f'{BASE_URL}/api/engines/instant-win/{cid}/reveal?ticket_number=7', timeout=15)
        assert r2.status_code == 200
        assert r2.json() == first

    def test_99_cleanup(self, super_client):
        cid = TestInstantWin.contest_id
        db.tickets.delete_many({'contest_id': cid})
        db.game_scores.delete_many({'contest_id': cid})
        db.instant_win_configs.delete_many({'contest_id': cid})
        db.instant_win_reveals.delete_many({'contest_id': cid})
        db.audit_log.delete_many({'contest_id': cid})
        db.contests.delete_one({'contest_id': cid})
        super_client.put(f'{BASE_URL}/api/admin/company',
                         json={'instant_win_engine_enabled': False}, timeout=15)


# =====================================================================
# USER 360
# =====================================================================
class TestUser360:
    target_user_id = 'user_eb071248fabe'

    def test_01_get_360(self, super_client):
        r = super_client.get(
            f'{BASE_URL}/api/admin/users/{TestUser360.target_user_id}/360', timeout=15)
        if r.status_code == 404:
            # fallback: pick any non-super-admin user
            u = db.users.find_one({'role': {'$ne': 'super_admin'}})
            assert u, 'no player users in db'
            TestUser360.target_user_id = u['user_id']
            r = super_client.get(
                f'{BASE_URL}/api/admin/users/{TestUser360.target_user_id}/360', timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ('identity', 'kyc', 'wallet', 'stats', 'orders', 'tickets', 'scores',
                    'wallet_transactions', 'notifications', 'support_cases', 'referrals',
                    'sessions', 'admin_actions'):
            assert key in body, f'missing key {key}'
        assert 'password_hash' not in body['identity']
        stats = body['stats']
        for k in ('orders_count', 'tickets_count', 'scores_count', 'wallet_txs_count',
                  'notifications_count', 'support_cases_count', 'referrals_count'):
            assert k in stats

    def test_02_suspend_wrong_password_403(self, super_client):
        r = super_client.post(
            f'{BASE_URL}/api/admin/users/{TestUser360.target_user_id}/suspend',
            json={'reason': 'test', 'admin_password': 'WRONG_PASSWORD'}, timeout=15)
        assert r.status_code == 403

    def test_03_suspend_then_unsuspend(self, super_client):
        tgt = TestUser360.target_user_id
        r = super_client.post(f'{BASE_URL}/api/admin/users/{tgt}/suspend',
                              json={'reason': 'iter25 audit', 'admin_password': SUPER_ADMIN_PASSWORD},
                              timeout=15)
        assert r.status_code == 200, r.text
        u = db.users.find_one({'user_id': tgt})
        assert u.get('suspended') is True
        # audit_log
        assert db.audit_log.find_one({'kind': 'user_suspend', 'target_user_id': tgt}) is not None
        # unsuspend
        r2 = super_client.post(f'{BASE_URL}/api/admin/users/{tgt}/unsuspend', json={}, timeout=15)
        assert r2.status_code == 200
        u = db.users.find_one({'user_id': tgt})
        assert u.get('suspended') is False
        assert db.audit_log.find_one({'kind': 'user_unsuspend', 'target_user_id': tgt}) is not None

    def test_04_erase_self_400(self, super_client):
        me = db.users.find_one({'email': SUPER_ADMIN_EMAIL})
        r = super_client.post(f'{BASE_URL}/api/admin/users/{me["user_id"]}/erase',
                              json={'reason': 'x', 'admin_password': SUPER_ADMIN_PASSWORD},
                              timeout=15)
        assert r.status_code == 400
        assert 'own' in r.text.lower()

    def test_05_erase_wrong_password_403(self, super_client):
        # create disposable target user
        u_id = f'user_test_erase_{uuid.uuid4().hex[:6]}'
        db.users.insert_one({'user_id': u_id, 'email': f'{u_id}@test.com', 'name': 'Erase me',
                              'role': 'player', 'password_hash': 'x',
                              'public_id': f'PL_TE_{uuid.uuid4().hex[:6]}'})
        try:
            r = super_client.post(f'{BASE_URL}/api/admin/users/{u_id}/erase',
                                  json={'reason': 'x', 'admin_password': 'WRONG'}, timeout=15)
            assert r.status_code == 403
        finally:
            db.users.delete_one({'user_id': u_id})

    def test_06_erase_full_flow(self, super_client):
        u_id = f'user_test_erase_{uuid.uuid4().hex[:6]}'
        email = f'{u_id}@test.com'
        db.users.insert_one({'user_id': u_id, 'email': email, 'name': 'Erase Target',
                              'role': 'player', 'password_hash': 'x',
                              'phone': '+447700900123', 'address': '1 test st', 'dob': '2000-01-01',
                              'public_id': f'PL_TE_{uuid.uuid4().hex[:6]}'})
        db.kyc.insert_one({'user_id': u_id, 'status': 'submitted'})
        db.user_sessions.insert_one({'user_id': u_id, 'session_token': 'tok_test',
                                     'expires_at': datetime.now(timezone.utc)})
        try:
            r = super_client.post(f'{BASE_URL}/api/admin/users/{u_id}/erase',
                                  json={'reason': 'GDPR', 'admin_password': SUPER_ADMIN_PASSWORD},
                                  timeout=15)
            assert r.status_code == 200, r.text
            u = db.users.find_one({'user_id': u_id})
            assert u['name'] == '[ERASED]'
            assert 'erased_' in u['email']
            assert u.get('phone') is None
            assert u.get('erased') is True
            assert db.kyc.find_one({'user_id': u_id}) is None
            assert db.user_sessions.find_one({'user_id': u_id}) is None
            assert db.audit_log.find_one({'kind': 'user_erase', 'target_user_id': u_id}) is not None
        finally:
            db.users.delete_one({'user_id': u_id})
            db.audit_log.delete_many({'target_user_id': u_id})


# =====================================================================
# IMAGE PROCESSOR
# =====================================================================
class TestContestImageProcessor:

    def _make_png(self, w=1200, h=900, color=(120, 200, 90)):
        img = Image.new('RGB', (w, h), color)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return buf.getvalue()

    def test_01_upload_5_variants(self, super_token):
        png = self._make_png()
        files = {'file': ('test.png', png, 'image/png')}
        data = {'focal_x': '0.5', 'focal_y': '0.5', 'alt': 'foo'}
        r = requests.post(f'{BASE_URL}/api/admin/uploads/contest-image', files=files, data=data,
                          headers={'Authorization': f'Bearer {super_token}'}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ('id', 'sizes', 'recommended_image_url', 'recommended_mobile_image_url',
                  'alt', 'focal'):
            assert k in body
        assert body['alt'] == 'foo'
        assert body['focal'] == {'x': 0.5, 'y': 0.5}
        expected_sizes = {'thumb': (300, 200), 'card': (600, 400), 'mobile': (900, 600),
                          'hero': (1600, 900), 'full': (2000, 1500)}
        assert set(body['sizes'].keys()) == set(expected_sizes.keys())
        # HTTP 200 + dimensions + no EXIF for each variant
        for label, url in body['sizes'].items():
            resp = requests.get(url, timeout=20)
            assert resp.status_code == 200, f'{label} {url} -> {resp.status_code}'
            img = Image.open(io.BytesIO(resp.content))
            assert img.size == expected_sizes[label], f'{label} size {img.size}'
            exif = None
            try:
                exif = img._getexif()
            except Exception:
                exif = None
            assert not exif, f'{label} has EXIF data: {exif}'

    def test_02_non_image_415(self, super_token):
        files = {'file': ('bad.txt', b'this is not an image', 'text/plain')}
        r = requests.post(f'{BASE_URL}/api/admin/uploads/contest-image', files=files,
                          data={'focal_x': '0.5', 'focal_y': '0.5'},
                          headers={'Authorization': f'Bearer {super_token}'}, timeout=15)
        assert r.status_code == 415, r.text
