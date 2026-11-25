import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from routers import paid_winners_routes


def test_public_winner_ticket_count_uses_valid_contest_entries():
    expected = [{'_id': 'player-1', 'count': 7}]
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=expected)
    tickets = MagicMock()
    tickets.aggregate.return_value = cursor
    db = MagicMock(tickets=tickets)

    counts = asyncio.run(paid_winners_routes._winner_ticket_counts(db, 'contest-1', ['player-1']))

    assert counts == {'player-1': 7}
    match = tickets.aggregate.call_args.args[0][0]['$match']
    assert match['refunded'] == {'$ne': True}
    assert match['disqualified'] == {'$ne': True}


def test_public_winner_entry_includes_ticket_purchase_count(monkeypatch):
    winner = {'user_id': 'player-1', 'user_name': 'Player One', 'ticket_number': 77,
              'source': 'draw_studio', 'published': True, 'approval_status': 'credited'}
    db = MagicMock()
    db.winners.find.return_value.sort.return_value.to_list = AsyncMock(return_value=[winner])
    db.tickets.aggregate.return_value.to_list = AsyncMock(return_value=[{'_id': 'player-1', 'count': 14}])
    monkeypatch.setattr(paid_winners_routes, 'get_db', lambda: db)
    monkeypatch.setattr(paid_winners_routes, '_visible', AsyncMock(return_value={
        'contest_id': 'contest-1', 'title': 'Contest', 'kind': 'draw', 'publication': {}, 'end_date': None,
    }))

    response = asyncio.run(paid_winners_routes.public_winners('contest-1'))

    assert response['winners'][0]['tickets_purchased'] == 14


@pytest.mark.parametrize("cash,bonus", [(50, 25), (0, 25), (50, 0)])
def test_published_contest_card_includes_bonus_prize(monkeypatch, cash, bonus):
    contest = {"contest_id": "contest-1", "title": "Contest", "status": "drawn",
               "end_date": None, "prize_amount": cash, "prize_bonus_tokens": bonus}
    db = MagicMock()
    db.contests.find.return_value.to_list = AsyncMock(return_value=[contest])
    db.paid_winner_publication.find.return_value.__aiter__.return_value = []
    db.winners.distinct = AsyncMock(return_value=[])
    db.draw_studio_plans.distinct = AsyncMock(return_value=[])
    monkeypatch.setattr(paid_winners_routes, "_promotion_contests", AsyncMock(return_value=[]))

    contests = asyncio.run(paid_winners_routes._contests(db))
    card = paid_winners_routes._card(contests[0])

    assert db.contests.find.call_args.args[1]["prize_bonus_tokens"] == 1
    assert card["prize_amount"] == cash
    assert card["prize_bonus_tokens"] == bonus


def test_published_contest_card_includes_other_prize_description_and_value(monkeypatch):
    contest = {"contest_id": "contest-other", "title": "Tablet draw", "status": "drawn",
               "end_date": None, "prize_amount": 0, "prize_bonus_tokens": 0,
               "prize_type": "other", "other_prize_description": "Tablet", "other_prize_value": 800}
    db = MagicMock()
    db.contests.find.return_value.to_list = AsyncMock(return_value=[contest])
    db.paid_winner_publication.find.return_value.__aiter__.return_value = []
    db.winners.distinct = AsyncMock(return_value=[])
    db.draw_studio_plans.distinct = AsyncMock(return_value=[])
    monkeypatch.setattr(paid_winners_routes, "_promotion_contests", AsyncMock(return_value=[]))

    card = paid_winners_routes._card(asyncio.run(paid_winners_routes._contests(db))[0])

    assert card["prize_type"] == "other"
    assert card["other_prize_description"] == "Tablet"
    assert card["other_prize_value"] == 800