"""Shared Twilio Verify helpers.

SMS and email verification share the same Twilio Verify Service while
keeping all credentials server-side.
"""

import hashlib
import logging
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from services.otp_events import log_otp_event


logger = logging.getLogger(__name__)

_E164 = re.compile(r'^\+[1-9]\d{7,14}$')
_UK_MOBILE = re.compile(r'^\+447\d{9}$')
_EMAIL = re.compile(r'^[A-Za-z0-9.!#$%&\'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$')
APPROVAL_TTL = timedelta(minutes=30)

# Twilio Verify error codes -> (http status, user message, is the address/number itself invalid)
_TWILIO_ERRORS = {
    60200: (400, 'That {what} doesn\'t look valid. Please check it and try again.'),
    60205: (400, 'This number can\'t receive SMS. Please use a UK mobile number (07…).'),
    60203: (429, 'Too many codes requested. Please wait 10 minutes and try again.'),
    60212: (429, 'Too many codes requested. Please wait a few minutes and try again.'),
    60202: (429, 'Too many incorrect attempts. Please request a new code.'),
    60410: (400, 'We can\'t send codes to this number right now. Please contact Support.'),
    60605: (400, 'We can\'t send codes to this country. Please use a UK mobile number.'),
    20429: (429, 'Our verification service is busy. Please try again in a minute.'),
    60223: (503, 'Email codes are temporarily unavailable. Please try again later or contact Support.'),
    60217: (503, 'Email codes are temporarily unavailable. Please try again later or contact Support.'),
}


def _is_prod() -> bool:
    env = (
        os.environ.get('ENVIRONMENT')
        or os.environ.get('APP_ENV')
        or ''
    ).lower()

    if env in ('prod', 'production', 'live'):
        return True

    return (
        os.environ.get('STRIPE_MODE') or ''
    ).lower() == 'live'


def normalize_phone(raw: str, uk_only: bool = False) -> str:
    """Normalize a phone number to E.164 (UK numbers accepted as 07…, 7…, 447…, +447… or +44 07…)."""

    if not raw:
        raise HTTPException(status_code=400, detail='Phone number required')

    phone = re.sub(r'[\s()\-.]', '', raw.strip())

    if phone.startswith('00'):
        phone = '+' + phone[2:]
    if not phone.startswith('+'):
        if phone.startswith('0') and len(phone) >= 10:
            phone = '+44' + phone[1:]
        elif phone.startswith('44') and len(phone) >= 12:
            phone = '+' + phone
        elif phone.startswith('7') and len(phone) == 10:
            phone = '+44' + phone
        else:
            raise HTTPException(status_code=400, detail='Enter a UK mobile number, e.g. 07700 900123')
    if phone.startswith('+440'):
        phone = '+44' + phone[4:]

    if not _E164.match(phone):
        raise HTTPException(status_code=400, detail='That phone number doesn\'t look valid. Use a UK mobile, e.g. 07700 900123')
    if uk_only and not _UK_MOBILE.match(phone):
        raise HTTPException(status_code=400, detail='Only UK mobile numbers (+44 7…) can receive codes.')

    return phone


def normalize_email(raw: str) -> str:
    email = (raw or '').strip().lower()
    if len(email) > 254 or not _EMAIL.match(email):
        raise HTTPException(status_code=400, detail='That email address doesn\'t look valid. Please check it.')
    return email


def twilio_error(exc: TwilioRestException, what: str) -> HTTPException:
    status, msg = _TWILIO_ERRORS.get(exc.code, (502, None))
    if msg is None:
        msg = (f'We couldn\'t send the code to this {what} right now. '
               'Please try again in a minute or contact Support.')
    return HTTPException(status_code=status, detail=msg.format(what=what))


def twilio_verify_client() -> tuple[Client, str]:
    """Return configured Twilio client and Verify Service SID."""

    sid = os.environ.get('TWILIO_ACCOUNT_SID')
    token = os.environ.get('TWILIO_AUTH_TOKEN')
    service_sid = os.environ.get('TWILIO_VERIFY_SERVICE_SID')

    if not sid or not token or not service_sid:
        raise HTTPException(status_code=503, detail='Verification service not configured')

    return Client(sid, token), service_sid


async def send_verification(destination: str, channel: str, purpose: str):
    """Send a Twilio Verify code and record a safe diagnostic event. Raises clear HTTP errors."""
    what = 'email address' if channel == 'email' else 'phone number'
    client, service_sid = twilio_verify_client()
    try:
        v = client.verify.v2.services(service_sid).verifications.create(to=destination, channel=channel)
    except TwilioRestException as exc:
        logger.warning('Twilio %s send failed purpose=%s code=%s status=%s', channel, purpose, exc.code, exc.status)
        await log_otp_event(channel, purpose, destination, 'provider_error', exc.code, str(exc.msg))
        raise twilio_error(exc, what)
    except Exception as exc:
        logger.exception('Twilio %s send unexpected error', channel)
        await log_otp_event(channel, purpose, destination, 'provider_unreachable', None, type(exc).__name__)
        raise HTTPException(status_code=503, detail='Verification service temporarily unavailable. Please try again.')
    await log_otp_event(channel, purpose, destination, 'sent' if v.status == 'pending' else f'status_{v.status}')
    return v


def _code_hash(destination: str, code: str) -> str:
    return hashlib.sha256(f"{destination}|{code}|{os.environ.get('JWT_SECRET', '')}".encode()).hexdigest()


async def _verify_destination(
    destination: str,
    code: str,
) -> str:
    """Verify a Twilio Verify code for a destination.

    Twilio approves a code only once, so an approval is remembered (hashed) for
    30 minutes; a retried registration step with the same code still succeeds.
    """

    code = (code or '').strip()
    if not code:
        raise HTTPException(status_code=422, detail='Verification code is required')

    bypass = os.environ.get('TEST_OTP_BYPASS_CODE')

    if os.environ.get('TEST_MODE') == '1' and not _is_prod():
        if bypass and code == bypass:
            return destination
        raise HTTPException(status_code=400, detail='Invalid or expired code')

    if bypass and code == bypass and not _is_prod():
        return destination

    if bypass and _is_prod():
        logger.warning('TEST_OTP_BYPASS_CODE is set in production — refusing bypass.')

    from deps import get_db
    db = get_db()
    now = datetime.now(timezone.utc)
    if await db.otp_approvals.find_one({'code_hash': _code_hash(destination, code), 'approved_at': {'$gte': now - APPROVAL_TTL}}, {'_id': 1}):
        return destination

    channel = 'email' if '@' in destination else 'sms'
    client, service_sid = twilio_verify_client()

    try:
        check = client.verify.v2.services(service_sid).verification_checks.create(to=destination, code=code)
    except TwilioRestException as exc:
        logger.warning('Twilio Verify check failed code=%s status=%s', exc.code, exc.status)
        await log_otp_event(channel, 'check', destination, 'check_expired_or_missing' if exc.status == 404 else 'check_error', exc.code)
        if exc.code in (60202, 20429):
            raise twilio_error(exc, 'code')
        raise HTTPException(status_code=400, detail='This code has expired or was already used. Please request a new code.')
    except Exception:
        logger.exception('Twilio Verify unexpected error')
        raise HTTPException(status_code=503, detail='Verification service unavailable')

    if check.status != 'approved':
        await log_otp_event(channel, 'check', destination, 'check_wrong_code')
        raise HTTPException(status_code=400, detail='Incorrect code. Please check it and try again.')

    await db.otp_approvals.insert_one({'code_hash': _code_hash(destination, code), 'channel': channel, 'approved_at': now})
    await db.otp_approvals.delete_many({'approved_at': {'$lt': now - APPROVAL_TTL}})
    await log_otp_event(channel, 'check', destination, 'check_approved')
    return destination


async def verify_twilio_otp(
    phone: str,
    code: str,
) -> str:
    """Verify SMS OTP and return normalized E.164 phone."""

    return await _verify_destination(normalize_phone(phone), code)


async def verify_twilio_email_otp(
    email: str,
    code: str,
) -> str:
    """Verify email OTP and return normalized email."""

    return await _verify_destination(normalize_email(email), code)
