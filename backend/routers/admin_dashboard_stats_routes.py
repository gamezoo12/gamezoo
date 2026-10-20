"""Admin dashboard: user statistics and wallet/token reporting, plus the authenticated activity ping.

Read-only reporting over existing authoritative records. Nothing here changes a balance;
discrepancies are reported, never silently corrected.
"""
from __future__ import annotations

import time
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user, require_admin
from services.analytics_common import REPORT_TZ_NAME, REPORT_TZ, is_staff, is_test_account, resolve_range, utcnow
from services.analytics_events import (
    FREE_ENTRY_SOURCE, GAME_ACTIVITY_SOURCES, GAME_START_SOURCES,
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
            'pending': {'$sum': {'$cond': [{'$and': [
                {'$eq': ['$source_migrated', True]}, {'$isNumber': '$bonus'},
                {'$isNumber': '$withdrawable'}, {'$isNumber': '$withdrawable_pending'},
            ]}, '$withdrawable_pending', 0]}},
            'purchased': {'$sum': {'$cond': [{'$and': [
                {'$eq': ['$source_migrated', True]}, {'$isNumber': '$bonus'},
                {'$isNumber': '$withdrawable'}, {'$isNumber': '$withdrawable_pending'},
            ]}, {'$max': [0, {'$subtract': ['$balance', {'$add': [
                '$bonus', '$withdrawable', '$withdrawable_pending']}]}]}, 0]}},
            'source_unknown_wallets': {'$sum': {'$cond': [{'$and': [
                {'$ne': ['$source_migrated', True]}, {'$gt': [{'$ifNull': ['$balance', 0]}, 0]},
            ]}, 1, 0]}},
            'source_unknown_balance': {'$sum': {'$cond': [{'$and': [
                {'$ne': ['$source_migrated', True]}, {'$gt': [{'$ifNull': ['$balance', 0]}, 0]},
            ]}, '$balance', 0]}},
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

    bonus_kinds = set(BONUS_TX_KINDS) | {'bonus_grant'}
    issued = credited(bonus_kinds)
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

    def due(hours):
        return {'user_id': {'$nin': exclude}, 'status': 'active', 'expires_at': {'$gt': now, '$lte': now + timedelta(hours=hours)}}

    due_24h = await _sum(db, 'bonus_grants', due(24), '$remaining_amount')
    due_7d = await _sum(db, 'bonus_grants', due(24 * 7), '$remaining_amount')
    paid_gbp = _gbp(await _sum(db, 'payment_transactions', {
        **uw, 'kind': 'wallet_topup', 'payment_status': 'paid'}, '$amount'))
    tokens_purchased = credited({'topup'})

    won_tokens = credited(set(WITHDRAWABLE_TX_KINDS))
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
            'notes': [
                'Source-labeled spend is exact for transactions written with per-source ledger fields. A lifetime total is unavailable while legacy spend rows lack that split.',
                'Grants created before expiry existed are untracked and never expire.',
            ],
        },
        'purchased_tokens': {
            'held': round(float(wallets.get('purchased', 0)), 2), 'purchased_total': tokens_purchased,
            'spent_total_all_token_types': debited({'spend'}),
            'topup_value_gbp': paid_gbp,
            'refunds_tokens': credited({'refund'}), 'admin_adjustments_tokens': {
                'credited': credited({'admin_adjust'}), 'debited': debited({'admin_adjust'})},
            'notes': ['Top-up value uses paid Stripe records only; tokens from mock/test top-ups have no GBP record.'],
        },
        'winnings': {
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
                                        'withdrawable': 1, 'withdrawable_pending': 1}).sort('user_id', 1).limit(limit + 1).to_list(limit + 1)
    has_more = len(rows) > limit
    rows = rows[:limit]
    ids = [w['user_id'] for w in rows]
    sums = {r['_id']: round(r['n'], 2) async for r in db.wallet_tx.aggregate([
        {'$match': {'user_id': {'$in': ids}}}, {'$group': {'_id': '$user_id', 'n': {'$sum': '$amount'}}}])} if ids else {}
    mismatches, checked = [], 0
    for w in rows:
        checked += 1
        bal = round(float(w.get('balance') or 0), 2)
        ledger = sums.get(w['user_id'], 0.0)
        problems = []
        if abs(bal - ledger) >= 0.01:
            problems.append('balance_differs_from_ledger')
        if bal < -0.001:
            problems.append('negative_balance')
        if float(w.get('bonus') or 0) < -0.001 or float(w.get('bonus') or 0) - bal > 0.01:
            problems.append('bonus_exceeds_balance_or_negative')
        if problems:
            mismatches.append({'user_id': w['user_id'], 'balance': bal, 'ledger_total': ledger, 'problems': problems})
    return {
        'checked': checked, 'discrepancies': len(mismatches), 'sample': mismatches[:100],
        'after_user_id': after_user_id, 'next_after_user_id': rows[-1]['user_id'] if rows and has_more else None,
        'has_more': has_more,
        'note': 'Differences are reported only. Existing balances are never altered by reporting. Continue the cursor to inspect all wallets.',
    }
