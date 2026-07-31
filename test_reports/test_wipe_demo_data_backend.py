#!/usr/bin/env python3
"""Focused backend verification for the admin Wipe Demo Data flow.

Creates QA-only demo rows, exercises auth/validation guardrails, runs the
destructive endpoint, verifies admin-visible data is gone, and then removes any
QA staff rows that are intentionally preserved by the endpoint.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

ROOT = Path('/app')
BACKEND = ROOT / 'backend'
sys.path.insert(0, str(BACKEND))

from auth import hash_password  # noqa: E402

ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'
USER_PASS = 'QaUserPass!234'
STAFF_PASS = 'QaStaffPass!234'

WIPEABLE_COLLECTIONS = (
    'audit_log', 'contests', 'contest_draws', 'game_scores',
    'instant_win_configs', 'instant_win_reveals', 'kyc',
    'leaderboard_entries', 'meera_log', 'notifications', 'orders',
    'payment_transactions', 'postal_entries', 'referrals', 'support_cases',
    'tickets', 'user_sessions', 'wallet_tx', 'winners',
)


def load_env() -> tuple[str, str, str]:
    be = dotenv_values(BACKEND / '.env')
    fe = dotenv_values(ROOT / 'frontend' / '.env')
    mongo_url = be['MONGO_URL']
    db_name = (be.get('DB_NAME') or 'gamezoo').strip('"')
    backend_url = (fe.get('REACT_APP_BACKEND_URL') or 'http://localhost:8001').rstrip('/')
    return mongo_url, db_name, f'{backend_url}/api'


def jdump(obj):
    print(json.dumps(obj, indent=2, default=str))


def login(api: str, email: str, password: str) -> str:
    r = requests.post(f'{api}/auth/login', json={'email': email, 'password': password}, timeout=30)
    if r.status_code != 200:
        raise AssertionError(f'Login failed for {email}: {r.status_code} {r.text[:300]}')
    return r.json()['token']


def api_get(api: str, path: str, token: str):
    r = requests.get(f'{api}{path}', headers={'Authorization': f'Bearer {token}'}, timeout=30)
    return r


def record(results: list[dict], name: str, passed: bool, detail: str, **extra):
    row = {'name': name, 'passed': bool(passed), 'detail': detail, **extra}
    print(('PASS' if passed else 'FAIL') + f' - {name}: {detail}')
    results.append(row)


def seed_demo_data(db, run_id: str):
    now = datetime.now(timezone.utc)
    staff = [
        {'email': f'qa_wipe_admin_{run_id}@test.com', 'role': 'admin', 'name': 'QA Admin'},
        {'email': f'qa_wipe_operator_{run_id}@test.com', 'role': 'operator', 'name': 'QA Operator'},
        {'email': f'qa_wipe_support_{run_id}@test.com', 'role': 'support', 'name': 'QA Support'},
    ]
    staff_ids = []
    for idx, s in enumerate(staff):
        user_id = f'qa_staff_{idx}_{run_id}'
        staff_ids.append(user_id)
        db.users.update_one(
            {'email': s['email']},
            {'$set': {
                'user_id': user_id,
                'email': s['email'],
                'name': s['name'],
                'role': s['role'],
                'method': 'email',
                'password_hash': hash_password(STAFF_PASS),
                'created_at': now,
                'qa_run_id': run_id,
            }},
            upsert=True,
        )
        db.wallets.update_one(
            {'user_id': user_id},
            {'$set': {
                'user_id': user_id,
                'balance': 88.8,
                'lifetime_topup': 100.0,
                'lifetime_spend': 11.2,
                'updated_at': now,
                'qa_run_id': run_id,
            }},
            upsert=True,
        )

    regular_ids = []
    for idx in range(2):
        user_id = f'qa_regular_{idx}_{run_id}'
        regular_ids.append(user_id)
        db.users.update_one(
            {'email': f'qa_wipe_user_{idx}_{run_id}@test.com'},
            {'$set': {
                'user_id': user_id,
                'email': f'qa_wipe_user_{idx}_{run_id}@test.com',
                'name': f'QA Demo User {idx}',
                'role': 'user',
                'method': 'email',
                'password_hash': hash_password(USER_PASS),
                'created_at': now,
                'qa_run_id': run_id,
            }},
            upsert=True,
        )
        db.wallets.update_one(
            {'user_id': user_id},
            {'$set': {
                'user_id': user_id,
                'balance': 22.5,
                'lifetime_topup': 30.0,
                'lifetime_spend': 7.5,
                'updated_at': now,
                'qa_run_id': run_id,
            }},
            upsert=True,
        )

    contest_id = f'qa_contest_{run_id}'
    order_id = f'qa_order_{run_id}'
    ticket_id = f'qa_ticket_{run_id}'
    wipe_docs = {
        'audit_log': {'qa_run_id': run_id, 'action': 'qa_demo_audit', 'created_at': now},
        'contests': {'qa_run_id': run_id, 'contest_id': contest_id, 'slug': f'qa-wipe-{run_id}', 'title': 'QA Demo Contest', 'status': 'live', 'price': 1.0, 'prize_amount': 99, 'tickets_sold': 1, 'end_date': now + timedelta(days=1)},
        'contest_draws': {'qa_run_id': run_id, 'draw_id': f'qa_draw_{run_id}', 'contest_id': contest_id},
        'game_scores': {'qa_run_id': run_id, 'score_id': f'qa_score_{run_id}', 'contest_id': contest_id, 'ticket_id': ticket_id, 'user_id': regular_ids[0], 'user_name': 'QA Demo User 0', 'game_type': 'qa', 'points': 123, 'duration_ms': 1000, 'accuracy': 1.0},
        'instant_win_configs': {'qa_run_id': run_id, 'contest_id': contest_id, 'enabled': True},
        'instant_win_reveals': {'qa_run_id': run_id, 'reveal_id': f'qa_reveal_{run_id}', 'contest_id': contest_id, 'user_id': regular_ids[0]},
        'kyc': {'qa_run_id': run_id, 'kyc_id': f'qa_kyc_{run_id}', 'user_id': regular_ids[0], 'status': 'pending'},
        'leaderboard_entries': {'qa_run_id': run_id, 'contest_id': contest_id, 'user_id': regular_ids[0], 'points': 999},
        'meera_log': {'qa_run_id': run_id, 'prompt': 'qa demo', 'created_at': now},
        'notifications': {'qa_run_id': run_id, 'notification_id': f'qa_note_{run_id}', 'user_id': regular_ids[0], 'message': 'qa demo'},
        'orders': {'qa_run_id': run_id, 'order_id': order_id, 'user_id': regular_ids[0], 'items': [{'contest_id': contest_id, 'qty': 1, 'price': 1, 'prize_title': 'QA Demo Contest'}], 'total': 1.0, 'status': 'paid', 'method': 'wallet', 'created_at': now},
        'payment_transactions': {'qa_run_id': run_id, 'tx_id': f'qa_pay_{run_id}', 'user_id': regular_ids[0], 'amount': 1.0},
        'postal_entries': {'qa_run_id': run_id, 'entry_id': f'qa_postal_{run_id}', 'contest_id': contest_id},
        'referrals': {'qa_run_id': run_id, 'referral_id': f'qa_ref_{run_id}', 'referrer_user_id': regular_ids[0], 'referred_user_id': regular_ids[1], 'code': 'QADEMO'},
        'support_cases': {'qa_run_id': run_id, 'case_id': f'qa_case_{run_id}', 'user_id': regular_ids[0], 'subject': 'qa demo', 'status': 'open', 'updated_at': now, 'created_at': now},
        'tickets': {'qa_run_id': run_id, 'ticket_id': ticket_id, 'order_id': order_id, 'user_id': regular_ids[0], 'contest_id': contest_id, 'ticket_number': 1, 'created_at': now},
        'user_sessions': {'qa_run_id': run_id, 'session_token': f'qa_session_{run_id}', 'user_id': regular_ids[0], 'expires_at': now + timedelta(days=1)},
        'wallet_tx': {'qa_run_id': run_id, 'tx_id': f'qa_wallet_tx_{run_id}', 'user_id': regular_ids[0], 'kind': 'topup', 'amount': 20.0, 'balance_after': 20.0, 'created_at': now},
        'winners': {'qa_run_id': run_id, 'winner_id': f'qa_winner_{run_id}', 'contest_id': contest_id, 'user_id': regular_ids[0], 'user_name': 'QA Demo User 0', 'ticket_number': 1, 'prize_amount': 99, 'prize_title': 'QA Demo Contest', 'drawn_at': now, 'paid_out': False},
    }
    for col, doc in wipe_docs.items():
        db[col].insert_one(doc)

    # This is what /api/admin/audit-logs actually reads today. If this remains,
    # old demo audit activity is still visible in the admin panel.
    db.winner_audit.insert_one({
        'qa_run_id': run_id,
        'at': now,
        'action': 'qa_demo_winner_audit_should_be_wiped',
        'admin_id': 'qa',
        'target': contest_id,
        'meta': {'run_id': run_id},
    })

    db.counters.update_one({'_id': 'user_public_id'}, {'$set': {'seq': 999}}, upsert=True)
    return {'staff_ids': staff_ids, 'regular_ids': regular_ids, 'regular_email': f'qa_wipe_user_0_{run_id}@test.com'}


def cleanup_qa_rows(db, run_id: str):
    collections = list(WIPEABLE_COLLECTIONS) + ['winner_audit', 'admin_audit', 'wallets']
    for col in collections:
        try:
            db[col].delete_many({'qa_run_id': run_id})
        except Exception:
            pass
    db.users.delete_many({'qa_run_id': run_id})
    db.wallets.delete_many({'qa_run_id': run_id})


def main():
    mongo_url, db_name, api = load_env()
    client = MongoClient(mongo_url)
    db = client[db_name]
    run_id = str(int(time.time()))
    results: list[dict] = []
    output = ROOT / 'test_reports' / 'wipe_backend_result.json'

    try:
        admin_token = login(api, ADMIN_EMAIL, ADMIN_PASS)
        seed = seed_demo_data(db, run_id)
        regular_token = login(api, seed['regular_email'], USER_PASS)

        r = requests.post(
            f'{api}/admin/system/wipe-demo-data',
            headers={'Authorization': f'Bearer {regular_token}'},
            json={'password': USER_PASS, 'confirm': 'WIPE DEMO DATA'},
            timeout=30,
        )
        record(results, 'non_super_admin_rejected', r.status_code == 403, f'status={r.status_code}, body={r.text[:160]}')

        r = requests.post(
            f'{api}/admin/system/wipe-demo-data',
            headers={'Authorization': f'Bearer {admin_token}'},
            json={'password': ADMIN_PASS, 'confirm': 'wipe demo data'},
            timeout=30,
        )
        record(results, 'wrong_confirm_rejected', r.status_code == 400, f'status={r.status_code}, body={r.text[:160]}')

        r = requests.post(
            f'{api}/admin/system/wipe-demo-data',
            headers={'Authorization': f'Bearer {admin_token}'},
            json={'password': 'WrongPassword!234', 'confirm': 'WIPE DEMO DATA'},
            timeout=30,
        )
        record(results, 'wrong_password_rejected', r.status_code == 401, f'status={r.status_code}, body={r.text[:160]}')

        r = requests.post(
            f'{api}/admin/system/wipe-demo-data',
            headers={'Authorization': f'Bearer {admin_token}'},
            json={'password': ADMIN_PASS, 'confirm': 'WIPE DEMO DATA'},
            timeout=60,
        )
        wipe_json = r.json() if r.headers.get('content-type', '').startswith('application/json') else {'raw': r.text}
        record(results, 'super_admin_wipe_success', r.status_code == 200 and wipe_json.get('ok') is True, f'status={r.status_code}, body={json.dumps(wipe_json, default=str)[:500]}', response=wipe_json)

        remaining_wipeable = {col: db[col].count_documents({}) for col in WIPEABLE_COLLECTIONS}
        record(results, 'wipeable_collections_empty', all(v == 0 for v in remaining_wipeable.values()), f'counts={remaining_wipeable}', counts=remaining_wipeable)

        regular_remaining = db.users.count_documents({'user_id': {'$in': seed['regular_ids']}})
        staff_remaining = db.users.count_documents({'user_id': {'$in': seed['staff_ids']}})
        record(results, 'regular_users_deleted_staff_preserved', regular_remaining == 0 and staff_remaining == len(seed['staff_ids']), f'regular_remaining={regular_remaining}, staff_remaining={staff_remaining}')

        staff_wallets = list(db.wallets.find({'user_id': {'$in': seed['staff_ids']}}, {'_id': 0, 'user_id': 1, 'balance': 1, 'lifetime_topup': 1, 'lifetime_spend': 1}))
        staff_wallets_zero = len(staff_wallets) == len(seed['staff_ids']) and all(
            float(w.get('balance', -1)) == 0.0 and float(w.get('lifetime_topup', -1)) == 0.0 and float(w.get('lifetime_spend', -1)) == 0.0
            for w in staff_wallets
        )
        record(results, 'preserved_staff_wallets_reset', staff_wallets_zero, f'wallets={staff_wallets}', wallets=staff_wallets)

        counter = db.counters.find_one({'_id': 'user_public_id'}, {'_id': 0, 'seq': 1}) or {}
        record(results, 'public_id_counter_reset_to_1', counter.get('seq') == 1, f'counter={counter}', counter=counter)

        orders = api_get(api, '/admin/orders', admin_token)
        orders_json = orders.json() if orders.status_code == 200 else orders.text
        record(results, 'admin_orders_empty_after_wipe', orders.status_code == 200 and orders_json == [], f'status={orders.status_code}, body={str(orders_json)[:300]}')

        users = api_get(api, '/admin/users', admin_token)
        users_json = users.json() if users.status_code == 200 else []
        roles = sorted(set(u.get('role') for u in users_json)) if isinstance(users_json, list) else []
        qa_regular_visible = [u.get('email') for u in users_json if str(u.get('email', '')).startswith('qa_wipe_user_')]
        record(results, 'admin_users_only_staff_after_wipe', users.status_code == 200 and not qa_regular_visible and all(role in {'admin', 'super_admin', 'operator', 'support'} for role in roles), f'status={users.status_code}, roles={roles}, qa_regular_visible={qa_regular_visible}, total_users={len(users_json) if isinstance(users_json, list) else "n/a"}')

        stats = api_get(api, '/admin/stats', admin_token)
        stats_json = stats.json() if stats.status_code == 200 else {}
        zero_fields = ['contests', 'orders', 'tickets_sold', 'revenue', 'prize_pool', 'kyc_pending']
        zero_ok = stats.status_code == 200 and all(float(stats_json.get(k, -1) or 0) == 0.0 for k in zero_fields)
        record(results, 'admin_stats_demo_counts_zero', zero_ok, f'status={stats.status_code}, stats={stats_json}', stats=stats_json)
        record(results, 'admin_stats_users_zero_expected_by_review', stats.status_code == 200 and stats_json.get('users') == 0, f'status={stats.status_code}, users={stats_json.get("users")}, full_stats={stats_json}', stats=stats_json)

        audit = api_get(api, '/admin/audit-logs', admin_token)
        audit_json = audit.json() if audit.status_code == 200 else {}
        logs = audit_json.get('logs', []) if isinstance(audit_json, dict) else []
        audit_marker_visible = any(run_id in json.dumps(log, default=str) for log in logs)
        record(results, 'admin_visible_audit_logs_do_not_show_demo_marker', audit.status_code == 200 and not audit_marker_visible, f'status={audit.status_code}, marker_visible={audit_marker_visible}, matching={[log for log in logs if run_id in json.dumps(log, default=str)][:2]}')

        passed = all(r['passed'] for r in results)
        report = {'run_id': run_id, 'api': api, 'passed': passed, 'results': results}
        output.write_text(json.dumps(report, indent=2, default=str))
        jdump(report)
        return 0 if passed else 1
    finally:
        cleanup_qa_rows(db, run_id)
        client.close()


if __name__ == '__main__':
    raise SystemExit(main())