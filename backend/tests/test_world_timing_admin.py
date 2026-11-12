import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import deps
from routers import admin_routes, world_routes


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, *_args, **_kwargs):
        return [dict(row) for row in self.rows]


class Collection:
    def __init__(self):
        self.rows = []

    def find(self, query=None, *_args, **_kwargs):
        query = query or {}
        return Cursor([row for row in self.rows if all(row.get(key) == value for key, value in query.items())])

    async def find_one(self, query=None, *_args, **_kwargs):
        query = query or {}
        return next((dict(row) for row in self.rows if all(row.get(key) == value for key, value in query.items())), None)

    async def update_one(self, query, update, upsert=False, **_kwargs):
        row = next((row for row in self.rows if all(row.get(key) == value for key, value in query.items())), None)
        if row is None:
            if upsert:
                self.rows.append({**query, **update.get('$set', {})})
            return SimpleNamespace(matched_count=0)
        row.update(update.get('$set', {}))
        return SimpleNamespace(matched_count=1)

    async def insert_one(self, row):
        self.rows.append(dict(row))


class Database:
    def __init__(self):
        self.world_game_timing_settings = Collection()
        self.world_game_timing_audit = Collection()
        self.world_global_contests = Collection()


def test_normal_admin_cannot_read_or_write_world_timings_or_level_boards(monkeypatch):
    async def current_user(request):
        return {'user_id': 'normal-admin', 'role': request.role}

    monkeypatch.setattr(admin_routes, 'get_current_user', current_user)
    request = SimpleNamespace(role='admin')

    with pytest.raises(HTTPException) as read_error:
        asyncio.run(admin_routes.admin_free_world_timings(request))
    assert read_error.value.status_code == 403

    with pytest.raises(HTTPException) as write_error:
        asyncio.run(admin_routes.update_admin_free_world_timings(
            {'settings': {'L1': 70}, 'reason': 'Approved timing update'}, request,
        ))
    assert write_error.value.status_code == 403

    with pytest.raises(HTTPException) as board_error:
        asyncio.run(admin_routes.admin_free_world_level_leaderboard(1, request))
    assert board_error.value.status_code == 403


def test_super_admin_timing_changes_are_persisted_and_audited(monkeypatch):
    db = Database()

    async def current_user(request):
        return {'user_id': 'super-admin', 'email': 'sa@example.test', 'role': request.role}

    monkeypatch.setattr(admin_routes, 'get_current_user', current_user)
    monkeypatch.setattr(deps, 'get_db', lambda: db)
    request = SimpleNamespace(role='super_admin')

    result = asyncio.run(admin_routes.update_admin_free_world_timings(
        {'settings': {'L1': 70}, 'reason': 'Approved timing update'}, request,
    ))
    assert result['changed'] == [{'setting_key': 'L1', 'previous_time_limit_seconds': 60,
                                  'time_limit_seconds': 70}]
    assert db.world_game_timing_settings.rows[0]['time_limit_seconds'] == 70
    assert db.world_game_timing_audit.rows[0]['actor_user_id'] == 'super-admin'

    view = asyncio.run(admin_routes.admin_free_world_timings(request))
    assert view['settings']['L1'] == 70
    assert view['history'][0]['reason'] == 'Approved timing update'


def test_saved_normal_level_timing_is_used_by_new_config_resolution(monkeypatch):
    db = Database()
    db.world_game_timing_settings.rows.append({
        'season_id': world_routes.WORLD_SEASON_ID,
        'setting_key': 'L2',
        'time_limit_seconds': 83,
    })

    async def base_config(_db, level, _stage):
        return {'level': level, 'time_limit_seconds': 55, 'game_config': {}}

    async def no_active_contest(_db):
        return None

    monkeypatch.setattr(world_routes, '_effective_level_config_base', base_config)
    monkeypatch.setattr(world_routes, '_active_contest', no_active_contest)

    config = asyncio.run(world_routes._effective_level_config(db, 2))
    assert config['time_limit_seconds'] == 83


def test_normal_admin_contest_views_hide_timing_metadata():
    contest = {
        'game_config': {'target_number': 20, 'time_limit_seconds': 65, 'timer_mode': 'countdown'},
        'levels_config': [{'level': 1, 'time_limit_seconds': 60,
                           'game_config': {'timer_mode': 'countdown'}}],
        'champion_config': {'time_limit_seconds': 75,
                            'game_config': {'time_limit_seconds': 75, 'timer_mode': 'countdown'}},
    }
    admin_view = world_routes._admin_world_contest_view(contest, {'role': 'admin'})
    assert 'time_limit_seconds' not in admin_view['game_config']
    assert 'time_limit_seconds' not in admin_view['levels_config'][0]
    assert 'timer_mode' not in admin_view['levels_config'][0]['game_config']
    assert 'time_limit_seconds' not in admin_view['champion_config']['game_config']
    assert world_routes._admin_world_contest_view(contest, {'role': 'super_admin'}) == contest


def test_normal_admin_cannot_change_timing_through_legacy_contest_api(monkeypatch):
    db = Database()
    levels = world_routes._default_world_levels_config()
    db.world_global_contests.rows.append({
        'season_id': world_routes.WORLD_SEASON_ID,
        'contest_number': 1,
        'status': 'draft',
        'levels_config': levels,
    })

    async def current_admin(_request):
        return {'user_id': 'normal-admin', 'role': 'admin'}

    monkeypatch.setattr(world_routes, 'require_admin', current_admin)
    monkeypatch.setattr(world_routes, 'get_db', lambda: db)
    changed_levels = [dict(level) for level in levels]
    changed_levels[0]['time_limit_seconds'] += 10
    body = world_routes.WorldContestUpdate(levels_config=changed_levels)

    with pytest.raises(HTTPException) as error:
        asyncio.run(world_routes.update_admin_world_contest(1, body, SimpleNamespace()))
    assert error.value.status_code == 403
