import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
import httpx
from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

_DEFAULT_DEV_SECRET = 'gamezoo-dev-secret-change-in-prod-9f8a3b'
JWT_SECRET = os.environ.get('JWT_SECRET', _DEFAULT_DEV_SECRET)
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 30

# Refuse to boot in production with the default dev secret — otherwise tokens
# would be trivially forgeable. Detect production via multiple signals.
_env = (os.environ.get('ENVIRONMENT') or os.environ.get('APP_ENV') or '').lower()
_stripe_mode = (os.environ.get('STRIPE_MODE') or '').lower()
_is_production = _env in ('prod', 'production', 'live') or _stripe_mode == 'live'
if _is_production and JWT_SECRET == _DEFAULT_DEV_SECRET:
    raise RuntimeError(
        'Refusing to boot: JWT_SECRET is set to the dev default in a production '
        'environment. Set a strong random JWT_SECRET in the environment before deploying.'
    )
if JWT_SECRET == _DEFAULT_DEV_SECRET:
    logger.warning('JWT_SECRET is using the default dev value. Override JWT_SECRET in prod.')

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


async def require_admin(request: Request):
    user = await get_current_user(request)
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    return user
