"""Prize League Admin Alerts: consent-aware SendGrid campaigns.

Install by importing `router` and `resume_pending_campaigns` in server.py.
No third-party dependency beyond the application's existing FastAPI/Motor stack.
"""
import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request as URLRequest, urlopen
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from pydantic import BaseModel, Field
from typing import Literal, Optional

from auth import require_admin
from deps import get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/admin/users/alerts', tags=['admin-alerts'])
PUBLIC_ROUTER = APIRouter(prefix='/api/marketing', tags=['marketing'])
SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send'
CHANNELS = {'email', 'in_app', 'sms'}
MAX_RECIPIENTS = 10000
RUNNING = set()


def now():
    return datetime.now(timezone.utc)


def _public(doc):
    if not doc:
        return None
    return {k: v for k, v in doc.items() if k != '_id'}


def _consented(u):
    # Explicit affirmative opt-in only. Never infer consent from registration.
    return u.get('marketing_email_consent') is True or u.get('email_marketing_opt_in') is True


def _unsubscribed(u):
    return u.get('marketing_email_unsubscribed') is True


def _email(u):
    address = str(u.get('email') or '').strip().lower()
    return address if re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', address) else None


def _sendgrid_sync(to, subject, body, action_url, action_label, unsubscribe_url):
    from html import escape

    key = os.getenv('SENDGRID_API_KEY', '').strip()
    sender = os.getenv('SENDGRID_FROM_EMAIL', 'info@prizeleague.co.uk').strip()
    if not key:
        return False, 'SENDGRID_API_KEY is not configured'
    if not _email({'email': sender}):
        return False, 'SENDGRID_FROM_EMAIL is invalid'
    action_url = _safe_action_url(action_url)
    safe_title = escape(subject.strip())
    safe_message = escape(body.strip()).replace('\n', '<br>')
    safe_action_url = escape(action_url, quote=True)
    safe_action_label = escape(action_label.strip() or 'View offer')
    safe_unsubscribe_url = escape(unsubscribe_url, quote=True)
    text_body = (
        f'{subject.strip()}\n\n{body.strip()}\n\n'
        f'{action_label.strip() or "View offer"}: {action_url}\n\n'
        f'Unsubscribe from marketing emails: {unsubscribe_url}'
    )
    html_body = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#17202b;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{safe_title}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f7;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4e8ed;border-radius:14px;overflow:hidden;">
<tr><td style="padding:22px 28px;background:#101827;color:#ffffff;font-size:13px;font-weight:700;">PRIZE LEAGUE</td></tr>
<tr><td style="padding:32px 28px 18px;">
<h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#101827;">{safe_title}</h1>
<div style="font-size:16px;line-height:1.7;color:#475569;">{safe_message}</div>
<div style="padding:26px 0 8px;"><a href="{safe_action_url}" style="display:inline-block;background:#6c2bff;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 24px;border-radius:8px;">{safe_action_label}</a></div>
</td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid #edf0f3;font-size:12px;line-height:1.6;color:#7b8794;">You’re receiving this because you opted in to Prize League marketing emails.<br><a href="{safe_unsubscribe_url}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a></td></tr>
</table>
</td></tr></table></body></html>'''
    payload = {
        'personalizations': [{'to': [{'email': to}]}],
        'from': {'email': sender, 'name': 'Prize League'},
        'subject': subject[:200],
        'content': [
            {'type': 'text/plain', 'value': text_body},
            {'type': 'text/html', 'value': html_body},
        ],
        'headers': {'List-Unsubscribe': f'<{unsubscribe_url}>'},
    }
    req = URLRequest(SENDGRID_URL, data=json.dumps(payload).encode(), method='POST', headers={
        'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
    })
    try:
        with urlopen(req, timeout=20) as resp:
            return (resp.status == 202), (f'SendGrid accepted ({resp.status})' if resp.status == 202 else f'SendGrid HTTP {resp.status}')
    except HTTPError as exc:
        try:
            detail = exc.read(800).decode('utf-8', 'replace')
        except Exception:
            detail = ''
        return False, f'SendGrid HTTP {exc.code}: {detail[:500]}'
    except (URLError, TimeoutError, OSError) as exc:
        return False, f'SendGrid connection error: {type(exc).__name__}'


def _safe_action_url(value):
    url = str(value or '').strip()
    parsed = urlparse(url)
    if parsed.scheme not in ('https', 'http') or not parsed.netloc:
        raise ValueError('Campaign action URL must be an absolute HTTP or HTTPS URL')
    return url


class Audience(BaseModel):
    mode: Literal['range', 'users', 'winners'] = 'range'
    identifiers: list[str] = Field(default_factory=list, max_length=MAX_RECIPIENTS)
    winner_source: Optional[str] = None
    winner_ref: Optional[str] = None


class CampaignInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=10000)
    action_url: str = Field(default='https://prizeleague.co.uk/', min_length=8, max_length=2000)
    action_label: str = Field(default='View offer', min_length=1, max_length=80)
    alert_type: str = 'custom'
    channels: list[Literal['email', 'sms', 'in_app']] = Field(min_length=1, max_length=3)
    audience: Audience = Field(default_factory=Audience)
    user_from: int = Field(default=1, ge=1)
    user_to: int = Field(default=1000, ge=1)


async def _user_candidates(db, data):
    mode = data.audience.mode
    if mode == 'users':
        ids = [s.strip() for s in data.audience.identifiers if s.strip()]
        if not ids:
            raise HTTPException(400, 'Select at least one recipient')
        docs = await db.users.find({'$or': [
            {'user_id': {'$in': ids}}, {'public_id': {'$in': ids}},
            {'email': {'$in': [s.lower() for s in ids]}},
        ]}, {'_id': 0}).limit(MAX_RECIPIENTS).to_list(MAX_RECIPIENTS)
        return docs
    if mode == 'winners':
        raise HTTPException(400, 'Winner targeting requires matching the deployed winner data model; use Selected Users or Range until configured')
    if data.user_to < data.user_from or data.user_to - data.user_from + 1 > MAX_RECIPIENTS:
        raise HTTPException(400, 'Invalid range or more than 10,000 users')
    # Registration order is stable using created_at and user_id as a tie-breaker.
    return await db.users.find({}, {'_id': 0}).sort([('created_at', 1), ('user_id', 1)]).skip(data.user_from - 1).limit(data.user_to - data.user_from + 1).to_list(MAX_RECIPIENTS)


async def _process(campaign_id):
    if campaign_id in RUNNING:
        return
    RUNNING.add(campaign_id)
    db = get_db()
    try:
        await db.alert_campaigns.update_one({'campaign_id': campaign_id}, {'$set': {'status': 'processing', 'updated_at': now()}})
        while True:
            # Atomic claim prevents duplicate sending if two workers race.
            from pymongo import ReturnDocument
            d = await db.alert_deliveries.find_one_and_update(
                {'campaign_id': campaign_id, 'status': 'pending'},
                {'$set': {'status': 'processing', 'updated_at': now()}},
                sort=[('created_at', 1)], return_document=ReturnDocument.AFTER,
            )
            if not d:
                break
            status, reason = 'failed', ''
            try:
                u = await db.users.find_one({'user_id': d['user_id']}, {'_id': 0})
                if not u:
                    status, reason = 'skipped', 'User not found'
                elif d['channel'] == 'email':
                    if not _consented(u) or _unsubscribed(u):
                        status, reason = 'skipped', 'No active marketing email consent'
                    elif not _email(u):
                        status, reason = 'skipped', 'Missing or invalid email'
                    else:
                        c = await db.alert_campaigns.find_one({'campaign_id': campaign_id})
                        base = os.getenv('PUBLIC_SITE_URL', 'https://prizeleague.co.uk').rstrip('/')
                        # Per-user random token stored server-side (no secret in URL construction).
                        token = d.get('unsubscribe_token')
                        link = f'{base}/api/marketing/unsubscribe/{token}'
                        ok, reason = await asyncio.to_thread(_sendgrid_sync, _email(u), c['title'], c['message'], link)
                        status = 'sent' if ok else 'failed'  # 'sent' means API accepted, not delivered
                elif d['channel'] == 'in_app':
                    await db.notifications.update_one(
                        {'notification_id': d['delivery_id']},
                        {'$setOnInsert': {
                            'notification_id': d['delivery_id'], 'user_id': d['user_id'],
                            'title': d['title'], 'message': d['message'], 'read': False,
                            'created_at': now(), 'type': d.get('alert_type', 'custom'),
                        }}, upsert=True,
                    )
                    status, reason = 'sent', 'In-app notification created'
                else:
                    status, reason = 'skipped', 'SMS delivery not configured in this module'
            except Exception as exc:
                log.exception('Campaign %s delivery failed', campaign_id)
                status, reason = 'failed', f'{type(exc).__name__}: {str(exc)[:180]}'
            await db.alert_deliveries.update_one({'delivery_id': d['delivery_id']}, {
                '$set': {'status': status, 'reason': reason, 'updated_at': now()}})
        totals = {}
        async for item in db.alert_deliveries.aggregate([
            {'$match': {'campaign_id': campaign_id}},
            {'$group': {'_id': '$status', 'count': {'$sum': 1}}},
        ]):
            totals[item['_id']] = item['count']
        state = 'completed' if not totals.get('failed') else 'completed_with_errors'
        await db.alert_campaigns.update_one({'campaign_id': campaign_id}, {
            '$set': {'status': state, 'counts': totals, 'updated_at': now()}})
    except Exception:
        log.exception('Campaign processor stopped: %s', campaign_id)
        await db.alert_campaigns.update_one({'campaign_id': campaign_id}, {'$set': {'status': 'failed', 'updated_at': now()}})
    finally:
        RUNNING.discard(campaign_id)


@router.post('/campaigns')
async def create_campaign(data: CampaignInput, request: Request, background_tasks: BackgroundTasks):
    await require_admin(request)
    db = get_db()
    try:
        action_url = _safe_action_url(data.action_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    users = await _user_candidates(db, data)
    if not users:
        raise HTTPException(400, 'No matching registered users')
    channels = list(dict.fromkeys(data.channels))
    cid = str(uuid.uuid4())
    timestamp = now()
    docs = []
    for position, u in enumerate(users, start=data.user_from if data.audience.mode == 'range' else 1):
        for channel in channels:
            docs.append({
                'delivery_id': str(uuid.uuid4()), 'campaign_id': cid,
                'user_id': u['user_id'], 'user_position': position,
                'channel': channel, 'status': 'pending', 'reason': '',
                'title': data.title, 'message': data.message,
                'action_url': action_url, 'action_label': data.action_label,
                'alert_type': data.alert_type, 'unsubscribe_token': uuid.uuid4().hex + uuid.uuid4().hex,
                'created_at': timestamp, 'updated_at': timestamp,
            })
    campaign = {
        'campaign_id': cid, 'title': data.title, 'message': data.message,
        'action_url': action_url, 'action_label': data.action_label,
        'alert_type': data.alert_type, 'channels': channels,
        'user_from': data.user_from if data.audience.mode == 'range' else 1,
        'user_to': data.user_to if data.audience.mode == 'range' else len(users),
        'targeted_count': len(users), 'status': 'pending',
        'created_at': timestamp, 'updated_at': timestamp,
    }
    await db.alert_campaigns.insert_one(campaign)
    await db.alert_deliveries.insert_many(docs, ordered=False)
    background_tasks.add_task(_process, cid)
    return {'campaign_id': cid, 'status': 'pending', 'targeted_count': len(users)}


@router.get('/campaigns')
async def campaigns(request: Request, limit: int = Query(50, ge=1, le=200)):
    await require_admin(request)
    docs = await get_db().alert_campaigns.find({}, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    return {'campaigns': docs}


@router.get('/campaigns/{campaign_id}')
async def campaign_detail(campaign_id: str, request: Request):
    await require_admin(request)
    c = await get_db().alert_campaigns.find_one({'campaign_id': campaign_id}, {'_id': 0})
    if not c:
        raise HTTPException(404, 'Campaign not found')
    return c


@router.get('/campaigns/{campaign_id}/deliveries')
async def deliveries(campaign_id: str, request: Request, status: str = '', channel: str = '', limit: int = Query(200, ge=1, le=1000)):
    await require_admin(request)
    q = {'campaign_id': campaign_id}
    if status:
        q['status'] = status
    if channel:
        q['channel'] = channel
    docs = await get_db().alert_deliveries.find(q, {'_id': 0, 'unsubscribe_token': 0}).sort('created_at', 1).limit(limit).to_list(limit)
    return {'deliveries': docs}


@router.get('/user-search')
async def user_search(request: Request, q: str = ''):
    await require_admin(request)
    q = q.strip()[:100]
    if len(q) < 2:
        return {'users': []}
    rx = re.escape(q)
    docs = await get_db().users.find({'$or': [
        {'name': {'$regex': rx, '$options': 'i'}},
        {'username': {'$regex': rx, '$options': 'i'}},
        {'email': {'$regex': rx, '$options': 'i'}},
        {'public_id': {'$regex': rx, '$options': 'i'}},
    ]}, {'_id': 0, 'user_id': 1, 'public_id': 1, 'name': 1, 'email': 1}).limit(30).to_list(30)
    return {'users': docs}


@router.get('/winner-sources')
async def winner_sources(request: Request):
    await require_admin(request)
    return {'sources': {'paid_contest': [], 'promotion_draw': [], 'free_world': []}}


@router.get('/winners')
async def winners(request: Request, source: str = '', ref: str = 'all'):
    await require_admin(request)
    return {'count': 0, 'users': [], 'detail': 'Winner audience integration not configured'}


@PUBLIC_ROUTER.get('/unsubscribe/{token}')
async def unsubscribe(token: str):
    if not re.fullmatch(r'[a-f0-9]{64}', token):
        raise HTTPException(404, 'Invalid unsubscribe link')
    db = get_db()
    d = await db.alert_deliveries.find_one({'unsubscribe_token': token, 'channel': 'email'}, {'user_id': 1})
    if not d:
        raise HTTPException(404, 'Invalid unsubscribe link')
    await db.users.update_one({'user_id': d['user_id']}, {'$set': {
        'marketing_email_unsubscribed': True, 'marketing_email_consent': False,
        'email_marketing_opt_in': False, 'marketing_email_unsubscribed_at': now(),
    }})
    from fastapi.responses import HTMLResponse
    return HTMLResponse('<!doctype html><html><body><h2>Unsubscribed</h2><p>You will no longer receive Prize League promotional emails.</p></body></html>')


async def resume_pending_campaigns():
    """No automatic replay: prevents unexpected historical bulk sends on deploy."""
    return None
