"""Referral programme: register with code, /me returns code+stats, /complete grants tickets."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


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

    def test_complete_endpoint_is_disabled_and_grants_nothing(self, alice, bob):
        # Rewards are issued by verified backend events (£10+ top-up and first entry), never by a browser call.
        before = requests.get(f'{BASE_URL}/api/referrals/me', headers=_auth(alice['token']), timeout=30).json()
        r = requests.post(f'{BASE_URL}/api/referrals/complete', headers=_auth(bob['token']), timeout=30)
        assert r.status_code == 410, r.text
        after = requests.get(f'{BASE_URL}/api/referrals/me', headers=_auth(alice['token']), timeout=30).json()
        assert after['completed'] == before['completed']

    def test_complete_endpoint_is_disabled_for_solo_user(self):
        ts = int(time.time() * 1000)
        email = f'test_ref_solo_{ts}@example.com'
        r = requests.post(f'{BASE_URL}/api/auth/register', json={'email': email, 'name': 'Solo', 'password': 'Password123!'}, timeout=30)
        assert r.status_code == 200
        tok = r.json()['token']
        r2 = requests.post(f'{BASE_URL}/api/referrals/complete', headers=_auth(tok), timeout=30)
        assert r2.status_code == 410


# ---------------------------------------------------------------------------
# Fallback branch: if NO live contest with price<=£5 exists, /complete must
# still succeed and credit £5 to BOTH the referrer and the referred user's
# wallet (kind='referral_bonus').
# ---------------------------------------------------------------------------
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f'Admin login failed: {r.status_code} {r.text}')
    return r.json()['token']


@pytest.fixture(scope='class')
def hide_cheap_contests(admin_token):
    """Temporarily pause all live contests with price<=£5 so the fallback branch is exercised."""
    # Find all live contests price<=5 via admin listing
    r = requests.get(f'{BASE_URL}/api/admin/contests', headers=_auth(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    contests = r.json()
    paused_ids = []
    for c in contests:
        if c.get('status') == 'live' and float(c.get('price', 0)) <= 5:
            resp = requests.post(f'{BASE_URL}/api/admin/contests/{c["contest_id"]}/pause', headers=_auth(admin_token), timeout=30)
            if resp.status_code == 200:
                paused_ids.append(c['contest_id'])
    # Also create a fresh live contest with price=£10 to ensure at least one live contest exists
    payload = {
        'title': 'TEST Fallback Contest £10',
        'category': 'prize-draws',
        'price': 10.0,
        'tickets_total': 100,
        'prize_amount': 500.0,
        'status': 'live',
        'skill_question': {'q': '2+2?', 'options': ['3', '4', '5'], 'answer': '4', 'type': 'trivia'},
    }
    cr = requests.post(f'{BASE_URL}/api/admin/contests', headers=_auth(admin_token), json=payload, timeout=30)
    fresh_contest_id = cr.json().get('contest', {}).get('contest_id') if cr.status_code == 200 else None

    yield paused_ids

    # Restore paused contests
    for cid in paused_ids:
        requests.post(f'{BASE_URL}/api/admin/contests/{cid}/launch', headers=_auth(admin_token), timeout=30)
    # Delete the throwaway fresh contest
    if fresh_contest_id:
        requests.delete(f'{BASE_URL}/api/admin/contests/{fresh_contest_id}', headers=_auth(admin_token), timeout=30)


class TestReferralFallback:
    """When no live contest â‰¤£5 exists, /complete should credit £5 to both parties."""

    def test_fallback_credits_both_wallets(self, hide_cheap_contests):
        # Register referrer
        ts = int(time.time() * 1000)
        ref_email = f'test_ref_fb_ref_{ts}@example.com'
        r = requests.post(f'{BASE_URL}/api/auth/register',
                          json={'email': ref_email, 'name': 'RefFB', 'password': 'Password123!'}, timeout=30)
        assert r.status_code == 200, r.text
        ref_token = r.json()['token']
        me = requests.get(f'{BASE_URL}/api/referrals/me', headers=_auth(ref_token), timeout=30)
        assert me.status_code == 200
        ref_code = me.json()['code']

        # Register referred using referrer's code
        ed_email = f'test_ref_fb_ed_{ts}@example.com'
        r2 = requests.post(f'{BASE_URL}/api/auth/register',
                           json={'email': ed_email, 'name': 'EdFB', 'password': 'Password123!', 'referral_code': ref_code},
                           timeout=30)
        assert r2.status_code == 200, r2.text
        ed_token = r2.json()['token']
        ed_user = r2.json()['user']

        # Snapshot balances BEFORE
        w_ref_before = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(ref_token), timeout=30).json()
        w_ed_before = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(ed_token), timeout=30).json()
        ref_bal_before = float(w_ref_before.get('balance', 0))
        ed_bal_before = float(w_ed_before.get('balance', 0))

        # Call complete — with no live contest â‰¤ £5, fallback should credit £5 to both
        # The retired endpoint must not credit anyone, even with no cheap live contest.
        cmp = requests.post(f'{BASE_URL}/api/referrals/complete', headers=_auth(ed_token), timeout=30)
        assert cmp.status_code == 410, f'Expected 410 (disabled), got {cmp.status_code}: {cmp.text}'

        w_ref_after = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(ref_token), timeout=30).json()
        w_ed_after = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(ed_token), timeout=30).json()
        assert float(w_ref_after.get('balance', 0)) == pytest.approx(ref_bal_before)
        assert float(w_ed_after.get('balance', 0)) == pytest.approx(ed_bal_before)

        for token in (ref_token, ed_token):
            txs = requests.get(f'{BASE_URL}/api/wallet/transactions', headers=_auth(token), timeout=30).json()['transactions']
            assert not any(t['kind'] == 'referral_bonus' for t in txs)
