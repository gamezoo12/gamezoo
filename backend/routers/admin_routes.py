from fastapi import APIRouter, HTTPException, Request
from pydantic import EmailStr, TypeAdapter, ValidationError
import uuid
import logging
import re
from datetime import datetime, timedelta, timezone

from services.analytics_common import utcnow

from auth import require_admin, get_current_user, verify_password
from models import Winner  # noqa: F401 (kept for other endpoints that may use it)

router = APIRouter(prefix='/api/admin', tags=['admin'])
logger = logging.getLogger(__name__)


# Collections that are safe to wipe wholesale when the super admin clicks
# "Wipe Demo Data". Every entry here is either an audit trail or transient
# state; NONE of them contain irreplaceable config.
_WIPEABLE_COLLECTIONS = (
    'audit_log', 'admin_audit', 'winner_audit',
    'contests', 'contest_draws', 'game_scores',
    'instant_win_configs', 'instant_win_reveals', 'kyc',
    'leaderboard_entries', 'meera_log', 'notifications', 'orders',
    'payment_transactions', 'postal_entries', 'referrals', 'support_cases',
    'tickets', 'user_sessions', 'wallet_tx', 'winners',
)

_ADMIN_TIME_RANGES = {
    '1h': timedelta(hours=1),
    '6h': timedelta(hours=6),
    '24h': timedelta(hours=24),
    '7d': timedelta(days=7),
    '1m': timedelta(days=30),
    '6m': timedelta(days=182),
    '1y': timedelta(days=365),
    'lifetime': None,
}

_DASHBOARD_SEARCH_FIELDS = {
    'users': ('name', 'username', 'email', 'user_id'),
    'active_users': ('name', 'username', 'email', 'user_id'),
    'signups': ('name', 'username', 'email', 'user_id'),
    'orders': ('order_id', 'user_id', 'status', 'contest_id'),
    'revenue': ('order_id', 'user_id', 'status', 'contest_id'),
    'topups': ('session_id', 'user_id', 'payment_status', 'stripe_payment_intent_id'),
    'tickets': ('ticket_id', 'ticket_number', 'user_id', 'contest_id'),
    'visitors': ('visitor_id', 'user_id', 'source_key', 'page_path'),
    'page_views': ('visitor_id', 'user_id', 'page_path'),
    'paid_scores': ('score_id', 'ticket_id', 'user_id', 'contest_id'),
    'free_scores': ('user_id', 'global_contest_number'),
    'free_level_attempts': ('user_id', 'level', 'status', 'attempt_id'),
    'free_winnings': ('user_id', 'global_contest_number', 'status'),
    'paid_winnings': ('user_id', 'contest_id', 'status'),
    'live_contests': ('title', 'contest_id', 'status'),
    'free_token_spend': ('user_id', 'event_type', 'level', 'attempt_id'),
}


def _dashboard_search_filter(metric: str, query: str) -> dict:
    query = str(query or '').strip()[:100]
    fields = _DASHBOARD_SEARCH_FIELDS.get(metric, ())
    if not query or not fields:
        return {}
    pattern = re.escape(query)
    return {'$or': [{field: {'$regex': pattern, '$options': 'i'}} for field in fields]}


def _valid_period(period) -> bool:
    from services.analytics_common import RANGE_KEYS
    return period in RANGE_KEYS or period in _ADMIN_TIME_RANGES


def _range_match(period, field='created_at', start_date=None, end_date=None):
    if period in ('all_time', 'lifetime'):
        return {}, None
    from services.analytics_common import RANGE_KEYS, resolve_range
    if period in RANGE_KEYS:
        date_range = resolve_range(period, start_date, end_date)
        return {field: {'$gte': date_range['start'], '$lt': date_range['end']}}, date_range['start']
    return {}, None


async def _require_role(request: Request, allowed):
    user = await get_current_user(request)
    if user.get('role') not in allowed:
        raise HTTPException(status_code=403, detail=f'Requires one of: {allowed}')
    return user


@router.get('/leaderboards/contests')
async def admin_leaderboard_contests(request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    paid = await db.contests.find(
        {}, {'_id': 0, 'contest_id': 1, 'title': 1, 'status': 1, 'entry_mode': 1,
            'game_type': 1, 'start_date': 1, 'end_date': 1},
    ).sort([('start_date', -1), ('title', 1)]).to_list(1000)
    free_world = []
    if admin.get('role') == 'super_admin':
        free_world = await db.world_global_contests.find(
            {'season_id': 'season-1'},
            {'_id': 0, 'contest_number': 1, 'status': 1, 'start_at': 1, 'end_at': 1},
        ).sort('contest_number', 1).to_list(1000)
    return {'paid_contests': paid, 'free_world_contests': free_world}


@router.get('/leaderboards/paid/{contest_id}')
async def admin_paid_leaderboard(contest_id: str, request: Request, limit: int = 1000):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    contest = await db.contests.find_one(
        {'contest_id': contest_id},
        {'_id': 0, 'contest_id': 1, 'title': 1, 'status': 1},
    )
    if not contest:
        raise HTTPException(status_code=404, detail='Contest not found')
    pipeline = [
        {'$match': {'contest_id': contest_id}},
        {'$set': {'effective_duration_ms': {'$ifNull': ['$duration_ms_override', '$duration_ms']}}},
        {'$sort': {'points': -1, 'accuracy': -1, 'effective_duration_ms': 1, 'created_at': 1}},
        {'$group': {
            '_id': {'$ifNull': ['$ticket_id', '$user_id']},
            'ticket_id': {'$first': '$ticket_id'},
            'user_id': {'$first': '$user_id'},
            'user_name': {'$first': '$user_name'},
            'score_id': {'$first': '$score_id'},
            'points': {'$first': '$points'},
            'accuracy': {'$first': '$accuracy'},
            'original_duration_ms': {'$first': '$duration_ms'},
            'duration_ms': {'$first': '$effective_duration_ms'},
            'duration_ms_override': {'$first': '$duration_ms_override'},
            'duration_override_reason': {'$first': '$duration_override_reason'},
            'created_at': {'$first': '$created_at'},
            'attempts': {'$sum': 1},
        }},
        {'$sort': {'points': -1, 'accuracy': -1, 'duration_ms': 1, 'created_at': 1}},
        {'$limit': max(1, min(int(limit), 5000))},
    ]
    rows = await db.game_scores.aggregate(pipeline).to_list(None)
    user_ids = list({row.get('user_id') for row in rows if row.get('user_id')})
    users = await db.users.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'username': 1, 'email': 1, 'public_id': 1},
    ).to_list(len(user_ids)) if user_ids else []
    user_map = {user['user_id']: user for user in users}
    for rank, row in enumerate(rows, 1):
        row.pop('_id', None)
        row['rank'] = rank
        row['user'] = user_map.get(row.get('user_id'), {})
    return {'contest': contest, 'leaderboard': rows}


@router.get('/leaderboards/free-world/{contest_number}')
async def admin_free_world_leaderboard(contest_number: int, request: Request, limit: int = 1000):
    from auth import require_super_admin
    await require_super_admin(request)
    if not 1 <= contest_number <= 100:
        raise HTTPException(status_code=400, detail='Invalid Free World contest number')
    from deps import get_db
    db = get_db()
    contest = await db.world_global_contests.find_one(
        {'season_id': 'season-1', 'contest_number': contest_number}, {'_id': 0},
    )
    if not contest:
        raise HTTPException(status_code=404, detail='Free World contest not found')
    pipeline = [
        {'$match': {'season_id': 'season-1', 'global_contest_number': contest_number, 'eligible': True}},
        {'$set': {'effective_duration_ms': {'$ifNull': ['$duration_ms_override', '$duration_ms']}}},
        {'$sort': {'score': -1, 'effective_duration_ms': 1, 'submitted_at': 1}},
        {'$limit': max(1, min(int(limit), 5000))},
    ]
    rows = await db.world_champion_scores.aggregate(pipeline).to_list(None)
    user_ids = list({row.get('user_id') for row in rows if row.get('user_id')})
    users = await db.users.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'username': 1, 'email': 1, 'public_id': 1},
    ).to_list(len(user_ids)) if user_ids else []
    user_map = {user['user_id']: user for user in users}
    leaderboard = []
    for rank, row in enumerate(rows, 1):
        row.pop('_id', None)
        row['rank'] = rank
        row['original_duration_ms'] = row.get('duration_ms')
        row['duration_ms'] = row.pop('effective_duration_ms', row.get('duration_ms'))
        row['user'] = user_map.get(row.get('user_id'), {})
        leaderboard.append(row)
    return {'contest': contest, 'leaderboard': leaderboard}


async def _override_leaderboard_time(collection, score_id, payload, request, world):
    admin = await _require_role(request, ['super_admin'])
    duration_ms = payload.get('duration_ms')
    reason = (payload.get('reason') or '').strip()
    if isinstance(duration_ms, bool) or not isinstance(duration_ms, int) or not 100 <= duration_ms <= 1200000:
        raise HTTPException(status_code=400, detail='Time must be between 100 and 1,200,000 milliseconds')
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail='A reason of at least 10 characters is required')
    from deps import get_db
    db = get_db()
    score = await getattr(db, collection).find_one({'score_id': score_id}, {'_id': 0})
    if not score:
        raise HTTPException(status_code=404, detail='Leaderboard score not found')
    previous = int(score.get('duration_ms_override', score.get('duration_ms', 0)))
    if previous == duration_ms:
        return {'ok': True, 'unchanged': True, 'duration_ms': duration_ms}
    now = datetime.now(timezone.utc)
    update = await getattr(db, collection).update_one(
        {'score_id': score_id},
        {'$set': {
            'duration_ms_override': duration_ms,
            'duration_override_reason': reason,
            'duration_override_at': now,
            'duration_override_by': admin.get('user_id'),
        }},
    )
    if update.matched_count == 0:
        raise HTTPException(status_code=404, detail='Leaderboard score not found')
    await db.leaderboard_override_audit.insert_one({
        'score_id': score_id,
        'world': 'free_world' if world else 'paid',
        'contest_id': score.get('contest_id'),
        'contest_number': score.get('global_contest_number'),
        'user_id': score.get('user_id'),
        'previous_duration_ms': previous,
        'duration_ms': duration_ms,
        'reason': reason,
        'actor_user_id': admin.get('user_id'),
        'actor_email': admin.get('email'),
        'created_at': now,
    })
    return {'ok': True, 'previous_duration_ms': previous, 'duration_ms': duration_ms}


@router.put('/leaderboards/paid/{score_id}/time')
async def override_paid_leaderboard_time(score_id: str, payload: dict, request: Request):
    return await _override_leaderboard_time('game_scores', score_id, payload, request, False)


@router.put('/leaderboards/free-world/{score_id}/time')
async def override_free_world_leaderboard_time(score_id: str, payload: dict, request: Request):
    return await _override_leaderboard_time('world_champion_scores', score_id, payload, request, True)


@router.get('/stats')
async def stats(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    users_count = await db.users.count_documents({})
    contests_count = await db.contests.count_documents({})
    orders_count = await db.orders.count_documents({})
    tickets_count = await db.tickets.count_documents({})
    kyc_pending = await db.kyc.count_documents({'status': 'pending'})
    rev = await db.orders.aggregate([{'$group': {'_id': None, 'total': {'$sum': '$total'}}}]).to_list(1)
    revenue = rev[0]['total'] if rev else 0
    pp = await db.contests.aggregate([{'$group': {'_id': None, 'total': {'$sum': '$prize_amount'}}}]).to_list(1)
    prize_pool = pp[0]['total'] if pp else 0
    return {
        'users': users_count, 'contests': contests_count, 'orders': orders_count,
        'tickets_sold': tickets_count, 'revenue': revenue, 'prize_pool': prize_pool,
        'kyc_pending': kyc_pending,
    }


@router.get('/dashboard/summary')
async def dashboard_summary(request: Request, period: str = '24h', window_hours: int = None,
                            start_date: str = None, end_date: str = None):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    if window_hours is not None:
        window_hours = max(1, min(int(window_hours), 8760))
        period = 'lifetime' if window_hours >= 8760 else '24h' if window_hours == 24 else f'{window_hours}h'
    if not _valid_period(period):
        raise HTTPException(status_code=400, detail='Unsupported dashboard period')
    user_match, since = _range_match(period, start_date=start_date, end_date=end_date)
    order_match, _ = _range_match(period, 'created_at', start_date, end_date)
    ticket_match, _ = _range_match(period, 'created_at', start_date, end_date)
    score_match, _ = _range_match(period, 'created_at', start_date, end_date)
    free_score_match, _ = _range_match(period, 'submitted_at', start_date, end_date)
    award_match, _ = _range_match(period, 'created_at', start_date, end_date)
    paid_winner_match, _ = _range_match(period, 'paid_at', start_date, end_date)
    paid_winner_match['paid_out'] = True

    from services.analytics_events import excluded_user_ids
    users = await db.users.count_documents({**user_match, 'user_id': {'$nin': await excluded_user_ids(db)}})
    paid_order_match = {**order_match, 'status': 'paid'}
    refunded_order_match = {**order_match, 'status': 'refunded'}
    orders = await db.orders.count_documents(paid_order_match)
    orders_total = await db.orders.aggregate([
        {'$match': paid_order_match},
        {'$group': {'_id': None, 'total': {'$sum': '$total'}}},
    ]).to_list(1)
    revenue_gross = (orders_total[0]['total'] if orders_total else 0)
    refunds_total = await db.orders.aggregate([
        {'$match': refunded_order_match},
        {'$group': {'_id': None, 'total': {'$sum': '$total'}}},
    ]).to_list(1)
    refunds = refunds_total[0]['total'] if refunds_total else 0
    revenue = max(0, revenue_gross - refunds)
    tickets = await db.tickets.count_documents(ticket_match)
    topup_match = {**order_match, 'kind': 'wallet_topup', 'payment_status': 'paid'}
    topups = await db.payment_transactions.aggregate([
        {'$match': topup_match},
        {'$group': {'_id': None, 'count': {'$sum': 1}, 'amount_pence': {'$sum': '$amount'}}},
    ]).to_list(1)
    topup_summary = topups[0] if topups else {'count': 0, 'amount_pence': 0}
    live_payment_match = {**order_match, 'kind': 'wallet_topup', 'payment_status': 'paid',
                          'currency': 'gbp', 'stripe_livemode': True}
    live_payment = await db.payment_transactions.aggregate([
        {'$match': live_payment_match},
        {'$group': {'_id': None, 'received': {'$sum': {'$ifNull': ['$amount_received_pence', '$amount']}},
                    'refunds': {'$sum': {'$ifNull': ['$amount_refunded_pence', 0]}}, 'count': {'$sum': 1}}},
    ]).to_list(1)
    live_payment_summary = live_payment[0] if live_payment else {'received': 0, 'refunds': 0, 'count': 0}
    live_contests = await db.contests.count_documents({'status': 'live'})
    from routers.acquisition_reports_routes import traffic_totals
    traffic = await traffic_totals(db, period, start_date, end_date)
    visits, page_views = traffic['visits'], traffic['page_views']
    signups = users
    paid_scores = await db.game_scores.count_documents(score_match)
    paid_participants = await db.game_scores.distinct('user_id', score_match)
    free_world_scores = await db.world_champion_scores.count_documents(free_score_match)
    free_world_level_attempts = await db.world_level_attempts.count_documents(order_match)
    free_world_token_unlock_cost = await db.world_level_unlock_reservations.aggregate([
        {'$match': {**order_match, 'token_cost': {'$exists': True}}},
        {'$group': {'_id': None, 'total': {'$sum': '$token_cost'}}},
    ]).to_list(1)
    free_world_token_retry_cost = await db.world_token_retry_reservations.aggregate([
        {'$match': {**order_match, 'token_cost': {'$exists': True}}},
        {'$group': {'_id': None, 'total': {'$sum': '$token_cost'}}},
    ]).to_list(1)
    free_world_winnings_total = await db.world_winner_awards.aggregate([
        {'$match': award_match},
        {'$group': {'_id': None, 'total': {'$sum': '$winning_amount'}}},
    ]).to_list(1)
    paid_world_winnings_total = await db.winners.aggregate([
        {'$match': paid_winner_match},
        {'$group': {'_id': None, 'cash_tokens': {'$sum': {'$ifNull': ['$prize_cash_amount', '$prize_amount']}},
                    'bonus_tokens': {'$sum': {'$ifNull': ['$prize_bonus_tokens', 0]}}}},
    ]).to_list(1)
    challenge_match = {'started_at': {'$gte': free_score_match.get('submitted_at', {}).get('$gte', since),
                                      '$lt': free_score_match.get('submitted_at', {}).get('$lt', utcnow() + timedelta(seconds=1))}}
    if since is None:
        challenge_match = {'started_at': {'$exists': True}}
    challenge_attempts = await db.special_challenge_attempts.count_documents(challenge_match)
    challenge_completions = await db.special_challenge_attempts.count_documents({
        **challenge_match, 'completed_at': {'$ne': None},
    })
    challenge_players = await db.special_challenge_attempts.distinct('user_id', challenge_match)
    challenge_rewards = await db.special_challenge_rewards.aggregate([
        {'$match': {'reward_status': 'credited', **_range_match(period, 'credited_at', start_date, end_date)[0]}},
        {'$group': {'_id': None, 'count': {'$sum': 1}, 'pence': {'$sum': '$reward_pence'}}},
    ]).to_list(1)
    influencer_visits = await db.influencer_visits.count_documents(order_match)
    influencer_signups = await db.influencer_attributions.count_documents(order_match)
    influencer_eligible_signups = await db.influencer_attributions.count_documents(
        {**order_match, 'registration_eligible': True})
    influencer_topups = await db.influencer_topup_events.aggregate([
        {'$match': {**order_match, 'qualifies': True}},
        {'$group': {'_id': None, 'count': {'$sum': 1}, 'amount_pence': {'$sum': '$amount_pence'}}},
    ]).to_list(1)
    influencer_commission = await db.influencer_commissions.aggregate([
        {'$match': {**order_match, 'status': {'$in': ['pending', 'approved', 'payment_processing', 'paid']}}},
        {'$group': {'_id': None, 'amount_pence': {'$sum': '$amount_pence'}}},
    ]).to_list(1)
    active_influencers = await db.influencers.count_documents({'status': 'active'})

    return {
        'period': period,
        'since': since.isoformat() if since else None,
        'summary': {
            'users': users,
            'signups': signups,
            'orders': orders,
            'revenue': revenue,
            'revenue_gross': revenue_gross,
            'refunds': refunds,
            'tickets': tickets,
            'topups': {'count': topup_summary.get('count', 0),
                       'amount_gbp': round(float(topup_summary.get('amount_pence', 0)) / 100, 2)},
            'live_stripe_topups': {'count': int(live_payment_summary.get('count', 0)),
                                   'cash_received_gbp': round(float(live_payment_summary.get('received', 0)) / 100, 2),
                                   'refunds_gbp': round(float(live_payment_summary.get('refunds', 0)) / 100, 2),
                                   'stripe_fees_gbp': None, 'recognized_revenue_gbp': None},
            'gross_paid_contest_order_value_gbp': round(float(revenue_gross), 2),
            'paid_contest_order_refunds_gbp': round(float(refunds), 2),
            'net_revenue_gbp': None,
            'live_contests': live_contests,
            'visits': visits,
            'page_views': page_views,
            'unique_visitors': traffic['unique_visitors'],
            'sessions': traffic['sessions'],
        },
        'paid_world': {
            'scores': paid_scores,
            'unique_participants': len([user_id for user_id in paid_participants if user_id]),
            'orders': orders,
            'revenue': revenue,
            'winnings_paid': (paid_world_winnings_total[0].get('cash_tokens', 0) if paid_world_winnings_total else 0),
            'winning_bonus_tokens_paid': (paid_world_winnings_total[0].get('bonus_tokens', 0) if paid_world_winnings_total else 0),
        },
        'free_world': {
            'scores': free_world_scores,
            'level_attempts': free_world_level_attempts,
            'token_spend': (free_world_token_unlock_cost[0]['total'] if free_world_token_unlock_cost else 0) + (free_world_token_retry_cost[0]['total'] if free_world_token_retry_cost else 0),
            'winnings_paid': (free_world_winnings_total[0]['total'] if free_world_winnings_total else 0),
        },
        'impossible_challenges': {
            'attempts_started': challenge_attempts, 'completed_plays': challenge_completions,
            'unique_players': len([uid for uid in challenge_players if uid]),
            'winnings_awarded_gbp': round(float(challenge_rewards[0].get('pence', 0)) / 100, 2) if challenge_rewards else 0,
            'winnings_credits': int(challenge_rewards[0].get('count', 0)) if challenge_rewards else 0,
        },
        'influencers': {
            'active': active_influencers, 'visits': influencer_visits,
            'registrations': influencer_signups, 'eligible_registrations': influencer_eligible_signups,
            'qualifying_topups': (influencer_topups[0].get('count', 0) if influencer_topups else 0),
            'qualifying_topup_gbp': round((influencer_topups[0].get('amount_pence', 0) if influencer_topups else 0) / 100, 2),
            'commission_gbp': round((influencer_commission[0].get('amount_pence', 0) if influencer_commission else 0) / 100, 2),
        },
    }


@router.get('/dashboard/recent-activity')
async def dashboard_recent_activity(request: Request, period: str = '30d', limit: int = 50,
                                    start_date: str = None, end_date: str = None):
    await require_admin(request)
    from deps import get_db
    from services.analytics_events import excluded_user_ids
    db = get_db()
    limit = max(1, min(int(limit), 100))
    excluded = await excluded_user_ids(db)
    activities = []

    async def collect(collection, kind, title, field='created_at', query=None, amount_field=None,
                      amount_unit='tokens', reference_field=None, title_by_row=False):
        match = {**_range_match(period, field, start_date, end_date)[0],
                 'user_id': {'$nin': excluded}, **(query or {})}
        rows = await db[collection].find(match, {'_id': 0}).sort(field, -1).limit(limit).to_list(limit)
        for row in rows:
            amount = row.get(amount_field) if amount_field else None
            if amount is None and amount_field == 'amount_received_pence':
                amount = row.get('amount')
            if amount is not None and amount_unit == 'pence':
                amount = round(float(amount) / 100, 2)
            label = title(row) if title_by_row else title
            activities.append({
                'kind': kind, 'title': label, 'user_id': row.get('user_id'),
                'amount_tokens': amount if amount_unit == 'tokens' else None,
                'amount_gbp': amount if amount_unit in ('gbp', 'pence') else None,
                'created_at': row.get(field), 'reference': row.get(reference_field) if reference_field else None,
            })

    await collect('users', 'registration', 'New registration', query={'erased': {'$ne': True}}, reference_field='public_id')
    await collect('payment_transactions', 'topup',
                  lambda row: f"Successful Stripe top-up ({'live' if row.get('stripe_livemode') else 'test/unknown'})",
                  query={'kind': 'wallet_topup', 'payment_status': 'paid', 'currency': 'gbp'},
                  amount_field='amount_received_pence', amount_unit='pence', reference_field='session_id', title_by_row=True)
    await collect('game_scores', 'paid_world_play', 'Paid World game played', reference_field='contest_id')
    await collect('world_level_attempts', 'free_world_play', 'Free World level played', reference_field='attempt_id')
    await collect('world_champion_scores', 'free_world_champion', 'Free World champion played',
                  field='submitted_at', reference_field='global_contest_number')
    await collect('special_challenge_attempts', 'challenge_play', 'Impossible Challenge played',
                  field='started_at', reference_field='attempt_id')
    await collect('tickets', 'contest_entry', 'Paid contest entry', reference_field='contest_id')
    transaction_titles = {
        'topup': 'Top-up',
        'paid_prize_cash': 'Paid World cash prize credited', 'paid_prize_bonus': 'Winning Bonus Tokens credited',
        'champion_prize': 'Free World prize credited', 'championship_prize': 'Free World prize credited',
        'winnings': 'Winning Tokens credited', 'signup_bonus': 'Signup bonus credited',
        'referral_bonus': 'Referral bonus credited', 'referral': 'Referral bonus credited',
        'bonus_grant': 'Bonus tokens credited', 'influencer_bonus': 'Influencer bonus credited',
        'promo_bonus': 'Promotion bonus credited', 'bonus_expiry': 'Bonus tokens expired',
        'bonus_revoke': 'Bonus tokens revoked', 'admin_adjust': 'Admin wallet adjustment',
    }
    await collect('wallet_tx', 'wallet_transaction', lambda row: transaction_titles.get(row.get('kind'), 'Wallet transaction'),
                  query={'kind': {'$in': list(transaction_titles)}, 'amount': {'$ne': 0}},
                  amount_field='amount', reference_field='ref_order_id', title_by_row=True)
    await collect('cashout_requests', 'cashout_request',
                  lambda row: f"Cashout {row.get('status') or 'requested'}", amount_field='amount_gbp',
                  amount_unit='gbp', reference_field='withdrawal_id', title_by_row=True)
    await collect('withdrawal_requests', 'withdrawal_request',
                  lambda row: f"Withdrawal {row.get('status') or 'requested'}", amount_field='amount_pence',
                  amount_unit='pence', reference_field='withdrawal_id', title_by_row=True)
    activities.sort(key=lambda row: row.get('created_at') or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return {'period': period, 'items': activities[:limit], 'count': min(len(activities), limit), 'limit': limit}


@router.get('/dashboard/details')
async def dashboard_details(
    request: Request,
    metric: str,
    period: str = '24h',
    skip: int = 0,
    limit: int = 100,
    start_date: str = None,
    end_date: str = None,
    q: str = '',
):
    await require_admin(request)
    from deps import get_db
    if not _valid_period(period):
        raise HTTPException(status_code=400, detail='Unsupported dashboard period')
    if period == 'custom':
        from services.analytics_common import resolve_range
        resolve_range(period, start_date, end_date)
    db = get_db()
    skip = max(0, int(skip))
    limit = max(1, min(int(limit), 500))
    search_filter = _dashboard_search_filter(metric, q)
    sources = {
        'users': ('users', 'created_at'),
        'signups': ('users', 'created_at'),
        'orders': ('orders', 'created_at'),
        'revenue': ('orders', 'created_at'),
        'topups': ('payment_transactions', 'created_at'),
        'tickets': ('tickets', 'created_at'),
        'visitors': ('acquisition_visits', 'created_at'),
        'page_views': ('acquisition_page_views', 'created_at'),
        'paid_scores': ('game_scores', 'created_at'),
        'free_scores': ('world_champion_scores', 'submitted_at'),
        'free_level_attempts': ('world_level_attempts', 'created_at'),
        'free_winnings': ('world_winner_awards', 'created_at'),
        'paid_winnings': ('winners', 'drawn_at'),
    }

    if metric == 'active_users':
        from routers.admin_dashboard_stats_routes import _active_users
        from services.analytics_common import resolve_range
        from services.analytics_events import excluded_user_ids
        window = resolve_range(period, start_date, end_date)
        exclude = await excluded_user_ids(db)
        ids = await _active_users(db, window['start'], window['end'], exclude)
        if search_filter:
            matching = await db.users.find(
                {'user_id': {'$in': list(ids)}, **search_filter}, {'_id': 0, 'user_id': 1}
            ).to_list(len(ids))
            ids = {row['user_id'] for row in matching}
        total = len(ids)
        items = await db.users.find({'user_id': {'$in': list(ids)}}, {
            '_id': 0, 'user_id': 1, 'name': 1, 'username': 1, 'email': 1,
            'created_at': 1, 'last_active_at': 1, 'fw_last_login_at': 1,
        }).sort('last_active_at', -1).skip(skip).limit(limit).to_list(limit)
        return {'metric': metric, 'period': period, 'total': total, 'skip': skip, 'limit': limit, 'items': items}

    if metric == 'live_contests':
        match = {'status': 'live', **search_filter}
        total = await db.contests.count_documents(match)
        items = await db.contests.find(match, {'_id': 0}).sort('end_date', 1).skip(skip).limit(limit).to_list(limit)
        return {'metric': metric, 'period': period, 'total': total, 'skip': skip, 'limit': limit, 'items': items}

    if metric == 'visitors':
        from routers.acquisition_reports_routes import public_view_match
        match = await public_view_match(db, period, start_date, end_date)
        if search_filter:
            match = {'$and': [match, search_filter]}
        totals = await db.acquisition_page_views.aggregate([
            {'$match': match}, {'$group': {'_id': '$visitor_id'}}, {'$count': 'total'},
        ]).to_list(1)
        items = await db.acquisition_page_views.aggregate([
            {'$match': match},
            {'$sort': {'created_at': 1}},
            {'$group': {
                '_id': '$visitor_id', 'visitor_id': {'$first': '$visitor_id'}, 'user_id': {'$last': '$user_id'},
                'source': {'$first': '$source_key'}, 'landing_path': {'$first': '$page_path'},
                'last_seen': {'$max': '$created_at'}, 'page_views': {'$sum': 1},
                'sessions': {'$addToSet': '$session_id'},
            }},
            {'$addFields': {'visit_count': {'$size': '$sessions'}}},
            {'$sort': {'last_seen': -1}},
            {'$skip': skip}, {'$limit': limit},
            {'$project': {'_id': 0, 'sessions': 0}},
        ]).to_list(limit)
        user_ids = list({row.get('user_id') for row in items if row.get('user_id')})
        users = await db.users.find(
            {'user_id': {'$in': user_ids}},
            {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1},
        ).to_list(len(user_ids)) if user_ids else []
        user_map = {user['user_id']: user for user in users}
        for row in items:
            row['user'] = user_map.get(row.get('user_id'), {})
        return {'metric': metric, 'period': period, 'total': totals[0]['total'] if totals else 0, 'skip': skip, 'limit': limit, 'items': items}

    if metric == 'free_token_spend':
        combined = []
        for collection_name, kind in (
            ('world_level_unlock_reservations', 'level_unlock'),
            ('world_token_retry_reservations', 'level_retry'),
        ):
            date_match, _ = _range_match(period, start_date=start_date, end_date=end_date)
            if search_filter:
                date_match.update(search_filter)
            rows = await getattr(db, collection_name).find(
                {**date_match, 'token_cost': {'$exists': True}}, {'_id': 0},
            ).sort('created_at', -1).to_list(10000)
            combined.extend({**row, 'event_type': kind} for row in rows)
        combined.sort(key=lambda row: str(row.get('created_at') or ''), reverse=True)
        return {'metric': metric, 'period': period, 'total': len(combined), 'skip': skip, 'limit': limit, 'items': combined[skip:skip + limit]}

    source = sources.get(metric)
    if not source:
        raise HTTPException(status_code=400, detail='Unsupported dashboard detail metric')
    collection_name, date_field = source
    date_match, _ = _range_match(period, date_field, start_date, end_date)
    if search_filter:
        date_match.update(search_filter)
    if metric in ('users', 'signups', 'topups'):
        from services.analytics_events import excluded_user_ids
        date_match['user_id'] = {'$nin': await excluded_user_ids(db)}
    if metric == 'users' and 'created_at' in date_match:
        date_match['created_at'] = {'$lt': date_match['created_at']['$lt']}  # registered as of the period end
    if metric == 'page_views':
        from routers.acquisition_reports_routes import public_view_match
        date_match = {**(await public_view_match(db, period, start_date, end_date)),
                      **({'$or': search_filter['$or']} if search_filter else {})}
    if metric in ('orders', 'revenue'):
        date_match['status'] = 'paid'
    elif metric == 'topups':
        date_match.update({'kind': 'wallet_topup', 'payment_status': 'paid'})
    collection = getattr(db, collection_name)
    total = await collection.count_documents(date_match)
    projection = {'_id': 0, 'password_hash': 0}
    items = await collection.find(date_match, projection).sort(date_field, -1).skip(skip).limit(limit).to_list(limit)

    if metric in ('orders', 'revenue'):
        items = await _enrich_orders_with_user(db, items)
    elif metric == 'topups':
        user_ids = list({item.get('user_id') for item in items if item.get('user_id')})
        users = await db.users.find(
            {'user_id': {'$in': user_ids}},
            {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1},
        ).to_list(len(user_ids)) if user_ids else []
        user_map = {user['user_id']: user for user in users}
        for item in items:
            item['user'] = user_map.get(item.get('user_id'), {})
    elif metric in ('users', 'signups'):
        for item in items:
            item.pop('password_hash', None)
    elif metric in ('tickets', 'paid_scores', 'free_scores', 'free_level_attempts', 'free_winnings', 'paid_winnings'):
        user_ids = list({item.get('user_id') for item in items if item.get('user_id')})
        users = await db.users.find(
            {'user_id': {'$in': user_ids}},
            {'_id': 0, 'user_id': 1, 'name': 1, 'username': 1, 'email': 1, 'public_id': 1},
        ).to_list(len(user_ids)) if user_ids else []
        user_map = {user['user_id']: user for user in users}
        for item in items:
            item['user'] = user_map.get(item.get('user_id'), {})
    return {'metric': metric, 'period': period, 'total': total, 'skip': skip, 'limit': limit, 'items': items}


@router.get('/audit-logs')
async def audit_logs(request: Request, limit: int = 200):
    """All admin audit logs across the platform. Combines winner_audit and any
    future admin_audit collection. Read-only.
    """
    await require_admin(request)
    from deps import get_db
    db = get_db()
    limit = max(10, min(1000, limit))
    winner_logs = await db.winner_audit.find({}, {'_id': 0}).sort('at', -1).to_list(limit)
    for e in winner_logs:
        e['source'] = 'winner_selection'
    # Support cases activity (create + status changes)
    support_cases = await db.support_cases.find({}, {'_id': 0}).sort('updated_at', -1).to_list(limit)
    support_logs = []
    for c in support_cases:
        support_logs.append({
            'at': c.get('updated_at') or c.get('created_at'),
            'source': 'support_case',
            'action': f'case_{c.get("status", "open")}',
            'admin_id': c.get('closed_by'),
            'target': c.get('case_id'),
            'meta': {'subject': c.get('subject'), 'user_id': c.get('user_id')},
        })
    combined = sorted(winner_logs + support_logs, key=lambda x: x.get('at') or '', reverse=True)
    return {'logs': combined[:limit], 'count': len(combined)}


@router.get('/users')
async def all_users(request: Request):
    await require_admin(request)

    from deps import get_db
    db = get_db()

    users = await db.users.find(
        {},
        {'_id': 0, 'password_hash': 0},
    ).sort('created_at', -1).to_list(5000)

    if not users:
        return users

    user_ids = [
        u['user_id']
        for u in users
        if u.get('user_id')
    ]

    from services.push_delivery import web_push_status
    push_device_counts = {}
    if user_ids:
        push_devices = await db.web_push_subscriptions.find(
            {'user_id': {'$in': user_ids}, 'active': True},
            {'_id': 0, 'user_id': 1},
        ).to_list(None)
        for device in push_devices:
            device_user_id = device.get('user_id')
            if device_user_id:
                push_device_counts[device_user_id] = push_device_counts.get(device_user_id, 0) + 1

    # Tickets
    tickets_agg = await db.tickets.aggregate([
        {
            '$match': {
                'user_id': {'$in': user_ids}
            }
        },
        {
            '$group': {
                '_id': '$user_id',
                'count': {'$sum': 1},
                'contest_ids': {'$addToSet': '$contest_id'},
            }
        },
    ]).to_list(None)

    tickets_by_user = {
        t['_id']: {
            'tickets': t.get('count', 0),
            'contests': len(t.get('contest_ids') or []),
        }
        for t in tickets_agg
    }

    # Orders / spend
    orders_agg = await db.orders.aggregate([
        {
            '$match': {
                'user_id': {'$in': user_ids},
                'status': {'$ne': 'refunded'},
            }
        },
        {
            '$group': {
                '_id': '$user_id',
                'orders_count': {'$sum': 1},
                'spent': {'$sum': '$total'},
            }
        },
    ]).to_list(None)

    orders_by_user = {
        o['_id']: {
            'orders_count': o.get('orders_count', 0),
            'spent': float(o.get('spent') or 0),
        }
        for o in orders_agg
    }

    # KYC
    kyc_docs = await db.kyc.find(
        {'user_id': {'$in': user_ids}},
        {
            '_id': 0,
            'user_id': 1,
            'status': 1,
        },
    ).to_list(None)

    kyc_by_user = {
        k['user_id']: k.get('status', 'none')
        for k in kyc_docs
    }

    # Wallets
    wallets = await db.wallets.find(
        {'user_id': {'$in': user_ids}},
        {
            '_id': 0,
            'user_id': 1,
            'balance': 1,
            'bonus': 1,
            'winning_bonus': 1,
            'withdrawable': 1,
            'withdrawable_pending': 1,
            'source_migrated': 1,
            'lifetime_topup': 1,
            'lifetime_spend': 1,
        },
    ).to_list(None)

    wallets_by_user = {
        w['user_id']: w
        for w in wallets
    }

    # Referrals where user joined through personal referral
    joined_refs = await db.referrals.find(
        {
            'referred_user_id': {'$in': user_ids},
        },
        {
            '_id': 0,
            'referred_user_id': 1,
            'status': 1,
            'reward_granted': 1,
            'topup_qualified': 1,
            'contest_entered': 1,
            'code': 1,
        },
    ).to_list(None)

    joined_ref_by_user = {
        r['referred_user_id']: r
        for r in joined_refs
    }

    # Influencer attribution
    influencer_rows = await db.influencer_attributions.find(
        {
            'user_id': {'$in': user_ids},
        },
        {
            '_id': 0,
            'user_id': 1,
            'promo_id': 1,
            'code': 1,
            'influencer_name': 1,
            'campaign_name': 1,
            'status': 1,
            'topup_qualified': 1,
            'contest_entered': 1,
            'reward_granted': 1,
            'reward_tokens': 1,
        },
    ).to_list(None)

    influencer_by_user = {
        a['user_id']: a
        for a in influencer_rows
    }

    # Winnings
    winnings_agg = await db.winners.aggregate([
        {
            '$match': {
                'user_id': {'$in': user_ids},
            }
        },
        {
            '$group': {
                '_id': '$user_id',
                'winnings': {'$sum': '$prize_amount'},
                'wins': {'$sum': 1},
            }
        },
    ]).to_list(None)

    winnings_by_user = {
        w['_id']: {
            'winnings': float(w.get('winnings') or 0),
            'wins': w.get('wins', 0),
        }
        for w in winnings_agg
    }

    from auth import phone_is_verified
    for u in users:
        uid = u['user_id']

        u['phone_verified'] = phone_is_verified(u)

        u['web_push_device_count'] = push_device_counts.get(uid, 0)
        u['web_push_status'] = web_push_status(u, u['web_push_device_count'])

        ticket_stats = tickets_by_user.get(uid, {})
        order_stats = orders_by_user.get(uid, {})
        wallet = wallets_by_user.get(uid, {})
        joined_ref = joined_ref_by_user.get(uid)
        influencer = influencer_by_user.get(uid)
        win_stats = winnings_by_user.get(uid, {})

        u['tickets'] = ticket_stats.get('tickets', 0)
        u['contests_count'] = ticket_stats.get('contests', 0)

        u['orders_count'] = order_stats.get('orders_count', 0)
        u['spent'] = order_stats.get('spent', 0)

        u['kyc_status'] = kyc_by_user.get(uid, 'none')

        u['wallet_balance'] = float(wallet.get('balance') or 0)
        if wallet.get('source_migrated') is True:
            bonus_tokens = float(wallet.get('bonus') or 0)
            winning_bonus_tokens = float(wallet.get('winning_bonus') or 0)
            winning_tokens = float(wallet.get('withdrawable') or 0)
            pending_tokens = float(wallet.get('withdrawable_pending') or 0)
            topup_tokens = max(0.0, u['wallet_balance'] - bonus_tokens - winning_bonus_tokens
                               - winning_tokens - pending_tokens)
            u['wallet_categories'] = {
                'topup_tokens': round(topup_tokens, 2),
                'winning_tokens': round(winning_tokens, 2),
                'winning_bonus_tokens': round(winning_bonus_tokens, 2),
                'bonus_tokens': round(bonus_tokens, 2),
                'total_tokens': round(topup_tokens + winning_tokens + winning_bonus_tokens + bonus_tokens, 2),
                'cashout_available': round(winning_tokens, 2),
                'classified': True,
            }
        else:
            u['wallet_categories'] = {'classified': False}
        u['lifetime_topup'] = float(wallet.get('lifetime_topup') or 0)
        u['lifetime_spend'] = float(wallet.get('lifetime_spend') or 0)

        u['winnings'] = win_stats.get('winnings', 0)
        u['wins'] = win_stats.get('wins', 0)

        if influencer:
            u['acquisition_type'] = 'influencer'
            u['influencer_code'] = influencer.get('code')
            u['influencer_name'] = influencer.get('influencer_name')
            u['influencer_campaign'] = influencer.get('campaign_name')
            u['influencer_reward_granted'] = bool(
                influencer.get('reward_granted')
            )
            u['influencer_reward_status'] = influencer.get('status')
        elif joined_ref:
            u['acquisition_type'] = 'referral'
            u['joined_referral_code'] = joined_ref.get('code')
            u['referral_reward_granted'] = bool(
                joined_ref.get('reward_granted')
            )
            u['referral_status'] = joined_ref.get('status')
        else:
            u['acquisition_type'] = (
                u.get('acquisition_type')
                or 'organic'
            )

        u['signup_bonus_status'] = (
            'granted'
            if u.get('signup_bonus_granted')
            else (
                'eligible'
                if u.get('signup_bonus_offer_eligible')
                else 'none'
            )
        )

    return users


@router.put('/users/{user_id}')
async def update_user(user_id: str, payload: dict, request: Request):
    admin = await _require_role(
        request,
        ['admin', 'super_admin'],
    )

    from deps import get_db
    from routers.twilio_routes import _normalize_phone

    db = get_db()

    current = await db.users.find_one(
        {'user_id': user_id},
    )

    if not current:
        raise HTTPException(
            status_code=404,
            detail='User not found',
        )

    allowed = {
        'name',
        'username',
        'email',
        'phone',
        'dob',
        'address',
        'picture',
        'role',
    }

    updates = {
        k: v
        for k, v in (payload or {}).items()
        if k in allowed
    }

    if not updates:
        raise HTTPException(
            status_code=400,
            detail='No editable profile fields supplied',
        )

    # -----------------------------------------
    # Name
    # -----------------------------------------
    if 'name' in updates:
        name = str(updates['name'] or '').strip()

        if not name:
            raise HTTPException(
                status_code=400,
                detail='Name cannot be empty',
            )

        if len(name) > 160:
            raise HTTPException(
                status_code=400,
                detail='Name is too long',
            )

        updates['name'] = name

    # -----------------------------------------
    # Username
    # -----------------------------------------
    if 'username' in updates:
        username = str(
            updates['username'] or ''
        ).strip()

        if username:
            if len(username) > 80:
                raise HTTPException(
                    status_code=400,
                    detail='Username is too long',
                )

            duplicate = await db.users.find_one(
                {
                    'username': username,
                    'user_id': {'$ne': user_id},
                },
                {'_id': 1},
            )

            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail='Username is already in use',
                )

            updates['username'] = username
        else:
            updates['username'] = None

    # -----------------------------------------
    # Email
    # -----------------------------------------
    if 'email' in updates:
        raw_email = str(
            updates['email'] or ''
        ).strip().lower()

        try:
            validated_email = str(
                TypeAdapter(EmailStr).validate_python(
                    raw_email
                )
            )
        except ValidationError:
            raise HTTPException(
                status_code=400,
                detail='Invalid email address',
            )

        duplicate = await db.users.find_one(
            {
                'email': validated_email,
                'user_id': {'$ne': user_id},
            },
            {'_id': 1},
        )

        if duplicate:
            raise HTTPException(
                status_code=409,
                detail='Email address is already in use',
            )

        updates['email'] = validated_email

        # There is currently no production email-verification provider.
        # Keep the flag false when an email address changes.
        if validated_email != (
            str(current.get('email') or '')
            .strip()
            .lower()
        ):
            updates['email_verified'] = False
            updates['email_verified_at'] = None

    # -----------------------------------------
    # Phone
    # -----------------------------------------
    if 'phone' in updates:
        raw_phone = str(
            updates['phone'] or ''
        ).strip()

        if raw_phone:
            phone = _normalize_phone(raw_phone)

            duplicate = await db.users.find_one(
                {
                    'phone': phone,
                    'user_id': {'$ne': user_id},
                },
                {'_id': 1},
            )

            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail='Phone number is already in use',
                )

            updates['phone'] = phone

            if phone != current.get('phone'):
                updates['phone_verified'] = False
                updates['phone_verified_at'] = None
        else:
            updates['phone'] = None
            updates['phone_verified'] = False
            updates['phone_verified_at'] = None

    # -----------------------------------------
    # DOB
    # -----------------------------------------
    if 'dob' in updates:
        raw_dob = str(
            updates['dob'] or ''
        ).strip()

        if raw_dob:
            try:
                dob = datetime.strptime(
                    raw_dob,
                    '%Y-%m-%d',
                ).date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail='DOB must use YYYY-MM-DD',
                )

            today = datetime.now(
                timezone.utc
            ).date()

            age = (
                today.year
                - dob.year
                - (
                    (today.month, today.day)
                    < (dob.month, dob.day)
                )
            )

            if age < 18:
                raise HTTPException(
                    status_code=400,
                    detail='User must be at least 18 years old',
                )

            updates['dob'] = raw_dob
        else:
            updates['dob'] = None

    # -----------------------------------------
    # Address / picture
    # -----------------------------------------
    for field, maximum in (
        ('address', 500),
        ('picture', 2000),
    ):
        if field in updates:
            value = str(
                updates[field] or ''
            ).strip()

            if len(value) > maximum:
                raise HTTPException(
                    status_code=400,
                    detail=f'{field} is too long',
                )

            updates[field] = value or None

    # -----------------------------------------
    # Role
    # -----------------------------------------
    if 'role' in updates:
        valid_roles = (
            'user',
            'admin',
            'super_admin',
            'operator',
            'support',
        )

        if updates['role'] not in valid_roles:
            raise HTTPException(
                status_code=400,
                detail='Invalid role',
            )

        # Only super_admin can assign/remove admin-level roles.
        if (
            admin.get('role') != 'super_admin'
            and updates['role'] != current.get('role')
        ):
            raise HTTPException(
                status_code=403,
                detail='Only Super Admin can change user roles',
            )

    # Never allow generic profile editing to touch erased accounts.
    if current.get('erased'):
        raise HTTPException(
            status_code=400,
            detail='Erased users cannot be edited',
        )

    changed = {
        k: v
        for k, v in updates.items()
        if current.get(k) != v
    }

    if not changed:
        return {
            'ok': True,
            'updates': {},
            'unchanged': True,
        }

    now = datetime.now(timezone.utc)

    await db.users.update_one(
        {'user_id': user_id},
        {
            '$set': {
                **changed,
                'profile_updated_at': now,
            }
        },
    )

    if 'role' in changed:
        from services.analytics_events import record_staff_role_transition
        try:
            await record_staff_role_transition(
                db, user_id, current.get('role') or 'user', changed['role'], now,
            )
        except Exception:
            logger.exception('Could not record staff role interval for user_id=%s', user_id)

    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'user_profile_update',
        'admin_email': admin.get('email'),
        'admin_user_id': admin.get('user_id'),
        'target_user_id': user_id,
        'changed_fields': sorted(changed.keys()),
        'at': now,
    })

    return {
        'ok': True,
        'updates': changed,
    }


# NOTE: /users/{user_id}/suspend and /users/{user_id}/unsuspend were previously
# defined here. They have been moved to routers/user360_routes.py so they can
# require admin password re-authentication + emit audit_log rows. Do NOT
# re-add duplicates here â€” FastAPI matches routes in registration order and
# duplicates silently shadow the secure handlers.


async def _enrich_orders_with_user(db, orders: list) -> list:
    """Attach `user_name` / `user_email` to a list of orders using ONE bulk
    lookup instead of one query per order (N+1 avoidance)."""
    if not orders:
        return orders
    user_ids = list({o['user_id'] for o in orders if o.get('user_id')})
    users = await db.users.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1},
    ).to_list(len(user_ids))
    umap = {u['user_id']: u for u in users}
    for o in orders:
        u = umap.get(o.get('user_id'))
        o['user_name'] = u['name'] if u else 'Unknown'
        o['user_email'] = u['email'] if u else ''
    return orders


@router.get('/orders')
async def all_orders(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    orders = await db.orders.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return await _enrich_orders_with_user(db, orders)


@router.post('/orders/{order_id}/refund')
async def refund_order(order_id: str, request: Request):
    # Refunds move real money â€” restrict to admin/super_admin only.
    # support/operator staff never touch refunds.
    await _require_role(request, ['admin', 'super_admin'])
    from deps import get_db
    from routers.wallet_routes import _apply_tx
    db = get_db()
    o = await db.orders.find_one({'order_id': order_id}, {'_id': 0})
    if not o:
        raise HTTPException(status_code=404, detail='Order not found')
    if o.get('status') == 'refunded':
        return {'ok': True, 'already': True}

    # Credit the buyer's wallet back BEFORE mutating inventory so an
    # accidental double-refund attempt can't remove tickets twice. The
    # idempotency guard above (status == 'refunded') keeps this safe on
    # retries â€” we only ever credit money once per order.
    total_to_refund = float(o.get('total', 0) or 0)
    if total_to_refund > 0 and o.get('method') == 'wallet':
        await _apply_tx(
            db,
            o['user_id'],
            'refund',
            total_to_refund,
            note=f'Refund for order {order_id}',
            ref_order_id=order_id,
        )

    # Decrement tickets_sold and delete tickets so the seat becomes available
    # again for future buyers.
    for item in o.get('items', []):
        await db.contests.update_one({'contest_id': item['contest_id']}, {'$inc': {'tickets_sold': -item['qty']}})
    await db.tickets.delete_many({'order_id': order_id})
    await db.orders.update_one({'order_id': order_id}, {'$set': {'status': 'refunded'}})
    return {'ok': True, 'refunded_amount': total_to_refund}


@router.get('/payments')
async def all_payments(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    orders = await db.orders.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return await _enrich_orders_with_user(db, orders)


@router.get('/contests')
async def all_contests(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    return await db.contests.find({}, {'_id': 0}).sort('end_date', 1).to_list(500)


@router.post('/contests')
async def create_contest_api(payload: dict, request: Request):
    """Create a new contest from the admin UI (no code, no Meera required)."""
    await require_admin(request)
    from deps import get_db
    from models import Contest, SkillQuestion
    db = get_db()

    # Skill question is now OPTIONAL â€” modern contests use the dynamic engine
    # (skill_question_type + skill_question_difficulty) which auto-generates a
    # fresh problem per visitor. A static block is only required for legacy
    # trivia/word questions.
    sk = payload.get('skill_question') or {}
    has_static = bool(sk.get('q') and sk.get('answer') and sk.get('options') and len(sk['options']) >= 2)
    sqt = (payload.get('skill_question_type') or '').strip().lower() or None
    sqd = (payload.get('skill_question_difficulty') or '').strip().lower() or None
    if not has_static and not sqt:
        # Default to dynamic addition/easy so contests can be created without extra input.
        sqt = 'addition'
        sqd = 'easy'

    # Slug (server-generated, unique)
    import re
    import secrets
    title = (payload.get('title') or 'Contest').strip()
    slug_base = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:40] or 'contest'
    slug = f"{slug_base}-{secrets.token_hex(3)}"

    # Parse end_date
    end_date_val = payload.get('end_date')
    if isinstance(end_date_val, str):
        try:
            end_date_val = datetime.fromisoformat(end_date_val.replace('Z', '+00:00'))
        except Exception:
            end_date_val = datetime.now(timezone.utc) + timedelta(days=7)
    elif not isinstance(end_date_val, datetime):
        end_date_val = datetime.now(timezone.utc) + timedelta(days=7)

    category = payload.get('category') or 'prize-draws'
    tag_map = {'jackpot': 'Jackpot', 'instant-wins': 'Instant Wins', 'prize-draws': 'Prize Draws', 'new-games': 'New Game'}
    prize_amount = float(payload.get('prize_amount', 100) or 0)
    prize_bonus_tokens = float(payload.get('prize_bonus_tokens') or 0)
    if prize_amount < 0 or prize_bonus_tokens < 0:
        raise HTTPException(status_code=400, detail='Prize values cannot be negative')
    if prize_amount == 0 and prize_bonus_tokens == 0:
        raise HTTPException(status_code=400, detail='A cash or winning bonus-token prize is required')
    prize_labels = []
    if prize_amount:
        prize_labels.append(f'£{prize_amount:g} cash')
    if prize_bonus_tokens:
        prize_labels.append(f'{prize_bonus_tokens:g} winning bonus tokens')

    try:
        contest = Contest(
            slug=slug,
            title=title,
            subtitle=payload.get('subtitle') or ' + '.join(prize_labels) + ' prize',
            category=category,
            tag=payload.get('tag') or tag_map.get(category, 'Prize Draws'),
            price=float(payload.get('price') or 1),
            tickets_total=int(payload.get('tickets_total') or 150),
            prize_amount=prize_amount,
            prize_bonus_tokens=prize_bonus_tokens,
            end_date=end_date_val,
            image=payload.get('image') or 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
            jackpot=bool(payload.get('jackpot')) or prize_amount >= 250,
            featured=bool(payload.get('featured')),
            skill_question=SkillQuestion(
                q=sk['q'], options=list(sk['options']), answer=sk['answer'],
                type=sk.get('type', 'trivia'),
            ) if has_static else SkillQuestion(
                # Placeholder â€” never rendered to public because dynamic engine
                # supersedes it. Kept because the Contest model requires it.
                q='Dynamic', options=['auto'], answer='auto', type='dynamic',
            ),
            status=payload.get('status', 'draft') if payload.get('status') in ('draft', 'live') else 'draft',
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'Invalid contest data: {e}')

    doc = contest.model_dump()

    doc['public_coming_soon'] = (
        bool(payload.get('public_coming_soon', False))
        and doc.get('status') == 'draft'
    )

    if sqt:
        doc['skill_question_type'] = sqt
        doc['skill_question_difficulty'] = sqd or 'easy'
    # Skill-engine fields from the Create dialog (validated like the edit endpoint).
    for key in ('game_type', 'game_config', 'entry_mode', 'max_attempts', 'attempts_per_ticket',
                'leaderboard_visibility', 'winner_selection_method', 'engine_type'):
        if payload.get(key) is not None:
            doc[key] = payload[key]
    if doc.get('game_type'):
        from routers.game_routes import GAME_TYPES
        if doc['game_type'] not in {g['id'] for g in GAME_TYPES}:
            raise HTTPException(status_code=400, detail='Unknown game type')
        for key in ('max_attempts', 'attempts_per_ticket'):
            if key in doc and doc[key] is not None:
                doc[key] = max(1, min(int(doc[key]), 10))
    await db.contests.insert_one(doc)
    if doc.get('status') == 'live':
        try:
            from services.push_delivery import announce_new_contest
            await announce_new_contest(db, doc)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('New-contest Web Push enqueue failed contest=%s', doc.get('contest_id'))
    doc.pop('_id', None)
    return {'ok': True, 'contest': doc}


@router.put('/contests/{contest_id}')
async def update_contest_full(contest_id: str, payload: dict, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    allowed = {'title', 'subtitle', 'category', 'tag', 'image', 'price', 'tickets_total',
               'prize_amount', 'prize_bonus_tokens', 'end_date', 'jackpot', 'featured', 'status', 'public_coming_soon', 'skill_question',
               'skill_question_type', 'skill_question_difficulty',
               'game_type', 'game_config', 'entry_mode', 'max_attempts', 'attempts_per_ticket',
               'leaderboard_visibility', 'winner_selection_method',
               # ---- Extended editable fields (Phase-1 launch spec) ----
               'short_description', 'full_description', 'how_to_enter', 'skill_instructions',
               'eligibility', 'max_tickets_per_user', 'open_date', 'draw_date',
               'prize_details', 'num_prizes', 'prize_values', 'winner_method', 'scoring_method',
               'tiebreak_method', 'verification_method', 'prize_credit_timeframe',
               'refund_conditions', 'important_info', 'contest_rules',
               'terms_acknowledgement', 'country_restrictions', 'age_restriction',
               'mobile_image', 'seo_title', 'seo_description', 'publication_status',
               'engine_type', 'free_postal_entry_available', 'free_postal_entry_instructions'}
    updates = {}
    for k, v in (payload or {}).items():
        if k not in allowed:
            continue
        if k in {'end_date', 'open_date', 'draw_date'} and isinstance(v, str) and v:
            try:
                updates[k] = datetime.fromisoformat(v.replace('Z', '+00:00'))
            except Exception:
                continue
        elif k in {'price', 'prize_amount', 'prize_bonus_tokens'}:
            amount = float(v)
            if k != 'price' and amount < 0:
                raise HTTPException(status_code=400, detail='Prize values cannot be negative')
            updates[k] = amount
        elif k in {'tickets_total', 'num_prizes', 'max_tickets_per_user'}:
            try:
                updates[k] = int(v)
            except (TypeError, ValueError):
                continue
        elif k in {'free_postal_entry_available', 'jackpot', 'featured', 'public_coming_soon'}:
            updates[k] = bool(v)
        elif k == 'skill_question' and isinstance(v, dict):
            if all(x in v for x in ('q', 'options', 'answer')):
                updates[k] = {'q': v['q'], 'options': list(v['options']), 'answer': v['answer'], 'type': v.get('type', 'trivia')}
        elif k == 'skill_question_type':
            val = (str(v or '').strip().lower()) or None
            if val in {'addition', 'subtraction', 'multiplication', 'division', None}:
                updates[k] = val
        elif k == 'skill_question_difficulty':
            val = (str(v or '').strip().lower()) or 'easy'
            if val in {'easy', 'medium', 'hard'}:
                updates[k] = val
        else:
            updates[k] = v
    # Coming Soon must never be live.
    if updates.get('public_coming_soon') is True:
        updates['status'] = 'draft'

    # Going live automatically clears Coming Soon.
    if updates.get('status') == 'live':
        updates['public_coming_soon'] = False

    if not updates:
        raise HTTPException(status_code=400, detail='No valid fields to update')
    if {'prize_amount', 'prize_bonus_tokens'} & updates.keys():
        current = await db.contests.find_one(
            {'contest_id': contest_id},
            {'_id': 0, 'prize_amount': 1, 'prize_bonus_tokens': 1},
        )
        if not current:
            raise HTTPException(status_code=404, detail='Contest not found')
        cash = float(updates.get('prize_amount', current.get('prize_amount') or 0))
        bonus = float(updates.get('prize_bonus_tokens', current.get('prize_bonus_tokens') or 0))
        if cash + bonus <= 0:
            raise HTTPException(status_code=400, detail='A cash or winning bonus-token prize is required')
    if 'game_config' in updates:
        cfg = updates['game_config'] if isinstance(updates['game_config'], dict) else {}
        if 'difficulty' in cfg:
            try:
                cfg['difficulty'] = int(cfg['difficulty'])
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail='Difficulty must be a level from 1 to 10')
            if not 1 <= cfg['difficulty'] <= 10:
                raise HTTPException(status_code=400, detail='Difficulty must be a level from 1 to 10')
        updates['game_config'] = cfg
    if {'game_type', 'game_config'} & updates.keys():
        current = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0, 'game_type': 1, 'game_config': 1}) or {}
        changed = any(updates[k] != current.get(k) for k in ('game_type', 'game_config') if k in updates)
        if changed and (await db.tickets.find_one({'contest_id': contest_id}, {'_id': 1})
                        or await db.game_scores.find_one({'contest_id': contest_id}, {'_id': 1})):
            raise HTTPException(status_code=409, detail='The game and difficulty are locked because paid entries or gameplay have started')
    r = await db.contests.update_one({'contest_id': contest_id}, {'$set': updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    return {'ok': True, 'updates': list(updates.keys())}


@router.get('/winners')
async def all_winners(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    return await db.winners.find({}, {'_id': 0}).sort('drawn_at', -1).to_list(500)


@router.post('/draw/{contest_id}')
async def draw_winner(contest_id: str, request: Request):
    await _require_role(request, ['admin', 'super_admin', 'operator'])
    from deps import get_db
    from services.draw_service import draw_contest as _draw
    db = get_db()
    result = await _draw(db, contest_id)
    if not result.get('ok'):
        reason_map = {
            'contest_not_found': (404, 'Contest not found'),
            'already_drawn': (400, 'Contest already drawn'),
            'no_tickets': (400, 'No tickets sold'),
        }
        code, msg = reason_map.get(result.get('reason'), (400, result.get('reason', 'Draw failed')))
        raise HTTPException(status_code=code, detail=msg)
    return {'winner': result['winner']}


@router.post('/winners/{winner_id}/mark-paid')
async def mark_paid(winner_id: str, request: Request):
    admin = await require_admin(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail='Only Super Admin can approve and credit Paid World prizes')
    from deps import get_db
    from routers.wallet_routes import _apply_tx_idempotent
    db = get_db()
    winner = await db.winners.find_one({'winner_id': winner_id}, {'_id': 0})
    if not winner:
        raise HTTPException(status_code=404, detail='Winner not found')
    if winner.get('source') == 'draw_studio' and not winner.get('paid_out'):
        raise HTTPException(status_code=409, detail='Draw Studio rewards are approved and credited from Production Panel > Winners & Approvals')
    if winner.get('paid_out') is True or winner.get('payment_status') == 'paid':
        return {'ok': True, 'idempotent': True, 'payment_status': 'paid',
                'wallet_transaction_ids': winner.get('wallet_transaction_ids') or []}

    cash_amount = round(float(winner.get('prize_cash_amount', winner.get('prize_amount', 0)) or 0), 2)
    bonus_amount = round(float(winner.get('prize_bonus_tokens') or 0), 2)
    if cash_amount < 0 or bonus_amount < 0 or cash_amount + bonus_amount <= 0:
        raise HTTPException(status_code=409, detail='Winner prize amounts are invalid')
    transaction_ids, transaction_refs = [], []
    if cash_amount:
        reference = f'paid-world:winner:{winner_id}:cash'
        result = await _apply_tx_idempotent(
            db, winner['user_id'], 'paid_prize_cash', cash_amount,
            note=f"Paid World cash prize: {winner.get('prize_title') or winner.get('contest_id')}",
            ref_order_id=reference,
        )
        transaction_ids.append(result['tx']['tx_id'])
        transaction_refs.append(reference)
    if bonus_amount:
        reference = f'paid-world:winner:{winner_id}:bonus'
        result = await _apply_tx_idempotent(
            db, winner['user_id'], 'paid_prize_bonus', bonus_amount,
            note=f"Paid World winning bonus prize: {winner.get('prize_title') or winner.get('contest_id')}",
            ref_order_id=reference,
        )
        transaction_ids.append(result['tx']['tx_id'])
        transaction_refs.append(reference)

    now = datetime.now(timezone.utc)
    await db.winners.update_one({'winner_id': winner_id, 'paid_out': {'$ne': True}}, {'$set': {
        'paid_out': True, 'payment_status': 'paid', 'paid_at': now,
        'paid_by_user_id': admin.get('user_id'), 'paid_by_email': admin.get('email'),
        'wallet_transaction_ids': transaction_ids, 'wallet_transaction_refs': transaction_refs,
        'prize_cash_amount': cash_amount, 'prize_bonus_tokens': bonus_amount,
    }})
    audit_id = f'aud_paid_world_winner_{winner_id}'
    await db.audit_log.update_one({'audit_id': audit_id}, {'$setOnInsert': {
        'audit_id': audit_id, 'kind': 'paid_world_prize_wallet_credit',
        'winner_id': winner_id, 'contest_id': winner['contest_id'], 'user_id': winner['user_id'],
        'cash_tokens': cash_amount, 'winning_bonus_tokens': bonus_amount,
        'wallet_transaction_ids': transaction_ids, 'wallet_transaction_refs': transaction_refs,
        'admin_user_id': admin.get('user_id'), 'admin_email': admin.get('email'), 'at': now,
    }}, upsert=True)
    return {'ok': True, 'payment_status': 'paid', 'cash_tokens_credited': cash_amount,
            'winning_bonus_tokens_credited': bonus_amount,
            'wallet_transaction_ids': transaction_ids, 'wallet_transaction_refs': transaction_refs}


@router.post('/contests/bulk/launch')
async def bulk_launch_contests(request: Request, payload: dict | None = None):
    """Launch multiple contests at once. Optional filter:
    - only_games=true â†’ only contests with game_type set
    - category=<slug> â†’ only contests in that category
    - status_from='draft'|'live'|'all' (default 'draft')
    Returns count of contests updated.
    """
    await require_admin(request)
    from deps import get_db
    db = get_db()
    payload = payload or {}
    q = {}
    status_from = (payload.get('status_from') or 'draft')
    if status_from != 'all':
        q['status'] = status_from

    # Coming Soon contests are intentionally public drafts.
    # Bulk launch must never convert them into live contests.
    q['public_coming_soon'] = {'$ne': True}

    if payload.get('only_games'):
        q['game_type'] = {'$exists': True, '$nin': [None, '']}
    cat = payload.get('category')
    if cat and cat != 'all':
        q['category'] = cat
    r = await db.contests.update_many(q, {'$set': {'status': 'live'}})
    return {'ok': True, 'updated': r.modified_count, 'matched': r.matched_count, 'filter': q}


@router.post('/contests/bulk/pause')
async def bulk_pause_contests(request: Request, payload: dict | None = None):
    """Pause multiple contests. Same filter surface as bulk/launch."""
    await require_admin(request)
    from deps import get_db
    db = get_db()
    payload = payload or {}
    q = {}
    status_from = (payload.get('status_from') or 'live')
    if status_from != 'all':
        q['status'] = status_from
    if payload.get('only_games'):
        q['game_type'] = {'$exists': True, '$nin': [None, '']}
    cat = payload.get('category')
    if cat and cat != 'all':
        q['category'] = cat
    r = await db.contests.update_many(q, {'$set': {'status': 'draft'}})
    return {'ok': True, 'updated': r.modified_count, 'matched': r.matched_count, 'filter': q}


@router.post('/contests/{contest_id}/launch')
async def launch_contest(contest_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()

    contest = await db.contests.find_one(
        {'contest_id': contest_id},
        {'_id': 0, 'public_coming_soon': 1, 'status': 1, 'contest_id': 1, 'title': 1, 'slug': 1},
    )
    if not contest:
        raise HTTPException(status_code=404, detail='Contest not found')

    if contest.get('public_coming_soon') is True:
        raise HTTPException(
            status_code=409,
            detail='This competition is marked Coming Soon. Remove Coming Soon before launching it.',
        )

    await db.contests.update_one(
        {'contest_id': contest_id},
        {'$set': {'status': 'live', 'public_coming_soon': False}},
    )
    if contest.get('status') != 'live':
        try:
            from services.push_delivery import announce_new_contest
            await announce_new_contest(db, contest)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('New-contest Web Push enqueue failed contest=%s', contest_id)
    return {'ok': True, 'status': 'live'}


@router.post('/contests/{contest_id}/pause')
async def pause_contest(contest_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.contests.update_one({'contest_id': contest_id}, {'$set': {'status': 'draft', 'public_coming_soon': False}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    return {'ok': True, 'status': 'draft'}


@router.delete('/contests/{contest_id}')
async def delete_contest(contest_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.contests.delete_one({'contest_id': contest_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Contest not found')
    await db.tickets.delete_many({'contest_id': contest_id})
    return {'ok': True}


# ---------- KYC ----------
@router.get('/kyc')
async def list_kyc(request: Request, status: str = 'all'):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    q = {} if status == 'all' else {'status': status}
    subs = await db.kyc.find(q, {'_id': 0}).sort('submitted_at', -1).to_list(500)
    if not subs:
        return subs
    # Bulk-enrich with user name/email (avoid N+1 that would fire one query
    # per KYC submission on the admin KYC queue).
    user_ids = list({s['user_id'] for s in subs if s.get('user_id')})
    users = await db.users.find(
        {'user_id': {'$in': user_ids}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'email': 1},
    ).to_list(len(user_ids))
    umap = {u['user_id']: u for u in users}
    for s in subs:
        u = umap.get(s.get('user_id'))
        s['user_name'] = u['name'] if u else 'Unknown'
        s['user_email'] = u['email'] if u else ''
    return subs


@router.post('/kyc/{kyc_id}/approve')
async def approve_kyc(kyc_id: str, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.kyc.update_one({'kyc_id': kyc_id}, {'$set': {
        'status': 'approved',
        'reviewed_at': datetime.now(timezone.utc),
        'reviewed_by': admin['email'],
    }})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='KYC not found')
    return {'ok': True}


@router.post('/kyc/{kyc_id}/reject')
async def reject_kyc(kyc_id: str, payload: dict, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    r = await db.kyc.update_one({'kyc_id': kyc_id}, {'$set': {
        'status': 'rejected',
        'reviewed_at': datetime.now(timezone.utc),
        'reviewed_by': admin['email'],
        'reject_reason': (payload or {}).get('reason', ''),
    }})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail='KYC not found')
    return {'ok': True}



@router.post('/system/wipe-demo-data')
async def wipe_demo_data(payload: dict, request: Request):
    """DESTRUCTIVE â€” deletes all test/demo data and resets counters so the
    platform is production-clean. Preserves:
      â€¢ the calling super admin (their own account is never touched)
      â€¢ all other users with role in ('admin', 'super_admin', 'operator', 'support')
      â€¢ legal documents, company settings, counters

    Wipes:
      â€¢ orders, tickets, wallet_tx, payment_transactions, audit logs,
        notifications, referrals, support cases, contests, contest_draws,
        game_scores, instant_win_configs, instant_win_reveals, kyc,
        leaderboard_entries, meera_log, postal_entries, user_sessions, winners
      â€¢ every user with role 'user' (regular players â€” demo accounts)
      â€¢ every wallet not belonging to a preserved user

    Requires:
      â€¢ super_admin role
      â€¢ password re-confirmation (payload['password'])
      â€¢ confirmation phrase (payload['confirm'] == 'WIPE DEMO DATA')
    """
    user = await get_current_user(request)
    if user.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail='Only super_admin can wipe demo data')

    password = (payload or {}).get('password', '')
    confirm = (payload or {}).get('confirm', '')
    if confirm != 'WIPE DEMO DATA':
        raise HTTPException(status_code=400, detail='Confirmation phrase must be exactly: WIPE DEMO DATA')

    from deps import get_db
    db = get_db()
    admin_full = await db.users.find_one({'user_id': user['user_id']})
    if not admin_full or not verify_password(password, admin_full.get('password_hash', '')):
        raise HTTPException(status_code=401, detail='Password re-confirmation failed')

    report: dict[str, int] = {}
    for col in _WIPEABLE_COLLECTIONS:
        r = await db[col].delete_many({})
        if r.deleted_count:
            report[col] = r.deleted_count

    # Preserve staff accounts + the calling super admin. Delete only regular players.
    staff_roles = {'admin', 'super_admin', 'operator', 'support'}
    preserved = await db.users.find(
        {'role': {'$in': list(staff_roles)}},
        {'_id': 0, 'user_id': 1},
    ).to_list(None)
    preserved_ids = [u['user_id'] for u in preserved]

    dr = await db.users.delete_many({'user_id': {'$nin': preserved_ids}})
    if dr.deleted_count:
        report['users'] = dr.deleted_count

    # Reset every preserved staff wallet to Â£0 and wipe every other wallet.
    wr = await db.wallets.delete_many({'user_id': {'$nin': preserved_ids}})
    if wr.deleted_count:
        report['wallets_deleted'] = wr.deleted_count
    await db.wallets.update_many(
        {'user_id': {'$in': preserved_ids}},
        {'$set': {'balance': 0.0, 'lifetime_topup': 0.0, 'lifetime_spend': 0.0}},
    )

    # Backfill missing public_ids on preserved staff and reset the counter
    # correctly. This is subtle because staff can be a mix of:
    #   â€¢ super admin (always gets PL10000)
    #   â€¢ existing staff who ALREADY have a PLxxxxx (keep as-is, count towards
    #     the next-signup counter)
    #   â€¢ existing staff with NO public_id (assign the smallest unused id)
    _PREFIX = 'PL'
    _START = 10000

    def _num(pid):
        if not pid or not pid.startswith(_PREFIX):
            return None
        try:
            return int(pid[len(_PREFIX):])
        except ValueError:
            return None

    # Snapshot every preserved user's current public_id.
    used: set[int] = set()
    async for u in db.users.find({'user_id': {'$in': preserved_ids}}, {'user_id': 1, 'public_id': 1, 'role': 1}):
        n = _num(u.get('public_id'))
        if n is not None:
            used.add(n)

    # Super admin ALWAYS gets PL10000 (overwrite any other id it may hold â€”
    # PL10000 is the reserved super-admin marker).
    sa = await db.users.find_one({'role': 'super_admin'}, {'user_id': 1, 'public_id': 1})
    if sa:
        prev = _num(sa.get('public_id'))
        if prev is not None:
            used.discard(prev)
        await db.users.update_one({'user_id': sa['user_id']}, {'$set': {'public_id': f'{_PREFIX}{_START}'}})
        used.add(_START)

    # Assign smallest-unused id to any preserved staff still missing one.
    async for u in db.users.find(
        {
            'user_id': {'$in': preserved_ids},
            'role': {'$ne': 'super_admin'},
            '$or': [{'public_id': {'$in': [None, '']}}, {'public_id': {'$exists': False}}],
        },
        {'user_id': 1},
    ).sort('created_at', 1):
        candidate = _START + 1
        while candidate in used:
            candidate += 1
        await db.users.update_one({'user_id': u['user_id']}, {'$set': {'public_id': f'{_PREFIX}{candidate}'}})
        used.add(candidate)

    # Counter must be set so the next new signup gets `max(used) + 1`.
    # The `next_seq` helper first $inc's seq and returns `seq + start - 1`,
    # so if we want the next call to return `max_used + 1` we need seq
    # (before $inc) to equal `max_used - start + 1`.
    max_used = max(used) if used else _START
    await db.counters.update_one(
        {'_id': 'user_public_id'},
        {'$set': {'seq': max(1, max_used - _START + 1)}},
        upsert=True,
    )

    # Log the wipe itself in a fresh admin_audit row so ops can always
    # answer "who wiped and when?" â€” inserted AFTER the wipe loop so it
    # survives (the loop just cleared admin_audit as well).
    await db.admin_audit.insert_one({
        'action': 'wipe_demo_data',
        'by_user_id': user['user_id'],
        'by_email': user.get('email'),
        'at': datetime.now(timezone.utc),
        'report': report,
    })

    return {'ok': True, 'wiped': report, 'preserved_users': len(preserved_ids)}


@router.post('/reconcile-verification')
async def reconcile_verification(request: Request):
    """Admin-triggered safe reconciliation of verification flags.

    Trusted evidence only:
      - Google accounts (method=='google') are email-verified by the Emergent
        Google OAuth provider, so backfill email_verified=true where missing.
    Does NOT touch phone verification (no trusted evidence stored) and never
    alters fictitious/unverified numbers. Idempotent.
    """
    from datetime import datetime, timezone
    await require_admin(request)
    from deps import get_db
    db = get_db()
    now = datetime.now(timezone.utc)

    google_res = await db.users.update_many(
        {'method': 'google', 'email_verified': {'$ne': True}},
        {'$set': {'email_verified': True, 'email_verified_at': now}},
    )
    return {
        'ok': True,
        'google_email_reconciled': google_res.modified_count,
        'phone_reconciled': 0,
        'note': 'Phone verification is not auto-reconciled (no trusted evidence stored). Use per-user manual verify where evidence exists.',
    }



# Read-only Live Contests monitoring. Existing routes and purchase logic unchanged.
@router.get('/live-contests')
async def live_contests(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    contests = await db.contests.find({'status': 'live'}, {'_id': 0}).sort('end_date', 1).to_list(1000)
    ids = [c['contest_id'] for c in contests]
    if not ids:
        return {'contests': []}
    counts = await db.tickets.aggregate([
        {'$match': {'contest_id': {'$in': ids}}},
        {'$group': {'_id': '$contest_id', 'tickets': {'$sum': 1}, 'users': {'$addToSet': '$user_id'}}},
    ]).to_list(None)
    summary = {r['_id']: r for r in counts}
    for c in contests:
        r = summary.get(c['contest_id'], {})
        c['issued_tickets'] = r.get('tickets', 0)
        c['participant_count'] = len(r.get('users', []))
    return {'contests': contests}


@router.get('/live-contests/{contest_id}/participants')
async def live_contest_participants(contest_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    contest = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0})
    if not contest:
        raise HTTPException(status_code=404, detail='Contest not found')
    tickets = await db.tickets.find({'contest_id': contest_id}, {'_id': 0}).sort('ticket_number', 1).to_list(None)
    user_ids = list({t['user_id'] for t in tickets if t.get('user_id')})
    order_ids = list({t['order_id'] for t in tickets if t.get('order_id')})
    users = await db.users.find({'user_id': {'$in': user_ids}}, {'_id': 0, 'user_id': 1, 'name': 1, 'username': 1, 'email': 1, 'public_id': 1}).to_list(None)
    orders = await db.orders.find({'order_id': {'$in': order_ids}}, {'_id': 0}).to_list(None)
    user_map = {u['user_id']: u for u in users}
    order_map = {o['order_id']: o for o in orders}
    participants = {}
    for t in tickets:
        uid = t.get('user_id')
        if not uid:
            continue
        if uid not in participants:
            participants[uid] = {**user_map.get(uid, {'user_id': uid}), 'tickets': [], 'ticket_count': 0, 'paid_count': 0, 'free_count': 0, 'unknown_count': 0, 'total_paid': 0.0}
        order = order_map.get(t.get('order_id')) or {}
        item = next((i for i in order.get('items', []) if i.get('contest_id') == contest_id), {})
        price = item.get('price')
        method = order.get('method')
        status = order.get('status')
        # A ticket without a paid order cannot safely be called free.
        if status == 'paid' and price is not None:
            kind = 'paid' if float(price) > 0 else 'free'
        elif t.get('entry_type') in ('free', 'postal', 'admin', 'promotional'):
            kind = 'free'
        else:
            kind = 'unknown'
        row = {
            'ticket_id': t.get('ticket_id'), 'ticket_number': t.get('ticket_number'),
            'order_id': t.get('order_id'), 'entry_type': kind,
            'entry_source': t.get('entry_type') or method,
            'price': float(price) if price is not None else None,
            'payment_method': method, 'order_status': status,
            'purchased_at': order.get('created_at') or t.get('created_at'),
        }
        person = participants[uid]
        person['tickets'].append(row)
        person['ticket_count'] += 1
        person[kind + '_count'] += 1
        if kind == 'paid':
            person['total_paid'] += float(price)
    return {'contest': contest, 'participants': list(participants.values()), 'total_tickets': len(tickets)}
