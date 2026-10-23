"""Authenticated browser subscriptions and prepared native device registration."""
from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone
from typing import Literal, Optional
from urllib.parse import urlparse

from cryptography.fernet import Fernet
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from deps import get_db
from services.push_delivery import public_vapid_config, web_push_status

router = APIRouter(prefix='/api/push', tags=['push-notifications'])


def _now():
    return datetime.now(timezone.utc)


def _fernet() -> Fernet:
    key = os.getenv('PUSH_TOKEN_ENCRYPTION_KEY', '').strip()
    if not key:
        raise HTTPException(status_code=503, detail='Native token encryption is not configured')
    try:
        return Fernet(key.encode('ascii'))
    except Exception as exc:
        raise HTTPException(status_code=503, detail='Native token encryption key is invalid') from exc


def _safe_web_device(doc: dict) -> dict:
    return {
        'subscription_id': doc['_id'],
        'created_at': doc.get('created_at'),
        'last_seen_at': doc.get('last_seen_at'),
        'user_agent': doc.get('user_agent') or '',
    }


@router.get('/vapid-public-key')
async def get_vapid_public_key():
    return public_vapid_config()


@router.get('/settings')
async def get_push_settings(request: Request):
    user = await get_current_user(request)
    db = get_db()
    preferences = await db.users.find_one(
        {'user_id': user['user_id']},
        {'_id': 0, 'web_push_enabled': 1, 'web_push_enabled_at': 1, 'web_push_consent_at': 1,
         'web_push_consent_source': 1, 'web_push_browser_permission': 1,
         'web_push_marketing_consent': 1, 'native_push_enabled': 1},
    ) or {}
    web_devices = await db.web_push_subscriptions.find(
        {'user_id': user['user_id'], 'active': True}, {'_id': 1, 'created_at': 1, 'last_seen_at': 1, 'user_agent': 1},
    ).sort('created_at', -1).limit(50).to_list(50)
    native_devices = await db.native_push_devices.find(
        {'user_id': user['user_id'], 'active': True}, {'_id': 1, 'platform': 1, 'label': 1, 'created_at': 1},
    ).sort('created_at', -1).limit(50).to_list(50)
    return {
        **public_vapid_config(),
        'web_push_enabled': preferences.get('web_push_enabled') is True,
        'web_push_consent_at': preferences.get('web_push_consent_at'),
        'web_push_consent_source': preferences.get('web_push_consent_source'),
        'web_push_browser_permission': preferences.get('web_push_browser_permission', 'default'),
        'web_push_status': web_push_status(preferences, len(web_devices)),
        'web_push_device_count': len(web_devices),
        'web_push_marketing_consent': preferences.get('web_push_marketing_consent') is True,
        'web_devices': [_safe_web_device(doc) for doc in web_devices],
        'native_push_enabled': preferences.get('native_push_enabled') is True,
        'native_push_available': False,
        'native_devices': [
            {'device_id': doc['_id'], 'platform': doc['platform'], 'label': doc.get('label') or '', 'created_at': doc.get('created_at')}
            for doc in native_devices
        ],
    }


class WebPushKeys(BaseModel):
    p256dh: str = Field(min_length=40, max_length=200)
    auth: str = Field(min_length=16, max_length=100)


class WebPushSubscriptionInput(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2048)
    expirationTime: Optional[int] = None
    keys: WebPushKeys


def _validate_subscription(payload: WebPushSubscriptionInput) -> None:
    parsed = urlparse(payload.endpoint)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail='Push endpoint must be an HTTPS URL')
    host = (parsed.hostname or '').lower().rstrip('.')
    trusted_host = (
        host == 'fcm.googleapis.com'
        or re.fullmatch(r'jmt[0-9]+\.google\.com', host) is not None
        or host == 'updates.push.services.mozilla.com'
        or host == 'web.push.apple.com'
        or host.endswith('.notify.windows.com')
    )
    if not trusted_host:
        raise HTTPException(status_code=400, detail='Push endpoint provider is not supported')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', payload.keys.p256dh) or not re.fullmatch(r'[A-Za-z0-9_-]+', payload.keys.auth):
        raise HTTPException(status_code=400, detail='Invalid Push subscription keys')


@router.post('/web-subscriptions')
async def register_web_subscription(payload: WebPushSubscriptionInput, request: Request):
    user = await get_current_user(request)
    if not public_vapid_config()['available']:
        raise HTTPException(status_code=503, detail='Web Push is not configured')
    _validate_subscription(payload)
    endpoint_id = hashlib.sha256(payload.endpoint.encode('utf-8')).hexdigest()
    now = _now()
    db = get_db()
    existing = await db.web_push_subscriptions.find_one({'_id': endpoint_id}, {'_id': 0, 'user_id': 1})
    if existing and existing.get('user_id') != user['user_id']:
        raise HTTPException(status_code=409, detail='Web Push device is already registered to another account')
    await db.web_push_subscriptions.update_one(
        {'_id': endpoint_id, 'user_id': user['user_id']} if existing else {'_id': endpoint_id},
        {'$set': {
            'user_id': user['user_id'],
            'endpoint': payload.endpoint,
            'keys': payload.keys.model_dump(),
            'active': True,
            'expiration_time': payload.expirationTime,
            'user_agent': request.headers.get('user-agent', '')[:500],
            'last_seen_at': now,
        }, '$setOnInsert': {'created_at': now}},
        upsert=True,
    )
    await db.users.update_one({'user_id': user['user_id']}, {'$set': {
        'web_push_enabled': True, 'web_push_enabled_at': now,
        'web_push_consent_at': now, 'web_push_consent_source': 'user',
        'web_push_browser_permission': 'granted', 'web_push_browser_permission_at': now,
    }})
    return {'ok': True, 'subscription_id': endpoint_id, 'web_push_enabled': True}


@router.delete('/web-subscriptions/{subscription_id}')
async def remove_web_subscription(subscription_id: str, request: Request):
    user = await get_current_user(request)
    db = get_db()
    result = await db.web_push_subscriptions.delete_one({'_id': subscription_id, 'user_id': user['user_id']})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail='Web Push device not found')
    remaining = await db.web_push_subscriptions.count_documents({'user_id': user['user_id'], 'active': True})
    if not remaining:
        now = _now()
        await db.users.update_one({'user_id': user['user_id']}, {'$set': {
            'web_push_enabled': False, 'web_push_enabled_at': None,
            'web_push_consent_at': now, 'web_push_consent_source': 'user',
        }})
    return {'ok': True, 'remaining_devices': remaining}


class PushPreferencesInput(BaseModel):
    web_push_enabled: Optional[bool] = None
    web_push_marketing_consent: Optional[bool] = None
    web_push_browser_permission: Optional[Literal['default', 'granted', 'denied']] = None
    native_push_enabled: Optional[bool] = None


@router.patch('/preferences')
async def update_push_preferences(payload: PushPreferencesInput, request: Request):
    user = await get_current_user(request)
    db = get_db()
    update = payload.model_dump(exclude_none=True)
    if not update:
        raise HTTPException(status_code=400, detail='No push preferences provided')
    if update.get('web_push_enabled') is True:
        count = await db.web_push_subscriptions.count_documents({'user_id': user['user_id'], 'active': True})
        if not count:
            raise HTTPException(status_code=409, detail='Enable Web Push on this device first')
    if update.get('native_push_enabled') is True:
        count = await db.native_push_devices.count_documents({'user_id': user['user_id'], 'active': True})
        if not count:
            raise HTTPException(status_code=409, detail='No native app devices are registered')
    now = _now()
    if 'web_push_enabled' in update:
        update['web_push_enabled_at'] = now if update['web_push_enabled'] else None
        update['web_push_consent_at'] = now
        update['web_push_consent_source'] = 'user'
    if 'web_push_browser_permission' in update:
        update['web_push_browser_permission_at'] = now
    if 'web_push_marketing_consent' in update:
        update['web_push_marketing_consent_at'] = now if update['web_push_marketing_consent'] else None
        update['web_push_marketing_consent_source'] = 'self_service'
    await db.users.update_one({'user_id': user['user_id']}, {'$set': update})
    return {'ok': True, **update}


class NativeDeviceInput(BaseModel):
    platform: Literal['android', 'ios']
    token: str = Field(min_length=32, max_length=4096)
    label: str = Field(default='', max_length=120)


@router.post('/native-devices')
async def register_native_device(payload: NativeDeviceInput, request: Request):
    user = await get_current_user(request)
    cipher = _fernet()
    token_hash = hashlib.sha256(payload.token.encode('utf-8')).hexdigest()
    device_id = hashlib.sha256(f"{user['user_id']}|{payload.platform}|{token_hash}".encode()).hexdigest()
    now = _now()
    await get_db().native_push_devices.update_one(
        {'_id': device_id},
        {'$set': {
            'user_id': user['user_id'], 'platform': payload.platform,
            'token_ciphertext': cipher.encrypt(payload.token.encode()).decode('ascii'),
            'token_hash': token_hash, 'label': payload.label.strip(),
            'active': True, 'updated_at': now,
        }, '$setOnInsert': {'created_at': now}},
        upsert=True,
    )
    return {'ok': True, 'device_id': device_id, 'delivery_available': False}


@router.delete('/native-devices/{device_id}')
async def remove_native_device(device_id: str, request: Request):
    user = await get_current_user(request)
    db = get_db()
    result = await db.native_push_devices.delete_one({'_id': device_id, 'user_id': user['user_id']})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail='Native Push device not found')
    remaining = await db.native_push_devices.count_documents({'user_id': user['user_id'], 'active': True})
    if not remaining:
        await db.users.update_one({'user_id': user['user_id']}, {'$set': {'native_push_enabled': False}})
    return {'ok': True, 'remaining_devices': remaining}
