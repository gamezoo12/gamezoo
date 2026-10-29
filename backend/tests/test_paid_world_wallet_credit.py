from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from routers import admin_routes


def _request():
    return Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': []})


class _Winners:
    def __init__(self, row):
        self.row = row

    async def find_one(self, query, _projection=None):
        return dict(self.row) if query.get('winner_id') == self.row['winner_id'] else None

    async def update_one(self, query, update):
        if query.get('winner_id') != self.row['winner_id'] or self.row.get('paid_out') is True:
            return SimpleNamespace(matched_count=0)
        self.row.update(update['$set'])
        return SimpleNamespace(matched_count=1)


class _Audit:
    def __init__(self):
        self.rows = {}

    async def update_one(self, query, update, upsert=False):
        assert upsert is True
        self.rows.setdefault(query['audit_id'], update['$setOnInsert'])


@pytest.mark.parametrize('role', ['admin', 'operator', 'support'])
def test_paid_world_wallet_credit_requires_super_admin(monkeypatch, role):
    async def require_admin(_request):
        return {'user_id': 'staff', 'role': role}

    monkeypatch.setattr(admin_routes, 'require_admin', require_admin)

    async def run():
        with pytest.raises(HTTPException) as error:
            await admin_routes.mark_paid('winner-1', _request())
        assert error.value.status_code == 403

    asyncio.run(run())


def test_mixed_prize_mark_paid_credits_cash_and_winning_bonus_once(monkeypatch):
    row = {
        'winner_id': 'winner-mixed', 'contest_id': 'contest-paid', 'user_id': 'player-1',
        'prize_title': 'Mixed prize', 'prize_amount': 25, 'prize_bonus_tokens': 8,
        'paid_out': False,
    }
    winners, audit = _Winners(row), _Audit()
    db = SimpleNamespace(winners=winners, audit_log=audit)
    refs = {}
    calls = []

    async def require_admin(_request):
        return {'user_id': 'super-1', 'email': 'super@example.test', 'role': 'super_admin'}

    async def apply_once(_db, user_id, kind, amount, *, note, ref_order_id):
        calls.append((user_id, kind, amount, ref_order_id))
        tx_id = refs.setdefault(ref_order_id, f'tx-{len(refs) + 1}')
        return {'tx': {'tx_id': tx_id}, 'balance': 33}

    monkeypatch.setattr(admin_routes, 'require_admin', require_admin)
    monkeypatch.setattr('deps.get_db', lambda: db)
    monkeypatch.setattr('routers.wallet_routes._apply_tx_idempotent', apply_once)

    async def run():
        first = await admin_routes.mark_paid('winner-mixed', _request())
        replay = await admin_routes.mark_paid('winner-mixed', _request())
        assert first['cash_tokens_credited'] == 25
        assert first['winning_bonus_tokens_credited'] == 8
        assert replay['idempotent'] is True
        assert calls == [
            ('player-1', 'paid_prize_cash', 25, 'paid-world:winner:winner-mixed:cash'),
            ('player-1', 'paid_prize_bonus', 8, 'paid-world:winner:winner-mixed:bonus'),
        ]
        assert row['paid_out'] is True and row['payment_status'] == 'paid'
        assert row['paid_by_user_id'] == 'super-1' and row['paid_at'] is not None
        assert len(audit.rows) == 1
        saved_audit = next(iter(audit.rows.values()))
        assert saved_audit['contest_id'] == 'contest-paid'
        assert saved_audit['cash_tokens'] == 25 and saved_audit['winning_bonus_tokens'] == 8

    asyncio.run(run())


def test_historical_paid_out_prize_is_not_credited_again(monkeypatch):
    row = {'winner_id': 'winner-old', 'contest_id': 'contest-old', 'user_id': 'player-1',
           'prize_amount': 50, 'paid_out': True}
    calls = []
    db = SimpleNamespace(winners=_Winners(row), audit_log=_Audit())

    async def require_admin(_request):
        return {'user_id': 'super-1', 'role': 'super_admin'}

    async def apply(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError('historical payout must not be credited')

    monkeypatch.setattr(admin_routes, 'require_admin', require_admin)
    monkeypatch.setattr('deps.get_db', lambda: db)
    monkeypatch.setattr('routers.wallet_routes._apply_tx_idempotent', apply)

    async def run():
        result = await admin_routes.mark_paid('winner-old', _request())
        assert result['idempotent'] is True and calls == []

    asyncio.run(run())
