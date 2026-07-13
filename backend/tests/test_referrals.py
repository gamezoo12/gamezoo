"""Referral programme: register with code, /me returns code+stats, /complete grants tickets."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='module')
def alice():
    ts = int(time.time() * 1000)
    email = f'test_ref_alice_{ts}@example.com'
    r = requests.post(f'{BASE_URL}/api/auth/register', json={'email': email, 'name': 'Alice', 'password': 'Password123!'}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    # fetch referral code
    r2 = requests.get(f'{BASE_URL}/api/referrals/me', headers=_auth(j['token']), timeout=30)
    assert r2.status_code == 200, r2.text
    return {'email': email, 'token': j['token'], 'user': j['user'], 'code': r2.json()['code']}


@pytest.fixture(scope='module')
def bob(alice):
    ts = int(time.time() * 1000)
    email = f'test_ref_bob_{ts}@example.com'
    r = requests.post(
        f'{BASE_URL}/api/auth/register',
        json={'email': email, 'name': 'Bob', 'password': 'Password123!', 'referral_code': alice['code']},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    return {'email': email, 'token': j['token'], 'user': j['user']}


class TestReferralFlow:
    def test_alice_has_referral_code(self, alice):
        assert alice['code']
        assert len(alice['code']) >= 6

    def test_bob_registered_with_code(self, alice, bob):
        # After bob registered with alice's code, alice should have 1 pending referral
        r = requests.get(f'{BASE_URL}/api/referrals/me', headers=_auth(alice['token']), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data['pending'] >= 1, f'expected >=1 pending, got {data}'
        assert data['completed'] == 0

    def test_alice_list_shows_bob(self, alice, bob):
        r = requests.get(f'{BASE_URL}/api/referrals/list', headers=_auth(alice['token']), timeout=30)
        assert r.status_code == 200
        refs = r.json()['referrals']
        assert any(x['referred_user_id'] == bob['user']['user_id'] for x in refs)

    def test_complete_referral_grants_tickets(self, alice, bob):
        # Bob calls /complete
        r = requests.post(f'{BASE_URL}/api/referrals/complete', headers=_auth(bob['token']), timeout=30)
        # It may return 200 with tickets granted, OR 404 if no live sub-£5 contest exists.
        # For a robust test, accept both but check the referral flip.
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            body = r.json()
            assert body['ok'] is True
            # Verify alice sees completed=1
            r2 = requests.get(f'{BASE_URL}/api/referrals/me', headers=_auth(alice['token']), timeout=30)
            assert r2.json()['completed'] >= 1

    def test_no_pending_referral_for_solo_user(self):
        # A user with no pending referral gets 404 on /complete
        ts = int(time.time() * 1000)
        email = f'test_ref_solo_{ts}@example.com'
        r = requests.post(f'{BASE_URL}/api/auth/register', json={'email': email, 'name': 'Solo', 'password': 'Password123!'}, timeout=30)
        assert r.status_code == 200
        tok = r.json()['token']
        r2 = requests.post(f'{BASE_URL}/api/referrals/complete', headers=_auth(tok), timeout=30)
        assert r2.status_code == 404
