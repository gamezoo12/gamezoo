"""Skill-based games: play after ticket purchase, score by speed+accuracy, per-contest leaderboard."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
from typing import Optional, Any
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

    # ----- V3 Batch 1: procedurally generated skill games -----
    {'id': 'rapid_equation',    'label': 'Rapid Equation',        'category': 'math',      'target_time_s': 55, 'max_attempts': 3},
    {'id': 'missing_operator',  'label': 'Missing Operator',      'category': 'math',      'target_time_s': 50, 'max_attempts': 3},
    {'id': 'number_grid_hunt',  'label': 'Number Grid Hunt',      'category': 'reaction',  'target_time_s': 45, 'max_attempts': 3},
    {'id': 'equation_balance',  'label': 'Equation Balance',      'category': 'math',      'target_time_s': 55, 'max_attempts': 3},
    {'id': 'memory_grid',       'label': 'Memory Grid',           'category': 'memory',    'target_time_s': 40, 'max_attempts': 3},
    {'id': 'direction_rush',    'label': 'Direction Rush',        'category': 'reaction',  'target_time_s': 40, 'max_attempts': 3},
    {'id': 'shape_sequence',    'label': 'Shape Sequence',        'category': 'reasoning', 'target_time_s': 55, 'max_attempts': 3},
    {'id': 'quick_compare',     'label': 'Quick Compare',         'category': 'math',      'target_time_s': 45, 'max_attempts': 3},
    {'id': 'logic_code_breaker','label': 'Logic Code Breaker',    'category': 'logic',     'target_time_s': 120,'max_attempts': 3},
    {'id': 'moving_target_pro', 'label': 'Moving Target Pro',     'category': 'reaction',  'target_time_s': 35, 'max_attempts': 3},
]



V3_GAME_IDS = {
    'rapid_equation',
    'missing_operator',
    'number_grid_hunt',
    'equation_balance',
    'memory_grid',
    'direction_rush',
    'shape_sequence',
    'quick_compare',
    'logic_code_breaker',
    'moving_target_pro',
}


class StartGameSessionInput(BaseModel):
    ticket_id: str = Field(..., min_length=1)


class SubmitScoreInput(BaseModel):
    ticket_id: str
    duration_ms: int = Field(..., ge=100, le=1200000)
    accuracy: float = Field(..., ge=0.0, le=1.0)
    solved: bool = True
    challenge_token: Optional[str] = None
    session_id: Optional[str] = None
    evidence: Optional[dict[str, Any]] = None



# ---------------------------------------------------------------------------
# V3 deterministic challenge reproduction
# ---------------------------------------------------------------------------

def _fnv1a_32(value: str) -> int:
    h = 2166136261

    for ch in str(value or ''):
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF

    return h


class _Mulberry32:
    def __init__(self, seed: int):
        self.state = seed & 0xFFFFFFFF

    def random(self) -> float:
        self.state = (self.state + 0x6D2B79F5) & 0xFFFFFFFF

        t = self.state

        t = (
            ((t ^ (t >> 15)) * (t | 1))
            & 0xFFFFFFFF
        )

        t ^= (
            t +
            (
                ((t ^ (t >> 7)) * (t | 61))
                & 0xFFFFFFFF
            )
        ) & 0xFFFFFFFF

        t &= 0xFFFFFFFF

        return (
            ((t ^ (t >> 14)) & 0xFFFFFFFF)
            / 4294967296.0
        )


def _v3_rng(
    seed: str,
    namespace: str,
    attempt_number: int,
    difficulty: str,
) -> _Mulberry32:
    combined = '|'.join([
        str(seed or ''),
        str(namespace or ''),
        str(attempt_number or ''),
        str(difficulty or 'medium'),
    ])

    return _Mulberry32(
        _fnv1a_32(combined)
    )


def _rng_int(rng: _Mulberry32, minimum: int, maximum: int) -> int:
    return int(
        rng.random() * (maximum - minimum + 1)
    ) + minimum


def _rng_item(rng: _Mulberry32, items):
    return items[
        _rng_int(rng, 0, len(items) - 1)
    ]


def _rng_shuffle(rng: _Mulberry32, items):
    values = list(items)

    for i in range(len(values) - 1, 0, -1):
        j = int(rng.random() * (i + 1))
        values[i], values[j] = values[j], values[i]

    return values


def _difficulty_profile(game_type: str, difficulty: str) -> dict:
    difficulty = (
        difficulty
        if difficulty in {'easy', 'medium', 'hard', 'expert'}
        else 'medium'
    )

    profiles = {
        'rapid_equation': {
            'easy': {'total': 8, 'max': 15, 'division': False},
            'medium': {'total': 10, 'max': 30, 'division': False},
            'hard': {'total': 12, 'max': 60, 'division': True},
            'expert': {'total': 15, 'max': 120, 'division': True},
        },

        'missing_operator': {
            'easy': {'total': 6, 'max': 15, 'division': False},
            'medium': {'total': 8, 'max': 30, 'division': False},
            'hard': {'total': 10, 'max': 60, 'division': True},
            'expert': {'total': 12, 'max': 100, 'division': True},
        },

        'equation_balance': {
            'easy': {'total': 6, 'max': 12},
            'medium': {'total': 8, 'max': 25},
            'hard': {'total': 10, 'max': 50},
            'expert': {'total': 12, 'max': 100},
        },

        'quick_compare': {
            'easy': {'total': 8, 'max': 15},
            'medium': {'total': 12, 'max': 30},
            'hard': {'total': 16, 'max': 60},
            'expert': {'total': 20, 'max': 120},
        },
    }

    return profiles[game_type][difficulty]


def _make_arithmetic_question(max_number: int, allow_division: bool, rng):
    operators = (
        ['+', '-', '×', '÷']
        if allow_division
        else ['+', '-', '×']
    )

    op = _rng_item(rng, operators)

    a = _rng_int(rng, 2, max_number)
    b = _rng_int(rng, 2, max_number)

    if op == '+':
        answer = a + b

    elif op == '-':
        if b > a:
            a, b = b, a

        answer = a - b

    elif op == '×':
        import math

        limit = max(
            5,
            int(math.floor(
                math.sqrt(max_number * 2)
            )),
        )

        a = _rng_int(rng, 2, limit)
        b = _rng_int(rng, 2, limit)
        answer = a * b

    else:
        b = _rng_int(
            rng,
            2,
            max(
                3,
                int(max_number // 4),
            ),
        )

        answer = _rng_int(
            rng,
            2,
            max(
                4,
                int(max_number // 3),
            ),
        )

        a = b * answer

    return {
        'answer': answer,
    }


def _make_operator_question(max_number: int, include_division: bool, rng):
    operators = (
        ['+', '-', '×', '÷']
        if include_division
        else ['+', '-', '×']
    )

    operator = _rng_item(rng, operators)

    a = _rng_int(rng, 2, max_number)
    b = _rng_int(rng, 2, max_number)

    if operator == '+':
        answer = a + b

    elif operator == '-':
        if b > a:
            a, b = b, a

        answer = a - b

    elif operator == '×':
        a = _rng_int(
            rng,
            2,
            max(4, max_number // 3),
        )

        b = _rng_int(
            rng,
            2,
            max(4, max_number // 3),
        )

        answer = a * b

    else:
        b = _rng_int(rng, 2, 10)

        answer = _rng_int(
            rng,
            2,
            max(3, max_number // 3),
        )

        a = b * answer

    # JS consumes RNG here when shuffling visible options.
    _rng_shuffle(rng, operators)

    return {
        'answer': answer,
        'operator': operator,
    }


def _make_balance_question(max_number: int, rng):
    a = _rng_int(rng, 2, max_number)
    b = _rng_int(rng, 2, max_number)
    c = _rng_int(rng, 2, max_number)

    target = a + b + c
    answer = target - a - b

    distractors = {answer}

    while len(distractors) < 4:
        distractors.add(
            max(
                1,
                answer + _rng_int(rng, -8, 8),
            )
        )

    # JS consumes RNG by shuffling answer options.
    _rng_shuffle(rng, list(distractors))

    return {
        'answer': answer,
    }


def _make_expression(max_number: int, rng):
    a = _rng_int(rng, 1, max_number)
    b = _rng_int(rng, 1, max_number)

    op = _rng_item(
        rng,
        ['+', '-', '×'],
    )

    if op == '+':
        return {
            'value': a + b,
        }

    if op == '-':
        high = max(a, b)
        low = min(a, b)

        return {
            'value': high - low,
        }

    x = _rng_int(
        rng,
        2,
        max(3, max_number // 4),
    )

    y = _rng_int(
        rng,
        2,
        max(3, max_number // 4),
    )

    return {
        'value': x * y,
    }


def _make_comparison(max_number: int, rng):
    left = _make_expression(max_number, rng)
    right = _make_expression(max_number, rng)

    guard = 0

    while left['value'] == right['value'] and guard < 10:
        right = _make_expression(max_number, rng)
        guard += 1

    if left['value'] == right['value']:
        answer = '='
    elif left['value'] > right['value']:
        answer = '>'
    else:
        answer = '<'

    return {
        'answer': answer,
    }


def _validate_v3_batch_a(
    game_type: str,
    session: dict,
    evidence: dict | None,
):
    if game_type not in {
        'rapid_equation',
        'missing_operator',
        'equation_balance',
        'quick_compare',
    }:
        return None

    if not evidence or not isinstance(evidence, dict):
        raise HTTPException(
            status_code=400,
            detail='Game evidence is required',
        )

    answers = evidence.get('answers')

    if not isinstance(answers, list):
        raise HTTPException(
            status_code=400,
            detail='Game evidence answers are invalid',
        )

    difficulty = str(
        session.get('difficulty') or 'medium'
    ).lower()

    profile = _difficulty_profile(
        game_type,
        difficulty,
    )

    total = int(profile['total'])

    if len(answers) != total:
        raise HTTPException(
            status_code=400,
            detail=f'Expected {total} game answers',
        )

    rng = _v3_rng(
        session['seed'],
        game_type,
        int(session['attempt_number']),
        difficulty,
    )

    correct = 0

    for submitted in answers:
        if game_type == 'rapid_equation':
            question = _make_arithmetic_question(
                int(profile['max']),
                bool(profile['division']),
                rng,
            )

            try:
                good = (
                    float(submitted)
                    == float(question['answer'])
                )
            except (TypeError, ValueError):
                good = False

        elif game_type == 'missing_operator':
            question = _make_operator_question(
                int(profile['max']),
                bool(profile['division']),
                rng,
            )

            good = (
                str(submitted)
                == str(question['operator'])
            )

        elif game_type == 'equation_balance':
            question = _make_balance_question(
                int(profile['max']),
                rng,
            )

            try:
                good = (
                    float(submitted)
                    == float(question['answer'])
                )
            except (TypeError, ValueError):
                good = False

        else:
            question = _make_comparison(
                int(profile['max']),
                rng,
            )

            good = (
                str(submitted)
                == str(question['answer'])
            )

        if good:
            correct += 1

    accuracy = (
        correct / total
        if total > 0
        else 0.0
    )

    return {
        'solved': True,
        'accuracy': max(
            0.0,
            min(1.0, accuracy),
        ),
        'correct': correct,
        'total': total,
    }


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



def _v3_validator_self_test():
    # Fixed fixtures generated from deterministic seeds.
    fixtures = [
        ('rapid_equation', 'abc123', 1, 'medium'),
        ('missing_operator', 'abc123', 1, 'medium'),
        ('equation_balance', 'abc123', 1, 'medium'),
        ('quick_compare', 'abc123', 1, 'medium'),
    ]

    for game_type, seed, attempt_number, difficulty in fixtures:
        profile = _difficulty_profile(
            game_type,
            difficulty,
        )

        rng = _v3_rng(
            seed,
            game_type,
            attempt_number,
            difficulty,
        )

        generated = []

        for _ in range(profile['total']):
            if game_type == 'rapid_equation':
                q = _make_arithmetic_question(
                    profile['max'],
                    profile['division'],
                    rng,
                )
                generated.append(q['answer'])

            elif game_type == 'missing_operator':
                q = _make_operator_question(
                    profile['max'],
                    profile['division'],
                    rng,
                )
                generated.append(q['operator'])

            elif game_type == 'equation_balance':
                q = _make_balance_question(
                    profile['max'],
                    rng,
                )
                generated.append(q['answer'])

            else:
                q = _make_comparison(
                    profile['max'],
                    rng,
                )
                generated.append(q['answer'])

        session = {
            'seed': seed,
            'attempt_number': attempt_number,
            'difficulty': difficulty,
        }

        result = _validate_v3_batch_a(
            game_type,
            session,
            {'answers': generated},
        )

        assert result is not None
        assert result['correct'] == profile['total']
        assert result['accuracy'] == 1.0

    return True


@router.get('/types')
async def list_types():
    return {'games': GAME_TYPES}



@router.post('/session/start')
async def start_game_session(inp: StartGameSessionInput, request: Request):
    """
    Create or return the active server-authorized session for the next
    V3 attempt on a ticket.

    Creating a session DOES NOT consume the attempt. The attempt is still
    consumed only when /games/submit successfully records a GameScore.
    """
    user = await get_current_user(request)
    db = get_db()

    ticket = await db.tickets.find_one(
        {
            'ticket_id': inp.ticket_id,
            'user_id': user['user_id'],
        },
        {'_id': 0},
    )

    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')

    contest = await db.contests.find_one(
        {'contest_id': ticket['contest_id']},
        {'_id': 0},
    )

    if not contest:
        raise HTTPException(status_code=404, detail='Contest not found')

    game_type = contest.get('game_type')

    if game_type not in V3_GAME_IDS:
        raise HTTPException(
            status_code=400,
            detail='Server game sessions are currently enabled for V3 games only',
        )

    # Reject sessions after contest close.
    end_raw = contest.get('end_date')
    if end_raw:
        try:
            end_dt = datetime.fromisoformat(
                str(end_raw).replace('Z', '+00:00')
            )

            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)

            if datetime.now(timezone.utc) > end_dt:
                raise HTTPException(
                    status_code=400,
                    detail='Contest has closed',
                )
        except HTTPException:
            raise
        except (ValueError, TypeError):
            pass

    meta = next(
        (g for g in GAME_TYPES if g['id'] == game_type),
        None,
    )

    apt = int(
        contest.get('attempts_per_ticket')
        or contest.get('max_attempts')
        or (meta or {}).get('max_attempts', 3)
    )
    apt = max(1, min(apt, 10))

    prior_ticket = await db.game_scores.count_documents({
        'ticket_id': inp.ticket_id,
        'contest_id': contest['contest_id'],
        'user_id': user['user_id'],
    })

    if prior_ticket >= apt:
        raise HTTPException(
            status_code=400,
            detail=f'No attempts left for this ticket ({apt} allowed per ticket)',
        )

    attempt_number = prior_ticket + 1
    now_utc = datetime.now(timezone.utc)

    # Only one active server session may exist for this ticket/attempt.
    existing = await db.game_sessions.find_one(
        {
            'user_id': user['user_id'],
            'ticket_id': inp.ticket_id,
            'contest_id': contest['contest_id'],
            'game_type': game_type,
            'attempt_number': attempt_number,
            'used': False,
            'expires_at': {'$gt': now_utc},
        },
        {'_id': 0},
    )

    if existing:
        return {
            'ok': True,
            'session_id': existing['session_id'],
            'seed': existing['seed'],
            'difficulty': existing.get('difficulty', 'medium'),
            'attempt_number': attempt_number,
            'attempts_per_ticket': apt,
            'expires_at': existing['expires_at'],
        }

    game_config = contest.get('game_config') or {}

    difficulty = str(
        game_config.get('difficulty') or 'medium'
    ).lower()

    if difficulty not in {'easy', 'medium', 'hard', 'expert'}:
        difficulty = 'medium'

    session_id = secrets.token_urlsafe(32)

    # Seed is intentionally generated by the backend.
    # The next patch will make V3 game generation deterministic from this seed.
    seed = secrets.token_hex(16)

    expires_at = now_utc + timedelta(minutes=20)

    doc = {
        'session_id': session_id,
        'user_id': user['user_id'],
        'ticket_id': inp.ticket_id,
        'contest_id': contest['contest_id'],
        'game_type': game_type,
        'attempt_number': attempt_number,
        'seed': seed,
        'difficulty': difficulty,
        'created_at': now_utc,
        'started_at': now_utc,
        'expires_at': expires_at,
        'used': False,
    }

    await db.game_sessions.insert_one(doc)

    return {
        'ok': True,
        'session_id': session_id,
        'seed': seed,
        'difficulty': difficulty,
        'attempt_number': attempt_number,
        'attempts_per_ticket': apt,
        'expires_at': expires_at,
    }


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

    # Attempts are enforced independently PER TICKET.
    # Buying additional tickets creates additional independent game entries;
    # it must never increase the attempt allowance of an existing ticket.
    total_allowed = apt

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

    # V3 official games require a server-issued, unused session tied to the
    # authenticated user, exact ticket, contest, game and next attempt.
    #
    # Existing V1/V2 games intentionally keep their existing submission path.
    claimed_session = None

    if game_type in V3_GAME_IDS:
        if not inp.session_id:
            raise HTTPException(
                status_code=400,
                detail='Official game session is required',
            )

        now_utc = datetime.now(timezone.utc)

        session_filter = {
            'session_id': inp.session_id,
            'user_id': user['user_id'],
            'ticket_id': inp.ticket_id,
            'contest_id': contest['contest_id'],
            'game_type': game_type,
            'attempt_number': prior_ticket + 1,
            'used': False,
            'expires_at': {'$gt': now_utc},
        }

        # Atomically claim the session so two simultaneous submissions cannot
        # create two scores from one official attempt.
        claimed_session = await db.game_sessions.find_one_and_update(
            session_filter,
            {
                '$set': {
                    'used': True,
                    'used_at': now_utc,
                }
            },
            return_document=True,
        )

        if not claimed_session:
            raise HTTPException(
                status_code=400,
                detail=(
                    'Official game session is invalid, expired, already used, '
                    'or does not match this ticket attempt'
                ),
            )

    # Server-authoritative result values.
    #
    # For hardened V3 Batch-A games, browser-provided accuracy/solved values
    # are ignored. The backend regenerates the exact challenge from the
    # server-issued session seed and validates the submitted answer evidence.
    server_accuracy = float(inp.accuracy)
    server_solved = bool(inp.solved)

    if (
        game_type in {
            'rapid_equation',
            'missing_operator',
            'equation_balance',
            'quick_compare',
        }
    ):
        if not claimed_session:
            raise HTTPException(
                status_code=400,
                detail='Official game session validation failed',
            )

        validated = _validate_v3_batch_a(
            game_type,
            claimed_session,
            inp.evidence,
        )

        if not validated:
            raise HTTPException(
                status_code=400,
                detail='Official game evidence could not be validated',
            )

        server_accuracy = float(
            validated['accuracy']
        )

        server_solved = bool(
            validated['solved']
        )

    pts = _calc_points(
        game_type,
        inp.duration_ms,
        server_accuracy,
        server_solved,
    )

    score = GameScore(
        contest_id=contest['contest_id'],
        ticket_id=inp.ticket_id,
        user_id=user['user_id'],
        user_name=user.get('name', 'Anonymous'),
        game_type=game_type,
        points=pts,
        duration_ms=inp.duration_ms,
        accuracy=server_accuracy,
        attempts_used=prior_ticket + 1,
    )
    try:
        await db.game_scores.insert_one(score.model_dump())
    except Exception:
        # If score persistence fails after the atomic session claim, restore
        # that V3 session so the legitimate user is not charged an attempt.
        if claimed_session:
            await db.game_sessions.update_one(
                {
                    'session_id': inp.session_id,
                    'user_id': user['user_id'],
                    'used': True,
                },
                {
                    '$set': {'used': False},
                    '$unset': {'used_at': ''},
                },
            )
        raise

    attempts_left = max(0, total_allowed - (prior_ticket + 1))
    return {
        'ok': True,
        'points': pts,
        'attempts_left': attempts_left,
        'total_allowed': total_allowed,
        'attempts_per_ticket': apt,
        'ticket_id': inp.ticket_id,
        'server_validated': game_type in {
            'rapid_equation',
            'missing_operator',
            'equation_balance',
            'quick_compare',
        },
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
