"""Live check (dev server + dev Mongo) of Free World admin progress accuracy and edits.

Seeds throw-away `fwadm_*` users and removes everything it created.
"""
import json
import os
import subprocess
import uuid

import pytest
import requests

BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f'{BASE}/api'
MONGO = os.environ["MONGO_URL"] + '/' + os.environ["DB_NAME"]
SEASON = 'season-1'
RUN = uuid.uuid4().hex[:6]
STAGE_START = '2026-10-09T23:00:00Z'  # active Global Contest 3 start in the dev DB


def mongo(js):
    return subprocess.check_output(['mongosh', '--quiet', MONGO, '--eval', js], text=True)


def seed_user(name, role='user', completed=(), cache=None, champion=False):
    uid = f'fwadm_{RUN}_{name}'
    token = f'tok_{uid}'
    cache = list(completed) if cache is None else cache
    ready = len(completed) == 10
    attempts = ','.join(
        f'{{attempt_id:"A{uid}{n}",session_id:"SES{uid}{n}",user_id:"{uid}",season_id:"{SEASON}",champion_stage:3,level:{n},passed:true,'
        f'created_at:new Date("2026-10-10T10:00:00Z"),completed_at:new Date("2026-10-10T10:01:00Z"),duration_ms:{15000 + n}}}'
        for n in completed
    )
    js = f'''
    db.users.insertOne({{user_id:"{uid}",email:"{uid}@example.com",name:"{name}",role:"{role}",method:"email",
      phone_verified:true,created_at:new Date("2026-09-01T00:00:00Z"),free_world_started_global_contest:1}});
    db.user_sessions.insertOne({{session_token:"{token}",user_id:"{uid}",expires_at:new Date(Date.now()+86400000)}});
    db.world_progress.insertOne({{user_id:"{uid}",season_id:"{SEASON}",champion_stage:3,current_level:{min(len(cache) + 1, 10)},
      highest_unlocked_level:{min(len(cache) + 1, 10)},completed_levels:{json.dumps(cache)},champion_ready:{str(ready and len(cache) == 10).lower()},
      token_unlocked_levels:[],skipped_levels:[],season_complete:false,free_world_started_global_contest:1,
      personal_stage_started_at:new Date("{STAGE_START}"),created_at:new Date("2026-10-09T23:00:00Z"),updated_at:new Date()}});
    {f"db.world_level_attempts.insertMany([{attempts}]);" if attempts else ""}
    '''
    if champion:
        js += f'''
        db.world_contest_entries.insertOne({{entry_id:"E{uid}",season_id:"{SEASON}",global_contest_number:3,user_id:"{uid}",
          champion_stage_snapshot:3,status:"entered",entered_at:new Date("2026-10-11T10:00:00Z")}});
        db.world_champion_sessions.insertMany([
          {{session_id:"S1{uid}",season_id:"{SEASON}",global_contest_number:3,user_id:"{uid}",begun_at:new Date()}},
          {{session_id:"S2{uid}",season_id:"{SEASON}",global_contest_number:3,user_id:"{uid}",begun_at:new Date()}}]);
        db.world_champion_scores.insertOne({{score_id:"C{uid}",season_id:"{SEASON}",global_contest_number:3,user_id:"{uid}",
          score:30,duration_ms:33000,eligible:true,champion_stage_snapshot:3,submitted_at:new Date()}});
        '''
    mongo(js)
    return uid, {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='module')
def world():
    ids = {}
    ids['admin'] = seed_user('admin', role='admin')
    ids['support'] = seed_user('support', role='support')
    ids['l1'] = seed_user('l1')
    ids['l9'] = seed_user('l9', completed=range(1, 9))
    ids['l10'] = seed_user('l10', completed=range(1, 11), cache=list(range(1, 10)))  # stale cache: 9
    ids['champ'] = seed_user('champ', completed=range(1, 11), champion=True)
    yield ids
    uids = json.dumps([v[0] for v in ids.values()])
    mongo(f'''const u={uids};
      ["users","user_sessions","world_progress","world_level_attempts","world_game_sessions","world_contest_entries",
       "world_champion_sessions","world_champion_scores","world_progress_audit_log","world_attempt_counters","wallets",
       "world_progress_audit_log"].forEach(c=>db.getCollection(c).deleteMany({{user_id:{{$in:u}}}}));''')


def admin_get(world, uid):
    r = requests.get(f'{API}/admin/world/user-progress/{uid}', headers=world['admin'][1], timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def admin_edit(world, uid, who='admin', **body):
    return requests.post(f'{API}/admin/world/user-progress/{uid}', json=body, headers=world[who][1], timeout=30)


def test_levels_1_9_10_and_champion_are_reported_from_verified_records(world):
    counts = {k: admin_get(world, world[k][0])['progress'] for k in ('l1', 'l9', 'l10', 'champ')}
    assert counts['l1']['completed_count'] == 0 and counts['l1']['champion_ready'] is False
    assert counts['l9']['completed_count'] == 8 and counts['l9']['current_level'] == 9
    # Stored cache says 9 but level 10 is verified: the admin must see 10 and Champion eligibility.
    assert counts['l10']['cached_completed_levels'] == list(range(1, 10))
    assert counts['l10']['completed_count'] == 10 and counts['l10']['champion_ready'] is True
    assert counts['l10']['cache_out_of_date'] is True
    champ = admin_get(world, world['champ'][0])
    assert champ['progress']['completed_count'] == 10
    assert champ['champion']['attempts_total'] == 2 and champ['champion']['scores'][0]['score'] == 30
    assert champ['levels'][9]['passes'] == 1 and champ['levels'][9]['best_ms'] == 15010


def test_list_matches_detail_and_filters_before_pagination(world):
    r = requests.get(f'{API}/admin/world/users', params={'search': f'fwadm_{RUN}', 'completed': 'true', 'page_size': 1},
                     headers=world['admin'][1], timeout=30).json()
    assert r['total'] == 2 and r['total_pages'] == 2 and len(r['items']) == 1
    both = requests.get(f'{API}/admin/world/users', params={'search': f'fwadm_{RUN}', 'completed': 'true', 'page_size': 10},
                        headers=world['admin'][1], timeout=30).json()['items']
    assert {i['user_id'] for i in both} == {world['l10'][0], world['champ'][0]}
    assert all(i['completed_count'] == 10 and i['champion_ready'] for i in both)
    lvl9 = requests.get(f'{API}/admin/world/users', params={'search': f'fwadm_{RUN}', 'level': 9},
                        headers=world['admin'][1], timeout=30).json()['items']
    assert [i['user_id'] for i in lvl9] == [world['l9'][0]]


def test_admin_edit_persists_across_refresh_and_player_reconciliation(world):
    uid, player = world['l9']
    r = admin_edit(world, uid, completed_levels=list(range(1, 11)), reason='verification test')
    assert r.status_code == 200 and r.json()['updated'] is True
    for _ in range(2):
        requests.get(f'{API}/world/state', headers=player, timeout=30)  # backend reconciliation
        p = admin_get(world, uid)['progress']
        assert p['completed_count'] == 10 and p['champion_ready'] is True and p['admin_pinned'] is True
        assert p['admin_granted_levels'] == [9, 10]  # explicit and visible; attempts untouched
    audit = admin_get(world, uid)['audit'][0]
    assert audit['kind'] == 'admin_progress_override' and audit['reason'] == 'verification test'
    assert mongo(f'db.world_level_attempts.countDocuments({{user_id:"{uid}"}})').strip() == '8'


def test_unlocking_a_level_gives_access_without_marking_it_completed(world):
    uid, player = world['l1']
    start = lambda: requests.post(f'{API}/world/session/start', json={'level': 8}, headers=player, timeout=30)
    assert start().status_code == 403
    r = admin_edit(world, uid, highest_unlocked_level=8)
    assert r.status_code == 200, r.text
    assert start().status_code == 200
    p = admin_get(world, uid)['progress']
    assert p['completed_levels'] == [] and 8 in p['admin_unlocked_levels']
    assert start().status_code == 200 and admin_get(world, uid)['progress']['highest_unlocked_level'] == 8


def test_support_staff_cannot_edit_progress(world):
    r = admin_edit(world, world['l1'][0], who='support', completed_levels=[1])
    assert r.status_code == 403
