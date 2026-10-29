"""Admin acquisition analytics (reports). Read-only; admin-only; no PII is returned.

All counts come from first-party collections written by acquisition_routes
(acquisition_page_views / acquisition_sessions / acquisition_events /
acquisition_attributions) plus authoritative user and gameplay records.
Impressions from external platforms are never derived from page views.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from auth import require_admin
from services.analytics_common import (
    ALL_TIME_START, PAGE_LABELS, REPORT_TZ_NAME, SOURCE_LABELS, resolve_range,
)
from services.analytics_events import (
    excluded_user_ids, public_traffic_filter, user_game_activity,
)

router = APIRouter(prefix='/api/admin/acquisition/analytics', tags=['admin-acquisition-analytics'])

BOUNCE_MS = 10_000
SESSION_IDLE_MS = 30 * 60 * 1000
MAX_COHORT = 50_000

DEFINITIONS = {
    'page_views': 'Every SPA route change counted once by view id; re-renders and reloads of the same view are not added.',
    'unique_page_views': 'Distinct (session, page) pairs.',
    'sessions': 'A browser session; a new one starts after 30 minutes of inactivity.',
    'unique_visitors': 'Distinct anonymous browser ids (first-party, no personal data).',
    'new_visitors': 'Visitors whose first ever recorded session falls in the period.',
    'returning_visitors': 'Visitors seen before the period, or with an earlier landing recorded.',
    'bounce_rate': 'Sessions with exactly one page view and under 10 seconds of visible engagement, divided by sessions.',
    'exits': 'The last observed page of sessions idle for at least 30 minutes; this is a first-party inactivity estimate, not an unload beacon.',
    'average_engagement_time': 'Visible (foreground) time on pages, summed per session and averaged over all sessions.',
    'pages_per_session': 'Page views divided by sessions.',
    'registrations': 'Accounts created in the period (server records). Staff and test accounts excluded.',
    'attributed_registrations': 'Registrations linked to a tracked visit within 24h of account creation (first-touch).',
    'game_start': 'First recorded attempt/session in Free World, Champion, Special Challenge or a paid game score.',
    'timezone': REPORT_TZ_NAME,
}

IMPRESSIONS = {
    'status': 'not_connected',
    'message': 'Impressions come only from authorised platform integrations. None are connected, so no value is shown.',
    'platforms': {name: 'not_connected' for name in ('instagram', 'x_twitter', 'google_search', 'facebook', 'tiktok', 'youtube')},
}


def _parse(range: str, start: Optional[str], end: Optional[str], source: Optional[str], campaign: Optional[str],
           device: Optional[str], page: Optional[str]) -> dict:
    r = resolve_range(range, start, end)
    if page and page not in PAGE_LABELS:
        raise HTTPException(status_code=400, detail='Unknown page key')
    return {'range': r, 'source': source, 'campaign': campaign, 'device': device, 'page': page}


def _view_match(f: dict) -> dict:
    r = f['range']
    m = {'created_at': {'$gte': r['start'], '$lt': r['end']}, 'session_id': {'$exists': True}, 'is_test': {'$ne': True}}
    if f['source']:
        m['source_key'] = f['source']
    if f['campaign']:
        m['campaign'] = f['campaign']
    if f['device']:
        m['device_type'] = f['device']
    if f['page']:
        m['page_key'] = f['page']
    return m


async def _session_match(db, f: dict, vm: dict) -> dict:
    r = f['range']
    m = {'started_at': {'$gte': r['start'], '$lt': r['end']}, **await public_traffic_filter(db, 'started_at')}
    if f['source']:
        m['source_key'] = f['source']
    if f['campaign']:
        m['campaign'] = f['campaign']
    if f['device']:
        m['device_type'] = f['device']
    if f['page']:
        m['session_id'] = {'$in': await db.acquisition_page_views.distinct('session_id', vm)}
    return m


async def _view_match_for(db, f: dict) -> dict:
    return {**_view_match(f), **await public_traffic_filter(db, 'created_at')}


def _attr_match(f: dict) -> dict:
    r = f['range']
    m = {'user_created_at': {'$gte': r['start'], '$lt': r['end']}, 'is_test': {'$ne': True}}
    if f['source']:
        m['source_key'] = f['source']
    if f['campaign']:
        m['campaign'] = f['campaign']
    if f['device']:
        m['device_type'] = f['device']
    if f['page']:
        m['landing_page_key'] = f['page']
    return m


def _filtered(f: dict) -> bool:
    return bool(f['source'] or f['campaign'] or f['device'] or f['page'])


async def _count_distinct(db, coll: str, match: dict, key: str) -> int:
    rows = await db[coll].aggregate([{'$match': match}, {'$group': {'_id': f'${key}'}}, {'$count': 'n'}]).to_list(1)
    return rows[0]['n'] if rows else 0


def _pct(num, den) -> Optional[float]:
    return round(100.0 * num / den, 1) if den else None


async def public_view_match(db, period: str, start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Mongo filter for public page views in a period (staff and test traffic excluded)."""
    return await _view_match_for(db, _parse(period, start, end, None, None, None, None))


async def traffic_totals(db, period: str, start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Public-traffic headline numbers; the single definition shared by dashboards and these reports."""
    f = _parse(period, start, end, None, None, None, None)
    vm = await _view_match_for(db, f)
    r = f['range']
    visit_match = {'created_at': {'$gte': r['start'], '$lt': r['end']}, **await public_traffic_filter(db)}
    legacy = {k: v for k, v in vm.items() if k != 'session_id'}
    return {
        'page_views': await db.acquisition_page_views.count_documents(vm),
        'unique_visitors': await _count_distinct(db, 'acquisition_page_views', vm, 'visitor_id'),
        'sessions': await db.acquisition_sessions.count_documents(await _session_match(db, f, vm)),
        'visits': await db.acquisition_visits.count_documents(visit_match),
        'page_views_before_session_tracking': await db.acquisition_page_views.count_documents(
            {**legacy, 'session_id': {'$exists': False}}),
    }


async def signup_breakdown(db, f: dict) -> dict:
    """Accounts created in range by sign-up method, plus influencer-link visits and registrations per link."""
    r = f['range']
    created = {} if r['start'] == ALL_TIME_START else {'created_at': {'$gte': r['start'], '$lt': r['end']}}
    base = {**created, 'user_id': {'$nin': await excluded_user_ids(db)}}
    complete = {'phone_verified': True, 'terms_accepted_at': {'$exists': True, '$ne': None}}
    google = await db.users.count_documents({**base, 'method': 'google'})
    google_complete = await db.users.count_documents({**base, 'method': 'google', **complete})
    total = await db.users.count_documents(base)
    links: dict = {}
    async for row in db.influencer_visits.aggregate([
        {'$match': created}, {'$group': {'_id': '$promo_id', 'visits': {'$sum': 1}, 'visitors': {'$addToSet': '$visitor_id'}}},
    ]):
        links[row['_id']] = {'visits': row['visits'], 'unique_visitors': len(row['visitors']), 'signups': 0}
    async for row in db.influencer_attributions.aggregate([
        {'$match': created}, {'$group': {'_id': '$promo_id', 'signups': {'$sum': 1}}},
    ]):
        links.setdefault(row['_id'], {'visits': 0, 'unique_visitors': 0, 'signups': 0})['signups'] = row['signups']
    promos = {p['promo_id']: p async for p in db.influencer_promos.find(
        {'promo_id': {'$in': list(links)}}, {'_id': 0, 'promo_id': 1, 'code': 1, 'influencer_id': 1})}
    rows = [{'promo_id': pid, 'code': promos.get(pid, {}).get('code') or pid, **v} for pid, v in links.items()]
    rows.sort(key=lambda x: (-x['signups'], -x['visits']))
    return {
        'accounts_created': total, 'email': total - google, 'google': google, 'google_completed': google_complete,
        'influencer_links': rows[:50],
        'influencer_totals': {key: sum(x[key] for x in rows) for key in ('visits', 'signups')},
    }


async def _cohort(db, f: dict) -> list:
    """User ids registered in range (all, or only those attributed when a filter is active)."""
    r = f['range']
    if _filtered(f):
        rows = await db.acquisition_attributions.find(_attr_match(f), {'_id': 0, 'user_id': 1}).to_list(MAX_COHORT)
        return [x['user_id'] for x in rows]
    excluded = await excluded_user_ids(db)
    rows = await db.users.find(
        {'created_at': {'$gte': r['start'], '$lt': r['end']}, 'user_id': {'$nin': excluded},
         'phone_verified': True, 'terms_accepted_at': {'$exists': True, '$ne': None}},
        {'_id': 0, 'user_id': 1},
    ).to_list(MAX_COHORT)
    return [x['user_id'] for x in rows]


@router.get('/overview')
async def overview(request: Request, range: str = '7d', start: Optional[str] = None, end: Optional[str] = None,
                   source: Optional[str] = None, campaign: Optional[str] = None,
                   device: Optional[str] = None, page: Optional[str] = None):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    f = _parse(range, start, end, source, campaign, device, page)
    vm = await _view_match_for(db, f)
    sm = await _session_match(db, f, vm)

    total_views = await db.acquisition_page_views.count_documents(vm)
    unique_visitors = await _count_distinct(db, 'acquisition_page_views', vm, 'visitor_id')
    unique_page_views = (await db.acquisition_page_views.aggregate([
        {'$match': vm}, {'$group': {'_id': {'s': '$session_id', 'p': '$page_key'}}}, {'$count': 'n'},
    ]).to_list(1) or [{'n': 0}])[0]['n']

    sess = (await db.acquisition_sessions.aggregate([
        {'$match': sm},
        {'$group': {
            '_id': None, 'sessions': {'$sum': 1}, 'views': {'$sum': '$views'}, 'engaged': {'$sum': '$engaged_ms'},
            'bounces': {'$sum': {'$cond': [{'$and': [{'$eq': ['$views', 1]}, {'$lt': ['$engaged_ms', BOUNCE_MS]}]}, 1, 0]}},
        }},
    ]).to_list(1) or [{'sessions': 0, 'views': 0, 'engaged': 0, 'bounces': 0}])[0]
    sessions = sess['sessions']

    new_returning = {'new': 0, 'returning': 0, 'unknown': 0}
    async for row in db.acquisition_sessions.aggregate([
        {'$match': sm},
        {'$group': {'_id': '$visitor_id', 'first_session': {'$min': '$started_at'},
                    'new_flag': {'$max': {'$cond': ['$is_new_visitor', 1, 0]}}}},
        {'$lookup': {'from': 'acquisition_visitors', 'localField': '_id', 'foreignField': 'visitor_id', 'as': 'visitor'}},
        {'$addFields': {'first_seen_at': {'$ifNull': [{'$arrayElemAt': ['$visitor.first_seen_at', 0]}, None]}}},
        {'$addFields': {'classification': {'$switch': {
            'branches': [
                {'case': {'$ne': ['$first_seen_at', None]}, 'then': {'$cond': [
                    {'$gte': ['$first_seen_at', f['range']['start']]}, 'new', 'returning']}},
                {'case': {'$eq': ['$new_flag', 1]}, 'then': 'new'},
                {'case': {'$ne': ['$first_session', None]}, 'then': 'returning'},
            ], 'default': 'unknown',
        }}}},
        {'$group': {'_id': '$classification', 'n': {'$sum': 1}}},
    ]):
        if row['_id'] in new_returning:
            new_returning[row['_id']] = row['n']

    states = {'anonymous': 0, 'registered': 0, 'verified': 0}
    async for row in db.acquisition_page_views.aggregate([
        {'$match': vm}, {'$group': {'_id': {'s': '$user_state', 'v': '$visitor_id'}}},
        {'$group': {'_id': '$_id.s', 'n': {'$sum': 1}}},
    ]):
        if row['_id'] in states:
            states[row['_id']] = row['n']

    r = f['range']
    cohort = await _cohort(db, f)
    if _filtered(f):
        total_regs = len(cohort)
    else:
        excluded = await excluded_user_ids(db)
        total_regs = await db.users.count_documents(
            {'created_at': {'$gte': r['start'], '$lt': r['end']}, 'user_id': {'$nin': excluded},
             'phone_verified': True, 'terms_accepted_at': {'$exists': True, '$ne': None}})
    attributed = await db.acquisition_attributions.count_documents(_attr_match(f))
    verification_match = {
        'phone_verified': True,
        'phone_verified_at': {'$gte': r['start'], '$lt': r['end']},
        'terms_accepted_at': {'$exists': True, '$ne': None},
        'user_id': {'$in': cohort} if _filtered(f) else {'$nin': excluded},
    }
    verified = await db.users.count_documents(verification_match)
    activity = await user_game_activity(db, cohort)
    first_game = sum(1 for a in activity.values() if a['first_start'] is not None)

    monthly_trend = (r['end'] - r['start']).days > 400
    trend = [
        {'day': row['_id'], 'views': row['views'], 'sessions': len(row['sessions'])}
        async for row in db.acquisition_page_views.aggregate([
            {'$match': vm},
            {'$group': {'_id': {'$dateToString': {'format': '%Y-%m' if monthly_trend else '%Y-%m-%d', 'date': '$created_at', 'timezone': REPORT_TZ_NAME}},
                        'views': {'$sum': 1}, 'sessions': {'$addToSet': '$session_id'}}},
            {'$sort': {'_id': 1}},
        ])
    ]
    first_row = await db.acquisition_sessions.find_one(
        {'is_staff': {'$ne': True}, 'is_test': {'$ne': True}},
        {'_id': 0, 'started_at': 1}, sort=[('started_at', 1)])
    return {
        'range': {'label': r['label'], 'timezone': r['timezone'], 'start': r['start'].isoformat(), 'end': r['end'].isoformat()},
        'filters': {k: f[k] for k in ('source', 'campaign', 'device', 'page')},
        'tracking_started_at': first_row['started_at'].isoformat() if first_row else None,
        'metrics': {
            'total_page_views': total_views,
            'unique_page_views': unique_page_views,
            'total_sessions': sessions,
            'unique_visitors': unique_visitors,
            'new_visitors': new_returning['new'],
            'returning_visitors': new_returning['returning'],
            'visitors_first_seen_unknown': new_returning['unknown'],
            'total_registrations': total_regs,
            'attributed_registrations': attributed,
            'completed_phone_verifications': verified,
            'visitor_to_registration_rate': _pct(attributed, unique_visitors),
            'registration_to_first_game_rate': _pct(first_game, len(cohort)),
            'bounce_rate': _pct(sess['bounces'], sessions),
            'average_engagement_seconds': round(sess['engaged'] / sessions / 1000, 1) if sessions else None,
            'pages_per_session': round(sess['views'] / sessions, 2) if sessions else None,
            'registered_cohort_size': len(cohort),
            'registered_cohort_started_game': first_game,
        },
        'visitor_states': states,
        'signups': await signup_breakdown(db, f),
        'impressions': IMPRESSIONS,
        'trend': trend,
        'definitions': DEFINITIONS,
        'notes': [
            'Session analytics start when tracking was deployed; earlier page views have no session data and are not included.',
            'Staff activity is recorded separately and never appears here. Anonymous staff visits before deployment cannot be identified.',
            'Legacy visitors with no first-seen record are counted separately as unknown, not guessed to be new or returning.',
        ],
    }


async def _sources_rows(db, f: dict) -> list:
    vm = await _view_match_for(db, f)
    sm = await _session_match(db, f, vm)
    rows: dict = {}

    def key_of(d):
        return (d.get('source_key') or 'other', d.get('medium') or '(none)', d.get('campaign') or '(none)',
                d.get('landing_page_key') or 'other')

    async for row in db.acquisition_sessions.aggregate([
        {'$match': sm},
        {'$group': {'_id': {'s': '$source_key', 'm': '$medium', 'c': '$campaign', 'l': '$entry_page_key'},
                    'sessions': {'$sum': 1}, 'views': {'$sum': '$views'}, 'visitors': {'$addToSet': '$visitor_id'}}},
        {'$project': {'sessions': 1, 'views': 1, 'unique_visitors': {'$size': '$visitors'}}},
        {'$limit': 2000},
    ]):
        i = row['_id']
        rows[key_of({'source_key': i['s'], 'medium': i['m'], 'campaign': i['c'], 'landing_page_key': i['l']})] = {
            'sessions': row['sessions'], 'page_views': row['views'], 'unique_visitors': row['unique_visitors'],
            'registrations': 0, 'game_starts': 0,
        }
    attrs = await db.acquisition_attributions.find(_attr_match(f), {'_id': 0}).to_list(MAX_COHORT)
    activity = await user_game_activity(db, [a['user_id'] for a in attrs])
    for a in attrs:
        k = key_of(a)
        row = rows.setdefault(k, {'sessions': 0, 'page_views': 0, 'unique_visitors': 0, 'registrations': 0, 'game_starts': 0})
        row['registrations'] += 1
        if activity.get(a['user_id'], {}).get('first_start') is not None:
            row['game_starts'] += 1
    out = []
    for (src, medium, campaign, landing), v in rows.items():
        out.append({
            'source': src, 'source_label': SOURCE_LABELS.get(src, src), 'medium': medium, 'campaign': campaign,
            'landing_page': PAGE_LABELS.get(landing, landing), **v,
            'conversion_rate': _pct(v['registrations'], v['unique_visitors']),
        })
    out.sort(key=lambda x: (-x['sessions'], x['source']))
    return out


@router.get('/sources')
async def sources(request: Request, range: str = '7d', start: Optional[str] = None, end: Optional[str] = None,
                  source: Optional[str] = None, campaign: Optional[str] = None,
                  device: Optional[str] = None, page: Optional[str] = None):
    await require_admin(request)
    from deps import get_db
    f = _parse(range, start, end, source, campaign, device, page)
    return {'range': f['range']['label'], 'timezone': REPORT_TZ_NAME, 'rows': await _sources_rows(get_db(), f)}


async def _pages_rows(db, f: dict) -> list:
    vm = await _view_match_for(db, f)
    sm = await _session_match(db, f, vm)
    pages: dict = {}
    async for row in db.acquisition_page_views.aggregate([
        {'$match': vm},
        {'$group': {'_id': {'k': '$page_key', 'p': '$page_path'}, 'views': {'$sum': 1},
                    'visitors': {'$addToSet': '$visitor_id'}, 'sessions': {'$addToSet': '$session_id'},
                    'entrances': {'$sum': {'$cond': ['$is_entrance', 1, 0]}},
                    'engaged_sum': {'$sum': '$engaged_ms'},
                    'engaged_n': {'$sum': {'$cond': [{'$gt': ['$engaged_ms', 0]}, 1, 0]}}}},
        {'$project': {'views': 1, 'entrances': 1, 'engaged_sum': 1, 'engaged_n': 1,
                      'unique_visitors': {'$size': '$visitors'}, 'sessions': {'$size': '$sessions'}}},
        {'$limit': 2000},
    ]):
        i = row['_id']
        if not i.get('p'):
            continue
        page_key = i.get('k') or 'other'
        pages[i['p']] = {
            'page': i['p'], 'page_key': page_key, 'label': PAGE_LABELS.get(page_key, page_key),
            'views': row['views'], 'unique_visitors': row['unique_visitors'], 'sessions': row['sessions'],
            'entrances': row['entrances'], 'exits': 0,
            'avg_engagement_seconds': round(row['engaged_sum'] / row['engaged_n'] / 1000, 1) if row['engaged_n'] else None,
            'registrations_from_landing': 0, 'previous_page': None, 'next_page': None, 'top_source': None, 'devices': {},
        }
    exit_match = {**sm, 'last_seen_at': {'$lte': datetime.now(timezone.utc) - timedelta(minutes=30)}}
    async for row in db.acquisition_sessions.aggregate([
        {'$match': exit_match}, {'$group': {'_id': '$last_path', 'n': {'$sum': 1}}}]):
        if row['_id'] in pages:
            pages[row['_id']]['exits'] = row['n']
    async for row in db.acquisition_attributions.aggregate([
        {'$match': _attr_match(f)}, {'$group': {'_id': '$landing_path', 'n': {'$sum': 1}}}]):
        if row['_id'] in pages:
            pages[row['_id']]['registrations_from_landing'] = row['n']

    # Most common previous page and traffic source per page.
    for field, into in (('prev_path', 'previous_page'), ('source_key', 'top_source')):
        best: dict = {}
        async for row in db.acquisition_page_views.aggregate([
            {'$match': {**vm, field: {'$nin': ['', None]}}},
            {'$group': {'_id': {'p': '$page_path', 'v': f'${field}'}, 'n': {'$sum': 1}}},
            {'$sort': {'n': -1}}, {'$limit': 5000},
        ]):
            if row['_id'].get('p') and row['_id'].get('v'):
                best.setdefault(row['_id']['p'], row['_id']['v'])
        for p, v in best.items():
            if p in pages:
                pages[p][into] = v
    # "Next page" = most common page whose previous page is this one.
    nxt: dict = {}
    async for row in db.acquisition_page_views.aggregate([
        {'$match': {**vm, 'prev_path': {'$nin': ['', None]}}},
        {'$group': {'_id': {'from': '$prev_path', 'to': '$page_path'}, 'n': {'$sum': 1}}},
        {'$sort': {'n': -1}}, {'$limit': 5000},
    ]):
        if row['_id'].get('from') and row['_id'].get('to'):
            nxt.setdefault(row['_id']['from'], row['_id']['to'])
    for p, to in nxt.items():
        if p in pages:
            pages[p]['next_page'] = to
    async for row in db.acquisition_page_views.aggregate([
        {'$match': vm}, {'$group': {'_id': {'p': '$page_path', 'd': '$device_type'}, 'n': {'$sum': 1}}}]):
        if row['_id'].get('p') in pages:
            pages[row['_id']['p']]['devices'][row['_id'].get('d') or 'unknown'] = row['n']
    return sorted(pages.values(), key=lambda x: -x['views'])


@router.get('/pages')
async def pages(request: Request, range: str = '7d', start: Optional[str] = None, end: Optional[str] = None,
                source: Optional[str] = None, campaign: Optional[str] = None,
                device: Optional[str] = None, page: Optional[str] = None):
    await require_admin(request)
    from deps import get_db
    f = _parse(range, start, end, source, campaign, device, page)
    return {'range': f['range']['label'], 'timezone': REPORT_TZ_NAME, 'rows': await _pages_rows(get_db(), f)}


async def _funnel(db, f: dict) -> dict:
    vm = await _view_match_for(db, f)
    base = {k: v for k, v in vm.items() if k != 'page_key'}

    async def visitors(extra: dict) -> int:
        return await _count_distinct(db, 'acquisition_page_views', {**base, **extra}, 'visitor_id')

    r = f['range']
    event_match = {'name': 'signup_click', 'created_at': {'$gte': r['start'], '$lt': r['end']}, 'is_test': {'$ne': True}}
    if f['source']:
        event_match['source_key'] = f['source']
    signup_clicks = await _count_distinct(db, 'acquisition_events', event_match, 'visitor_id')
    champion_match = {'name': 'champion_view', 'created_at': {'$gte': r['start'], '$lt': r['end']}, 'is_test': {'$ne': True}}
    if f['source']:
        champion_match['source_key'] = f['source']
    champion_opens = await _count_distinct(db, 'acquisition_events', champion_match, 'visitor_id')

    cohort = await _cohort(db, f)
    activity = await user_game_activity(db, cohort)
    verified_users = await db.users.count_documents({'user_id': {'$in': cohort}, 'phone_verified': True}) if cohort else 0

    steps = [
        ('visited_site', 'Visited the website', 'visitors', await visitors({}), None),
        ('world_selection', 'Opened World Selection', 'visitors', await visitors({'page_key': 'world_selection'}), 'visited_site'),
        ('free_world', 'Opened Free World', 'visitors', await visitors({'page_key': 'free_world'}), 'world_selection'),
        ('champion', 'Opened Champion', 'visitors', champion_opens, 'free_world'),
        ('paid_world', 'Opened Paid World', 'visitors', await visitors({'page_key': 'paid_world'}), 'world_selection'),
        ('challenges', 'Opened Special / Impossible Challenges', 'visitors', await visitors({'page_key': 'special_challenges'}), 'world_selection'),
        ('competition', 'Opened a competition', 'visitors', await visitors({'page_key': 'competition_detail'}), 'visited_site'),
        ('signup_click', 'Clicked Sign Up', 'visitors', signup_clicks, 'visited_site'),
        ('registered', 'Completed registration', 'accounts', len(cohort), 'visited_site'),
        ('verified', 'Completed phone verification', 'accounts', verified_users, 'registered'),
        ('first_game', 'Started first game', 'accounts', sum(1 for a in activity.values() if a['first_start']), 'verified'),
        ('free_entry', 'Entered a free contest', 'accounts', sum(1 for a in activity.values() if a['free_entry']), 'first_game'),
        ('paid_entry', 'Entered a paid contest', 'accounts', sum(1 for a in activity.values() if a['paid_entry']), 'first_game'),
        ('completed_game', 'Completed a game', 'accounts', sum(1 for a in activity.values() if a['completed']), 'first_game'),
        ('returned', 'Returned to play on another day', 'accounts', sum(1 for a in activity.values() if len(a['start_days']) >= 2), 'first_game'),
    ]
    counts = {key: n for key, _l, _u, n, _p in steps}
    out = []
    for key, label, unit, n, parent in steps:
        base_n = counts.get(parent) if parent else None
        conv = _pct(n, base_n) if parent else 100.0
        out.append({
            'key': key, 'label': label, 'unit': unit, 'count': n, 'compared_to': parent,
            'conversion_pct': conv,
            'drop_off_pct': round(100.0 - conv, 1) if parent and conv is not None else None,
        })
    return {
        'range': r['label'], 'timezone': REPORT_TZ_NAME, 'steps': out,
        'notes': [
            'Steps up to Sign Up count distinct visitors. Registration onwards counts accounts registered in the period.',
            'Opening a page is not a game start: game starts come from gameplay records, not page views.',
            'Verification and game steps use the registered cohort; unattributed registrations are included unless a filter is active.',
        ],
    }


@router.get('/funnel')
async def funnel(request: Request, range: str = '7d', start: Optional[str] = None, end: Optional[str] = None,
                 source: Optional[str] = None, campaign: Optional[str] = None,
                 device: Optional[str] = None, page: Optional[str] = None):
    await require_admin(request)
    from deps import get_db
    return await _funnel(get_db(), _parse(range, start, end, source, campaign, device, page))


async def _journeys(db, f: dict, limit: int = 25) -> list:
    vm = await _view_match_for(db, f)
    sm = await _session_match(db, f, vm)
    out = []
    async for row in db.acquisition_sessions.aggregate([
        {'$match': sm},
        {'$group': {'_id': {'s': '$source_key', 'p': '$path_keys'}, 'sessions': {'$sum': 1}}},
        {'$sort': {'sessions': -1}}, {'$limit': limit},
    ]):
        labels = []
        for key in row['_id']['p'] or []:
            lab = PAGE_LABELS.get(key, key)
            if not labels or labels[-1] != lab:
                labels.append(lab)
        out.append({'journey': ' \u2192 '.join([SOURCE_LABELS.get(row['_id']['s'], row['_id']['s'])] + labels),
                    'sessions': row['sessions']})
    return out


@router.get('/journeys')
async def journeys(request: Request, range: str = '7d', start: Optional[str] = None, end: Optional[str] = None,
                   source: Optional[str] = None, campaign: Optional[str] = None,
                   device: Optional[str] = None, page: Optional[str] = None):
    await require_admin(request)
    from deps import get_db
    f = _parse(range, start, end, source, campaign, device, page)
    return {'range': f['range']['label'], 'timezone': REPORT_TZ_NAME, 'rows': await _journeys(get_db(), f)}


@router.get('/events')
async def events(request: Request, range: str = '7d', start: Optional[str] = None, end: Optional[str] = None,
                 source: Optional[str] = None, campaign: Optional[str] = None, device: Optional[str] = None,
                 page: Optional[str] = None, skip: int = 0, limit: int = 50):
    """Paginated page-view log. No user id, no IP, no user agent."""
    await require_admin(request)
    from deps import get_db
    db = get_db()
    f = _parse(range, start, end, source, campaign, device, page)
    vm = await _view_match_for(db, f)
    skip, limit = max(0, int(skip)), max(1, min(int(limit), 200))
    total = await db.acquisition_page_views.count_documents(vm)
    rows = await db.acquisition_page_views.find(vm, {
        '_id': 0, 'view_id': 1, 'created_at': 1, 'page_path': 1, 'page_key': 1, 'prev_path': 1, 'source_key': 1,
        'device_type': 1, 'user_state': 1, 'engaged_ms': 1, 'is_entrance': 1,
    }).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    return {'total': total, 'skip': skip, 'limit': limit, 'timezone': REPORT_TZ_NAME, 'rows': rows}


EXPORTS = {
    'pages': ('page', 'label', 'views', 'unique_visitors', 'sessions', 'entrances', 'exits', 'avg_engagement_seconds',
              'registrations_from_landing', 'previous_page', 'next_page', 'top_source'),
    'sources': ('source_label', 'medium', 'campaign', 'landing_page', 'sessions', 'unique_visitors',
                'registrations', 'conversion_rate', 'game_starts', 'page_views'),
    'funnel': ('label', 'unit', 'count', 'compared_to', 'conversion_pct', 'drop_off_pct'),
    'journeys': ('journey', 'sessions'),
}


def _csv_cell(value):
    """Neutralise spreadsheet formula injection from user-influenced text."""
    if value is None:
        return ''
    if isinstance(value, str) and value[:1] in ('=', '+', '-', '@'):
        return "'" + value
    return value


@router.get('/export')
async def export_csv(request: Request, report: str, range: str = '7d', start: Optional[str] = None,
                     end: Optional[str] = None, source: Optional[str] = None, campaign: Optional[str] = None,
                     device: Optional[str] = None, page: Optional[str] = None):
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin or super admin can export analytics')
    if report not in EXPORTS:
        raise HTTPException(status_code=400, detail=f'report must be one of {", ".join(EXPORTS)}')
    from deps import get_db
    db = get_db()
    f = _parse(range, start, end, source, campaign, device, page)
    producer = {'pages': _pages_rows, 'sources': _sources_rows, 'journeys': _journeys}.get(report)
    data = (await producer(db, f)) if producer else (await _funnel(db, f))['steps']
    buf = io.StringIO()
    buf.write(f'# Prize League {report} report, {f["range"]["label"]}, timezone {REPORT_TZ_NAME}\n')
    writer = csv.writer(buf)
    writer.writerow(EXPORTS[report])
    for row in data:
        writer.writerow([_csv_cell(row.get(c)) for c in EXPORTS[report]])
    return Response(buf.getvalue(), media_type='text/csv',
                    headers={'Content-Disposition': f'attachment; filename="{report}-{f["range"]["label"].replace(" ", "")}.csv"'})
