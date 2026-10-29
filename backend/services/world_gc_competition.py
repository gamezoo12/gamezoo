"""Configuration contract for the separate future-GC competition model."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import secrets
from typing import Any

MIN_CONFIGURABLE_GC = 4
MAX_CONFIGURABLE_GC = 53
COMPETITION_MODELS = {"champion_only", "every_level"}
SUPPORTED_GAMES = {"number_sequence", "colour_match", "memory_match"} | {
    "jigsaw_3x3", "jigsaw_4x4", "slider_puzzle", "emoji_riddle", "target_tap", "word_unscramble", "math_sprint",
    "reaction_time", "trivia_quiz", "simon_says", "whack_a_mole", "odd_one_out", "color_match", "pattern_repeat",
    "sudoku_mini", "sequence_predict", "countdown_numbers", "word_ladder", "chess_mate_in_one", "tower_of_hanoi",
    "lights_out", "minesweeper_mini", "nonogram_mini", "tf2048_mini", "cryptogram", "anagram_finder",
    "maze_solver", "spot_pattern",
}
DEFAULT_LEVEL_BONUS_REWARDS = {1: 5, 2: 4, 3: 3, 4: 2, 5: 1}
MAX_LEVEL_BONUS_TOKENS = 500


def _gc_number(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError("GC number must be an integer")
    if not MIN_CONFIGURABLE_GC <= number <= MAX_CONFIGURABLE_GC:
        raise ValueError(f"Configurable GCs are {MIN_CONFIGURABLE_GC} through {MAX_CONFIGURABLE_GC}")
    return number


def _timestamp(value: Any, label: str) -> str | None:
    if value in (None, ""):
        return None
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be an ISO-8601 timestamp")
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat()


def default_gc_config(gc_number: int) -> dict:
    """Return a draft only; it is never an activation or a schedule write."""
    gc = _gc_number(gc_number)
    return {
        "season_id": "season-1",
        "gc_number": gc,
        "model": "champion_only",
        "activation_status": "draft",
        "levels": [
            {
                "level": level,
                "game_id": None,
                "game_config": {},
                "opens_at": None,
                "bonus_rewards": {str(rank): amount for rank, amount in DEFAULT_LEVEL_BONUS_REWARDS.items()},
            }
            for level in range(1, 11)
        ],
        "champion": {
            "game_id": None,
            "game_config": {},
            "opens_at": None,
            "closes_at": None,
            "prize_source": "existing_world_champion_prizes",
        },
        "created_at": None,
        "updated_at": None,
    }


def normalize_gc_config(gc_number: int, payload: dict, existing: dict | None = None) -> dict:
    """Validate editable fields while preserving activation state and prize source."""
    gc = _gc_number(gc_number)
    if not isinstance(payload, dict):
        raise ValueError("Configuration must be an object")
    current = deepcopy(existing or default_gc_config(gc))
    if int(current.get("gc_number", gc)) != gc:
        raise ValueError("Configuration GC does not match the requested GC")

    model = payload.get("model", current.get("model", "champion_only"))
    if model not in COMPETITION_MODELS:
        raise ValueError("Model must be champion_only or every_level")

    incoming_levels = payload.get("levels", current.get("levels", []))
    if not isinstance(incoming_levels, list):
        raise ValueError("Levels must be a list")
    by_level = {int(row["level"]): row for row in current.get("levels", []) if row.get("level") is not None}
    seen_levels = set()
    for row in incoming_levels:
        if not isinstance(row, dict):
            raise ValueError("Each level must be an object")
        try:
            level = int(row.get("level"))
        except (TypeError, ValueError):
            raise ValueError("Each level must have an integer level number")
        if not 1 <= level <= 10 or level in seen_levels:
            raise ValueError("Levels must contain unique numbers from 1 through 10")
        seen_levels.add(level)
        by_level[level] = {**by_level.get(level, {}), **row, "level": level}

    normalized_levels = []
    for level in range(1, 11):
        row = {**default_gc_config(gc)["levels"][level - 1], **by_level.get(level, {})}
        game_id = row.get("game_id")
        if game_id not in (None, "") and game_id not in SUPPORTED_GAMES:
            raise ValueError(f"Unsupported game for Level {level}")
        game_config = row.get("game_config") or {}
        if not isinstance(game_config, dict):
            raise ValueError(f"Level {level} game_config must be an object")
        rewards = row.get("bonus_rewards") or {}
        if not isinstance(rewards, dict):
            raise ValueError(f"Level {level} bonus_rewards must be an object")
        normalized_rewards = {}
        for rank, default_amount in DEFAULT_LEVEL_BONUS_REWARDS.items():
            try:
                amount = int(rewards.get(str(rank), rewards.get(rank, default_amount)))
            except (TypeError, ValueError):
                raise ValueError(f"Level {level} rank {rank} reward must be an integer")
            if not 0 <= amount <= MAX_LEVEL_BONUS_TOKENS:
                raise ValueError(f"Level {level} rank {rank} reward must be 0 through {MAX_LEVEL_BONUS_TOKENS}")
            normalized_rewards[str(rank)] = amount
        normalized_levels.append({
            **row,
            "game_id": game_id or None,
            "game_config": deepcopy(game_config),
            "opens_at": _timestamp(row.get("opens_at"), f"Level {level} opens_at"),
            "bonus_rewards": normalized_rewards,
        })

    champion = {**current.get("champion", {}), **payload.get("champion", {})}
    if champion.get("game_id") not in (None, "") and champion["game_id"] not in SUPPORTED_GAMES:
        raise ValueError("Unsupported Champion game")
    if not isinstance(champion.get("game_config") or {}, dict):
        raise ValueError("Champion game_config must be an object")
    champion = {
        **champion,
        "game_id": champion.get("game_id") or None,
        "game_config": deepcopy(champion.get("game_config") or {}),
        "opens_at": _timestamp(champion.get("opens_at"), "Champion opens_at"),
        "closes_at": _timestamp(champion.get("closes_at"), "Champion closes_at"),
        "prize_source": "existing_world_champion_prizes",
    }

    schedule = [row["opens_at"] for row in normalized_levels]
    configured_schedule = [value for value in schedule if value]
    if any(a >= b for a, b in zip(configured_schedule, configured_schedule[1:])):
        raise ValueError("Level opening times must be strictly increasing")
    if champion["opens_at"] and schedule[-1] and champion["opens_at"] <= schedule[-1]:
        raise ValueError("Champion must open after Level 10")
    if champion["opens_at"] and champion["closes_at"] and champion["closes_at"] <= champion["opens_at"]:
        raise ValueError("Champion must close after it opens")

    return {
        **current,
        "season_id": "season-1",
        "gc_number": gc,
        "model": model,
        "activation_status": current.get("activation_status", "draft"),
        "levels": normalized_levels,
        "champion": champion,
    }


def normalize_level_key(value: Any) -> str:
    if value == "champion":
        return "champion"
    if isinstance(value, str) and value.startswith("L"):
        value = value[1:]
    try:
        level = int(value)
    except (TypeError, ValueError):
        raise ValueError("Level must be 1 through 10 or champion")
    if not 1 <= level <= 10:
        raise ValueError("Level must be 1 through 10 or champion")
    return f"L{level}"


def memory_match_pair_count(config: dict, level_key: str) -> int:
    if level_key == "champion":
        game_config = config.get("champion", {}).get("game_config") or {}
        default = 10
    else:
        level = int(level_key[1:])
        row = next((item for item in config.get("levels", []) if int(item.get("level", 0)) == level), {})
        game_config = row.get("game_config") or {}
        default = min(12, 3 + level)
    pairs = game_config.get("pair_count", default)
    try:
        pairs = int(pairs)
    except (TypeError, ValueError):
        raise ValueError("Memory Match pair_count must be an integer")
    if not 2 <= pairs <= 16:
        raise ValueError("Memory Match pair_count must be 2 through 16")
    return pairs


def build_memory_match_board(pair_count: int) -> list[int]:
    if not 2 <= int(pair_count) <= 16:
        raise ValueError("Memory Match pair_count must be 2 through 16")
    board = list(range(int(pair_count))) * 2
    secrets.SystemRandom().shuffle(board)
    return board


def apply_memory_match_click(board: list[int], matched_positions: list[int], pending_position: int | None,
                             position: int) -> dict:
    if not 0 <= position < len(board):
        raise ValueError("Card position is outside this board")
    matched = set(matched_positions)
    if position in matched:
        raise ValueError("That card has already been matched")
    if pending_position == position:
        raise ValueError("Choose a different card")

    if pending_position is None:
        return {
            "symbol": board[position], "matched_positions": sorted(matched),
            "pending_position": position, "match": None,
        }

    if board[pending_position] == board[position]:
        matched.update((pending_position, position))
        match = True
    else:
        match = False
    return {
        "symbol": board[position], "matched_positions": sorted(matched),
        "pending_position": None, "match": match,
    }