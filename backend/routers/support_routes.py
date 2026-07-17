"""User & admin support cases (real DB, not stubs)."""
from datetime import datetime, timezone
from typing import Optional, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user, require_admin
from deps import get_db
from notifications import notify

router = APIRouter(prefix='/api/support', tags=['support'])
admin_router = APIRouter(prefix='/api/admin/support', tags=['admin-support'])

_CATEGORIES = ['account', 'payment', 'ticket', 'game', 'kyc', 'other']


class CreateCase(BaseModel):
    category: Literal['account', 'payment', 'ticket', 'game', 'kyc', 'other']
    subject: str = Field(..., min_length=3, max_length=200)
    message: str = Field(..., min_length=10, max_length=5000)


class ReplyCase(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)


# ---- USER ------------------------------------------------------------------

@router.post('')
async def create_case(inp: CreateCase, request: Request):
    user = await get_current_user(request)
    db = get_db()
    case_id = f'sup_{uuid4().hex[:12]}'
    doc = {
        'case_id': case_id,
        'user_id': user['user_id'],
        'user_email': user.get('email'),
        'user_name': user.get('name'),
        'category': inp.category,
        'subject': inp.subject.strip(),
        'status': 'open',
        'created_at': datetime.now(timezone.utc),
        'updated_at': datetime.now(timezone.utc),
        'messages': [{
            'author': 'user',
            'author_id': user['user_id'],
            'body': inp.message.strip(),
            'at': datetime.now(timezone.utc),
        }],
    }
    await db.support_cases.insert_one(doc)
    return {'ok': True, 'case_id': case_id}


@router.get('/mine')
async def my_cases(request: Request):
    user = await get_current_user(request)
    db = get_db()
    cases = await db.support_cases.find(
        {'user_id': user['user_id']}, {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return {'cases': cases}


@router.post('/{case_id}/reply')
async def user_reply(case_id: str, inp: ReplyCase, request: Request):
    user = await get_current_user(request)
    db = get_db()
    c = await db.support_cases.find_one({'case_id': case_id, 'user_id': user['user_id']}, {'_id': 0})
    if not c:
        raise HTTPException(404, 'Case not found')
    if c.get('status') == 'closed':
        raise HTTPException(400, 'This case is closed. Open a new one if you need more help.')
    await db.support_cases.update_one({'case_id': case_id}, {
        '$push': {'messages': {
            'author': 'user', 'author_id': user['user_id'],
            'body': inp.message.strip(), 'at': datetime.now(timezone.utc),
        }},
        '$set': {'updated_at': datetime.now(timezone.utc), 'status': 'open'},
    })
    return {'ok': True}


# ---- ADMIN -----------------------------------------------------------------

@admin_router.get('/cases')
async def list_cases(request: Request, status: Optional[str] = None):
    await require_admin(request)
    db = get_db()
    q: dict = {}
    if status: q['status'] = status
    cases = await db.support_cases.find(q, {'_id': 0}).sort('updated_at', -1).to_list(500)
    return {'cases': cases}


@admin_router.post('/cases/{case_id}/reply')
async def admin_reply(case_id: str, inp: ReplyCase, request: Request):
    admin = await require_admin(request)
    db = get_db()
    c = await db.support_cases.find_one({'case_id': case_id}, {'_id': 0})
    if not c:
        raise HTTPException(404, 'Case not found')
    await db.support_cases.update_one({'case_id': case_id}, {
        '$push': {'messages': {
            'author': 'admin', 'author_id': admin['user_id'], 'author_name': admin.get('name'),
            'body': inp.message.strip(), 'at': datetime.now(timezone.utc),
        }},
        '$set': {'updated_at': datetime.now(timezone.utc), 'status': 'awaiting_user'},
    })
    # Notify user
    await notify(db, user_id=c['user_id'], kind='support_reply',
                 title='Support replied to your case',
                 body=f'“{c.get("subject", "your support case")}” — tap to read.')
    return {'ok': True}


@admin_router.post('/cases/{case_id}/status')
async def set_status(case_id: str, payload: dict, request: Request):
    admin = await require_admin(request)
    new_status = payload.get('status')
    if new_status not in ('open', 'awaiting_user', 'closed'):
        raise HTTPException(400, 'Invalid status')
    db = get_db()
    r = await db.support_cases.update_one({'case_id': case_id}, {'$set': {
        'status': new_status,
        'updated_at': datetime.now(timezone.utc),
        'closed_by': admin['user_id'] if new_status == 'closed' else None,
    }})
    if r.matched_count == 0:
        raise HTTPException(404, 'Case not found')
    return {'ok': True}
