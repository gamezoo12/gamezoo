"""Admin Alert campaign tests for Web Push channels and scheduling."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks, HTTPException
from starlette.requests import Request

from routers import admin_alerts_routes


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    def limit(self, _limit):
        return self

    async def to_list(self, _limit):
        return list(self.rows)


class _Users:
    def find(self, *_args, **_kwargs):
        return _Cursor([{'user_id': 'user-1', 'email': 'user@example.test'}])


class _Store:
    def __init__(self):
        self.rows = []

    async def insert_one(self, row):
        self.rows.append(dict(row))

    async def insert_many(self, rows, ordered=False):
        self.rows.extend(dict(row) for row in rows)


def _request():
    return Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': []})


def test_scheduled_push_campaign_tracks_channels_without_sending(monkeypatch):
    campaigns = _Store()
    deliveries = _Store()
    db = SimpleNamespace(users=_Users(), alert_campaigns=campaigns, alert_deliveries=deliveries)
    monkeypatch.setattr(admin_alerts_routes, 'require_admin', AsyncMock(return_value={'user_id': 'admin-1'}))
    monkeypatch.setattr(admin_alerts_routes, 'get_db', lambda: db)
    scheduled_at = datetime.now(timezone.utc) + timedelta(hours=1)
    payload = admin_alerts_routes.CampaignInput(
        title='Contest update', message='A new contest is available.',
        action_url='https://prizeleague.co.uk/competitions',
        channels=['in_app', 'web_push', 'native_push'],
        audience={'mode': 'users', 'identifiers': ['user-1']},
        scheduled_at=scheduled_at,
    )

    result = asyncio.run(admin_alerts_routes.create_campaign(payload, _request(), BackgroundTasks()))

    assert result['status'] == 'scheduled'
    assert campaigns.rows[0]['channels'] == ['in_app', 'web_push', 'native_push']
    assert campaigns.rows[0]['scheduled_at'] == scheduled_at
    assert len(deliveries.rows) == 3
    assert {row['channel'] for row in deliveries.rows} == {'in_app', 'web_push', 'native_push'}
    assert all(row['status'] == 'pending' for row in deliveries.rows)


def test_alert_campaign_rejects_past_schedule(monkeypatch):
    db = SimpleNamespace(users=_Users(), alert_campaigns=_Store(), alert_deliveries=_Store())
    monkeypatch.setattr(admin_alerts_routes, 'require_admin', AsyncMock(return_value={'user_id': 'admin-1'}))
    monkeypatch.setattr(admin_alerts_routes, 'get_db', lambda: db)
    payload = admin_alerts_routes.CampaignInput(
        title='Past campaign', message='Not sent.', channels=['web_push'],
        audience={'mode': 'users', 'identifiers': ['user-1']},
        scheduled_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    async def run():
        with pytest.raises(HTTPException) as error:
            await admin_alerts_routes.create_campaign(payload, _request(), BackgroundTasks())
        assert error.value.status_code == 400

    asyncio.run(run())


def test_due_campaigns_dispatch_through_existing_processor(monkeypatch):
    class DueCampaigns:
        def find(self, _query, _projection):
            return self

        def sort(self, *_args):
            return self

        def limit(self, _limit):
            return self

        async def to_list(self, _limit):
            return [{'campaign_id': 'campaign-1'}]

    db = SimpleNamespace(alert_campaigns=DueCampaigns())
    dispatched = []

    async def process(campaign_id):
        dispatched.append(campaign_id)

    monkeypatch.setattr(admin_alerts_routes, '_process', process)
    count = asyncio.run(admin_alerts_routes.process_due_campaigns(db, datetime.now(timezone.utc)))

    assert count == 1
    assert dispatched == ['campaign-1']