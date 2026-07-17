"""Shared OTP verification helper — extracted to break the circular import
between routers.auth_routes and routers.twilio_routes.

Both routers need to verify a Twilio Verify code and normalize the phone,
so the shared logic lives here without importing either router.
"""
import os
import logging

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def _is_prod() -> bool:
    """Return True when running in a production environment.
    Multiple signals are checked so misconfiguration cannot accidentally
    enable dev-only shortcuts.
    """
    env = (os.environ.get('ENVIRONMENT') or os.environ.get('APP_ENV') or '').lower()
    if env in ('prod', 'production', 'live'):
        return True
    # Fallback: if STRIPE_MODE=live we're in prod
    if (os.environ.get('STRIPE_MODE') or '').lower() == 'live':
        return True
    return False


async def verify_twilio_otp(phone: str, code: str) -> str:
    """Normalize phone, verify OTP via Twilio Verify. Returns normalized E.164
    on success or raises HTTPException(400).

    Test bypass: if env `TEST_OTP_BYPASS_CODE` is set AND we're NOT in
    production AND the code matches, we skip Twilio (used by pytest suites).
    Production environments never allow this shortcut, even if the env
    variable is accidentally set.
    """
    # Import inside function to avoid module-level circular ref between
    # auth_routes → twilio_routes → auth_routes at import time.
    from routers.twilio_routes import _normalize_phone, _twilio_client
    from twilio.base.exceptions import TwilioRestException

    normalized = _normalize_phone(phone)

    bypass = os.environ.get('TEST_OTP_BYPASS_CODE')
    if bypass and code == bypass and not _is_prod():
        return normalized
    if bypass and _is_prod():
        logger.warning('TEST_OTP_BYPASS_CODE is set in production environment — refusing to use.')

    client, service_sid = _twilio_client()
    try:
        check = client.verify.v2.services(service_sid).verification_checks.create(
            to=normalized, code=code
        )
    except TwilioRestException as e:
        logger.warning('twilio verify failed: %s', e)
        raise HTTPException(status_code=400, detail='Invalid or expired code')
    except Exception:
        logger.exception('twilio verify unexpected error')
        raise HTTPException(status_code=500, detail='Verification service unavailable')
    if check.status != 'approved':
        raise HTTPException(status_code=400, detail='Invalid or expired code')
    return normalized
