"""Live acquisition analytics checks (dev server + dev Mongo). Seeds throw-away data and removes it."""
import json
import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f'{BASE}/api'
MONGO = os.environ['MONGO_URL'] + '/' + os.environ['DB_NAME']
RUN = uuid.uuid4().hex[:8]
CAMPAIGN = f'itest_{RUN}'
UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Mobile/15E148'


def mongo(js):
    return subprocess.check_output(['mongosh', '--quiet', MONGO, '--eval', js], text=True)


def seed_user(name, role='user', created='new Date()', complete=True):
    uid = f'an_{RUN}_{name}'
    verified = str(complete).lower()
    completed_fields = 'terms_accepted_at:new Date(),phone_verified_at:new Date(),' if complete else ''
    mongo(f'''db.users.insertOne({{user_id:"{uid}",email:"{uid}@example.com",name:"{name}",role:"{role}",method:"email",
      phone_verified:{verified},{completed_fields}created_at:{created}}});
      db.user_sessions.insertOne({{session_token:"tok_{uid}",user_id:"{uid}",expires_at:new Date(Date.now()+86400000)}});''')
    return uid, {'Authorization': f'Bearer tok_{uid}'}


@pytest.fixture(scope='module')
def world():
    users = {'admin': seed_user('admin', 'admin'), 'player': seed_user('player')}
    yield users
    ids = [u[0] for u in users.values()]
    client = MongoClient(os.environ['MONGO_URL'])
    try:
        db = client[os.environ['DB_NAME']]
        for collection in ('users', 'user_sessions', 'acquisition_attributions', 'staff_activity_log', 'staff_role_history'):
            db[collection].delete_many({'user_id': {'$in': ids}})
        db.acquisition_page_views.delete_many({'campaign': CAMPAIGN})
        db.acquisition_sessions.delete_many({'campaign': CAMPAIGN})
        db.acquisition_events.delete_many({'$or': [
            {'visitor_id': {'$regex': f'^v_{RUN}'}}, {'user_id': {'$in': ids}},
        ]})
        db.acquisition_visitors.delete_many({'visitor_id': {'$regex': f'^v_{RUN}'}})
        db.acquisition_visits.delete_many({'visitor_id': {'$regex': f'^v_{RUN}'}})
    finally:
        client.close()


def view(visitor, session, path, prev='', headers=None, first=False, view_id=None, variant=''):
    body = {'visitor_id': visitor, 'session_id': session, 'view_id': view_id or f'pv_{uuid.uuid4().hex}',
            'page_path': path, 'prev_path': prev, 'variant': variant}
    if first:
        body.update(referrer='https://l.instagram.com/', utm_source='instagram', utm_medium='social', utm_campaign=CAMPAIGN)
    h = {'User-Agent': UA_MOBILE, **(headers or {})}
    r = requests.post(f'{API}/acquisition/page-view', json=body, headers=h, timeout=20)
    assert r.status_code == 200, r.text
    return body, r.json()


def report(admin, name, **extra):
    r = requests.get(f'{API}/admin/acquisition/analytics/{name}', params={'range': 'today', 'campaign': CAMPAIGN, **extra},
                     headers=admin[1], timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_instagram_journey_is_tracked_across_pages(world):
    v, s = f'v_{RUN}_a', f's_{RUN}_aaaa'
    view(v, s, '/choose-world', first=True)
    view(v, s, '/world', prev='/choose-world')
    view(v, s, '/paid-leagues', prev='/world')
    view(v, s, '/challenge', prev='/paid-leagues')
    o = report(world['admin'], 'overview')['metrics']
    assert (o['total_page_views'], o['total_sessions'], o['unique_visitors']) == (4, 1, 1)
    assert o['pages_per_session'] == 4.0 and o['bounce_rate'] == 0.0
    src = report(world['admin'], 'sources')['rows']
    assert src[0]['source'] == 'instagram' and src[0]['sessions'] == 1 and src[0]['medium'] == 'social'
    pages = {p['page']: p for p in report(world['admin'], 'pages')['rows']}
    assert pages['/choose-world']['entrances'] == 1 and pages['/challenge']['exits'] == 0
    assert pages['/world']['previous_page'] == '/choose-world' and pages['/world']['next_page'] == '/paid-leagues'
    assert pages['/world']['devices'] == {'mobile': 1}
    mongo(f'db.acquisition_sessions.updateOne({{session_id:"{s}"}},{{$set:{{last_seen_at:new Date(Date.now()-31*60*1000)}}}})')
    idle_pages = {p['page']: p for p in report(world['admin'], 'pages')['rows']}
    assert idle_pages['/challenge']['exits'] == 1
    journey = report(world['admin'], 'journeys')['rows'][0]['journey']
    assert journey == 'Instagram \u2192 World Selection \u2192 Free World \u2192 Paid World \u2192 Special / Impossible Challenges'


def test_rerenders_with_the_same_view_id_are_not_double_counted(world):
    v, s = f'v_{RUN}_b', f's_{RUN}_bbbb'
    body, _ = view(v, s, '/competitions', first=True)
    for _ in range(3):
        view(v, s, '/competitions', view_id=body['view_id'])
    o = report(world['admin'], 'overview')['metrics']
    assert o['total_page_views'] == 5  # 4 from the journey test + exactly 1 here
    assert o['bounce_rate'] is not None


def test_engagement_only_increases_and_feeds_the_session_average(world):
    v, s = f'v_{RUN}_c', f's_{RUN}_cccc'
    body, _ = view(v, s, '/leaderboard', first=True)
    for ms in (4000, 25000, 25000, 9000):
        assert requests.post(f'{API}/acquisition/engagement', json={'view_id': body['view_id'], 'engaged_ms': ms}, timeout=20).status_code == 200
    mine = requests.get(f'{API}/admin/acquisition/analytics/pages', params={'range': 'today', 'campaign': CAMPAIGN, 'page': 'leaderboards'},
                        headers=world['admin'][1], timeout=30).json()['rows'][0]
    assert mine['avg_engagement_seconds'] == 25.0


def test_staff_traffic_is_logged_separately_and_not_counted(world):
    before = report(world['admin'], 'overview')['metrics']['total_page_views']
    staff_before = int(mongo(f'db.staff_activity_log.countDocuments({{user_id:"{world["admin"][0]}"}})').strip())
    body, result = view(f'v_{RUN}_d', f's_{RUN}_dddd', '/world', first=True, headers=world['admin'][1])
    assert result['recorded'] is False
    assert report(world['admin'], 'overview')['metrics']['total_page_views'] == before
    assert int(mongo(f'db.staff_activity_log.countDocuments({{user_id:"{world["admin"][0]}"}})').strip()) == staff_before + 1
    assert requests.post(f'{API}/acquisition/attribute', json={'visitor_id': f'v_{RUN}_d'}, headers=world['admin'][1], timeout=20).json()['reason'] == 'internal_account'


def test_role_history_keeps_public_visits_before_and_between_staff_intervals(world):
    admin_id, admin_headers = seed_user('role_interval_admin', role='admin')
    now = datetime.now(timezone.utc)
    role_start, role_end, role_again = now - timedelta(hours=1), now - timedelta(minutes=30), now - timedelta(minutes=10)
    times = [now - timedelta(minutes=75), now - timedelta(minutes=45), now - timedelta(minutes=20), now - timedelta(minutes=5)]
    ids = [f'roleview_{RUN}_{n}' for n in range(4)]
    before = requests.get(f'{API}/admin/acquisition/analytics/overview', params={'range': 'today'},
                          headers=world['admin'][1], timeout=30).json()['metrics']['total_page_views']
    views = ','.join(
        f'{{view_id:"{vid}",visitor_id:"v_{vid}",session_id:"s_{vid}",user_id:"{admin_id}",'
        f'page_path:"/choose-world",page_key:"world_selection",source_key:"direct",device_type:"desktop",'
        f'user_state:"registered",created_at:new Date("{ts.isoformat()}")}}'
        for vid, ts in zip(ids, times)
    )
    # Use the fixture's dedicated DB connection helper while keeping this row set isolated.
    mongo(f'''db.staff_role_history.insertMany([
      {{user_id:"{admin_id}",role:"admin",started_at:new Date("{role_start.isoformat()}"),ended_at:new Date("{role_end.isoformat()}")}},
      {{user_id:"{admin_id}",role:"admin",started_at:new Date("{role_again.isoformat()}"),ended_at:null}}]);
    db.acquisition_page_views.insertMany([{views}]);''')
    try:
        after = requests.get(f'{API}/admin/acquisition/analytics/overview', params={'range': 'today'},
                             headers=world['admin'][1], timeout=30).json()['metrics']['total_page_views']
        assert after - before == 2, (before, after, mongo(
            f'printjson(db.staff_role_history.find({{user_id:"{admin_id}"}},{{_id:0}}).toArray());'
            f'printjson(db.acquisition_page_views.find({{user_id:"{admin_id}"}},{{_id:0,view_id:1,is_staff:1,created_at:1}}).toArray());'))
    finally:
        mongo(f'db.acquisition_page_views.deleteMany({{view_id:{{$in:{json.dumps(ids)}}}}});db.staff_role_history.deleteMany({{user_id:"{admin_id}"}});db.users.deleteOne({{user_id:"{admin_id}"}});db.user_sessions.deleteMany({{user_id:"{admin_id}"}})')


def test_registration_is_attributed_to_the_first_touch_source(world):
    uid, headers = world['player']
    v, s = f'v_{RUN}_registration', f's_{RUN}_registration'
    view(v, s, '/choose-world', first=True)
    view(v, s, '/world', prev='/choose-world')
    view(v, s, '/paid-leagues', prev='/world')
    r = requests.post(f'{API}/acquisition/attribute', json={'visitor_id': v}, headers=headers, timeout=20).json()
    assert r == {'attributed': True, 'source': 'instagram'}
    assert requests.post(f'{API}/acquisition/attribute', json={'visitor_id': v}, headers=headers, timeout=20).json()['reason'] == 'already_attributed'
    o = report(world['admin'], 'overview')['metrics']
    assert o['attributed_registrations'] == 1 and o['total_registrations'] >= 1
    row = report(world['admin'], 'sources')['rows'][0]
    assert row['registrations'] == 1, report(world['admin'], 'sources')['rows']
    steps = {s['key']: s for s in report(world['admin'], 'funnel')['steps']}
    assert steps['registered']['count'] == 1 and steps['free_world']['count'] >= 1 and steps['paid_world']['count'] >= 1
    assert steps['first_game']['count'] == 0  # opening pages is not a game start


def test_paid_game_start_is_validated_and_not_inferred_from_page_views(world):
    uid, headers = seed_user('paid_start_player')
    visitor = f'v_{RUN}_paid_game'
    session = f's_{RUN}_paid_game'
    view(visitor, session, '/games/test-game', first=True)
    ticket_id = f'tkt_{RUN}_analytics'
    mongo(f'''db.tickets.insertOne({{ticket_id:"{ticket_id}",order_id:"test",user_id:"{uid}",contest_id:"test",ticket_number:1}});''')
    try:
        start_id = f'paid_start_{RUN}'
        body = {'ticket_id': ticket_id, 'start_id': start_id}
        one = requests.post(f'{API}/acquisition/game-start', json=body, headers=headers, timeout=20)
        two = requests.post(f'{API}/acquisition/game-start', json=body, headers=headers, timeout=20)
        assert one.status_code == 200 and one.json()['recorded'] is True
        assert two.status_code == 200 and two.json()['recorded'] is True
        assert mongo(f'db.acquisition_events.countDocuments({{dedupe:"paid_game_start:{uid}:{start_id}"}})').strip() == '1'
        unauthorised = requests.post(f'{API}/acquisition/game-start', json={'ticket_id': 'not-owned', 'start_id': f'bad_{RUN}'},
                                     headers=headers, timeout=20)
        assert unauthorised.status_code == 404
        # The page open itself did not create a game start. The explicit server-validated event did.
        activity = requests.post(f'{API}/acquisition/attribute', json={'visitor_id': visitor, 'session_id': session},
                                 headers=headers, timeout=20).json()
        assert activity['attributed'] is True
        rows = report(world['admin'], 'sources')['rows']
        row = next(x for x in rows if x['campaign'] == CAMPAIGN and x['landing_page'] == 'Games')
        assert row['game_starts'] == 1
    finally:
        mongo(f'db.tickets.deleteMany({{ticket_id:"{ticket_id}"}});')
        mongo(f'db.acquisition_attributions.deleteMany({{user_id:"{uid}"}});db.user_sessions.deleteMany({{user_id:"{uid}"}});db.users.deleteOne({{user_id:"{uid}"}});')


def test_old_accounts_cannot_be_attributed_as_registrations(world):
    uid, headers = seed_user('oldtimer', created='new Date("2026-01-01T00:00:00Z")')
    try:
        r = requests.post(f'{API}/acquisition/attribute', json={'visitor_id': f'v_{RUN}_a'}, headers=headers, timeout=20).json()
        assert r['attributed'] is False and r['reason'] == 'not_a_new_registration'
    finally:
        mongo(f'db.users.deleteOne({{user_id:"{uid}"}});db.user_sessions.deleteMany({{user_id:"{uid}"}})')


def test_unverified_google_onboarding_is_not_counted_as_complete_registration(world):
    uid, headers = seed_user('incomplete_google', complete=False)
    visitor = f'v_{RUN}_incomplete'
    session = f's_{RUN}_incomplete'
    view(visitor, session, '/choose-world', first=True)
    try:
        r = requests.post(f'{API}/acquisition/attribute', json={'visitor_id': visitor, 'session_id': session},
                          headers=headers, timeout=20).json()
        assert r == {'attributed': False, 'reason': 'registration_incomplete'}
    finally:
        mongo(f'db.users.deleteOne({{user_id:"{uid}"}});db.user_sessions.deleteMany({{user_id:"{uid}"}})')


def test_reports_require_admin_and_csv_export_is_safe(world):
    assert requests.get(f'{API}/admin/acquisition/analytics/overview', timeout=20).status_code == 401
    assert requests.get(f'{API}/admin/acquisition/analytics/overview', headers=world['player'][1], timeout=20).status_code == 403
    r = requests.get(f'{API}/admin/acquisition/analytics/export', params={'report': 'sources', 'range': 'today', 'campaign': CAMPAIGN},
                     headers=world['admin'][1], timeout=30)
    assert r.status_code == 200 and r.headers['content-type'].startswith('text/csv')
    assert 'Europe/London' in r.text.splitlines()[0] and 'Instagram' in r.text
    assert requests.get(f'{API}/admin/acquisition/analytics/export', params={'report': 'nope'}, headers=world['admin'][1], timeout=20).status_code == 400


def test_impressions_are_reported_as_not_connected(world):
    imp = report(world['admin'], 'overview')['impressions']
    assert imp['status'] == 'not_connected' and set(imp['platforms'].values()) == {'not_connected'}


def test_custom_range_filters_by_device_and_page(world):
    ok = report(world['admin'], 'overview', device='mobile')['metrics']
    none = report(world['admin'], 'overview', device='desktop')['metrics']
    assert ok['total_page_views'] > 0 and none['total_page_views'] == 0
    custom = requests.get(f'{API}/admin/acquisition/analytics/overview', params={
        'range': 'custom', 'start': '2020-01-01', 'end': '2020-01-02', 'campaign': CAMPAIGN}, headers=world['admin'][1], timeout=30).json()
    assert custom['metrics']['total_page_views'] == 0
    page_only = report(world['admin'], 'overview', page='free_world')['metrics']
    assert page_only['total_page_views'] == 2
