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


@pytest.mark.parametrize('user,expected', [
    ({'phone': '+15550100000'}, False),
    ({'phone': '+15550100000', 'phone_verified': False}, False),
    ({'phone': '+15550100000', 'phone_verified_at': '2026-10-24T12:00:00Z'}, True),
    ({'phone': '+15550100000', 'phone_verified': True}, True),
])
def test_user360_sanitise_uses_verification_evidence(user, expected):
    view = asyncio.run(user360_routes._sanitise(user))
    assert view['phone_verified'] is expected


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


def test_single_user_web_push_disable_is_reasoned_and_audited(monkeypatch):
    updates = []
    audits = []

    class Users:
        async def find_one(self, _query, _projection):
            return {'user_id': 'target-user', 'erased': False, 'web_push_enabled': True}
        async def update_one(self, query, update):
            updates.append((query, update))

    class AuditLog:
        async def insert_one(self, row):
            audits.append(row)

    async def require_admin(_request):
        return {'user_id': 'admin-user', 'email': 'admin@example.test', 'role': 'admin'}

    monkeypatch.setattr(user360_routes, 'require_admin', require_admin)
    monkeypatch.setattr('deps.get_db', lambda: SimpleNamespace(users=Users(), audit_log=AuditLog()))

    async def run():
        payload = user360_routes.UserWebPushDisableRequest(reason='User requested push to be disabled')
        result = await user360_routes.disable_user_web_push('target-user', payload, _request())
        assert result['web_push_enabled'] is False
        assert result['web_push_consent_source'] == 'admin'
        assert updates[0][1]['$set']['web_push_enabled'] is False
        assert updates[0][1]['$set']['web_push_consent_source'] == 'admin'
        assert audits[0]['kind'] == 'admin_web_push_consent_change'
        assert audits[0]['reason'] == payload.reason

    asyncio.run(run())


@pytest.mark.parametrize('active_devices', [1, 0])
def test_single_user_web_push_enable_sets_pending_without_consent_or_subscription(monkeypatch, active_devices):
    updates = []
    audits = []

    class Users:
        async def find_one(self, _query, _projection):
            return {'user_id': 'target-user', 'erased': False}
        async def update_one(self, query, update):
            updates.append((query, update))

    class Devices:
        async def count_documents(self, query):
            assert query == {'user_id': 'target-user', 'active': True}
            return active_devices

    class AuditLog:
        async def insert_one(self, row):
            audits.append(row)

    async def require_admin(_request):
        return {'user_id': 'admin-user', 'email': 'admin@example.test', 'role': 'admin'}

    monkeypatch.setattr(user360_routes, 'require_admin', require_admin)
    monkeypatch.setattr('deps.get_db', lambda: SimpleNamespace(
        users=Users(), web_push_subscriptions=Devices(), audit_log=AuditLog(),
    ))

    async def run():
        payload = user360_routes.UserWebPushGrantRequest(evidence='Enabled by support request 2026-10-23')
        result = await user360_routes.enable_user_web_push('target-user', payload, _request())
        assert result['web_push_admin_pending'] is True
        changed = updates[0][1]['$set']
        assert changed['web_push_admin_pending'] is True
        assert 'web_push_enabled' not in changed and 'web_push_marketing_consent' not in changed
        assert 'web_push_consent_at' not in changed
        assert audits[0]['consent'] is False and audits[0]['pending_browser_permission'] is True

    asyncio.run(run())


def test_bulk_web_push_revoke_is_idempotently_audited(monkeypatch):
    users_by_id = {'target-user': {'user_id': 'target-user', 'erased': False, 'web_push_enabled': True}}
    audits = {}

    class Cursor:
        async def to_list(self, _limit):
            return list(users_by_id.values())

    class Users:
        def find(self, _query, _projection):
            return Cursor()
        async def update_one(self, query, update):
            users_by_id[query['user_id']].update(update['$set'])

    class AuditLog:
        async def update_one(self, query, update, upsert=False):
            assert upsert is True
            audits.setdefault(query['audit_id'], update['$setOnInsert'])

    async def require_admin(_request):
        return {'user_id': 'admin-user', 'email': 'admin@example.test', 'role': 'admin'}

    db = SimpleNamespace(users=Users(), audit_log=AuditLog())
    monkeypatch.setattr(user360_routes, 'require_admin', require_admin)
    monkeypatch.setattr('deps.get_db', lambda: db)

    async def run():
        payload = user360_routes.BulkUserActionRequest(
            user_ids=['target-user'], action='web_push_revoke',
            batch_id='push-revoke-batch-1234', note='User requested push disable',
        )
        first = await user360_routes.bulk_user_actions(payload, _request())
        replay = await user360_routes.bulk_user_actions(payload, _request())
        assert first['succeeded'] == replay['succeeded'] == 1
        assert users_by_id['target-user']['web_push_enabled'] is False
        assert users_by_id['target-user']['web_push_consent_source'] == 'admin'
        assert len(audits) == 1
        assert next(iter(audits.values()))['reason'] == payload.note

    asyncio.run(run())


@pytest.mark.parametrize('active_devices,expected_status', [(1, 'success'), (0, 'success')])
def test_bulk_web_push_enable_is_pending_and_never_blocked_by_missing_subscription(
    monkeypatch, active_devices, expected_status,
):
    user = {'user_id': 'target-user', 'erased': False, 'web_push_enabled': False}
    audits = {}

    class Cursor:
        async def to_list(self, _limit):
            return [user]

    class Users:
        def find(self, _query, _projection):
            return Cursor()
        async def update_one(self, _query, update):
            user.update(update['$set'])

    class Devices:
        async def count_documents(self, _query):
            return active_devices

    class AuditLog:
        async def update_one(self, query, update, upsert=False):
            assert upsert is True
            audits.setdefault(query['audit_id'], update['$setOnInsert'])

    async def require_admin(_request):
        return {'user_id': 'admin-user', 'email': 'admin@example.test', 'role': 'admin'}

    db = SimpleNamespace(users=Users(), web_push_subscriptions=Devices(), audit_log=AuditLog())
    monkeypatch.setattr(user360_routes, 'require_admin', require_admin)
    monkeypatch.setattr('deps.get_db', lambda: db)

    async def run():
        payload = user360_routes.BulkUserActionRequest(
            user_ids=['target-user'], action='web_push_grant',
            batch_id='push-grant-batch-1234',
            consent_evidence='User opted in on support call 2026-10-23',
        )
        result = await user360_routes.bulk_user_actions(payload, _request())
        item = result['items'][0]
        assert item['status'] == expected_status
        assert user['web_push_admin_pending'] is True
        assert user['web_push_enabled'] is False
        assert 'web_push_consent_at' not in user and 'web_push_marketing_consent' not in user
        assert next(iter(audits.values()))['reason'] == payload.consent_evidence
        assert next(iter(audits.values()))['consent'] is False

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