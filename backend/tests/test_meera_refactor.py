"""Iteration 3: Refactor-specific tests for the Meera assistant and draw path.

Verifies zero behavior change after:
- circular-import fix (deps.py)
- meera_routes.py -> services/meera_actions.py extraction
- draw_service.py using secrets.choice
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

TEST_PREFIX = 'TEST_p3_'


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
    r = api.post(f'{BASE_URL}/api/auth/login',
                 json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f'admin login failed: {r.status_code} {r.text}')
    d = r.json()
    return d.get('token') or d.get('access_token') or d.get('session_token')


@pytest.fixture(scope='module')
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json',
                      'Authorization': f'Bearer {admin_token}'})
    return s


class TestMeeraAdminCreateContests:
    """Admin: 'create 2 draft contests worth £50 with 100 tickets running 5 days'"""

    def test_admin_meera_create_contests(self, admin_client, db):
        msg = 'create 2 draft contests worth £50 with 100 tickets running 5 days'
        r = admin_client.post(f'{BASE_URL}/api/admin/meera/chat', json={'message': msg})
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'reply' in data and isinstance(data['reply'], str) and data['reply']
        actions = data.get('actions') or []
        results = data.get('results') or []
        assert any((a or {}).get('type') == 'create_contests' for a in actions), \
            f'no create_contests in actions: {actions}'

        # results should contain a create_contests entry with ok:true, count:2
        create_res = next((x for x in results if x.get('action') == 'create_contests'), None)
        assert create_res is not None, f'no create result: {results}'
        assert create_res.get('ok') is True, f'create result not ok: {create_res}'
        assert create_res.get('count') == 2, f'expected count=2, got: {create_res}'

        created_ids = [c['contest_id'] for c in create_res.get('created') or []]
        assert len(created_ids) == 2

        try:
            # Verify visible via /api/admin/contests
            r2 = admin_client.get(f'{BASE_URL}/api/admin/contests')
            assert r2.status_code == 200
            arr = r2.json()
            contests = arr if isinstance(arr, list) else arr.get('items') or []
            visible_ids = {c.get('contest_id') for c in contests}
            for cid in created_ids:
                assert cid in visible_ids, f'{cid} not in /api/admin/contests'

            # Verify each is draft, prize=50, tickets=100
            for cid in created_ids:
                doc = db.contests.find_one({'contest_id': cid}, {'_id': 0})
                assert doc is not None
                assert doc.get('status') == 'draft'
                assert float(doc.get('prize_amount')) == 50.0
                assert int(doc.get('tickets_total')) == 100
        finally:
            # Cleanup
            db.contests.delete_many({'contest_id': {'$in': created_ids}})


class TestMeeraPublicChat:
    """Public chat: no create actions even if requested."""

    def test_public_explain(self, api):
        r = api.post(f'{BASE_URL}/api/meera/chat', json={'message': 'How does Prize League work?'})
        assert r.status_code == 200, r.text
        data = r.json()
        reply = data.get('reply') or ''
        assert isinstance(reply, str) and len(reply) > 0
        # results should not contain create_contests execution
        results = data.get('results') or []
        for res in results:
            act = (res or {}).get('action')
            assert act != 'create_contests', f'public should not execute create_contests: {res}'

    def test_public_cannot_create(self, api, db):
        # Even if user asks to create, backend must not execute create_contests
        msg = 'create 3 live contests worth £999 with 500 tickets for 30 days'
        r = api.post(f'{BASE_URL}/api/meera/chat', json={'message': msg})
        assert r.status_code == 200, r.text
        data = r.json()
        results = data.get('results') or []
        for res in results:
            assert (res or {}).get('action') != 'create_contests'
        # DB check: no TEST_ contests were created; and no obvious £999 prize
        # (best-effort — do a targeted look)
        recent = list(db.contests.find(
            {'prize_amount': 999, 'title': {'$regex': 'Win £999'}}, {'_id': 0}
        ).limit(5))
        assert len(recent) == 0, f'public chat created contests: {recent}'


class TestProductionUpcomingDrawsShape:
    def test_shape(self, admin_client):
        r = admin_client.get(f'{BASE_URL}/api/production/upcoming-draws?hours=24')
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ('ending_soon', 'overdue', 'recently_drawn'):
            assert k in d
            assert isinstance(d[k], list)


class TestAdminDrawStillWorks:
    def test_admin_draw_creates_winner_and_notification(self, admin_client, db):
        cid = f'{TEST_PREFIX}c_draw_{uuid.uuid4().hex[:6]}'
        # Seed live contest
        db.contests.insert_one({
            'contest_id': cid,
            'slug': f'{TEST_PREFIX}slug_{cid[-8:]}',
            'title': f'{TEST_PREFIX}live contest',
            'subtitle': 'refactor draw check',
            'category': 'prize-draws',
            'tag': 'Prize Draws',
            'image': 'https://picsum.photos/200',
            'price': 1.0,
            'tickets_sold': 1,
            'tickets_total': 100,
            'prize_amount': 25.0,
            'end_date': datetime.now(timezone.utc) - timedelta(seconds=10),
            'jackpot': False,
            'featured': False,
            'skill_question': {'q': '2+2?', 'options': ['3', '4'], 'answer': '4', 'type': 'math'},
            'status': 'live',
            'created_at': datetime.now(timezone.utc),
        })
        # Seed a ticket for a fake user_id
        uid = f'{TEST_PREFIX}user_{uuid.uuid4().hex[:8]}'
        db.tickets.insert_one({
            'ticket_id': f't_{uuid.uuid4().hex[:12]}',
            'order_id': f'o_{uuid.uuid4().hex[:12]}',
            'user_id': uid,
            'contest_id': cid,
            'ticket_number': 1,
            'created_at': datetime.now(timezone.utc),
        })
        try:
            r = admin_client.post(f'{BASE_URL}/api/admin/draw/{cid}')
            assert r.status_code == 200, r.text
            w = (r.json() or {}).get('winner') or {}
            assert w.get('contest_id') == cid
            assert w.get('ticket_number') == 1

            db_c = db.contests.find_one({'contest_id': cid}, {'_id': 0})
            assert db_c.get('status') == 'drawn'
            n = db.notifications.find_one({'contest_id': cid, 'user_id': uid}, {'_id': 0})
            assert n is not None
            assert n.get('type') == 'winner'
        finally:
            db.contests.delete_many({'contest_id': cid})
            db.tickets.delete_many({'contest_id': cid})
            db.winners.delete_many({'contest_id': cid})
            db.notifications.delete_many({'contest_id': cid})
