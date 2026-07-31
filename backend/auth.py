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

# In production we DO NOT want to run with the dev default (tokens would be
# trivially forgeable). But we also refuse to hard-crash the container — the
# k8s liveness probe would then loop forever and the operator would have no
# way to see the app. So we AUTO-ROTATE to a fresh random secret and log a
# loud error. Tokens minted with the old default get rejected as forgeries
# (which is what we want in prod anyway).
_env = (os.environ.get('ENVIRONMENT') or os.environ.get('APP_ENV') or '').lower()
_stripe_mode = (os.environ.get('STRIPE_MODE') or '').lower()
_is_production = _env in ('prod', 'production', 'live') or _stripe_mode == 'live'
if JWT_SECRET == _DEFAULT_DEV_SECRET:
    if _is_production:
        import secrets as _secrets
        JWT_SECRET = _secrets.token_urlsafe(48)
        logger.error(
            'JWT_SECRET was not set in the production environment — auto-rotated to '
            'a random per-boot secret. Existing sessions will need to log in again. '
            'Fix by setting JWT_SECRET in the deployment env-var UI.'
        )
    else:
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
    if user.get('role') not in ('admin', 'super_admin', 'operator', 'support'):
        raise HTTPException(status_code=403, detail='Admin only')
    return user
