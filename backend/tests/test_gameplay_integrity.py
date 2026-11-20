from services.gameplay_integrity import assess_gameplay_integrity


def test_clear_normal_result():
    result = assess_gameplay_integrity(
        game_type='memory_match', target_ms=45_000, duration_ms=18_000,
        solved=True, accuracy=0.94, claimed_duration_ms=17_900,
    )
    assert result['status'] == 'clear'
    assert result['signals'] == []


def test_missing_timing_evidence_requires_review():
    result = assess_gameplay_integrity(
        game_type='memory_match', target_ms=45_000, duration_ms=0,
        solved=True, accuracy=1,
    )
    assert result['status'] == 'review'
    assert any(signal['code'] == 'missing_timing_evidence' for signal in result['signals'])


def test_impossible_speed_is_high_risk():
    result = assess_gameplay_integrity(
        game_type='slider_puzzle', target_ms=120_000, duration_ms=120,
        solved=True, accuracy=1, claimed_duration_ms=120,
    )
    assert result['status'] == 'high_risk'
    assert any(signal['code'] == 'impossible_completion_speed' for signal in result['signals'])


def test_timer_mismatch_is_reviewable():
    result = assess_gameplay_integrity(
        game_type='memory_match', target_ms=45_000, duration_ms=20_000,
        solved=True, accuracy=1, claimed_duration_ms=8_000,
    )
    assert result['status'] == 'review'
    assert any(signal['code'] == 'timer_mismatch' for signal in result['signals'])


def test_automation_and_extreme_number_sequence_cadence_are_flagged():
    result = assess_gameplay_integrity(
        game_type='number_sequence', target_ms=8_000, duration_ms=1_000,
        solved=True, required_actions=20,
        telemetry={'action_count': 20, 'input_intervals_ms': [50] * 19, 'webdriver': True},
    )
    codes = {signal['code'] for signal in result['signals']}
    assert 'browser_automation_reported' in codes
    assert 'unusually_fast_input_rate' in codes
    assert 'implausible_action_cadence' in codes


def test_memory_match_fast_run_requires_review():
    result = assess_gameplay_integrity(
        game_type='memory_match', target_ms=45_000, duration_ms=6_000,
        solved=True, required_actions=30,
        telemetry={'action_count': 30, 'input_intervals_ms': [200] * 29},
    )
    assert result['status'] in {'review', 'high_risk'}
    assert any(signal['code'] == 'unusually_fast_input_rate' for signal in result['signals'])


def test_sudden_player_speed_outlier_is_flagged():
    prior = [{'duration_ms': duration, 'solved': True, 'accuracy': 0.85} for duration in (20_000, 21_000, 19_000)]
    result = assess_gameplay_integrity(
        game_type='memory_match', target_ms=45_000, duration_ms=5_000,
        solved=True, accuracy=1, claimed_duration_ms=5_000, prior_results=prior,
    )
    assert any(signal['code'] == 'sudden_speed_outlier' for signal in result['signals'])
