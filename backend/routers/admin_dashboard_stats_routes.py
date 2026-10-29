"""Admin dashboard: user statistics and wallet/token reporting, plus the authenticated activity ping.

Read-only reporting over existing authoritative records. Nothing here changes a balance;
discrepancies are reported, never silently corrected.
"""
from __future__ import annotations

import csv
import io
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth import get_current_user, require_admin
from services.analytics_common import ALL_TIME_START, REPORT_TZ_NAME, REPORT_TZ, is_staff, is_test_account, resolve_range, utcnow
from services.analytics_events import (
    FREE_ENTRY_SOURCE, GAME_ACTIVITY_SOURCES, GAME_START_SOURCES, public_traffic_filter,
    PAID_ENTRY_SOURCE, distinct_users_with_events, excluded_user_ids,
)

public_router = APIRouter(prefix='/api/activity', tags=['activity'])
router = APIRouter(prefix='/api/admin/dashboard', tags=['admin-dashboard-stats'])

ACTIVE_NOW_MINUTES = 5
PING_THROTTLE_SECONDS = 60
CACHE_SECONDS = 60
_cache: dict = {}


# --------------------------------------------------------------------------- activity ping

class PingInput(BaseModel):
    kind: str = Field(default='presence', max_length=20)


@public_router.post('/ping')
async def activity_ping(payload: PingInput, request: Request):
    """Meaningful authenticated activity (the browser only pings after real interaction).

    Staff and test accounts are never recorded as player activity.
    """
    user = await get_current_user(request)
    if is_staff(user) or is_test_account(user):
        return {'ok': True, 'recorded': False}
    from deps import get_db
    db = get_db()
    now = utcnow()
    day = now.astimezone(REPORT_TZ).date().isoformat()
    await db.user_activity_days.update_one(
        {'user_id': user['user_id'], 'day': day, 'kind': 'presence'},
        {'$setOnInsert': {'user_id': user['user_id'], 'day': day, 'kind': 'presence', 'first_at': now}},
        upsert=True,
    )
    await db.users.update_one(
        {'user_id': user['user_id'], '$or': [
            {'last_active_at': {'$exists': False}},
            {'last_active_at': {'$lt': now - timedelta(seconds=PING_THROTTLE_SECONDS)}},
        ]},
        {'$set': {'last_active_at': now}},
    )
    return {'ok': True, 'recorded': True}


# --------------------------------------------------------------------------- user statistics

def _cached(key: str):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    return None


def _store(key: str, value):
    _cache[key] = (time.monotonic(), value)
    return value


async def _active_users(db, start, end, exclude: list) -> set:
    """Distinct players with a server login, interaction ping or gameplay/entry event in [start, end)."""
    users = set()
    presence = {'user_id': {'$nin': exclude}}
    async for row in db.user_activity_days.aggregate([
        {'$match': {**presence, 'first_at': {'$gte': start, '$lt': end}}},
        {'$group': {'_id': '$user_id'}},
    ]):
        users.add(row['_id'])
    async for row in db.users.find(
        {'user_id': {'$nin': exclude}, 'last_active_at': {'$gte': start, '$lt': end}},
        {'_id': 0, 'user_id': 1},
    ):
        users.add(row['user_id'])
    async for row in db.users.find(
        {'user_id': {'$nin': exclude}, 'fw_last_login_at': {'$gte': start, '$lt': end}},
        {'_id': 0, 'user_id': 1},
    ):
        users.add(row['user_id'])
    users |= await distinct_users_with_events(
        db, [*GAME_ACTIVITY_SOURCES, FREE_ENTRY_SOURCE, PAID_ENTRY_SOURCE], start, end, exclude)
    return users


@router.get('/user-stats')
async def user_stats(request: Request, include_test: bool = False, refresh: bool = False):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    key = f'user-stats:{include_test}'
    if not refresh and (hit := _cached(key)):
        return hit

    exclude = await excluded_user_ids(db, include_test)
    base = {'user_id': {'$nin': exclude}}
    now = utcnow()
    today = resolve_range('today', now=now)
    week = resolve_range('7d', now=now)
    month = resolve_range('30d', now=now)
    end = now + timedelta(seconds=1)

    total = await db.users.count_documents(base)
    verified = await db.users.count_documents({**base, 'phone_verified': True})
    new_today = await db.users.count_documents({**base, 'created_at': {'$gte': today['start'], '$lt': today['end']}})
    new_week = await db.users.count_documents({**base, 'created_at': {'$gte': week['start'], '$lt': week['end']}})

    active_now_ids = set()
    since = now - timedelta(minutes=ACTIVE_NOW_MINUTES)
    async for row in db.users.find({**base, '$or': [
        {'last_active_at': {'$gte': since}}, {'fw_last_login_at': {'$gte': since}},
    ]}, {'_id': 0, 'user_id': 1}):
        active_now_ids.add(row['user_id'])
    active_now_ids |= await distinct_users_with_events(db, [*GAME_ACTIVITY_SOURCES], since, end, exclude)

    dau = await _active_users(db, today['start'], end, exclude)
    wau = await _active_users(db, week['start'], end, exclude)
    mau = await _active_users(db, month['start'], end, exclude)

    def mode(sources):
        return distinct_users_with_events(db, sources, today['start'], end, exclude)

    free_world = await mode([s for s in GAME_START_SOURCES if s[0] in ('world_level_attempts', 'world_champion_sessions')])
    paid_world = await mode([s for s in GAME_ACTIVITY_SOURCES if s[0] in ('acquisition_events', 'game_scores')])
    challenges = await mode([s for s in GAME_START_SOURCES if s[0] == 'special_challenge_attempts'])
    paid_entries = await mode([PAID_ENTRY_SOURCE])
    free_entries = await mode([FREE_ENTRY_SOURCE])

    first_ping = await db.user_activity_days.find_one({}, {'_id': 0, 'first_at': 1}, sort=[('first_at', 1)])
    result = {
        'timezone': REPORT_TZ_NAME,
        'generated_at': now.isoformat(),
        'registrations': {
            'total': total, 'new_today': new_today, 'new_last_7_days': new_week,
            'verified': verified, 'unverified': total - verified,
        },
        'activity': {
            'currently_active': len(active_now_ids), 'dau': len(dau), 'wau': len(wau), 'mau': len(mau),
        },
        'active_players_today': {
            'free_world': len(free_world), 'paid_world': len(paid_world), 'impossible_challenges': len(challenges),
        },
        'entering_today': {'paid_competitions': len(paid_entries), 'free_competitions': len(free_entries)},
        'definitions': {
            'currently_active': f'Authenticated user with a server login, real interaction ping or game start in the last {ACTIVE_NOW_MINUTES} minutes.',
            'dau_wau_mau': 'Distinct users with a server login, interaction ping or game/contest event: today (UK day), the last 7 UK days, the last 30 UK days.',
            'excluded': 'Staff roles (server-verified)' + ('' if include_test else ' and flagged test accounts') + ' are never counted.',
            'new_last_7_days': 'Rolling 7 UK days including today.',
        },
        'data_notes': [
            'Interaction pings start when this release is deployed' + (
                f' (first recorded {first_ping["first_at"].isoformat()}).' if first_ping else ' (none recorded yet).'),
            'Before that, activity is derived only from gameplay and entry records, so DAU/WAU/MAU from earlier dates count players, not every visit.',
            'Paid-game start events begin with opt-in tracking; earlier paid starts cannot be inferred exactly from completed score timestamps.',
        ],
    }
    return _store(key, result)


# --------------------------------------------------------------------------- wallet report

@router.get('/world-activity')
async def world_activity(request: Request, period: str = '30d', world: str = 'all',
                         contest_id: Optional[str] = None, game_id: Optional[str] = None,
                         start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Read-only world activity assembled from persisted visits, starts, entries, spends and awards."""
    await require_admin(request)
    from deps import get_db
    db = get_db()
    worlds = ('free_world', 'paid_world', 'impossible_challenges')
    if world != 'all' and world not in worlds:
        raise HTTPException(status_code=400, detail='Unsupported world')
    date_range = resolve_range(period, start_date, end_date)
    excluded = await excluded_user_ids(db)
    start, end = date_range['start'], date_range['end']

    async def event_count(collection, field, extra=None):
        return await db[collection].count_documents({field: {'$gte': start, '$lt': end},
            'user_id': {'$nin': excluded}, **(extra or {})})

    async def distinct_ids(sources):
        values = set()
        for collection, field, extra in sources:
            match = {field: {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}, **extra}
            async for row in db[collection].aggregate([{'$match': match}, {'$group': {'_id': '$user_id'}}]):
                if row.get('_id'):
                    values.add(row['_id'])
        return values

    async def transaction_spend(tx_ids=None, ref_pattern=None):
        match = {'kind': 'spend', 'created_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}}
        if tx_ids is not None:
            if not tx_ids:
                return {'topup_tokens': 0.0, 'winning_tokens': 0.0, 'winning_bonus_tokens': 0.0,
                        'bonus_tokens': 0.0, 'total': 0.0, 'unclassified_transactions': 0}
            match['tx_id'] = {'$in': tx_ids}
        if ref_pattern:
            match['ref_order_id'] = {'$regex': ref_pattern}
        rows = await db.wallet_tx.aggregate([
            {'$match': match},
            {'$group': {'_id': None, 'topup': {'$sum': {'$abs': {'$ifNull': ['$purchased_amount', 0]}}},
                        'winning': {'$sum': {'$abs': {'$ifNull': ['$withdrawable_amount', 0]}}},
                        'winning_bonus': {'$sum': {'$abs': {'$ifNull': ['$winning_bonus_amount', 0]}}},
                        'bonus': {'$sum': {'$abs': {'$ifNull': ['$bonus_amount', 0]}}},
                        'total': {'$sum': {'$abs': '$amount'}}, 'count': {'$sum': 1},
                        'classified': {'$sum': {'$cond': [{'$and': [
                            {'$isNumber': '$purchased_amount'}, {'$isNumber': '$withdrawable_amount'},
                            {'$isNumber': '$winning_bonus_amount'}, {'$isNumber': '$bonus_amount'}]}, 1, 0]}}}},
        ]).to_list(1)
        row = rows[0] if rows else {}
        return {'topup_tokens': round(float(row.get('topup') or 0), 2),
                'winning_tokens': round(float(row.get('winning') or 0), 2),
                'winning_bonus_tokens': round(float(row.get('winning_bonus') or 0), 2),
                'bonus_tokens': round(float(row.get('bonus') or 0), 2),
                'total': round(float(row.get('total') or 0), 2),
                'unclassified_transactions': int(row.get('count', 0) - row.get('classified', 0))}

    async def page_stats(pattern):
        traffic = await public_traffic_filter(db)
        match = {**traffic, 'created_at': {'$gte': start, '$lt': end}, 'page_path': {'$regex': pattern}}
        rows = await db.acquisition_page_views.aggregate([
            {'$match': match},
            {'$group': {'_id': None, 'views': {'$sum': 1},
                        'visitors': {'$addToSet': '$visitor_id'},
                        'registered': {'$addToSet': '$user_id'},
                        'sessions': {'$addToSet': '$session_id'},
                        'last_activity': {'$max': '$created_at'}}},
        ]).to_list(1)
        row = rows[0] if rows else {}
        visitors = {v for v in row.get('visitors', []) if v}
        registered = {v for v in row.get('registered', []) if v and v not in excluded}
        return {'page_views': int(row.get('views', 0)), 'unique_visitors': len(visitors),
                'visits': len({v for v in row.get('sessions', []) if v}),
                'unique_registered_visitors': len(registered), 'last_activity': row.get('last_activity')}

    async def build_world(name):
        if name == 'free_world':
            starts = [('world_level_attempts', 'created_at', {}), ('world_champion_sessions', 'begun_at', {})]
            completed = [('world_level_attempts', 'completed_at', {}),
                         ('world_champion_sessions', 'submitted_at', {})]
            start_count = sum([await event_count(c, f, x) for c, f, x in starts])
            complete_count = sum([await event_count(c, f, x) for c, f, x in completed])
            entries_match = {'entered_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}}
            entries = await db.world_contest_entries.count_documents(entries_match)
            reservations = await db.world_level_unlock_reservations.find(
                {'created_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}, 'wallet_tx_id': {'$exists': True}},
                {'_id': 0, 'wallet_tx_id': 1}).to_list(50000)
            retries = await db.world_token_retry_reservations.find(
                {'paid_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}, 'wallet_tx_id': {'$exists': True}},
                {'_id': 0, 'wallet_tx_id': 1}).to_list(50000)
            tx_ids = [r['wallet_tx_id'] for r in [*reservations, *retries]]
            spend = await transaction_spend(tx_ids=tx_ids)
            unique = await distinct_ids(starts)
            win_rows = await db.world_winner_awards.aggregate([
                {'$match': {'created_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}}},
                {'$group': {'_id': None, 'count': {'$sum': 1}, 'tokens': {'$sum': '$winning_amount'},
                            'last_activity': {'$max': '$created_at'}}},
            ]).to_list(1)
            winnings = win_rows[0] if win_rows else {}
            pages = await page_stats(r'^/(world|free-world)(/|$)')
        elif name == 'paid_world':
            starts = [('acquisition_events', 'created_at', {'name': 'paid_game_start'})]
            completed = [('game_scores', 'created_at', {})]
            if game_id:
                completed[0][2]['game_type'] = game_id
            start_count = sum([await event_count(c, f, x) for c, f, x in starts])
            complete_count = sum([await event_count(c, f, x) for c, f, x in completed])
            ticket_filter = {'created_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}}
            if contest_id:
                ticket_filter['contest_id'] = contest_id
            entries = await db.tickets.count_documents(ticket_filter)
            order_ids = await db.tickets.distinct('order_id', ticket_filter)
            spend = await transaction_spend_by_refs(db, order_ids, start, end, excluded) if order_ids else await transaction_spend(tx_ids=[])
            unique = await distinct_ids(starts + completed)
            winner_match = {'paid_out': True, 'paid_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}}
            if contest_id:
                winner_match['contest_id'] = contest_id
            win_rows = await db.winners.aggregate([
                {'$match': winner_match},
                {'$group': {'_id': None, 'count': {'$sum': 1}, 'cash_tokens': {'$sum': {'$ifNull': ['$prize_cash_amount', '$prize_amount']}},
                            'winning_bonus_tokens': {'$sum': {'$ifNull': ['$prize_bonus_tokens', 0]}},
                            'last_activity': {'$max': '$paid_at'}}},
            ]).to_list(1)
            winnings = win_rows[0] if win_rows else {}
            pages = await page_stats(r'^/(paid-leagues|competition(/.*)?|games(/.*)?|play(/.*)?)$')
        else:
            starts = [('special_challenge_attempts', 'started_at', {})]
            completed = [('special_challenge_attempts', 'completed_at', {})]
            if game_id:
                starts[0][2]['challenge_id'] = game_id
                completed[0][2]['challenge_id'] = game_id
            start_count = await event_count(*starts[0])
            complete_count = await event_count(*completed[0])
            attempt_match = {'started_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}}
            if game_id:
                attempt_match['challenge_id'] = game_id
            attempts = await db.special_challenge_attempts.find(attempt_match, {'_id': 0, 'attempt_id': 1, 'entry_tokens': 1}).to_list(50000)
            entries = len(attempts)
            refs = [f"impossible_challenge_entry:{a['attempt_id']}" for a in attempts]
            spend = await transaction_spend_by_refs(db, refs, start, end, excluded) if refs else await transaction_spend(tx_ids=[])
            unique = await distinct_ids(starts)
            win_match = {'attempt_id': {'$in': [a['attempt_id'] for a in attempts]}, 'reward_status': 'credited'}
            win_rows = await db.special_challenge_rewards.aggregate([
                {'$match': win_match},
                {'$group': {'_id': None, 'count': {'$sum': 1}, 'cash_pence': {'$sum': '$reward_pence'},
                            'last_activity': {'$max': '$credited_at'}}},
            ]).to_list(1)
            winnings = win_rows[0] if win_rows else {}
            pages = await page_stats(r'^/challenge(/.*)?$')

        timestamps = [winnings.get('last_activity'), pages.get('last_activity')]
        for collection, field, extra in starts + completed:
            latest = await db[collection].find_one(
                {field: {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}, **extra},
                {'_id': 0, field: 1}, sort=[(field, -1)])
            if latest:
                timestamps.append(latest.get(field))
        return {
            'world': name, 'period': period, 'range': date_range,
            **pages, 'game_starts': start_count, 'completed_plays': complete_count,
            'unique_players': len(unique), 'repeat_plays': max(0, start_count - len(unique)),
            'entries': entries, 'token_spend_by_category': spend,
            'participants': len(unique), 'revenue_tokens': spend.get('total', 0),
            'conversions': {
                'visitors_to_players_pct': round(100 * len(unique) / pages['unique_visitors'], 2) if pages['unique_visitors'] else None,
                'players_to_completed_pct': round(100 * complete_count / start_count, 2) if start_count else None,
                'players_to_entries_pct': round(100 * entries / len(unique), 2) if unique else None,
            },
            'winnings': {key: value for key, value in winnings.items() if key != '_id'},
            'last_activity': max((t for t in timestamps if t), default=None),
            'visit_to_play_rate': round(100 * len(unique) / pages['unique_visitors'], 2) if pages['unique_visitors'] else None,
        }

    selected = worlds if world == 'all' else (world,)
    return {'range': date_range, 'worlds': {name: await build_world(name) for name in selected}}


def _token_card(row: dict, end, now) -> dict:
    """Period activity plus the balance at the period end (closing balance, or today's when the period reaches now)."""
    closing = row.get('period_closing_balance')
    if closing is not None:
        remaining, basis = closing, 'period_end'
    elif end >= now:
        remaining, basis = row.get('current_remaining'), 'current'
    else:
        remaining, basis = None, 'unavailable_legacy_history'
    return {
        'issued': row.get('period_credits'), 'used': row.get('period_spent'), 'expired': row.get('period_expired'),
        'withdrawn': row.get('period_withdrawn'), 'refunded_back': row.get('period_refunds'),
        'reversed': row.get('period_reversals'), 'admin_added': row.get('period_admin_positive'),
        'admin_removed': row.get('period_admin_negative'), 'remaining': remaining, 'remaining_basis': basis,
        'current_remaining': row.get('current_remaining'), 'holders': row.get('holders'),
        'reconciliation': row.get('reconciliation'),
    }


@router.get('/business-review')
async def business_review(request: Request, period: str = '7d', start_date: Optional[str] = None,
                          end_date: Optional[str] = None):
    """One period-aware payload for the Business Review cards, composed from the existing reports."""
    admin = await require_admin(request)
    from deps import get_db
    from routers.acquisition_reports_routes import overview as acquisition_overview, traffic_totals
    db = get_db()
    date_range = resolve_range(period, start_date, end_date)
    start, end = date_range['start'], date_range['end']
    now = utcnow()
    excluded = await excluded_user_ids(db)
    base = {'user_id': {'$nin': excluded}}

    everyone = start == ALL_TIME_START  # Full Time also counts legacy accounts that have no created_at
    registered_total = await db.users.count_documents(base if everyone else {**base, 'created_at': {'$lt': end}})
    signups = await db.users.count_documents(base if everyone else {**base, 'created_at': {'$gte': start, '$lt': end}})
    active = await _active_users(db, start, end, excluded)

    topup_match = {**base, 'kind': 'wallet_topup', 'created_at': {'$gte': start, '$lt': end}}
    paid = (await db.payment_transactions.aggregate([
        {'$match': {**topup_match, 'payment_status': 'paid'}},
        {'$group': {'_id': None, 'count': {'$sum': 1}, 'pence': {'$sum': {'$ifNull': ['$amount_received_pence', '$amount']}},
                    'refunded': {'$sum': {'$ifNull': ['$amount_refunded_pence', 0]}},
                    'live_count': {'$sum': {'$cond': [{'$eq': ['$stripe_livemode', True]}, 1, 0]}}}},
    ]).to_list(1) or [{}])[0]
    unpaid = await db.payment_transactions.count_documents({**topup_match, 'payment_status': {'$ne': 'paid'}})

    tokens = None
    if admin.get('role') in ('admin', 'super_admin'):
        accounting = await token_accounting(request, period=period, start_date=start_date, end_date=end_date)
        categories = accounting['categories']
        tokens = {key: _token_card(categories[key], end, now) for key in categories}
        tokens['bonus_tokens']['issued'] = round(
            float(tokens['bonus_tokens']['issued'] or 0) + float(tokens['bonus_tokens']['admin_added'] or 0), 2)
        tokens['bonus_sources'] = accounting.get('bonus_sources')

    acquisition = await acquisition_overview(request, range=period, start=start_date, end=end_date,
                                             source=None, campaign=None, device=None, page=None)
    metrics = acquisition['metrics']
    traffic = await traffic_totals(db, period, start_date, end_date)
    worlds = (await world_activity(request, period=period, world='all', contest_id=None, game_id=None,
                                   start_date=start_date, end_date=end_date))['worlds']
    return {
        'period': period, 'timezone': REPORT_TZ_NAME, 'generated_at': now.isoformat(),
        'range': {'start': start.isoformat(), 'end': end.isoformat(), 'label': date_range['label']},
        'users': {'registered_total': registered_total, 'signups': signups, 'active': len(active)},
        'topups': {
            'count': int(paid.get('count') or 0), 'amount_gbp': round(float(paid.get('pence') or 0) / 100, 2),
            'refunded_gbp': round(float(paid.get('refunded') or 0) / 100, 2),
            'live_stripe_count': int(paid.get('live_count') or 0), 'unpaid_attempts_excluded': unpaid,
        },
        'tokens': tokens,
        'traffic': {**traffic, 'tracking_started_at': acquisition.get('tracking_started_at')},
        'signups': {
            'total': signups, 'conversion_rate': metrics.get('visitor_to_registration_rate'),
            'attributed': metrics.get('attributed_registrations'), **acquisition['signups'],
        },
        'worlds': worlds,
        'definitions': {
            'balances': 'Remaining balances are as of the end of the selected period; issued, used, withdrawn and expired are activity inside the period.',
            'active_users': 'Distinct non-staff users with a login, interaction ping, game or contest event in the period.',
            'conversion_rate': 'Attributed registrations divided by unique visitors in the period.',
            'excluded': 'Admin, Super Admin and other staff roles plus flagged test accounts are excluded.',
        },
    }


async def transaction_spend_by_refs(db, references, start, end, excluded):
    rows = await db.wallet_tx.aggregate([
        {'$match': {'kind': 'spend', 'ref_order_id': {'$in': references},
                    'created_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}}},
        {'$group': {'_id': None, 'topup': {'$sum': {'$abs': {'$ifNull': ['$purchased_amount', 0]}}},
                    'winning': {'$sum': {'$abs': {'$ifNull': ['$withdrawable_amount', 0]}}},
                    'winning_bonus': {'$sum': {'$abs': {'$ifNull': ['$winning_bonus_amount', 0]}}},
                    'bonus': {'$sum': {'$abs': {'$ifNull': ['$bonus_amount', 0]}}},
                    'total': {'$sum': {'$abs': '$amount'}}, 'count': {'$sum': 1},
                    'classified': {'$sum': {'$cond': [{'$and': [
                        {'$isNumber': '$purchased_amount'}, {'$isNumber': '$withdrawable_amount'},
                        {'$isNumber': '$winning_bonus_amount'}, {'$isNumber': '$bonus_amount'}]}, 1, 0]}}}},
    ]).to_list(1)
    row = rows[0] if rows else {}
    return {'topup_tokens': round(float(row.get('topup') or 0), 2),
            'winning_tokens': round(float(row.get('winning') or 0), 2),
            'winning_bonus_tokens': round(float(row.get('winning_bonus') or 0), 2),
            'bonus_tokens': round(float(row.get('bonus') or 0), 2),
            'total': round(float(row.get('total') or 0), 2),
            'unclassified_transactions': int(row.get('count', 0) - row.get('classified', 0))}

def _gbp(pence) -> float:
    return round((pence or 0) / 100.0, 2)


async def _sum(db, coll: str, match: dict, expr: str) -> float:
    rows = await db[coll].aggregate([{'$match': match}, {'$group': {'_id': None, 'n': {'$sum': expr}}}]).to_list(1)
    return float(rows[0]['n']) if rows else 0.0


@router.get('/wallet-report')
async def wallet_report(request: Request, include_staff: bool = False, include_test: bool = False,
                        refresh: bool = False):
    await require_admin(request)
    from deps import get_db
    from routers.wallet_routes import BONUS_TX_KINDS, WITHDRAWABLE_TX_KINDS
    db = get_db()
    key = f'wallet:{include_staff}:{include_test}'
    if not refresh and (hit := _cached(key)):
        return hit

    if include_staff:
        exclude = [] if include_test else [u['user_id'] async for u in db.users.find(
            {'$or': [{'is_test': True}, {'is_test_account': True}]}, {'_id': 0, 'user_id': 1})]
    else:
        exclude = await excluded_user_ids(db, include_test)
    uw = {'user_id': {'$nin': exclude}}
    now = utcnow()

    wallets = (await db.wallets.aggregate([
        {'$match': uw},
        {'$group': {
            '_id': None, 'wallets': {'$sum': 1}, 'balance': {'$sum': '$balance'},
            'known_balance': {'$sum': {'$cond': [{'$and': [
                {'$eq': ['$source_migrated', True]}, {'$isNumber': '$bonus'},
                {'$isNumber': '$withdrawable'}, {'$isNumber': '$withdrawable_pending'},
            ]}, {'$ifNull': ['$balance', 0]}, 0]}},
            'bonus': {'$sum': {'$cond': [{'$and': [
                {'$eq': ['$source_migrated', True]}, {'$isNumber': '$bonus'},
                {'$isNumber': '$withdrawable'}, {'$isNumber': '$withdrawable_pending'},
            ]}, '$bonus', 0]}},
            'withdrawable': {'$sum': {'$cond': [{'$and': [
                {'$eq': ['$source_migrated', True]}, {'$isNumber': '$bonus'},
                {'$isNumber': '$withdrawable'}, {'$isNumber': '$withdrawable_pending'},
            ]}, '$withdrawable', 0]}},
            'winning_bonus': {'$sum': {'$cond': [{'$eq': ['$source_migrated', True]},
                {'$ifNull': ['$winning_bonus', 0]}, 0]}},
            'pending': {'$sum': {'$cond': [{'$and': [
                {'$eq': ['$source_migrated', True]}, {'$isNumber': '$bonus'},
                {'$isNumber': '$withdrawable'}, {'$isNumber': '$withdrawable_pending'},
            ]}, '$withdrawable_pending', 0]}},
            'purchased': {'$sum': {'$cond': [{'$and': [
                {'$eq': ['$source_migrated', True]}, {'$isNumber': '$bonus'},
                {'$isNumber': '$withdrawable'}, {'$isNumber': '$withdrawable_pending'},
            ]}, {'$max': [0, {'$subtract': ['$balance', {'$add': [
                '$bonus', {'$ifNull': ['$winning_bonus', 0]}, '$withdrawable', '$withdrawable_pending']}]}]}, 0]}},
            'source_unknown_wallets': {'$sum': {'$cond': [{'$and': [
                {'$ne': ['$source_migrated', True]}, {'$gt': [{'$ifNull': ['$balance', 0]}, 0]},
            ]}, 1, 0]}},
            'source_unknown_balance': {'$sum': {'$cond': [{'$and': [
                {'$ne': ['$source_migrated', True]}, {'$gt': [{'$ifNull': ['$balance', 0]}, 0]},
            ]}, {'$max': [0, {'$subtract': [{'$ifNull': ['$balance', 0]}, {'$ifNull': ['$withdrawable_pending', 0]}]}]}, 0]}},
            'lifetime_spend': {'$sum': {'$ifNull': ['$lifetime_spend', 0]}},
        }},
    ]).to_list(1) or [{}])[0]

    by_kind: dict = {}
    async for row in db.wallet_tx.aggregate([
        {'$match': uw},
        {'$group': {'_id': {'k': '$kind', 'sign': {'$cond': [{'$gt': ['$amount', 0]}, 'in', 'out']}},
                    'amount': {'$sum': '$amount'}, 'n': {'$sum': 1}}},
    ]):
        by_kind.setdefault(row['_id']['k'], {})[row['_id']['sign']] = {'amount': round(row['amount'], 2), 'count': row['n']}

    def credited(kinds) -> float:
        return round(sum(by_kind.get(k, {}).get('in', {}).get('amount', 0) for k in kinds), 2)

    def debited(kinds) -> float:
        return round(-sum(by_kind.get(k, {}).get('out', {}).get('amount', 0) for k in kinds), 2)

    bonus_spend_rows = await db.wallet_tx.aggregate([
        {'$match': {**uw, 'kind': 'spend', 'bonus_amount': {'$lt': 0}}},
        {'$group': {'_id': None, 'amount': {'$sum': '$bonus_amount'}}},
    ]).to_list(1)
    bonus_spent_known = round(-float(bonus_spend_rows[0]['amount']), 2) if bonus_spend_rows else 0.0
    unclassified_spend_rows = await db.wallet_tx.count_documents({
        **uw, 'kind': 'spend', 'bonus_amount': {'$exists': False},
    })
    topup_spend_rows = await db.wallet_tx.aggregate([
        {'$match': {**uw, 'kind': 'spend', 'purchased_amount': {'$lt': 0}}},
        {'$group': {'_id': None, 'amount': {'$sum': '$purchased_amount'}}},
    ]).to_list(1)
    topup_spent = round(-float(topup_spend_rows[0]['amount']), 2) if topup_spend_rows else 0.0
    unclassified_topup_spend_rows = await db.wallet_tx.count_documents({
        **uw, 'kind': 'spend', 'purchased_amount': {'$exists': False},
    })

    admin_bonus_credit = await _sum(db, 'wallet_tx', {
        **uw, 'kind': 'admin_adjust', 'amount': {'$gt': 0}, 'bonus_amount': {'$gt': 0},
    }, '$amount')
    bonus_kinds = (set(BONUS_TX_KINDS) - {'admin_adjust'}) | {'bonus_grant'}
    issued = round(credited(bonus_kinds) + admin_bonus_credit, 2)
    expired = debited({'bonus_expiry'})
    revoked = debited({'bonus_revoke'})
    available = round(float(wallets.get('bonus', 0)), 2)

    grants = (await db.bonus_grants.aggregate([
        {'$match': {'user_id': {'$nin': exclude}}},
        {'$group': {
            '_id': None, 'count': {'$sum': 1},
            'original': {'$sum': '$original_amount'}, 'remaining': {'$sum': {'$cond': [{'$eq': ['$status', 'active']}, '$remaining_amount', 0]}},
            'expired': {'$sum': {'$ifNull': ['$expired_amount', 0]}}, 'revoked': {'$sum': {'$ifNull': ['$revoked_amount', 0]}},
        }},
    ]).to_list(1) or [{'count': 0, 'original': 0, 'remaining': 0, 'expired': 0, 'revoked': 0}])[0]
    grant_spent = round(grants['original'] - grants['remaining'] - grants['expired'] - grants['revoked'], 2)
    legacy_bonus_held = round(float(wallets.get('bonus_untracked', 0)), 2)
    grant_sources = {}
    async for row in db.bonus_grants.aggregate([
        {'$match': {'user_id': {'$nin': exclude}}},
        {'$group': {'_id': {'$ifNull': ['$source', 'admin']},
                    'issued': {'$sum': '$original_amount'},
                    'outstanding': {'$sum': {'$cond': [{'$eq': ['$status', 'active']}, '$remaining_amount', 0]}},
                    'expired': {'$sum': {'$ifNull': ['$expired_amount', 0]}},
                    'revoked': {'$sum': {'$ifNull': ['$revoked_amount', 0]}}}},
    ]):
        grant_sources[str(row['_id'])] = row

    def bonus_source(source, legacy_kinds=(), source_labeled_issued=0.0):
        row = grant_sources.get(source, {})
        issued_grants = float(row.get('issued') or 0)
        outstanding = float(row.get('outstanding') or 0)
        expired_amount = float(row.get('expired') or 0)
        revoked_amount = float(row.get('revoked') or 0)
        spent = max(0.0, issued_grants - outstanding - expired_amount - revoked_amount)
        return {
            'issued': round(issued_grants + credited(set(legacy_kinds)) + source_labeled_issued, 2),
            'outstanding_tracked': round(outstanding, 2),
            'spent_tracked': round(spent, 2),
            'expired_tracked': round(expired_amount, 2),
            'revoked_tracked': round(revoked_amount, 2),
        }

    bonus_sources = {
        'signup': bonus_source('signup', ('signup_bonus',)),
        'normal_topup': bonus_source('normal_topup'),
        'influencer': bonus_source('influencer_campaign', ('influencer_bonus',)),
        'referral': bonus_source('referral', ('referral_bonus', 'referral')),
        'admin': bonus_source('admin', ('bonus', 'bonus_credit'), admin_bonus_credit),
        'other': bonus_source('other', ('promo', 'promo_bonus', 'reward', 'free_tokens')),
    }

    def due(hours):
        return {'user_id': {'$nin': exclude}, 'status': 'active', 'expires_at': {'$gt': now, '$lte': now + timedelta(hours=hours)}}

    due_24h = await _sum(db, 'bonus_grants', due(24), '$remaining_amount')
    due_7d = await _sum(db, 'bonus_grants', due(24 * 7), '$remaining_amount')
    live_paid_query = {
        **uw, 'kind': 'wallet_topup', 'payment_status': 'paid',
        'currency': 'gbp', 'stripe_livemode': True,
    }
    paid_gbp = _gbp(await _sum(db, 'payment_transactions', live_paid_query, '$amount'))
    refunds_gbp = _gbp(await _sum(db, 'payment_transactions', {
        **uw, 'kind': 'wallet_topup', 'currency': 'gbp', 'stripe_livemode': True,
        'amount_refunded_pence': {'$gt': 0},
    }, '$amount_refunded_pence'))
    paid_without_mode = _gbp(await _sum(db, 'payment_transactions', {
        **uw, 'kind': 'wallet_topup', 'payment_status': 'paid', 'currency': 'gbp',
        'stripe_livemode': {'$exists': False},
    }, '$amount'))
    tokens_purchased = credited({'topup'})

    won_tokens = credited(set(WITHDRAWABLE_TX_KINDS))
    free_world_winnings = credited({'champion_prize', 'championship_prize', 'winnings'})
    paid_world_cash_winnings = credited({'paid_prize_cash'})
    winning_tokens_held = round(float(wallets.get('withdrawable', 0)), 2)
    winning_bonus_held = round(float(wallets.get('winning_bonus', 0)), 2)
    bonus_held = round(float(wallets.get('bonus', 0)), 2)
    topup_held = round(float(wallets.get('purchased', 0)), 2)
    total_classified_available = round(topup_held + winning_tokens_held + winning_bonus_held + bonus_held, 2)
    pending_paid_world = (await db.winners.aggregate([
        {'$match': {**uw, 'paid_out': {'$ne': True}}},
        {'$group': {'_id': None, 'count': {'$sum': 1}, 'cash': {'$sum': {'$ifNull': ['$prize_cash_amount', '$prize_amount']}},
                    'winning_bonus': {'$sum': {'$ifNull': ['$prize_bonus_tokens', 0]}}}},
    ]).to_list(1) or [{'count': 0, 'cash': 0, 'winning_bonus': 0}])[0]
    cashouts = {s: await _sum(db, 'cashout_requests', {**uw, 'status': s}, '$amount_gbp') for s in ('processing', 'paid')}
    cashout_tokens = {s: await _sum(db, 'cashout_requests', {**uw, 'status': s}, '$amount_tokens') for s in ('processing', 'paid')}
    wins = (await db.winnings_wallets.aggregate([
        {'$match': uw},
        {'$group': {'_id': None, 'won': {'$sum': '$total_won_pence'}, 'available': {'$sum': '$available_pence'},
                    'pending': {'$sum': '$pending_pence'}, 'paid': {'$sum': '$total_paid_pence'}}},
    ]).to_list(1) or [{'won': 0, 'available': 0, 'pending': 0, 'paid': 0}])[0]
    wd = {s: await _sum(db, 'withdrawal_requests', {**uw, 'status': s}, '$amount_pence') for s in ('processing', 'paid')}

    result = {
        'generated_at': now.isoformat(),
        'scope': {'staff_included': include_staff, 'test_accounts_included': include_test, 'wallets': wallets.get('wallets', 0)},
        'units': 'Token figures are tokens (1 token = \u00a31 only when cashed out). GBP figures are real money. They are never added together.',
        'bonus_tokens': {
            'available': available, 'issued': issued,
            'spent_total': bonus_spent_known if unclassified_spend_rows == 0 else None,
            'spent_source_labeled': bonus_spent_known,
            'unclassified_legacy_spend_rows': unclassified_spend_rows,
            'spent_from_tracked_grants': grant_spent,
            'tracked_grants_available': round(float(grants.get('remaining', 0)), 2),
            'legacy_non_expiring_held': legacy_bonus_held,
            'expired': expired, 'revoked': revoked,
            'due_to_expire_24h': round(due_24h, 2), 'due_to_expire_7d': round(due_7d, 2),
            'tracked_grants': grants['count'],
            'by_source': bonus_sources,
            'notes': [
                'Source-labeled spend is exact for transactions written with per-source ledger fields. A lifetime total is unavailable while legacy spend rows lack that split.',
                'Grants created before expiry existed are untracked and never expire.',
            ],
        },
        'winning_bonus_tokens': {
            'issued': credited({'paid_prize_bonus'}),
            'held': winning_bonus_held,
        },
        'token_balances': {
            'topup_tokens': topup_held,
            'winning_tokens': winning_tokens_held,
            'winning_bonus_tokens': winning_bonus_held,
            'bonus_tokens': bonus_held,
            'total_available_tokens': total_classified_available,
            'cashout_available_tokens': winning_tokens_held,
            'unclassified_legacy_tokens': round(float(wallets.get('source_unknown_balance', 0)), 2),
        },
        'purchased_tokens': {
            'held': round(float(wallets.get('purchased', 0)), 2), 'purchased_total': tokens_purchased,
            'spent_total_all_token_types': debited({'spend'}),
            'spent_source_labeled': topup_spent if unclassified_topup_spend_rows == 0 else None,
            'topup_value_gbp': paid_gbp,
            'live_stripe_cash_received_gbp': paid_gbp,
            'live_stripe_refunds_gbp': refunds_gbp,
            'historical_paid_without_mode_gbp': paid_without_mode,
            'recognized_revenue_gbp': None,
            'stripe_fees_gbp': None,
            'net_revenue_gbp': None,
            'refunds_tokens': credited({'refund'}), 'admin_adjustments_tokens': {
                'credited': credited({'admin_adjust'}), 'debited': debited({'admin_adjust'})},
            'notes': [
                'Live cash received includes only paid GBP top-ups explicitly marked stripe_livemode=true.',
                'Legacy paid top-ups without a recorded mode are shown separately; test-mode payments are excluded.',
                'Recognized revenue, Stripe fees, and net revenue are unavailable because no accounting or fee ledger is stored. Token top-ups are wallet liabilities, not automatically revenue.',
            ],
        },
        'winnings': {
            'free_world_tokens_issued': free_world_winnings,
            'paid_world_cash_tokens_issued': paid_world_cash_winnings,
            'paid_world_bonus_tokens_issued': credited({'paid_prize_bonus'}),
            'pending_paid_world_prizes': {
                'count': int(pending_paid_world.get('count', 0)),
                'cash_tokens': round(float(pending_paid_world.get('cash', 0) or 0), 2),
                'winning_bonus_tokens': round(float(pending_paid_world.get('winning_bonus', 0) or 0), 2),
            },
            'championship_prize_tokens': {
                'awarded': won_tokens, 'held_withdrawable': round(float(wallets.get('withdrawable', 0)), 2),
                'cash_out_pending': round(float(wallets.get('pending', 0)), 2),
                'withdrawn': cashout_tokens['paid'], 'withdrawn_gbp': round(cashouts['paid'], 2),
                'pending_requests_tokens': cashout_tokens['processing'], 'pending_requests_gbp': round(cashouts['processing'], 2),
            },
            'challenge_winnings_gbp': {
                'awarded': _gbp(wins['won']), 'held': _gbp(wins['available']), 'pending': _gbp(wins['pending']),
                'withdrawn': _gbp(wins['paid']), 'pending_withdrawals': _gbp(wd['processing']),
                'completed_withdrawals': _gbp(wd['paid']),
            },
            'prize_liabilities_outstanding': {
                'tokens_redeemable': round(float(wallets.get('withdrawable', 0)) + float(wallets.get('pending', 0)), 2),
                'gbp': _gbp(wins['available'] + wins['pending']),
            },
        },
        'integrity': {
            'wallet_balance_total_tokens': round(float(wallets.get('balance', 0)), 2),
            'classified_balance_tokens': round(float(wallets.get('known_balance', 0)), 2),
            'unclassified_wallets': int(wallets.get('source_unknown_wallets', 0)),
            'unclassified_balance_tokens': round(float(wallets.get('source_unknown_balance', 0)), 2),
            'components_total_tokens': round(float(wallets.get('bonus', 0)) + float(wallets.get('purchased', 0))
                                             + float(wallets.get('winning_bonus', 0))
                                             + float(wallets.get('withdrawable', 0)) + float(wallets.get('pending', 0)), 2),
            'note': 'Only source-migrated wallets are categorized; unclassified legacy balances are shown separately. Run /wallet-integrity for a ledger comparison; nothing is auto-corrected.',
        },
    }
    if result['integrity']['unclassified_wallets']:
        result['integrity']['components_match'] = None
    else:
        result['integrity']['components_match'] = abs(
            result['integrity']['wallet_balance_total_tokens'] - result['integrity']['components_total_tokens']) < 0.01
    return _store(key, result)


TOKEN_CATEGORY_FIELDS = {
    'topup_tokens': 'purchased_amount',
    'winning_tokens': 'withdrawable_amount',
    'winning_bonus_tokens': 'winning_bonus_amount',
    'bonus_tokens': 'bonus_amount',
}
TOKEN_CATEGORY_SCOPE_KINDS = {
    'topup_tokens': ('topup', 'spend', 'refund', 'reversal', 'admin_adjust'),
    'winning_tokens': ('champion_prize', 'championship_prize', 'winnings', 'paid_prize_cash', 'spend', 'refund', 'reversal', 'admin_adjust'),
    'winning_bonus_tokens': ('paid_prize_bonus', 'spend', 'refund', 'reversal', 'admin_adjust'),
    'bonus_tokens': ('signup_bonus', 'referral_bonus', 'referral', 'bonus', 'bonus_credit', 'influencer_bonus',
                     'promo', 'promo_bonus', 'reward', 'free_tokens', 'bonus_grant', 'bonus_expiry', 'bonus_revoke',
                     'spend', 'refund', 'reversal', 'admin_adjust'),
}
TOKEN_ISSUANCE_KINDS = {
    'topup_tokens': ('topup',),
    'winning_tokens': ('champion_prize', 'championship_prize', 'winnings', 'paid_prize_cash'),
    'winning_bonus_tokens': ('paid_prize_bonus',),
    'bonus_tokens': ('signup_bonus', 'referral_bonus', 'referral', 'bonus', 'bonus_credit', 'influencer_bonus',
                     'promo', 'promo_bonus', 'reward', 'free_tokens', 'bonus_grant'),
}


def _token_period(period: str, start_date: Optional[str], end_date: Optional[str]):
    return resolve_range(period, start_date, end_date)


async def _token_movements(db, excluded: list, start, end):
    specs = {}
    for category, field in TOKEN_CATEGORY_FIELDS.items():
        value = {'$ifNull': [f'${field}', 0]}
        kind_in_scope = {'$in': ['$kind', list(TOKEN_CATEGORY_SCOPE_KINDS[category])]}
        specs[f'{category}_net'] = {'$sum': value}
        specs[f'{category}_credits'] = {'$sum': {'$cond': [{'$and': [
            {'$gt': [value, 0]}, {'$in': ['$kind', list(TOKEN_ISSUANCE_KINDS[category])]}
        ]}, value, 0]}}
        specs[f'{category}_spent'] = {'$sum': {'$cond': [{'$and': [{'$eq': ['$kind', 'spend']}, {'$lt': [value, 0]}]}, {'$abs': value}, 0]}}
        specs[f'{category}_expired'] = {'$sum': {'$cond': [{'$and': [{'$eq': ['$kind', 'bonus_expiry']}, {'$lt': [value, 0]}]}, {'$abs': value}, 0]}}
        specs[f'{category}_refunds'] = {'$sum': {'$cond': [{'$and': [{'$in': ['$kind', ['refund', 'reversal']]}, {'$gt': [value, 0]}]}, value, 0]}}
        specs[f'{category}_reversals'] = {'$sum': {'$cond': [{'$and': [{'$in': ['$kind', ['refund', 'reversal']]}, {'$lt': [value, 0]}]}, {'$abs': value}, 0]}}
        specs[f'{category}_admin_positive'] = {'$sum': {'$cond': [{'$and': [{'$eq': ['$kind', 'admin_adjust']}, {'$gt': [value, 0]}]}, value, 0]}}
        specs[f'{category}_admin_negative'] = {'$sum': {'$cond': [{'$and': [{'$eq': ['$kind', 'admin_adjust']}, {'$lt': [value, 0]}]}, {'$abs': value}, 0]}}
        specs[f'{category}_unclassified'] = {'$sum': {'$cond': [{'$and': [kind_in_scope, {'$not': [{'$isNumber': f'${field}'}]}, {'$ne': ['$amount', 0]}]}, 1, 0]}}
    query = {'user_id': {'$nin': excluded}}
    if start is not None and end is not None:
        query['created_at'] = {'$gte': start, '$lt': end}
    rows = await db.wallet_tx.aggregate([{'$match': query}, {'$group': {'_id': None, **specs}}]).to_list(1)
    return rows[0] if rows else {}


@router.get('/token-accounting')
async def token_accounting(request: Request, period: str = 'all_time', start_date: Optional[str] = None,
                          end_date: Optional[str] = None):
    """Read-only category summary. Opening balances are derived only when all post-start movements are classified."""
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admins can view token accounting')
    from deps import get_db
    db = get_db()
    date_range = _token_period(period, start_date, end_date)
    now = utcnow()
    start, selected_end = date_range['start'], min(date_range['end'], now + timedelta(seconds=1))
    excluded = await excluded_user_ids(db)
    report = await wallet_report(request, refresh=True)
    current = report['token_balances']
    wallets = await db.wallets.aggregate([
        {'$match': {'user_id': {'$nin': excluded}, 'source_migrated': True}},
        {'$project': {
            'topup': {'$max': [0, {'$subtract': ['$balance', {'$add': [
                {'$ifNull': ['$bonus', 0]}, {'$ifNull': ['$winning_bonus', 0]},
                {'$ifNull': ['$withdrawable', 0]}, {'$ifNull': ['$withdrawable_pending', 0]}]}]}]},
            'winning': {'$ifNull': ['$withdrawable', 0]}, 'winning_pending': {'$ifNull': ['$withdrawable_pending', 0]},
            'winning_bonus': {'$ifNull': ['$winning_bonus', 0]}, 'bonus': {'$ifNull': ['$bonus', 0]},
        }},
        {'$group': {'_id': None,
            'topup_holders': {'$sum': {'$cond': [{'$gt': ['$topup', 0]}, 1, 0]}},
            'winning_holders': {'$sum': {'$cond': [{'$gt': [{'$add': ['$winning', '$winning_pending']}, 0]}, 1, 0]}},
            'winning_available_holders': {'$sum': {'$cond': [{'$gt': ['$winning', 0]}, 1, 0]}},
            'winning_bonus_holders': {'$sum': {'$cond': [{'$gt': ['$winning_bonus', 0]}, 1, 0]}},
            'bonus_holders': {'$sum': {'$cond': [{'$gt': ['$bonus', 0]}, 1, 0]}},
        }},
    ]).to_list(1)
    holders = wallets[0] if wallets else {}
    period_moves = await _token_movements(db, excluded, start, selected_end)
    since_start_moves = await _token_movements(db, excluded, start, now + timedelta(seconds=1))
    paid_cashouts = (await db.cashout_requests.aggregate([
        {'$match': {'user_id': {'$nin': excluded}, 'status': 'paid', 'paid_at': {'$lt': now + timedelta(seconds=1)}}},
        {'$group': {'_id': None, 'tokens': {'$sum': '$amount_tokens'}, 'count': {'$sum': 1}}},
    ]).to_list(1) or [{}])[0]
    paid_since_start = (await db.cashout_requests.aggregate([
        {'$match': {'user_id': {'$nin': excluded}, 'status': 'paid', 'paid_at': {'$gte': start, '$lt': now + timedelta(seconds=1)}}},
        {'$group': {'_id': None, 'tokens': {'$sum': '$amount_tokens'}}},
    ]).to_list(1) or [{}])[0]
    paid_cashouts_period = (await db.cashout_requests.aggregate([
        {'$match': {'user_id': {'$nin': excluded}, 'status': 'paid', 'paid_at': {'$gte': start, '$lt': selected_end}}},
        {'$group': {'_id': None, 'tokens': {'$sum': '$amount_tokens'}, 'count': {'$sum': 1}}},
    ]).to_list(1) or [{}])[0]
    requests_period = (await db.cashout_requests.aggregate([
        {'$match': {'user_id': {'$nin': excluded}, 'created_at': {'$gte': start, '$lt': selected_end}}},
        {'$group': {'_id': None, 'tokens': {'$sum': '$amount_tokens'}, 'count': {'$sum': 1}}},
    ]).to_list(1) or [{}])[0]
    rejected_period = (await db.cashout_requests.aggregate([
        {'$match': {'user_id': {'$nin': excluded}, 'status': 'rejected', 'updated_at': {'$gte': start, '$lt': selected_end}}},
        {'$group': {'_id': None, 'tokens': {'$sum': '$amount_tokens'}, 'count': {'$sum': 1}}},
    ]).to_list(1) or [{}])[0]
    pending_cashouts = (await db.cashout_requests.aggregate([
        {'$match': {'user_id': {'$nin': excluded}, 'status': 'processing'}},
        {'$group': {'_id': None, 'tokens': {'$sum': '$amount_tokens'}, 'count': {'$sum': 1}}},
    ]).to_list(1) or [{}])[0]
    current_wallet_count = int(report['scope']['wallets'])
    unclassified_wallet_count = int(report['integrity']['unclassified_wallets'])
    category_names = {
        'topup_tokens': 'Top-up Tokens', 'winning_tokens': 'Winning Tokens',
        'winning_bonus_tokens': 'Winning Bonus Tokens', 'bonus_tokens': 'Bonus Tokens',
    }
    categories = {}
    for key, label in category_names.items():
        net = round(float(since_start_moves.get(f'{key}_net') or 0), 2)
        period_net = round(float(period_moves.get(f'{key}_net') or 0), 2)
        if key == 'winning_tokens':
            net -= float(paid_since_start.get('tokens') or 0)
            period_net -= float(paid_cashouts_period.get('tokens') or 0)
        available_balance = round(float(current.get(key) or 0), 2)
        reserved_balance = round(float(report['winnings']['championship_prize_tokens']['cash_out_pending'] or 0), 2) if key == 'winning_tokens' else 0.0
        remaining = round(available_balance + reserved_balance, 2)
        unclassified = int(since_start_moves.get(f'{key}_unclassified') or 0)
        verified = unclassified == 0 and unclassified_wallet_count == 0
        opening = round(remaining - net, 2) if verified else None
        categories[key] = {
            'label': label, 'all_time_credits': round(float(since_start_moves.get(f'{key}_credits') or 0), 2),
            'all_time_spent': round(float(since_start_moves.get(f'{key}_spent') or 0), 2),
            'all_time_expired': round(float(since_start_moves.get(f'{key}_expired') or 0), 2),
            'all_time_refunds': round(float(since_start_moves.get(f'{key}_refunds') or 0), 2),
            'all_time_reversals': round(float(since_start_moves.get(f'{key}_reversals') or 0), 2),
            'all_time_admin_positive': round(float(since_start_moves.get(f'{key}_admin_positive') or 0), 2),
            'all_time_admin_negative': round(float(since_start_moves.get(f'{key}_admin_negative') or 0), 2),
            'all_time_withdrawn': round(float(paid_cashouts.get('tokens') or 0), 2) if key == 'winning_tokens' else 0.0,
            'period_withdrawn': round(float(paid_cashouts_period.get('tokens') or 0), 2) if key == 'winning_tokens' else 0.0,
            'period_credits': round(float(period_moves.get(f'{key}_credits') or 0), 2),
            'period_spent': round(float(period_moves.get(f'{key}_spent') or 0), 2),
            'period_expired': round(float(period_moves.get(f'{key}_expired') or 0), 2),
            'period_refunds': round(float(period_moves.get(f'{key}_refunds') or 0), 2),
            'period_reversals': round(float(period_moves.get(f'{key}_reversals') or 0), 2),
            'period_admin_positive': round(float(period_moves.get(f'{key}_admin_positive') or 0), 2),
            'period_admin_negative': round(float(period_moves.get(f'{key}_admin_negative') or 0), 2),
            'period_net_movement': period_net, 'current_remaining': remaining,
            'current_available': available_balance, 'current_reserved': reserved_balance,
            'holders': int(holders.get(key.replace('_tokens', '_holders')) or 0),
            'opening_balance': opening, 'period_closing_balance': round(opening + period_net, 2) if opening is not None else None,
            'reconciliation': 'verified' if verified else 'incomplete_legacy_source_history',
            'unclassified_transactions_since_period_start': unclassified,
        }
    cashout_summary = {
        'completed_tokens_all_time': round(float(paid_cashouts.get('tokens') or 0), 2),
        'completed_count_all_time': int(paid_cashouts.get('count') or 0),
        'completed_tokens_in_period': round(float(paid_cashouts_period.get('tokens') or 0), 2),
        'completed_count_in_period': int(paid_cashouts_period.get('count') or 0),
        'requested_tokens_in_period': round(float(requests_period.get('tokens') or 0), 2),
        'requested_count_in_period': int(requests_period.get('count') or 0),
        'pending_tokens_current': round(float(pending_cashouts.get('tokens') or 0), 2),
        'pending_count_current': int(pending_cashouts.get('count') or 0),
        'available_tokens_current': round(float(current.get('winning_tokens') or 0), 2),
        'rejected_tokens_in_period': round(float(rejected_period.get('tokens') or 0), 2),
        'rejected_count_in_period': int(rejected_period.get('count') or 0),
    }
    return {
        'range': date_range, 'categories': categories,
        'bonus_sources': report['bonus_tokens']['by_source'],
        'current': {**current, 'total_outstanding_tokens': round(float(current.get('total_available_tokens') or 0)
                    + float(current.get('unclassified_legacy_tokens') or 0)
                    + float(report['winnings']['championship_prize_tokens']['cash_out_pending'] or 0), 2),
                    'wallets': current_wallet_count, 'unclassified_wallet_count': unclassified_wallet_count},
        'cashouts': cashout_summary,
        'accounting': {
            'stripe_cash_received_gbp': report['purchased_tokens']['live_stripe_cash_received_gbp'],
            'stripe_refunds_gbp': report['purchased_tokens']['live_stripe_refunds_gbp'],
            'topup_tokens_issued': report['purchased_tokens']['purchased_total'],
            'topup_tokens_spent': report['purchased_tokens']['spent_source_labeled'],
            'topup_tokens_remaining': report['purchased_tokens']['held'],
            'paid_world_pending_prizes': report['winnings']['pending_paid_world_prizes'],
            'prize_liabilities': report['winnings']['prize_liabilities_outstanding'],
            'recognized_revenue_gbp': None, 'stripe_fees_gbp': None, 'net_revenue_gbp': None,
            'note': 'Recognized revenue, Stripe fees and net revenue are unavailable without an accounting/fee ledger.',
        },
    }


async def _world_transaction_filter(db, world: str, contest_id: Optional[str], user_id: Optional[str]):
    if world == 'all' and not contest_id:
        return None
    if world not in ('all', 'free_world', 'paid_world', 'impossible_challenges'):
        raise HTTPException(status_code=400, detail='Unsupported world filter')
    selected = 'paid_world' if world == 'all' and contest_id else world
    user_filter = {'user_id': user_id} if user_id else {}
    if selected == 'paid_world':
        ticket_filter = {**user_filter}
        if contest_id:
            ticket_filter['contest_id'] = contest_id
        order_ids = await db.tickets.distinct('order_id', ticket_filter)
        winner_filter = {**user_filter}
        if contest_id:
            winner_filter['contest_id'] = contest_id
        refs = []
        async for winner in db.winners.find(winner_filter, {'_id': 0, 'wallet_transaction_refs': 1}):
            refs.extend(winner.get('wallet_transaction_refs') or [])
        alternatives = []
        if order_ids:
            alternatives.append({'ref_order_id': {'$in': order_ids}})
        if refs:
            alternatives.append({'ref_order_id': {'$in': refs}})
        return {'$or': alternatives} if alternatives else {'tx_id': {'$in': []}}
    if selected == 'free_world':
        tx_ids = []
        for collection in ('world_level_unlock_reservations', 'world_token_retry_reservations'):
            query = dict(user_filter)
            if contest_id:
                try:
                    query['global_contest_number'] = int(contest_id)
                except ValueError:
                    query['global_contest_number'] = -1
            tx_ids.extend(await db[collection].distinct('wallet_tx_id', query))
        award_query = dict(user_filter)
        if contest_id:
            try:
                award_query['global_contest_number'] = int(contest_id)
            except ValueError:
                award_query['global_contest_number'] = -1
        award_refs = await db.world_winner_awards.distinct('wallet_ref', award_query)
        alternatives = []
        if tx_ids or award_refs:
            alternatives.append({'tx_id': {'$in': [value for value in [*tx_ids, *award_refs] if value]}})
        if award_refs:
            alternatives.append({'ref_order_id': {'$in': award_refs}})
        return {'$or': alternatives} if alternatives else {'tx_id': {'$in': []}}
    attempts_query = dict(user_filter)
    if contest_id:
        attempts_query['challenge_id'] = contest_id
    attempt_ids = await db.special_challenge_attempts.distinct('attempt_id', attempts_query)
    refs = [f'impossible_challenge_entry:{attempt_id}' for attempt_id in attempt_ids]
    return {'ref_order_id': {'$in': refs}} if refs else {'tx_id': {'$in': []}}


async def _token_ledger_page(db, *, start, end, category='all', source='all', user_id=None,
                             world='all', contest_id=None, skip=0, limit=100, excluded=None):
    if category not in ('all', 'unclassified') and category not in TOKEN_CATEGORY_FIELDS:
        raise HTTPException(status_code=400, detail='Unsupported token category')
    excluded = excluded or []
    match = {'created_at': {'$gte': start, '$lt': end}, 'user_id': {'$nin': excluded}}
    if user_id:
        match['user_id'] = user_id
    category_field = TOKEN_CATEGORY_FIELDS.get(category)
    if category_field:
        match[category_field] = {'$type': 'number', '$ne': 0}
    elif category == 'unclassified':
        match['$and'] = [{'$or': [{field: {'$exists': False}}, {field: None}]}
                         for field in TOKEN_CATEGORY_FIELDS.values()]
    world_match = await _world_transaction_filter(db, world, contest_id, user_id)
    if world_match:
        match.setdefault('$and', []).append(world_match)

    if source != 'all':
        source_legacy = {
            'signup': ('signup_bonus',), 'referral': ('referral_bonus', 'referral'),
            'admin': ('bonus', 'bonus_credit'), 'influencer': ('influencer_bonus',),
            'promotion': ('promo', 'promo_bonus'), 'other': ('reward', 'free_tokens'),
            'topup': ('topup',), 'free_world': ('champion_prize', 'championship_prize', 'winnings'),
            'paid_world': ('paid_prize_cash', 'paid_prize_bonus'),
            'admin_adjustment': ('admin_adjust',), 'refund': ('refund',),
        }
        if source == 'cashout':
            match['tx_id'] = {'$in': []}
        elif source == 'impossible_challenges':
            match['ref_order_id'] = {'$regex': '^impossible_challenge_entry:'}
        elif source in source_legacy:
            kinds = source_legacy[source]
            alternatives = [] if source == 'world_competition' else [{'kind': {'$in': list(kinds)}}]
            if source in ('signup', 'referral', 'admin', 'influencer', 'promotion', 'other'):
                grants = db.bonus_grants.find({'source': 'influencer_campaign' if source == 'influencer' else source},
                                              {'_id': 0, 'ref_key': 1})
                grant_refs = [f"bonus_grant:{row['ref_key']}" async for row in grants if row.get('ref_key')]
                if grant_refs:
                    alternatives.append({'ref_order_id': {'$in': grant_refs}})
                if source == 'admin':
                    alternatives.append({'kind': 'admin_adjust', 'bonus_amount': {'$gt': 0}})
            match.setdefault('$and', []).append({'$or': alternatives})
        else:
            raise HTTPException(status_code=400, detail='Unsupported transaction source')

    total = await db.wallet_tx.count_documents(match)
    candidate_limit = min(skip + limit, 10000)
    tx_rows = await db.wallet_tx.find(match, {'_id': 0}).sort([('created_at', -1), ('tx_id', -1)]).limit(candidate_limit).to_list(candidate_limit)
    refs = list({str(row.get('ref_order_id')) for row in tx_rows if row.get('ref_order_id')})
    tx_ids = [row['tx_id'] for row in tx_rows if row.get('tx_id')]
    contest_by_ref = {}
    world_by_tx_id = {}
    if refs:
        async for order in db.orders.find({'order_id': {'$in': refs}}, {'_id': 0, 'order_id': 1, 'items': 1}):
            contest_id_from_order = next((item.get('contest_id') for item in (order.get('items') or []) if item.get('contest_id')), None)
            if contest_id_from_order:
                contest_by_ref[order['order_id']] = contest_id_from_order
    if tx_ids:
        async for award in db.world_winner_awards.find({'wallet_ref': {'$in': tx_ids}},
                                                       {'_id': 0, 'wallet_ref': 1, 'global_contest_number': 1}):
            world_by_tx_id[award['wallet_ref']] = ('free_world', str(award.get('global_contest_number')) if award.get('global_contest_number') is not None else None)
        for collection in ('world_level_unlock_reservations', 'world_token_retry_reservations'):
            async for reservation in db[collection].find({'wallet_tx_id': {'$in': tx_ids}},
                    {'_id': 0, 'wallet_tx_id': 1, 'global_contest_number': 1}):
                world_by_tx_id[reservation['wallet_tx_id']] = ('free_world', str(reservation.get('global_contest_number')) if reservation.get('global_contest_number') is not None else None)
    if refs:
        async for winner in db.winners.find({'wallet_transaction_refs': {'$in': refs}},
                {'_id': 0, 'contest_id': 1, 'wallet_transaction_refs': 1}):
            for ref in winner.get('wallet_transaction_refs') or []:
                contest_by_ref[ref] = winner.get('contest_id')

    cashout_rows = []
    if category in ('all', 'winning_tokens') and source in ('all', 'cashout') and world == 'all' and not contest_id:
        cashout_query = {'user_id': {'$nin': excluded}, 'created_at': {'$lt': end}}
        if user_id:
            cashout_query['user_id'] = user_id
        requests = await db.cashout_requests.find(cashout_query, {'_id': 0}).sort('created_at', -1).limit(10000).to_list(10000)
        def in_period(value):
            if not value:
                return False
            if isinstance(value, str):
                try:
                    value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except ValueError:
                    return False
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return start <= value < end
        for item in requests:
            amount = round(float(item.get('amount_tokens') or 0), 2)
            common = {'user_id': item['user_id'], 'category': 'winning_tokens', 'source': 'cashout',
                      'reference': item.get('withdrawal_id'), 'world': None, 'contest_id': None,
                      'reason': item.get('reject_reason') or 'Cashout lifecycle', 'source_account': 'winning_tokens'}
            if in_period(item.get('created_at')):
                cashout_rows.append({**common, 'tx_id': f"{item.get('withdrawal_id')}:request",
                    'kind': 'cashout_requested', 'status': 'pending', 'amount': -amount,
                    'destination_account': 'winning_tokens_reserved', 'created_at': item.get('created_at')})
            if item.get('status') == 'paid' and in_period(item.get('paid_at')):
                cashout_rows.append({**common, 'tx_id': f"{item.get('withdrawal_id')}:paid",
                    'kind': 'cashout_completed', 'status': 'paid', 'amount': -amount,
                    'source_account': 'winning_tokens_reserved', 'destination_account': 'external_cashout',
                    'created_at': item.get('paid_at')})
            elif item.get('status') == 'rejected' and in_period(item.get('updated_at')):
                cashout_rows.append({**common, 'tx_id': f"{item.get('withdrawal_id')}:rejected",
                    'kind': 'cashout_rejected', 'status': 'reversed', 'amount': amount,
                    'source_account': 'winning_tokens_reserved', 'destination_account': 'winning_tokens',
                    'created_at': item.get('updated_at')})
        total += len(cashout_rows)

    user_ids = list({row['user_id'] for row in [*tx_rows, *cashout_rows] if row.get('user_id')})
    user_map = {}
    if user_ids:
        users = await db.users.find({'user_id': {'$in': user_ids}}, {'_id': 0, 'user_id': 1, 'email': 1, 'name': 1}).to_list(len(user_ids))
        user_map = {user['user_id']: user for user in users}
    rows = []
    grant_keys = [str(row.get('ref_order_id') or '').removeprefix('bonus_grant:')
                  for row in tx_rows if str(row.get('ref_order_id') or '').startswith('bonus_grant:')]
    grant_sources = {}
    if grant_keys:
        async for grant in db.bonus_grants.find({'ref_key': {'$in': grant_keys}}, {'_id': 0, 'ref_key': 1, 'source': 1}):
            grant_sources[grant['ref_key']] = grant.get('source') or 'admin'
    for tx in tx_rows:
        deltas = {name: tx.get(field) for name, field in TOKEN_CATEGORY_FIELDS.items()}
        classified = all(isinstance(value, (int, float)) for value in deltas.values())
        nonzero_categories = [key for key, value in deltas.items() if isinstance(value, (int, float)) and value]
        kind = tx.get('kind', 'unknown')
        ref_order_id = str(tx.get('ref_order_id') or '')
        tx_source = grant_sources.get(ref_order_id.removeprefix('bonus_grant:'), kind) if ref_order_id.startswith('bonus_grant:') else kind
        attribution = world_by_tx_id.get(tx.get('tx_id'))
        world_name = (attribution[0] if attribution else 'paid_world' if kind.startswith('paid_prize') else
                      'free_world' if kind in ('champion_prize', 'championship_prize', 'winnings') else
                      'paid_world' if ref_order_id in contest_by_ref else
                      'impossible_challenges' if ref_order_id.startswith('impossible_challenge_entry:') else None)
        contest_value = contest_by_ref.get(ref_order_id) or (attribution[1] if attribution else None)
        if world_name == 'impossible_challenges':
            attempt_id = ref_order_id.removeprefix('impossible_challenge_entry:')
            attempt = await db.special_challenge_attempts.find_one({'attempt_id': attempt_id}, {'_id': 0, 'challenge_id': 1})
            contest_value = attempt.get('challenge_id') if attempt else None
        view_amount = deltas.get(category) if category in TOKEN_CATEGORY_FIELDS else tx.get('amount')
        positive_categories = [key for key, value in deltas.items() if isinstance(value, (int, float)) and value > 0]
        negative_categories = [key for key, value in deltas.items() if isinstance(value, (int, float)) and value < 0]
        source_account = (' + '.join(negative_categories) or 'unclassified wallet balance') if float(tx.get('amount') or 0) < 0 else {
            'topup': 'stripe_payment', 'paid_prize_cash': 'paid_world_prize',
            'paid_prize_bonus': 'paid_world_prize', 'champion_prize': 'free_world_prize',
            'winnings': 'prize_award', 'bonus_grant': f'{tx_source}_bonus_grant',
            'refund': 'original_transaction_refund', 'admin_adjust': 'admin_adjustment',
        }.get(kind, kind)
        destination_account = (f'{world_name}_entry' if world_name and kind == 'spend' else
                               'external_cashout' if kind == 'cashout_completed' else
                               ' + '.join(positive_categories) or 'unclassified wallet balance')
        rows.append({**tx, 'category_deltas': deltas, 'category': ('unclassified' if not classified else nonzero_categories[0] if len(nonzero_categories) == 1 else 'multiple'),
                     'amount_in_view': view_amount,
                     'source': tx_source, 'source_account': source_account,
                     'destination_account': destination_account,
                     'world': world_name, 'contest_id': contest_value, 'status': 'posted' if classified else 'unclassified_legacy',
                     'user': user_map.get(tx['user_id'])})
    for row in cashout_rows:
        row['user'] = user_map.get(row['user_id'])
        row['category_deltas'] = {'topup_tokens': 0, 'winning_tokens': row['amount'], 'winning_bonus_tokens': 0, 'bonus_tokens': 0}
        rows.append(row)
    rows.sort(key=lambda row: row.get('created_at') or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return {'total': total, 'skip': skip, 'limit': limit, 'transactions': rows[skip:skip + limit],
            'range': {'start': start.isoformat(), 'end': end.isoformat()},
            'notes': ['Cashout reservation, completion and rejection are synthetic ledger events from cashout_requests; they are not duplicate wallet transactions.',
                      'World/contest fields are populated only when an existing transaction reference identifies them.']}


@router.get('/token-ledger')
async def token_ledger(request: Request, period: str = 'all_time', start_date: Optional[str] = None,
                      end_date: Optional[str] = None, category: str = 'all', source: str = 'all',
                      user_id: Optional[str] = None, world: str = 'all', contest_id: Optional[str] = None,
                      skip: int = 0, limit: int = 100):
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admins can view token accounting history')
    from deps import get_db
    db = get_db()
    if user_id:
        user = await db.users.find_one({'$or': [{'user_id': user_id}, {'email': user_id.lower()}, {'public_id': user_id}]}, {'_id': 0, 'user_id': 1})
        user_id = user.get('user_id') if user else user_id
    date_range = _token_period(period, start_date, end_date)
    excluded = await excluded_user_ids(db)
    return await _token_ledger_page(db, start=date_range['start'], end=date_range['end'], category=category,
        source=source, user_id=user_id, world=world, contest_id=contest_id,
        skip=max(0, int(skip)), limit=max(1, min(int(limit), 500)), excluded=excluded)


@router.get('/token-ledger.csv')
async def token_ledger_csv(request: Request, period: str = 'all_time', start_date: Optional[str] = None,
                           end_date: Optional[str] = None, category: str = 'all', source: str = 'all',
                           user_id: Optional[str] = None, world: str = 'all', contest_id: Optional[str] = None):
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admins can export token accounting history')
    from deps import get_db
    db = get_db()
    if user_id:
        user = await db.users.find_one({'$or': [{'user_id': user_id}, {'email': user_id.lower()}, {'public_id': user_id}]}, {'_id': 0, 'user_id': 1})
        user_id = user.get('user_id') if user else user_id
    date_range = _token_period(period, start_date, end_date)
    excluded = await excluded_user_ids(db)
    page = await _token_ledger_page(db, start=date_range['start'], end=date_range['end'], category=category,
        source=source, user_id=user_id, world=world, contest_id=contest_id, skip=0, limit=10000, excluded=excluded)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(['timestamp', 'user_id', 'email', 'name', 'category', 'source', 'kind', 'amount_tokens',
                     'source_account', 'destination_account', 'world', 'contest_id', 'status', 'reason', 'reference'])
    for row in page['transactions']:
        user = row.get('user') or {}
        category_deltas = row.get('category_deltas') or {}
        amount = row.get('amount_in_view', row.get('amount'))
        if amount is None:
            amount = next((value for value in category_deltas.values() if isinstance(value, (int, float)) and value), 0)
        writer.writerow([row.get('created_at'), row.get('user_id'), user.get('email'), user.get('name'), row.get('category'),
                         row.get('source'), row.get('kind'), amount, row.get('source_account'), row.get('destination_account'),
                         row.get('world'), row.get('contest_id'), row.get('status'), row.get('note') or row.get('reason'),
                         row.get('ref_order_id') or row.get('reference')])
    return Response(buffer.getvalue(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="token-ledger.csv"'})


@router.get('/wallet-integrity')
async def wallet_integrity(request: Request, include_staff: bool = False, after_user_id: Optional[str] = None, limit: int = 100):
    """Compare a paginated wallet batch with its ledger. Read-only; never rewrites balances."""
    admin = await require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin or super admin can inspect wallet integrity')
    from deps import get_db
    db = get_db()
    exclude = [] if include_staff else await excluded_user_ids(db)
    limit = max(1, min(int(limit), 500))
    query = {'user_id': {'$nin': exclude}}
    if after_user_id:
        query['user_id'] = {'$nin': exclude, '$gt': after_user_id}
    rows = await db.wallets.find(query, {'_id': 0, 'user_id': 1, 'balance': 1, 'bonus': 1,
                                        'winning_bonus': 1, 'withdrawable': 1, 'withdrawable_pending': 1,
                                        'source_migrated': 1}).sort('user_id', 1).limit(limit + 1).to_list(limit + 1)
    has_more = len(rows) > limit
    rows = rows[:limit]
    ids = [w['user_id'] for w in rows]
    ledger_rows = await db.wallet_tx.aggregate([
        {'$match': {'user_id': {'$in': ids}}},
        {'$group': {'_id': '$user_id', 'n': {'$sum': '$amount'}, 'count': {'$sum': 1},
            'topup': {'$sum': {'$ifNull': ['$purchased_amount', 0]}},
            'winning': {'$sum': {'$ifNull': ['$withdrawable_amount', 0]}},
            'winning_bonus': {'$sum': {'$ifNull': ['$winning_bonus_amount', 0]}},
            'bonus': {'$sum': {'$ifNull': ['$bonus_amount', 0]}},
            'unclassified': {'$sum': {'$cond': [{'$and': [{'$ne': ['$amount', 0]}, {'$or': [
                {'$not': [{'$isNumber': '$purchased_amount'}]}, {'$not': [{'$isNumber': '$withdrawable_amount'}]},
                {'$not': [{'$isNumber': '$winning_bonus_amount'}]}, {'$not': [{'$isNumber': '$bonus_amount'}]},
            ]}]}, 1, 0]}}}},
    ]).to_list(len(ids)) if ids else []
    ledger_by_user = {row['_id']: row for row in ledger_rows}
    paid_cashouts = {row['_id']: float(row.get('tokens') or 0) async for row in db.cashout_requests.aggregate([
        {'$match': {'user_id': {'$in': ids}, 'status': 'paid'}},
        {'$group': {'_id': '$user_id', 'tokens': {'$sum': '$amount_tokens'}}},
    ])} if ids else {}
    mismatches, checked = [], 0
    for w in rows:
        checked += 1
        bal = round(float(w.get('balance') or 0), 2)
        ledger_row = ledger_by_user.get(w['user_id'], {})
        ledger = round(float(ledger_row.get('n') or 0) - paid_cashouts.get(w['user_id'], 0), 2)
        problems = []
        if abs(bal - ledger) >= 0.01:
            problems.append('balance_differs_from_ledger')
        if bal < -0.001:
            problems.append('negative_balance')
        if float(w.get('bonus') or 0) < -0.001 or float(w.get('bonus') or 0) - bal > 0.01:
            problems.append('bonus_exceeds_balance_or_negative')
        if w.get('source_migrated') is not True:
            problems.append('wallet_category_split_unclassified')
        elif int(ledger_row.get('unclassified') or 0):
            problems.append('category_ledger_history_unclassified')
        else:
            components = {
                'topup': max(0.0, bal - float(w.get('bonus') or 0) - float(w.get('winning_bonus') or 0)
                             - float(w.get('withdrawable') or 0) - float(w.get('withdrawable_pending') or 0)),
                'bonus': float(w.get('bonus') or 0), 'winning_bonus': float(w.get('winning_bonus') or 0),
                'winning': float(w.get('withdrawable') or 0) + float(w.get('withdrawable_pending') or 0)
                           + paid_cashouts.get(w['user_id'], 0),
            }
            for category, current_value in components.items():
                if abs(round(current_value, 2) - round(float(ledger_row.get(category) or 0), 2)) >= 0.01:
                    problems.append(f'{category}_differs_from_ledger')
        if problems:
            recent = await db.wallet_tx.find({'user_id': w['user_id']},
                {'_id': 0, 'tx_id': 1, 'kind': 1, 'ref_order_id': 1, 'created_at': 1}).sort('created_at', -1).limit(5).to_list(5)
            mismatches.append({'user_id': w['user_id'], 'balance': bal, 'ledger_total_after_cashouts': ledger,
                'category_ledger': {key: round(float(ledger_row.get(key) or 0), 2)
                                    for key in ('topup', 'winning', 'winning_bonus', 'bonus')},
                'paid_cashout_tokens': round(paid_cashouts.get(w['user_id'], 0), 2),
                'unclassified_transaction_count': int(ledger_row.get('unclassified') or 0),
                'references': recent, 'problems': problems})
    return {
        'checked': checked, 'discrepancies': len(mismatches), 'sample': mismatches[:100],
        'after_user_id': after_user_id, 'next_after_user_id': rows[-1]['user_id'] if rows and has_more else None,
        'has_more': has_more,
        'note': 'Differences are reported only. Existing balances are never altered by reporting. Continue the cursor to inspect all wallets.',
    }
