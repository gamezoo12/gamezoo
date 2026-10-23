"""Admin-triggered, expiring contact verification links for existing users."""
from __future__ import annotations

import asyncio
import hashlib
import html
import json
import os
import secrets
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from pymongo.errors import DuplicateKeyError

from auth import require_admin
from deps import get_db
from otp_verify import normalize_phone, twilio_verify_client

admin_router = APIRouter(prefix='/api/admin/users', tags=['admin-contact-verification'])
public_router = APIRouter(tags=['contact-verification'])
LINK_TTL = timedelta(minutes=30)
SEND_WINDOW = timedelta(minutes=15)
MAX_LINKS = 5


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _page(message: str, *, token: str = '', phone_form: bool = False) -> HTMLResponse:
    safe_message = html.escape(message)
    if phone_form:
        escaped_token = html.escape(token, quote=True)
        body = (
            '<form method="post" action="/api/verify-contact/mobile/send">'
            f'<input type="hidden" name="token" value="{escaped_token}">'
            '<button type="submit">Send SMS code</button></form>'
            '<form method="post" action="/api/verify-contact/mobile/check">'
            f'<input type="hidden" name="token" value="{escaped_token}">'
            '<label>SMS code <input name="code" required pattern="[0-9]{4,10}" '
            'autocomplete="one-time-code"></label><button type="submit">Verify mobile</button></form>'
        )
    else:
        body = ''
    return HTMLResponse(
        '<!doctype html><html lang="en"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Prize League verification</title><main><h1>Prize League</h1>'
        f'<p>{safe_message}</p>{body}<p><a href="/">Return to Prize League</a></p></main></html>'
    )


def _sendgrid_email(to: str, link: str) -> None:
    key = os.getenv('SENDGRID_API_KEY', '').strip()
    sender = (os.getenv('SENDGRID_FROM_EMAIL') or os.getenv('FROM_EMAIL') or '').strip()
    if not key or not sender:
        raise HTTPException(status_code=503, detail='Email delivery is not configured')
    payload = {
        'personalizations': [{'to': [{'email': to}]}],
        'from': {'email': sender},
        'subject': 'Verify your Prize League email address',
        'content': [{'type': 'text/html', 'value':
                    '<p>Confirm your current Prize League email address.</p>'
                    f'<p><a href="{html.escape(link, quote=True)}">Verify email address</a></p>'
                    '<p>This single-use link expires in 30 minutes. If you did not expect it, ignore this email.</p>'}],
    }
    req = urllib.request.Request(
        'https://api.sendgrid.com/v3/mail/send', data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            if response.status not in (200, 202):
                raise RuntimeError('Email provider rejected the message')
    except Exception as exc:
        raise RuntimeError('Email provider unavailable') from exc


async def _audit(db, *, kind: str, admin: dict | None = None, user_id: str,
                 channel: str, extra: dict | None = None) -> None:
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': kind,
        'admin_user_id': admin.get('user_id') if admin else None,
        'admin_email': admin.get('email') if admin else None,
        'target_user_id': user_id, 'channel': channel,
        'at': datetime.now(timezone.utc), **(extra or {}),
    })


@admin_router.post('/{user_id}/{channel}/send-verification-link')
async def send_verification_link(user_id: str, channel: str, request: Request):
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Admin or super admin only')
    if channel not in ('email', 'phone'):
        raise HTTPException(status_code=404, detail='Unknown verification type')
    db = get_db()
    user = await db.users.find_one({'user_id': user_id, 'erased': {'$ne': True}}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    original = user.get(channel)
    if not original:
        raise HTTPException(status_code=400, detail=f'User has no {channel} on file')
    if channel == 'phone':
        target = normalize_phone(original)
        if await db.users.find_one({'phone': target, 'phone_verified': True, 'user_id': {'$ne': user_id}}, {'_id': 1}):
            raise HTTPException(status_code=409, detail='Phone is verified on another account')
    else:
        target = str(original).strip().lower()
    now = datetime.now(timezone.utc)
    recent_sends = {'$filter': {
        'input': {'$ifNull': ['$sent_at', []]}, 'as': 'sent_at',
        'cond': {'$gt': ['$$sent_at', now - SEND_WINDOW]},
    }}
    recent_count = {'$size': recent_sends}
    last_send = {'$arrayElemAt': [recent_sends, -1]}
    try:
        limiter_id = f'{user_id}:{channel}'
        try:
            await db.verification_link_limits.update_one(
                {'_id': limiter_id}, {'$setOnInsert': {'sent_at': []}}, upsert=True)
        except DuplicateKeyError:
            pass
        claimed = await db.verification_link_limits.find_one_and_update(
            {'_id': limiter_id, '$expr': {'$and': [
                {'$lt': [recent_count, MAX_LINKS]},
                {'$or': [
                    {'$eq': [recent_count, 0]},
                    {'$lte': [last_send, now - timedelta(seconds=60)]},
                ]},
            ]}},
            [{'$set': {
                'sent_at': {'$concatArrays': [recent_sends, [now]]},
                'updated_at': now,
            }}],
        )
        if not claimed:
            raise HTTPException(status_code=429, detail='Wait before resending or try again in 15 minutes')
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=429, detail='Wait before resending or try again in 15 minutes') from exc

    token = secrets.token_urlsafe(32)
    await db.verification_links.insert_one({
        'token_hash': _hash_token(token), 'user_id': user_id, 'channel': channel,
        'target': target, 'original': original, 'was_verified': bool(user.get(f'{channel}_verified')),
        'created_at': now, 'expires_at': now + LINK_TTL, 'used': False,
    })
    site = (os.getenv('PUBLIC_SITE_URL') or 'https://prizeleague.co.uk').rstrip('/')
    link = f'{site}/api/verify-contact?token={quote(token)}'
    try:
        if channel == 'email':
            await asyncio.to_thread(_sendgrid_email, target, link)
        else:
            client, service_sid = twilio_verify_client()
            body = f'Prize League: open this link to verify your mobile number: {link} (expires in 30 minutes)'
            messaging_sid = os.getenv('TWILIO_MESSAGING_SERVICE_SID', '').strip()
            sms_from = os.getenv('TWILIO_SMS_FROM', '').strip()
            if messaging_sid:
                send_sms = lambda: client.messages.create(to=target, body=body, messaging_service_sid=messaging_sid)
            elif sms_from:
                send_sms = lambda: client.messages.create(to=target, body=body, from_=sms_from)
            else:
                raise HTTPException(status_code=503, detail='SMS link delivery is not configured')
            await asyncio.to_thread(send_sms)
    except HTTPException:
        await db.verification_links.delete_one({'token_hash': _hash_token(token), 'used': False})
        raise
    except Exception as exc:
        await db.verification_links.delete_one({'token_hash': _hash_token(token), 'used': False})
        raise HTTPException(status_code=503, detail='Unable to send verification link') from exc
    await _audit(db, kind='admin_verification_link_sent', admin=admin, user_id=user_id,
                 channel=channel, extra={'was_verified': bool(user.get(f'{channel}_verified'))})
    return {'sent': True, 'expires_in_minutes': 30}


@public_router.get('/api/verify-contact', response_class=HTMLResponse)
async def verify_contact(token: str = ''):
    if not 32 <= len(token) <= 128:
        return _page('Invalid verification link.')
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = await db.verification_links.find_one(
        {'token_hash': _hash_token(token), 'used': False, 'expires_at': {'$gt': now}}, {'_id': 0})
    if not doc or doc.get('channel') not in ('email', 'phone'):
        return _page('This verification link has expired or was already used.')
    user = await db.users.find_one({'user_id': doc['user_id'], 'erased': {'$ne': True}}, {'_id': 0})
    if not user or user.get(doc['channel']) != doc.get('original'):
        return _page('Account contact details have changed. Request a new link.')
    if doc['channel'] == 'phone':
        return _page('This link starts mobile verification. Enter the SMS code to finish.', token=token, phone_form=True)

    claimed = await db.verification_links.update_one(
        {'token_hash': _hash_token(token), 'used': False, 'expires_at': {'$gt': now}},
        {'$set': {'used': True, 'used_at': now}},
    )
    if not claimed.modified_count:
        return _page('This verification link has already been used.')
    updated = await db.users.update_one(
        {'user_id': doc['user_id'], 'email': doc['original'], 'erased': {'$ne': True}},
        {'$set': {'email_verified': True, 'email_verified_at': now}},
    )
    if not updated.modified_count:
        return _page('Account details changed. Request a new link.')
    await _audit(db, kind='contact_verified_by_link', user_id=doc['user_id'], channel='email')
    return _page('Your email address is verified successfully.')


@public_router.post('/api/verify-contact/mobile/send', response_class=HTMLResponse)
async def send_mobile_code(token: str = Form(...)):
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = await db.verification_links.find_one(
        {'token_hash': _hash_token(token), 'channel': 'phone', 'used': False,
         'expires_at': {'$gt': now}}, {'_id': 0})
    if not doc:
        return _page('This verification link has expired or is invalid.')
    last = doc.get('sms_sent_at')
    if isinstance(last, datetime) and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if doc.get('sms_send_count', 0) >= 5:
        return _page('Too many SMS requests. Request a new verification link.')
    if last and (now - last).total_seconds() < 60:
        return _page('Please wait 60 seconds before requesting another SMS code.', token=token, phone_form=True)
    user = await db.users.find_one(
        {'user_id': doc['user_id'], 'phone': doc['original'], 'erased': {'$ne': True}}, {'_id': 1})
    if not user:
        return _page('Account contact details changed. Request a new link.')
    claimed = await db.verification_links.update_one(
        {'token_hash': _hash_token(token), 'used': False,
         '$or': [{'sms_send_count': {'$lt': 5}}, {'sms_send_count': {'$exists': False}}]},
        {'$set': {'sms_sent_at': now}, '$inc': {'sms_send_count': 1}},
    )
    if not claimed.modified_count:
        return _page('SMS request limit reached. Request a new link.')
    try:
        client, service_sid = twilio_verify_client()
        await asyncio.to_thread(lambda: client.verify.v2.services(service_sid).verifications.create(to=doc['target'], channel='sms'))
    except Exception:
        await db.verification_links.update_one(
            {'token_hash': _hash_token(token), 'used': False},
            {'$inc': {'sms_send_count': -1}, '$unset': {'sms_sent_at': ''}},
        )
        return _page('Could not send SMS. Please contact support or request a new link.')
    return _page('SMS code sent. Enter it below to complete mobile verification.', token=token, phone_form=True)


@public_router.post('/api/verify-contact/mobile/check', response_class=HTMLResponse)
async def verify_mobile_code(token: str = Form(...), code: str = Form(...)):
    if not code.isdigit() or not 4 <= len(code) <= 10:
        return _page('Invalid SMS code.')
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = await db.verification_links.find_one(
        {'token_hash': _hash_token(token), 'channel': 'phone', 'used': False,
         'sms_send_count': {'$gt': 0}, 'expires_at': {'$gt': now}}, {'_id': 0})
    if not doc:
        return _page('Request an SMS code first, or request a new link.')
    user = await db.users.find_one(
        {'user_id': doc['user_id'], 'phone': doc['original'], 'erased': {'$ne': True}}, {'_id': 0})
    if not user:
        return _page('Account contact details changed. Request a new link.')
    if await db.users.find_one({'phone': doc['target'], 'phone_verified': True,
                                'user_id': {'$ne': doc['user_id']}}, {'_id': 1}):
        return _page('This number is already verified on another account.')
    try:
        client, service_sid = twilio_verify_client()
        result = await asyncio.to_thread(
            lambda: client.verify.v2.services(service_sid).verification_checks.create(to=doc['target'], code=code))
        if result.status != 'approved':
            return _page('Incorrect or expired SMS code.')
    except Exception:
        return _page('Unable to verify the SMS code. Please try again.')
    claimed = await db.verification_links.update_one(
        {'token_hash': _hash_token(token), 'used': False, 'expires_at': {'$gt': now}},
        {'$set': {'used': True, 'used_at': now}},
    )
    if not claimed.modified_count:
        return _page('This verification link has already been used.')
    updated = await db.users.update_one(
        {'user_id': doc['user_id'], 'phone': doc['original'], 'erased': {'$ne': True}},
        {'$set': {'phone': doc['target'], 'phone_verified': True, 'phone_verified_at': now}},
    )
    if not updated.modified_count:
        return _page('Account details changed. Request a new link.')
    await _audit(db, kind='contact_verified_by_otp', user_id=doc['user_id'], channel='phone')
    return _page('Your mobile number is verified successfully.')