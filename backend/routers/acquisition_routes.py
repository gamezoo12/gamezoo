"""
Prize League — Acquisition / traffic-source tracking.

Public:
    POST /api/acquisition/track                — record a first-visit / landing hit

Admin:
    GET  /api/admin/acquisition/summary        — aggregated acquisition analytics
    GET  /api/admin/acquisition/visits         — paginated raw visit log

Nothing here touches gameplay, wallet, auth or progression. It only records how
visitors reached the site (referrer + UTM + landing page + device).
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from typing import Optional

from auth import require_admin, get_current_user

public_router = APIRouter(prefix='/api/acquisition', tags=['acquisition'])
admin_router = APIRouter(prefix='/api/admin/acquisition', tags=['admin-acquisition'])


def _now() -> datetime:
    return datetime.now(timezone.utc)


TIME_RANGES = {
    '1h': timedelta(hours=1), '6h': timedelta(hours=6),
    '24h': timedelta(hours=24), '7d': timedelta(days=7),
    '1m': timedelta(days=30), '6m': timedelta(days=182),
    '1y': timedelta(days=365), 'lifetime': None,
}


def _range_query(period: Optional[str], days: int):
    if period is not None:
        if period not in TIME_RANGES:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail='Unsupported acquisition time range')
        duration = TIME_RANGES[period]
        return ({'created_at': {'$gte': _now() - duration}} if duration else {}, period)
    days = max(1, min(int(days), 365))
    return {'created_at': {'$gte': _now() - timedelta(days=days)}}, f'{days}d'


def _host(url: str) -> str:
    if not url:
        return ''
    try:
        netloc = urlparse(url).netloc.lower()
        return netloc[4:] if netloc.startswith('www.') else netloc
    except Exception:
        return ''


# Very small, dependency-free user-agent classifier.
def _parse_ua(ua: str) -> dict:
    ua = (ua or '')
    low = ua.lower()

    if any(k in low for k in ['ipad', 'tablet', 'kindle', 'playbook', 'nexus 7', 'nexus 10']):
        device = 'tablet'
    elif any(k in low for k in ['mobi', 'iphone', 'android', 'blackberry', 'windows phone', 'ipod']):
        device = 'mobile'
    elif low:
        device = 'desktop'
    else:
        device = 'unknown'

    if 'edg' in low:
        browser = 'Edge'
    elif 'opr' in low or 'opera' in low:
        browser = 'Opera'
    elif 'chrome' in low and 'chromium' not in low:
        browser = 'Chrome'
    elif 'firefox' in low:
        browser = 'Firefox'
    elif 'safari' in low:
        browser = 'Safari'
    else:
        browser = 'Other'

    if 'windows' in low:
        os_name = 'Windows'
    elif 'iphone' in low or 'ipad' in low or 'ios' in low or 'mac os' in low:
        os_name = 'iOS/macOS'
    elif 'android' in low:
        os_name = 'Android'
    elif 'linux' in low:
        os_name = 'Linux'
    else:
        os_name = 'Other'

    return {'device_type': device, 'browser': browser, 'os': os_name}


def _classify_source(utm_source: str, referrer_host: str, own_hosts: set) -> tuple:
    """Returns (source, channel)."""
    if utm_source:
        return utm_source.lower(), 'campaign'
    if referrer_host and referrer_host not in own_hosts:
        search = {'google', 'bing', 'yahoo', 'duckduckgo', 'ecosia', 'baidu', 'yandex'}
        social = {'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 't.co',
                  'tiktok.com', 'youtube.com', 'reddit.com', 'linkedin.com',
                  'pinterest.com', 'snapchat.com', 'whatsapp.com', 'telegram.org'}
        base = referrer_host.split('.')[0]
        if base in search or any(s in referrer_host for s in search):
            return referrer_host, 'organic_search'
        if referrer_host in social or any(s in referrer_host for s in social):
            return referrer_host, 'social'
        return referrer_host, 'referral'
    return 'direct', 'direct'


class TrackInput(BaseModel):
    visitor_id: str = Field(min_length=4, max_length=80)
    landing_path: Optional[str] = Field(default='/', max_length=600)
    referrer: Optional[str] = Field(default='', max_length=1000)
    utm_source: Optional[str] = Field(default='', max_length=200)
    utm_medium: Optional[str] = Field(default='', max_length=200)
    utm_campaign: Optional[str] = Field(default='', max_length=200)
    utm_term: Optional[str] = Field(default='', max_length=200)
    utm_content: Optional[str] = Field(default='', max_length=200)
    screen: Optional[str] = Field(default='', max_length=40)
    language: Optional[str] = Field(default='', max_length=40)


class TrackPageViewInput(BaseModel):
    visitor_id: str = Field(min_length=4, max_length=80)
    view_id: str = Field(min_length=8, max_length=120)
    page_path: str = Field(min_length=1, max_length=600)


@public_router.post('/track')
async def track_visit(payload: TrackInput, request: Request):
    from deps import get_db
    db = get_db()

    # Best-effort logged-in association (never required).
    user_id = None
    try:
        u = await get_current_user(request)
        user_id = (u or {}).get('user_id')
    except Exception:
        user_id = None

    ua = request.headers.get('user-agent', '')
    own_host = _host(str(request.base_url))
    own_hosts = {own_host} if own_host else set()

    referrer = (payload.referrer or '').strip()
    referrer_host = _host(referrer)
    utm_source = (payload.utm_source or '').strip()

    source, channel = _classify_source(utm_source, referrer_host, own_hosts)
    ua_info = _parse_ua(ua)

    now = _now()
    day_key = now.strftime('%Y-%m-%d')

    # One recorded landing per visitor per day keeps counts honest.
    dedupe_key = f'{payload.visitor_id}:{day_key}'

    doc = {
        'visit_id': f'acq_{uuid.uuid4().hex[:18]}',
        'dedupe_key': dedupe_key,
        'visitor_id': payload.visitor_id,
        'user_id': user_id,
        'landing_path': (payload.landing_path or '/')[:600],
        'referrer': referrer[:1000],
        'referrer_host': referrer_host,
        'utm_source': utm_source[:200],
        'utm_medium': (payload.utm_medium or '').strip()[:200],
        'utm_campaign': (payload.utm_campaign or '').strip()[:200],
        'utm_term': (payload.utm_term or '').strip()[:200],
        'utm_content': (payload.utm_content or '').strip()[:200],
        'source': source,
        'channel': channel,
        'device_type': ua_info['device_type'],
        'browser': ua_info['browser'],
        'os': ua_info['os'],
        'user_agent': ua[:500],
        'screen': (payload.screen or '')[:40],
        'language': (payload.language or '')[:40],
        'day_key': day_key,
        'created_at': now,
    }

    try:
        await db.acquisition_visits.update_one(
            {'dedupe_key': dedupe_key},
            {'$setOnInsert': doc},
            upsert=True,
        )
    except Exception:
        # Never let tracking break the page load.
        return {'ok': True, 'recorded': False}

    return {'ok': True, 'recorded': True, 'source': source, 'channel': channel}


@public_router.post('/page-view')
async def track_page_view(payload: TrackPageViewInput, request: Request):
    from deps import get_db
    db = get_db()
    user_id = None
    try:
        user_id = (await get_current_user(request)).get('user_id')
    except Exception:
        pass
    now = _now()
    await db.acquisition_page_views.update_one(
        {'view_id': payload.view_id},
        {'$setOnInsert': {
            'view_id': payload.view_id,
            'visitor_id': payload.visitor_id,
            'user_id': user_id,
            'page_path': payload.page_path,
            'created_at': now,
        }},
        upsert=True,
    )
    return {'ok': True}


async def _bucket(db, match, field, limit=15):
    pipeline = [
        {'$match': match},
        {'$group': {'_id': f'${field}', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
        {'$limit': limit},
    ]
    rows = await db.acquisition_visits.aggregate(pipeline).to_list(limit)
    return [
        {'key': (r['_id'] or 'unknown'), 'count': r['count']}
        for r in rows
    ]


@admin_router.get('/summary')
async def acquisition_summary(request: Request, days: int = 30, period: Optional[str] = None):
    await require_admin(request)
    from deps import get_db
    db = get_db()

    match, period_label = _range_query(period, days)

    total_visits = await db.acquisition_visits.count_documents(match)
    page_views = await db.acquisition_page_views.count_documents(match)

    unique_rows = await db.acquisition_visits.aggregate([
        {'$match': match},
        {'$group': {'_id': '$visitor_id'}},
        {'$count': 'n'},
    ]).to_list(1)
    unique_visitors = unique_rows[0]['n'] if unique_rows else 0

    signups = await db.acquisition_visits.count_documents(
        {**match, 'user_id': {'$ne': None}}
    )

    by_source = await _bucket(db, match, 'source')
    by_channel = await _bucket(db, match, 'channel')
    by_medium = await _bucket(db, match, 'utm_medium')
    by_campaign = await _bucket(db, match, 'utm_campaign')
    by_device = await _bucket(db, match, 'device_type')
    by_browser = await _bucket(db, match, 'browser')
    by_landing = await _bucket(db, match, 'landing_path')

    # Daily trend.
    trend_format = '%Y-%m' if period_label in ('6m', '1y', 'lifetime') else '%Y-%m-%d'
    trend_rows = await db.acquisition_visits.aggregate([
        {'$match': match},
        {'$group': {
            '_id': {'$dateToString': {'format': trend_format, 'date': '$created_at'}},
            'visits': {'$sum': 1},
            'visitors': {'$addToSet': '$visitor_id'},
        }},
        {'$project': {
            'visits': 1,
            'visitors': {'$size': '$visitors'},
        }},
        {'$sort': {'_id': 1}},
    ]).to_list(400)
    trend = [
        {'day': r['_id'], 'visits': r['visits'], 'visitors': r['visitors']}
        for r in trend_rows
    ]

    # Drop blank utm_medium/campaign buckets (no campaign attached).
    by_medium = [b for b in by_medium if b['key'] and b['key'] != 'unknown']
    by_campaign = [b for b in by_campaign if b['key'] and b['key'] != 'unknown']

    # Signup conversion by first-touch source: attribute each visitor to the
    # source of their EARLIEST visit, then count how many of those visitors
    # ever became a registered player (any visit carried a user_id).
    conv_rows = await db.acquisition_visits.aggregate([
        {'$match': match},
        {'$sort': {'created_at': 1}},
        {'$group': {
            '_id': '$visitor_id',
            'first_source': {'$first': '$source'},
            'converted': {
                '$max': {
                    '$cond': [{'$ifNull': ['$user_id', False]}, 1, 0]
                }
            },
        }},
        {'$group': {
            '_id': '$first_source',
            'visitors': {'$sum': 1},
            'converted': {'$sum': '$converted'},
        }},
        {'$sort': {'visitors': -1}},
        {'$limit': 20},
    ]).to_list(20)

    by_source_conversion = [
        {
            'key': r['_id'] or 'direct',
            'visitors': r['visitors'],
            'converted': r['converted'],
            'rate': (
                round((r['converted'] / r['visitors']) * 100, 1)
                if r['visitors'] else 0
            ),
        }
        for r in conv_rows
    ]

    converted_visitors = sum(
        r['converted'] for r in by_source_conversion
    )
    overall_conversion_rate = (
        round((converted_visitors / unique_visitors) * 100, 1)
        if unique_visitors else 0
    )

    return {
        'days': None,
        'period': period_label,
        'total_visits': total_visits,
        'page_views': page_views,
        'unique_visitors': unique_visitors,
        'visits_from_signed_in': signups,
        'converted_visitors': converted_visitors,
        'overall_conversion_rate': overall_conversion_rate,
        'by_source': by_source,
        'by_source_conversion': by_source_conversion,
        'by_channel': by_channel,
        'by_medium': by_medium,
        'by_campaign': by_campaign,
        'by_device': by_device,
        'by_browser': by_browser,
        'by_landing': by_landing,
        'trend': trend,
    }


@admin_router.get('/visits')
async def acquisition_visits(
    request: Request,
    days: int = 30,
    period: Optional[str] = None,
    source: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    await require_admin(request)
    from deps import get_db
    db = get_db()

    q, period_label = _range_query(period, days)
    if source:
        q['source'] = source

    skip = max(0, int(skip))
    limit = max(1, min(int(limit), 200))

    total = await db.acquisition_visits.count_documents(q)
    docs = await db.acquisition_visits.find(
        q, {'_id': 0},
    ).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)

    return {'visits': docs, 'total': total, 'skip': skip, 'limit': limit, 'period': period_label}


@admin_router.get('/page-views')
async def acquisition_page_views(
    request: Request,
    period: Optional[str] = None,
    days: int = 30,
    skip: int = 0,
    limit: int = 100,
):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    query, period_label = _range_query(period, days)
    skip = max(0, int(skip))
    limit = max(1, min(int(limit), 500))
    total = await db.acquisition_page_views.count_documents(query)
    pages = await db.acquisition_page_views.find(query, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    user_ids = list({page.get('user_id') for page in pages if page.get('user_id')})
    users = await db.users.find({'user_id': {'$in': user_ids}}, {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1}).to_list(len(user_ids)) if user_ids else []
    user_map = {user['user_id']: user for user in users}
    for page in pages:
        page['user'] = user_map.get(page.get('user_id'), {})
    return {'page_views': pages, 'total': total, 'skip': skip, 'limit': limit, 'period': period_label}
