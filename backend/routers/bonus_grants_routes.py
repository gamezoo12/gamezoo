"""Admin bonus-token grants with expiry. Credits are bonus tokens recorded one grant at a time."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_admin
from services.bonus_grants import (
    MAX_GRANT_TOKENS, compute_expiry, create_grant, revoke_grant, run_expiry_job, uk_date,
)

router = APIRouter(prefix='/api/admin/bonus-grants', tags=['admin-bonus-grants'])


class BonusGrantInput(BaseModel):
    user_ids: list[str] = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=MAX_GRANT_TOKENS)
    expiry_mode: str = Field(default='none', max_length=10)  # none | days | date
    expiry_days: Optional[int] = Field(default=None, ge=1, le=3650)
    expiry_date: Optional[str] = Field(default=None, max_length=10)
    reason: str = Field(min_length=10, max_length=300)
    confirm: bool = False
    batch_id: str = Field(default_factory=lambda: uuid.uuid4().hex, min_length=8, max_length=64)


async def _admin_or_403(request: Request) -> dict:
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin or super admin can manage bonus tokens')
    return admin


@router.post('')
async def credit_bonus(payload: BonusGrantInput, request: Request):
    admin = await _admin_or_403(request)
    if not payload.confirm:
        raise HTTPException(status_code=400, detail='Confirmation is required before bonus tokens are credited')
    from deps import get_db
    db = get_db()
    now = datetime.now(timezone.utc)
    expires_at = compute_expiry(now, payload.expiry_mode, payload.expiry_days, payload.expiry_date)
    user_ids = list(dict.fromkeys(u.strip() for u in payload.user_ids if u.strip()))
    users = {u['user_id']: u async for u in db.users.find(
        {'user_id': {'$in': user_ids}}, {'_id': 0, 'user_id': 1, 'erased': 1})}
    items = []
    for user_id in user_ids:
        user = users.get(user_id)
        if not user:
            items.append({'user_id': user_id, 'status': 'skipped', 'reason': 'User not found'})
            continue
        if user.get('erased'):
            items.append({'user_id': user_id, 'status': 'skipped', 'reason': 'Account erased'})
            continue
        try:
            grant = await create_grant(
                db, user_id=user_id, amount=payload.amount, expires_at=expires_at, actor_id=admin['user_id'],
                actor_email=admin.get('email', ''), reason=payload.reason.strip(), ref_key=f'{payload.batch_id}:{user_id}')
            items.append({'user_id': user_id, 'status': 'success', 'grant_id': grant['grant_id'],
                          'replayed': bool(grant.get('idempotent_replay'))})
            if not grant.get('idempotent_replay'):
                await db.audit_log.insert_one({
                    'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': 'admin_bonus_grant',
                    'admin_user_id': admin['user_id'], 'admin_email': admin.get('email'), 'target_user_id': user_id,
                    'amount': payload.amount, 'grant_id': grant['grant_id'], 'reason': payload.reason.strip(),
                    'expires_at': expires_at, 'batch_id': payload.batch_id, 'at': now,
                })
        except HTTPException:
            raise
        except Exception as exc:
            items.append({'user_id': user_id, 'status': 'failed', 'reason': str(exc)[:200]})
    return {
        'batch_id': payload.batch_id, 'amount': payload.amount,
        'expires_at': expires_at.isoformat() if expires_at else None,
        'expires_on': uk_date(expires_at) if expires_at else None,
        'succeeded': sum(i['status'] == 'success' for i in items),
        'skipped': sum(i['status'] == 'skipped' for i in items),
        'failed': sum(i['status'] == 'failed' for i in items), 'items': items,
    }


@router.get('')
async def list_grants(request: Request, user_id: Optional[str] = None, status: Optional[str] = None,
                      skip: int = 0, limit: int = 50):
    await _admin_or_403(request)
    from deps import get_db
    db = get_db()
    query: dict = {}
    if user_id:
        query['user_id'] = user_id
    if status:
        if status not in ('active', 'consumed', 'expired', 'revoked', 'expiring', 'revoking'):
            raise HTTPException(status_code=400, detail='Unknown status')
        query['status'] = status
    skip, limit = max(0, int(skip)), max(1, min(int(limit), 200))
    total = await db.bonus_grants.count_documents(query)
    rows = await db.bonus_grants.find(query, {'_id': 0}).sort('granted_at', -1).skip(skip).limit(limit).to_list(limit)
    return {'total': total, 'skip': skip, 'limit': limit, 'grants': rows}


class RevokeInput(BaseModel):
    reason: str = Field(min_length=10, max_length=300)


@router.post('/{grant_id}/revoke')
async def revoke(grant_id: str, payload: RevokeInput, request: Request):
    admin = await _admin_or_403(request)
    from deps import get_db
    db = get_db()
    result = await revoke_grant(db, grant_id, admin['user_id'])
    if result is None:
        raise HTTPException(status_code=409, detail='Grant not found or no longer active')
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': 'admin_bonus_grant_revoked',
        'admin_user_id': admin['user_id'], 'admin_email': admin.get('email'), 'target_user_id': result['user_id'],
        'grant_id': grant_id, 'amount': result.get('revoked_amount'), 'reason': payload.reason.strip(),
        'at': datetime.now(timezone.utc),
    })
    return {'grant': result}


class RevokeAllInput(BaseModel):
    reason: str = Field(min_length=10, max_length=300)
    confirm: str = Field(default='', max_length=40)


async def revoke_all_active_grants(db, admin: dict, reason: str, scope: Optional[dict] = None) -> dict:
    """`scope` narrows the grants (isolated tests only); the endpoint always revokes everything."""
    grant_ids = [g['grant_id'] async for g in db.bonus_grants.find({'status': 'active', **(scope or {})}, {'_id': 0, 'grant_id': 1})]
    revoked, skipped, tokens, users = 0, 0, 0.0, set()
    for grant_id in grant_ids:
        result = await revoke_grant(db, grant_id, admin['user_id'])
        if result is None:
            skipped += 1
            continue
        revoked += 1
        tokens += float(result.get('revoked_amount') or 0)
        users.add(result['user_id'])
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': 'admin_bonus_revoke_all',
        'admin_user_id': admin['user_id'], 'admin_email': admin.get('email'),
        'grants_revoked': revoked, 'grants_skipped': skipped, 'users_affected': len(users),
        'tokens_removed': round(tokens, 2), 'reason': reason.strip(),
        'at': datetime.now(timezone.utc),
    })
    return {'grants_revoked': revoked, 'grants_skipped': skipped, 'users_affected': len(users),
            'tokens_removed': round(tokens, 2)}


@router.post('/revoke-all')
async def revoke_all(payload: RevokeAllInput, request: Request):
    admin = await _admin_or_403(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail='Only super admin can remove bonus tokens for all users')
    if payload.confirm != 'REMOVE ALL BONUS':
        raise HTTPException(status_code=400, detail="Type 'REMOVE ALL BONUS' to confirm")
    from deps import get_db
    return await revoke_all_active_grants(get_db(), admin, payload.reason)


@router.post('/run-expiry')
async def run_expiry(request: Request):
    """Idempotent: safe to call at any time; the scheduler runs the same job every minute."""
    await _admin_or_403(request)
    from deps import get_db
    return await run_expiry_job(get_db())
