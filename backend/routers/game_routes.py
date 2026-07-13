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
]


class SubmitScoreInput(BaseModel):
    ticket_id: str
    duration_ms: int = Field(..., ge=100, le=1200000)
    accuracy: float = Field(..., ge=0.0, le=1.0)
    solved: bool = True


def _calc_points(game_type: str, duration_ms: int, accuracy: float, solved: bool) -> int:
    """Speed × accuracy scoring. Faster + more accurate = more points."""
    meta = next((g for g in GAME_TYPES if g['id'] == game_type), None)
    target = (meta or {}).get('target_time_s', 60) * 1000
    if not solved:
        return max(0, int(accuracy * 200))
    # Base 1000 for a solved game, up to 1000 speed bonus, capped
    speed_bonus = max(0, min(1000, int(1000 * (target / max(duration_ms, 1)))))
    return int(1000 + speed_bonus * accuracy)


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
    max_attempts = (meta or {}).get('max_attempts', 3)

    prior = await db.game_scores.count_documents({'ticket_id': inp.ticket_id})
    if prior >= max_attempts:
        raise HTTPException(status_code=400, detail=f'No attempts left (max {max_attempts})')

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
        attempts_used=prior + 1,
    )
    await db.game_scores.insert_one(score.model_dump())
    attempts_left = max_attempts - (prior + 1)
    return {'ok': True, 'points': pts, 'attempts_left': attempts_left, 'score': score.model_dump()}


@public_router.get('/contests/{contest_id}/leaderboard')
async def contest_leaderboard(contest_id: str, limit: int = 25):
    """Best score per user for this contest, sorted desc. Public — no auth required."""
    db = get_db()
    pipeline = [
        {'$match': {'contest_id': contest_id}},
        {'$sort': {'points': -1, 'duration_ms': 1}},
        {'$group': {
            '_id': '$user_id',
            'user_name': {'$first': '$user_name'},
            'points': {'$max': '$points'},
            'duration_ms': {'$first': '$duration_ms'},
            'accuracy': {'$first': '$accuracy'},
            'attempts': {'$sum': 1},
            'last_played': {'$last': '$created_at'},
        }},
        {'$sort': {'points': -1, 'duration_ms': 1}},
        {'$limit': int(limit)},
    ]
    rows = await db.game_scores.aggregate(pipeline).to_list(int(limit))
    for i, r in enumerate(rows):
        r['rank'] = i + 1
        r['user_id'] = r.pop('_id')
        if isinstance(r.get('last_played'), datetime):
            r['last_played'] = r['last_played'].isoformat()
    return {'contest_id': contest_id, 'leaderboard': rows}


@router.get('/attempts/{ticket_id}')
async def my_attempts(ticket_id: str, request: Request):
    user = await get_current_user(request)
    db = get_db()
    ticket = await db.tickets.find_one({'ticket_id': ticket_id, 'user_id': user['user_id']}, {'_id': 0})
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    scores = await db.game_scores.find({'ticket_id': ticket_id}, {'_id': 0}).sort('created_at', 1).to_list(10)
    return {'attempts': scores}
