import asyncio
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx
from motor.motor_asyncio import AsyncIOMotorClient


BACKEND_ENV = Path('/app/backend/.env')
FRONTEND_ENV = Path('/app/frontend/.env')
RESULT_PATH = Path('/app/test_reports/wipe_public_id_backfill_iteration_31_result.json')

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
        val = val.strip().strip('"').strip("'")
        values[key.strip()] = val
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

    def check(self, name: str, condition: bool, detail):
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


async def seed_regular_user_and_wallet(db, run_id: str):
    now = datetime.now(timezone.utc)
    user_id = f'qa_regular_{run_id}'
    await db.users.insert_one({
        'user_id': user_id,
        'email': f'qa_regular_{run_id}@example.test',
        'name': 'QA Regular User',
        'method': 'email',
        'role': 'user',
        'created_at': now,
        'qa_run_id': run_id,
    })
    await db.wallets.insert_one({'user_id': user_id, 'balance': 88.0, 'lifetime_topup': 88.0, 'lifetime_spend': 0.0, 'qa_run_id': run_id})
    return user_id


async def seed_staff(db, run_id: str, suffix: str, role: str = 'admin', public_id=None):
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
    if public_id is not None:
        doc['public_id'] = public_id
    await db.users.insert_one(doc)
    await db.wallets.insert_one({'user_id': user_id, 'balance': 123.0, 'lifetime_topup': 123.0, 'lifetime_spend': 45.0, 'qa_run_id': run_id})
    return user_id


async def cleanup(db, rec: Recorder, super_user_id: str | None, qa_ids: set[str], legal_slug: str, settings_marker: str):
    # Remove QA users/wallets and all QA marker rows that may survive a failed run.
    if qa_ids:
        await db.users.delete_many({'user_id': {'$in': list(qa_ids)}})
        await db.wallets.delete_many({'user_id': {'$in': list(qa_ids)}})
    await db.users.delete_many({'email': {'$regex': r'^qa_(staff|regular|signup)_'}})
    await db.wallets.delete_many({'qa_run_id': {'$exists': True}})
    for col in WIPEABLE_COLLECTIONS:
        await db[col].delete_many({'qa_run_id': {'$exists': True}})
    # Remove the audit rows generated by this QA run, leaving the preview clean.
    await db.admin_audit.delete_many({'by_email': SUPER_EMAIL, 'action': 'wipe_demo_data'})
    await db.legal_documents.delete_one({'slug': legal_slug})
    await db.settings.update_one({'_id': 'app'}, {'$unset': {settings_marker: ''}})
    if super_user_id:
        await db.users.update_one({'user_id': super_user_id}, {'$set': {'public_id': 'PL10000'}})
    else:
        await db.users.update_one({'email': SUPER_EMAIL}, {'$set': {'public_id': 'PL10000'}})
    await db.counters.update_one({'_id': 'user_public_id'}, {'$set': {'seq': 1}}, upsert=True)
    clean_super = await db.users.find_one({'email': SUPER_EMAIL}, {'_id': 0, 'user_id': 1, 'public_id': 1})
    clean_counter = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
    rec.notes.append({'cleanup_super': clean_super, 'cleanup_counter': clean_counter})


async def main():
    rec = Recorder()
    env = load_env_file(BACKEND_ENV)
    frontend_env = load_env_file(FRONTEND_ENV)
    mongo_url = env.get('MONGO_URL') or os.environ.get('MONGO_URL')
    db_name = env.get('DB_NAME') or os.environ.get('DB_NAME') or 'gamezoo'
    api_base = frontend_env.get('REACT_APP_BACKEND_URL') or 'http://localhost:8001'
    # Use the public preview URL requested by the main agent; direct DB checks use the same backend env.
    client_mongo = AsyncIOMotorClient(mongo_url)
    db = client_mongo[db_name]
    run_id = uuid.uuid4().hex[:10]
    qa_ids: set[str] = set()
    super_user_id = None
    legal_slug = f'qa-wipe-preserve-{run_id}'
    settings_marker = f'qa_wipe_preserve_{run_id}'
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
            rec.check('Super admin login works', login.status_code == 200 and login.json().get('token'), {'status': login.status_code, 'body': login.text[:300]})
            if login.status_code != 200 or not login.json().get('token'):
                result['blocked'] = 'Super admin credentials did not authenticate'
                return result
            token = login.json()['token']

            super_doc = await db.users.find_one({'email': SUPER_EMAIL}, {'_id': 0})
            super_user_id = super_doc.get('user_id') if super_doc else None
            rec.check('Super admin DB document exists', bool(super_user_id), {'super_user_id': super_user_id})
            if not super_user_id:
                result['blocked'] = 'No super admin DB document found'
                return result

            # Preserve-control sentinels.
            await db.legal_documents.insert_one({
                'doc_id': f'qa_legal_{run_id}', 'slug': legal_slug, 'title': 'QA preserve legal',
                'content': 'must survive wipe', 'status': 'draft', 'version': 1,
                'created_at': datetime.now(timezone.utc), 'last_updated': datetime.now(timezone.utc),
            })
            await db.settings.update_one({'_id': 'app'}, {'$set': {settings_marker: 'must_survive'}}, upsert=True)

            # Scenario 1: super admin missing public_id; another staff account missing public_id.
            staff_missing_id = await seed_staff(db, run_id, 'missing', role='admin')
            qa_ids.add(staff_missing_id)
            regular_id = await seed_regular_user_and_wallet(db, run_id)
            qa_ids.add(regular_id)
            await seed_wipeable_docs(db, run_id, super_user_id, regular_id)
            await db.users.update_one({'user_id': super_user_id}, {'$unset': {'public_id': ''}})
            await db.counters.update_one({'_id': 'user_public_id'}, {'$set': {'seq': 999}}, upsert=True)

            wrong_confirm = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': 'WRONG PHRASE'})
            remaining_contests_after_wrong_confirm = await db.contests.count_documents({'qa_run_id': run_id})
            rec.check('Wipe rejects wrong confirm phrase and does not delete data', wrong_confirm.status_code == 400 and remaining_contests_after_wrong_confirm == 1, {'status': wrong_confirm.status_code, 'body': wrong_confirm.text[:300], 'qa_contests_remaining': remaining_contests_after_wrong_confirm})

            wrong_password = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': 'wrong-password', 'confirm': CONFIRM_PHRASE})
            remaining_contests_after_wrong_password = await db.contests.count_documents({'qa_run_id': run_id})
            rec.check('Wipe rejects wrong password and does not delete data', wrong_password.status_code == 401 and remaining_contests_after_wrong_password == 1, {'status': wrong_password.status_code, 'body': wrong_password.text[:300], 'qa_contests_remaining': remaining_contests_after_wrong_password})

            wipe1 = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': CONFIRM_PHRASE})
            rec.check('Wipe succeeds with correct password and confirm', wipe1.status_code == 200 and wipe1.json().get('ok') is True, {'status': wipe1.status_code, 'body': json_safe(wipe1.json() if wipe1.headers.get('content-type', '').startswith('application/json') else wipe1.text[:300])})

            super_after_wipe1 = await db.users.find_one({'user_id': super_user_id}, {'_id': 0, 'user_id': 1, 'public_id': 1, 'role': 1})
            staff_missing_after = await db.users.find_one({'user_id': staff_missing_id}, {'_id': 0, 'user_id': 1, 'public_id': 1, 'role': 1})
            counter_after_wipe1 = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
            rec.check('Backfills missing super admin public_id to PL10000', super_after_wipe1 and super_after_wipe1.get('public_id') == 'PL10000', super_after_wipe1)
            rec.check('Backfills missing non-super staff public_id to PL10001', staff_missing_after and staff_missing_after.get('public_id') == 'PL10001', staff_missing_after)
            rec.check('Counter becomes 2 with super admin + one missing staff after wipe', counter_after_wipe1 and counter_after_wipe1.get('seq') == 2, counter_after_wipe1)

            remaining_markers = {col: await db[col].count_documents({'qa_run_id': run_id}) for col in WIPEABLE_COLLECTIONS}
            # admin_audit total may be 1 by design; marker count must be zero because old demo audit row was wiped.
            rec.check('All seeded wipeable demo collection rows are removed', all(v == 0 for v in remaining_markers.values()), remaining_markers)
            player_after_wipe1 = await db.users.find_one({'user_id': regular_id}, {'_id': 0, 'user_id': 1})
            staff_wallet_after_wipe1 = await db.wallets.find_one({'user_id': staff_missing_id}, {'_id': 0})
            player_wallet_after_wipe1 = await db.wallets.find_one({'user_id': regular_id}, {'_id': 0})
            rec.check('Regular demo user is deleted while staff is preserved', player_after_wipe1 is None and staff_missing_after is not None, {'regular_user': player_after_wipe1, 'staff': staff_missing_after})
            rec.check('Preserved staff wallet is reset and regular wallet is deleted', staff_wallet_after_wipe1 and staff_wallet_after_wipe1.get('balance') == 0.0 and staff_wallet_after_wipe1.get('lifetime_topup') == 0.0 and player_wallet_after_wipe1 is None, {'staff_wallet': staff_wallet_after_wipe1, 'regular_wallet': player_wallet_after_wipe1})
            legal_after = await db.legal_documents.find_one({'slug': legal_slug}, {'_id': 0, 'slug': 1, 'title': 1})
            settings_after = await db.settings.find_one({'_id': 'app'}, {'_id': 0, settings_marker: 1})
            rec.check('legal_documents and settings are preserved', bool(legal_after) and settings_after and settings_after.get(settings_marker) == 'must_survive', {'legal': legal_after, 'settings_marker': settings_after})

            # Scenario 2: idempotent existing IDs; expose counter regression that causes duplicate next signup public_id.
            await db.users.delete_one({'user_id': staff_missing_id})
            await db.wallets.delete_one({'user_id': staff_missing_id})
            qa_ids.discard(staff_missing_id)
            staff_existing_id = await seed_staff(db, run_id, 'existing', role='operator', public_id='PL10001')
            qa_ids.add(staff_existing_id)
            await db.users.update_one({'user_id': super_user_id}, {'$set': {'public_id': 'PL10000'}})
            await db.counters.update_one({'_id': 'user_public_id'}, {'$set': {'seq': 123}}, upsert=True)
            wipe2 = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': CONFIRM_PHRASE})
            rec.check('Idempotent wipe succeeds with existing staff IDs', wipe2.status_code == 200 and wipe2.json().get('ok') is True, {'status': wipe2.status_code, 'body': json_safe(wipe2.json() if wipe2.headers.get('content-type', '').startswith('application/json') else wipe2.text[:300])})
            super_after_wipe2 = await db.users.find_one({'user_id': super_user_id}, {'_id': 0, 'user_id': 1, 'public_id': 1})
            staff_existing_after = await db.users.find_one({'user_id': staff_existing_id}, {'_id': 0, 'user_id': 1, 'public_id': 1})
            counter_after_wipe2 = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
            rec.check('Existing PL10000/PL10001 staff IDs are retained', super_after_wipe2 and super_after_wipe2.get('public_id') == 'PL10000' and staff_existing_after and staff_existing_after.get('public_id') == 'PL10001', {'super': super_after_wipe2, 'staff': staff_existing_after})
            rec.check('Counter accounts for two preserved staff users so next signup should be PL10002', counter_after_wipe2 and counter_after_wipe2.get('seq') == 2, counter_after_wipe2)

            signup_email = f'qa.signup.{run_id}@example.com'
            signup_phone = '+447700' + str(int(time.time()))[-6:]
            signup = await api.post('/api/auth/register', json={
                'email': signup_email,
                'password': 'Password123!',
                'name': 'QA Signup User',
                'phone': signup_phone,
                'otp_code': '000000',
                'accept_terms': True,
                'dob': '2000-08-02',
                'address': '221B Baker St, London',
            })
            signup_body = signup.json() if signup.headers.get('content-type', '').startswith('application/json') else {'raw': signup.text[:300]}
            signup_user_id = signup_body.get('user', {}).get('user_id')
            if signup_user_id:
                qa_ids.add(signup_user_id)
            rec.check('Next signup after two preserved staff receives non-duplicate PL10002', signup.status_code == 200 and signup_body.get('user', {}).get('public_id') == 'PL10002', {'status': signup.status_code, 'body': signup_body, 'existing_staff_public_id': staff_existing_after.get('public_id') if staff_existing_after else None})

            # Scenario 3/final cleanup state: only the super admin is preserved, counter must be exactly 1.
            await db.users.delete_many({'user_id': {'$in': [uid for uid in qa_ids if uid != super_user_id]}})
            await db.wallets.delete_many({'user_id': {'$in': [uid for uid in qa_ids if uid != super_user_id]}})
            qa_ids.clear()
            await db.users.update_one({'user_id': super_user_id}, {'$set': {'public_id': 'PL10000'}})
            await db.counters.update_one({'_id': 'user_public_id'}, {'$set': {'seq': 555}}, upsert=True)
            wipe3 = await post_json(api, '/api/admin/system/wipe-demo-data', token, {'password': SUPER_PASSWORD, 'confirm': CONFIRM_PHRASE})
            counter_after_wipe3 = await db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1})
            super_after_wipe3 = await db.users.find_one({'user_id': super_user_id}, {'_id': 0, 'user_id': 1, 'public_id': 1})
            rec.check('With super admin only, wipe leaves public_id PL10000 and counter.seq exactly 1', wipe3.status_code == 200 and super_after_wipe3 and super_after_wipe3.get('public_id') == 'PL10000' and counter_after_wipe3 and counter_after_wipe3.get('seq') == 1, {'wipe_status': wipe3.status_code, 'super': super_after_wipe3, 'counter': counter_after_wipe3})

    except Exception as exc:
        rec.check('Unexpected test harness exception', False, {'type': type(exc).__name__, 'message': str(exc)})
    finally:
        await cleanup(db, rec, super_user_id, qa_ids, legal_slug, settings_marker)
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