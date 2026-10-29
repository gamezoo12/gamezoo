import pytest

from services.world_gc_competition import (
    DEFAULT_LEVEL_BONUS_REWARDS,
    apply_memory_match_click,
    build_memory_match_board,
    default_gc_config,
    memory_match_pair_count,
    normalize_level_key,
    normalize_gc_config,
)


def test_default_config_is_inactive_and_has_ten_independent_level_reward_schedules():
    config = default_gc_config(4)

    assert config["gc_number"] == 4
    assert config["model"] == "champion_only"
    assert config["activation_status"] == "draft"
    assert len(config["levels"]) == 10
    assert all(row["bonus_rewards"] == {str(rank): amount for rank, amount in DEFAULT_LEVEL_BONUS_REWARDS.items()}
               for row in config["levels"])
    assert config["champion"]["prize_source"] == "existing_world_champion_prizes"


def test_every_level_settings_preserve_inactive_state_and_normalize_timezone():
    base = default_gc_config(4)
    base["activation_status"] = "draft"
    payload = {
        "model": "every_level",
        "levels": [{"level": 1, "game_id": "memory_match", "opens_at": "2026-10-29T00:00:00+01:00"}],
    }

    config = normalize_gc_config(4, payload, base)

    assert config["model"] == "every_level"
    assert config["activation_status"] == "draft"
    assert config["levels"][0]["game_id"] == "memory_match"
    assert config["levels"][0]["opens_at"] == "2026-10-28T23:00:00+00:00"
    assert config["levels"][1]["bonus_rewards"] == {"1": 5, "2": 4, "3": 3, "4": 2, "5": 1}


@pytest.mark.parametrize("gc_number", [3, 54, "not-a-gc"])
def test_config_rejects_gcs_outside_gc4_to_gc53(gc_number):
    with pytest.raises(ValueError):
        default_gc_config(gc_number)


def test_config_rejects_unsupported_model_game_and_timezone_free_schedule():
    with pytest.raises(ValueError, match="Model"):
        normalize_gc_config(4, {"model": "mixed"})
    with pytest.raises(ValueError, match="Unsupported game"):
        normalize_gc_config(4, {"levels": [{"level": 1, "game_id": "unknown_game"}]})
    with pytest.raises(ValueError, match="include a timezone"):
        normalize_gc_config(4, {"levels": [{"level": 1, "opens_at": "2026-10-29T00:00:00"}]})


def test_config_rejects_duplicate_levels_and_non_monotonic_schedule():
    with pytest.raises(ValueError, match="unique"):
        normalize_gc_config(4, {"levels": [{"level": 1}, {"level": 1}]})

    levels = [{"level": 1, "opens_at": "2026-10-29T00:00:00+01:00"},
              {"level": 2, "opens_at": "2026-10-28T00:00:00+01:00"}]
    with pytest.raises(ValueError, match="strictly increasing"):
        normalize_gc_config(4, {"levels": levels})


def test_memory_match_board_pairs_and_click_state_are_authoritative():
    board = build_memory_match_board(4)
    assert len(board) == 8
    assert sorted(board) == [0, 0, 1, 1, 2, 2, 3, 3]

    first_position = board.index(0)
    first = apply_memory_match_click(board, [], None, first_position)
    assert first["pending_position"] == first_position
    second_position = next(index for index, value in enumerate(board) if value == 0 and index != first_position)
    second = apply_memory_match_click(board, first["matched_positions"], first["pending_position"], second_position)
    assert second["match"] is True
    assert set(second["matched_positions"]) == {first_position, second_position}
    with pytest.raises(ValueError, match="already been matched"):
        apply_memory_match_click(board, second["matched_positions"], None, first_position)
    with pytest.raises(ValueError, match="outside"):
        apply_memory_match_click(board, second["matched_positions"], None, 100)


def test_memory_match_level_key_and_pair_configuration_validation():
    config = default_gc_config(4)
    config["levels"][1]["game_config"] = {"pair_count": 6}
    assert normalize_level_key("L2") == "L2"
    assert normalize_level_key(2) == "L2"
    assert normalize_level_key("champion") == "champion"
    assert memory_match_pair_count(config, "L2") == 6
    with pytest.raises(ValueError, match="Level"):
        normalize_level_key("L11")
    with pytest.raises(ValueError, match="pair_count"):
        memory_match_pair_count({"levels": [{"level": 1, "game_config": {"pair_count": 1}}]}, "L1")