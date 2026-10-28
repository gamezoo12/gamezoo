"""Unit tests for the isolated universal-game readiness policy.

Run: cd backend && python -m pytest tests/test_universal_game_policy.py
"""
from dataclasses import replace

from services.universal_game_policy import (
    GameWorld, Readiness, WorldGamePolicy, PRACTICE_GAME_IDS,
    eligible_for_prize_play, default_world_policies,
)


def test_all_default_policies_are_disabled():
    policies = default_world_policies(["memory_match", "maze_escape_practice"])
    assert len(policies) == 6
    assert all(not p.enabled and not p.prize_eligible for p in policies)
    assert all(not eligible_for_prize_play(p, registered_games={"memory_match": {}},
                                           verified_validators={"memory_match": "v1"})
               for p in policies)


def test_practice_games_never_eligible_even_if_marked_verified():
    for game_id in PRACTICE_GAME_IDS:
        p = WorldGamePolicy(game_id, GameWorld.PAID, Readiness.VERIFIED, True, True, "v1")
        assert not eligible_for_prize_play(p, registered_games={game_id: {}},
                                           verified_validators={game_id: "v1"})


def test_verified_game_requires_all_trusted_conditions():
    p = WorldGamePolicy("memory_match", GameWorld.FREE, Readiness.VERIFIED, True, True, "v1")
    assert eligible_for_prize_play(p, registered_games={"memory_match": {}},
                                   verified_validators={"memory_match": "v1"})
    assert not eligible_for_prize_play(p, registered_games={},
                                       verified_validators={"memory_match": "v1"})
    assert not eligible_for_prize_play(p, registered_games={"memory_match": {}},
                                       verified_validators={"memory_match": "v2"})
    for changed in (
        replace(p, enabled=False),
        replace(p, prize_eligible=False),
        replace(p, readiness=Readiness.AUDIT),
        replace(p, validator_version=None),
    ):
        assert not eligible_for_prize_play(changed, registered_games={"memory_match": {}},
                                           verified_validators={"memory_match": "v1"})


def test_worlds_have_independent_policy_records():
    policies = default_world_policies(["memory_match"])
    assert {p.world for p in policies} == set(GameWorld)
    assert len({(p.world, p.game_id) for p in policies}) == 3
