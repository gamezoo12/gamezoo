from statistics import median


def _number(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def assess_gameplay_integrity(
    *,
    game_type: str,
    target_ms: int,
    duration_ms: int,
    solved: bool,
    accuracy: float | None = None,
    claimed_duration_ms: int | None = None,
    prior_results: list[dict] | None = None,
    telemetry: dict | None = None,
    required_actions: int | None = None,
) -> dict:
    """Return review evidence, never a definitive cheating verdict."""
    duration = int(_number(duration_ms))
    target = max(1000, int(_number(target_ms, 60_000)))
    accuracy_value = _number(accuracy, 0) if accuracy is not None else None
    prior = list(prior_results or [])
    telemetry = dict(telemetry or {})
    intervals = [int(_number(value)) for value in (telemetry.get('input_intervals_ms') or []) if _number(value) >= 0]
    action_count = int(_number(telemetry.get('action_count'), len(intervals) + 1 if intervals else 0))
    comparable = [
        int(_number(row.get('duration_ms')))
        for row in prior
        if _number(row.get('duration_ms')) > 0 and bool(row.get('solved', row.get('passed')))
    ]
    signals = []
    risk = 0

    if duration <= 0:
        signals.append({
            'code': 'missing_timing_evidence',
            'severity': 'medium',
            'message': 'No usable server duration is available for this historical attempt.',
        })
        risk += 20

    category = str(game_type or '').lower()
    minimum_ms = 250 if category in {'reaction_time', 'target_tap', 'number_sequence'} else 750
    if 0 < duration < minimum_ms:
        signals.append({
            'code': 'impossible_completion_speed',
            'severity': 'high',
            'message': f'Completed in {duration}ms, below the human-plausible floor of {minimum_ms}ms.',
        })
        risk += 55

    if solved and duration > 0 and target > 0 and duration < target * 0.025:
        signals.append({
            'code': 'extreme_target_speed',
            'severity': 'high',
            'message': f'Completed in {duration}ms, less than 2.5% of the {target}ms expected time.',
        })
        risk += 40

    if telemetry.get('webdriver') is True:
        signals.append({
            'code': 'browser_automation_reported',
            'severity': 'high',
            'message': 'The browser reported WebDriver automation at submission time.',
        })
        risk += 70

    if len(intervals) >= 5 and median(intervals) < 35:
        signals.append({
            'code': 'machine_like_input_cadence',
            'severity': 'high',
            'message': f'Median input interval was {median(intervals):.0f}ms across {len(intervals)} events.',
        })
        risk += 45

    non_input_actions = int(_number(telemetry.get('zero_trust_events')))
    if non_input_actions >= 1:
        signals.append({
            'code': 'synthetic_or_non_pointer_events',
            'severity': 'medium',
            'message': f'{non_input_actions} actions lacked trusted browser input markers.',
        })
        risk += 25

    if int(_number(telemetry.get('visibility_changes'))) >= 2:
        signals.append({
            'code': 'frequent_tab_switching',
            'severity': 'medium',
            'message': f'Page visibility changed {int(_number(telemetry.get("visibility_changes")))} times during play.',
        })
        risk += 15

    if action_count >= 20 and duration > 0:
        average_gap = duration / action_count
        observed_floor = 220 if 'memory' in category else 55
        if average_gap < observed_floor:
            signals.append({
                'code': 'unusually_fast_input_rate',
                'severity': 'medium',
                'message': f'{action_count} actions averaged {average_gap:.0f}ms each during a {duration}ms run.',
            })
            risk += 25

    if required_actions and action_count and duration > 0:
        expected_for_actions = int(required_actions) * (220 if 'memory' in category else 60)
        if duration < expected_for_actions:
            severity = 'high' if duration < expected_for_actions / 2 else 'medium'
            signals.append({
                'code': 'implausible_action_cadence',
                'severity': severity,
                'message': f'{action_count} actions completed in {duration}ms; {int(required_actions)} expected actions would normally require at least {expected_for_actions}ms.',
            })
            risk += 50 if severity == 'high' else 25

    if claimed_duration_ms is not None:
        claimed = int(_number(claimed_duration_ms))
        difference = abs(duration - claimed)
        if difference > 2500:
            signals.append({
                'code': 'timer_mismatch',
                'severity': 'medium',
                'message': f'Client reported {claimed}ms while the server measured {duration}ms ({difference}ms difference).',
            })
            risk += 25

    if len(comparable) >= 3:
        baseline = int(median(comparable))
        if duration > 0 and baseline > 0 and duration < baseline * 0.35:
            signals.append({
                'code': 'sudden_speed_outlier',
                'severity': 'high',
                'message': f'{duration}ms is under 35% of this player/game median of {baseline}ms.',
            })
            risk += 35

    recent_perfect = [
        row for row in prior
        if bool(row.get('solved', row.get('passed')))
        and _number(row.get('accuracy', 0)) >= 0.999
    ][-5:]
    if solved and accuracy_value is not None and accuracy_value >= 0.999 and len(recent_perfect) >= 3:
        recent_durations = [int(_number(row.get('duration_ms'))) for row in recent_perfect]
        recent_baseline = median(recent_durations)
        if recent_baseline > 0 and max(recent_durations) - min(recent_durations) <= recent_baseline * 0.08:
            signals.append({
                'code': 'repeated_identical_perfect_pattern',
                'severity': 'medium',
                'message': 'Several consecutive 100% runs completed within an unusually narrow timing band.',
            })
            risk += 25

    if risk >= 50:
        status = 'high_risk'
    elif risk >= 20:
        status = 'review'
    else:
        status = 'clear'

    return {
        'status': status,
        'trust_score': max(0, 100 - min(100, risk)),
        'signals': signals,
        'baseline_sample_size': len(comparable),
        'baseline_median_ms': int(median(comparable)) if comparable else None,
        'server_duration_ms': duration,
        'claimed_duration_ms': int(_number(claimed_duration_ms)) if claimed_duration_ms is not None else None,
        'action_count': action_count,
        'input_interval_median_ms': int(median(intervals)) if intervals else None,
        'evidence': {
            'browser': telemetry.get('browser_name') or None,
            'user_agent': telemetry.get('user_agent') or None,
            'ip_address': telemetry.get('ip_address') or None,
            'platform': telemetry.get('platform') or None,
            'language': telemetry.get('language') or None,
            'screen': telemetry.get('screen') or None,
            'viewport': telemetry.get('viewport') or None,
            'timezone': telemetry.get('timezone') or None,
            'webdriver': bool(telemetry.get('webdriver')),
            'visibility_changes': int(_number(telemetry.get('visibility_changes'))),
            'input_sources': telemetry.get('input_sources') or [],
            'automation_labels': telemetry.get('automation_labels') or [],
        },
    }
