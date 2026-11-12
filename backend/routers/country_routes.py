"""Country of residence: public list, user country set/change requests, admin policy, analytics, CSV, OTP costs."""
import csv
import io
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth import get_current_user, require_admin
from deps import get_db
from services.country_policy import (COUNTRIES, INTERNATIONAL_NOTICE, INTL_DEFAULT, OTP_KEYS, PERM_KEYS, PERMISSIONS, UK, UK_DEFAULT,
                                     get_policy, invalidate_cache, record_audit, user_access)

public_router = APIRouter(prefix='/api', tags=['countries'])
admin_router = APIRouter(prefix='/api/admin/countries', tags=['admin-countries'])
_STAFF = ['admin', 'super_admin', 'operator', 'support']
_now = lambda: datetime.now(timezone.utc)  # noqa: E731


@public_router.get('/countries')
async def list_countries():
    return {'countries': [{'code': c, 'name': n} for c, n in sorted(COUNTRIES.items(), key=lambda x: x[1])]}


@public_router.get('/countries/{code}/signup-rules')
async def country_signup_rules(code: str):
    code = _valid(code)
    p = await get_policy(get_db(), code)
    return {'code': code, 'allow_registration': p['allow_registration'], 'require_email_otp': p['require_email_otp'],
            'require_phone_otp': p['require_phone_otp'], 'prize_notice': None if code == UK else INTERNATIONAL_NOTICE}


class CountryInput(BaseModel):
    country: str = Field(..., min_length=2, max_length=2)
    reason: Optional[str] = Field(default=None, max_length=500)


def _valid(code: str) -> str:
    code = code.upper()
    if code not in COUNTRIES:
        raise HTTPException(status_code=422, detail='Please choose a valid country of residence.')
    return code


@public_router.post('/auth/country')
async def set_my_country(inp: CountryInput, request: Request):
    """One-time country confirmation for accounts that have none recorded."""
    user = await get_current_user(request)
    db = get_db()
    code = _valid(inp.country)
    res = await db.users.update_one(
        {'user_id': user['user_id'], 'country_of_residence': {'$in': [None, '']}},
        {'$set': {'country_of_residence': code, 'country_set_at': _now(), 'country_set_source': 'existing_user_prompt'}})
    if not res.modified_count:
        raise HTTPException(status_code=409, detail='Your country is already recorded. Request a change instead.')
    fresh = await db.users.find_one({'user_id': user['user_id']}, {'_id': 0})
    return {'ok': True, 'country_access': await user_access(db, fresh)}


@public_router.post('/auth/country/change-request')
async def request_country_change(inp: CountryInput, request: Request):
    user = await get_current_user(request)
    db = get_db()
    code = _valid(inp.country)
    if not user.get('country_of_residence'):
        raise HTTPException(status_code=400, detail='Confirm your country first.')
    if code == user.get('country_of_residence'):
        raise HTTPException(status_code=400, detail='That is already your recorded country.')
    if await db.country_change_requests.find_one({'user_id': user['user_id'], 'status': 'pending'}, {'_id': 1}):
        raise HTTPException(status_code=409, detail='You already have a pending country change request.')
    doc = {'request_id': f"ccr_{os.urandom(8).hex()}", 'user_id': user['user_id'], 'email': user.get('email'),
           'current_country': user.get('country_of_residence'), 'requested_country': code,
           'reason': (inp.reason or '').strip()[:500], 'status': 'pending', 'created_at': _now()}
    await db.country_change_requests.insert_one(dict(doc))
    return {'ok': True, 'request': {k: v for k, v in doc.items() if k != '_id'}}


# ---------------- Admin: policies ----------------
async def _default_policy(db) -> dict:
    d = await db.country_policy_settings.find_one({'_id': 'default'}, {'_id': 0}) or {}
    return {**INTL_DEFAULT, **{k: d[k] for k in (*PERM_KEYS, *OTP_KEYS) if k in d}}


@admin_router.get('/policies')
async def admin_policies(request: Request):
    await require_admin(request)
    db = get_db()
    default = await _default_policy(db)
    rows = {r['code']: r async for r in db.country_policies.find({}, {'_id': 0})}
    counts = {r['_id']: r['n'] async for r in db.users.aggregate([
        {'$match': {'role': {'$nin': _STAFF}}}, {'$group': {'_id': '$country_of_residence', 'n': {'$sum': 1}}}])}
    out = []
    for code, name in sorted(COUNTRIES.items(), key=lambda x: x[1]):
        base = UK_DEFAULT if code == UK else default
        row = rows.get(code) or {}
        out.append({'code': code, 'name': name, 'custom': bool(row), 'users': counts.get(code, 0),
                    **base, **{k: row[k] for k in (*PERM_KEYS, *OTP_KEYS) if k in row}})
    return {'permissions': [{'key': k, 'label': l} for k, l in PERMISSIONS], 'default': default, 'countries': out,
            'users_without_country': counts.get(None, 0)}


class PolicyChanges(BaseModel):
    codes: list[str] = Field(default_factory=list, max_length=300)
    changes: dict[str, int | bool] = Field(default_factory=dict)
    confirm: bool = False


def _clean_changes(changes: dict) -> dict:
    out = {}
    for k, v in changes.items():
        if k in PERM_KEYS:
            out[k] = bool(v)
        elif k in OTP_KEYS:
            out[k] = max(0, min(int(v), 1_000_000))
        else:
            raise HTTPException(status_code=422, detail=f'Unknown setting: {k}')
    if not out:
        raise HTTPException(status_code=422, detail='No changes supplied')
    return out


def _needs_confirm(changes: dict, confirm: bool) -> None:
    if not confirm and any(k in PERM_KEYS and k.startswith('allow_') and v is False for k, v in changes.items()):
        raise HTTPException(status_code=428, detail='Confirm before disabling access.')


@admin_router.put('/policies')
async def admin_update_policies(inp: PolicyChanges, request: Request):
    admin = await require_admin(request)
    db = get_db()
    codes = sorted({_valid(c) for c in inp.codes})
    if not codes:
        raise HTTPException(status_code=422, detail='Select at least one country')
    changes = _clean_changes(inp.changes)
    _needs_confirm(changes, inp.confirm)
    before = {c: {k: (await get_policy(db, c))[k] for k in changes} for c in codes}
    for c in codes:
        await db.country_policies.update_one({'code': c}, {'$set': {'code': c, **changes, 'updated_at': _now(),
                                                                    'updated_by': admin.get('user_id')}}, upsert=True)
    invalidate_cache()
    await record_audit(db, admin, 'update_countries', codes, before, changes)
    return {'ok': True, 'updated': len(codes)}


@admin_router.put('/default')
async def admin_update_default(inp: PolicyChanges, request: Request):
    admin = await require_admin(request)
    db = get_db()
    changes = _clean_changes(inp.changes)
    _needs_confirm(changes, inp.confirm)
    before = {k: (await _default_policy(db))[k] for k in changes}
    await db.country_policy_settings.update_one({'_id': 'default'}, {'$set': {**changes, 'updated_at': _now()}}, upsert=True)
    invalidate_cache()
    await record_audit(db, admin, 'update_default', ['DEFAULT'], before, changes)
    return {'ok': True}


@admin_router.post('/policies/reset')
async def admin_reset_countries(inp: PolicyChanges, request: Request):
    admin = await require_admin(request)
    db = get_db()
    codes = sorted({_valid(c) for c in inp.codes})
    await db.country_policies.delete_many({'code': {'$in': codes}})
    invalidate_cache()
    await record_audit(db, admin, 'reset_to_default', codes, {}, {})
    return {'ok': True}


@admin_router.get('/audit')
async def admin_audit(request: Request, limit: int = Query(100, ge=1, le=500)):
    await require_admin(request)
    rows = await get_db().country_policy_audit.find({}, {'_id': 0}).sort('at', -1).to_list(limit)
    return {'entries': rows}


# ---------------- Admin: change requests ----------------
@admin_router.get('/change-requests')
async def admin_change_requests(request: Request, status: str = 'pending'):
    await require_admin(request)
    rows = await get_db().country_change_requests.find({'status': status}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return {'requests': rows}


class DecisionInput(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=500)


@admin_router.post('/change-requests/{request_id}')
async def admin_decide_change(request_id: str, inp: DecisionInput, request: Request):
    admin = await require_admin(request)
    db = get_db()
    req = await db.country_change_requests.find_one_and_update(
        {'request_id': request_id, 'status': 'pending'},
        {'$set': {'status': 'approved' if inp.approve else 'rejected', 'decided_at': _now(),
                  'decided_by': admin.get('user_id'), 'note': (inp.note or '')[:500]}}, projection={'_id': 0})
    if not req:
        raise HTTPException(status_code=404, detail='Request not found or already decided')
    if inp.approve:
        await db.users.update_one({'user_id': req['user_id']}, {'$set': {
            'country_of_residence': req['requested_country'], 'country_set_at': _now(), 'country_set_source': 'admin_approved'}})
    await record_audit(db, admin, 'country_change_' + ('approved' if inp.approve else 'rejected'), [req['requested_country']],
                       {'user_id': req['user_id'], 'country': req['current_country']}, {'country': req['requested_country']})
    return {'ok': True}


# ---------------- Admin: analytics ----------------
def _since(days: int) -> datetime:
    return _now() - timedelta(days=days)


async def _user_country_map(db) -> dict:
    return {u['user_id']: u.get('country_of_residence') or 'UNSET'
            async for u in db.users.find({'role': {'$nin': _STAFF}}, {'_id': 0, 'user_id': 1, 'country_of_residence': 1})}


def _bump(table: dict, code: str, key: str, n: float = 1) -> None:
    table.setdefault(code or 'UNSET', {}).setdefault(key, 0)
    table[code or 'UNSET'][key] += n


@admin_router.get('/analytics')
async def admin_country_analytics(request: Request, days: int = Query(30, ge=1, le=365)):
    await require_admin(request)
    db = get_db()
    since = _since(days)
    cmap = await _user_country_map(db)
    t: dict = {}
    traffic = {'is_staff': {'$ne': True}, 'is_test': {'$ne': True}}
    visitors: dict = {}
    sources: dict = {}
    landings: dict = {}
    async for s in db.acquisition_sessions.find({**traffic, 'started_at': {'$gte': since}},
                                                {'_id': 0, 'visitor_id': 1, 'geo_country': 1, 'views': 1, 'source_key': 1,
                                                 'entry_path': 1, 'is_new_visitor': 1}):
        code = s.get('geo_country') or 'UNKNOWN'
        _bump(t, code, 'sessions')
        _bump(t, code, 'page_visits', int(s.get('views') or 0))
        visitors.setdefault(code, set()).add(s.get('visitor_id'))
        src = sources.setdefault(code, {})
        src[s.get('source_key') or 'other'] = src.get(s.get('source_key') or 'other', 0) + 1
        lp = landings.setdefault(code, {})
        lp[s.get('entry_path') or '/'] = lp.get(s.get('entry_path') or '/', 0) + 1
    for code, v in visitors.items():
        t[code]['unique_visitors'] = len(v)
        t[code]['top_sources'] = sorted(sources[code].items(), key=lambda x: -x[1])[:5]
        t[code]['top_landing_pages'] = sorted(landings[code].items(), key=lambda x: -x[1])[:5]
    async for v in db.acquisition_visits.find({**traffic, 'created_at': {'$gte': since}}, {'_id': 0, 'geo_country': 1}):
        _bump(t, v.get('geo_country') or 'UNKNOWN', 'impressions')
    async for u in db.users.find({'role': {'$nin': _STAFF}}, {'_id': 0, 'country_of_residence': 1, 'created_at': 1,
                                                              'email_verified': 1, 'phone_verified': 1, 'fw_last_activity_at': 1,
                                                              'fw_last_login_at': 1}):
        code = u.get('country_of_residence') or 'UNSET'
        _bump(t, code, 'users_total')
        created = u.get('created_at')
        if isinstance(created, datetime) and created.replace(tzinfo=created.tzinfo or timezone.utc) >= since:
            _bump(t, code, 'users_new')
        last = u.get('fw_last_activity_at') or u.get('fw_last_login_at')
        if isinstance(last, datetime) and last.replace(tzinfo=last.tzinfo or timezone.utc) >= since:
            _bump(t, code, 'users_active')
            if not (isinstance(created, datetime) and created.replace(tzinfo=created.tzinfo or timezone.utc) >= since):
                _bump(t, code, 'users_returning')
        if u.get('email_verified'):
            _bump(t, code, 'email_verified')
        if u.get('phone_verified'):
            _bump(t, code, 'phone_verified')
    async for a in db.otp_attempts.find({'sent_at': {'$gte': since}, 'purpose': 'signup', 'channel': 'email'},
                                        {'_id': 0, 'country': 1}):
        _bump(t, a.get('country') or 'UNKNOWN', 'registration_attempts')
    async for a in db.otp_attempts.find({'sent_at': {'$gte': since}, 'channel': 'sms'}, {'_id': 0, 'country': 1}):
        _bump(t, a.get('country') or 'UNKNOWN', 'sms_otp_sent')
    async for g in db.world_game_sessions.find({'created_at': {'$gte': since}}, {'_id': 0, 'user_id': 1, 'status': 1}):
        code = cmap.get(g.get('user_id'))
        if code:
            _bump(t, code, 'free_world_plays')
            if g.get('status') == 'submitted':
                _bump(t, code, 'game_completions')
    async for x in db.tickets.find({'created_at': {'$gte': since}}, {'_id': 0, 'user_id': 1}):
        if cmap.get(x.get('user_id')):
            _bump(t, cmap[x['user_id']], 'tickets_purchased')
    async for x in db.world_contest_entries.find({}, {'_id': 0, 'user_id': 1}):
        if cmap.get(x.get('user_id')):
            _bump(t, cmap[x['user_id']], 'contest_entries')
    kind_map = {'topup': 'token_topups', 'bonus_grant': 'bonus_tokens', 'spend': 'ticket_spending', 'paid_prize_cash': 'winnings'}
    async for x in db.wallet_tx.find({'created_at': {'$gte': since}}, {'_id': 0, 'user_id': 1, 'kind': 1, 'amount': 1}):
        code = cmap.get(x.get('user_id'))
        if code and x.get('kind') in kind_map:
            _bump(t, code, kind_map[x['kind']], abs(float(x.get('amount') or 0)))
    async for x in db.cashout_requests.find({'created_at': {'$gte': since}}, {'_id': 0, 'user_id': 1, 'amount': 1}):
        code = cmap.get(x.get('user_id'))
        if code:
            _bump(t, code, 'withdrawals', float(x.get('amount') or 0))
    for row in t.values():
        att = row.get('registration_attempts', 0)
        row['signup_conversion_pct'] = round(100 * row.get('users_new', 0) / att, 1) if att else None
    otp = {r['_id']: r['n'] async for r in db.otp_events.aggregate([
        {'$match': {'at': {'$gte': since}}}, {'$group': {'_id': {'$concat': ['$channel', ':', '$result']}, 'n': {'$sum': 1}}}])}
    rows = [{'code': c, 'name': COUNTRIES.get(c, 'Not recorded' if c == 'UNSET' else 'Unknown (no edge country)'), **v}
            for c, v in t.items()]
    rows.sort(key=lambda r: -(r.get('users_total', 0) + r.get('sessions', 0)))
    return {'days': days, 'countries': rows, 'otp_totals': otp,
            'notes': ['Visitor countries come from the hosting edge header when available; they are traffic estimates, not residence.',
                      'User, game and wallet figures use the self-declared country of residence.',
                      'Registration attempts and SMS counts by country are only recorded from this release onwards.',
                      'Admin and internal test traffic is excluded.']}


@admin_router.get('/growth')
async def admin_country_growth(request: Request, days: int = Query(90, ge=7, le=730), country: Optional[str] = None):
    await require_admin(request)
    match = {'role': {'$nin': _STAFF}, 'created_at': {'$gte': _since(days)}}
    if country:
        match['country_of_residence'] = None if country == 'UNSET' else country.upper()
    rows = await get_db().users.aggregate([{'$match': match}, {'$group': {
        '_id': {'d': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}}, 'c': '$country_of_residence'},
        'n': {'$sum': 1}}}, {'$sort': {'_id.d': 1}}]).to_list(5000)
    return {'series': [{'date': r['_id']['d'], 'country': r['_id']['c'] or 'UNSET', 'new_users': r['n']} for r in rows]}


# ---------------- Admin: filtered CSV export ----------------
async def _filtered_user_ids(db, country, signup_method, verified, start, end):
    q = {'role': {'$nin': _STAFF}}
    if country:
        q['country_of_residence'] = None if country == 'UNSET' else country.upper()
    if signup_method in ('email', 'google'):
        q['method'] = signup_method
    if verified == 'email':
        q['email_verified'] = True
    elif verified == 'phone':
        q['phone_verified'] = True
    elif verified == 'unverified':
        q['phone_verified'] = {'$ne': True}
    if start or end:
        q['created_at'] = {k: v for k, v in (('$gte', start), ('$lte', end)) if v}
    return q


@admin_router.get('/export')
async def admin_country_export(request: Request, dataset: str = Query('users', pattern='^(users|wallet|tickets|promotions|withdrawals)$'),
                               country: Optional[str] = None, signup_method: Optional[str] = None,
                               verified: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
                               activity_days: Optional[int] = Query(None, ge=1, le=365),
                               permission: Optional[str] = None):
    await require_admin(request)
    db = get_db()
    parse = lambda s: datetime.fromisoformat(s).replace(tzinfo=timezone.utc) if s else None  # noqa: E731
    try:
        s_dt, e_dt = parse(start), parse(end)
    except ValueError:
        raise HTTPException(status_code=422, detail='Dates must be YYYY-MM-DD')
    uq = await _filtered_user_ids(db, country, signup_method, verified, None if dataset != 'users' else s_dt,
                                  None if dataset != 'users' else e_dt)
    if activity_days:
        uq['fw_last_activity_at'] = {'$gte': _since(activity_days)}
    users = await db.users.find(uq, {'_id': 0, 'user_id': 1, 'public_id': 1, 'username': 1, 'country_of_residence': 1,
                                     'method': 1, 'email_verified': 1, 'phone_verified': 1, 'created_at': 1,
                                     'fw_last_activity_at': 1, 'phone': 1, 'dob': 1, 'role': 1}).to_list(50000)
    if permission in PERM_KEYS:
        kept = []
        for u in users:
            if (await user_access(db, u))['permissions'].get(permission):
                kept.append(u)
        users = kept
    by_id = {u['user_id']: u for u in users}
    buf = io.StringIO()
    w = csv.writer(buf)
    if dataset == 'users':
        w.writerow(['public_id', 'username', 'country', 'signup_method', 'email_verified', 'phone_verified', 'created_at', 'last_active'])
        for u in users:
            w.writerow([u.get('public_id'), u.get('username'), u.get('country_of_residence') or '', u.get('method'),
                        u.get('email_verified'), u.get('phone_verified'), u.get('created_at'), u.get('fw_last_activity_at') or ''])
    else:
        coll, cols = {'wallet': ('wallet_tx', ['tx_id', 'kind', 'amount', 'note', 'created_at']),
                      'tickets': ('tickets', ['ticket_id', 'contest_id', 'created_at']),
                      'promotions': ('promotion_tickets', ['ticket_id', 'promotion_id', 'created_at']),
                      'withdrawals': ('cashout_requests', ['request_id', 'amount', 'status', 'created_at'])}[dataset]
        q = {'user_id': {'$in': list(by_id)}}
        if s_dt or e_dt:
            q['created_at'] = {k: v for k, v in (('$gte', s_dt), ('$lte', e_dt)) if v}
        w.writerow(['public_id', 'country', *cols])
        async for r in db[coll].find(q, {'_id': 0}).sort('created_at', -1).limit(100000):
            u = by_id.get(r.get('user_id'), {})
            w.writerow([u.get('public_id'), u.get('country_of_residence') or '', *[r.get(c, '') for c in cols]])
    buf.seek(0)
    name = f"prizeleague_{dataset}_{country or 'all'}_{_now():%Y%m%d}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv',
                             headers={'Content-Disposition': f'attachment; filename="{name}"'})


# ---------------- Admin: OTP / Twilio ----------------
async def _twilio_usage(period: str) -> dict:
    sid, token = os.environ.get('TWILIO_ACCOUNT_SID'), os.environ.get('TWILIO_AUTH_TOKEN')
    if not sid or not token:
        return {'available': False, 'reason': 'Twilio credentials not configured'}
    url = f'https://api.twilio.com/2010-04-01/Accounts/{sid}/Usage/Records/{period}.json'
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(url, auth=(sid, token), params={'PageSize': 200})
        if r.status_code != 200:
            return {'available': False, 'reason': f'Twilio returned {r.status_code}'}
        recs = [x for x in r.json().get('usage_records', [])
                if any(k in (x.get('category') or '') for k in ('sms', 'verify')) and float(x.get('price') or 0) > 0]
        return {'available': True, 'period': period, 'records': [
            {'category': x['category'], 'description': x.get('description'), 'count': x.get('count'),
             'price': float(x.get('price') or 0), 'unit': x.get('price_unit')} for x in recs]}
    except httpx.HTTPError as exc:
        return {'available': False, 'reason': type(exc).__name__}


@admin_router.get('/otp')
async def admin_otp_overview(request: Request):
    await require_admin(request)
    db = get_db()
    since = _since(1)
    month = _since(30)
    sms = {}
    async for a in db.otp_attempts.find({'channel': 'sms', 'sent_at': {'$gte': month}}, {'_id': 0, 'country': 1, 'sent_at': 1}):
        row = sms.setdefault(a.get('country') or 'UNKNOWN', {'sent_24h': 0, 'sent_30d': 0})
        row['sent_30d'] += 1
        at = a['sent_at'].replace(tzinfo=a['sent_at'].tzinfo or timezone.utc)
        if at >= since:
            row['sent_24h'] += 1
    alerts = await db.sms_spend_alerts.find({}, {'_id': 0}).sort('at', -1).to_list(50)
    return {'sms_by_country': sms, 'alerts': alerts,
            'twilio_this_month': await _twilio_usage('ThisMonth'), 'twilio_last_month': await _twilio_usage('LastMonth'),
            'rules': {'resend_cooldown_seconds': 30, 'max_sends_per_15_min': 5},
            'note': 'Twilio does not report cost per destination country; costs are shown as billed account totals.'}
