"""Iteration 44 backend tests.

Focus:
1. GET /api/admin/acquisition/summary?days=30 — conversion fields.
2. POST /api/acquisition/track — recording of visits.
3. GET /api/world/champion/status — admin (stage 2) sees initial_attempts=3
   with attempts_remaining <=3 (standardised policy).
4. Idempotency of GET /api/world/champion/status: repeated calls do not
   reset attempts_remaining upward.
5. POST /api/world/token/retry/reserve (level 0) is rejected with
   FREE_ATTEMPT_AVAILABLE while free attempts remain — no data corruption.
6. Regression: /api/world/state returns championship_history and levels[]
   with token_unlock_enabled True on level 2.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")


@pytest.fixture(scope='module')
def admin_headers():
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD},
                      timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get('token') or r.json().get('access_token')
    assert tok
    return {'Authorization': f'Bearer {tok}'}


# --------- Acquisition Conversion ---------
class TestAcquisitionConversion:
    def test_track_visits_various_sources(self):
        # send 3 different visits with different referrers/utms
        for payload in [
            {'visitor_id': f'TEST_conv_g_{uuid.uuid4().hex[:8]}',
             'landing_path': '/', 'referrer': 'https://www.google.com/'},
            {'visitor_id': f'TEST_conv_u_{uuid.uuid4().hex[:8]}',
             'landing_path': '/promo', 'utm_source': 'fb', 'utm_medium': 'cpc',
             'utm_campaign': 'launch44'},
            {'visitor_id': f'TEST_conv_d_{uuid.uuid4().hex[:8]}',
             'landing_path': '/', 'referrer': ''},
        ]:
            r = requests.post(f'{BASE_URL}/api/acquisition/track', json=payload, timeout=15)
            assert r.status_code == 200, r.text
            j = r.json()
            assert j.get('ok') is True and j.get('recorded') is True

    def test_summary_conversion_fields(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/admin/acquisition/summary?days=30',
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ('converted_visitors', 'overall_conversion_rate',
                  'by_source_conversion', 'unique_visitors'):
            assert k in d, f'missing {k}'
        assert isinstance(d['by_source_conversion'], list)
        # each entry has key, visitors, converted, rate
        total_conv = 0
        for row in d['by_source_conversion']:
            for f in ('key', 'visitors', 'converted', 'rate'):
                assert f in row, f'row missing {f}: {row}'
            assert row['visitors'] >= row['converted'] >= 0
            expected_rate = (round((row['converted'] / row['visitors']) * 100, 1)
                             if row['visitors'] else 0)
            assert row['rate'] == expected_rate, row
            total_conv += row['converted']
        # converted_visitors == sum of per-source converted
        assert d['converted_visitors'] == total_conv
        # overall rate check
        uv = d['unique_visitors']
        expected_overall = (round((d['converted_visitors'] / uv) * 100, 1)
                            if uv else 0)
        assert d['overall_conversion_rate'] == expected_overall


# --------- Champion Attempts Standardisation ---------
class TestChampionAttempts:
    def test_champion_status_stage2_initial_attempts_3(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/world/champion/status',
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        attempts = d.get('attempts')
        assert attempts is not None, 'attempts block missing (active contest expected)'
        assert attempts['initial_attempts'] == 3, attempts
        assert 0 <= attempts['attempts_remaining'] <= 3, attempts
        assert attempts['free_attempts_available'] == attempts['attempts_remaining']

    def test_champion_status_is_idempotent(self, admin_headers):
        """Repeated GETs must not reset attempts_remaining back to 3."""
        r1 = requests.get(f'{BASE_URL}/api/world/champion/status',
                          headers=admin_headers, timeout=20)
        assert r1.status_code == 200
        a1 = r1.json()['attempts']['attempts_remaining']
        for _ in range(3):
            r = requests.get(f'{BASE_URL}/api/world/champion/status',
                             headers=admin_headers, timeout=20)
            assert r.status_code == 200
            assert r.json()['attempts']['attempts_remaining'] == a1, \
                'attempts_remaining changed across identical GETs'

    def test_reserve_champion_token_rejected_when_free_available(self, admin_headers):
        """POST /api/world/token/retry/reserve level=0 must be rejected with
        FREE_ATTEMPT_AVAILABLE when the admin still has free attempts."""
        status = requests.get(f'{BASE_URL}/api/world/champion/status',
                              headers=admin_headers, timeout=20).json()
        remaining = int(status['attempts']['attempts_remaining'])
        if remaining <= 0:
            pytest.skip('No free attempts left; cannot test FREE_ATTEMPT_AVAILABLE path')

        r = requests.post(f'{BASE_URL}/api/world/token/retry/reserve',
                          headers=admin_headers, json={'level': 0}, timeout=20)
        assert r.status_code == 409, f'Expected 409, got {r.status_code}: {r.text}'
        try:
            body = r.json()
        except Exception:
            pytest.fail(f'Non-JSON body: {r.text}')
        detail = body.get('detail') or body
        code = detail.get('code') if isinstance(detail, dict) else None
        assert code == 'FREE_ATTEMPT_AVAILABLE', body

        # Data must not have been corrupted; attempts_remaining unchanged.
        status2 = requests.get(f'{BASE_URL}/api/world/champion/status',
                               headers=admin_headers, timeout=20).json()
        assert int(status2['attempts']['attempts_remaining']) == remaining


# --------- Regression: world/state ---------
class TestWorldStateRegression:
    def test_world_state_championship_history_and_level2_unlock(self, admin_headers):
        r = requests.get(f'{BASE_URL}/api/world/state', headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'championship_history' in d
        levels = d.get('levels') or []
        assert len(levels) == 10
        lv2 = next((l for l in levels if int(l.get('level')) == 2), None)
        assert lv2 is not None
        assert lv2.get('token_unlock_enabled') is True
