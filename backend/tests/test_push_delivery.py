"""Focused tests for preference-aware Web Push delivery."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from pywebpush import WebPushException

from services import push_delivery


class _Rows:
    def __init__(self, rows):
        self.rows = rows
        self.deleted = []

    def find(self, *_args, **_kwargs):
        return self

    async def to_list(self, _limit):
        return list(self.rows)

    async def delete_one(self, query):
        self.deleted.append(query['_id'])


class _Outbox:
    def __init__(self):
        self.rows = {}

    async def update_one(self, query, update, upsert=False):
        self.rows.setdefault(query['_id'], update['$setOnInsert'])


def test_disabled_web_push_does_not_send(monkeypatch):
    users = SimpleNamespace(find_one=AsyncMock(return_value={'web_push_enabled': False}))
    db = SimpleNamespace(users=users, web_push_subscriptions=_Rows([{'_id': 'sub-1'}]))
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'public')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'private')
    monkeypatch.setenv('VAPID_SUBJECT', 'mailto:push@example.test')
    monkeypatch.setattr(push_delivery, '_send', lambda *_args: (_ for _ in ()).throw(AssertionError('sent while disabled')))

    result = asyncio.run(push_delivery.send_web_push_to_user(db, 'user-1', {'title': 'Hello'}))

    assert result['status'] == 'skipped'
    assert result['reason'] == 'Web Push is disabled'


def test_web_push_delivers_to_multiple_devices_and_removes_expired(monkeypatch):
    users = SimpleNamespace(find_one=AsyncMock(return_value={'web_push_enabled': True}))
    subscriptions = _Rows([
        {'_id': 'sub-1', 'endpoint': 'https://push.test/1', 'keys': {}},
        {'_id': 'sub-2', 'endpoint': 'https://push.test/2', 'keys': {}},
    ])
    db = SimpleNamespace(users=users, web_push_subscriptions=subscriptions)
    sent = []
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'public')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'private')
    monkeypatch.setenv('VAPID_SUBJECT', 'mailto:push@example.test')

    def send(subscription, _payload, *_args):
        sent.append(subscription['_id'])
        if subscription['_id'] == 'sub-2':
            raise WebPushException('expired', response=SimpleNamespace(status_code=410))

    monkeypatch.setattr(push_delivery, '_send', send)
    result = asyncio.run(push_delivery.send_web_push_to_user(db, 'user-1', {'title': 'Hello'}))

    assert result['status'] == 'sent'
    assert result['delivered'] == 1
    assert result['removed'] == 1
    assert sent == ['sub-1', 'sub-2']
    assert subscriptions.deleted == ['sub-2']


def test_marketing_push_requires_separate_marketing_consent(monkeypatch):
    users = SimpleNamespace(find_one=AsyncMock(return_value={
        'web_push_enabled': True, 'web_push_marketing_consent': False,
    }))
    db = SimpleNamespace(users=users, web_push_subscriptions=_Rows([]))
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'public')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'private')
    monkeypatch.setenv('VAPID_SUBJECT', 'mailto:push@example.test')

    result = asyncio.run(push_delivery.send_web_push_to_user(
        db, 'user-1', {'title': 'Campaign'}, marketing=True,
    ))

    assert result['status'] == 'skipped'
    assert result['reason'] == 'Marketing Push consent is not enabled'


def test_retried_business_event_reuses_one_outbox_key(monkeypatch):
    outbox = _Outbox()
    db = SimpleNamespace(web_push_outbox=outbox)
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'public')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'private')
    monkeypatch.setenv('VAPID_SUBJECT', 'mailto:push@example.test')

    async def run():
        first = await push_delivery.queue_notification_event(
            db, user_id='user-1', kind='purchase_success', title='Tickets', body='Ready',
            ref_order_id='order-123', contest_id='contest-a',
        )
        retry = await push_delivery.queue_notification_event(
            db, user_id='user-1', kind='purchase_success', title='Tickets', body='Ready',
            ref_order_id='order-123', contest_id='contest-a',
        )
        assert first is True and retry is True
        assert len(outbox.rows) == 1
        row = next(iter(outbox.rows.values()))
        assert row['payload']['url'] == '/my-account/tickets'

    asyncio.run(run())