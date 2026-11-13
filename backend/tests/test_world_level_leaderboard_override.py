import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import deps
from routers import admin_routes


class Collection:
    def __init__(self, rows=None):
        self.rows = rows or []

    async def find_one(self, query, *_args, **_kwargs):
        row = next((row for row in self.rows if all(row.get(key) == value for key, value in query.items())), None)
        return dict(row) if row else None

    async def update_one(self, query, update, **_kwargs):
        row = next((row for row in self.rows if all(row.get(key) == value for key, value in query.items())), None)
        if row:
            row.update(update.get('$set', {}))
        return SimpleNamespace(matched_count=int(row is not None))

    async def insert_one(self, row):
        self.rows.append(dict(row))


class Database:
    def __init__(self):
        self.world_gc_level_bests = Collection([{
            'season_id': 'season-1', 'gc_number': 4, 'level_key': 'L3', 'user_id': 'player-1',
            'duration_ms': 18000, 'session_id': 'session-1',
        }])
        self.leaderboard_override_audit = Collection()


def test_normal_admin_cannot_override_normal_level_leaderboard_time(monkeypatch):
    async def require_role(request, allowed):
        if request.role not in allowed:
            raise HTTPException(status_code=403, detail='Super Admin only')
        return {'user_id': 'normal-admin', 'role': request.role}

    monkeypatch.setattr(admin_routes, '_require_role', require_role)
    with pytest.raises(HTTPException) as error:
        asyncio.run(admin_routes.override_free_world_level_time(
            4, 3, 'player-1', {'duration_ms': 15000, 'reason': 'Verified correction'},
            SimpleNamespace(role='admin'),
        ))
    assert error.value.status_code == 403


def test_super_admin_override_is_persisted_and_audited(monkeypatch):
    db = Database()

    async def require_role(request, _allowed):
        return {'user_id': 'super-admin', 'email': 'sa@example.test', 'role': request.role}

    monkeypatch.setattr(admin_routes, '_require_role', require_role)
    monkeypatch.setattr(deps, 'get_db', lambda: db)

    result = asyncio.run(admin_routes.override_free_world_level_time(
        4, 3, 'player-1', {'duration_ms': 15000, 'reason': 'Verified correction'},
        SimpleNamespace(role='super_admin'),
    ))

    record = db.world_gc_level_bests.rows[0]
    audit = db.leaderboard_override_audit.rows[0]
    assert result['previous_duration_ms'] == 18000
    assert record['duration_ms'] == 18000
    assert record['duration_ms_override'] == 15000
    assert audit['world'] == 'free_world'
    assert audit['contest_number'] == 4 and audit['level_key'] == 'L3'
    assert audit['actor_user_id'] == 'super-admin'
