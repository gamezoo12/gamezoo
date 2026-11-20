from fastapi import Request


def client_gameplay_evidence(request: Request, telemetry: dict | None = None) -> dict:
    raw = dict(telemetry or {})
    forwarded = request.headers.get('x-forwarded-for') or ''
    address = forwarded.split(',')[0].strip() if forwarded else (request.client.host if request.client else '')
    intervals = raw.get('input_intervals_ms') or []
    input_sources = raw.get('input_sources') or []
    return {
        'user_agent': str(raw.get('user_agent') or request.headers.get('user-agent') or '')[:500],
        'browser_name': str(raw.get('browser_name') or '')[:80],
        'ip_address': address[:120],
        'platform': str(raw.get('platform') or '')[:100],
        'language': str(raw.get('language') or '')[:80],
        'screen': str(raw.get('screen') or '')[:80],
        'viewport': str(raw.get('viewport') or '')[:80],
        'timezone': str(raw.get('timezone') or '')[:100],
        'webdriver': raw.get('webdriver') is True,
        'visibility_changes': max(0, min(int(raw.get('visibility_changes') or 0), 1000)),
        'zero_trust_events': max(0, min(int(raw.get('zero_trust_events') or 0), 10000)),
        'action_count': max(0, min(int(raw.get('action_count') or 0), 10000)),
        'input_intervals_ms': [max(0, min(int(value), 600000)) for value in intervals[:1000] if isinstance(value, (int, float)) and not isinstance(value, bool)],
        'input_sources': sorted({str(value)[:30] for value in input_sources})[:10],
        'automation_labels': [str(value)[:100] for value in (raw.get('automation_labels') or [])][:20],
        'client_elapsed_ms': max(0, min(int(raw.get('client_elapsed_ms') or 0), 3600000)),
    }
