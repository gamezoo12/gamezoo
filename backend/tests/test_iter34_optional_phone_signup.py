"""
Locks the iter 34 behaviour: phone verification is OPTIONAL at signup.

Consulted playbook: integration_playbook_expert_v2 (auth-registration
optional-phone pattern). Tests cover:
  1) Signup with just email + password succeeds → phone=None, phone_verified=false
  2) Signup with phone but no OTP is rejected (422 pair-required)
  3) Signup with OTP but no phone is rejected (422 pair-required)
  4) Login works normally for a phone-less account
"""
from __future__ import annotations
import os
import time
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


def _fresh_email(prefix: str) -> str:
    return f'{prefix}_{int(time.time() * 1000)}@example.com'


def test_register_without_phone_succeeds():
    email = _fresh_email('nophone')
    r = requests.post(
        f'{BASE_URL}/api/auth/register',
        json={
            'email': email,
            'password': 'GoodPass123!',
            'name': 'No Phone User',
            'accept_terms': True,
            'dob': '1990-01-15',
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['user']['email'] == email
    assert body['user']['phone'] is None
    assert body['user']['phone_verified'] is False
    assert body['token']  # JWT issued for immediate signed-in state


def test_register_phone_without_otp_returns_422():
    r = requests.post(
        f'{BASE_URL}/api/auth/register',
        json={
            'email': _fresh_email('phonly'),
            'password': 'GoodPass123!',
            'name': 'Phone Only',
            'phone': '+447700900123',
            'accept_terms': True,
            'dob': '1990-01-15',
        },
        timeout=15,
    )
    assert r.status_code == 422, r.text
    assert 'otp_code is required' in r.json()['detail'].lower()


def test_register_otp_without_phone_returns_422():
    r = requests.post(
        f'{BASE_URL}/api/auth/register',
        json={
            'email': _fresh_email('otponly'),
            'password': 'GoodPass123!',
            'name': 'OTP Only',
            'otp_code': '123456',
            'accept_terms': True,
            'dob': '1990-01-15',
        },
        timeout=15,
    )
    assert r.status_code == 422, r.text
    assert 'phone is required' in r.json()['detail'].lower()


def test_login_works_for_phoneless_account():
    """A user created without a phone must still be able to log in normally."""
    email = _fresh_email('phoneless_login')
    password = 'LoginPass456!'
    reg = requests.post(
        f'{BASE_URL}/api/auth/register',
        json={
            'email': email,
            'password': password,
            'name': 'Phoneless Loginer',
            'accept_terms': True,
            'dob': '1990-01-15',
        },
        timeout=15,
    )
    assert reg.status_code == 200, reg.text

    log = requests.post(
        f'{BASE_URL}/api/auth/login',
        json={'email': email, 'password': password},
        timeout=15,
    )
    assert log.status_code == 200, log.text
    assert log.json()['user']['phone_verified'] is False
