#!/usr/bin/env python3
"""
Focused verification for iter25 route-collision fix.
Creates a disposable target user, verifies secure suspend/unsuspend API behavior,
and checks related minor regressions without modifying product code.
"""
import io
import json
import os
import uuid
from datetime import datetime, timezone

import requests
from PIL import Image
from pymongo import MongoClient


def load_frontend_base_url():
    if os.environ.get('REACT_APP_BACKEND_URL'):
        return os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
    with open('/app/frontend/.env', 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'").rstrip('/')
    raise RuntimeError('REACT_APP_BACKEND_URL not found')


def make_png():
    img = Image.new('RGB', (40, 40), (10, 120, 200))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def status_bool(ok, msg):
    print(('PASS' if ok else 'FAIL') + ': ' + msg)
    return ok


BASE_URL = load_frontend_base_url()
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017').strip('"')
DB_NAME = os.environ.get('DB_NAME', 'test_database').strip('"')
SUPER_ADMIN_EMAIL = 'bachanta8@gmail.com'
SUPER_ADMIN_PASSWORD = 'Herts@910022'

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

results = []
target_user_id = f'user_test_suspend_{uuid.uuid4().hex[:8]}'
reason = f'iter25 focused reason {uuid.uuid4().hex[:6]}'
headers_json = {}
try:
    login = requests.post(
        f'{BASE_URL}/api/auth/login',
        json={'email': SUPER_ADMIN_EMAIL, 'password': SUPER_ADMIN_PASSWORD},
        timeout=15,
    )
    results.append(status_bool(login.status_code == 200, f'super admin login status={login.status_code}'))
    token = login.json().get('token') if login.status_code == 200 else None
    headers_json = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    auth_only_headers = {'Authorization': f'Bearer {token}'}

    db.users.delete_one({'user_id': target_user_id})
    db.audit_log.delete_many({'target_user_id': target_user_id})
    db.users.insert_one({
        'user_id': target_user_id,
        'email': f'{target_user_id}@test.local',
        'name': 'Iter25 Suspend Target',
        'role': 'user',
        'public_id': f'PL_TEST_{uuid.uuid4().hex[:6]}',
        'suspended': False,
        'created_at': datetime.now(timezone.utc),
    })

    # 1. Wrong admin password: must 403, no suspend, no audit.
    before_audit = db.audit_log.count_documents({'target_user_id': target_user_id})
    wrong = requests.post(
        f'{BASE_URL}/api/admin/users/{target_user_id}/suspend',
        headers=headers_json,
        json={'reason': 'should not persist', 'admin_password': 'WRONG_PASSWORD'},
        timeout=15,
    )
    after_wrong_user = db.users.find_one({'user_id': target_user_id}, {'_id': 0})
    after_wrong_audit = db.audit_log.count_documents({'target_user_id': target_user_id})
    results.append(status_bool(wrong.status_code == 403, f'wrong password returns 403 (got {wrong.status_code} {wrong.text[:120]})'))
    results.append(status_bool(after_wrong_user.get('suspended') is not True, 'wrong password did not set users.suspended=true'))
    results.append(status_bool(after_wrong_audit == before_audit, f'wrong password did not add audit rows ({before_audit}->{after_wrong_audit})'))

    # Bodyless call should hit Pydantic validation, not legacy no-body handler.
    no_body = requests.post(
        f'{BASE_URL}/api/admin/users/{target_user_id}/suspend',
        headers=headers_json,
        timeout=15,
    )
    results.append(status_bool(no_body.status_code == 422, f'bodyless suspend returns 422 (got {no_body.status_code})'))

    # 2. Correct admin password: must persist state + exactly one audit row.
    ok_suspend = requests.post(
        f'{BASE_URL}/api/admin/users/{target_user_id}/suspend',
        headers=headers_json,
        json={'reason': reason, 'admin_password': SUPER_ADMIN_PASSWORD},
        timeout=15,
    )
    suspended_user = db.users.find_one({'user_id': target_user_id}, {'_id': 0})
    suspend_audits = list(db.audit_log.find(
        {'target_user_id': target_user_id, 'kind': 'user_suspend'},
        {'_id': 0},
    ))
    results.append(status_bool(ok_suspend.status_code == 200, f'correct password suspend returns 200 (got {ok_suspend.status_code} {ok_suspend.text[:120]})'))
    results.append(status_bool(suspended_user.get('suspended') is True, 'correct password sets users.suspended=true'))
    results.append(status_bool(suspended_user.get('suspended_reason') == reason, 'correct password stores suspended_reason'))
    results.append(status_bool(len(suspend_audits) == 1, f'correct password writes exactly one user_suspend audit row (got {len(suspend_audits)})'))
    if suspend_audits:
        audit = suspend_audits[0]
        results.append(status_bool(audit.get('admin_email') == SUPER_ADMIN_EMAIL, 'user_suspend audit admin_email matches super admin'))
        results.append(status_bool(audit.get('target_user_id') == target_user_id, 'user_suspend audit target_user_id matches'))
        results.append(status_bool(audit.get('reason') == reason, 'user_suspend audit reason matches'))

    # 3. Unsuspend: no password required, state clears, audit row written.
    unsuspend = requests.post(
        f'{BASE_URL}/api/admin/users/{target_user_id}/unsuspend',
        headers=headers_json,
        json={},
        timeout=15,
    )
    unsuspended_user = db.users.find_one({'user_id': target_user_id}, {'_id': 0})
    unsuspend_audits = list(db.audit_log.find(
        {'target_user_id': target_user_id, 'kind': 'user_unsuspend'},
        {'_id': 0},
    ))
    results.append(status_bool(unsuspend.status_code == 200, f'unsuspend returns 200 (got {unsuspend.status_code} {unsuspend.text[:120]})'))
    results.append(status_bool(unsuspended_user.get('suspended') is False, 'unsuspend sets users.suspended=false'))
    results.append(status_bool(unsuspended_user.get('suspended_reason') is None, 'unsuspend clears suspended_reason'))
    results.append(status_bool(len(unsuspend_audits) == 1, f'unsuspend writes exactly one user_unsuspend audit row (got {len(unsuspend_audits)})'))
    if unsuspend_audits:
        results.append(status_bool(unsuspend_audits[0].get('admin_email') == SUPER_ADMIN_EMAIL, 'user_unsuspend audit admin_email matches super admin'))

    # 4. Bad focal_x should return 422, not 500.
    files = {'file': ('tiny.png', make_png(), 'image/png')}
    image_bad = requests.post(
        f'{BASE_URL}/api/admin/uploads/contest-image',
        headers=auth_only_headers,
        files=files,
        data={'focal_x': 'abc', 'focal_y': '0.5', 'alt': 'bad focal'},
        timeout=30,
    )
    results.append(status_bool(image_bad.status_code == 422, f"contest-image focal_x='abc' returns 422 (got {image_bad.status_code})"))

    # 5. Reveal endpoint URL move: public URL should exist; old admin URL should not.
    new_reveal = requests.post(
        f'{BASE_URL}/api/engines/instant-win/nonexistent-test/reveal?ticket_number=1',
        headers=headers_json,
        timeout=15,
    )
    old_reveal = requests.post(
        f'{BASE_URL}/api/admin/engines/instant-win/nonexistent-test/reveal?ticket_number=1',
        headers=headers_json,
        timeout=15,
    )
    results.append(status_bool(new_reveal.status_code != 404, f'new reveal URL is registered (got {new_reveal.status_code} {new_reveal.text[:120]})'))
    results.append(status_bool(old_reveal.status_code in (404, 405), f'old admin reveal URL is removed (got {old_reveal.status_code})'))

finally:
    # Required cleanup/reset.
    try:
        if headers_json:
            requests.put(
                f'{BASE_URL}/api/admin/company',
                headers=headers_json,
                json={'random_draw_engine_enabled': False, 'instant_win_engine_enabled': False},
                timeout=15,
            )
    except Exception as exc:
        print(f'WARN: failed to reset flags: {exc}')
    db.users.delete_one({'user_id': target_user_id})
    db.audit_log.delete_many({'target_user_id': target_user_id})
    client.close()

summary = {
    'base_url': BASE_URL,
    'passed': sum(1 for r in results if r),
    'failed': sum(1 for r in results if not r),
    'all_passed': all(results),
}
print('SUMMARY ' + json.dumps(summary, sort_keys=True))
raise SystemExit(0 if all(results) else 1)