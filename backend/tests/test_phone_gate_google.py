"""Unit tests: Google accounts must verify their mobile; promotion token/ticket endpoints are gated."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import auth
from routers import promotion_routes


def _request():
    return Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': []})


OLD = datetime(2026, 1, 1, tzinfo=timezone.utc)
NEW = datetime(2026, 10, 20, tzinfo=timezone.utc)


@pytest.mark.parametrize('user,blocked', [
    ({'method': 'google', 'phone_verified': False, 'created_at': NEW, 'role': 'user'}, True),
    ({'method': 'google', 'phone_verified': False, 'created_at': OLD, 'role': 'user'}, True),
    ({'method': 'google', 'created_at': OLD, 'role': 'user'}, True),
    ({'method': 'google', 'phone_verified': True, 'created_at': NEW, 'role': 'user'}, False),
    ({'method': 'google', 'phone_verified': False, 'created_at': NEW, 'role': 'admin'}, False),
    ({'method': 'email', 'phone_verified': False, 'created_at': NEW, 'role': 'user'}, True),
    ({'method': 'email', 'phone_verified': False, 'created_at': OLD, 'role': 'user'}, False),
    ({'method': 'email', 'phone_verified': True, 'created_at': NEW, 'role': 'user'}, False),
])
def test_phone_gate_rules(monkeypatch, user, blocked):
    monkeypatch.delenv('PHONE_GATE_ENFORCE_LEGACY', raising=False)
    assert auth.phone_gate_blocks(user) is blocked


@pytest.mark.parametrize('handler,args', [
    (promotion_routes.claim_promotion_campaign, ('promo-1',)),
    (promotion_routes.join_promotion, ()),
])
def test_promotion_credit_endpoints_reject_unverified_google_user(monkeypatch, handler, args):
    unverified = {'user_id': 'g1', 'method': 'google', 'phone_verified': False, 'created_at': OLD, 'role': 'user'}

    async def fake_current_user(_request, _db=None):
        return unverified

    monkeypatch.setattr(auth, 'get_current_user', fake_current_user)
    monkeypatch.setattr(promotion_routes, 'get_db', lambda: pytest.fail('unverified user reached the database'))

    async def run():
        with pytest.raises(HTTPException) as error:
            await handler(*args, _request())
        assert error.value.status_code == 403
        assert error.value.detail['code'] == 'PHONE_VERIFICATION_REQUIRED'

    asyncio.run(run())
