"""Free home-preview games: endless level progress, leaderboards and play stats (fun only — no rewards, no wallet writes)."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import List, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from deps import get_db
from routers.game_routes import GAME_TYPES
from services.arcade_catalog import STYLES

router = APIRouter(prefix='/api/games/practice', tags=['games-practice'])

ALLOWED = {g['id'] for g in GAME_TYPES if g.get('family') != 'arcade'} | {f'arc_{s[0]}' for s in STYLES}
MAX_LEVEL = 100_000  # levels are generated endlessly; this only bounds bad input
_indexed = False
_lb_cache: dict = {}


class LevelEntry(BaseModel):
    game_id: str = Field(..., min_length=1, max_length=60)
    level: int = Field(..., ge=1, le=MAX_LEVEL)
    stars: int = Field(..., ge=1, le=3)


class ProgressInput(BaseModel):
    entries: List[LevelEntry] = Field(..., min_length=1, max_length=6000)


class EventInput(BaseModel):
    game_id: str = Field(..., min_length=1, max_length=60)
    level: int = Field(..., ge=1, le=MAX_LEVEL)
    outcome: Literal['start', 'pass', 'fail']


def mask_name(name) -> str:
    parts = [p for p in str(name or '').replace('@', ' ').split() if p]
    if not parts:
        return 'Player'
    return parts[0][:1].upper() + parts[0][1:12] + (f" {parts[-1][0].upper()}." if len(parts) > 1 else '')


async def _col():
    global _indexed
    db = get_db()
    if not _indexed:
        await db.practice_progress.create_index([('user_id', 1), ('game_id', 1)], unique=True)
        await db.practice_progress.create_index([('game_id', 1), ('best', -1), ('stars_total', -1)])
        await db.practice_daily.create_index([('date', 1), ('game_id', 1)], unique=True)
        async for d in db.practice_progress.find({'best': {'$exists': False}}, {'_id': 1, 'stars': 1}):
            st = d.get('stars') or {}
            await db.practice_progress.update_one({'_id': d['_id']}, {'$set': {'best': max([int(k) for k in st] or [0]), 'stars_total': sum(int(v) for v in st.values())}})
        async for d in db.practice_progress.find({'name': {'$exists': False}}, {'_id': 1, 'user_id': 1}):
            u = await db.users.find_one({'user_id': d['user_id']}, {'_id': 0, 'display_name': 1, 'name': 1, 'first_name': 1}) or {}
            await db.practice_progress.update_one({'_id': d['_id']}, {'$set': {'name': mask_name(u.get('display_name') or u.get('name') or u.get('first_name'))}})
        _indexed = True
    return db.practice_progress


def _shape(doc: dict) -> dict:
    return {'unlocked': int(doc.get('unlocked') or 1), 'stars': {str(k): int(v) for k, v in (doc.get('stars') or {}).items()}}


@router.get('/progress')
async def get_progress(request: Request):
    user = await get_current_user(request)
    col = await _col()
    docs = await col.find({'user_id': user['user_id']}, {'_id': 0, 'game_id': 1, 'unlocked': 1, 'stars': 1}).to_list(200)
    return {'progress': {d['game_id']: _shape(d) for d in docs}}


@router.post('/progress')
async def save_progress(inp: ProgressInput, request: Request):
    user = await get_current_user(request)
    col = await _col()
    entries = sorted(inp.entries, key=lambda e: (e.game_id, e.level))
    out = {}
    for e in entries:
        if e.game_id not in ALLOWED:
            raise HTTPException(status_code=400, detail='Unknown game')
        doc = out.get(e.game_id) or await col.find_one({'user_id': user['user_id'], 'game_id': e.game_id}, {'_id': 0}) or {}
        state = _shape(doc)
        if e.level > state['unlocked']:
            continue  # levels unlock one after another
        state['stars'][str(e.level)] = max(state['stars'].get(str(e.level), 0), e.stars)
        state['unlocked'] = min(MAX_LEVEL, max(state['unlocked'], e.level + 1))
        out[e.game_id] = state
    now = datetime.now(timezone.utc)
    name = mask_name(user.get('display_name') or user.get('name') or user.get('first_name'))
    for gid, state in out.items():
        best = max(int(k) for k in state['stars'])
        await col.update_one({'user_id': user['user_id'], 'game_id': gid},
                             {'$set': {**state, 'best': best, 'stars_total': sum(state['stars'].values()), 'name': name, 'updated_at': now},
                              '$setOnInsert': {'created_at': now}}, upsert=True)
    _lb_cache.clear()
    return {'progress': out}


@router.post('/event')
async def play_event(inp: EventInput):
    if inp.game_id not in ALLOWED:
        raise HTTPException(status_code=400, detail='Unknown game')
    await _col()
    day = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    inc = {{'start': 'starts', 'pass': 'passes', 'fail': 'fails'}[inp.outcome]: 1}
    if inp.outcome == 'pass':
        inc['levels_sum'] = inp.level
    await get_db().practice_daily.update_one({'date': day, 'game_id': inp.game_id}, {'$inc': inc, '$max': {'top_level': inp.level}}, upsert=True)
    return {'ok': True}


async def _board(game_id: str | None) -> list:
    key = game_id or '*'
    hit = _lb_cache.get(key)
    if hit and time.time() - hit[0] < 30:
        return hit[1]
    col = await _col()
    if game_id:
        docs = await col.find({'game_id': game_id, 'best': {'$gte': 1}}, {'_id': 0, 'user_id': 1, 'name': 1, 'best': 1, 'stars_total': 1}) \
            .sort([('best', -1), ('stars_total', -1), ('updated_at', 1)]).limit(500).to_list(500)
        rows = [{'user_id': d['user_id'], 'name': d.get('name') or 'Player', 'level': d['best'], 'stars': d.get('stars_total', 0)} for d in docs]
    else:
        docs = await col.aggregate([
            {'$match': {'best': {'$gte': 1}}}, {'$sort': {'updated_at': 1}},
            {'$group': {'_id': '$user_id', 'name': {'$last': '$name'}, 'level': {'$sum': '$best'}, 'stars': {'$sum': '$stars_total'}, 'games': {'$sum': 1}}},
            {'$sort': {'stars': -1, 'level': -1}}, {'$limit': 500}]).to_list(500)
        rows = [{'user_id': d['_id'], 'name': d.get('name') or 'Player', 'level': d['level'], 'stars': d['stars'], 'games': d['games']} for d in docs]
    for i, r in enumerate(rows):
        r['rank'] = i + 1
    _lb_cache[key] = (time.time(), rows)
    return rows


@router.get('/leaderboard')
async def leaderboard(request: Request, game_id: str | None = None, limit: int = 20):
    if game_id and game_id not in ALLOWED:
        raise HTTPException(status_code=400, detail='Unknown game')
    rows = await _board(game_id)
    me = None
    try:
        user = await get_current_user(request)
        me = next(({k: v for k, v in r.items() if k != 'user_id'} for r in rows if r['user_id'] == user['user_id']), None)
    except HTTPException:
        pass
    top = [{k: v for k, v in r.items() if k != 'user_id'} for r in rows[:max(1, min(limit, 100))]]
    return {'game_id': game_id, 'top': top, 'me': me, 'players': len(rows)}


class BanterInput(BaseModel):
    game: str = Field(..., min_length=1, max_length=60)
    bot: str = Field(..., min_length=1, max_length=20)
    persona: str = Field('', max_length=120)
    event: str = Field(..., min_length=1, max_length=40)
    detail: str = Field('', max_length=200)
    player_said: str = Field('', max_length=80)


_banter_hits: dict = {}


@router.post('/banter')
async def party_banter(body: BanterInput, request: Request):
    """One short, funny trash-talk line from a bot opponent (AI written). Light per-IP limit; client has canned fallbacks."""
    import os
    import uuid
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    ip = (request.headers.get('x-forwarded-for') or (request.client.host if request.client else '')).split(',')[0].strip()
    now = time.time()
    hits = [t for t in _banter_hits.get(ip, []) if now - t < 60]
    if len(hits) >= 20:
        raise HTTPException(429, 'Slow down')
    _banter_hits[ip] = hits + [now]
    system = (f"You are {body.bot}, a cheeky bot opponent in a casual mobile party game ({body.game}). Personality: {body.persona or 'playful trash-talker'}. "
              "Reply with ONE short chat message (max 14 words) reacting to what just happened: funny, teasing or provoking, "
              "family-friendly, no swearing, no insults about looks, race, gender or religion. You may use one emoji. "
              "Output only the message text, no quotes, no name prefix.")
    prompt = f"What happened: {body.event}. {body.detail}".strip()
    if body.player_said:
        prompt += f' The human player just typed to you: "{body.player_said}". Reply to them directly.'
    chat = LlmChat(api_key=os.environ['EMERGENT_LLM_KEY'], session_id=f'banter-{uuid.uuid4().hex}', system_message=system).with_model('openai', 'gpt-5.4-mini')
    text = str(await chat.send_message(UserMessage(text=prompt))).strip().strip('"').splitlines()[0][:140]
    return {'text': text}
