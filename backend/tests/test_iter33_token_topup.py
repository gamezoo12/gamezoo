"""
Tests for the zero-config Stripe token top-up flow (iter 33).

Previously all preset packages (`wallet_topup_5/10/20/50/100`) required a
matching Stripe Price row created via `setup_stripe.py` — without it, prod
returned HTTP 500 "Price not configured for wallet_topup_5" and users
could not buy tokens. This test locks the behaviour that the endpoints
now derive amounts from the lookup_key itself and use inline `price_data`,
so no Stripe catalog seeding is ever required.
"""
from __future__ import annotations
import os
import requests

BASE_URL = None
try:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"')
                break
except Exception:
    pass
BASE_URL = BASE_URL or 'http://localhost:8001'
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASSWORD = 'Herts@910022'


def _admin_token() -> str:
    r = requests.post(
        f'{BASE_URL}/api/auth/login',
        json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD},
        timeout=10,
    )
    assert r.status_code == 200, f'admin login failed: {r.text}'
    return r.json()['token']


def _create_session(token: str, lookup_key: str) -> dict:
    r = requests.post(
        f'{BASE_URL}/api/payments/wallet-topup/checkout',
        headers={'Authorization': f'Bearer {token}'},
        json={'lookup_key': lookup_key, 'origin_url': BASE_URL},
        timeout=15,
    )
    assert r.status_code == 200, f'{lookup_key} failed: HTTP {r.status_code} {r.text}'
    body = r.json()
    assert 'checkout_url' in body, body
    assert body['checkout_url'].startswith('https://checkout.stripe.com/'), body['checkout_url']
    return body


def test_all_five_preset_packages_return_stripe_urls():
    """Every preset must mint a real Stripe Checkout Session URL. No
    500 'Price not configured' allowed."""
    token = _admin_token()
    for n in (5, 10, 20, 50, 100):
        body = _create_session(token, f'wallet_topup_{n}')
        # session_id must be a Stripe cs_test_ or cs_live_ id.
        sid = body.get('session_id') or ''
        assert sid.startswith('cs_'), f'session_id looks wrong: {sid!r}'


def test_invalid_lookup_key_returns_400():
    token = _admin_token()
    r = requests.post(
        f'{BASE_URL}/api/payments/wallet-topup/checkout',
        headers={'Authorization': f'Bearer {token}'},
        json={'lookup_key': 'wallet_topup_99999', 'origin_url': BASE_URL},
        timeout=10,
    )
    assert r.status_code == 400, r.text
    assert 'invalid' in r.json()['detail'].lower()


def test_custom_topup_still_works_with_min_5():
    token = _admin_token()
    # 4 rejected
    r4 = requests.post(
        f'{BASE_URL}/api/payments/wallet-topup/custom',
        headers={'Authorization': f'Bearer {token}'},
        json={'amount': 4, 'origin_url': BASE_URL},
        timeout=10,
    )
    assert r4.status_code == 422, r4.text
    # 5 accepted
    r5 = requests.post(
        f'{BASE_URL}/api/payments/wallet-topup/custom',
        headers={'Authorization': f'Bearer {token}'},
        json={'amount': 5, 'origin_url': BASE_URL},
        timeout=15,
    )
    assert r5.status_code == 200, r5.text
    assert r5.json()['checkout_url'].startswith('https://checkout.stripe.com/')
