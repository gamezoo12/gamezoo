import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import deps
from models import Contest
from routers import admin_routes
from routers.order_routes import _allocate_contest_bonus
from routers.wallet_routes import _split_debit


def test_bonus_allowance_is_shared_across_contest_lines_and_prior_orders():
    items = [
        {'contest_id': 'limited', 'line_total': 3},
        {'contest_id': 'unlimited', 'line_total': 4},
        {'contest_id': 'limited', 'line_total': 3},
        {'contest_id': 'none', 'line_total': 2},
    ]
    contests = {
        'limited': {'bonus_token_limit_per_user': 5},
        'unlimited': {},
        'none': {'bonus_token_limit_per_user': 0},
    }
    assert _allocate_contest_bonus(items, contests, {'limited': 1}) == [3, 4, 1, 0]
    assert _allocate_contest_bonus(items, contests, {'limited': 5}) == [0, 4, 0, 0]


def test_wallet_split_keeps_capped_bonus_separate_from_purchased_balance():
    assert _split_debit(20, 10, 3, 2, 0, 12, 4) == (4, 3, 0)
    assert _split_debit(20, 10, 3, 2, 0, 12, 0) == (0, 3, 2)
    assert _split_debit(20, 10, 3, 2, 0, 12) == (10, 2, 0)


@pytest.mark.parametrize('value', [-1, float('inf'), 0.001])
def test_contest_rejects_invalid_bonus_limits(value):
    with pytest.raises(ValidationError):
        Contest.model_validate({
            'slug': 'test', 'title': 'Test', 'end_date': '2027-01-01T00:00:00Z', 'image': 'image',
            'skill_question': {'q': 'Q', 'options': ['A'], 'answer': 'A'},
            'bonus_token_limit_per_user': value,
        })


def test_admin_can_create_contest_with_limit_but_cannot_change_it_after_launch(monkeypatch):
    db = MagicMock()
    db.contests.insert_one = AsyncMock()
    db.contests.find_one = AsyncMock(return_value={'status': 'live', 'bonus_token_limit_per_user': 3})
    db.tickets.find_one = AsyncMock(return_value=None)
    db.contests.update_one = AsyncMock()
    monkeypatch.setattr(deps, 'get_db', lambda: db)
    monkeypatch.setattr(admin_routes, 'require_admin', AsyncMock(return_value={'role': 'admin'}))

    created = asyncio.run(admin_routes.create_contest_api({
        'title': 'Limited contest', 'status': 'draft', 'bonus_token_limit_per_user': 3,
    }, SimpleNamespace()))
    assert created['contest']['bonus_token_limit_per_user'] == 3
    assert db.contests.insert_one.await_args.args[0]['bonus_token_limit_per_user'] == 3

    with pytest.raises(HTTPException) as error:
        asyncio.run(admin_routes.update_contest_full('contest-1', {'bonus_token_limit_per_user': 5}, SimpleNamespace()))
    assert error.value.status_code == 409
    db.contests.update_one.assert_not_awaited()