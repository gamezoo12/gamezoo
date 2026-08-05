"""Skill-based games: play after ticket purchase, score by speed+accuracy, per-contest leaderboard."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import Optional
import secrets

from auth import get_current_user
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
    duration_ms: int = Field(..., ge=100, le=1200000)
    accuracy: float = Field(..., ge=0.0, le=1.0)
    solved: bool = True
    challenge_token: Optional[str] = None


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


@router.post('/submit')
async def submit_score(inp: SubmitScoreInput, request: Request):
    user = await get_current_user(request)
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
    # Prefer attempts_per_ticket; fall back to legacy max_attempts. Clamp 1..10.
    apt = int(contest.get('attempts_per_ticket') or contest.get('max_attempts') or (meta or {}).get('max_attempts', 3))
    apt = max(1, min(apt, 10))

    # Count tickets this user owns for THIS contest — total attempts pool.
    tickets_owned = await db.tickets.count_documents({'user_id': user['user_id'], 'contest_id': contest['contest_id']})
    tickets_owned = max(1, tickets_owned)
    total_allowed = apt * tickets_owned

    # Turnstile challenge — required only when a site key is configured (prod).
    # Test envs (no key) skip this check so pytest suites keep working.
    import os as _os
    if _os.environ.get('TURNSTILE_SITE_KEY') and not _os.environ.get('TEST_OTP_BYPASS_CODE'):
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

    # Pool of attempts across ALL of the user's tickets for this contest.
    prior_total = await db.game_scores.count_documents({'user_id': user['user_id'], 'contest_id': contest['contest_id']})
    prior_ticket = await db.game_scores.count_documents({'ticket_id': inp.ticket_id})
    if prior_total >= total_allowed:
        raise HTTPException(status_code=400, detail=f'No attempts left ({total_allowed} used across your {tickets_owned} ticket{"" if tickets_owned == 1 else "s"})')

    pts = _calc_points(game_type, inp.duration_ms, inp.accuracy, inp.solved)
    score = GameScore(
        contest_id=contest['contest_id'],
        ticket_id=inp.ticket_id,
        user_id=user['user_id'],
        user_name=user.get('name', 'Anonymous'),
        game_type=game_type,
        points=pts,
        duration_ms=inp.duration_ms,
        accuracy=inp.accuracy,
        attempts_used=prior_ticket + 1,
    )
    await db.game_scores.insert_one(score.model_dump())
    attempts_left = total_allowed - (prior_total + 1)
    return {'ok': True, 'points': pts, 'attempts_left': attempts_left, 'total_allowed': total_allowed, 'tickets': tickets_owned, 'score': score.model_dump()}


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
