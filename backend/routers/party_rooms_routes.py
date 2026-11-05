"""Live party rooms: invite a friend by link and play turn-based party games together (signed-in players only).
The player whose turn it is sends the next game state; versions stop two writes from clashing."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from deps import get_db

router = APIRouter(prefix='/api/party/rooms', tags=['party-rooms'])

ONLINE_GAMES = {'pty_ludo_royale': 4, 'pty_colour_cards': 4, 'pty_four_in_row': 2, 'pty_snakes_ladders': 4, 'pty_dots_boxes': 4, 'pty_checkers': 2, 'pty_memory_duel': 4, 'pty_reversi': 2, 'pty_gomoku': 2, 'pty_tictactoe': 2, 'pty_mancala': 2, 'pty_isolation': 2, 'pty_breakthrough': 2, 'pty_domineering': 2, 'pty_clobber': 2, 'pty_nim': 2, 'pty_hex': 2, 'pty_treblecross': 2, 'pty_morris': 2, 'pty_fox_hounds': 2, 'pty_sim': 2, 'pty_chomp': 2, 'pty_kayles': 2, 'pty_notakto': 2}
ROOM_TTL = timedelta(hours=6)


class CreateIn(BaseModel):
    game_id: str = Field(..., max_length=60)


class StartIn(BaseModel):
    state: dict[str, Any]


class StateIn(BaseModel):
    version: int
    state: dict[str, Any]
    winner: Optional[int] = None


class ChatIn(BaseModel):
    text: str = Field('', max_length=120)
    emoji: str = Field('', max_length=8)


def _name(user: dict) -> str:
    n = (user.get('display_name') or user.get('name') or user.get('first_name') or 'Player').strip()
    return n.split()[0][:14] if n else 'Player'


def _out(room: dict, user: dict) -> dict:
    seat = next((p['seat'] for p in room['players'] if p['user_id'] == user['user_id']), None)
    return {'code': room['code'], 'game_id': room['game_id'], 'status': room['status'], 'host': room['host'] == user['user_id'],
            'players': [{'name': p['name'], 'seat': p['seat']} for p in room['players']], 'max_players': room['max_players'],
            'state': room.get('state'), 'version': room.get('version', 0), 'winner': room.get('winner'), 'seat': seat,
            'chat': room.get('chat', [])[-30:]}


async def _room(code: str) -> dict:
    room = await get_db().party_rooms.find_one({'code': code.upper()}, {'_id': 0})
    if not room or room['expires_at'].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(404, 'This invite has expired or does not exist')
    return room


@router.post('')
async def create_room(body: CreateIn, request: Request):
    user = await get_current_user(request)
    if body.game_id not in ONLINE_GAMES:
        raise HTTPException(400, 'This game cannot be played with friends yet')
    code = secrets.token_hex(3).upper()
    now = datetime.now(timezone.utc)
    room = {'code': code, 'game_id': body.game_id, 'host': user['user_id'], 'status': 'lobby', 'max_players': ONLINE_GAMES[body.game_id],
            'players': [{'user_id': user['user_id'], 'name': _name(user), 'seat': 0}], 'state': None, 'version': 0, 'chat': [],
            'created_at': now, 'expires_at': now + ROOM_TTL}
    await get_db().party_rooms.insert_one(dict(room))
    return _out(room, user)


@router.get('/{code}')
async def get_room(code: str, request: Request):
    user = await get_current_user(request)
    return _out(await _room(code), user)


@router.post('/{code}/join')
async def join_room(code: str, request: Request):
    user = await get_current_user(request)
    room = await _room(code)
    if any(p['user_id'] == user['user_id'] for p in room['players']):
        return _out(room, user)
    if room['status'] != 'lobby':
        raise HTTPException(409, 'This game has already started')
    if len(room['players']) >= room['max_players']:
        raise HTTPException(409, 'This room is full')
    player = {'user_id': user['user_id'], 'name': _name(user), 'seat': len(room['players'])}
    res = await get_db().party_rooms.find_one_and_update({'code': room['code'], 'status': 'lobby', f'players.{room["max_players"] - 1}': {'$exists': False}},
                                                         {'$push': {'players': player}}, projection={'_id': 0}, return_document=True)
    if not res:
        raise HTTPException(409, 'This room is full')
    return _out(res, user)


@router.post('/{code}/start')
async def start_room(code: str, body: StartIn, request: Request):
    user = await get_current_user(request)
    room = await _room(code)
    if room['host'] != user['user_id']:
        raise HTTPException(403, 'Only the host can start')
    if len(room['players']) < 2:
        raise HTTPException(400, 'Wait for at least one friend to join')
    upd = {'status': 'playing', 'state': body.state, 'version': room.get('version', 0) + 1, 'winner': None}
    await get_db().party_rooms.update_one({'code': room['code']}, {'$set': upd})
    return _out({**room, **upd}, user)


@router.post('/{code}/state')
async def push_state(code: str, body: StateIn, request: Request):
    user = await get_current_user(request)
    room = await _room(code)
    if not any(p['user_id'] == user['user_id'] for p in room['players']) or room['status'] != 'playing':
        raise HTTPException(403, 'Not playing in this room')
    upd = {'state': body.state, 'version': body.version + 1}
    if body.winner is not None:
        upd.update({'status': 'finished', 'winner': body.winner})
    res = await get_db().party_rooms.find_one_and_update({'code': room['code'], 'version': body.version}, {'$set': upd}, projection={'_id': 0}, return_document=True)
    if not res:
        raise HTTPException(409, 'Out of date, refresh')
    return {'version': res['version'], 'status': res['status']}


@router.post('/{code}/rematch')
async def rematch(code: str, request: Request):
    user = await get_current_user(request)
    room = await _room(code)
    if room['host'] != user['user_id']:
        raise HTTPException(403, 'Only the host can restart')
    await get_db().party_rooms.update_one({'code': room['code']}, {'$set': {'status': 'lobby', 'state': None, 'winner': None}, '$inc': {'version': 1}})
    return _out(await _room(code), user)


@router.post('/{code}/chat')
async def chat(code: str, body: ChatIn, request: Request):
    user = await get_current_user(request)
    room = await _room(code)
    p = next((p for p in room['players'] if p['user_id'] == user['user_id']), None)
    if not p or not (body.text.strip() or body.emoji.strip()):
        raise HTTPException(400, 'Nothing to send')
    msg = {'id': secrets.token_hex(4), 'seat': p['seat'], 'name': p['name'], 'text': body.text.strip(), 'emoji': body.emoji.strip(), 'at': datetime.now(timezone.utc).isoformat()}
    await get_db().party_rooms.update_one({'code': room['code']}, {'$push': {'chat': {'$each': [msg], '$slice': -60}}})
    return msg
