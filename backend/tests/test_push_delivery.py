"""Focused tests for preference-aware Web Push delivery."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
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


def test_browser_permission_denied_does_not_send(monkeypatch):
    users = SimpleNamespace(find_one=AsyncMock(return_value={
        'web_push_enabled': True, 'web_push_browser_permission': 'denied',
    }))
    db = SimpleNamespace(users=users, web_push_subscriptions=_Rows([{'_id': 'sub-1'}]))
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'public')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'private')
    monkeypatch.setenv('VAPID_SUBJECT', 'mailto:push@example.test')
    monkeypatch.setattr(push_delivery, '_send', lambda *_args: (_ for _ in ()).throw(AssertionError('sent with denied permission')))

    result = asyncio.run(push_delivery.send_web_push_to_user(db, 'user-1', {'title': 'Hello'}))

    assert result['status'] == 'skipped'
    assert result['reason'] == 'Browser notification permission is denied'


@pytest.mark.parametrize('user,devices,expected', [
    ({'web_push_enabled': True}, 1, 'Enabled'),
    ({'web_push_enabled': True}, 0, 'Not Subscribed'),
    ({'web_push_enabled': False, 'web_push_consent_source': 'admin', 'web_push_consent_at': 'now'}, 1, 'Disabled'),
    ({'web_push_enabled': False, 'web_push_browser_permission': 'denied'}, 0, 'Browser Permission Denied'),
    ({}, 0, 'Disabled'),
])
def test_web_push_status(user, devices, expected):
    assert push_delivery.web_push_status(user, devices) == expected


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


def test_contest_lifecycle_uses_one_hour_reminder_horizon(monkeypatch):
    class Collection:
        def __init__(self, result=None):
            self.result = result
            self.queries = []

        async def update_one(self, *_args, **_kwargs):
            return None

        async def find_one(self, *_args, **_kwargs):
            return self.result

        def find(self, query, *_args, **_kwargs):
            self.queries.append(query)
            return self

        def limit(self, _limit):
            return self

        async def to_list(self, _limit):
            return []

    now = push_delivery.datetime(2026, 10, 23, 12, 0, 0)
    settings = Collection({'value': now.replace(tzinfo=push_delivery.timezone.utc)})
    contests = Collection()
    world_contests = Collection()
    db = SimpleNamespace(app_settings=settings, contests=contests, world_global_contests=world_contests)
    monkeypatch.setattr(push_delivery, '_vapid_config', lambda: ('public', 'private', 'mailto:push@example.test'))

    assert asyncio.run(push_delivery.process_contest_lifecycle_alerts(db, current_time=now)) == 0
    for query in (contests.queries[0], world_contests.queries[0]):
        ending = next(condition for condition in query['$or'] if 'end_alert_queued' in condition or 'world_push_end_queued' in condition)
        end_field = 'end_date' if 'end_alert_queued' in ending else 'end_at'
        assert ending[end_field]['$lte'] == now.replace(tzinfo=push_delivery.timezone.utc) + push_delivery.timedelta(hours=1)