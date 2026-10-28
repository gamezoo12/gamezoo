"""Fail-closed eligibility policy for a future three-world games rollout.

This module deliberately does NOT register routes, mutate wallets or change the
existing game registry. No game is eligible for prize play until independently
verified by a trusted backend implementation and explicitly enabled per world.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Mapping


class GameWorld(str, Enum):
    FREE = "free_world"
    PAID = "paid_world"
    IMPOSSIBLE = "impossible_challenges"


class Readiness(str, Enum):
    PRACTICE = "practice_only"
    AUDIT = "existing_game_audit_required"
    VERIFIED = "server_verified"


# Prototype IDs are intentionally distinct from the live game registry.
PRACTICE_GAME_IDS = frozenset({
    "maze_escape_practice", "ball_sort_practice", "hanoi_practice",
    "liquid_sort_practice", "spot_difference_practice", "path_connect_practice",
})


@dataclass(frozen=True)
class WorldGamePolicy:
    game_id: str
    world: GameWorld
    readiness: Readiness = Readiness.PRACTICE
    enabled: bool = False
    prize_eligible: bool = False
    validator_version: str | None = None


def eligible_for_prize_play(
    policy: WorldGamePolicy | None,
    *,
    registered_games: Mapping[str, object],
    verified_validators: Mapping[str, str],
) -> bool:
    """Require all conditions; never trust readiness or score from the browser.

    verified_validators is a trusted backend-owned mapping of game IDs to
    deployed validator versions, not a client-provided request field.
    """
    if policy is None or policy.game_id in PRACTICE_GAME_IDS:
        return False
    if not isinstance(policy.world, GameWorld):
        return False
    if policy.game_id not in registered_games:
        return False
    if policy.readiness is not Readiness.VERIFIED:
        return False
    if not policy.enabled or not policy.prize_eligible:
        return False
    if not policy.validator_version:
        return False
    return verified_validators.get(policy.game_id) == policy.validator_version


def default_world_policies(game_ids):
    """All worlds start disabled, including existing registered games."""
    return tuple(
        WorldGamePolicy(game_id=game_id, world=world, readiness=(
            Readiness.PRACTICE if game_id in PRACTICE_GAME_IDS else Readiness.AUDIT
        ))
        for game_id in game_ids for world in GameWorld
    )
