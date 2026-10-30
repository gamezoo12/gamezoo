import os
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
import httpx
from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 30

_env = (os.environ.get('ENVIRONMENT') or os.environ.get('APP_ENV') or '').lower()
_stripe_mode = (os.environ.get('STRIPE_MODE') or '').lower()
_is_production = _env in ('prod', 'production', 'live') or _stripe_mode == 'live'
JWT_SECRET = os.environ.get('JWT_SECRET', '').strip()
if not JWT_SECRET:
    if _is_production:
        raise RuntimeError('JWT_SECRET must be configured in production')
    JWT_SECRET = secrets.token_urlsafe(48)
    logger.warning('JWT_SECRET is unset; using a transient development secret. Configure JWT_SECRET for persistent sessions.')

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(pw, hashed)
    except Exception:
        return False


def create_jwt(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_jwt(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get('sub')
    except Exception:
        return None


async def exchange_emergent_session(session_id: str) -> Optional[dict]:
    """Call Emergent Auth /session-data endpoint with X-Session-ID header."""
    url = 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data'
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(url, headers={'X-Session-ID': session_id})
            if r.status_code == 200:
                return r.json()
            return None
        except Exception:
            return None


async def get_current_user(request: Request, db=None):
    """Resolve current user from either:
       - Bearer <jwt> (email/password login)
       - Cookie 'session_token' or Bearer <emergent_session_token> (Google)
    Returns dict user document (with _id removed) or raises 401.
    """
    from server import db_ref  # circular-safe
    _db = db or db_ref()

    auth = request.headers.get('Authorization') or ''
    token = None
    if auth.lower().startswith('bearer '):
        token = auth.split(' ', 1)[1].strip()
    # cookie fallback (Emergent Google flow)
    cookie_token = request.cookies.get('session_token')

    # 1) Try JWT (email/password)
    if token:
        user_id = decode_jwt(token)
        if user_id:
            user = await _db.users.find_one({'user_id': user_id}, {'_id': 0, 'password_hash': 0})
            if user:
                return user

    # 2) Try Emergent session_token (either bearer or cookie)
    for t in [token, cookie_token]:
        if not t:
            continue
        sess = await _db.user_sessions.find_one({'session_token': t}, {'_id': 0})
        if not sess:
            continue
        expires_at = sess.get('expires_at')
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at and expires_at < datetime.now(timezone.utc):
            continue
        user = await _db.users.find_one({'user_id': sess['user_id']}, {'_id': 0, 'password_hash': 0})
        if user:
            return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Not authenticated')


_STAFF_ROLES = ('admin', 'super_admin', 'operator', 'support')
# Accounts created before this instant are "legacy": never blocked unless
# PHONE_GATE_ENFORCE_LEGACY=true is set after the impact report is approved.
PHONE_GATE_NEW_USER_FROM = os.environ.get('PHONE_GATE_NEW_USER_FROM', '2026-10-16T00:00:00+00:00')


def _as_utc(value) -> Optional[datetime]:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


def phone_is_verified(user: dict) -> bool:
    return user.get('phone_verified') is True or _as_utc(user.get('phone_verified_at')) is not None


def phone_gate_blocks(user: dict) -> bool:
    """True when this user must verify a mobile number before gameplay/payments."""
    if phone_is_verified(user) or user.get('role') in _STAFF_ROLES:
        return False
    # Google accounts must always verify; legacy email accounts stay exempt unless enforced.
    if user.get('method') == 'google':
        return True
    if (os.environ.get('PHONE_GATE_ENFORCE_LEGACY') or '').lower() == 'true':
        return True
    created = _as_utc(user.get('created_at'))
    cutoff = _as_utc(PHONE_GATE_NEW_USER_FROM)
    return bool(created and cutoff and created >= cutoff)


async def require_verified_user(request: Request, db=None):
    """get_current_user + mobile OTP verification (server-side enforcement)."""
    user = await get_current_user(request, db)
    if phone_gate_blocks(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                'code': 'PHONE_VERIFICATION_REQUIRED',
                'message': 'Please verify your mobile number with an OTP to continue.',
            },
        )
    return user


async def require_admin(request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('admin', 'super_admin', 'operator', 'support'):
        raise HTTPException(status_code=403, detail='Admin only')
    return user


async def require_super_admin(request: Request):
    user = await require_admin(request)
    if user.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail='Super Admin only')
    return user
