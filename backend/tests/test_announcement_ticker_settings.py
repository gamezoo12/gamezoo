import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from routers import announcement_routes


def test_ticker_settings_default_and_validation():
    db = SimpleNamespace(site_announcement_settings=SimpleNamespace(find_one=AsyncMock(return_value=None)))
    assert asyncio.run(announcement_routes._ticker_settings(db)) == {'duration_seconds': 30}
    for value in (9, 121):
        with pytest.raises(ValidationError):
            announcement_routes.TickerSettingsIn(duration_seconds=value)


def test_super_admin_saves_ticker_settings_and_audit(monkeypatch):
    settings = SimpleNamespace(find_one=AsyncMock(return_value={'duration_seconds': 30}), update_one=AsyncMock())
    db = SimpleNamespace(site_announcement_settings=settings)
    monkeypatch.setattr(announcement_routes, 'get_db', lambda: db)
    monkeypatch.setattr(announcement_routes, 'require_super_admin', AsyncMock(return_value={'user_id': 'super'}))
    audit = AsyncMock()
    monkeypatch.setattr(announcement_routes, '_audit', audit)
    result = asyncio.run(announcement_routes.save_ticker_settings(
        announcement_routes.TickerSettingsIn(duration_seconds=65), SimpleNamespace(),
    ))
    assert result == {'duration_seconds': 65}
    settings.update_one.assert_awaited_once_with({'_id': 'ticker'}, {'$set': {'duration_seconds': 65}}, upsert=True)
    audit.assert_awaited_once()


def test_non_super_admin_cannot_read_or_change_ticker_settings(monkeypatch):
    monkeypatch.setattr(announcement_routes, 'require_super_admin', AsyncMock(side_effect=HTTPException(403, 'Super Admin only')))
    with pytest.raises(HTTPException) as read_error:
        asyncio.run(announcement_routes.admin_ticker_settings(SimpleNamespace()))
    assert read_error.value.status_code == 403
    with pytest.raises(HTTPException) as write_error:
        asyncio.run(announcement_routes.save_ticker_settings(
            announcement_routes.TickerSettingsIn(duration_seconds=65), SimpleNamespace(),
        ))
    assert write_error.value.status_code == 403


def test_public_feed_contains_configured_ticker_duration(monkeypatch):
    db = MagicMock()
    db.__getitem__.return_value.find.return_value.to_list = AsyncMock(return_value=[])
    db.site_ticker_overrides.find.return_value.__aiter__.return_value = []
    db.site_announcement_settings.find_one = AsyncMock(return_value={'duration_seconds': 65})
    monkeypatch.setattr(announcement_routes, 'get_db', lambda: db)
    monkeypatch.setattr(announcement_routes, '_promotion_winner', AsyncMock(return_value=None))
    result = asyncio.run(announcement_routes.public_announcements())
    assert result['ticker_settings'] == {'duration_seconds': 65}