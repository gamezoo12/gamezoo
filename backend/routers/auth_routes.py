from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta, timezone
import os

from auth import (
    create_jwt, hash_password, verify_password,
    exchange_emergent_session, get_current_user,
)
from models import RegisterInput, LoginInput, User, UserPublic

router = APIRouter(prefix='/api/auth', tags=['auth'])


@router.post('/register')
async def register(inp: RegisterInput, request: Request):
    from deps import get_db
    db = get_db()
    if await db.users.find_one({'email': inp.email.lower()}):
        raise HTTPException(status_code=400, detail='Email already registered')
    user = User(
        email=inp.email.lower(),
        name=inp.name,
        password_hash=hash_password(inp.password),
        method='email',
        role='user',
    )
    doc = user.model_dump()
    await db.users.insert_one(doc)
    token = create_jwt(user.user_id)
    return {
        'user': UserPublic(**{k: v for k, v in doc.items() if k != 'password_hash'}).model_dump(),
        'token': token,
    }


@router.post('/login')
async def login(inp: LoginInput):
    from deps import get_db
    db = get_db()
    user = await db.users.find_one({'email': inp.email.lower()}, {'_id': 0})
    if not user or not user.get('password_hash') or not verify_password(inp.password, user['password_hash']):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    token = create_jwt(user['user_id'])
    return {
        'user': UserPublic(**{k: v for k, v in user.items() if k != 'password_hash'}).model_dump(),
        'token': token,
    }


@router.post('/session')
async def google_session(request: Request):
    """Exchange Emergent OAuth session_id for backend cookie + user."""
    session_id = request.headers.get('X-Session-ID') or request.headers.get('x-session-id')
    if not session_id:
        raise HTTPException(status_code=400, detail='Missing X-Session-ID header')
    data = await exchange_emergent_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail='Invalid session_id')

    from deps import get_db
    db = get_db()
    email = data['email'].lower()
    user = await db.users.find_one({'email': email}, {'_id': 0})
    if not user:
        user_obj = User(
            email=email,
            name=data.get('name') or email,
            picture=data.get('picture'),
            method='google',
            role='user',
        )
        doc = user_obj.model_dump()
        await db.users.insert_one(doc)
        user = doc
    else:
        # update name/picture in case they changed
        await db.users.update_one({'user_id': user['user_id']}, {'$set': {
            'name': data.get('name') or user['name'],
            'picture': data.get('picture') or user.get('picture'),
        }})

    session_token = data['session_token']
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {'session_token': session_token},
        {'$set': {
            'user_id': user['user_id'],
            'session_token': session_token,
            'expires_at': expires_at,
            'created_at': datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    resp = JSONResponse({
        'user': UserPublic(**{k: v for k, v in user.items() if k != 'password_hash'}).model_dump(),
        'session_token': session_token,
    })
    resp.set_cookie(
        key='session_token',
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        expires=expires_at,
        path='/',
        httponly=True,
        secure=True,
        samesite='none',
    )
    return resp


@router.get('/me')
async def me(request: Request):
    user = await get_current_user(request)
    return UserPublic(**{k: user.get(k) for k in ['user_id', 'email', 'name', 'picture', 'role', 'method']}).model_dump()


@router.post('/logout')
async def logout(request: Request, response: Response):
    from deps import get_db
    db = get_db()
    token = request.cookies.get('session_token')
    if token:
        await db.user_sessions.delete_one({'session_token': token})
    response.delete_cookie('session_token', path='/')
    return {'ok': True}
