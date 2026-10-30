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

from auth import create_jwt, get_current_user
from models import UserPublic
from otp_verify import _is_prod, normalize_phone, twilio_verify_client


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


async def enforce_otp_rate_limit(db, query: dict, label: str = 'codes') -> None:
    """30s cooldown and max 5 sends per 15 minutes for the given destination query."""
    now = datetime.now(timezone.utc)
    recent = await db.otp_attempts.find(
        {**query, 'sent_at': {'$gte': now - timedelta(minutes=15)}}, {'_id': 0, 'sent_at': 1},
    ).sort('sent_at', -1).to_list(20)
    if not recent:
        return
    newest = recent[0]['sent_at']
    if isinstance(newest, str):
        try:
            newest = datetime.fromisoformat(newest)
        except ValueError:
            newest = now
    if newest.tzinfo is None:
        newest = newest.replace(tzinfo=timezone.utc)
    secs_since = (now - newest).total_seconds()
    if secs_since < 30:
        raise HTTPException(status_code=429, detail=f'Please wait {max(1, int(30 - secs_since))}s before requesting another code.')
    if len(recent) >= 5:
        raise HTTPException(status_code=429, detail=f'Too many {label} requested. Please try again in 15 minutes.')


@router.post('/email/send')
async def send_email_otp(inp: SendEmailOtpInput):
    """Send a Twilio Verify email code for signup (rate limited per email)."""
    from deps import get_db
    from otp_verify import normalize_email, send_verification

    db = get_db()
    email = normalize_email(inp.email)
    if await db.users.find_one({'email': email}, {'_id': 1}):
        raise HTTPException(status_code=400, detail='This email is already registered. Please log in or reset your password.')
    await enforce_otp_rate_limit(db, {'channel': 'email', 'email': email}, 'email codes')
    verification = await send_verification(email, 'email', 'signup')
    await db.otp_attempts.insert_one({'channel': 'email', 'email': email, 'purpose': 'signup', 'sent_at': datetime.now(timezone.utc)})
    return {'ok': True, 'status': verification.status, 'email': email, 'resend_after_seconds': 30}


class CheckEmailOtpInput(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    code: str = Field(..., min_length=4, max_length=10)


@router.post('/email/check')
async def check_email_otp(inp: CheckEmailOtpInput):
    """Verify a signup email code now so the user gets instant feedback (approval is remembered for registration)."""
    from otp_verify import verify_twilio_email_otp
    email = await verify_twilio_email_otp(inp.email, inp.code)
    return {'ok': True, 'email': email}


@router.post('/send')
async def send_otp(inp: SendOtpInput):
    """Send an SMS OTP via Twilio Verify to a UK mobile. Rate limited per phone."""
    from deps import get_db
    from otp_verify import send_verification
    db = get_db()
    phone = normalize_phone(inp.phone, uk_only=True)
    await enforce_otp_rate_limit(db, {'phone': phone}, 'SMS codes')

    if os.environ.get('TEST_MODE') == '1' and not _is_prod():
        await db.otp_attempts.insert_one({'phone': phone, 'sent_at': datetime.now(timezone.utc)})
        return {'ok': True, 'status': 'pending', 'phone': phone}

    v = await send_verification(phone, 'sms', 'phone_verification')
    await db.otp_attempts.insert_one({'phone': phone, 'sent_at': datetime.now(timezone.utc)})
    return {'ok': True, 'status': v.status, 'phone': phone, 'resend_after_seconds': 30}


@router.post('/check')
async def check_otp(inp: VerifyOtpInput):
    """Verify an SMS code now for instant feedback (approval is remembered for the next step)."""
    from otp_verify import verify_twilio_otp
    phone = await verify_twilio_otp(inp.phone, inp.code)
    return {'ok': True, 'phone': phone}


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
        {'$set': {'phone': phone, 'phone_verified': True, 'phone_verified_at': datetime.now(timezone.utc)}},
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
