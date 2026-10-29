"""Admin alert campaigns with the Web Push channel (isolated test DB only)."""
from __future__ import annotations

import asyncio
import os
import uuid

import pytest
from fastapi import BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import ValidationError

from deps import _mongo_url, _sanitize_db_name
from routers import user360_routes
from services import push_delivery


def run_db(target, fn):
    async def run():
        client = AsyncIOMotorClient(target['url'])
        try:
            return await fn(client[target['name']])
        finally:
            client.close()
    return asyncio.run(run())


@pytest.fixture(scope='module')
def safe_db():
    name = os.environ.get('DB_NAME', '')
    if 'test' not in name.lower():
        pytest.skip('Integration test requires a DB_NAME containing "test"')
    return {'url': _mongo_url, 'name': _sanitize_db_name(name)}


@pytest.fixture
def users(safe_db):
    tag = uuid.uuid4().hex[:8]
    ids = {'ready': f'wp_ready_{tag}', 'off': f'wp_off_{tag}', 'nosub': f'wp_nosub_{tag}'}

    async def seed(db):
        base = {'role': 'user', 'phone_verified': True}
        await db.users.insert_many([
            {**base, 'user_id': ids['ready'], 'email': f"{ids['ready']}@example.test", 'web_push_enabled': True,
             'web_push_marketing_consent': True},
            {**base, 'user_id': ids['off'], 'email': f"{ids['off']}@example.test", 'web_push_enabled': False},
            {**base, 'user_id': ids['nosub'], 'email': f"{ids['nosub']}@example.test", 'web_push_enabled': True},
        ])
        await db.web_push_subscriptions.insert_one({
            '_id': f'sub_{tag}', 'user_id': ids['ready'], 'active': True,
            'endpoint': 'https://fcm.googleapis.com/fcm/send/x', 'keys': {'p256dh': 'k', 'auth': 'a'}})
    run_db(safe_db, seed)
    yield ids

    async def cleanup(db):
        uids = list(ids.values())
        await db.users.delete_many({'user_id': {'$in': uids}})
        await db.web_push_subscriptions.delete_many({'user_id': {'$in': uids}})
        await db.alert_deliveries.delete_many({'user_id': {'$in': uids}})
        await db.notifications.delete_many({'user_id': {'$in': uids}})
        await db.alert_campaigns.delete_many({'created_by_user_id': f'admin_{tag}'})
    run_db(safe_db, cleanup)


def _admin(monkeypatch, db, tag_admin='admin'):
    import deps

    async def admin(_request):
        return {'user_id': tag_admin, 'email': 'admin@example.test', 'role': 'super_admin'}
    monkeypatch.setattr(user360_routes, 'require_admin', admin)
    monkeypatch.setattr(deps, 'get_db', lambda: db)


async def _send_campaign(db, ids, channels, alert_type='custom'):
    payload = user360_routes.AdminAlertCreateRequest(
        title='Test alert', message='Body', alert_type=alert_type, channels=channels,
        audience=user360_routes.AudienceSpec(mode='users', identifiers=list(ids.values())),
    )
    tasks = BackgroundTasks()
    result = await user360_routes.create_alert_campaign(payload, None, tasks)
    await tasks()
    return result


def _by_user(rows):
    return {r['user_id']: r for r in rows}


def test_web_push_channel_is_accepted_and_delivers_only_to_eligible_users(monkeypatch, safe_db, users):
    sent = []
    monkeypatch.setattr(push_delivery, '_vapid_config', lambda: ('pub', 'priv', 'mailto:t@example.test'))
    monkeypatch.setattr(push_delivery, '_send', lambda sub, payload, *_: sent.append(payload))

    async def run(db):
        _admin(monkeypatch, db)
        result = await _send_campaign(db, users, ['web_push'])
        rows = _by_user(await db.alert_deliveries.find({'campaign_id': result['campaign_id']}).to_list(10))
        assert rows[users['ready']]['status'] == 'sent'
        assert rows[users['off']]['status'] == 'skipped' and rows[users['nosub']]['status'] == 'skipped'
        assert len(sent) == 1
        campaign = await user360_routes.get_alert_campaign(result['campaign_id'], None)
        assert campaign['delivery_counts']['web_push'] == {'sent': 1, 'skipped': 2}
        listed = await user360_routes.get_alert_deliveries(result['campaign_id'], None, channel='web_push')
        assert listed['total'] == 3
    run_db(safe_db, run)


def test_marketing_alert_requires_marketing_consent(monkeypatch, safe_db, users):
    monkeypatch.setattr(push_delivery, '_vapid_config', lambda: ('pub', 'priv', 'mailto:t@example.test'))
    monkeypatch.setattr(push_delivery, '_send', lambda *_: None)

    async def run(db):
        _admin(monkeypatch, db)
        await db.users.update_one({'user_id': users['ready']}, {'$set': {'web_push_marketing_consent': False}})
        result = await _send_campaign(db, users, ['web_push'], alert_type='promotion')
        rows = _by_user(await db.alert_deliveries.find({'campaign_id': result['campaign_id']}).to_list(10))
        assert rows[users['ready']]['status'] == 'skipped'
    run_db(safe_db, run)


def test_provider_failure_is_recorded_without_crashing_the_campaign(monkeypatch, safe_db, users):
    monkeypatch.setattr(push_delivery, '_vapid_config', lambda: ('pub', 'priv', 'mailto:t@example.test'))

    def boom(*_):
        raise RuntimeError('provider down')
    monkeypatch.setattr(push_delivery, '_send', boom)

    async def run(db):
        _admin(monkeypatch, db)
        result = await _send_campaign(db, users, ['in_app', 'web_push'])
        rows = await db.alert_deliveries.find({'campaign_id': result['campaign_id']}).to_list(20)
        push = _by_user([r for r in rows if r['channel'] == 'web_push'])
        assert push[users['ready']]['status'] == 'failed'
        assert all(r['status'] == 'sent' for r in rows if r['channel'] == 'in_app')
        assert not any(r['status'] in ('pending', 'sending') for r in rows)
    run_db(safe_db, run)


def test_native_push_is_skipped_and_unknown_channels_are_rejected(monkeypatch, safe_db, users):
    async def run(db):
        _admin(monkeypatch, db)
        result = await _send_campaign(db, users, ['native_push'])
        rows = await db.alert_deliveries.find({'campaign_id': result['campaign_id']}).to_list(10)
        assert {r['status'] for r in rows} == {'skipped'}
    run_db(safe_db, run)
    with pytest.raises(ValidationError):
        user360_routes.AdminAlertCreateRequest(title='t', message='m', channels=['pigeon'])
