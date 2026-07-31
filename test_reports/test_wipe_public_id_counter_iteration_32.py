import asyncio
import json
import os
import random
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx
from motor.motor_asyncio import AsyncIOMotorClient


BACKEND_ENV = Path('/app/backend/.env')
FRONTEND_ENV = Path('/app/frontend/.env')
RESULT_PATH = Path('/app/test_reports/wipe_public_id_counter_iteration_32_result.json')

SUPER_EMAIL = 'bachanta8@gmail.com'
SUPER_PASSWORD = 'Herts@910022'
CONFIRM_PHRASE = 'WIPE DEMO DATA'

WIPEABLE_COLLECTIONS = (
    'audit_log', 'admin_audit', 'winner_audit',
    'contests', 'contest_draws', 'game_scores',
    'instant_win_configs', 'instant_win_reveals', 'kyc',
    'leaderboard_entries', 'meera_log', 'notifications', 'orders',
    'payment_transactions', 'postal_entries', 'referrals', 'support_cases',
    'tickets', 'user_sessions', 'wallet_tx', 'winners',
)


def load_env_file(path: Path) -> dict:
    values = {}
    if not path.exists():
        return values
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, val = line.split('=', 1)
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def json_safe(value):
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items() if k != '_id'}
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


class Recorder:
    def __init__(self):
        self.checks = []
        self.failures = []
        self.notes = []

    def check(self, name: str, condition: bool, detail=None):
        row = {'name': name, 'passed': bool(condition), 'detail': json_safe(detail)}
        self.checks.append(row)
        print(('PASS' if condition else 'FAIL') + f': {name} :: {row["detail"]}')
        if not condition:
            self.failures.append(row)


async def post_json(client: httpx.AsyncClient, path: str, token: str | None, payload: dict):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return await client.post(path, headers=headers, json=payload)


async def get_users_by_id(api: httpx.AsyncClient, token: str):
    r = await api.get('/api/admin/users', headers={'Authorization': f'Bearer {token}'})
    if r.status_code != 200:
        return r.status_code, {}
    users = r.json()
    return r.status_code, {u.get('user_id'): u for u in users if u.get('user_id')}


async def seed_wipeable_docs(db, run_id: str, owner_user_id: str, regular_user_id: str):
    now = datetime.now(timezone.utc)
    base = {'qa_run_id': run_id, 'created_at': now}
    docs = {
        'audit_log': {**base, 'action': 'qa_old_audit'},
        'admin_audit': {**base, 'action': 'qa_old_admin_audit'},
        'winner_audit': {**base, 'action': 'qa_old_winner_audit'},
        'contests': {**base, 'contest_id': f'qa_contest_{run_id}', 'slug': f'qa-{run_id}', 'title': 'QA contest', 'prize_amount': 10, 'status': 'live'},
        'contest_draws': {**base, 'draw_id': f'qa_draw_{run_id}', 'contest_id': f'qa_contest_{run_id}'},
        'game_scores': {**base, 'score_id': f'qa_score_{run_id}', 'contest_id': f'qa_contest_{run_id}', 'ticket_id': f'qa_ticket_{run_id}', 'user_id': regular_user_id, 'points': 99},
        'instant_win_configs': {**base, 'config_id': f'qa_iwc_{run_id}', 'contest_id': f'qa_contest_{run_id}'},
        'instant_win_reveals': {**base, 'reveal_id': f'qa_iwr_{run_id}', 'user_id': regular_user_id},
        'kyc': {**base, 'kyc_id': f'qa_kyc_{run_id}', 'user_id': regular_user_id, 'status': 'pending'},
        'leaderboard_entries': {**base, 'entry_id': f'qa_lb_{run_id}', 'contest_id': f'qa_contest_{run_id}', 'user_id': regular_user_id, 'points': 99},
        'meera_log': {**base, 'message': 'qa'},
        'notifications': {**base, 'notification_id': f'qa_notif_{run_id}', 'user_id': regular_user_id},
        'orders': {**base, 'order_id': f'qa_order_{run_id}', 'user_id': regular_user_id, 'total': 10, 'status': 'paid'},
        'payment_transactions': {**base, 'tx_id': f'qa_pay_{run_id}', 'user_id': regular_user_id, 'amount': 10},
        'postal_entries': {**base, 'entry_id': f'qa_postal_{run_id}', 'user_id': regular_user_id},
        'referrals': {**base, 'referral_id': f'qa_ref_{run_id}', 'referrer_user_id': owner_user_id, 'referred_user_id': regular_user_id},
        'support_cases': {**base, 'case_id': f'qa_case_{run_id}', 'user_id': regular_user_id, 'status': 'open'},
        'tickets': {**base, 'ticket_id': f'qa_ticket_{run_id}', 'contest_id': f'qa_contest_{run_id}', 'user_id': regular_user_id, 'order_id': f'qa_order_{run_id}'},
        'user_sessions': {**base, 'session_token': f'qa_session_{run_id}', 'user_id': regular_user_id, 'expires_at': now + timedelta(days=1)},
        'wallet_tx': {**base, 'tx_id': f'qa_wallet_tx_{run_id}', 'user_id': regular_user_id, 'amount': 5, 'balance_after': 5, 'kind': 'topup'},
        'winners': {**base, 'winner_id': f'qa_winner_{run_id}', 'contest_id': f'qa_contest_{run_id}', 'user_id': regular_user_id, 'prize_amount': 10},
    }
    for col, doc in docs.items():
        await db[col].insert_one(doc)


async def seed_regular_user_and_wallet(db, run_id: str, suffix: str):
    now = datetime.now(timezone.utc)
    user_id = f'qa_regular_{suffix}_{run_id}'
    await db.users.insert_one({
        'user_id': user_id,
        'email': f'qa_regular_{suffix}_{run_id}@example.test',
        'name': 'QA Regular User',
        'method': 'email',
        'role': 'user',
        'created_at': now,
        'qa_run_id': run_id,
    })
    await db.wallets.insert_one({'user_id': user_id, 'balance': 88.0, 'lifetime_topup': 88.0, 'lifetime_spend': 0.0, 'qa_run_id': run_id})
    return user_id


async def seed_staff(db, run_id: str, suffix: str, role: str = 'admin', public_id_marker='omit'):
    now = datetime.now(timezone.utc)
    user_id = f'qa_staff_{suffix}_{run_id}'
    doc = {
        'user_id': user_id,
        'email': f'qa_staff_{suffix}_{run_id}@example.test',
        'name': f'QA Staff {suffix}',
        'method': 'email',
        'role': role,
        'created_at': now,
        'qa_run_id': run_id,
    }
    if public_id_marker != 'omit':
        doc['public_id'] = public_id_marker
    await db.users.insert_one(doc)
    await db.wallets.insert_one({'user_id': user_id, 'balance': 123.0, 'lifetime_topup': 123.0, 'lifetime_spend': 45.0, 'qa_run_id': run_id})
    return user_id


async def reset_to_super_only(db, super_user_id: str, run_id: str, counter_seq: int = 1, public_id: str | None = 'PL10000'):
    # Controlled preview-state reset for this destructive wipe test: remove every
    # non-super account so exact counter expectations are not contaminated.
    await db.users.delete_many({'user_id': {'$ne': super_user_id}})
    await db.wallets.delete_many({'user_id': {'$ne': super_user_id}})
    for col in WIPEABLE_COLLECTIONS:
        await db[col].delete_many({'qa_run_id': {'$exists': True}})
    if public_id is None:
        await db.users.update_one({'user_id': super_user_id}, {'$unset': {'public_id': ''}})
    else:
        await db.users.update_one({'user_id': super_user_id}, {'$set': {'public_id': public_id}})
    await db.users.update_one({'user_id': super_user_id}, {'$set': {'role': 'super_admin'}})
    await db.counters.update_one({'_id': 'user_public_id'}, {'$set': {'seq': counter_seq}}, upsert=True)


async def cleanup(db, rec: Recorder, super_user_id: str | None, legal_slug: str, settings_marker: str):
    if super_user_id:
        await db.users.delete_many({'user_id': {'$ne': super_user_id}})
        await db.wallets.delete_many({'user_id': {'$ne': super_user_id}})
        await db.users.update_one({'user_id': super_user_id}, {'$set': {'public_id': 'PL10000', 'role': 'super_admin'}})
    else:
        await db.users.delete_many({'email': {'$regex': r'^qa_'}})
        await db.users.update_one({'email': SUPER_EMAIL}, {'$set': {'public_id': 'PL10000', 'role': 'super_admin'}})
    for col in WIPEABLE_COLLECTIONS:
        await db[col].delete_many({'qa_run_id': {'$exists': True}})
    await db.admin_audit.delete_many({'by_email': SUPER_EMAIL, 'action': 'wipe_demo_data'})
    await db.legal_documents.delete_one({'slug': legal_slug})
    await db.settings.update_one({'_id': 'app'}, {'$unset': {settings_marker: ''}})
    await db.counters.update_one({'_id': 'user_public_id'}, {'$set': {'seq': 1}}, upsert=True)
    clean_users = await db.users.find({}, {'_id': 0, 'user_id': 1, 'email': 1, 'role': 1, 'public_id': 1}).sort('email', 1).to_list(20)
    clean_counter = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
    rec.notes.append({'cleanup_users': clean_users, 'cleanup_counter': clean_counter})


def signup_payload(run_id: str, suffix: str):
    # UK-like E.164 number, unique per registration and valid for TEST_OTP_BYPASS_CODE.
    phone = '+4477' + str(random.randint(10000000, 99999999))
    return {
        'email': f'qa.signup.{suffix}.{run_id}.{int(time.time() * 1000)}@example.com',
        'password': 'Password123!',
        'name': f'QA Signup {suffix}',
        'phone': phone,
        'otp_code': '000000',
        'accept_terms': True,
        'dob': '2000-08-02',
        'address': '221B Baker St, London',
    }


async def register_and_expect(api, rec, run_id, suffix, expected_public_id, existing_staff_public_id=None):
    r = await api.post('/api/auth/register', json=signup_payload(run_id, suffix))
    body = r.json() if r.headers.get('content-type', '').startswith('application/json') else {'raw': r.text[:300]}
    user = body.get('user') or {}
    rec.check(
        f'Next signup after {suffix} receives {expected_public_id}',
        r.status_code == 200 and user.get('public_id') == expected_public_id,
        {'status': r.status_code, 'body': body, 'expected_public_id': expected_public_id, 'existing_staff_public_id': existing_staff_public_id},
    )
    return user.get('user_id'), user.get('public_id')


async def main():
    rec = Recorder()
    env = load_env_file(BACKEND_ENV)
    frontend_env = load_env_file(FRONTEND_ENV)
    mongo_url = env.get('MONGO_URL') or os.environ.get('MONGO_URL')
    db_name = env.get('DB_NAME') or os.environ.get('DB_NAME') or 'gamezoo'
    api_base = frontend_env.get('REACT_APP_BACKEND_URL') or 'http://localhost:8001'
    client_mongo = AsyncIOMotorClient(mongo_url)
    db = client_mongo[db_name]
    run_id = uuid.uuid4().hex[:10]
    legal_slug = f'qa-wipe-preserve-{run_id}'
    settings_marker = f'qa_wipe_preserve_{run_id}'
    super_user_id = None
    result = {
        'api_base': api_base,
        'db_name': db_name,
        'run_id': run_id,
        'checks': rec.checks,
        'failures': rec.failures,
        'notes': rec.notes,
    }
    try:
        timeout = httpx.Timeout(30.0, connect=15.0)
        async with httpx.AsyncClient(base_url=api_base, timeout=timeout, follow_redirects=True) as api:
            health = await api.get('/api/')
            rec.check('API health responds', health.status_code == 200, {'status': health.status_code, 'body': health.text[:200]})

            login = await api.post('/api/auth/login', json={'email': SUPER_EMAIL, 'password': SUPER_PASSWORD})
            login_body = login.json() if login.headers.get('content-type', '').startswith('application/json') else {'raw': login.text[:300]}
            token = login_body.get('token')
            rec.check('Super admin login works', login.status_code == 200 and bool(token), {'status': login.status_code, 'body': login_body if login.status_code != 200 else {'token_present': bool(token), 'user': login_body.get('user')}})
            if not token:
                result['blocked'] = 'Super admin credentials did not authenticate'
                return result

            super_doc = await db.users.find_one({'email': SUPER_EMAIL}, {'_id': 0, 'user_id': 1, 'email': 1, 'role': 1, 'public_id': 1})
            super_user_id = super_doc.get('user_id') if super_doc else None
            rec.check('Super admin DB document exists for controlled seeding', bool(super_user_id), super_doc)
            if not super_user_id:
                result['blocked'] = 'No super admin DB document found'
                return result

            # Preserve-control sentinels used by the guardrail/wipe behavior regression checks.
            await db.legal_documents.insert_one({
                'doc_id': f'qa_legal_{run_id}', 'slug': legal_slug, 'title': 'QA preserve legal',
                'content': 'must survive wipe', 'status': 'draft', 'version': 1,
                'created_at': datetime.now(timezone.utc), 'last_updated': datetime.now(timezone.utc),
            })
            await db.settings.update_one({'_id': 'app'}, {'$set': {settings_marker: 'must_survive'}}, upsert=True)

            # CASE 1: Missing-id case + guardrails + wipeable/preserve regressions.
            await reset_to_super_only(db, super_user_id, run_id, counter_seq=999, public_id=None)
            staff_missing_id = await seed_staff(db, run_id, 'missing', role='admin')
            regular_id = await seed_regular_user_and_wallet(db, run_id, 'missing')
            await seed_wipeable_docs(db, run_id, super_user_id, regular_id)

            wrong_confirm = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': 'WRONG PHRASE'})
            remaining_contests_after_wrong_confirm = await db.contests.count_documents({'qa_run_id': run_id})
            rec.check('Guardrail rejects wrong confirm with 400 and does not delete demo data', wrong_confirm.status_code == 400 and remaining_contests_after_wrong_confirm == 1, {'status': wrong_confirm.status_code, 'body': wrong_confirm.text[:300], 'qa_contests_remaining': remaining_contests_after_wrong_confirm})

            wrong_password = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': 'wrong-password', 'confirm': CONFIRM_PHRASE})
            remaining_contests_after_wrong_password = await db.contests.count_documents({'qa_run_id': run_id})
            rec.check('Guardrail rejects wrong password with 401 and does not delete demo data', wrong_password.status_code == 401 and remaining_contests_after_wrong_password == 1, {'status': wrong_password.status_code, 'body': wrong_password.text[:300], 'qa_contests_remaining': remaining_contests_after_wrong_password})

            wipe_missing = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': CONFIRM_PHRASE})
            wipe_missing_body = wipe_missing.json() if wipe_missing.headers.get('content-type', '').startswith('application/json') else {'raw': wipe_missing.text[:300]}
            rec.check('Missing-id wipe succeeds', wipe_missing.status_code == 200 and wipe_missing_body.get('ok') is True, {'status': wipe_missing.status_code, 'body': wipe_missing_body})

            status, users_map = await get_users_by_id(api, token)
            counter_missing = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
            rec.check('Missing-id case backfills super_admin=PL10000 and admin=PL10001 via admin API', status == 200 and users_map.get(super_user_id, {}).get('public_id') == 'PL10000' and users_map.get(staff_missing_id, {}).get('public_id') == 'PL10001', {'status': status, 'super': users_map.get(super_user_id), 'staff': users_map.get(staff_missing_id)})
            rec.check('Missing-id case sets counter.seq=2', counter_missing and counter_missing.get('seq') == 2, counter_missing)
            await register_and_expect(api, rec, run_id, 'missing-id-case', 'PL10002')

            remaining_markers = {col: await db[col].count_documents({'qa_run_id': run_id}) for col in WIPEABLE_COLLECTIONS}
            rec.check('All seeded wipeable demo collection rows are removed by valid wipe', all(v == 0 for v in remaining_markers.values()), remaining_markers)
            status_after_wipe, users_after_wipe = await get_users_by_id(api, token)
            staff_wallet_after = await db.wallets.find_one({'user_id': staff_missing_id}, {'_id': 0})
            regular_wallet_after = await db.wallets.find_one({'user_id': regular_id}, {'_id': 0})
            rec.check('Regular demo user is deleted while preserved staff remains visible via API', status_after_wipe == 200 and regular_id not in users_after_wipe and staff_missing_id in users_after_wipe, {'status': status_after_wipe, 'regular_present': regular_id in users_after_wipe, 'staff': users_after_wipe.get(staff_missing_id)})
            rec.check('Preserved staff wallet is reset and regular wallet is deleted', staff_wallet_after and staff_wallet_after.get('balance') == 0.0 and staff_wallet_after.get('lifetime_topup') == 0.0 and regular_wallet_after is None, {'staff_wallet': staff_wallet_after, 'regular_wallet': regular_wallet_after})
            legal_list = await api.get('/api/admin/legal/documents', headers={'Authorization': f'Bearer {token}'})
            settings = await api.get('/api/admin/settings', headers={'Authorization': f'Bearer {token}'})
            legal_docs = legal_list.json().get('documents', []) if legal_list.status_code == 200 else []
            settings_body = settings.json() if settings.headers.get('content-type', '').startswith('application/json') else {}
            rec.check('legal_documents and settings are preserved after wipe via admin APIs', legal_list.status_code == 200 and any(d.get('slug') == legal_slug for d in legal_docs) and settings.status_code == 200 and settings_body.get(settings_marker) == 'must_survive', {'legal_status': legal_list.status_code, 'legal_found': any(d.get('slug') == legal_slug for d in legal_docs), 'settings_status': settings.status_code, 'settings_marker': settings_body.get(settings_marker)})

            # CASE 2: Previous failure regression: super_admin PL10000 + operator PL10001.
            await reset_to_super_only(db, super_user_id, run_id, counter_seq=123, public_id='PL10000')
            staff_existing_id = await seed_staff(db, run_id, 'existing-pl10001', role='operator', public_id_marker='PL10001')
            wipe_existing = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': CONFIRM_PHRASE})
            rec.check('Existing PL10000/PL10001 preserved-staff wipe succeeds', wipe_existing.status_code == 200 and wipe_existing.json().get('ok') is True, {'status': wipe_existing.status_code, 'body': wipe_existing.json() if wipe_existing.headers.get('content-type', '').startswith('application/json') else wipe_existing.text[:300]})
            status, users_map = await get_users_by_id(api, token)
            counter_existing = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
            rec.check('Regression case retains super_admin PL10000 and operator PL10001 via admin API', status == 200 and users_map.get(super_user_id, {}).get('public_id') == 'PL10000' and users_map.get(staff_existing_id, {}).get('public_id') == 'PL10001', {'status': status, 'super': users_map.get(super_user_id), 'operator': users_map.get(staff_existing_id)})
            rec.check('Regression case sets counter.seq=2, not 1', counter_existing and counter_existing.get('seq') == 2, counter_existing)
            await register_and_expect(api, rec, run_id, 'existing-pl10001-case', 'PL10002', existing_staff_public_id='PL10001')

            # CASE 3: Super-admin-only case.
            await reset_to_super_only(db, super_user_id, run_id, counter_seq=555, public_id='PL10000')
            wipe_super_only = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': CONFIRM_PHRASE})
            status, users_map = await get_users_by_id(api, token)
            counter_super_only = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
            rec.check('Super-admin-only wipe leaves only super_admin PL10000 and counter.seq=1', wipe_super_only.status_code == 200 and status == 200 and len(users_map) == 1 and users_map.get(super_user_id, {}).get('public_id') == 'PL10000' and counter_super_only and counter_super_only.get('seq') == 1, {'wipe_status': wipe_super_only.status_code, 'users': list(users_map.values()), 'counter': counter_super_only})
            await register_and_expect(api, rec, run_id, 'super-only-case', 'PL10001')

            # CASE 4: Backfill/gap case: super missing, other staff already PL10005.
            await reset_to_super_only(db, super_user_id, run_id, counter_seq=777, public_id=None)
            staff_gap_id = await seed_staff(db, run_id, 'gap-pl10005', role='admin', public_id_marker='PL10005')
            wipe_gap = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': CONFIRM_PHRASE})
            status, users_map = await get_users_by_id(api, token)
            counter_gap = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
            rec.check('Backfill gap case sets super_admin=PL10000 and preserves admin PL10005 via API', wipe_gap.status_code == 200 and status == 200 and users_map.get(super_user_id, {}).get('public_id') == 'PL10000' and users_map.get(staff_gap_id, {}).get('public_id') == 'PL10005', {'wipe_status': wipe_gap.status_code, 'super': users_map.get(super_user_id), 'admin_gap': users_map.get(staff_gap_id)})
            rec.check('Backfill gap case sets counter.seq=6', counter_gap and counter_gap.get('seq') == 6, counter_gap)
            await register_and_expect(api, rec, run_id, 'gap-pl10005-case', 'PL10006', existing_staff_public_id='PL10005')

    except Exception as exc:
        rec.check('Unexpected test harness exception', False, {'type': type(exc).__name__, 'message': str(exc)})
    finally:
        await cleanup(db, rec, super_user_id, legal_slug, settings_marker)
        result['checks'] = rec.checks
        result['failures'] = rec.failures
        result['notes'] = rec.notes
        result['passed'] = len(rec.failures) == 0 and not result.get('blocked')
        RESULT_PATH.write_text(json.dumps(json_safe(result), indent=2))
        client_mongo.close()
    return result


if __name__ == '__main__':
    outcome = asyncio.run(main())
    print('\nRESULT_JSON=' + json.dumps(json_safe(outcome), indent=2))