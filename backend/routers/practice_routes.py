"""Free home-preview games: per-account 10-level progress (fun only — no rewards, no wallet writes)."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from deps import get_db
from routers.game_routes import GAME_TYPES
from services.arcade_catalog import STYLES

router = APIRouter(prefix='/api/games/practice', tags=['games-practice'])

ALLOWED = {g['id'] for g in GAME_TYPES if g.get('family') != 'arcade'} | {f'arc_{s[0]}' for s in STYLES}
MAX_LEVEL = 10
_indexed = False


class LevelEntry(BaseModel):
    game_id: str = Field(..., min_length=1, max_length=60)
    level: int = Field(..., ge=1, le=MAX_LEVEL)
    stars: int = Field(..., ge=1, le=3)


class ProgressInput(BaseModel):
    entries: List[LevelEntry] = Field(..., min_length=1, max_length=600)


async def _col():
    global _indexed
    db = get_db()
    if not _indexed:
        await db.practice_progress.create_index([('user_id', 1), ('game_id', 1)], unique=True)
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
    for gid, state in out.items():
        await col.update_one({'user_id': user['user_id'], 'game_id': gid},
                             {'$set': {**state, 'updated_at': now}, '$setOnInsert': {'created_at': now}}, upsert=True)
    return {'progress': out}
