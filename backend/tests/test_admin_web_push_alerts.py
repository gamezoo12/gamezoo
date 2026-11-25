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


def test_sms_segment_estimate_counts_gsm_extensions_and_unicode():
    assert user360_routes._sms_segments('a' * 160)['segments'] == 1
    assert user360_routes._sms_segments('a' * 161)['segments'] == 2
    assert user360_routes._sms_segments('^' * 80)['segments'] == 1
    assert user360_routes._sms_segments('^' * 81)['segments'] == 2
    assert user360_routes._sms_segments('\u6f22' * 70)['segments'] == 1
    assert user360_routes._sms_segments('\u6f22' * 71)['segments'] == 2
    assert user360_routes._sms_segments('\U0001f600' * 36) == {'encoding': 'UCS-2', 'units': 72, 'segments': 2}


def test_alert_estimate_uses_eligible_users_and_configured_rates(monkeypatch):
    from types import SimpleNamespace

    class Settings:
        async def find_one(self, *args):
            return {'currency': 'GBP', 'sms_per_segment': 0.05, 'email_per_message': 0.01}
    async def admin(_request):
        return {'role': 'admin'}
    async def resolve(_db, identifiers):
        return ([
            {'user_id': 'one', 'email': 'one@example.test', 'marketing_email_consent': True,
             'phone': '+441234567890', 'phone_verified': True, 'sms_consent': True},
            {'user_id': 'two', 'email': 'two@example.test', 'marketing_email_consent': False,
             'phone': '+441234567891', 'phone_verified': True, 'sms_consent': True, 'sms_opt_out': True},
        ], [])
    monkeypatch.setattr(user360_routes, 'get_db', lambda: SimpleNamespace(settings=Settings()))
    monkeypatch.setattr(user360_routes, 'require_admin', admin)
    monkeypatch.setattr(user360_routes, '_resolve_identifier_users', resolve)
    monkeypatch.setattr(user360_routes, '_twilio_messaging', lambda: (None, None))
    payload = user360_routes.AdminAlertCreateRequest(
        title='Test', message='a' * 161, channels=['email', 'sms'],
        audience=user360_routes.AudienceSpec(mode='users', identifiers=['one', 'two']),
    )
    result = asyncio.run(user360_routes.estimate_alert_cost(payload, None))
    assert result['targeted_count'] == 2
    assert result['sms']['eligible'] == 1 and result['sms']['segments'] == 2 and result['sms']['estimated_cost'] == 0.1
    assert result['email']['eligible'] == 1 and result['email']['estimated_cost'] == 0.01
    assert result['estimated_total'] == 0.11

    async def no_rates(*args):
        return None
    monkeypatch.setattr(Settings, 'find_one', no_rates)
    assert asyncio.run(user360_routes.estimate_alert_cost(payload, None))['estimated_total'] is None


def test_campaign_sms_cost_refresh_uses_provider_prices(monkeypatch, safe_db, users):
    from types import SimpleNamespace

    class Messages:
        def __call__(self, sid):
            return SimpleNamespace(fetch=lambda: SimpleNamespace(price='-0.04125', price_unit='GBP') if sid == 'priced' else SimpleNamespace(price=None, price_unit=None))
    async def run(db):
        admin_id = f"admin_{users['ready'].rsplit('_', 1)[-1]}"
        _admin(monkeypatch, db, admin_id)
        monkeypatch.setattr(user360_routes, 'get_db', lambda: db)
        monkeypatch.setattr(user360_routes, '_twilio_messaging', lambda: (SimpleNamespace(messages=Messages()), 'service'))
        campaign_id = f'cost_{uuid.uuid4().hex}'
        await db.alert_campaigns.insert_one({'campaign_id': campaign_id, 'created_by_user_id': admin_id})
        await db.alert_deliveries.insert_many([
            {'delivery_id': f'{campaign_id}_1', 'campaign_id': campaign_id, 'user_id': users['ready'], 'channel': 'sms', 'status': 'sent', 'message_sid': 'priced'},
            {'delivery_id': f'{campaign_id}_2', 'campaign_id': campaign_id, 'user_id': users['off'], 'channel': 'sms', 'status': 'sent', 'message_sid': 'pending-price'},
        ])
        result = await user360_routes.refresh_alert_costs(campaign_id, None)
        assert result['checked'] == 2 and result['updated'] == 1
        assert result['costs']['sms_by_currency'] == {'GBP': 0.04125}
        assert result['costs']['sms_awaiting_price'] == 1
        again = await user360_routes.refresh_alert_costs(campaign_id, None)
        assert again['checked'] == 1 and again['updated'] == 0
    run_db(safe_db, run)


def test_sms_send_records_reported_provider_price(monkeypatch):
    from types import SimpleNamespace
    import deps

    updates = []
    class Deliveries:
        async def find_one_and_update(self, *args, **kwargs):
            return {'delivery_id': 'delivery'}
        async def update_one(self, query, update):
            updates.append(update['$set'])
    async def recount(*args):
        pass
    messages = SimpleNamespace(create=lambda **kwargs: SimpleNamespace(sid='SM123', status='queued', price='-0.05', price_unit='GBP'))
    monkeypatch.setattr(deps, 'get_db', lambda: SimpleNamespace(alert_deliveries=Deliveries()))
    monkeypatch.setattr(user360_routes, '_twilio_messaging', lambda: (SimpleNamespace(messages=messages), 'service'))
    monkeypatch.setattr(user360_routes, '_recount_campaign', recount)
    asyncio.run(user360_routes._send_campaign_sms('campaign', 'Message', [{'delivery_id': 'delivery', 'phone': '+441234567890'}]))
    assert updates[0]['provider_cost'] == 0.05 and updates[0]['provider_cost_currency'] == 'GBP'


def test_only_admins_can_change_alert_rates(monkeypatch):
    from fastapi import HTTPException

    async def support(_request):
        return {'role': 'support'}
    monkeypatch.setattr(user360_routes, 'require_admin', support)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(user360_routes.update_alert_cost_rates(user360_routes.AlertCostRates(sms_per_segment=0.1), None))
    assert exc.value.status_code == 403
    with pytest.raises(ValidationError):
        user360_routes.AlertCostRates(sms_per_segment=float('nan'))


def test_campaign_contests_only_include_open_public_contests():
    from datetime import datetime, timedelta, timezone

    current_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
    def contest(slug, created, ends, **extra):
        return {'slug': slug, 'title': slug, 'status': 'live', 'created_at': current_time + timedelta(days=created),
                'end_date': current_time + timedelta(days=ends), **extra}

    sections = user360_routes._campaign_contest_sections([
        contest('old', -3, 1), contest('new', -1, 4), contest('expired', 0, -1),
        contest('coming', 0, 3, public_coming_soon=True), contest('unlimited', -2, -1, has_time_limit=False),
        contest('old', -3, 1),
    ], current_time)
    assert [item['slug'] for item in sections['latest']] == ['new', 'unlimited', 'old']
    assert [item['slug'] for item in sections['closing_soon']] == ['old', 'new']


def test_campaign_email_contains_contest_links_and_footer(monkeypatch):
    import json
    from urllib import request

    requests = []
    class Response:
        status = 202
        headers = {'X-Message-Id': 'test'}
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
    def send(req, timeout):
        requests.append(json.loads(req.data))
        return Response()

    monkeypatch.setenv('SENDGRID_API_KEY', 'test-key')
    monkeypatch.setenv('SENDGRID_FROM_EMAIL', 'sender@example.test')
    monkeypatch.setenv('PUBLIC_SITE_URL', 'https://example.test')
    monkeypatch.setattr(request, 'urlopen', send)
    contest = {'slug': 'test-contest', 'title': 'Win <a prize>', 'end_date': '2026-01-03T12:00:00Z'}
    user360_routes._send_sendgrid_campaign_email('user@example.test', 'Alert', 'Hello', 'https://example.test/unsubscribe', {'latest': [contest], 'closing_soon': [contest]}, 'help@example.test')
    text, html = [item['value'] for item in requests[0]['content']]
    assert 'Latest contests' in text and 'Closing soon' in text
    assert 'https://example.test/competition/test-contest' in text
    assert 'closes 03 Jan 2026, 12:00 UTC' in text
    assert 'Win &lt;a prize&gt;' in html and 'Win <a prize>' not in html
    assert 'instagram.com/prizeleague' in html and 'chat.whatsapp.com' in html and 'mailto:help@example.test' in html
    assert 'https://example.test/unsubscribe' in html and 'https://example.test/unsubscribe' in text
    user360_routes._send_sendgrid_campaign_email('user@example.test', 'Alert', 'Hello', 'https://example.test/unsubscribe')
    assert 'Latest contests' not in requests[1]['content'][1]['value']


def test_campaign_email_worker_passes_selected_contests(monkeypatch):
    from datetime import datetime, timedelta, timezone
    from types import SimpleNamespace
    import deps

    class Cursor:
        def sort(self, *args):
            return self
        def limit(self, *args):
            return self
        async def to_list(self, *args):
            return [{'slug': 'live', 'title': 'Live', 'status': 'live',
                     'created_at': datetime.now(timezone.utc),
                     'end_date': datetime.now(timezone.utc) + timedelta(days=1)}]
    class Contests:
        def find(self, *args):
            return Cursor()
    class Settings:
        async def find_one(self, query, projection):
            return {'email_support': 'help@example.test'} if query['_id'] == 'company' else None
    class Deliveries:
        async def find_one_and_update(self, *args, **kwargs):
            return {'delivery_id': 'delivery'}
        async def update_one(self, *args, **kwargs):
            pass
    db = SimpleNamespace(contests=Contests(), settings=Settings(), alert_deliveries=Deliveries())
    captured = []
    async def recount(*args):
        pass
    monkeypatch.setattr(deps, 'get_db', lambda: db)
    monkeypatch.setattr(user360_routes, '_campaign_email_configured', lambda: True)
    monkeypatch.setattr(user360_routes, '_recount_campaign', recount)
    monkeypatch.setattr(user360_routes, '_send_sendgrid_campaign_email', lambda *args: captured.append(args) or (202, 'id'))
    asyncio.run(user360_routes._send_campaign_email('campaign', 'Title', 'Message', [
        {'delivery_id': 'delivery', 'email': 'user@example.test', 'unsubscribe_token': 'token'},
    ], True))
    assert [contest['slug'] for contest in captured[0][4]['latest']] == ['live']
    assert [contest['slug'] for contest in captured[0][4]['closing_soon']] == ['live']
    assert captured[0][5] == 'help@example.test'


def test_scheduled_alert_is_not_sent_immediately(monkeypatch, safe_db, users):
    from datetime import datetime, timedelta, timezone

    sent = []
    monkeypatch.setattr(user360_routes, '_campaign_email_configured', lambda: True)
    monkeypatch.setattr(user360_routes, '_send_sendgrid_campaign_email', lambda *args: sent.append(args[0]) or (202, 'test'))

    async def run(db):
        admin_id = f"admin_{users['ready'].rsplit('_', 1)[-1]}"
        _admin(monkeypatch, db, admin_id)
        target_ids = [users['ready'], users['off']]
        await db.users.update_many({'user_id': {'$in': target_ids}}, {'$set': {'marketing_email_consent': True}})
        scheduled_at = datetime.now(timezone.utc) + timedelta(hours=1)
        payload = user360_routes.AdminAlertCreateRequest(
            title='Scheduled test', message='Body', channels=['in_app', 'email'],
            audience=user360_routes.AudienceSpec(mode='users', identifiers=target_ids),
            scheduled_at=scheduled_at,
        )
        tasks = BackgroundTasks()
        result = await user360_routes.create_alert_campaign(payload, None, tasks)
        await tasks()
        campaign_id = result['campaign_id']
        assert result['status'] == 'scheduled' and result['targeted_count'] == 2
        detail = await user360_routes.get_alert_campaign(campaign_id, None)
        assert 'target_user_ids' not in detail
        assert detail['cost_estimate']['targeted_count'] == 2
        assert await db.notifications.count_documents({'campaign_id': campaign_id}) == 0
        assert await db.alert_deliveries.count_documents({'campaign_id': campaign_id}) == 0
        assert await user360_routes.process_due_alert_campaigns(db, scheduled_at - timedelta(seconds=1)) == 0
        await db.users.update_one({'user_id': users['off']}, {'$set': {'marketing_email_consent': False}})
        processed = await asyncio.gather(
            user360_routes.process_due_alert_campaigns(db, scheduled_at + timedelta(seconds=1)),
            user360_routes.process_due_alert_campaigns(db, scheduled_at + timedelta(seconds=1)),
        )
        assert sum(processed) == 1
        assert await db.notifications.count_documents({'campaign_id': campaign_id}) == 2
        deliveries = await db.alert_deliveries.find({'campaign_id': campaign_id, 'channel': 'email'}).to_list(10)
        by_user = _by_user(deliveries)
        assert by_user[users['ready']]['status'] == 'accepted'
        assert by_user[users['off']]['status'] == 'skipped' and by_user[users['off']]['reason'] == 'no_email_consent'
        assert sent == [f"{users['ready']}@example.test"]
        assert await user360_routes.process_due_alert_campaigns(db, scheduled_at + timedelta(seconds=2)) == 0
    run_db(safe_db, run)


def test_scheduled_alert_rejects_past_or_naive_times(monkeypatch):
    from datetime import datetime, timedelta, timezone
    from fastapi import HTTPException

    async def admin(_request):
        return {'user_id': 'admin'}
    monkeypatch.setattr(user360_routes, 'require_admin', admin)
    for scheduled_at in (datetime.now(timezone.utc) - timedelta(minutes=1), datetime.now() + timedelta(hours=1)):
        payload = user360_routes.AdminAlertCreateRequest(title='Test', message='Body', scheduled_at=scheduled_at)
        with pytest.raises(HTTPException) as exc:
            asyncio.run(user360_routes.create_alert_campaign(payload, None, BackgroundTasks()))
        assert exc.value.status_code == 400


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
