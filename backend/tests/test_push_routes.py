"""Unit tests for authenticated Push device management."""
from __future__ import annotations

import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from starlette.requests import Request

from routers import push_routes


def _request():
    return Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': [(b'user-agent', b'push-test')]})


class _Collection:
    def __init__(self, *, deleted=0, count=0, existing=None):
        self.updates = []
        self.deleted_count = deleted
        self.count = count
        self.existing = existing

    async def update_one(self, query, update, upsert=False):
        self.updates.append((query, update, upsert))

    async def find_one(self, *_args, **_kwargs):
        return self.existing

    async def delete_one(self, _query):
        return SimpleNamespace(deleted_count=self.deleted_count)

    async def count_documents(self, _query):
        return self.count


def test_web_subscription_registration_is_owner_scoped_and_opted_in(monkeypatch):
    subscriptions = _Collection()
    users = _Collection()
    db = SimpleNamespace(web_push_subscriptions=subscriptions, users=users)
    monkeypatch.setattr(push_routes, 'get_current_user', AsyncMock(return_value={'user_id': 'user-1'}))
    monkeypatch.setattr(push_routes, 'get_db', lambda: db)
    monkeypatch.setattr(push_routes, 'public_vapid_config', lambda: {'available': True, 'public_key': 'key'})

    payload = push_routes.WebPushSubscriptionInput(
        endpoint='https://fcm.googleapis.com/subscription/abc',
        keys={'p256dh': 'A' * 80, 'auth': 'B' * 24},
    )
    result = asyncio.run(push_routes.register_web_subscription(payload, _request()))

    assert result['ok'] is True and result['web_push_enabled'] is True
    query, update, upsert = subscriptions.updates[0]
    assert query['_id'] == result['subscription_id']
    assert update['$set']['user_id'] == 'user-1'
    assert update['$set']['endpoint'] == payload.endpoint
    assert upsert is True
    assert users.updates[0][1]['$set']['web_push_enabled'] is True


@pytest.mark.parametrize('endpoint', [
    'http://push.example.test/subscription/abc',
    'https://attacker.example/subscription/abc',
])
def test_web_subscription_rejects_unsupported_endpoint(monkeypatch, endpoint):
    monkeypatch.setattr(push_routes, 'get_current_user', AsyncMock(return_value={'user_id': 'user-1'}))
    monkeypatch.setattr(push_routes, 'public_vapid_config', lambda: {'available': True, 'public_key': 'key'})
    payload = push_routes.WebPushSubscriptionInput(
        endpoint=endpoint,
        keys={'p256dh': 'A' * 80, 'auth': 'B' * 24},
    )

    async def run():
        with pytest.raises(HTTPException) as error:
            await push_routes.register_web_subscription(payload, _request())
        assert error.value.status_code == 400

    asyncio.run(run())


def test_web_subscription_cannot_be_reassigned_to_another_user(monkeypatch):
    subscriptions = _Collection(existing={'user_id': 'other-user'})
    db = SimpleNamespace(web_push_subscriptions=subscriptions, users=_Collection())
    monkeypatch.setattr(push_routes, 'get_current_user', AsyncMock(return_value={'user_id': 'user-1'}))
    monkeypatch.setattr(push_routes, 'get_db', lambda: db)
    monkeypatch.setattr(push_routes, 'public_vapid_config', lambda: {'available': True, 'public_key': 'key'})
    payload = push_routes.WebPushSubscriptionInput(
        endpoint='https://fcm.googleapis.com/subscription/abc',
        keys={'p256dh': 'A' * 80, 'auth': 'B' * 24},
    )

    async def run():
        with pytest.raises(HTTPException) as error:
            await push_routes.register_web_subscription(payload, _request())
        assert error.value.status_code == 409
        assert not subscriptions.updates

    asyncio.run(run())


def test_native_device_token_is_encrypted_before_storage(monkeypatch):
    devices = _Collection()
    db = SimpleNamespace(native_push_devices=devices)
    monkeypatch.setattr(push_routes, 'get_current_user', AsyncMock(return_value={'user_id': 'user-1'}))
    monkeypatch.setattr(push_routes, 'get_db', lambda: db)
    monkeypatch.setenv('PUSH_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode('ascii'))
    token = 'native-device-token-' + ('x' * 40)

    result = asyncio.run(push_routes.register_native_device(
        push_routes.NativeDeviceInput(platform='ios', token=token, label='Test phone'),
        _request(),
    ))

    stored = devices.updates[0][1]['$set']
    assert result['delivery_available'] is False
    assert stored['token_hash'] != token
    assert token not in stored['token_ciphertext']
    assert Fernet(os.environ['PUSH_TOKEN_ENCRYPTION_KEY'].encode()).decrypt(
        stored['token_ciphertext'].encode(),
    ).decode() == token
