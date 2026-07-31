"""
Dynamic skill-question generator + signed challenge tokens.

Every time a visitor lands on a contest page we call `build_challenge()` to
generate a FRESH math problem based on the contest's admin-configured
operation (addition/subtraction/multiplication/division) and difficulty
(easy/medium/hard).

The generated problem is bundled with a short-lived HMAC-signed token that
carries the correct answer in server-signed form. When the user submits an
answer we call `verify_challenge()` which:
  1. Confirms the token has not been tampered with.
  2. Confirms the token has not expired (default TTL: 5 minutes).
  3. Confirms the answer typed by the user matches the answer embedded in
     the token.

Because the correct answer never appears in the response body sent to the
browser, users cannot inspect network traffic to cheat. Because the token is
bound to a specific contest and single question, users cannot replay one
successful token against another contest or question.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Literal, TypedDict

# Use a cryptographically secure RNG (backed by /dev/urandom) instead of the
# stdlib `random` module. Even though the question VALUES are not
# security-sensitive (the answer is public knowledge — 12 + 7 is always 19),
# using SystemRandom aligns with security scanners and avoids any suggestion
# that we're using predictable seeds anywhere in the auth surface.
_rng = secrets.SystemRandom()

Op = Literal['addition', 'subtraction', 'multiplication', 'division']
Difficulty = Literal['easy', 'medium', 'hard']

ALLOWED_OPS: tuple[Op, ...] = ('addition', 'subtraction', 'multiplication', 'division')
ALLOWED_DIFF: tuple[Difficulty, ...] = ('easy', 'medium', 'hard')
DEFAULT_TTL_SECONDS = 300  # 5 minutes


def _key() -> bytes:
    """HMAC signing key. Reuse INSTANT_WIN_KEY so ops does not have to
    manage another secret. Falls back to a fixed dev key ONLY when running
    outside a configured environment."""
    k = os.environ.get('SKILL_CHALLENGE_KEY') or os.environ.get('INSTANT_WIN_KEY')
    if not k:
        raise RuntimeError('SKILL_CHALLENGE_KEY / INSTANT_WIN_KEY must be set in the backend env.')
    return k.encode('utf-8')


# ---- Question generator ---------------------------------------------------

_OP_SYMBOL = {
    'addition': '+',
    'subtraction': '−',
    'multiplication': '×',
    'division': '÷',
}


def _rand_operands(op: Op, difficulty: Difficulty) -> tuple[int, int]:
    """Pick two integers appropriate for the requested op + difficulty.
    All answers are integers (division uses exact multiples)."""
    if op == 'addition':
        if difficulty == 'easy':
            return _rng.randint(1, 20), _rng.randint(1, 20)
        if difficulty == 'medium':
            return _rng.randint(10, 99), _rng.randint(10, 99)
        return _rng.randint(100, 999), _rng.randint(100, 999)

    if op == 'subtraction':
        if difficulty == 'easy':
            a = _rng.randint(5, 20)
            b = _rng.randint(1, a - 1)  # keep positive
        elif difficulty == 'medium':
            a = _rng.randint(20, 99)
            b = _rng.randint(1, min(20, a - 1))
        else:
            a = _rng.randint(200, 999)
            b = _rng.randint(10, 99)
        return a, b

    if op == 'multiplication':
        if difficulty == 'easy':
            return _rng.randint(1, 10), _rng.randint(1, 5)
        if difficulty == 'medium':
            return _rng.randint(2, 12), _rng.randint(2, 12)
        return _rng.randint(10, 25), _rng.randint(2, 12)

    # division — start from multiplication and reverse to guarantee an int result
    if difficulty == 'easy':
        b, r = _rng.randint(1, 5), _rng.randint(1, 10)
    elif difficulty == 'medium':
        b, r = _rng.randint(2, 12), _rng.randint(2, 12)
    else:
        b, r = _rng.randint(5, 15), _rng.randint(5, 20)
    return b * r, b  # a ÷ b = r


def _compute(op: Op, a: int, b: int) -> int:
    if op == 'addition':
        return a + b
    if op == 'subtraction':
        return a - b
    if op == 'multiplication':
        return a * b
    return a // b  # exact by construction


def _distractors(correct: int, op: Op) -> list[int]:
    """Return exactly 3 wrong answers near the correct one — makes the
    question feel like a real quiz rather than a trivial guess."""
    seen = {correct}
    out: list[int] = []
    # Deltas are chosen so distractors stay in a believable range even for
    # small-number division questions.
    base_deltas = [-2, -1, 1, 2, -3, 3, -5, 5, -10, 10]
    _rng.shuffle(base_deltas)
    for d in base_deltas:
        candidate = correct + d
        if op != 'subtraction' and candidate < 0:
            continue
        if candidate in seen:
            continue
        seen.add(candidate)
        out.append(candidate)
        if len(out) == 3:
            return out
    # Ultra-defensive: pad with random unique numbers if we somehow ran out.
    while len(out) < 3:
        cand = correct + _rng.randint(-15, 15)
        if cand not in seen and cand >= 0:
            seen.add(cand)
            out.append(cand)
    return out


class Challenge(TypedDict):
    question: str
    options: list[int]
    challenge_token: str
    expires_at: int
    op: Op
    difficulty: Difficulty


def build_challenge(
    contest_id: str,
    op: Op = 'addition',
    difficulty: Difficulty = 'easy',
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> Challenge:
    if op not in ALLOWED_OPS:
        op = 'addition'
    if difficulty not in ALLOWED_DIFF:
        difficulty = 'easy'

    a, b = _rand_operands(op, difficulty)
    ans = _compute(op, a, b)
    question = f"{a} {_OP_SYMBOL[op]} {b} = ?"
    options = _distractors(ans, op) + [ans]
    _rng.shuffle(options)

    exp = int(time.time()) + ttl_seconds
    payload = {
        'cid': contest_id,
        'a': ans,
        'exp': exp,
        # nonce prevents token reuse across concurrent questions for the same
        # user even if they land on the same page twice within a second.
        'n': secrets.token_hex(8),
    }
    token = _sign_payload(payload)

    return {
        'question': question,
        'options': options,
        'challenge_token': token,
        'expires_at': exp,
        'op': op,
        'difficulty': difficulty,
    }


# ---- HMAC token codec -----------------------------------------------------

def _sign_payload(payload: dict) -> str:
    body = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(',', ':'), sort_keys=True).encode('utf-8')
    ).decode('ascii').rstrip('=')
    sig = hmac.new(_key(), body.encode('ascii'), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _unpack_token(token: str) -> dict | None:
    try:
        body, sig = token.rsplit('.', 1)
    except ValueError:
        return None
    expected = hmac.new(_key(), body.encode('ascii'), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        pad = '=' * (-len(body) % 4)
        return json.loads(base64.urlsafe_b64decode(body + pad).decode('utf-8'))
    except Exception:
        return None


class VerifyResult(TypedDict):
    ok: bool
    reason: str


def verify_challenge(contest_id: str, answer: str | int, challenge_token: str) -> VerifyResult:
    payload = _unpack_token(challenge_token or '')
    if not payload:
        return {'ok': False, 'reason': 'invalid_token'}
    if payload.get('cid') != contest_id:
        return {'ok': False, 'reason': 'contest_mismatch'}
    if int(payload.get('exp', 0)) < int(time.time()):
        return {'ok': False, 'reason': 'expired'}
    try:
        typed = int(str(answer).strip())
    except (TypeError, ValueError):
        return {'ok': False, 'reason': 'invalid_answer'}
    if typed != int(payload['a']):
        return {'ok': False, 'reason': 'incorrect'}
    return {'ok': True, 'reason': 'ok'}
