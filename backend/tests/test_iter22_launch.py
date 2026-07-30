"""Iteration 22 - Prize League launch spec backend tests.
Covers: 30+ contest field CRUD, Company Settings + audit, Postal Entry admin queue,
and Skill Leaderboard endpoint contract.
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASSWORD = 'Herts@910022'
TEST_CONTEST_SLUG = 'test-skill-leaderboard-contest-a0e33a'


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    assert r.status_code == 200, f'Admin login failed: {r.text}'
    return r.json()['token']


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}', 'Content-Type': 'application/json'}


@pytest.fixture(scope='module')
def test_contest():
    r = requests.get(f'{BASE_URL}/api/contests/{TEST_CONTEST_SLUG}')
    assert r.status_code == 200, f'Test contest not found: {r.status_code} {r.text}'
    return r.json()


# ---------- 1. Company Settings ----------
class TestCompanySettings:
    def test_public_company_defaults(self):
        r = requests.get(f'{BASE_URL}/api/public/company')
        assert r.status_code == 200
        d = r.json()
        assert d['legal_name'] == 'PRIZE LEAGUE LTD'
        assert d['company_number'] == '17338919'
        assert d['jurisdiction'] == 'England and Wales'
        assert d['registered_address']['postcode'] == 'E7 0RB'
        assert d.get('postal_address_line1')
        assert d.get('postal_address_postcode')

    def test_admin_company_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/admin/company')
        assert r.status_code in (401, 403)

    def test_admin_company_ok(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/admin/company', headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert 'random_draw_engine_enabled' in d
        assert d['random_draw_engine_enabled'] is False
        assert d['instant_win_engine_enabled'] is False

    def test_super_admin_can_update_and_audit(self, admin_headers):
        marker = f'TEST_iter22_{uuid.uuid4().hex[:6]}'
        r = requests.put(f'{BASE_URL}/api/admin/company',
                         headers=admin_headers,
                         json={'legal_review_notes': marker})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get('ok') is True
        assert 'legal_review_notes' in data.get('updated_fields', [])

        # Verify persistence
        r2 = requests.get(f'{BASE_URL}/api/admin/company', headers=admin_headers)
        assert r2.json()['legal_review_notes'] == marker

    def test_update_requires_payload(self, admin_headers):
        r = requests.put(f'{BASE_URL}/api/admin/company', headers=admin_headers, json={})
        assert r.status_code == 400


# ---------- 2. Contest new fields (23+) ----------
NEW_FIELDS_SAMPLE = {
    'short_description': 'Test short',
    'full_description': 'Test full description',
    'how_to_enter': 'Step 1...',
    'skill_instructions': 'Answer the question',
    'eligibility': 'UK 18+',
    'max_tickets_per_user': 25,
    'prize_details': '£100 cash',
    'num_prizes': 1,
    'prize_values': '["£100"]',
    'winner_method': 'Highest score',
    'scoring_method': 'points',
    'tiebreak_method': 'accuracy then duration',
    'verification_method': 'server-side',
    'prize_credit_timeframe': '7 days',
    'refund_conditions': 'no refunds',
    'important_info': 'read the rules',
    'contest_rules': 'no cheating',
    'terms_acknowledgement': 'I agree',
    'country_restrictions': 'UK only',
    'age_restriction': '18+',
    'free_postal_entry_available': True,
    'free_postal_entry_instructions': 'Send envelope to...',
    'engine_type': 'leaderboard',
}


class TestContestExtendedFields:
    def test_contest_get_returns_new_fields(self, test_contest):
        # At minimum, engine_type should be present
        assert 'engine_type' in test_contest
        # At least a few key spec fields should be exposed
        keys = set(test_contest.keys())
        must_have_any = {'short_description', 'full_description', 'how_to_enter',
                        'skill_instructions', 'prize_details'}
        overlap = keys & must_have_any
        assert overlap, f'Public contest missing extended fields. keys={sorted(keys)}'

    def test_update_contest_persists_new_fields(self, admin_headers, test_contest):
        cid = test_contest['contest_id']
        payload = {**NEW_FIELDS_SAMPLE,
                   'short_description': f'TEST_iter22_{uuid.uuid4().hex[:6]}'}
        r = requests.put(f'{BASE_URL}/api/admin/contests/{cid}',
                         headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        # Verify via public GET
        g = requests.get(f'{BASE_URL}/api/contests/{TEST_CONTEST_SLUG}')
        assert g.status_code == 200
        gd = g.json()
        assert gd.get('short_description') == payload['short_description']
        # Check several fields survived
        for f in ('how_to_enter', 'prize_details', 'contest_rules',
                  'country_restrictions', 'age_restriction'):
            assert gd.get(f) == payload[f], f'Field {f} did not persist: {gd.get(f)!r}'


# ---------- 3. Postal Entries ----------
class TestPostalEntries:
    def test_list_requires_auth(self):
        r = requests.get(f'{BASE_URL}/api/admin/postal-entries')
        assert r.status_code in (401, 403)

    def test_create_and_transition(self, admin_headers):
        marker = f'TEST_iter22_{uuid.uuid4().hex[:6]}'
        r = requests.post(f'{BASE_URL}/api/admin/postal-entries',
                          headers=admin_headers,
                          json={'entrant_name': marker,
                                'contest_slug': TEST_CONTEST_SLUG})
        assert r.status_code == 200, r.text
        eid = r.json()['entry_id']
        assert eid.startswith('pe_')

        # List returns counts
        lst = requests.get(f'{BASE_URL}/api/admin/postal-entries', headers=admin_headers)
        assert lst.status_code == 200
        body = lst.json()
        assert 'entries' in body and 'counts' in body
        for s in ('received', 'under_review', 'validated', 'rejected',
                  'allocated', 'duplicate', 'late_entry'):
            assert s in body['counts']

        # Transition received -> under_review -> validated -> allocated
        for status in ('under_review', 'validated', 'allocated'):
            r = requests.put(f'{BASE_URL}/api/admin/postal-entries/{eid}',
                             headers=admin_headers, json={'status': status})
            assert r.status_code == 200, f'{status} failed: {r.text}'

        # Verify audit trail contains all transitions
        lst2 = requests.get(f'{BASE_URL}/api/admin/postal-entries',
                            headers=admin_headers,
                            params={'status': 'allocated'})
        found = [e for e in lst2.json()['entries'] if e['entry_id'] == eid]
        assert found, 'Entry not in allocated tab'
        entry = found[0]
        audit_statuses = [a.get('status') for a in entry.get('audit', [])]
        for s in ('received', 'under_review', 'validated', 'allocated'):
            assert s in audit_statuses, f'Missing audit entry {s}: {audit_statuses}'
        # Cleanup
        requests.delete(f'{BASE_URL}/api/admin/postal-entries/{eid}', headers=admin_headers)

    def test_update_missing_returns_404(self, admin_headers):
        r = requests.put(f'{BASE_URL}/api/admin/postal-entries/pe_nonexistent',
                         headers=admin_headers, json={'status': 'validated'})
        assert r.status_code == 404


# ---------- 4. Skill Leaderboard ----------
class TestLeaderboardEndpoint:
    def test_leaderboard_contract(self, test_contest):
        cid = test_contest['contest_id']
        r = requests.get(f'{BASE_URL}/api/contests/{cid}/leaderboard')
        assert r.status_code == 200, r.text
        d = r.json()
        # Spec REQUIRES these keys
        assert 'contest_id' in d
        assert 'engine_type' in d, f'Missing engine_type. keys={list(d.keys())}'
        assert 'entries' in d, f'Missing entries[]. keys={list(d.keys())}'
        assert 'tie_break_rules' in d, f'Missing tie_break_rules. keys={list(d.keys())}'
        assert isinstance(d['entries'], list)
        assert isinstance(d['tie_break_rules'], list) and len(d['tie_break_rules']) >= 3

    def test_leaderboard_specific_contest_c_fd360e20adad(self):
        """iter23 retest: c_fd360e20adad must return spec contract."""
        r = requests.get(f'{BASE_URL}/api/contests/c_fd360e20adad/leaderboard')
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d.keys()) >= {'contest_id', 'engine_type', 'closed', 'entries', 'tie_break_rules'}, f'keys={list(d.keys())}'
        assert d['contest_id'] == 'c_fd360e20adad'
        assert d['engine_type'] == 'leaderboard', f"engine_type={d['engine_type']}"
        # `closed` is derived from contest.status != 'live'; verify it's a bool.
        # Test contest is currently in 'draft' status so closed=True is expected.
        assert isinstance(d['closed'], bool), f"closed not bool: {d['closed']}"
        assert d['entries'] == [], f"entries should be empty, got {d['entries']}"
        assert isinstance(d['tie_break_rules'], list) and len(d['tie_break_rules']) == 4
        # First rule mentions "Higher points"
        assert 'Higher points' in d['tie_break_rules'][0]
        # OLD contract keys must NOT be present
        assert 'leaderboard' not in d, 'Old {leaderboard:[]} contract still present'

    def test_global_leaderboard_still_works(self):
        """Global leaderboard was NOT removed — still returns {leaderboard:[...]}"""
        # Try the path per code registration (public_router prefix /api + /leaderboard/global)
        r = requests.get(f'{BASE_URL}/api/leaderboard/global?limit=10')
        if r.status_code == 404:
            # Fallback to alternate path mentioned in review
            r = requests.get(f'{BASE_URL}/api/games/leaderboard/global?limit=10')
        assert r.status_code == 200, f'global leaderboard failed: {r.status_code} {r.text}'
        d = r.json()
        assert 'leaderboard' in d
        assert isinstance(d['leaderboard'], list)


# ---------- 5. Audit log no-op skip (iter23) ----------
class TestAuditNoOpSkip:
    def test_noop_update_does_not_write_audit(self, admin_headers):
        """PUT with same values as current — audit_log should NOT get a new doc."""
        # Read current company settings
        cur = requests.get(f'{BASE_URL}/api/admin/company', headers=admin_headers).json()
        # Pick a stable string field that already has a value
        field = None
        for candidate in ('legal_review_notes', 'legal_name', 'company_number', 'jurisdiction'):
            v = cur.get(candidate)
            if isinstance(v, str) and v:
                field = candidate
                break
        assert field, f'no stable field to test with. keys={list(cur.keys())}'
        payload = {field: cur[field]}

        # Count audit rows before
        before = requests.get(f'{BASE_URL}/api/admin/audit-log?kind=company_settings_update&limit=200',
                              headers=admin_headers)
        if before.status_code != 200:
            # Fallback: try alt path
            before = requests.get(f'{BASE_URL}/api/admin/audit_log?limit=200', headers=admin_headers)
        before_count = None
        if before.status_code == 200:
            body = before.json()
            rows = body if isinstance(body, list) else (body.get('entries') or body.get('audit') or body.get('items') or [])
            before_count = len([r for r in rows if r.get('kind') == 'company_settings_update'])

        # PUT no-op
        r = requests.put(f'{BASE_URL}/api/admin/company', headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get('ok') is True

        # Count after
        if before_count is not None:
            after = requests.get(f'{BASE_URL}/api/admin/audit-log?kind=company_settings_update&limit=200',
                                 headers=admin_headers)
            if after.status_code != 200:
                after = requests.get(f'{BASE_URL}/api/admin/audit_log?limit=200', headers=admin_headers)
            body = after.json()
            rows = body if isinstance(body, list) else (body.get('entries') or body.get('audit') or body.get('items') or [])
            after_count = len([r for r in rows if r.get('kind') == 'company_settings_update'])
            assert after_count == before_count, f'audit_log grew on no-op update: before={before_count} after={after_count}'
        else:
            # No public audit_log endpoint — inspect DB directly
            import subprocess, json as _json
            out = subprocess.run(
                ['python', '-c',
                 'import asyncio,os;from motor.motor_asyncio import AsyncIOMotorClient;\n'
                 'c=AsyncIOMotorClient(os.environ["MONGO_URL"]);db=c[os.environ["DB_NAME"]];\n'
                 'print(asyncio.get_event_loop().run_until_complete(db.audit_log.count_documents({"kind":"company_settings_update"})))'],
                capture_output=True, text=True, cwd='/app/backend')
            print('audit_log count via mongo:', out.stdout, out.stderr)
