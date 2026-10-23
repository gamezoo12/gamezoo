"""Unit tests for audited User 360 financial actions."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from routers import user360_routes


def _request():
    return Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': []})


def test_user_wallet_adjust_is_role_guarded_and_idempotent(monkeypatch):
    audit_rows = {}
    applied_refs = set()
    calls = []

    class Users:
        async def find_one(self, _query, _projection):
            return {'user_id': 'target-user', 'erased': False}

    class AuditLog:
        async def update_one(self, query, update, upsert=False):
            assert upsert is True
            audit_rows.setdefault(query['audit_id'], update['$setOnInsert'])

    db = SimpleNamespace(users=Users(), audit_log=AuditLog())

    async def require_admin(_request):
        return {'user_id': 'admin-user', 'email': 'admin@example.test', 'role': 'admin'}

    def get_db():
        return db

    async def apply_once(_db, user_id, kind, amount, *, note, ref_order_id):
        calls.append((user_id, kind, amount, note, ref_order_id))
        replay = ref_order_id in applied_refs
        applied_refs.add(ref_order_id)
        return {'balance': 8, 'idempotent_replay': replay, 'tx': {'tx_id': 'tx_once'}}

    monkeypatch.setattr(user360_routes, 'require_admin', require_admin)
    monkeypatch.setattr('deps.get_db', get_db)
    monkeypatch.setattr('routers.wallet_routes._apply_tx_idempotent', apply_once)

    async def run():
        payload = user360_routes.UserWalletAdjustmentRequest(
            amount=-2,
            reason='Correct duplicate token credit',
            operation_id='operation-identifier-1234',
        )
        first = await user360_routes.adjust_user_wallet('target-user', payload, _request())
        replay = await user360_routes.adjust_user_wallet('target-user', payload, _request())
        assert first['idempotent_replay'] is False
        assert replay['idempotent_replay'] is True
        assert len(calls) == 2
        assert calls[0][2] == -2
        assert calls[0][4] == calls[1][4] == 'admin_user_adjust:operation-identifier-1234'
        assert len(audit_rows) == 1
        assert next(iter(audit_rows.values()))['reason'] == payload.reason

    asyncio.run(run())


def test_user_wallet_adjust_rejects_erased_accounts(monkeypatch):
    class Users:
        async def find_one(self, _query, _projection):
            return {'user_id': 'target-user', 'erased': True}

    db = SimpleNamespace(users=Users())

    async def require_admin(_request):
        return {'user_id': 'admin-user', 'role': 'admin'}

    monkeypatch.setattr(user360_routes, 'require_admin', require_admin)
    monkeypatch.setattr('deps.get_db', lambda: db)
    monkeypatch.setattr(
        'routers.wallet_routes._apply_tx_idempotent',
        lambda *_args, **_kwargs: pytest.fail('erased account reached wallet ledger'),
    )

    async def run():
        payload = user360_routes.UserWalletAdjustmentRequest(
            amount=-2,
            reason='Correct duplicate token credit',
            operation_id='operation-identifier-erased',
        )
        with pytest.raises(HTTPException) as error:
            await user360_routes.adjust_user_wallet('target-user', payload, _request())
        assert error.value.status_code == 400

    asyncio.run(run())


@pytest.mark.parametrize('role,expected_status', [('support', 403), ('operator', 403)])
def test_user_wallet_adjust_rejects_non_admin_roles(monkeypatch, role, expected_status):
    async def require_admin(_request):
        return {'user_id': 'staff-user', 'role': role}

    monkeypatch.setattr(user360_routes, 'require_admin', require_admin)

    async def run():
        payload = user360_routes.UserWalletAdjustmentRequest(
            amount=1,
            reason='Authorized wallet correction',
            operation_id='operation-identifier-5678',
        )
        with pytest.raises(HTTPException) as error:
            await user360_routes.adjust_user_wallet('target-user', payload, _request())
        assert error.value.status_code == expected_status

    asyncio.run(run())