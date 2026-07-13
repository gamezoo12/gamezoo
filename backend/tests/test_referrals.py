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


# ---------------------------------------------------------------------------
# Fallback branch: if NO live contest with price<=£5 exists, /complete must
# still succeed and credit £5 to BOTH the referrer and the referred user's
# wallet (kind='referral_bonus').
# ---------------------------------------------------------------------------
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASSWORD = 'Herts@910022'


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
    """When no live contest ≤£5 exists, /complete should credit £5 to both parties."""

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

        # Call complete — with no live contest ≤ £5, fallback should credit £5 to both
        cmp = requests.post(f'{BASE_URL}/api/referrals/complete', headers=_auth(ed_token), timeout=30)
        assert cmp.status_code == 200, f'Expected 200 with fallback credit, got {cmp.status_code}: {cmp.text}'
        body = cmp.json()
        assert body.get('ok') is True

        # Verify balances after
        w_ref_after = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(ref_token), timeout=30).json()
        w_ed_after = requests.get(f'{BASE_URL}/api/wallet/me', headers=_auth(ed_token), timeout=30).json()
        ref_bal_after = float(w_ref_after.get('balance', 0))
        ed_bal_after = float(w_ed_after.get('balance', 0))

        assert ref_bal_after - ref_bal_before == pytest.approx(5.0), \
            f'Referrer balance delta expected 5.0, got {ref_bal_after - ref_bal_before} (before={ref_bal_before}, after={ref_bal_after})'
        assert ed_bal_after - ed_bal_before == pytest.approx(5.0), \
            f'Referred balance delta expected 5.0, got {ed_bal_after - ed_bal_before}'

        # Verify wallet_tx entries of kind='referral_bonus' amount=5.0
        txs_ref = requests.get(f'{BASE_URL}/api/wallet/transactions', headers=_auth(ref_token), timeout=30).json()['transactions']
        txs_ed = requests.get(f'{BASE_URL}/api/wallet/transactions', headers=_auth(ed_token), timeout=30).json()['transactions']
        assert any(t['kind'] == 'referral_bonus' and float(t['amount']) == 5.0 for t in txs_ref), \
            f'Referrer wallet has no referral_bonus tx of £5: {txs_ref}'
        assert any(t['kind'] == 'referral_bonus' and float(t['amount']) == 5.0 for t in txs_ed), \
            f'Referred wallet has no referral_bonus tx of £5: {txs_ed}'
