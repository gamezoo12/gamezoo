"""P2 tests: draw scheduler, in-app notifications, /api/production/* endpoints.

Adds coverage for:
- /api/production/upcoming-draws  (auth + role gating)
- /api/production/draw/{id}       (admin + operator, 400/404 branches)
- /api/admin/draw/{id}            (refactored, still works, creates a notification)
- /api/users/notifications        (list + mark-read)
- Background scheduler (60s tick) auto-draws overdue live contests + creates winner + notification

Uses pymongo (sync driver) for direct DB seed/cleanup — the backend server itself
uses motor asynchronously; there is no client-loop conflict on the test side.
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL')
            or 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

ADMIN_EMAIL = os.environ.get('ADMIN_TEST_EMAIL', 'bachanta8@gmail.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_TEST_PASSWORD', 'Herts@910022')

TEST_PREFIX = 'TEST_p2_'


# ---------- Fixtures ----------
@pytest.fixture(scope='module')
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope='module')
def api():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='module')
def admin_token(api):
    r = api.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f'Admin login failed: {r.status_code} {r.text}')
    data = r.json()
    return data.get('token') or data.get('access_token') or data.get('session_token')


@pytest.fixture(scope='module')
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json', 'Authorization': f'Bearer {admin_token}'})
    return s


@pytest.fixture(scope='module')
def player_user(api):
    """Register a fresh test player and return dict {email, token, user_id, name}."""
    email = f'{TEST_PREFIX}player_{uuid.uuid4().hex[:6]}@example.com'
    r = api.post(f'{BASE_URL}/api/auth/register', json={
        'email': email, 'password': 'testpass123', 'name': f'{TEST_PREFIX}Player',
    })
    if r.status_code not in (200, 201):
        pytest.skip(f'Register failed: {r.status_code} {r.text}')
    data = r.json()
    token = data.get('token') or data.get('access_token') or data.get('session_token')
    user = data.get('user') or {}
    return {'email': email, 'token': token, 'user_id': user.get('user_id'), 'name': user.get('name')}


@pytest.fixture(scope='module')
def player_client(player_user):
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json', 'Authorization': f'Bearer {player_user["token"]}'})
    return s


# ---------- Helpers ----------
def _seed_contest(db, contest_id, end_offset_seconds=-30, status='live', tickets_sold=1):
    end_date = datetime.now(timezone.utc) + timedelta(seconds=end_offset_seconds)
    doc = {
        'contest_id': contest_id,
        'slug': f'{TEST_PREFIX}slug_{contest_id[-8:]}',
        'title': f'{TEST_PREFIX}Contest {contest_id[-6:]}',
        'subtitle': 'Auto-draw scheduler test',
        'category': 'prize-draws',
        'tag': 'Prize Draws',
        'image': 'https://picsum.photos/200',
        'price': 1.0,
        'tickets_sold': tickets_sold,
        'tickets_total': 100,
        'prize_amount': 25.0,
        'end_date': end_date,
        'jackpot': False,
        'featured': False,
        'skill_question': {'q': '2+2?', 'options': ['3', '4'], 'answer': '4', 'type': 'math'},
        'status': status,
        'created_at': datetime.now(timezone.utc),
    }
    db.contests.insert_one(doc)
    return doc


def _seed_ticket(db, contest_id, user_id, ticket_number=1):
    t = {
        'ticket_id': f't_{uuid.uuid4().hex[:12]}',
        'order_id': f'o_{uuid.uuid4().hex[:12]}',
        'user_id': user_id,
        'contest_id': contest_id,
        'ticket_number': ticket_number,
        'created_at': datetime.now(timezone.utc),
    }
    db.tickets.insert_one(t)
    return t


def _cleanup(db, contest_ids=(), user_ids=()):
    if contest_ids:
        cids = list(contest_ids)
        db.contests.delete_many({'contest_id': {'$in': cids}})
        db.tickets.delete_many({'contest_id': {'$in': cids}})
        db.winners.delete_many({'contest_id': {'$in': cids}})
        db.notifications.delete_many({'contest_id': {'$in': cids}})
    if user_ids:
        db.notifications.delete_many({'user_id': {'$in': list(user_ids)}})


# =====================================================================
# 1. /api/production/upcoming-draws
# =====================================================================
class TestUpcomingDraws:
    def test_unauth_returns_401(self, api):
        r = api.get(f'{BASE_URL}/api/production/upcoming-draws')
        assert r.status_code in (401, 403), r.text

    def test_non_staff_returns_403(self, player_client):
        r = player_client.get(f'{BASE_URL}/api/production/upcoming-draws')
        assert r.status_code == 403, r.text

    def test_admin_returns_payload_shape(self, admin_client):
        r = admin_client.get(f'{BASE_URL}/api/production/upcoming-draws?hours=48')
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ('ending_soon', 'overdue', 'recently_drawn'):
            assert key in data, f'missing key {key}'
            assert isinstance(data[key], list)


# =====================================================================
# 2. /api/production/draw/{contest_id}
# =====================================================================
class TestProductionDraw:
    def test_404_missing_contest(self, admin_client):
        r = admin_client.post(f'{BASE_URL}/api/production/draw/does_not_exist_xyz')
        assert r.status_code == 404, r.text

    def test_400_no_tickets(self, admin_client, db):
        cid = f'{TEST_PREFIX}c_notickets_{uuid.uuid4().hex[:6]}'
        _seed_contest(db, cid, end_offset_seconds=-10, tickets_sold=0)
        try:
            r = admin_client.post(f'{BASE_URL}/api/production/draw/{cid}')
            assert r.status_code == 400, r.text
        finally:
            _cleanup(db, contest_ids=[cid])

    def test_success_and_notification(self, admin_client, db, player_user):
        cid = f'{TEST_PREFIX}c_ok_{uuid.uuid4().hex[:6]}'
        _seed_contest(db, cid, end_offset_seconds=-10)
        _seed_ticket(db, cid, player_user['user_id'], ticket_number=42)
        try:
            r = admin_client.post(f'{BASE_URL}/api/production/draw/{cid}')
            assert r.status_code == 200, r.text
            w = r.json().get('winner') or {}
            assert w.get('contest_id') == cid
            assert w.get('user_id') == player_user['user_id']
            assert w.get('ticket_number') == 42

            c = db.contests.find_one({'contest_id': cid}, {'_id': 0})
            assert c.get('status') == 'drawn'

            n = db.notifications.find_one({'contest_id': cid, 'user_id': player_user['user_id']}, {'_id': 0})
            assert n is not None, 'winner notification missing'
            assert n.get('type') == 'winner'
            assert n.get('read') is False

            # Second call should 400 (already drawn)
            r2 = admin_client.post(f'{BASE_URL}/api/production/draw/{cid}')
            assert r2.status_code == 400, r2.text
        finally:
            _cleanup(db, contest_ids=[cid])

    def test_non_staff_forbidden(self, player_client, db):
        cid = f'{TEST_PREFIX}c_forbidden_{uuid.uuid4().hex[:6]}'
        _seed_contest(db, cid, end_offset_seconds=-10)
        try:
            r = player_client.post(f'{BASE_URL}/api/production/draw/{cid}')
            assert r.status_code == 403, r.text
        finally:
            _cleanup(db, contest_ids=[cid])


# =====================================================================
# 3. /api/admin/draw/{contest_id} still works + creates notification
# =====================================================================
class TestAdminDrawNotification:
    def test_admin_draw_creates_notification(self, admin_client, db, player_user):
        cid = f'{TEST_PREFIX}c_admindraw_{uuid.uuid4().hex[:6]}'
        _seed_contest(db, cid, end_offset_seconds=-10)
        _seed_ticket(db, cid, player_user['user_id'], ticket_number=7)
        try:
            r = admin_client.post(f'{BASE_URL}/api/admin/draw/{cid}')
            assert r.status_code == 200, r.text
            w = r.json().get('winner') or {}
            assert w.get('contest_id') == cid
            n = db.notifications.find_one({'contest_id': cid, 'user_id': player_user['user_id']}, {'_id': 0})
            assert n is not None
            assert n.get('type') == 'winner'
        finally:
            _cleanup(db, contest_ids=[cid])


# =====================================================================
# 4. Player notifications endpoints
# =====================================================================
class TestPlayerNotifications:
    def test_unauth_returns_401(self, api):
        r = api.get(f'{BASE_URL}/api/users/notifications')
        assert r.status_code in (401, 403)

    def test_list_and_mark_read(self, player_client, db, player_user):
        cid = f'{TEST_PREFIX}c_notif_{uuid.uuid4().hex[:6]}'
        for i in range(2):
            db.notifications.insert_one({
                'notification_id': f'n_{uuid.uuid4().hex[:12]}',
                'user_id': player_user['user_id'],
                'type': 'winner',
                'title': f'{TEST_PREFIX}notif {i}',
                'body': 'body',
                'contest_id': cid,
                'read': False,
                'created_at': datetime.now(timezone.utc),
            })
        try:
            r = player_client.get(f'{BASE_URL}/api/users/notifications')
            assert r.status_code == 200, r.text
            data = r.json()
            assert 'notifications' in data and 'unread' in data
            assert data['unread'] >= 2
            titles = [n.get('title') for n in data['notifications']]
            assert any(TEST_PREFIX in (t or '') for t in titles)

            r2 = player_client.post(f'{BASE_URL}/api/users/notifications/mark-read')
            assert r2.status_code == 200, r2.text
            assert r2.json().get('ok') is True

            r3 = player_client.get(f'{BASE_URL}/api/users/notifications')
            assert r3.status_code == 200
            assert r3.json().get('unread') == 0
        finally:
            _cleanup(db, contest_ids=[cid], user_ids=[player_user['user_id']])


# =====================================================================
# 5. Background scheduler: seed overdue contest -> wait -> assert drawn
# =====================================================================
class TestSchedulerAutoDraw:
    def test_scheduler_draws_overdue_contest(self, db, player_user):
        cid = f'{TEST_PREFIX}c_sched_{uuid.uuid4().hex[:6]}'
        _seed_contest(db, cid, end_offset_seconds=-30)
        _seed_ticket(db, cid, player_user['user_id'], ticket_number=99)
        try:
            drawn = False
            # Poll up to ~90s for the 60s scheduler tick
            for _ in range(18):
                time.sleep(5)
                c = db.contests.find_one({'contest_id': cid}, {'_id': 0})
                if c and c.get('status') == 'drawn':
                    drawn = True
                    break
            assert drawn, 'Scheduler did not draw the contest within 90s'

            w = db.winners.find_one({'contest_id': cid}, {'_id': 0})
            assert w is not None
            assert w.get('user_id') == player_user['user_id']
            assert w.get('ticket_number') == 99

            n = db.notifications.find_one({'contest_id': cid, 'user_id': player_user['user_id']}, {'_id': 0})
            assert n is not None
            assert n.get('type') == 'winner'
            assert n.get('read') is False
        finally:
            _cleanup(db, contest_ids=[cid])
