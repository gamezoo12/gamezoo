"""Phase 2B backend tests.

Covers:
  - GET  /api/config/turnstile         → returns enabled + site_key
  - POST /api/games/captcha/verify      → 401 without auth; auth → challenge_token issued (TEST secret always passes)
  - POST /api/payments/wallet-topup/custom → min £5 / max £1000 validation + happy path (session_id + checkout_url)
  - POST /api/payments/wallet-topup/checkout (legacy)  → still works
  - Attempts-per-ticket enforcement (2 tickets × 3 apt = 6 attempts allowed; 7th rejected)
  - GET  /api/orders/my-games returns tickets_owned + attempts_per_ticket + attempts_remaining
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
OTP = '000000'
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'


def _fresh_email(tag='p2b'):
    return f"e2e_{tag}_{uuid.uuid4().hex[:8]}@test.com"


_PC = [0]
def _fresh_phone():
    _PC[0] += 1
    seed = (int(time.time() * 1000) + _PC[0]) % 10000000
    return f"+1555{seed:07d}"


def _register(tag='p2b'):
    p = {
        'email': _fresh_email(tag),
        'password': 'Password123!',
        'name': 'Balaram Test',
        'phone': _fresh_phone(),
        'otp_code': OTP,
        'accept_terms': True,
        'dob': '2000-08-02',
        'address': '221B Baker St, London',
    }
    r = requests.post(f"{API}/auth/register", json=p, timeout=30)
    assert r.status_code == 200, r.text
    return p, r.json()


def _admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()['token']


# =========================================================================
# Turnstile / CAPTCHA
# =========================================================================
class TestTurnstile:
    def test_config_endpoint(self):
        r = requests.get(f"{API}/config/turnstile", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body['enabled'] is True
        assert body['site_key'] == '1x00000000000000000000AA'

    def test_captcha_verify_requires_auth(self):
        r = requests.post(f"{API}/games/captcha/verify",
                          json={'token': 'dummy', 'contest_id': 'nonexistent'}, timeout=10)
        # Any auth-guarded endpoint returns 401/403
        assert r.status_code in (401, 403), r.text

    def test_captcha_verify_with_test_secret_returns_challenge(self):
        _, data = _register('cap')
        tok = data['token']
        # Cloudflare TEST secret key always returns success=true regardless of token content
        r = requests.post(
            f"{API}/games/captcha/verify",
            json={'token': 'XXXX.DUMMY.TOKEN.XXXX', 'contest_id': 'contest-does-not-exist'},
            headers={'Authorization': f'Bearer {tok}'},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get('ok') is True
        challenge = body.get('challenge_token')
        assert challenge and '.' in challenge
        # Body format: <user_id>:<contest_id>:<exp>.<hmac>
        head, sig = challenge.rsplit('.', 1)
        assert len(sig) >= 40  # sha256 hex
        u, c, exp_s = head.split(':', 2)
        assert c == 'contest-does-not-exist'
        assert int(exp_s) > int(time.time())


# =========================================================================
# Wallet top-up (custom + legacy)
# =========================================================================
class TestWalletTopup:
    def test_custom_topup_happy_path(self):
        _, data = _register('cust')
        tok = data['token']
        r = requests.post(
            f"{API}/payments/wallet-topup/custom",
            json={'amount': 5.0, 'origin_url': 'https://example.com'},
            headers={'Authorization': f'Bearer {tok}'}, timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get('session_id', '').startswith('cs_')
        assert body.get('checkout_url', '').startswith('https://')

    def test_custom_topup_below_minimum_rejected(self):
        _, data = _register('cmin')
        tok = data['token']
        r = requests.post(
            f"{API}/payments/wallet-topup/custom",
            json={'amount': 3.0, 'origin_url': 'https://example.com'},
            headers={'Authorization': f'Bearer {tok}'}, timeout=15,
        )
        assert r.status_code in (400, 422), r.text

    def test_custom_topup_above_maximum_rejected(self):
        _, data = _register('cmax')
        tok = data['token']
        r = requests.post(
            f"{API}/payments/wallet-topup/custom",
            json={'amount': 1500.0, 'origin_url': 'https://example.com'},
            headers={'Authorization': f'Bearer {tok}'}, timeout=15,
        )
        assert r.status_code in (400, 422), r.text

    def test_custom_topup_requires_auth(self):
        r = requests.post(
            f"{API}/payments/wallet-topup/custom",
            json={'amount': 10.0, 'origin_url': 'https://example.com'}, timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_legacy_topup_checkout_still_works(self):
        _, data = _register('leg')
        tok = data['token']
        r = requests.post(
            f"{API}/payments/wallet-topup/checkout",
            json={'lookup_key': 'wallet_topup_20', 'origin_url': 'https://example.com'},
            headers={'Authorization': f'Bearer {tok}'}, timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get('session_id', '').startswith('cs_')
        assert body.get('checkout_url', '').startswith('https://')


# =========================================================================
# Attempts-per-ticket enforcement (2 tickets × 3 apt = 6 attempts)
# =========================================================================
class TestAttemptsPerTicket:
    def _create_skill_game_contest(self, admin_tok, apt=3):
        """Admin creates a skill-game contest, then patches attempts_per_ticket + game_type."""
        payload = {
            'title': f'APT Test Contest {uuid.uuid4().hex[:6]}',
            'subtitle': 'attempts-per-ticket test',
            'category': 'new-games',
            'price': 1.0,
            'tickets_total': 500,
            'prize_amount': 100,
            'end_date': '2099-12-31T23:59:59Z',
            'image': 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg',
            'skill_question': {
                'q': 'What is 2 + 2?',
                'options': ['3', '4', '5'],
                'answer': '4',
                'type': 'trivia',
            },
            'status': 'live',
        }
        r = requests.post(f"{API}/admin/contests",
                          json=payload,
                          headers={'Authorization': f'Bearer {admin_tok}'}, timeout=30)
        assert r.status_code == 200, r.text
        contest = r.json()['contest']
        cid = contest['contest_id']
        # Attach a game_type + APT via PUT
        r2 = requests.put(
            f"{API}/admin/contests/{cid}",
            json={'game_type': 'reaction_time', 'entry_mode': 'skill_game',
                  'attempts_per_ticket': apt, 'status': 'live'},
            headers={'Authorization': f'Bearer {admin_tok}'}, timeout=15,
        )
        assert r2.status_code == 200, r2.text
        return cid

    def _topup_and_buy(self, user_tok, contest_id, qty):
        """Directly credit the wallet via admin adjust (simpler than full Stripe), then checkout."""
        # We don't have a direct admin credit endpoint publicly used; instead, we mint a fresh user
        # and buy tickets by first topping up via a manual admin route if available.
        # BUT: we need a way to fund the wallet. Use the referral bonus? Or use admin wallet adjust?
        # Simplest: use POST /api/wallet/admin-credit if exists, else skip.
        pass

    def test_attempts_pool_6_allowed_7th_rejected(self):
        admin_tok = _admin_token()
        cid = self._create_skill_game_contest(admin_tok, apt=3)

        # Register fresh user + fund wallet + buy 2 tickets.
        p, data = _register('apt')
        user_tok = data['token']
        user_id = data['user']['user_id']
        headers = {'Authorization': f'Bearer {user_tok}'}

        # Fund the wallet via the MOCKED player top-up route (min £10 for legacy endpoint).
        r = requests.post(
            f"{API}/wallet/topup",
            json={'amount': 10.0},
            headers=headers, timeout=10,
        )
        assert r.status_code == 200, f'wallet topup failed: {r.status_code} {r.text}'

        # Buy 2 tickets
        r = requests.post(
            f"{API}/orders/checkout",
            json={'items': [{'contest_id': cid, 'qty': 2, 'skill_answer': '4'}]},
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        # Fetch my tickets — grab the first one to use as ticket_id
        r = requests.get(f"{API}/orders/my-tickets", headers=headers, timeout=10)
        assert r.status_code == 200
        tickets = [t for t in r.json() if t['contest_id'] == cid]
        assert len(tickets) == 2, f'expected 2 tickets, got {len(tickets)}'
        ticket_id = tickets[0]['ticket_id']

        # Submit 6 attempts (all should succeed)
        for i in range(6):
            r = requests.post(
                f"{API}/games/submit",
                json={'ticket_id': ticket_id, 'duration_ms': 5000, 'accuracy': 0.9, 'solved': True},
                headers=headers, timeout=15,
            )
            assert r.status_code == 200, f'attempt #{i+1} failed: {r.status_code} {r.text}'
            body = r.json()
            assert body['total_allowed'] == 6, body
            assert body['tickets'] == 2, body

        # 7th attempt must be rejected
        r = requests.post(
            f"{API}/games/submit",
            json={'ticket_id': ticket_id, 'duration_ms': 5000, 'accuracy': 0.9, 'solved': True},
            headers=headers, timeout=15,
        )
        assert r.status_code == 400, r.text
        assert 'No attempts left' in r.json().get('detail', ''), r.text

        # /my-games returns tickets_owned + attempts_per_ticket + attempts_remaining
        r = requests.get(f"{API}/orders/my-games", headers=headers, timeout=10)
        assert r.status_code == 200
        games = r.json()['games']
        row = next((g for g in games if g['contest_id'] == cid), None)
        assert row is not None, f'my-games missing contest: {games}'
        assert row['attempts_per_ticket'] == 3
        assert row['tickets_owned'] == 2
        assert row['attempts_remaining'] == 0
        assert row['max_attempts'] == 6
        assert row['attempts_used'] == 6

        # Cleanup contest
        requests.delete(f"{API}/admin/contests/{cid}",
                        headers={'Authorization': f'Bearer {admin_tok}'}, timeout=10)
