from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta, timezone, date
from pydantic import BaseModel, Field
from typing import Optional
import os
import re
import logging

from auth import (
    create_jwt, hash_password, verify_password,
    exchange_emergent_session, get_current_user,
)
from models import RegisterInput, LoginInput, User, UserPublic

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/auth', tags=['auth'])


# --- Shared helpers -----------------------------------------------------------
def _parse_dob(dob: str) -> date:
    try:
        return date.fromisoformat(dob)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid date of birth. Use YYYY-MM-DD.')


def _assert_18_plus(dob: str) -> date:
    d = _parse_dob(dob)
    today = date.today()
    age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    if age < 18:
        raise HTTPException(status_code=400, detail='You must be 18 or older to sign up.')
    if d.year < 1900:
        raise HTTPException(status_code=400, detail='Invalid date of birth.')
    return d


async def _generate_username(db, full_name: str, dob: str) -> str:
    """firstname (lowercase a-z) + DOB day (dd) + running two-digit index."""
    first = re.sub(r'[^a-z]', '', (full_name.split(' ')[0] or 'user').lower())[:16] or 'user'
    d = _parse_dob(dob)
    day = f"{d.day:02d}"
    for i in range(1, 1000):
        candidate = f"{first}{day}{i:02d}"
        exists = await db.users.find_one({'username': candidate}, {'_id': 1})
        if not exists:
            return candidate
    # fallback (astronomically unlikely)
    from uuid import uuid4
    return f"{first}{day}{uuid4().hex[:4]}"


async def _verify_twilio_otp(phone: str, code: str) -> str:
    """Normalize phone, verify OTP via Twilio Verify. Returns normalized E.164
    on success or raises 400.

    Test bypass: if env `TEST_OTP_BYPASS_CODE` is set and equals `code`,
    skip Twilio (used by pytest suites). Not set in prod.
    """
    from routers.twilio_routes import _normalize_phone, _twilio_client
    from twilio.base.exceptions import TwilioRestException

    normalized = _normalize_phone(phone)

    bypass = os.environ.get('TEST_OTP_BYPASS_CODE')
    if bypass and code == bypass:
        return normalized

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


# --- Endpoints ---------------------------------------------------------------
@router.post('/register')
async def register(inp: RegisterInput, request: Request):
    """Mandatory OTP + T&Cs signup for email/password users.

    Enforces: 18+ age, unique email, valid Twilio OTP for the phone,
    accepted T&Cs, and auto-generates a unique username.
    """
    from deps import get_db
    from models import Referral
    db = get_db()

    if not inp.accept_terms:
        raise HTTPException(status_code=400, detail='You must accept the Terms & Privacy Policy.')

    _assert_18_plus(inp.dob)

    if await db.users.find_one({'email': inp.email.lower()}):
        raise HTTPException(status_code=400, detail='Email already registered')

    # Verify OTP with Twilio BEFORE creating the account.
    normalized_phone = await _verify_twilio_otp(inp.phone, inp.otp_code)

    # Guard: another user must not have this phone verified already.
    existing_phone = await db.users.find_one(
        {'phone': normalized_phone, 'phone_verified': True}, {'_id': 1}
    )
    if existing_phone:
        raise HTTPException(status_code=400, detail='This phone number is already registered.')

    referred_by = None
    if inp.referral_code:
        ref_user = await db.users.find_one(
            {'referral_code': inp.referral_code.upper()}, {'_id': 0, 'user_id': 1}
        )
        if ref_user:
            referred_by = ref_user['user_id']

    username = await _generate_username(db, inp.name, inp.dob)

    user = User(
        email=inp.email.lower(),
        name=inp.name.strip(),
        username=username,
        password_hash=hash_password(inp.password),
        method='email',
        role='user',
        referred_by=referred_by,
        phone=normalized_phone,
        phone_verified=True,
        dob=inp.dob,
        address=(inp.address or None),
        terms_accepted_at=datetime.now(timezone.utc),
    )
    doc = user.model_dump()
    await db.users.insert_one(doc)

    if referred_by:
        r = Referral(
            referrer_user_id=referred_by,
            referred_user_id=user.user_id,
            code=inp.referral_code.upper(),
        )
        await db.referrals.insert_one(r.model_dump())

    token = create_jwt(user.user_id)
    return {
        'user': UserPublic(**{k: doc.get(k) for k in UserPublic.model_fields.keys()}).model_dump(),
        'token': token,
    }


@router.post('/login')
async def login(inp: LoginInput):
    from deps import get_db
    db = get_db()
    user = await db.users.find_one({'email': inp.email.lower()}, {'_id': 0})
    if not user or not user.get('password_hash') or not verify_password(inp.password, user['password_hash']):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    token = create_jwt(user['user_id'])
    return {
        'user': UserPublic(**{k: user.get(k) for k in UserPublic.model_fields.keys()}).model_dump(),
        'token': token,
    }


@router.post('/session')
async def google_session(request: Request):
    """Exchange Emergent OAuth session_id for backend cookie + user."""
    session_id = request.headers.get('X-Session-ID') or request.headers.get('x-session-id')
    if not session_id:
        raise HTTPException(status_code=400, detail='Missing X-Session-ID header')
    data = await exchange_emergent_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail='Invalid session_id')

    from deps import get_db
    db = get_db()
    email = data['email'].lower()
    user = await db.users.find_one({'email': email}, {'_id': 0})
    if not user:
        user_obj = User(
            email=email,
            name=data.get('name') or email,
            picture=data.get('picture'),
            method='google',
            role='user',
        )
        doc = user_obj.model_dump()
        await db.users.insert_one(doc)
        user = doc
    else:
        await db.users.update_one({'user_id': user['user_id']}, {'$set': {
            'name': data.get('name') or user['name'],
            'picture': data.get('picture') or user.get('picture'),
        }})

    session_token = data['session_token']
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {'session_token': session_token},
        {'$set': {
            'user_id': user['user_id'],
            'session_token': session_token,
            'expires_at': expires_at,
            'created_at': datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    resp = JSONResponse({
        'user': UserPublic(**{k: user.get(k) for k in UserPublic.model_fields.keys()}).model_dump(),
        'session_token': session_token,
    })
    resp.set_cookie(
        key='session_token',
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        expires=expires_at,
        path='/',
        httponly=True,
        secure=True,
        samesite='none',
    )
    return resp


class GoogleFinalizeInput(BaseModel):
    phone: str = Field(..., min_length=6, max_length=32)
    otp_code: str = Field(..., min_length=4, max_length=10)
    accept_terms: bool
    dob: str = Field(..., description='YYYY-MM-DD')
    address: Optional[str] = None


@router.post('/google/finalize')
async def finalize_google_signup(inp: GoogleFinalizeInput, request: Request):
    """Google users complete signup here: verify OTP, accept T&Cs, set DOB,
    auto-generate a username. Idempotent — safe to call multiple times.
    """
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()

    if not inp.accept_terms:
        raise HTTPException(status_code=400, detail='You must accept the Terms & Privacy Policy.')
    _assert_18_plus(inp.dob)

    normalized_phone = await _verify_twilio_otp(inp.phone, inp.otp_code)

    other = await db.users.find_one(
        {'phone': normalized_phone, 'phone_verified': True, 'user_id': {'$ne': user['user_id']}},
        {'_id': 1},
    )
    if other:
        raise HTTPException(status_code=400, detail='This phone is already linked to another account')

    username = user.get('username') or await _generate_username(db, user['name'], inp.dob)
    await db.users.update_one(
        {'user_id': user['user_id']},
        {'$set': {
            'phone': normalized_phone,
            'phone_verified': True,
            'dob': inp.dob,
            'address': (inp.address or None),
            'username': username,
            'terms_accepted_at': datetime.now(timezone.utc),
        }},
    )
    fresh = await db.users.find_one({'user_id': user['user_id']}, {'_id': 0, 'password_hash': 0})
    return {
        'ok': True,
        'user': UserPublic(**{k: fresh.get(k) for k in UserPublic.model_fields.keys()}).model_dump(),
    }


@router.get('/me')
async def me(request: Request):
    user = await get_current_user(request)
    return UserPublic(**{k: user.get(k) for k in UserPublic.model_fields.keys()}).model_dump()


@router.post('/logout')
async def logout(request: Request, response: Response):
    from deps import get_db
    db = get_db()
    token = request.cookies.get('session_token')
    if token:
        await db.user_sessions.delete_one({'session_token': token})
    response.delete_cookie('session_token', path='/')
    return {'ok': True}
