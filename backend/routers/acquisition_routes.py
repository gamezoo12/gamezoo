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

import uuid
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from typing import Optional

from auth import require_admin, get_current_user
from services.analytics_common import (
    classify_page, classify_traffic, device_of, host_of, is_staff, is_test_account,
    route_template, visitor_state,
)
from services.analytics_events import public_traffic_filter

public_router = APIRouter(prefix='/api/acquisition', tags=['acquisition'])
admin_router = APIRouter(prefix='/api/admin/acquisition', tags=['admin-acquisition'])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _range_query(period: Optional[str], days: int):
    if period is not None:
        from fastapi import HTTPException
        from services.analytics_common import RANGE_KEYS, resolve_range
        if period not in RANGE_KEYS or period == 'custom':
            raise HTTPException(status_code=400, detail='Unsupported acquisition time range')
        if period in ('all_time', 'lifetime'):
            return {}, period
        window = resolve_range(period)
        return {'created_at': {'$gte': window['start'], '$lt': window['end']}}, period
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
    session_id: Optional[str] = Field(default=None, min_length=8, max_length=80)
    variant: Optional[str] = Field(default='', max_length=20)
    prev_path: Optional[str] = Field(default='', max_length=600)
    # Only meaningful on the first view of a session.
    referrer: Optional[str] = Field(default='', max_length=1000)
    utm_source: Optional[str] = Field(default='', max_length=200)
    utm_medium: Optional[str] = Field(default='', max_length=200)
    utm_campaign: Optional[str] = Field(default='', max_length=200)
    has_gclid: Optional[bool] = False


class EngagementInput(BaseModel):
    view_id: str = Field(min_length=8, max_length=120)
    engaged_ms: int = Field(ge=0, le=1_800_000)


class EventInput(BaseModel):
    visitor_id: str = Field(min_length=4, max_length=80)
    session_id: str = Field(min_length=8, max_length=80)
    name: str = Field(max_length=40)
    page_path: Optional[str] = Field(default='/', max_length=600)


class AttributeInput(BaseModel):
    visitor_id: str = Field(min_length=4, max_length=80)
    session_id: Optional[str] = Field(default=None, max_length=80)


class PaidGameStartInput(BaseModel):
    ticket_id: str = Field(min_length=3, max_length=120)
    start_id: str = Field(min_length=8, max_length=120)


# Only these funnel events can be recorded from the browser; everything else in the
# funnel (registration, verification, game starts, entries) is read from server records.
ALLOWED_EVENTS = {'signup_click', 'champion_view'}
BOUNCE_ENGAGEMENT_MS = 10_000
ATTRIBUTION_WINDOW_DAYS = 30
REGISTRATION_JOURNEY_HOURS = 24


async def _optional_user(request: Request):
    try:
        return await get_current_user(request)
    except Exception:
        return None


async def _log_staff_activity(db, user: dict, kind: str, path: str, now: datetime):
    """Internal audit trail; deliberately separate from public traffic collections."""
    await db.staff_activity_log.insert_one({
        'user_id': user.get('user_id'), 'role': user.get('role'), 'kind': kind,
        'page_path': route_template(path), 'created_at': now,
    })


@public_router.post('/track')
async def track_visit(payload: TrackInput, request: Request):
    from deps import get_db
    db = get_db()

    # Best-effort logged-in association (never required).
    user = await _optional_user(request)
    user_id = (user or {}).get('user_id')
    if is_staff(user):
        await _log_staff_activity(db, user, 'landing', payload.landing_path or '/', _now())
        return {'ok': True, 'recorded': False}

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
        'screen': (payload.screen or '')[:40],
        'language': (payload.language or '')[:40],
        'day_key': day_key,
        'created_at': now,
        'is_staff': False,
        'is_test': is_test_account(user),
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
    user = await _optional_user(request)
    now = _now()
    if is_staff(user):
        await _log_staff_activity(db, user, 'page_view', payload.page_path, now)
        return {'ok': True, 'recorded': False}

    route = route_template(payload.page_path)
    page_key, _label = classify_page(payload.page_path, payload.variant or '')
    prev_route = route_template(payload.prev_path) if payload.prev_path else ''
    prev_key = classify_page(payload.prev_path)[0] if payload.prev_path else ''
    session_id = payload.session_id or f'legacy_{payload.visitor_id}'
    ua = request.headers.get('user-agent', '')
    device = device_of(ua)
    state = visitor_state(user)

    session = await db.acquisition_sessions.find_one(
        {'session_id': session_id}, {'_id': 0, 'source_key': 1, 'medium': 1, 'campaign': 1, 'device_type': 1},
    )
    is_entrance = session is None
    if session is None:
        own = {host_of(str(request.base_url))}
        traffic = classify_traffic(payload.utm_source or '', payload.utm_medium or '',
                                   host_of(payload.referrer or ''), own, bool(payload.has_gclid))
        session = {'source_key': traffic['source_key'], 'medium': traffic['medium'],
                   'campaign': (payload.utm_campaign or '').strip()[:120] or '(none)', 'device_type': device,
                   'referrer_host': traffic['referrer_host']}

    view_doc = {
        'view_id': payload.view_id,
        'visitor_id': payload.visitor_id,
        'session_id': session_id,
        'user_id': (user or {}).get('user_id'),
        'user_state': state,
        'page_path': route,
        'page_key': page_key,
        'prev_path': prev_route,
        'prev_page_key': prev_key,
        'is_entrance': is_entrance,
        'source_key': session['source_key'],
        'campaign': session['campaign'],
        'device_type': session['device_type'],
        'engaged_ms': 0,
        'is_staff': False,
        'is_test': is_test_account(user),
        'created_at': now,
    }
    inserted = await db.acquisition_page_views.update_one(
        {'view_id': payload.view_id}, {'$setOnInsert': view_doc}, upsert=True,
    )
    if inserted.upserted_id is None:
        return {'ok': True, 'duplicate': True}

    new_visitor = False
    if is_entrance:
        seen = await db.acquisition_visitors.update_one(
            {'visitor_id': payload.visitor_id}, {'$setOnInsert': {'visitor_id': payload.visitor_id, 'first_seen_at': now}},
            upsert=True,
        )
        new_visitor = seen.upserted_id is not None
        if new_visitor:
            # A landing recorded by the legacy tracker before this session means they were here before.
            earlier = await db.acquisition_visits.find_one(
                {'visitor_id': payload.visitor_id, 'created_at': {'$lt': now - timedelta(minutes=5)}}, {'_id': 1},
            )
            new_visitor = earlier is None
    await db.acquisition_sessions.update_one(
        {'session_id': session_id},
        {
            '$setOnInsert': {
                'session_id': session_id, 'visitor_id': payload.visitor_id, 'started_at': now,
                'entry_path': route, 'entry_page_key': page_key,
                'source_key': session['source_key'], 'medium': session['medium'],
                'campaign': session['campaign'], 'referrer_host': session.get('referrer_host', ''),
                'device_type': session['device_type'], 'is_new_visitor': new_visitor,
                'user_state_start': state, 'is_staff': False, 'is_test': is_test_account(user),
                'engaged_ms': 0,
            },
            '$set': {'last_seen_at': now, 'last_path': route, 'last_page_key': page_key, 'user_state_last': state},
            '$inc': {'views': 1},
            '$push': {'path_keys': {'$each': [page_key], '$slice': -15}},
        },
        upsert=True,
    )
    return {'ok': True}


@public_router.post('/engagement')
async def track_engagement(payload: EngagementInput):
    """Visible time on a page; only ever increases, so retries cannot double count."""
    from deps import get_db
    db = get_db()
    before = await db.acquisition_page_views.find_one_and_update(
        {'view_id': payload.view_id}, {'$max': {'engaged_ms': payload.engaged_ms}},
        projection={'_id': 0, 'session_id': 1, 'engaged_ms': 1},
    )
    if before is None:
        return {'ok': True}
    delta = payload.engaged_ms - int(before.get('engaged_ms') or 0)
    if delta > 0:
        await db.acquisition_sessions.update_one({'session_id': before['session_id']}, {'$inc': {'engaged_ms': delta}})
    return {'ok': True}


@public_router.post('/event')
async def track_event(payload: EventInput, request: Request):
    if payload.name not in ALLOWED_EVENTS:
        return {'ok': False, 'detail': 'Unsupported event'}
    from deps import get_db
    db = get_db()
    user = await _optional_user(request)
    if is_staff(user):
        return {'ok': True, 'recorded': False}
    page_key, _ = classify_page(payload.page_path or '/')
    session = await db.acquisition_sessions.find_one({'session_id': payload.session_id}, {'_id': 0, 'source_key': 1})
    await db.acquisition_events.update_one(
        {'dedupe': f'{payload.session_id}:{payload.name}'},
        {'$setOnInsert': {
            'dedupe': f'{payload.session_id}:{payload.name}', 'name': payload.name,
            'visitor_id': payload.visitor_id, 'session_id': payload.session_id, 'page_key': page_key,
            'source_key': (session or {}).get('source_key', 'unknown'), 'user_state': visitor_state(user),
            'is_test': is_test_account(user), 'created_at': _now(),
        }},
        upsert=True,
    )
    return {'ok': True}


@public_router.post('/game-start')
async def track_paid_game_start(payload: PaidGameStartInput, request: Request):
    """Record an opted-in, authenticated paid-game start after the official-attempt control is used.

    The server verifies ticket ownership and deduplicates the browser-generated start id. The
    event contains no ticket id, IP address, email, user-agent or answer data.
    """
    from deps import get_db
    from fastapi import HTTPException
    db = get_db()
    user = await _optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    if is_staff(user) or is_test_account(user):
        return {'ok': True, 'recorded': False}
    ticket = await db.tickets.find_one(
        {'ticket_id': payload.ticket_id, 'user_id': user['user_id']}, {'_id': 0, 'contest_id': 1})
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    dedupe = f'paid_game_start:{user["user_id"]}:{payload.start_id}'
    await db.acquisition_events.update_one(
        {'dedupe': dedupe},
        {'$setOnInsert': {
            'dedupe': dedupe, 'name': 'paid_game_start', 'user_id': user['user_id'],
            'contest_id': ticket['contest_id'], 'created_at': _now(), 'user_state': visitor_state(user),
            'is_staff': False, 'is_test': False,
        }},
        upsert=True,
    )
    return {'ok': True, 'recorded': True}


def _as_utc(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


@public_router.post('/attribute')
async def attribute_registration(payload: AttributeInput, request: Request):
    """Link a freshly registered account to the visitor's first-touch source.

    Server-verified user; only accounts created in the last 24h are eligible, so a
    returning login can never be counted as a new registration. Stores no contact data.
    """
    from deps import get_db
    from fastapi import HTTPException
    db = get_db()
    user = await _optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    if is_staff(user) or is_test_account(user):
        return {'attributed': False, 'reason': 'internal_account'}
    if user.get('phone_verified') is not True or not user.get('terms_accepted_at'):
        return {'attributed': False, 'reason': 'registration_incomplete'}
    now = _now()
    created = _as_utc(user.get('created_at'))
    if created is None or now - created > timedelta(hours=REGISTRATION_JOURNEY_HOURS):
        return {'attributed': False, 'reason': 'not_a_new_registration'}
    if await db.acquisition_attributions.find_one({'user_id': user['user_id']}, {'_id': 1}):
        return {'attributed': False, 'reason': 'already_attributed'}

    first = await db.acquisition_sessions.find_one(
        {'visitor_id': payload.visitor_id, 'started_at': {'$gte': now - timedelta(days=ATTRIBUTION_WINDOW_DAYS)}},
        {'_id': 0}, sort=[('started_at', 1)],
    )
    if not first:
        return {'attributed': False, 'reason': 'no_tracking_data'}
    doc = {
        'user_id': user['user_id'], 'visitor_id': payload.visitor_id,
        'session_id': first['session_id'], 'registration_session_id': payload.session_id,
        'source_key': first.get('source_key', 'other'), 'medium': first.get('medium', '(none)'),
        'campaign': first.get('campaign', '(none)'), 'landing_path': first.get('entry_path', '/'),
        'landing_page_key': first.get('entry_page_key', 'other'), 'device_type': first.get('device_type', 'unknown'),
        'user_created_at': created, 'attributed_at': now, 'is_test': False,
    }
    try:
        await db.acquisition_attributions.insert_one(doc)
    except Exception:
        return {'attributed': False, 'reason': 'already_attributed'}
    return {'attributed': True, 'source': doc['source_key']}


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
    match = {**match, **await public_traffic_filter(db)}

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
    trend_format = '%Y-%m' if period_label in ('6m', '1y', 'lifetime', 'all_time') else '%Y-%m-%d'
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
    q = {**q, **await public_traffic_filter(db)}
    if source:
        q['source'] = source

    skip = max(0, int(skip))
    limit = max(1, min(int(limit), 200))

    total = await db.acquisition_visits.count_documents(q)
    docs = await db.acquisition_visits.find(
        q, {'_id': 0, 'visit_id': 1, 'created_at': 1, 'source': 1, 'channel': 1,
            'utm_medium': 1, 'utm_campaign': 1, 'landing_path': 1, 'referrer_host': 1,
            'device_type': 1, 'browser': 1, 'os': 1},
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
    query = {**query, **await public_traffic_filter(db)}
    skip = max(0, int(skip))
    limit = max(1, min(int(limit), 500))
    total = await db.acquisition_page_views.count_documents(query)
    pages = await db.acquisition_page_views.find(query, {
        '_id': 0, 'view_id': 1, 'created_at': 1, 'page_path': 1, 'page_key': 1,
        'visitor_id': 1, 'source_key': 1, 'device_type': 1, 'user_state': 1,
    }).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    return {'page_views': pages, 'total': total, 'skip': skip, 'limit': limit, 'period': period_label}
