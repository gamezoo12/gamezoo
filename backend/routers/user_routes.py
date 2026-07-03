from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional
import uuid

from auth import get_current_user

router = APIRouter(prefix='/api/users', tags=['users'])


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
    from server import db_ref
    db = db_ref()
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
    from server import db_ref
    db = db_ref()
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
