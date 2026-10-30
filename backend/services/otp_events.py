"""Safe OTP diagnostics: records delivery/check outcomes without ever storing codes."""
import hashlib
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def mask_destination(dest: str) -> str:
    dest = dest or ''
    if '@' in dest:
        local, _, domain = dest.partition('@')
        return f"{local[:2]}***@{domain}"
    return f"{dest[:3]}*****{dest[-3:]}" if len(dest) > 6 else '***'


def dest_hash(dest: str) -> str:
    return hashlib.sha256((dest or '').lower().encode()).hexdigest()[:16]


async def log_otp_event(channel: str, purpose: str, destination: str, result: str, provider_code=None, detail: str | None = None):
    try:
        from deps import get_db
        await get_db().otp_events.insert_one({
            'channel': channel, 'purpose': purpose, 'destination': mask_destination(destination),
            'destination_hash': dest_hash(destination), 'domain': destination.split('@')[-1].lower() if '@' in (destination or '') else None,
            'result': result, 'provider_code': provider_code, 'detail': (detail or '')[:300] or None,
            'at': datetime.now(timezone.utc),
        })
    except Exception:
        logger.exception('otp event logging failed')
