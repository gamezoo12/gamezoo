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

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

from auth import create_jwt, get_current_user
from models import UserPublic


def _to_public(user_doc: dict) -> dict:
    payload = {k: user_doc.get(k) for k in UserPublic.model_fields.keys() if user_doc.get(k) is not None}
    return UserPublic(**payload).model_dump()

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/auth/otp', tags=['auth-otp'])

# E.164: leading '+' then 8-15 digits
_E164 = re.compile(r'^\+[1-9]\d{7,14}$')


def _normalize_phone(raw: str) -> str:
    """Return E.164-normalized phone or raise 400.
    Accepts +CC formats; also treats UK local mobiles beginning with '07'
    as +44 by stripping leading zero when no '+' prefix is provided.
    """
    if not raw:
        raise HTTPException(status_code=400, detail='Phone number required')
    p = re.sub(r'[\s()\-.]', '', raw.strip())
    if p.startswith('00'):
        p = '+' + p[2:]
    if not p.startswith('+'):
        # naive UK fallback: 07xxx -> +447xxx
        if p.startswith('0') and len(p) >= 10:
            p = '+44' + p[1:]
        else:
            raise HTTPException(status_code=400, detail='Use international format e.g. +447700900123')
    if not _E164.match(p):
        raise HTTPException(status_code=400, detail='Invalid phone format. Use E.164 e.g. +447700900123')
    return p


def _twilio_client() -> tuple[Client, str]:
    sid = os.environ.get('TWILIO_ACCOUNT_SID')
    token = os.environ.get('TWILIO_AUTH_TOKEN')
    service = os.environ.get('TWILIO_VERIFY_SERVICE_SID')
    if not sid or not token or not service:
        raise HTTPException(status_code=503, detail='SMS service not configured')
    return Client(sid, token), service


class SendOtpInput(BaseModel):
    phone: str = Field(..., min_length=6, max_length=32)


class VerifyOtpInput(BaseModel):
    phone: str = Field(..., min_length=6, max_length=32)
    code: str = Field(..., min_length=4, max_length=10)


@router.post('/send')
async def send_otp(inp: SendOtpInput):
    """Send an SMS OTP via Twilio Verify. Public endpoint."""
    phone = _normalize_phone(inp.phone)
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
