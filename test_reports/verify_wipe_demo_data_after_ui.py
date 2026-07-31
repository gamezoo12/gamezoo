#!/usr/bin/env python3
"""Verify the UI-triggered wipe removed the QA seed and clean up leftovers."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

ROOT = Path('/app')
BACKEND = ROOT / 'backend'

ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'

be = dotenv_values(BACKEND / '.env')
fe = dotenv_values(ROOT / 'frontend' / '.env')
mongo_url = be['MONGO_URL']
db_name = (be.get('DB_NAME') or 'gamezoo').strip('"')
api = f"{(fe.get('REACT_APP_BACKEND_URL') or 'http://localhost:8001').rstrip('/')}/api"
run_id = (ROOT / 'test_reports' / 'ui_wipe_run_id.txt').read_text().strip()

client = MongoClient(mongo_url)
db = client[db_name]

checks = []


def record(name, passed, detail, **extra):
    row = {'name': name, 'passed': bool(passed), 'detail': detail, **extra}
    print(('PASS' if passed else 'FAIL') + f' - {name}: {detail}')
    checks.append(row)


def cleanup():
    for col in ['users', 'wallets', 'contests', 'orders', 'tickets', 'leaderboard_entries', 'wallet_tx', 'game_scores', 'winner_audit']:
        try:
            db[col].delete_many({'qa_run_id': run_id})
        except Exception:
            pass


try:
    counts = {col: db[col].count_documents({'qa_run_id': run_id}) for col in ['users', 'wallets', 'contests', 'orders', 'tickets', 'leaderboard_entries']}
    record('ui_seed_marker_removed_from_db', all(v == 0 for v in counts.values()), f'counts={counts}', counts=counts)

    login = requests.post(f'{api}/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=30)
    token = login.json().get('token') if login.status_code == 200 else None
    record('admin_login_after_ui_wipe', login.status_code == 200 and bool(token), f'status={login.status_code}, body={login.text[:200]}')
    if token:
        headers = {'Authorization': f'Bearer {token}'}
        orders = requests.get(f'{api}/admin/orders', headers=headers, timeout=30)
        orders_json = orders.json() if orders.status_code == 200 else None
        record('admin_orders_empty_after_ui_wipe', orders.status_code == 200 and orders_json == [], f'status={orders.status_code}, body={str(orders_json)[:300]}')
        users = requests.get(f'{api}/admin/users', headers=headers, timeout=30)
        users_json = users.json() if users.status_code == 200 else []
        qa_visible = [u.get('email') for u in users_json if run_id in str(u.get('email'))]
        record('qa_user_not_visible_after_ui_wipe', users.status_code == 200 and not qa_visible, f'status={users.status_code}, qa_visible={qa_visible}')
        stats = requests.get(f'{api}/admin/stats', headers=headers, timeout=30)
        stats_json = stats.json() if stats.status_code == 200 else {}
        record('admin_stats_orders_contests_tickets_zero_after_ui_wipe', stats.status_code == 200 and all(float(stats_json.get(k, -1) or 0) == 0.0 for k in ['orders', 'contests', 'tickets_sold', 'revenue', 'prize_pool']), f'status={stats.status_code}, stats={stats_json}', stats=stats_json)
    passed = all(c['passed'] for c in checks)
    report = {'run_id': run_id, 'passed': passed, 'checks': checks}
    (ROOT / 'test_reports' / 'wipe_ui_verify_result.json').write_text(json.dumps(report, indent=2, default=str))
    print(json.dumps(report, indent=2, default=str))
    sys.exit(0 if passed else 1)
finally:
    cleanup()
    client.close()