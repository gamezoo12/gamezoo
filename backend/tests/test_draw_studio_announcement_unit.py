import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from routers import announcement_routes, draw_studio_routes


def test_announcement_text_has_no_length_limit_and_keeps_safety_checks():
    text = 'Winner announcement ' * 100
    body = announcement_routes.AnnouncementIn(title='Winners', text=text)
    assert announcement_routes._validated(body)['text'] == text.strip()
    generated = announcement_routes.GeneratedAnnouncementIn(text=text)
    assert announcement_routes._clean_text(generated.text, 'Announcement text') == text.strip()
    with pytest.raises(HTTPException):
        announcement_routes._validated(announcement_routes.AnnouncementIn(title='Winners', text='<script>'))
    with pytest.raises(HTTPException):
        announcement_routes._validated(announcement_routes.AnnouncementIn(title='Winners', text='  '))


@pytest.mark.parametrize("all_winners", [False, True])
def test_long_winner_announcements_pass_publishing_validation(monkeypatch, all_winners):
    winners = [{"ticket_number": number, "display_name": f"Winnername{number} Longname"} for number in range(1, 21)]
    plan = {"plan_id": "plan-1", "contest_title": "Draw", "rounds": [
        {"name": "Grand", "prize_amount": 10, "reward_type": "winnings"},
    ]}
    result = {"plan_id": "plan-1", "round_index": 0, "winners": winners}
    plans = MagicMock()
    plans.find_one = AsyncMock(return_value=plan)
    plans.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    results = MagicMock()
    results.find_one = AsyncMock(return_value=result)
    results.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    results.find.return_value.sort.return_value.to_list = AsyncMock(return_value=[result])
    winner_collection = MagicMock()
    winner_collection.update_many = AsyncMock()
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: {draw_studio_routes.PLANS: plans, draw_studio_routes.RESULTS: results}[name]
    db.winners = winner_collection
    admin = AsyncMock(return_value={"user_id": "super-admin", "role": "super_admin"})
    create = AsyncMock(return_value={"announcement_id": "announcement-1"})

    async def validate_and_create(body, request):
        announcement_routes._validated(body)
        return await create(body, request)

    monkeypatch.setattr(draw_studio_routes, "get_db", lambda: db)
    monkeypatch.setattr(draw_studio_routes, "require_super_admin", admin)
    monkeypatch.setattr(draw_studio_routes, "_audit", AsyncMock())
    monkeypatch.setattr(announcement_routes, "create_announcement", validate_and_create)
    request = SimpleNamespace()
    call = draw_studio_routes.announce_all("plan-1", request) if all_winners else draw_studio_routes.announce_round("plan-1", 0, request)
    response = asyncio.run(call)

    assert response["announcement_id"] == "announcement-1"
    text = create.await_args.args[0].text
    assert len(text) > 300
    assert all(f"#{winner['ticket_number']} {winner['display_name']}" in text for winner in winners)
    winner_collection.update_many.assert_awaited_once()