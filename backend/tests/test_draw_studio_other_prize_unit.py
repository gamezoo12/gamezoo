import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from routers import draw_studio_routes, paid_winners_routes


class Winners:
    def __init__(self, row):
        self.row = dict(row)
        self.updates = []

    async def find_one(self, _query, *_args, **_kwargs):
        return dict(self.row)

    async def update_one(self, _query, update, **_kwargs):
        self.updates.append(update)
        self.row.update(update.get('$set', {}))
        for key in update.get('$unset', {}):
            self.row.pop(key, None)
        return SimpleNamespace(modified_count=1)


class Database:
    def __init__(self, winner):
        self.winners = Winners(winner)
        self.studio_audit = []
        self.paid_audit = []

    def __getitem__(self, collection):
        if collection == draw_studio_routes.AUDIT:
            return SimpleNamespace(insert_one=self._studio_insert)
        raise KeyError(collection)

    async def _studio_insert(self, doc):
        self.studio_audit.append(dict(doc))


def test_other_prize_round_requires_description_and_keeps_budget_value():
    round_data = draw_studio_routes.RoundIn(
        name='Grand', prize_amount=1200, num_winners=1, reward_type='other',
        other_prize_description='Tablet',
    ).model_dump()
    result = asyncio.run(draw_studio_routes._validate(None, {'prize_amount': 1200}, [round_data], 10))
    assert result == (1200, 1200)

    invalid = draw_studio_routes.RoundIn(name='Grand', prize_amount=1200, num_winners=1, reward_type='other').model_dump()
    with pytest.raises(HTTPException) as error:
        asyncio.run(draw_studio_routes._validate(None, {'prize_amount': 1200}, [invalid], 10))
    assert error.value.status_code == 422


def test_other_prize_fulfillment_never_credits_a_wallet(monkeypatch):
    winner = {
        'winner_id': 'winner-1', 'contest_id': 'contest-1', 'user_id': 'player-1',
        'source': 'draw_studio', 'draw_plan_id': 'plan-1', 'reward_type': 'other',
        'other_prize_description': 'Tablet', 'prize_amount': 1200,
        'approval_status': 'pending', 'paid_out': False,
    }
    db = Database(winner)
    admin = {'user_id': 'super-1', 'email': 'super@example.test'}
    monkeypatch.setattr(paid_winners_routes, 'get_db', lambda: db)
    monkeypatch.setattr(paid_winners_routes, 'require_super_admin', AsyncMock(return_value=admin))
    monkeypatch.setattr(paid_winners_routes, '_audit', AsyncMock())
    monkeypatch.setattr(draw_studio_routes, '_audit', AsyncMock())

    result = asyncio.run(paid_winners_routes.approve(
        'winner-1', paid_winners_routes.ApproveIn(wallet='other'), SimpleNamespace(),
    ))

    assert result['winner']['approval_status'] == 'credited'
    assert result['winner']['payment_status'] == 'fulfilled'
    assert result['winner']['credited_wallet'] == 'other'
    assert result['wallet_label'] == 'Other prize fulfilled'
    assert 'wallet_transaction_ids' not in result['winner']
    assert all('$inc' not in update for update in db.winners.updates)
