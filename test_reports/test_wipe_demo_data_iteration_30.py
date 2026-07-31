#!/usr/bin/env python3
"""Focused backend verification for Admin Wipe Demo Data regression.

Seeds QA-only rows in admin-visible demo/audit collections, exercises the
destructive wipe endpoint via the real API, records direct API + Mongo evidence,
then removes QA leftovers so the preview DB is clean for handoff.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


APP = Path('/app')
BACKEND = APP / 'backend'
REPORT_DIR = APP / 'test_reports'
RESULT_PATH = REPORT_DIR / 'wipe_demo_data_iteration_30_result.json'

load_dotenv(BACKEND / '.env')
sys.path.insert(0, str(BACKEND))

from auth import create_jwt, hash_password  # noqa: E402


API_BASE = os.environ.get('REACT_APP_BACKEND_URL') or 'https://contest-arena-16.preview.emergentagent.com'
SUPER_EMAIL = 'bachanta8@gmail.com'
SUPER_PASSWORD = 'Herts@910022'

RUN_ID = f"qa_wipe_iter30_{int(time.time())}"
STAFF_ROLES = {'admin', 'super_admin', 'operator', 'support'}

WIPEABLE_COLLECTIONS = [
    'audit_log', 'admin_audit', 'winner_audit',
    'contests', 'contest_draws', 'game_scores',
    'instant_win_configs', 'instant_win_reveals', 'kyc',
    'leaderboard_entries', 'meera_log', 'notifications', 'orders',
    'payment_transactions', 'postal_entries', 'referrals', 'support_cases',
    'tickets', 'user_sessions', 'wallet_tx', 'winners',
]


def _json_safe(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {str(k): _json_safe(v) for k, v in obj.items() if k != '_id'}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    return obj


def record(checks: list[dict], name: str, passed: bool, evidence: Any = None) -> None:
    checks.append({'name': name, 'passed': bool(passed), 'evidence': _json_safe(evidence)})
    print(f"{'PASS' if passed else 'FAIL'}: {name} :: {_json_safe(evidence)}")


async def count_many(db, collections: list[str]) -> dict[str, int]:
    return {name: await db[name].count_documents({}) for name in collections}


async def cleanup_markers(db, run_id: str) -> None:
    # Remove only rows from this run before testing, if a previous interrupted run used same marker.
    for col in WIPEABLE_COLLECTIONS + ['wallets']:
        await db[col].delete_many({'qa_run_id': run_id})
    await db.users.delete_many({'qa_run_id': run_id})
    await db.wallets.delete_many({'user_id': {'$regex': f'^{run_id}_'}})


async def final_cleanup(db, run_id: str) -> dict[str, Any]:
    # Wipe should already have removed regular/demo data. Remove the preserved QA admin
    # account and the audit row inserted by the wipe endpoint, per handoff request.
    await db.users.delete_many({'qa_run_id': run_id})
    await db.wallets.delete_many({'qa_run_id': run_id})
    for col in WIPEABLE_COLLECTIONS:
        await db[col].delete_many({'qa_run_id': run_id})
    # The endpoint deliberately inserts a fresh admin_audit wipe row without qa_run_id.
    # For the requested clean final state, remove wipe rows created during this test window.
    await db.admin_audit.delete_many({'action': 'wipe_demo_data', 'by_email': SUPER_EMAIL})
    users = await db.users.find({}, {'_id': 0, 'email': 1, 'role': 1, 'user_id': 1}).to_list(100)
    counts = await count_many(db, ['admin_audit', 'winner_audit', 'support_cases', 'orders', 'tickets', 'contests', 'game_scores', 'leaderboard_entries'])
    return {'users': users, 'counts': counts}


async def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    checks: list[dict] = []
    result: dict[str, Any] = {
        'run_id': RUN_ID,
        'api_base': API_BASE,
        'started_at': datetime.now(timezone.utc).isoformat(),
        'checks': checks,
        'errors': [],
    }

    mongo = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = mongo[os.environ.get('DB_NAME', 'gamezoo')]

    async with httpx.AsyncClient(base_url=API_BASE, timeout=30) as client:
        try:
            await cleanup_markers(db, RUN_ID)

            health = await client.get('/api/')
            record(checks, 'API root responds', health.status_code == 200, {'status': health.status_code, 'body': health.json() if health.headers.get('content-type', '').startswith('application/json') else health.text[:200]})

            login = await client.post('/api/auth/login', json={'email': SUPER_EMAIL, 'password': SUPER_PASSWORD})
            login_body = login.json() if login.headers.get('content-type', '').startswith('application/json') else {'text': login.text[:300]}
            record(checks, 'Super admin login succeeds', login.status_code == 200 and login_body.get('token'), {'status': login.status_code, 'role': login_body.get('user', {}).get('role'), 'email': login_body.get('user', {}).get('email'), 'body': login_body if login.status_code != 200 else None})
            if login.status_code != 200 or not login_body.get('token'):
                raise RuntimeError('Cannot continue without super admin token')
            super_token = login_body['token']
            super_headers = {'Authorization': f'Bearer {super_token}'}

            now = datetime.now(timezone.utc)
            admin_user_id = f'{RUN_ID}_admin'
            regular_user_id = f'{RUN_ID}_player'
            contest_id = f'{RUN_ID}_contest'
            order_id = f'{RUN_ID}_order'
            await db.users.insert_many([
                {
                    'user_id': admin_user_id,
                    'email': f'{RUN_ID}_admin@example.test',
                    'name': 'QA Non Super Admin',
                    'role': 'admin',
                    'method': 'email',
                    'password_hash': hash_password('Admin123!'),
                    'created_at': now,
                    'qa_run_id': RUN_ID,
                },
                {
                    'user_id': regular_user_id,
                    'email': f'{RUN_ID}_player@example.test',
                    'name': 'QA Demo Player',
                    'role': 'user',
                    'method': 'email',
                    'password_hash': hash_password('Player123!'),
                    'created_at': now,
                    'qa_run_id': RUN_ID,
                },
            ])
            await db.wallets.insert_many([
                {'user_id': admin_user_id, 'balance': 22.0, 'lifetime_topup': 22.0, 'lifetime_spend': 0.0, 'qa_run_id': RUN_ID},
                {'user_id': regular_user_id, 'balance': 33.0, 'lifetime_topup': 33.0, 'lifetime_spend': 0.0, 'qa_run_id': RUN_ID},
            ])
            await db.admin_audit.insert_one({'qa_run_id': RUN_ID, 'action': 'seeded_admin_audit_demo', 'at': now, 'by_email': 'qa@example.test'})
            await db.winner_audit.insert_one({'qa_run_id': RUN_ID, 'action': 'seeded_winner_audit_demo', 'at': now, 'admin_id': admin_user_id, 'target': contest_id})
            await db.support_cases.insert_one({'qa_run_id': RUN_ID, 'case_id': f'{RUN_ID}_case', 'subject': 'QA demo support case', 'status': 'open', 'user_id': regular_user_id, 'created_at': now, 'updated_at': now})
            await db.contests.insert_one({'qa_run_id': RUN_ID, 'contest_id': contest_id, 'title': 'QA Demo Contest', 'status': 'live', 'end_date': now + timedelta(days=2), 'prize_amount': 50.0, 'tickets_sold': 1})
            await db.orders.insert_one({'qa_run_id': RUN_ID, 'order_id': order_id, 'user_id': regular_user_id, 'status': 'paid', 'total': 123.45, 'items': [{'contest_id': contest_id, 'qty': 1}], 'created_at': now})
            await db.tickets.insert_one({'qa_run_id': RUN_ID, 'ticket_id': f'{RUN_ID}_ticket', 'order_id': order_id, 'user_id': regular_user_id, 'contest_id': contest_id, 'created_at': now})
            await db.game_scores.insert_one({'qa_run_id': RUN_ID, 'contest_id': contest_id, 'user_id': regular_user_id, 'user_name': 'QA Demo Player', 'points': 999, 'accuracy': 100, 'duration_ms': 1000, 'created_at': now})
            await db.leaderboard_entries.insert_one({'qa_run_id': RUN_ID, 'contest_id': contest_id, 'user_id': regular_user_id, 'points': 999, 'created_at': now})

            seed_counts = await count_many(db, ['admin_audit', 'winner_audit', 'support_cases', 'orders', 'tickets', 'contests', 'game_scores', 'leaderboard_entries'])
            marker_counts = {
                'admin_audit_marker': await db.admin_audit.count_documents({'qa_run_id': RUN_ID}),
                'winner_audit_marker': await db.winner_audit.count_documents({'qa_run_id': RUN_ID}),
                'support_cases_marker': await db.support_cases.count_documents({'qa_run_id': RUN_ID}),
                'regular_user_marker': await db.users.count_documents({'user_id': regular_user_id}),
                'admin_user_marker': await db.users.count_documents({'user_id': admin_user_id}),
            }
            record(checks, 'Seeded winner_audit/admin_audit/support/demo rows exist before wipe', all(v == 1 for v in marker_counts.values()), {'marker_counts': marker_counts, 'total_counts': seed_counts})

            non_super_token = create_jwt(admin_user_id)
            forbidden = await client.post('/api/admin/system/wipe-demo-data', headers={'Authorization': f'Bearer {non_super_token}'}, json={'password': SUPER_PASSWORD, 'confirm': 'WIPE DEMO DATA'})
            record(checks, 'Guardrail: non-super_admin receives 403', forbidden.status_code == 403, {'status': forbidden.status_code, 'body': forbidden.json()})

            wrong_phrase = await client.post('/api/admin/system/wipe-demo-data', headers=super_headers, json={'password': SUPER_PASSWORD, 'confirm': 'WRONG PHRASE'})
            record(checks, 'Guardrail: wrong confirm phrase receives 400', wrong_phrase.status_code == 400, {'status': wrong_phrase.status_code, 'body': wrong_phrase.json()})

            wrong_password = await client.post('/api/admin/system/wipe-demo-data', headers=super_headers, json={'password': 'definitely-wrong', 'confirm': 'WIPE DEMO DATA'})
            record(checks, 'Guardrail: wrong password receives 401', wrong_password.status_code == 401, {'status': wrong_password.status_code, 'body': wrong_password.json()})

            after_guardrail_markers = {
                'admin_audit_marker': await db.admin_audit.count_documents({'qa_run_id': RUN_ID}),
                'winner_audit_marker': await db.winner_audit.count_documents({'qa_run_id': RUN_ID}),
                'support_cases_marker': await db.support_cases.count_documents({'qa_run_id': RUN_ID}),
                'regular_user_marker': await db.users.count_documents({'user_id': regular_user_id}),
            }
            record(checks, 'Guardrail failures did not wipe seeded data', all(v == 1 for v in after_guardrail_markers.values()), after_guardrail_markers)

            audit_before = await client.get('/api/admin/audit-logs', headers=super_headers)
            audit_before_body = audit_before.json()
            before_sources = [row.get('source') for row in audit_before_body.get('logs', []) if row.get('target') == contest_id or row.get('target') == f'{RUN_ID}_case']
            record(checks, 'Pre-wipe audit endpoint exposes seeded winner/support demo logs', audit_before.status_code == 200 and {'winner_selection', 'support_case'}.issubset(set(before_sources)), {'status': audit_before.status_code, 'count': audit_before_body.get('count'), 'sources_for_run': before_sources})

            wipe = await client.post('/api/admin/system/wipe-demo-data', headers=super_headers, json={'password': SUPER_PASSWORD, 'confirm': 'WIPE DEMO DATA'})
            wipe_body = wipe.json() if wipe.headers.get('content-type', '').startswith('application/json') else {'text': wipe.text[:300]}
            record(checks, 'Super admin wipe request succeeds', wipe.status_code == 200 and wipe_body.get('ok') is True, {'status': wipe.status_code, 'body': wipe_body})

            post_counts = await count_many(db, ['admin_audit', 'winner_audit', 'support_cases', 'orders', 'tickets', 'contests', 'game_scores', 'leaderboard_entries', 'users', 'wallets'])
            marker_post_counts = {
                'admin_audit_marker': await db.admin_audit.count_documents({'qa_run_id': RUN_ID}),
                'winner_audit_marker': await db.winner_audit.count_documents({'qa_run_id': RUN_ID}),
                'support_cases_marker': await db.support_cases.count_documents({'qa_run_id': RUN_ID}),
                'orders_marker': await db.orders.count_documents({'qa_run_id': RUN_ID}),
                'regular_user_marker': await db.users.count_documents({'user_id': regular_user_id}),
                'admin_user_marker': await db.users.count_documents({'user_id': admin_user_id}),
            }
            record(checks, 'Direct DB: seeded admin_audit and winner_audit rows are removed', marker_post_counts['admin_audit_marker'] == 0 and marker_post_counts['winner_audit_marker'] == 0, {'marker_post_counts': marker_post_counts, 'total_post_counts': post_counts})
            record(checks, 'Direct DB: winner_audit collection is empty after wipe', post_counts['winner_audit'] == 0, {'winner_audit_total': post_counts['winner_audit']})
            record(checks, 'Direct DB: admin_audit collection is empty after wipe', post_counts['admin_audit'] == 0, {'admin_audit_total': post_counts['admin_audit'], 'note': 'Acceptance criteria requested empty collection, not merely seeded row removed.'})
            record(checks, 'Direct DB: support/order/ticket/contest/leaderboard/demo score collections are empty', all(post_counts[k] == 0 for k in ['support_cases', 'orders', 'tickets', 'contests', 'game_scores', 'leaderboard_entries']), {k: post_counts[k] for k in ['support_cases', 'orders', 'tickets', 'contests', 'game_scores', 'leaderboard_entries']})

            audit_after = await client.get('/api/admin/audit-logs', headers=super_headers)
            audit_after_body = audit_after.json()
            record(checks, 'GET /api/admin/audit-logs returns empty logs after wipe', audit_after.status_code == 200 and audit_after_body.get('logs') == [] and audit_after_body.get('count') == 0, {'status': audit_after.status_code, 'body': audit_after_body})

            orders_after = await client.get('/api/admin/orders', headers=super_headers)
            orders_after_body = orders_after.json()
            record(checks, 'GET /api/admin/orders returns [] after wipe', orders_after.status_code == 200 and orders_after_body == [], {'status': orders_after.status_code, 'body': orders_after_body})

            users_after = await client.get('/api/admin/users', headers=super_headers)
            users_after_body = users_after.json()
            roles_after = [u.get('role') for u in users_after_body]
            qa_regular_present = any(u.get('user_id') == regular_user_id for u in users_after_body)
            record(checks, 'GET /api/admin/users returns only preserved staff after wipe', users_after.status_code == 200 and not qa_regular_present and all(role in STAFF_ROLES for role in roles_after), {'status': users_after.status_code, 'count': len(users_after_body), 'roles': roles_after, 'qa_regular_present': qa_regular_present})

            stats_after = await client.get('/api/admin/stats', headers=super_headers)
            stats_after_body = stats_after.json()
            stats_zero_ok = stats_after.status_code == 200 and all(float(stats_after_body.get(k, -1) or 0) == 0 for k in ['contests', 'orders', 'tickets_sold', 'revenue'])
            record(checks, 'GET /api/admin/stats zeroes contests/orders/tickets/revenue after wipe', stats_zero_ok, {'status': stats_after.status_code, 'body': stats_after_body, 'users_count_expected_to_reflect_preserved_staff': True})

        except Exception as exc:
            result['errors'].append(repr(exc))
            print(f'ERROR: {exc!r}')
        finally:
            result['final_cleanup'] = await final_cleanup(db, RUN_ID)
            result['finished_at'] = datetime.now(timezone.utc).isoformat()
            result['passed'] = sum(1 for c in checks if c['passed'])
            result['failed'] = sum(1 for c in checks if not c['passed'])
            RESULT_PATH.write_text(json.dumps(_json_safe(result), indent=2), encoding='utf-8')
            mongo.close()
            print(f'Wrote {RESULT_PATH}')

    return 0 if result['failed'] == 0 and not result['errors'] else 1


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))