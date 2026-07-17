"""Cloudflare Turnstile — anti-bot verification.

Default keys in .env are Cloudflare's public TEST keys (always pass).
Swap TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY in .env with real production
keys from https://dash.cloudflare.com/?to=/:account/turnstile when ready.

Endpoints:
  GET  /api/config/turnstile        — public: exposes the site key
  POST /api/games/captcha/verify    — auth: verifies a Turnstile token and
                                       returns a signed short-lived challenge
                                       token the frontend must present when
                                       posting the score.
"""
import os
import json
import time
import hmac
import hashlib
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user, JWT_SECRET

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api', tags=['captcha'])

_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
_CHALLENGE_TTL_S = 5 * 60  # 5 minutes


def _site_key() -> str:
    return os.environ.get('TURNSTILE_SITE_KEY') or ''


def _secret_key() -> Optional[str]:
    return os.environ.get('TURNSTILE_SECRET_KEY')


def _sign(payload: str) -> str:
    return hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def issue_challenge_token(user_id: str, contest_id: str) -> str:
    """Return a signed short-lived challenge token binding user + contest."""
    exp = int(time.time()) + _CHALLENGE_TTL_S
    body = f'{user_id}:{contest_id}:{exp}'
    return f'{body}.{_sign(body)}'


def verify_challenge_token(token: str, user_id: str, contest_id: str) -> bool:
    """Verify signature + expiry + user + contest binding."""
    if not token or '.' not in token:
        return False
    try:
        body, sig = token.rsplit('.', 1)
        expected = _sign(body)
        if not hmac.compare_digest(expected, sig):
            return False
        u, c, exp_s = body.split(':', 2)
        if u != user_id or c != contest_id:
            return False
        return int(exp_s) >= int(time.time())
    except (ValueError, AttributeError):
        return False


@router.get('/config/turnstile')
async def turnstile_config():
    """Public endpoint that returns the site key so the frontend can render
    the Turnstile widget. If the key is not configured, returns enabled=false
    so the frontend gracefully skips the CAPTCHA step (dev environments only).
    """
    key = _site_key()
    return {'enabled': bool(key), 'site_key': key or None}


class VerifyInput(BaseModel):
    token: str = Field(..., min_length=1, max_length=4096)
    contest_id: str = Field(..., min_length=1, max_length=100)


@router.post('/games/captcha/verify')
async def verify_turnstile(inp: VerifyInput, request: Request):
    """Verify a Turnstile token with Cloudflare. On success returns a
    challenge_token the frontend must pass to /api/games/submit.
    """
    user = await get_current_user(request)
    secret = _secret_key()
    if not secret:
        # Dev mode — no secret configured. Issue a challenge but log it.
        logger.warning('TURNSTILE_SECRET_KEY not set — issuing challenge without Cloudflare verification')
        return {
            'ok': True,
            'challenge_token': issue_challenge_token(user['user_id'], inp.contest_id),
            'dev_mode': True,
        }

    client_ip = request.headers.get('cf-connecting-ip') or request.client.host if request.client else None
    data = {'secret': secret, 'response': inp.token}
    if client_ip:
        data['remoteip'] = client_ip

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(_SITEVERIFY_URL, data=data)
            body = r.json()
    except Exception:
        logger.exception('turnstile siteverify request failed')
        raise HTTPException(status_code=502, detail='CAPTCHA verification service unavailable')

    if not body.get('success'):
        codes = body.get('error-codes') or []
        logger.info('turnstile verify failed for user=%s: %s', user['user_id'], codes)
        raise HTTPException(status_code=400, detail='CAPTCHA verification failed. Please try again.')

    return {
        'ok': True,
        'challenge_token': issue_challenge_token(user['user_id'], inp.contest_id),
    }
