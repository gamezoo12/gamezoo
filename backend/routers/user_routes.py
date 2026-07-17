from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid

from auth import get_current_user, hash_password, verify_password

router = APIRouter(prefix='/api/users', tags=['users'])


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.get('/me')
async def get_me(request: Request):
    """Return the full profile of the currently signed-in user."""
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    kyc = await db.kyc.find_one({'user_id': user['user_id']}, {'_id': 0, 'status': 1, 'phone': 1})
    ticket_count = await db.tickets.count_documents({'user_id': user['user_id']})
    order_count = await db.orders.count_documents({'user_id': user['user_id']})
    unread = await db.notifications.count_documents({'user_id': user['user_id'], 'read': False})
    return {
        **user,
        'phone': user.get('phone') or (kyc.get('phone') if kyc else None),
        'kyc_status': (kyc or {}).get('status', 'none'),
        'ticket_count': ticket_count,
        'order_count': order_count,
        'unread_notifications': unread,
    }


@router.patch('/me')
async def update_me(inp: ProfileUpdate, request: Request):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    updates: dict = {}
    if inp.name is not None and inp.name.strip():
        updates['name'] = inp.name.strip()
    if inp.phone is not None:
        updates['phone'] = inp.phone.strip() or None
    if inp.address is not None:
        updates['address'] = inp.address.strip() or None
    if inp.email is not None:
        new_email = inp.email.lower()
        if new_email != user['email']:
            exists = await db.users.find_one({'email': new_email, 'user_id': {'$ne': user['user_id']}})
            if exists:
                raise HTTPException(status_code=400, detail='Email already in use')
            updates['email'] = new_email
    if not updates:
        return {'ok': True, 'updated': 0}
    updates['updated_at'] = datetime.now(timezone.utc)
    await db.users.update_one({'user_id': user['user_id']}, {'$set': updates})
    fresh = await db.users.find_one({'user_id': user['user_id']}, {'_id': 0, 'password_hash': 0})
    return {'ok': True, 'user': fresh}


@router.post('/me/password')
async def change_password(inp: PasswordChange, request: Request):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    full = await db.users.find_one({'user_id': user['user_id']})
    if not full or not full.get('password_hash'):
        raise HTTPException(status_code=400, detail='This account uses social login — no password to change')
    if not verify_password(inp.current_password, full['password_hash']):
        raise HTTPException(status_code=400, detail='Current password is incorrect')
    if len(inp.new_password) < 8:
        raise HTTPException(status_code=400, detail='New password must be at least 8 characters')
    await db.users.update_one(
        {'user_id': user['user_id']},
        {'$set': {'password_hash': hash_password(inp.new_password), 'password_changed_at': datetime.now(timezone.utc)}},
    )
    return {'ok': True}


class KycSubmit(BaseModel):
    full_name: str
    dob: str
    address: str
    country: str = 'United Kingdom'
    id_type: str = 'passport'   # passport | driving-licence | national-id
    id_number: str
    phone: Optional[str] = None


@router.post('/kyc/submit')
async def submit_kyc(inp: KycSubmit, request: Request):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    existing = await db.kyc.find_one({'user_id': user['user_id']}, {'_id': 0})
    doc = {
        'kyc_id': existing['kyc_id'] if existing else f"kyc_{uuid.uuid4().hex[:12]}",
        'user_id': user['user_id'],
        'user_email': user['email'],
        'full_name': inp.full_name,
        'dob': inp.dob,
        'address': inp.address,
        'country': inp.country,
        'id_type': inp.id_type,
        'id_number': inp.id_number,
        'phone': inp.phone,
        'status': 'pending',
        'submitted_at': datetime.now(timezone.utc),
    }
    await db.kyc.update_one({'user_id': user['user_id']}, {'$set': doc}, upsert=True)
    return {'ok': True, 'status': 'pending', 'kyc_id': doc['kyc_id']}


@router.get('/kyc/status')
async def kyc_status(request: Request):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    kyc = await db.kyc.find_one({'user_id': user['user_id']}, {'_id': 0})
    if not kyc:
        return {'status': 'none'}
    return {
        'status': kyc.get('status'),
        'submitted_at': kyc.get('submitted_at'),
        'reviewed_at': kyc.get('reviewed_at'),
        'reject_reason': kyc.get('reject_reason'),
        'full_name': kyc.get('full_name'),
        'country': kyc.get('country'),
    }
