"""Skill-based games: play after ticket purchase, score by speed+accuracy, per-contest leaderboard."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import Optional
import secrets
from pymongo.errors import DuplicateKeyError

from auth import get_current_user, require_verified_user
from deps import get_db
from models import GameScore

router = APIRouter(prefix='/api/games', tags=['games'])
public_router = APIRouter(prefix='/api', tags=['leaderboard'])

# Registry of available games — surfaced to Admin edit dialog.
GAME_TYPES = [
    {'id': 'jigsaw_3x3',       'label': 'Image Jigsaw (3×3)',      'category': 'puzzle',   'target_time_s': 60,  'max_attempts': 3},
    {'id': 'jigsaw_4x4',       'label': 'Image Jigsaw (4×4)',      'category': 'puzzle',   'target_time_s': 90,  'max_attempts': 3},
    {'id': 'memory_match',     'label': 'Memory Match (pairs)',    'category': 'memory',   'target_time_s': 45,  'max_attempts': 3},
    {'id': 'number_sequence',  'label': 'Number Sequence (1→20)',  'category': 'reaction', 'target_time_s': 30,  'max_attempts': 3},
    {'id': 'slider_puzzle',    'label': '15-Slider Puzzle',        'category': 'puzzle',   'target_time_s': 120, 'max_attempts': 3},
    {'id': 'emoji_riddle',     'label': 'Emoji Riddle',            'category': 'trivia',   'target_time_s': 30,  'max_attempts': 3},
    {'id': 'target_tap',       'label': 'Target Tap (bullseye)',   'category': 'reaction', 'target_time_s': 20,  'max_attempts': 3},
    {'id': 'word_unscramble',  'label': 'Word Unscramble',         'category': 'word',     'target_time_s': 30,  'max_attempts': 3},
    {'id': 'math_sprint',      'label': 'Math Sprint (arithmetic)','category': 'reaction', 'target_time_s': 60,  'max_attempts': 3},
    {'id': 'reaction_time',    'label': 'Reaction Time',           'category': 'reaction', 'target_time_s': 15,  'max_attempts': 3},
    {'id': 'trivia_quiz',      'label': 'Trivia Quiz (10 Qs)',     'category': 'trivia',   'target_time_s': 90,  'max_attempts': 3},
    {'id': 'simon_says',       'label': 'Simon Says (sequence)',   'category': 'memory',   'target_time_s': 60,  'max_attempts': 3},
    {'id': 'whack_a_mole',     'label': 'Whack-a-Mole',            'category': 'reaction', 'target_time_s': 30,  'max_attempts': 3},
    {'id': 'odd_one_out',      'label': 'Odd One Out (spot the different)','category': 'puzzle', 'target_time_s': 30, 'max_attempts': 3},
    {'id': 'color_match',      'label': 'Color Match (Stroop test)','category': 'reaction', 'target_time_s': 45,  'max_attempts': 3},
    {'id': 'pattern_repeat',   'label': 'Pattern Repeat (rhythm)', 'category': 'memory',   'target_time_s': 45,  'max_attempts': 3},
    # ----- Vol.2 (14 new skill-based games) -----
    {'id': 'sudoku_mini',        'label': 'Sudoku Mini (4×4 logic)',        'category': 'logic',    'target_time_s': 120, 'max_attempts': 3},
    {'id': 'sequence_predict',   'label': 'Sequence Predict (what comes next)', 'category': 'logic', 'target_time_s': 60,  'max_attempts': 3},
    {'id': 'countdown_numbers',  'label': 'Countdown Numbers (reach the target)', 'category': 'math','target_time_s': 90, 'max_attempts': 3},
    {'id': 'word_ladder',        'label': 'Word Ladder (change 1 letter)',  'category': 'word',     'target_time_s': 90,  'max_attempts': 3},
    {'id': 'chess_mate_in_one',  'label': 'Chess: Mate in One',             'category': 'strategy', 'target_time_s': 60,  'max_attempts': 3},
    {'id': 'tower_of_hanoi',     'label': 'Tower of Hanoi (3 disks)',       'category': 'logic',    'target_time_s': 90,  'max_attempts': 3},
    {'id': 'lights_out',         'label': 'Lights Out (parity puzzle)',     'category': 'logic',    'target_time_s': 90,  'max_attempts': 3},
    {'id': 'minesweeper_mini',   'label': 'Minesweeper Mini (5×5)',         'category': 'deduction','target_time_s': 120, 'max_attempts': 3},
    {'id': 'nonogram_mini',      'label': 'Nonogram / Picross (5×5)',       'category': 'logic',    'target_time_s': 180, 'max_attempts': 3},
    {'id': 'tf2048_mini',        'label': '2048 Mini (reach 32)',           'category': 'strategy', 'target_time_s': 120, 'max_attempts': 3},
    {'id': 'cryptogram',         'label': 'Cryptogram (decode cipher)',     'category': 'logic',    'target_time_s': 120, 'max_attempts': 3},
    {'id': 'anagram_finder',     'label': 'Anagram Finder (find 4+ words)', 'category': 'word',     'target_time_s': 90,  'max_attempts': 3},
    {'id': 'maze_solver',        'label': 'Maze Solver (7×7 randomized)',   'category': 'spatial',  'target_time_s': 60,  'max_attempts': 3},
    {'id': 'spot_pattern',       'label': 'Spot the Pattern (Raven-style)', 'category': 'reasoning','target_time_s': 45,  'max_attempts': 3},
]


class SubmitScoreInput(BaseModel):
    ticket_id: str
    session_id: Optional[str] = Field(default=None, min_length=16, max_length=80)
    duration_ms: int = Field(..., ge=100, le=1200000)
    accuracy: float = Field(..., ge=0.0, le=1.0)
    solved: bool = True
    challenge_token: Optional[str] = None


class StartGameSessionInput(BaseModel):
    ticket_id: str = Field(..., min_length=1, max_length=100)


def _attempt_limit(contest: dict, meta: dict | None) -> int:
    return max(1, min(int(contest.get('attempts_per_ticket') or contest.get('max_attempts') or (meta or {}).get('max_attempts', 3)), 10))


async def _ensure_game_session_indexes(db):
    await db.game_attempt_sessions.create_index('session_id', unique=True, name='ux_game_attempt_session_id')
    await db.game_attempt_sessions.create_index(
        [('ticket_id', 1)], unique=True,
        partialFilterExpression={'status': 'started'}, name='ux_game_active_session_per_ticket',
    )
    await db.game_scores.create_index('game_session_id', unique=True, sparse=True, name='ux_game_score_session')


def _calc_points(
    game_type: str,
    duration_ms: int,
    accuracy: float,
    solved: bool,
) -> float:
    """Return a verified performance score from 0.00 to 100.00.

    Weighting:
      - Accuracy:   60 points
      - Speed:      25 points
      - Completion: 15 points

    Faster than the configured target receives the full speed allocation.
    Unsolved attempts receive no completion bonus.
    """
    meta = next(
        (game for game in GAME_TYPES if game.get('id') == game_type),
        {},
    )
    target_ms = max(
        1000,
        float(meta.get('target_time_s', 60)) * 1000,
    )

    safe_accuracy = max(0.0, min(1.0, float(accuracy)))
    safe_duration = max(1, int(duration_ms))

    accuracy_points = 60.0 * safe_accuracy
    speed_ratio = max(0.0, min(1.0, target_ms / safe_duration))
    speed_points = 25.0 * speed_ratio
    completion_points = 15.0 if solved else 0.0

    return round(
        max(0.0, min(100.0, accuracy_points + speed_points + completion_points)),
        2,
    )


@router.get('/types')
async def list_types():
    return {'games': GAME_TYPES}


@router.post('/session/start')
async def start_game_session(inp: StartGameSessionInput, request: Request):
    user = await require_verified_user(request)
    db = get_db()
    ticket = await db.tickets.find_one({'ticket_id': inp.ticket_id, 'user_id': user['user_id']}, {'_id': 0})
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    contest = await db.contests.find_one({'contest_id': ticket['contest_id']}, {'_id': 0})
    if not contest:
        raise HTTPException(status_code=404, detail='Contest not found')
    game_type = contest.get('game_type')
    meta = next((game for game in GAME_TYPES if game.get('id') == game_type), None)
    if not meta:
        raise HTTPException(status_code=400, detail='This contest is not tied to a supported game')
    end_raw = contest.get('end_date')
    if end_raw:
        try:
            end_at = datetime.fromisoformat(str(end_raw).replace('Z', '+00:00'))
            end_at = end_at if end_at.tzinfo else end_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > end_at:
                raise HTTPException(status_code=400, detail='Contest has closed. Attempts are no longer accepted.')
        except (ValueError, TypeError):
            pass
    await _ensure_game_session_indexes(db)
    now = datetime.now(timezone.utc)
    active = await db.game_attempt_sessions.find_one(
        {'ticket_id': inp.ticket_id, 'user_id': user['user_id'], 'status': 'started'}, {'_id': 0},
    )
    if active and active.get('started_at'):
        if (now - active['started_at']).total_seconds() <= 1800:
            return {'session_id': active['session_id'], 'started_at': active['started_at'].isoformat(), 'game_type': game_type, 'resumed': True}
        await db.game_attempt_sessions.update_one({'session_id': active['session_id'], 'status': 'started'},
                                                  {'$set': {'status': 'expired', 'completed_at': now}})
    prior_ticket = await db.game_scores.count_documents({
        'ticket_id': inp.ticket_id, 'contest_id': contest['contest_id'], 'user_id': user['user_id'],
    })
    allowed = _attempt_limit(contest, meta)
    if prior_ticket >= allowed:
        raise HTTPException(status_code=400, detail=f'No attempts left for this ticket ({allowed} allowed per ticket)')
    session = {
        'session_id': f'GAS-{secrets.token_hex(16).upper()}', 'ticket_id': inp.ticket_id,
        'contest_id': contest['contest_id'], 'user_id': user['user_id'], 'game_type': game_type,
        'status': 'started', 'started_at': now, 'created_at': now,
    }
    try:
        await db.game_attempt_sessions.insert_one(dict(session))
    except DuplicateKeyError:
        active = await db.game_attempt_sessions.find_one(
            {'ticket_id': inp.ticket_id, 'user_id': user['user_id'], 'status': 'started'}, {'_id': 0},
        )
        if not active:
            raise HTTPException(status_code=409, detail='Another attempt is being started. Please retry.')
        session = active
    return {'session_id': session['session_id'], 'started_at': session['started_at'].isoformat(), 'game_type': game_type, 'resumed': False}


@router.post('/submit')
async def submit_score(inp: SubmitScoreInput, request: Request):
    user = await require_verified_user(request)
    db = get_db()
    ticket = await db.tickets.find_one({'ticket_id': inp.ticket_id, 'user_id': user['user_id']}, {'_id': 0})
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    contest = await db.contests.find_one({'contest_id': ticket['contest_id']}, {'_id': 0})
    if not contest:
        raise HTTPException(status_code=404, detail='Contest not found')
    game_type = contest.get('game_type')
    if not game_type:
        raise HTTPException(status_code=400, detail='This contest is not tied to a game')
    meta = next((g for g in GAME_TYPES if g['id'] == game_type), None)
    if not meta:
        raise HTTPException(status_code=400, detail='This contest is not tied to a supported game')
    # Prefer attempts_per_ticket; fall back to legacy max_attempts. Clamp 1..10.
    apt = _attempt_limit(contest, meta)

    # Attempts are enforced independently PER TICKET.
    # Buying additional tickets creates additional independent game entries;
    # it must never increase the attempt allowance of an existing ticket.
    total_allowed = apt

    # Turnstile challenge — required only when a site key is configured (prod).
    # Test envs (no key) skip this check so pytest suites keep working.
    import os as _os
    from otp_verify import _is_prod
    captcha_waived = bool(_os.environ.get('TEST_OTP_BYPASS_CODE')) and not _is_prod()
    if _os.environ.get('TURNSTILE_SITE_KEY') and not captcha_waived:
        from routers.captcha_routes import verify_challenge_token
        if not inp.challenge_token or not verify_challenge_token(inp.challenge_token, user['user_id'], contest['contest_id']):
            raise HTTPException(status_code=400, detail='CAPTCHA challenge missing or expired. Please refresh and try again.')

    # Enforce contest closing time — no attempts after end_date
    from datetime import datetime as _dt, timezone as _tz
    end_raw = contest.get('end_date')
    if end_raw:
        try:
            end_dt = _dt.fromisoformat(str(end_raw).replace('Z', '+00:00'))
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=_tz.utc)
            if _dt.now(_tz.utc) > end_dt:
                raise HTTPException(status_code=400, detail='Contest has closed. Attempts are no longer accepted.')
        except (ValueError, TypeError):
            pass

    # Enforce the configured attempt allowance against THIS ticket only.
    prior_ticket = await db.game_scores.count_documents({
        'ticket_id': inp.ticket_id,
        'contest_id': contest['contest_id'],
        'user_id': user['user_id'],
    })
    if prior_ticket >= total_allowed:
        raise HTTPException(
            status_code=400,
            detail=f'No attempts left for this ticket ({total_allowed} allowed per ticket)',
        )

    if not inp.session_id:
        raise HTTPException(status_code=409, detail='Start an official game session before submitting a result.')
    prior_session_score = await db.game_scores.find_one(
        {'game_session_id': inp.session_id, 'ticket_id': inp.ticket_id, 'contest_id': contest['contest_id'],
         'user_id': user['user_id']}, {'_id': 0},
    )
    if prior_session_score:
        attempts_used = await db.game_scores.count_documents({
            'ticket_id': inp.ticket_id, 'contest_id': contest['contest_id'], 'user_id': user['user_id'],
        })
        return {'ok': True, 'idempotent_replay': True, 'points': prior_session_score['points'],
                'attempts_left': max(0, total_allowed - attempts_used), 'total_allowed': total_allowed,
                'attempts_per_ticket': apt, 'ticket_id': inp.ticket_id, 'duration_ms': prior_session_score['duration_ms'],
                'score': prior_session_score}
    session = await db.game_attempt_sessions.find_one({
        'session_id': inp.session_id, 'ticket_id': inp.ticket_id, 'contest_id': contest['contest_id'],
        'user_id': user['user_id'], 'game_type': game_type, 'status': 'started',
    }, {'_id': 0})
    if not session:
        raise HTTPException(status_code=409, detail='This official game session is invalid, expired or already submitted.')
    now = datetime.now(timezone.utc)
    started_at = session['started_at']
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    duration_ms = int((now - started_at).total_seconds() * 1000)
    if duration_ms < 100:
        raise HTTPException(status_code=400, detail='Official attempt must run for at least 100 milliseconds.')
    if duration_ms > 1800000:
        await db.game_attempt_sessions.update_one({'session_id': inp.session_id, 'status': 'started'},
                                                  {'$set': {'status': 'expired', 'completed_at': now}})
        raise HTTPException(status_code=409, detail='This official game session has expired. Start a new attempt.')
    claimed = await db.game_attempt_sessions.update_one(
        {'session_id': inp.session_id, 'status': 'started'},
        {'$set': {'status': 'submitting', 'completed_at': now, 'duration_ms': duration_ms}},
    )
    if claimed.modified_count != 1:
        raise HTTPException(status_code=409, detail='This official game session has already been submitted.')

    pts = _calc_points(game_type, duration_ms, inp.accuracy, inp.solved)
    score = GameScore(
        contest_id=contest['contest_id'],
        ticket_id=inp.ticket_id,
        user_id=user['user_id'],
        user_name=user.get('name', 'Anonymous'),
        game_type=game_type,
        points=pts,
        duration_ms=duration_ms,
        accuracy=inp.accuracy,
        attempts_used=prior_ticket + 1,
    )
    try:
        score_data = score.model_dump()
        score_data['game_session_id'] = inp.session_id
        await db.game_scores.insert_one(score_data)
        await db.game_attempt_sessions.update_one({'session_id': inp.session_id, 'status': 'submitting'},
                                                  {'$set': {'status': 'submitted', 'score_id': score.score_id}})
    except Exception:
        await db.game_attempt_sessions.update_one({'session_id': inp.session_id, 'status': 'submitting'},
                                                  {'$set': {'status': 'started'}, '$unset': {'completed_at': '', 'duration_ms': ''}})
        raise
    attempts_left = max(0, total_allowed - (prior_ticket + 1))
    return {
        'ok': True,
        'points': pts,
        'attempts_left': attempts_left,
        'total_allowed': total_allowed,
        'attempts_per_ticket': apt,
        'ticket_id': inp.ticket_id,
        'duration_ms': duration_ms,
        'score': score.model_dump(),
    }


@public_router.get('/leaderboard/global')
async def global_leaderboard(limit: int = 50):
    """Global leaderboard across all contests.
    Ranks players by total points (sum of their best score per contest they entered).
    Public — no auth required.
    """
    db = get_db()
    # Step 1: best score per (user, contest)
    pipeline = [
        {'$sort': {'points': -1, 'duration_ms': 1}},
        {'$group': {
            '_id': {'user_id': '$user_id', 'contest_id': '$contest_id'},
            'user_name': {'$first': '$user_name'},
            'best_points': {'$max': '$points'},
        }},
        # Step 2: aggregate per user
        {'$group': {
            '_id': '$_id.user_id',
            'user_name': {'$first': '$user_name'},
            'total_points': {'$sum': '$best_points'},
            'contests_played': {'$sum': 1},
        }},
        {'$sort': {'total_points': -1, 'contests_played': -1}},
        {'$limit': int(limit)},
    ]
    rows = await db.game_scores.aggregate(pipeline).to_list(int(limit))

    # Use the user's current profile name on the leaderboard.
    user_ids = [r.get('_id') for r in rows if r.get('_id')]
    if user_ids:
        current_names = {}
        async for user in db.users.find(
            {'user_id': {'$in': user_ids}},
            {'_id': 0, 'user_id': 1, 'name': 1},
        ):
            current_names[user['user_id']] = user.get('name')
        for r in rows:
            r['user_name'] = current_names.get(r.get('_id')) or r.get('user_name')
    # Normalize to 0-100 relative to the top-ranked user's total.
    if rows:
        best_total = max((r.get('total_points') or 0) for r in rows) or 1
        for r in rows:
            r['normalized_score'] = round((r.get('total_points', 0) * 100.0) / best_total, 2)
    for i, r in enumerate(rows):
        r['rank'] = i + 1
        r['user_id'] = r.pop('_id')
    return {'leaderboard': rows}


@router.get('/attempts/{ticket_id}')
async def my_attempts(ticket_id: str, request: Request):
    user = await get_current_user(request)
    db = get_db()
    ticket = await db.tickets.find_one({'ticket_id': ticket_id, 'user_id': user['user_id']}, {'_id': 0})
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    scores = await db.game_scores.find({'ticket_id': ticket_id}, {'_id': 0}).sort('created_at', 1).to_list(10)
    return {'attempts': scores}
