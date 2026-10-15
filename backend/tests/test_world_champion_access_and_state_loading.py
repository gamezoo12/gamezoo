import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routers import world_routes


@pytest.mark.parametrize("stage", [1, 2, 3, 4, 10])
def test_champion_access_does_not_require_paid_contest_entry(monkeypatch, stage):
    async def forbidden(*_a, **_k):
        raise AssertionError("paid contest evidence must not be consulted")

    monkeypatch.setattr(world_routes, "_paid_contest_qualification_evidence", forbidden)

    gate = asyncio.run(world_routes._enforce_champion_paid_qualification(None, "u1", stage, 7))
    prize = asyncio.run(world_routes._champion_prize_qualification(None, "u1", stage, 7))

    assert gate["required"] is False and gate["qualified"] is True
    assert gate["champion_stage"] == stage and gate["global_contest_number"] == 7
    assert prize == {"required": False, "qualified": True, "reason": "paid_contest_entry_not_required"}


def test_champion_session_start_keeps_progression_and_attempt_checks():
    import inspect

    body = inspect.getsource(world_routes.champion_session_start)
    assert "_enforce_champion_paid_qualification(" in body
    assert "_champion_attempt_status(" in body
    assert "No Champion attempts remain" in body


class Cursor:
    def __init__(self, rows=None):
        self.rows = rows or []

    def sort(self, *_a, **_k):
        return self

    async def to_list(self, *_a, **_k):
        return list(self.rows)


def test_state_loads_ten_levels_in_order_with_concurrency_capped_at_four(monkeypatch):
    running = 0
    peak = 0

    async def config(_db, level, _stage):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        return {"level": level}

    async def unlock(_db, level, _progress):
        return {"available": True, "unlock_for": level}

    async def no_contest(_db):
        return None

    async def no_schedule(*_a, **_k):
        return {}

    async def unauthenticated(_request):
        raise HTTPException(status_code=401)

    db = SimpleNamespace(
        world_settings=SimpleNamespace(find_one=lambda *_a, **_k: asyncio.sleep(0, result=None)),
        world_global_contests=SimpleNamespace(find=lambda *_a, **_k: Cursor()),
    )

    monkeypatch.setattr(world_routes, "get_db", lambda: db)
    monkeypatch.setattr(world_routes, "get_current_user", unauthenticated)
    monkeypatch.setattr(world_routes, "_effective_level_config", config)
    monkeypatch.setattr(world_routes, "_resolve_unlock_context", unlock)
    monkeypatch.setattr(world_routes, "_active_contest", no_contest)
    monkeypatch.setattr(world_routes, "_champion_schedule_for", no_schedule)

    state = asyncio.run(world_routes.free_world_state(None))

    assert [row["level"] for row in state["levels"]] == list(range(1, 11))
    assert all(row["available"] for row in state["levels"])
    assert 1 < peak <= 4
