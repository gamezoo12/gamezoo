import pytest
from fastapi import HTTPException

from routers.order_routes import _choose_random_ticket_numbers


def test_random_tickets_use_full_range_and_exclude_existing_numbers(monkeypatch):
    class FixedRandom:
        def sample(self, population, quantity):
            assert quantity == 3
            return [population[-1], population[0], population[3]]

    monkeypatch.setattr('routers.order_routes.secrets.SystemRandom', FixedRandom)
    assert _choose_random_ticket_numbers(10, {2, 5, 9}, 3) == [10, 1, 6]


def test_random_tickets_handle_nearly_full_and_exhausted_contests():
    assert _choose_random_ticket_numbers(5, {1, 2, 4, 5}, 1) == [3]
    with pytest.raises(HTTPException) as error:
        _choose_random_ticket_numbers(5, {1, 2, 4, 5}, 2)
    assert error.value.status_code == 409