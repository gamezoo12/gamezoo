"""One-time Signup (Welcome) Challenge: Super Admin config, per-user participation, server-verified attempts, analytics."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from auth import _as_utc, email_is_verified, get_current_user, phone_gate_blocks, require_super_admin
from deps import get_db
from services.analytics_common import is_staff, is_test_account
from services.country_policy import verified_resident

router = APIRouter(prefix='/api/signup-challenge', tags=['signup-challenge'])
admin_router = APIRouter(prefix='/api/admin/signup-challenge', tags=['admin-signup-challenge'])

SETTINGS_ID = 'signup_challenge'
COUNTDOWN_MS = 3000
GRACE_MS = 6000
_now = lambda: datetime.now(timezone.utc)  # noqa: E731

COLOUR_PALETTE = [
    {'name': 'BLUE', 'hex': '#0000ff'}, {'name': 'RED', 'hex': '#ff0000'}, {'name': 'GREEN', 'hex': '#00c853'},
    {'name': 'ORANGE', 'hex': '#ff7900'}, {'name': 'PINK', 'hex': '#ff1493'}, {'name': 'WHITE', 'hex': '#ffffff'},
    {'name': 'YELLOW', 'hex': '#ffff00'}, {'name': 'BLACK', 'hex': '#000000'}, {'name': 'VIOLET', 'hex': '#8f00ff'},
    {'name': 'LIGHT GREEN', 'hex': '#7cfc00'}, {'name': 'PALE YELLOW', 'hex': '#fff3a3'},
]

# Games whose real attempts the server generates and scores itself (puzzle seeded + every answer checked).
SUPPORTED_GAMES = {
    'number_sequence': {
        'label': 'Number Sequence', 'defaults': {'target': 20},
        'how_to': ['Tap the numbers in order from 1 upwards as fast as you can.',
                   'A wrong tap does not count, keep going.',
                   'Your score is your finish time: the fastest time wins.'],
    },
    'colour_match': {
        'label': 'Colour Match', 'defaults': {'colours': 6, 'rounds': 20},
        'how_to': ['A colour word appears in a different ink colour.',
                   'Tap the colour of the INK, not the word.',
                   'Your score is your finish time: answer every round, each wrong answer adds 1 second.'],
    },
}
UNSUPPORTED_REASON = 'Scores are reported by the browser, the server cannot verify them yet.'

STATUSES = ('eligible', 'started', 'in_progress', 'completed', 'forfeited', 'expired')
EVENT_TYPES = ('impression', 'demo_start', 'demo_complete', 'close_click', 'final_view', 'scorecard_download',
               'scorecard_download_story', 'scorecard_download_square', 'share_whatsapp', 'share_instagram', 'share_native',
               'community_whatsapp', 'instagram_page', 'copy_link', 'copy_caption', 'copy_invite')


def _clamp(v, lo, hi, default):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return default


def _game_config(game_id: str, cfg: dict | None) -> dict:
    cfg = cfg or {}
    if game_id == 'number_sequence':
        return {'target': _clamp(cfg.get('target'), 5, 50, 20)}
    return {'colours': _clamp(cfg.get('colours'), 2, len(COLOUR_PALETTE), 6), 'rounds': _clamp(cfg.get('rounds'), 5, 40, 20)}


class PrizeTier(BaseModel):
    rank: int = Field(ge=1, le=100)
    prize: str = Field(min_length=1, max_length=120)


class ChallengeIn(BaseModel):
    title: str = Field('WELCOME CHALLENGE', min_length=2, max_length=80)
    description: str = Field('', max_length=600)
    prize_type: Literal['cash', 'gift', 'voucher', 'other'] = 'cash'
    prize_amount_gbp: Optional[float] = Field(50, ge=0, le=100000)
    prize_label: str = Field('£50 GIVEAWAY', min_length=1, max_length=80)
    prize_description: str = Field('', max_length=300)
    game_id: str
    game_config: dict = Field(default_factory=dict)
    attempts_allowed: int = Field(3, ge=1, le=10)
    time_limit_s: int = Field(60, ge=10, le=600)
    demo_enabled: bool = True
    demo_time_limit_s: int = Field(30, ge=10, le=300)
    demo_max_runs: int = Field(3, ge=1, le=20)
    how_to_play: list[str] = Field(default_factory=list, max_length=10)
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    eligible_signups_from: Optional[datetime] = None
    uk_only: bool = True
    winner_count: int = Field(1, ge=1, le=100)
    prize_distribution: list[PrizeTier] = Field(default_factory=lambda: [PrizeTier(rank=1, prize='£50')])
    ranking_method: Literal['fastest_time'] = 'fastest_time'
    tie_break: Literal['earliest_finish'] = 'earliest_finish'
    whatsapp_url: str = Field('https://chat.whatsapp.com/I6L15DZ3r9FD4NEaNPDesL', max_length=300)
    instagram_url: str = Field('https://www.instagram.com/prizeleague', max_length=300)
    share_url: str = Field('https://www.prizeleague.co.uk', max_length=300)
    background_url: str = Field('', max_length=500)
    scorecard_bg_url: str = Field('', max_length=500)
    rules_text: str = Field('', max_length=6000)
    legal_reviewed: bool = False


class StatusIn(BaseModel):
    status: Literal['draft', 'published', 'paused', 'archived']


class SettingsIn(BaseModel):
    enabled: bool


class AssignIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)


class StartIn(BaseModel):
    request_id: str = Field(min_length=8, max_length=64)


class SubmitIn(BaseModel):
    taps: list[int] = Field(default_factory=list, max_length=200)
    tap_ms: list[int] = Field(default_factory=list, max_length=200)
    duration_ms: int = Field(ge=0, le=3_600_000)
    finished: bool = False


class EventIn(BaseModel):
    type: str
    meta: dict = Field(default_factory=dict)


class VisitIn(BaseModel):
    code: str = Field(min_length=4, max_length=40)
    visitor_id: Optional[str] = Field(None, max_length=80)


async def ensure_signup_challenge_indexes(db) -> None:
    await db.signup_challenges.create_index('challenge_id', unique=True)
    await db.signup_challenge_participations.create_index([('challenge_id', 1), ('user_id', 1)], unique=True)
    await db.signup_challenge_participations.create_index('participation_id', unique=True)
    await db.signup_challenge_participations.create_index('share_code', unique=True, sparse=True)
    await db.signup_challenge_attempts.create_index('attempt_id', unique=True)
    await db.signup_challenge_attempts.create_index([('participation_id', 1), ('attempt_no', 1)], unique=True)
    await db.signup_challenge_attempts.create_index([('participation_id', 1), ('request_id', 1)], unique=True)
    await db.signup_challenge_events.create_index([('challenge_id', 1), ('type', 1), ('created_at', -1)])
    await db.signup_challenge_referrals.create_index('signup_user_id', unique=True)


def _excluded(user: dict) -> bool:
    return is_staff(user) or is_test_account(user)


async def _feature_enabled(db) -> bool:
    doc = await db.settings.find_one({'_id': SETTINGS_ID}) or {}
    return bool(doc.get('enabled'))


async def _live_challenge(db) -> dict | None:
    return await db.signup_challenges.find_one({'status': 'published'}, {'_id': 0})


def _in_window(ch: dict, now: datetime) -> bool:
    start, end = _as_utc(ch.get('start_at')), _as_utc(ch.get('end_at'))
    return (not start or start <= now) and (not end or now <= end)


def _snapshot(ch: dict) -> dict:
    keys = ('title', 'description', 'prize_type', 'prize_amount_gbp', 'prize_label', 'prize_description', 'game_id', 'game_config',
            'attempts_allowed', 'time_limit_s', 'demo_enabled', 'demo_time_limit_s', 'demo_max_runs', 'how_to_play', 'end_at',
            'uk_only', 'tie_break', 'whatsapp_url', 'instagram_url', 'share_url', 'background_url', 'scorecard_bg_url', 'rules_text')
    snap = {k: ch.get(k) for k in keys}
    snap['game_label'] = SUPPORTED_GAMES[ch['game_id']]['label']
    return snap


def _real_eligibility(user: dict, snap: dict) -> tuple[bool, str | None]:
    if is_staff(user):
        return True, None
    if not snap.get('uk_only'):
        return bool(user.get('phone_verified') or user.get('phone_otp_required') is False), None
    if user.get('country_of_residence') == 'GB' and verified_resident(user):
        return True, None
    return False, 'The real giveaway challenge is open to UK residents with a verified UK (+44) mobile number. You can still try the practice game.'


async def _event(db, ch_id: str, user: dict | None, etype: str, meta: dict | None = None) -> None:
    await db.signup_challenge_events.insert_one({
        'event_id': secrets.token_hex(10), 'challenge_id': ch_id, 'user_id': (user or {}).get('user_id'), 'type': etype,
        'meta': meta or {}, 'excluded': _excluded(user) if user else False, 'created_at': _now(),
    })


def _pub_attempt(a: dict) -> dict:
    return {k: a.get(k) for k in ('attempt_id', 'attempt_no', 'status', 'score', 'duration_ms', 'correct', 'total', 'started_at', 'finished_at')}


async def _close_stale_attempts(db, part: dict) -> None:
    """Any real attempt still open on a fresh load is lost (browser closed / refreshed mid-attempt)."""
    now = _now()
    cur = db.signup_challenge_attempts.find({'participation_id': part['participation_id'], 'status': 'in_progress'}, {'_id': 0})
    async for a in cur:
        await db.signup_challenge_attempts.update_one(
            {'attempt_id': a['attempt_id'], 'status': 'in_progress'},
            {'$set': {'status': 'abandoned', 'score': None, 'finished_at': now, 'close_reason': 'left_mid_attempt'}})
    await _refresh_participation(db, part['participation_id'])


async def _refresh_participation(db, pid: str) -> dict:
    part = await db.signup_challenge_participations.find_one({'participation_id': pid}, {'_id': 0})
    attempts = await db.signup_challenge_attempts.find({'participation_id': pid}, {'_id': 0}).sort('attempt_no', 1).to_list(20)
    done = [a for a in attempts if a['status'] != 'in_progress']
    valid = [a for a in done if a['status'] == 'completed']
    best = sorted(valid, key=lambda a: (a['score'], a['finished_at']))[:1]
    upd = {'attempts_finished': len(done), 'best_score': best[0]['score'] if best else None,
           'best_duration_ms': best[0]['duration_ms'] if best else None, 'best_at': best[0]['finished_at'] if best else None,
           'best_attempt_id': best[0]['attempt_id'] if best else None, 'updated_at': _now()}
    status = part['status']
    if status not in ('forfeited', 'expired', 'completed'):
        if any(a['status'] == 'in_progress' for a in attempts):
            status = 'in_progress'
        elif len(done) >= part['snapshot']['attempts_allowed']:
            status = 'completed'
            upd['completed_at'] = _now()
        elif attempts or part.get('demo_runs'):
            status = 'started'
    upd['status'] = status
    return await db.signup_challenge_participations.find_one_and_update(
        {'participation_id': pid}, {'$set': upd}, projection={'_id': 0}, return_document=ReturnDocument.AFTER)


async def _new_participation(db, ch: dict, user: dict, source: str) -> dict | None:
    doc = {
        'participation_id': 'SCP-' + secrets.token_hex(10).upper(), 'challenge_id': ch['challenge_id'], 'user_id': user['user_id'],
        'display_name': (user.get('name') or 'Player').split(' ')[0][:20], 'status': 'eligible', 'source': source,
        'snapshot': _snapshot(ch), 'attempts_used': 0, 'attempts_finished': 0, 'best_score': None, 'demo_runs': 0,
        'share_code': secrets.token_urlsafe(6), 'excluded': _excluded(user), 'country': user.get('country_of_residence'),
        'user_created_at': _as_utc(user.get('created_at')), 'created_at': _now(), 'dismissed_at': None,
    }
    ref = await db.signup_challenge_referrals.find_one({'signup_user_id': user['user_id']}, {'_id': 0})
    if ref:
        doc['referred_by_code'] = ref['code']
    try:
        await db.signup_challenge_participations.insert_one(dict(doc))
    except DuplicateKeyError:
        return await db.signup_challenge_participations.find_one({'challenge_id': ch['challenge_id'], 'user_id': user['user_id']}, {'_id': 0})
    return doc


def _user_ready(user: dict) -> bool:
    """Signup + required verification complete, so the challenge never interrupts OTP/terms/country steps."""
    return (email_is_verified(user) and bool(user.get('terms_accepted_at')) and bool(user.get('country_of_residence'))
            and not phone_gate_blocks(user))


async def _attempts(db, pid: str) -> list[dict]:
    rows = await db.signup_challenge_attempts.find({'participation_id': pid}, {'_id': 0}).sort('attempt_no', 1).to_list(20)
    return [_pub_attempt(a) for a in rows]


async def _state(db, user: dict, part: dict) -> dict:
    snap = part['snapshot']
    can_real, reason = _real_eligibility(user, snap)
    remaining = max(0, snap['attempts_allowed'] - part.get('attempts_used', 0))
    if part['status'] in ('forfeited', 'expired', 'completed'):
        remaining = 0
    return {'participation': {k: part.get(k) for k in ('participation_id', 'status', 'attempts_used', 'attempts_finished', 'best_score',
                                                    'best_duration_ms', 'best_attempt_id', 'share_code', 'display_name', 'demo_runs',
                                                    'final_seen_at', 'forfeited_at')},
            'challenge': {**snap, 'challenge_id': part['challenge_id']}, 'attempts': await _attempts(db, part['participation_id']),
            'remaining': remaining, 'can_play_real': can_real and remaining > 0, 'real_block_reason': reason}


async def _my_participation(db, user: dict, require_live: bool = True) -> dict:
    part = await db.signup_challenge_participations.find_one(
        {'user_id': user['user_id'], 'dismissed_at': None}, {'_id': 0}, sort=[('created_at', -1)])
    if not part:
        raise HTTPException(404, 'No signup challenge available')
    if require_live:
        end = _as_utc(part['snapshot'].get('end_at'))
        if end and _now() > end:
            raise HTTPException(409, {'code': 'CHALLENGE_ENDED', 'message': 'This challenge has ended.'})
    return part


# ------------------------------- player -------------------------------

@router.get('/me')
async def my_challenge(request: Request):
    db = get_db()
    user = await get_current_user(request)
    now = _now()
    part = await db.signup_challenge_participations.find_one({'user_id': user['user_id']}, {'_id': 0}, sort=[('created_at', -1)])
    if not part:
        if not await _feature_enabled(db):
            return {'show': False, 'reason': 'disabled'}
        ch = await _live_challenge(db)
        if not ch or not _in_window(ch, now) or ch['game_id'] not in SUPPORTED_GAMES:
            return {'show': False, 'reason': 'no_live_challenge'}
        if not _user_ready(user):
            return {'show': False, 'reason': 'verification_pending'}
        created, since = _as_utc(user.get('created_at')), _as_utc(ch.get('eligible_signups_from'))
        if not created or not since or created < since:
            return {'show': False, 'reason': 'existing_user'}
        part = await _new_participation(db, ch, user, 'signup')
    if part.get('dismissed_at'):
        return {'show': False, 'reason': 'dismissed'}
    ch = await db.signup_challenges.find_one({'challenge_id': part['challenge_id']}, {'_id': 0, 'status': 1})
    if not await _feature_enabled(db) or (ch or {}).get('status') != 'published':
        return {'show': False, 'reason': 'paused'}
    if not _user_ready(user):
        return {'show': False, 'reason': 'verification_pending'}
    end = _as_utc(part['snapshot'].get('end_at'))
    if end and now > end and part['status'] in ('eligible', 'started', 'in_progress'):
        await db.signup_challenge_participations.update_one({'participation_id': part['participation_id']},
                                                            {'$set': {'status': 'expired', 'expired_at': now}})
        return {'show': False, 'reason': 'expired'}
    if part['status'] == 'expired':
        return {'show': False, 'reason': 'expired'}
    if part['status'] == 'in_progress':
        await _close_stale_attempts(db, part)
    part = await _refresh_participation(db, part['participation_id'])
    if part['status'] == 'forfeited':
        return {'show': False, 'reason': 'forfeited'}
    return {'show': True, **(await _state(db, user, part))}


@router.post('/event')
async def track_event(body: EventIn, request: Request):
    db = get_db()
    user = await get_current_user(request)
    if body.type not in EVENT_TYPES:
        raise HTTPException(400, 'Unknown event')
    part = await db.signup_challenge_participations.find_one({'user_id': user['user_id']}, {'_id': 0}, sort=[('created_at', -1)])
    if not part:
        raise HTTPException(404, 'No signup challenge')
    meta = {k: v for k, v in list(body.meta.items())[:5] if isinstance(v, (str, int, float, bool))}
    if body.type == 'demo_start':
        await db.signup_challenge_participations.update_one({'participation_id': part['participation_id']}, {'$inc': {'demo_runs': 1}})
        if part['status'] == 'eligible':
            await db.signup_challenge_participations.update_one({'participation_id': part['participation_id'], 'status': 'eligible'},
                                                                {'$set': {'status': 'started'}})
    if body.type == 'impression':
        await db.signup_challenge_participations.update_one({'participation_id': part['participation_id'], 'first_seen_at': None},
                                                            {'$set': {'first_seen_at': _now()}})
    await _event(db, part['challenge_id'], user, body.type, meta)
    return {'ok': True}


@router.post('/attempts/start')
async def start_attempt(body: StartIn, request: Request):
    db = get_db()
    user = await get_current_user(request)
    part = await _my_participation(db, user)
    existing = await db.signup_challenge_attempts.find_one({'participation_id': part['participation_id'], 'request_id': body.request_id}, {'_id': 0})
    if existing:
        if existing['status'] != 'in_progress':
            raise HTTPException(409, {'code': 'ATTEMPT_CLOSED', 'message': 'This attempt has already finished.'})
        return {'attempt': _attempt_payload(existing), 'remaining': max(0, part['snapshot']['attempts_allowed'] - part['attempts_used'])}
    snap = part['snapshot']
    can_real, reason = _real_eligibility(user, snap)
    if not can_real:
        raise HTTPException(403, {'code': 'NOT_ELIGIBLE', 'message': reason})
    if part['status'] in ('completed', 'forfeited', 'expired'):
        raise HTTPException(409, {'code': 'NO_ATTEMPTS', 'message': 'No real attempts remain.'})
    if await db.signup_challenge_attempts.find_one({'participation_id': part['participation_id'], 'status': 'in_progress'}, {'_id': 1}):
        raise HTTPException(409, {'code': 'ATTEMPT_RUNNING', 'message': 'Another attempt is already running on another device.'})
    # Atomic claim: never more than attempts_allowed, regardless of retries or parallel devices.
    claimed = await db.signup_challenge_participations.find_one_and_update(
        {'participation_id': part['participation_id'], 'status': {'$in': ['eligible', 'started']},
         'attempts_used': {'$lt': snap['attempts_allowed']}},
        {'$inc': {'attempts_used': 1}, '$set': {'status': 'in_progress', 'last_attempt_at': _now()}},
        projection={'_id': 0}, return_document=ReturnDocument.AFTER)
    if not claimed:
        raise HTTPException(409, {'code': 'NO_ATTEMPTS', 'message': 'No real attempts remain.'})
    attempt = _build_attempt(claimed, body.request_id)
    try:
        await db.signup_challenge_attempts.insert_one(dict(attempt))
    except DuplicateKeyError:
        await db.signup_challenge_participations.update_one({'participation_id': part['participation_id']}, {'$inc': {'attempts_used': -1}})
        raise HTTPException(409, {'code': 'ATTEMPT_RUNNING', 'message': 'Attempt already being created, please retry.'})
    if attempt['attempt_no'] == 1:
        await _event(db, part['challenge_id'], user, 'real_start')
    await _event(db, part['challenge_id'], user, 'attempt_start', {'attempt_no': attempt['attempt_no']})
    return {'attempt': _attempt_payload(attempt), 'remaining': snap['attempts_allowed'] - claimed['attempts_used']}


def _build_attempt(part: dict, request_id: str) -> dict:
    snap = part['snapshot']
    cfg = _game_config(snap['game_id'], snap.get('game_config'))
    board, expected = {}, []
    if snap['game_id'] == 'number_sequence':
        nums = list(range(1, cfg['target'] + 1))
        secrets.SystemRandom().shuffle(nums)
        board, expected = {'numbers': nums, 'target': cfg['target']}, list(range(1, cfg['target'] + 1))
    else:
        palette = COLOUR_PALETTE[:cfg['colours']]
        names = [c['name'] for c in palette]
        qs = []
        for _ in range(cfg['rounds']):
            ink = secrets.choice(palette)
            word = secrets.choice([c for c in palette if c['name'] != ink['name']])
            opts = names[:]
            secrets.SystemRandom().shuffle(opts)
            qs.append({'word': word['name'], 'ink': ink['hex'], 'options': opts})
            expected.append(opts.index(ink['name']))
        board = {'questions': qs}
    return {'attempt_id': 'SCA-' + secrets.token_hex(12).upper(), 'participation_id': part['participation_id'],
            'challenge_id': part['challenge_id'], 'user_id': part['user_id'], 'attempt_no': part['attempts_used'],
            'request_id': request_id, 'game_id': snap['game_id'], 'game_config': cfg, 'board': board, 'expected': expected,
            'time_limit_s': snap['time_limit_s'], 'status': 'in_progress', 'score': None, 'started_at': _now(),
            'excluded': part.get('excluded', False)}


def _attempt_payload(a: dict) -> dict:
    return {'attempt_id': a['attempt_id'], 'attempt_no': a['attempt_no'], 'game_id': a['game_id'], 'board': a['board'],
            'time_limit_s': a['time_limit_s'], 'countdown_ms': COUNTDOWN_MS, 'started_at': a['started_at']}


def _score(a: dict, body: SubmitIn, server_ms: int) -> dict:
    """Score = verified finish time in ms (lower wins). Only fully finished runs get a time."""
    limit_ms = a['time_limit_s'] * 1000
    play_ms = max(0, server_ms - COUNTDOWN_MS)
    # Client finish moment is trusted only within network tolerance of the server clock.
    duration = body.duration_ms if body.duration_ms <= play_ms + 1500 else play_ms
    duration = max(100, min(duration, limit_ms))
    expected = a['expected']
    taps = body.taps[:len(expected)]
    stamps = body.tap_ms[:len(body.taps)]
    if stamps and (any(b < s for s, b in zip(stamps, stamps[1:])) or stamps[-1] > duration + 50 or (len(stamps) > 3 and duration < len(stamps) * 60)):
        return {'valid': False, 'reason': 'timing_invalid'}
    if a['game_id'] == 'number_sequence':
        if taps != expected[:len(taps)]:
            return {'valid': False, 'reason': 'sequence_mismatch'}
        correct, penalty = len(taps), 0
    else:
        correct = sum(1 for i, v in enumerate(taps) if v == expected[i])
        penalty = (len(taps) - correct) * 1000
    if len(taps) < len(expected):
        return {'valid': False, 'reason': 'not_finished'}
    return {'valid': True, 'score': int(duration + penalty), 'duration_ms': int(duration), 'correct': correct, 'total': len(expected),
            'finished': True}


@router.post('/attempts/{attempt_id}/submit')
async def submit_attempt(attempt_id: str, body: SubmitIn, request: Request):
    db = get_db()
    user = await get_current_user(request)
    a = await db.signup_challenge_attempts.find_one({'attempt_id': attempt_id, 'user_id': user['user_id']}, {'_id': 0})
    if not a:
        raise HTTPException(404, 'Attempt not found')
    if a['status'] == 'in_progress':
        now = _now()
        server_ms = int((now - _as_utc(a['started_at'])).total_seconds() * 1000)
        if server_ms > a['time_limit_s'] * 1000 + COUNTDOWN_MS + GRACE_MS:
            upd = {'status': 'expired', 'score': None, 'finished_at': now, 'close_reason': 'time_limit'}
        else:
            r = _score(a, body, server_ms)
            if r['valid']:
                upd = {'status': 'completed', 'score': r['score'], 'duration_ms': r['duration_ms'], 'correct': r['correct'],
                       'total': r['total'], 'finished': r['finished'], 'finished_at': now, 'server_elapsed_ms': server_ms, 'verified': True}
            else:
                upd = {'status': 'expired' if r['reason'] == 'not_finished' else 'failed', 'score': None, 'finished_at': now, 'close_reason': r['reason']}
        res = await db.signup_challenge_attempts.update_one({'attempt_id': attempt_id, 'status': 'in_progress'}, {'$set': upd})
        if res.modified_count:
            await _event(db, a['challenge_id'], user, 'attempt_complete', {'attempt_no': a['attempt_no'], 'status': upd['status']})
    part = await _refresh_participation(db, a['participation_id'])
    if part['status'] == 'completed' and not part.get('all_complete_logged'):
        if (await db.signup_challenge_participations.update_one({'participation_id': part['participation_id'], 'all_complete_logged': None},
                                                                {'$set': {'all_complete_logged': True}})).modified_count:
            await _event(db, a['challenge_id'], user, 'all_complete')
    a = await db.signup_challenge_attempts.find_one({'attempt_id': attempt_id}, {'_id': 0})
    return {'attempt': _pub_attempt(a), **(await _state(db, user, part))}


@router.post('/forfeit')
async def forfeit(request: Request):
    db = get_db()
    user = await get_current_user(request)
    part = await _my_participation(db, user, require_live=False)
    now = _now()
    # A running attempt is closed without score; finished attempt scores are kept.
    await db.signup_challenge_attempts.update_many({'participation_id': part['participation_id'], 'status': 'in_progress'},
                                                   {'$set': {'status': 'abandoned', 'score': None, 'finished_at': now, 'close_reason': 'forfeit'}})
    await _refresh_participation(db, part['participation_id'])
    terminal = part['status'] in ('completed', 'expired')
    upd = {'dismissed_at': now} if terminal else {'status': 'forfeited', 'forfeited_at': now, 'dismissed_at': now}
    await db.signup_challenge_participations.update_one({'participation_id': part['participation_id']}, {'$set': upd})
    if not terminal:
        await _event(db, part['challenge_id'], user, 'forfeit_confirmed', {'attempts_finished': part.get('attempts_finished', 0)})
    part = await db.signup_challenge_participations.find_one({'participation_id': part['participation_id']}, {'_id': 0})
    return {'ok': True, **(await _state(db, user, part))}


@router.post('/final-seen')
async def final_seen(request: Request):
    db = get_db()
    user = await get_current_user(request)
    part = await _my_participation(db, user, require_live=False)
    if part['status'] != 'completed':
        raise HTTPException(409, 'Challenge not completed')
    await db.signup_challenge_participations.update_one({'participation_id': part['participation_id']},
                                                        {'$set': {'final_seen_at': _now(), 'dismissed_at': _now()}})
    return {'ok': True}


@router.post('/visit')
async def referral_visit(body: VisitIn):
    db = get_db()
    part = await db.signup_challenge_participations.find_one({'share_code': body.code}, {'_id': 0, 'challenge_id': 1, 'excluded': 1})
    if not part:
        return {'ok': False}
    await db.signup_challenge_events.insert_one({'event_id': secrets.token_hex(10), 'challenge_id': part['challenge_id'], 'user_id': None,
                                                 'type': 'referral_visit', 'meta': {'code': body.code, 'visitor_id': body.visitor_id},
                                                 'excluded': bool(part.get('excluded')), 'created_at': _now()})
    return {'ok': True}


@router.post('/referral-signup')
async def referral_signup(body: VisitIn, request: Request):
    """Called once after a new account signs up via a shared scorecard link."""
    db = get_db()
    user = await get_current_user(request)
    created = _as_utc(user.get('created_at'))
    part = await db.signup_challenge_participations.find_one({'share_code': body.code}, {'_id': 0})
    if not part or part['user_id'] == user['user_id'] or not created or _now() - created > timedelta(hours=48):
        return {'attributed': False}
    try:
        await db.signup_challenge_referrals.insert_one({'signup_user_id': user['user_id'], 'code': body.code, 'challenge_id': part['challenge_id'],
                                                        'referrer_user_id': part['user_id'], 'excluded': _excluded(user), 'created_at': _now()})
    except DuplicateKeyError:
        return {'attributed': False}
    await _event(db, part['challenge_id'], user, 'referral_signup', {'code': body.code})
    return {'attributed': True}


# ------------------------------- admin (Super Admin only) -------------------------------

def _validate(body: ChallengeIn) -> dict:
    if body.game_id not in SUPPORTED_GAMES:
        raise HTTPException(400, {'code': 'UNSUPPORTED_GAME', 'message': 'This game cannot be used: ' + UNSUPPORTED_REASON})
    if body.start_at and body.end_at and body.end_at <= body.start_at:
        raise HTTPException(400, 'End date must be after the start date')
    data = body.model_dump()
    data['game_config'] = _game_config(body.game_id, body.game_config)
    data['how_to_play'] = [s.strip()[:200] for s in body.how_to_play if s.strip()] or SUPPORTED_GAMES[body.game_id]['how_to']
    data['prize_distribution'] = sorted(data['prize_distribution'], key=lambda t: t['rank'])
    for k in ('start_at', 'end_at', 'eligible_signups_from'):
        if data[k] and data[k].tzinfo is None:
            data[k] = data[k].replace(tzinfo=timezone.utc)
    return data


async def _audit(db, admin: dict, action: str, ch_id: str | None, before=None, after=None) -> None:
    strip = lambda d: {k: v for k, v in (d or {}).items() if k not in ('_id',)}  # noqa: E731
    await db.signup_challenge_audit.insert_one({'audit_id': secrets.token_hex(10), 'challenge_id': ch_id, 'action': action,
                                                'admin_id': admin['user_id'], 'admin_email': admin.get('email'),
                                                'before': strip(before), 'after': strip(after), 'created_at': _now()})


@admin_router.get('/games')
async def admin_games(request: Request):
    await require_super_admin(request)
    from routers.game_routes import GAME_TYPES
    out = []
    for g in GAME_TYPES:
        sup = SUPPORTED_GAMES.get(g['id'])
        out.append({'id': g['id'], 'label': sup['label'] if sup else g['label'], 'supported': bool(sup),
                    'defaults': sup['defaults'] if sup else None, 'how_to': sup['how_to'] if sup else None,
                    'reason': None if sup else UNSUPPORTED_REASON})
    if not any(o['id'] == 'colour_match' for o in out):
        sup = SUPPORTED_GAMES['colour_match']
        out.insert(0, {'id': 'colour_match', 'label': sup['label'], 'supported': True, 'defaults': sup['defaults'], 'how_to': sup['how_to'], 'reason': None})
    out.sort(key=lambda o: (not o['supported'], o['label']))
    return {'games': out}


@admin_router.get('/settings')
async def admin_get_settings(request: Request):
    await require_super_admin(request)
    return {'enabled': await _feature_enabled(get_db())}


@admin_router.put('/settings')
async def admin_put_settings(body: SettingsIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    before = {'enabled': await _feature_enabled(db)}
    await db.settings.update_one({'_id': SETTINGS_ID}, {'$set': {'enabled': body.enabled, 'updated_at': _now(), 'updated_by': admin['user_id']}}, upsert=True)
    await _audit(db, admin, 'feature_toggle', None, before, {'enabled': body.enabled})
    return {'enabled': body.enabled}


@admin_router.get('/challenges')
async def admin_list(request: Request):
    await require_super_admin(request)
    db = get_db()
    rows = await db.signup_challenges.find({}, {'_id': 0}).sort('created_at', -1).to_list(200)
    for r in rows:
        r['participants'] = await db.signup_challenge_participations.count_documents({'challenge_id': r['challenge_id']})
    return {'challenges': rows, 'enabled': await _feature_enabled(db)}


@admin_router.post('/challenges')
async def admin_create(body: ChallengeIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    doc = {**_validate(body), 'challenge_id': 'SC-' + secrets.token_hex(6).upper(), 'status': 'draft', 'version': 1,
           'created_at': _now(), 'created_by': admin['user_id'], 'updated_at': _now()}
    await db.signup_challenges.insert_one(dict(doc))
    await _audit(db, admin, 'create', doc['challenge_id'], None, doc)
    doc.pop('_id', None)
    return doc


@admin_router.put('/challenges/{challenge_id}')
async def admin_update(challenge_id: str, body: ChallengeIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    before = await db.signup_challenges.find_one({'challenge_id': challenge_id}, {'_id': 0})
    if not before:
        raise HTTPException(404, 'Challenge not found')
    if before['status'] == 'archived':
        raise HTTPException(409, 'Archived challenges cannot be edited')
    data = _validate(body)
    if not data.get('eligible_signups_from'):
        data['eligible_signups_from'] = before.get('eligible_signups_from')
    # Existing participants keep their snapshot; edits only affect new participants.
    after = await db.signup_challenges.find_one_and_update(
        {'challenge_id': challenge_id}, {'$set': {**data, 'updated_at': _now()}, '$inc': {'version': 1}},
        projection={'_id': 0}, return_document=ReturnDocument.AFTER)
    await _audit(db, admin, 'update', challenge_id, before, after)
    return after


@admin_router.post('/challenges/{challenge_id}/status')
async def admin_status(challenge_id: str, body: StatusIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    ch = await db.signup_challenges.find_one({'challenge_id': challenge_id}, {'_id': 0})
    if not ch:
        raise HTTPException(404, 'Challenge not found')
    if ch['status'] == 'archived':
        raise HTTPException(409, 'Archived challenges cannot change status')
    upd = {'status': body.status, 'updated_at': _now()}
    if body.status == 'published':
        if ch['game_id'] not in SUPPORTED_GAMES:
            raise HTTPException(400, 'Selected game is not supported')
        if not ch.get('legal_reviewed') or len((ch.get('rules_text') or '').strip()) < 50:
            raise HTTPException(400, {'code': 'RULES_REQUIRED', 'message': 'Publish the full giveaway rules (min 50 characters) and confirm the legal review before publishing.'})
        if not ch.get('end_at'):
            raise HTTPException(400, {'code': 'END_REQUIRED', 'message': 'Set a closing date before publishing.'})
        await db.signup_challenges.update_many({'status': 'published', 'challenge_id': {'$ne': challenge_id}},
                                               {'$set': {'status': 'paused', 'updated_at': _now()}})
        upd['published_at'] = _now()
        if not ch.get('eligible_signups_from'):
            upd['eligible_signups_from'] = _now()
    await db.signup_challenges.update_one({'challenge_id': challenge_id}, {'$set': upd})
    await _audit(db, admin, f'status_{body.status}', challenge_id, {'status': ch['status']}, upd)
    return await db.signup_challenges.find_one({'challenge_id': challenge_id}, {'_id': 0})


@admin_router.post('/challenges/{challenge_id}/assign')
async def admin_assign(challenge_id: str, body: AssignIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    ch = await db.signup_challenges.find_one({'challenge_id': challenge_id}, {'_id': 0})
    if not ch or ch['status'] == 'archived':
        raise HTTPException(404, 'Challenge not found')
    user = await db.users.find_one({'email': body.email.strip().lower()}, {'_id': 0})
    if not user:
        raise HTTPException(404, 'User not found')
    if await db.signup_challenge_participations.find_one({'challenge_id': challenge_id, 'user_id': user['user_id']}, {'_id': 1}):
        raise HTTPException(409, 'User already has this challenge')
    part = await _new_participation(db, ch, user, 'assigned')
    await _audit(db, admin, 'assign', challenge_id, None, {'user_id': user['user_id']})
    return {'participation_id': part['participation_id']}


def _rank_key(tie: str):
    return lambda p: (p.get('best_score'), _as_utc(p.get('best_at')) or datetime.max.replace(tzinfo=timezone.utc))


@admin_router.get('/challenges/{challenge_id}/participants')
async def admin_participants(challenge_id: str, request: Request, status: Optional[str] = None, q: Optional[str] = None,
                             include_excluded: bool = True):
    await require_super_admin(request)
    db = get_db()
    ch = await db.signup_challenges.find_one({'challenge_id': challenge_id}, {'_id': 0})
    if not ch:
        raise HTTPException(404, 'Challenge not found')
    m: dict = {'challenge_id': challenge_id}
    if status in STATUSES:
        m['status'] = status
    if not include_excluded:
        m['excluded'] = {'$ne': True}
    parts = await db.signup_challenge_participations.find(m, {'_id': 0, 'snapshot': 0}).to_list(5000)
    uids = [p['user_id'] for p in parts]
    users = {u['user_id']: u async for u in db.users.find({'user_id': {'$in': uids}}, {'_id': 0, 'user_id': 1, 'email': 1, 'name': 1, 'public_id': 1})}
    attempts: dict = {}
    async for a in db.signup_challenge_attempts.find({'challenge_id': challenge_id, 'user_id': {'$in': uids}},
                                                     {'_id': 0, 'board': 0, 'expected': 0, 'request_id': 0}).sort('attempt_no', 1):
        attempts.setdefault(a['participation_id'], []).append(a)
    ql = (q or '').strip().lower()
    out = []
    for p in parts:
        u = users.get(p['user_id'], {})
        if ql and ql not in f"{u.get('email', '')} {u.get('name', '')} {u.get('public_id', '')}".lower():
            continue
        out.append({**p, 'email': u.get('email'), 'name': u.get('name'), 'public_id': u.get('public_id'),
                    'attempts': attempts.get(p['participation_id'], [])})
    ranked = sorted([p for p in out if p.get('best_score') and not p.get('excluded')], key=_rank_key(ch.get('tie_break')))
    for i, p in enumerate(ranked):
        p['provisional_rank'] = i + 1
    out.sort(key=lambda p: (p.get('provisional_rank') or 10**6, -(p['created_at'].timestamp() if p.get('created_at') else 0)))
    return {'participants': out, 'winner_count': ch.get('winner_count', 1), 'prize_distribution': ch.get('prize_distribution', []),
            'note': 'Provisional ranking from verified scores. Prizes are only paid after winner verification through the existing payout workflow.'}


@admin_router.get('/challenges/{challenge_id}/analytics')
async def admin_analytics(challenge_id: str, request: Request, date_from: Optional[datetime] = Query(None, alias='from'),
                          date_to: Optional[datetime] = Query(None, alias='to'), source: Optional[str] = None):
    await require_super_admin(request)
    db = get_db()
    ch = await db.signup_challenges.find_one({'challenge_id': challenge_id}, {'_id': 0})
    if not ch:
        raise HTTPException(404, 'Challenge not found')
    em: dict = {'challenge_id': challenge_id, 'excluded': {'$ne': True}}
    pm: dict = {'challenge_id': challenge_id, 'excluded': {'$ne': True}}
    rng = {}
    if date_from:
        rng['$gte'] = date_from if date_from.tzinfo else date_from.replace(tzinfo=timezone.utc)
    if date_to:
        rng['$lte'] = date_to if date_to.tzinfo else date_to.replace(tzinfo=timezone.utc)
    if rng:
        em['created_at'] = rng
        pm['created_at'] = rng
    if source:
        uids = await db.acquisition_attributions.distinct('user_id', {'source_key': source})
        pm['user_id'] = {'$in': uids}
        em['user_id'] = {'$in': uids}
    counts = {r['_id']: r for r in await db.signup_challenge_events.aggregate([
        {'$match': em}, {'$group': {'_id': '$type', 'total': {'$sum': 1}, 'users': {'$addToSet': '$user_id'}}},
        {'$project': {'total': 1, 'unique': {'$size': '$users'}}}]).to_list(100)}
    c = lambda k: counts.get(k, {}).get('total', 0)  # noqa: E731
    u = lambda k: counts.get(k, {}).get('unique', 0)  # noqa: E731
    per_attempt = {}
    async for r in db.signup_challenge_events.aggregate([{'$match': {**em, 'type': 'attempt_complete'}},
                                                         {'$group': {'_id': '$meta.attempt_no', 'n': {'$sum': 1}}}]):
        per_attempt[str(r['_id'])] = r['n']
    status_counts = {r['_id']: r['n'] async for r in db.signup_challenge_participations.aggregate([
        {'$match': pm}, {'$group': {'_id': '$status', 'n': {'$sum': 1}}}])}
    am = {'challenge_id': challenge_id, 'excluded': {'$ne': True}, 'status': 'completed'}
    if 'user_id' in pm:
        am['user_id'] = pm['user_id']
    if rng:
        am['finished_at'] = rng
    agg = await db.signup_challenge_attempts.aggregate([{'$match': am}, {'$group': {'_id': None, 'avg': {'$avg': '$score'}, 'max': {'$min': '$score'}, 'n': {'$sum': 1}}}]).to_list(1)
    sources = await db.acquisition_attributions.distinct('source_key', {'user_id': {'$in': await db.signup_challenge_participations.distinct('user_id', {'challenge_id': challenge_id})}})
    return {
        'challenge_id': challenge_id, 'game_id': ch['game_id'], 'sources': sorted(sources),
        'eligible_signups': sum(status_counts.values()), 'status_counts': status_counts,
        'impressions': c('impression'), 'unique_viewers': u('impression'),
        'demo_starts': c('demo_start'), 'demo_completions': c('demo_complete'),
        'real_starts': u('real_start'), 'attempt_completions': per_attempt,
        'all_attempts_completed': c('all_complete'), 'close_clicks': c('close_click'), 'forfeits': c('forfeit_confirmed'),
        'avg_time_ms': round(agg[0]['avg']) if agg else None, 'best_time_ms': agg[0]['max'] if agg else None, 'scored_attempts': agg[0]['n'] if agg else 0,
        'scorecard_downloads': c('scorecard_download') + c('scorecard_download_story') + c('scorecard_download_square'),
        'whatsapp_share_clicks': c('share_whatsapp'), 'instagram_share_clicks': c('share_instagram'), 'native_share_clicks': c('share_native'),
        'community_clicks': c('community_whatsapp') + c('instagram_page'), 'copy_link_clicks': c('copy_link') + c('copy_caption') + c('copy_invite'),
        'referral_visits': c('referral_visit'), 'referral_signups': c('referral_signup'),
        'note': 'Share counts are button clicks, not confirmed social posts. Staff and test accounts are excluded.',
    }


@admin_router.get('/audit')
async def admin_audit(request: Request, challenge_id: Optional[str] = None):
    await require_super_admin(request)
    m = {'challenge_id': challenge_id} if challenge_id else {}
    rows = await get_db().signup_challenge_audit.find(m, {'_id': 0, 'before': 0, 'after': 0}).sort('created_at', -1).to_list(200)
    return {'audit': rows}
