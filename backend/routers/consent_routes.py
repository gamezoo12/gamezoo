"""Promotions Consent: user self-service and admin management of the five promotional preferences."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from auth import get_current_user, require_admin
from services.promo_consent import (
    PROMO_KEYS, admin_preference_view, admin_web_push_enable_updates, build_updates, preference_view, read_preferences,
)

user_router = APIRouter(prefix='/api/users/me', tags=['promotions-consent'])
admin_router = APIRouter(prefix='/api/admin/users', tags=['admin-promotions-consent'])


class PromotionsConsentInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    sms: Optional[bool] = None
    whatsapp: Optional[bool] = None
    email: Optional[bool] = None
    web_notifications: Optional[bool] = None
    newsletter: Optional[bool] = None

    def values(self) -> dict:
        return {k: getattr(self, k) for k in PROMO_KEYS if getattr(self, k) is not None}


class AdminPromotionsConsentInput(PromotionsConsentInput):
    reason: str = Field(default='', max_length=300)


async def _device_count(db, user_id: str) -> int:
    return await db.web_push_subscriptions.count_documents({'user_id': user_id, 'active': True})


@user_router.get('/promotions-consent')
async def get_promotions_consent(request: Request):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    full = await db.users.find_one({'user_id': user['user_id']}, {'_id': 0, 'password_hash': 0}) or {}
    return preference_view(full, device_count=await _device_count(db, user['user_id']))


@user_router.put('/promotions-consent')
async def save_promotions_consent(payload: PromotionsConsentInput, request: Request):
    user = await get_current_user(request)
    values = payload.values()
    if not values:
        raise HTTPException(status_code=400, detail='No preferences provided')
    from deps import get_db
    db = get_db()
    now = datetime.now(timezone.utc)
    await db.users.update_one({'user_id': user['user_id']}, {'$set': build_updates(values, now, 'user')})
    full = await db.users.find_one({'user_id': user['user_id']}, {'_id': 0, 'password_hash': 0}) or {}
    return preference_view(full, device_count=await _device_count(db, user['user_id']))


async def _admin_or_403(request: Request) -> dict:
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin or super admin can manage communication preferences')
    return admin


async def _target(db, user_id: str) -> dict:
    target = await db.users.find_one({'user_id': user_id}, {'_id': 0, 'password_hash': 0})
    if not target:
        raise HTTPException(status_code=404, detail='User not found')
    if target.get('erased'):
        raise HTTPException(status_code=400, detail='Cannot update an erased account')
    return target


@admin_router.get('/{user_id}/promotions-consent')
async def admin_get_promotions_consent(user_id: str, request: Request):
    await _admin_or_403(request)
    from deps import get_db
    db = get_db()
    target = await _target(db, user_id)
    count = await _device_count(db, user_id)
    return admin_preference_view(target, count)


@admin_router.put('/{user_id}/promotions-consent')
async def admin_save_promotions_consent(user_id: str, payload: AdminPromotionsConsentInput, request: Request):
    admin = await _admin_or_403(request)
    values = payload.values()
    if not values:
        raise HTTPException(status_code=400, detail='No preferences provided')
    reason = payload.reason.strip()
    if any(values.values()) and len(reason) < 10:
        raise HTTPException(status_code=400, detail='A reason of at least 10 characters is required to enable a preference')
    from deps import get_db
    db = get_db()
    target = await _target(db, user_id)
    if values.get('email') and not target.get('email'):
        raise HTTPException(status_code=400, detail='User has no email address')
    before = read_preferences(target)
    now = datetime.now(timezone.utc)
    admin_enables_web = values.pop('web_notifications', None) is True
    web_disabled = payload.web_notifications is False
    updates = build_updates(values, now, 'admin')
    if admin_enables_web:
        updates.update(admin_web_push_enable_updates(now, admin.get('email'), reason))
    elif web_disabled:
        updates.update(build_updates({'web_notifications': False}, now, 'admin'))
        updates['web_push_admin_enabled'] = False
        updates['web_push_admin_pending'] = False
    if reason:
        updates['promotions_consent_admin_reason'] = reason
    await db.users.update_one({'user_id': user_id}, {'$set': updates})
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': 'admin_promotions_consent_change',
        'admin_user_id': admin.get('user_id'), 'admin_email': admin.get('email'), 'target_user_id': user_id,
        'before': before, 'changes': payload.values(), 'reason': reason, 'at': now,
    })
    fresh = await _target(db, user_id)
    count = await _device_count(db, user_id)
    return admin_preference_view(fresh, count)
