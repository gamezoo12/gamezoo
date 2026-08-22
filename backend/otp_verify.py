"""Shared Twilio Verify helpers.

SMS and email verification share the same Twilio Verify Service while
keeping all credentials server-side.
"""

import logging
import os
import re

from fastapi import HTTPException
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client


logger = logging.getLogger(__name__)

_E164 = re.compile(r'^\+[1-9]\d{7,14}$')


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


def normalize_phone(raw: str) -> str:
    """Normalize a phone number to E.164."""

    if not raw:
        raise HTTPException(
            status_code=400,
            detail='Phone number required',
        )

    phone = re.sub(
        r'[\s()\-.]',
        '',
        raw.strip(),
    )

    if phone.startswith('00'):
        phone = '+' + phone[2:]

    if not phone.startswith('+'):
        if phone.startswith('0') and len(phone) >= 10:
            phone = '+44' + phone[1:]
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    'Use international format '
                    'e.g. +447700900123'
                ),
            )

    if not _E164.match(phone):
        raise HTTPException(
            status_code=400,
            detail=(
                'Invalid phone format. Use E.164 '
                'e.g. +447700900123'
            ),
        )

    return phone


def twilio_verify_client() -> tuple[Client, str]:
    """Return configured Twilio client and Verify Service SID."""

    sid = os.environ.get('TWILIO_ACCOUNT_SID')
    token = os.environ.get('TWILIO_AUTH_TOKEN')
    service_sid = os.environ.get(
        'TWILIO_VERIFY_SERVICE_SID'
    )

    if not sid or not token or not service_sid:
        raise HTTPException(
            status_code=503,
            detail='Verification service not configured',
        )

    return Client(sid, token), service_sid


async def _verify_destination(
    destination: str,
    code: str,
) -> str:
    """Verify a Twilio Verify code for a destination."""

    if not code:
        raise HTTPException(
            status_code=422,
            detail='Verification code is required',
        )

    bypass = os.environ.get(
        'TEST_OTP_BYPASS_CODE'
    )

    if (
        bypass
        and code == bypass
        and not _is_prod()
    ):
        return destination

    if bypass and _is_prod():
        logger.warning(
            'TEST_OTP_BYPASS_CODE is set in '
            'production — refusing bypass.'
        )

    client, service_sid = twilio_verify_client()

    try:
        check = (
            client.verify.v2
            .services(service_sid)
            .verification_checks
            .create(
                to=destination,
                code=code,
            )
        )

    except TwilioRestException as exc:
        logger.warning(
            'Twilio Verify check failed: %s',
            exc,
        )
        raise HTTPException(
            status_code=400,
            detail='Invalid or expired code',
        )

    except Exception:
        logger.exception(
            'Twilio Verify unexpected error'
        )
        raise HTTPException(
            status_code=503,
            detail='Verification service unavailable',
        )

    if check.status != 'approved':
        raise HTTPException(
            status_code=400,
            detail='Invalid or expired code',
        )

    return destination


async def verify_twilio_otp(
    phone: str,
    code: str,
) -> str:
    """Verify SMS OTP and return normalized E.164 phone."""

    normalized = normalize_phone(phone)

    return await _verify_destination(
        normalized,
        code,
    )


async def verify_twilio_email_otp(
    email: str,
    code: str,
) -> str:
    """Verify email OTP and return normalized email."""

    normalized = (
        email or ''
    ).strip().lower()

    if not normalized or '@' not in normalized:
        raise HTTPException(
            status_code=400,
            detail='Valid email address required',
        )

    return await _verify_destination(
        normalized,
        code,
    )
