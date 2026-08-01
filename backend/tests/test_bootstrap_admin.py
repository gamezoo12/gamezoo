"""
Tests for POST /api/auth/bootstrap-admin — the one-time Super Admin
creation gate. Written to lock down the four critical behaviors:

    1) With zero privileged users, bootstrap succeeds → 200 + token.
    2) After success, a second bootstrap attempt is refused with 403.
    3) Normal /login for the bootstrapped account returns 200 + token.
    4) Wrong password returns 401 (not 500 → the whole reason we added
       this endpoint in the first place: production was returning empty
       500s and the frontend rendered them as "Invalid credentials").

These tests run against the live preview backend so they exercise the
real DB. They wipe & restore the seed admin around themselves.
"""
from __future__ import annotations
import asyncio
import os
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get('BACKEND_URL') or os.environ.get('REACT_APP_BACKEND_URL')
if not BASE_URL:
    # Fallback: read from frontend .env for local dev.
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().strip('"')
                    break
    except Exception:
        pass

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

TEST_EMAIL = 'bootstrap_e2e@prizeleague.example.com'
TEST_PASSWORD = 'BootstrapPass!2026'


async def _wipe_privileged():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    # Snapshot then wipe so the surrounding suite still has its admin.
    snapshot = await db.users.find(
        {'role': {'$in': ['admin', 'super_admin', 'operator', 'support']}}
    ).to_list(None)
    await db.users.delete_many({'role': {'$in': ['admin', 'super_admin', 'operator', 'support']}})
    client.close()
    return snapshot


async def _restore(snapshot):
    if not snapshot:
        return
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    # Delete the test-created admin, then restore the originals.
    await db.users.delete_many({'email': {'$in': [TEST_EMAIL, 'bachanta8@gmail.com']}})
    await db.users.insert_many(snapshot)
    client.close()


@pytest.fixture(scope='module')
def clean_admins():
    snapshot = asyncio.get_event_loop().run_until_complete(_wipe_privileged())
    yield
    asyncio.get_event_loop().run_until_complete(_restore(snapshot))


def test_bootstrap_when_no_admin_succeeds(clean_admins):
    r = requests.post(
        f'{BASE_URL}/api/auth/bootstrap-admin',
        json={'email': TEST_EMAIL, 'password': TEST_PASSWORD, 'name': 'E2E Admin'},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['ok'] is True
    assert body['user']['role'] == 'super_admin'
    assert body['token']


def test_bootstrap_second_call_is_forbidden():
    r = requests.post(
        f'{BASE_URL}/api/auth/bootstrap-admin',
        json={'email': 'someone@other.test', 'password': 'AnotherPass!12', 'name': 'X'},
        timeout=10,
    )
    assert r.status_code == 403, r.text
    assert 'already exists' in r.json()['detail'].lower()


def test_login_after_bootstrap():
    r = requests.post(
        f'{BASE_URL}/api/auth/login',
        json={'email': TEST_EMAIL, 'password': TEST_PASSWORD},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()['user']['role'] == 'super_admin'


def test_login_wrong_password_is_401_not_500():
    r = requests.post(
        f'{BASE_URL}/api/auth/login',
        json={'email': TEST_EMAIL, 'password': 'wrong-password'},
        timeout=10,
    )
    assert r.status_code == 401, r.text
    assert r.json()['detail'] == 'Invalid email or password'
