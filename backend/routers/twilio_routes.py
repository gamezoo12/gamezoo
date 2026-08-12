"""Twilio Verify (SMS OTP) endpoints for phone verification and phone-based login.

Flows supported:
  1) Post-signup phone binding (email or google user): POST /api/auth/otp/send
     then POST /api/auth/otp/verify-bind (authenticated) to attach + verify phone.
  2) Phone-based login for existing users: POST /api/auth/otp/send (public)
     then POST /api/auth/otp/login-verify (public) — returns JWT if phone matches
     an existing verified user.
"""
import os
import re
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from twilio.base.exceptions import TwilioRestException

from auth import create_jwt, get_current_user
from models import UserPublic
from otp_verify import normalize_phone, twilio_verify_client


def _to_public(user_doc: dict) -> dict:
    payload = {k: user_doc.get(k) for k in UserPublic.model_fields.keys() if user_doc.get(k) is not None}
    return UserPublic(**payload).model_dump()

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/auth/otp', tags=['auth-otp'])

def _normalize_phone(raw: str) -> str:
    # Backward-compatible alias for existing imports.
    return normalize_phone(raw)


def _twilio_client():
    # Backward-compatible alias for existing imports.
    return twilio_verify_client()


class SendOtpInput(BaseModel):
    phone: str = Field(..., min_length=6, max_length=32)


class VerifyOtpInput(BaseModel):
    phone: str = Field(..., min_length=6, max_length=32)
    code: str = Field(..., min_length=4, max_length=10)


class SendEmailOtpInput(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)


@router.post('/email/send')
async def send_email_otp(inp: SendEmailOtpInput):
    """Send a Twilio Verify email code.

    Public signup endpoint with per-email cooldown and rate limiting.
    The SendGrid API key remains configured inside Twilio and is never
    exposed to the browser.
    """
    from deps import get_db

    db = get_db()

    email = (inp.email or '').strip().lower()

    if not email or '@' not in email:
        raise HTTPException(
            status_code=400,
            detail='Valid email address required',
        )

    # Do not send verification codes for existing accounts.
    existing = await db.users.find_one(
        {'email': email},
        {'_id': 1},
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail='Email already registered',
        )

    now = datetime.now(timezone.utc)

    recent = await db.otp_attempts.find(
        {
            'channel': 'email',
            'email': email,
            'sent_at': {
                '$gte': now - timedelta(minutes=15)
            },
        },
        {
            '_id': 0,
            'sent_at': 1,
        },
    ).sort(
        'sent_at',
        -1,
    ).to_list(20)

    if recent:
        newest = recent[0]['sent_at']

        if isinstance(newest, str):
            try:
                newest = datetime.fromisoformat(
                    newest
                )
            except Exception:
                newest = now

        seconds_since = (
            now - newest
        ).total_seconds()

        if seconds_since < 30:
            raise HTTPException(
                status_code=429,
                detail=(
                    f'Please wait '
                    f'{int(30 - seconds_since)}s '
                    f'before requesting another code.'
                ),
            )

        if len(recent) >= 5:
            raise HTTPException(
                status_code=429,
                detail=(
                    'Too many verification requests. '
                    'Please try again in 15 minutes.'
                ),
            )

    client, service_sid = _twilio_client()

    try:
        verification = (
            client.verify.v2
            .services(service_sid)
            .verifications
            .create(
                to=email,
                channel='email',
            )
        )

    except TwilioRestException as exc:
        logger.warning(
            'Twilio email send failed: %s',
            exc,
        )

        detail = (
            'Could not send verification email. '
            'Check the address and try again.'
        )

        if exc.code in (60203, 60212):
            detail = (
                'Too many attempts. '
                'Please wait and try again.'
            )

        raise HTTPException(
            status_code=400,
            detail=detail,
        )

    except Exception:
        logger.exception(
            'Twilio email send unexpected error'
        )
        raise HTTPException(
            status_code=503,
            detail=(
                'Email verification service '
                'temporarily unavailable'
            ),
        )

    await db.otp_attempts.insert_one({
        'channel': 'email',
        'email': email,
        'sent_at': now,
    })

    return {
        'ok': True,
        'status': verification.status,
        'email': email,
    }


@router.post('/send')
async def send_otp(inp: SendOtpInput):
    """Send an SMS OTP via Twilio Verify. Public endpoint. Rate limited per-phone
    to 5 attempts in 15 minutes with a 30-second cooldown between sends.
    """
    from deps import get_db
    db = get_db()
    phone = _normalize_phone(inp.phone)
    now = datetime.now(timezone.utc)

    recent = await db.otp_attempts.find(
        {'phone': phone, 'sent_at': {'$gte': now - timedelta(minutes=15)}},
        {'_id': 0, 'sent_at': 1},
    ).sort('sent_at', -1).to_list(20)

    if recent:
        newest = recent[0]['sent_at']
        if isinstance(newest, str):
            try: newest = datetime.fromisoformat(newest)
            except Exception: newest = now
        secs_since = (now - newest).total_seconds()
        if secs_since < 30:
            raise HTTPException(status_code=429, detail=f'Please wait {int(30 - secs_since)}s before requesting another code.')
        if len(recent) >= 5:
            raise HTTPException(status_code=429, detail='Too many OTP requests. Please try again in 15 minutes.')

    client, service_sid = _twilio_client()
    try:
        v = client.verify.v2.services(service_sid).verifications.create(to=phone, channel='sms')
    except TwilioRestException as e:
        logger.warning('twilio send failed: %s', e)
        detail = 'Could not send SMS. Check the number and try again.'
        if e.code in (60203, 60212):
            detail = 'Too many attempts. Please wait and try again.'
        raise HTTPException(status_code=400, detail=detail)
    except Exception:
        logger.exception('twilio send unexpected error')
        raise HTTPException(status_code=500, detail='SMS service temporarily unavailable')

    # Record a successful send attempt for rate-limiting.
    await db.otp_attempts.insert_one({'phone': phone, 'sent_at': now})
    return {'ok': True, 'status': v.status, 'phone': phone}


@router.post('/verify-bind')
async def verify_and_bind(inp: VerifyOtpInput, request: Request):
    """Verify OTP and attach the (now-verified) phone to the currently
    authenticated user. Used post-signup / after Google OAuth.
    """
    from deps import get_db
    from otp_verify import verify_twilio_otp
    db = get_db()
    user = await get_current_user(request)

    phone = await verify_twilio_otp(inp.phone, inp.code)

    existing = await db.users.find_one(
        {'phone': phone, 'phone_verified': True, 'user_id': {'$ne': user['user_id']}},
        {'_id': 0, 'user_id': 1},
    )
    if existing:
        raise HTTPException(status_code=400, detail='This phone is already linked to another account')

    await db.users.update_one(
        {'user_id': user['user_id']},
        {'$set': {'phone': phone, 'phone_verified': True}},
    )
    updated = await db.users.find_one({'user_id': user['user_id']}, {'_id': 0, 'password_hash': 0})
    return {
        'ok': True,
        'user': _to_public(updated),
    }


@router.post('/login-verify')
async def login_via_otp(inp: VerifyOtpInput):
    """Verify OTP and return a JWT for the user whose verified phone matches."""
    from deps import get_db
    from otp_verify import verify_twilio_otp
    db = get_db()

    phone = await verify_twilio_otp(inp.phone, inp.code)

    user = await db.users.find_one({'phone': phone, 'phone_verified': True}, {'_id': 0, 'password_hash': 0})
    if not user:
        raise HTTPException(status_code=404, detail='No account found for this phone. Please sign up first.')

    token = create_jwt(user['user_id'])
    return {
        'user': _to_public(user),
        'token': token,
    }
