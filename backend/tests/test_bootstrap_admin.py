"""
Tests for POST /api/auth/bootstrap-admin — the one-time Super Admin
creation gate. Written to lock down the four critical behaviors:

    1) With zero privileged users, bootstrap succeeds → 200 + token.
    2) After success, a second bootstrap attempt is refused with 403.
    3) Normal /login for the bootstrapped account returns 200 + token.
    4) Wrong password returns 401 (not 500 → the whole reason we added
       this endpoint in the first place: production was returning empty
       500s and the frontend rendered them as "Invalid credentials").

These tests run only against the isolated local test backend and test database.
"""
from __future__ import annotations
import asyncio
import os
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Wipes every privileged user in the test DB, so it must not race other suites: RUN_BOOTSTRAP_TESTS=1 pytest -n 0 tests/test_bootstrap_admin.py
pytestmark = pytest.mark.skipif(
    os.environ.get('RUN_BOOTSTRAP_TESTS') != '1',
    reason='destructive to shared test-DB admins; run alone with RUN_BOOTSTRAP_TESTS=1 and -n 0',
)

BASE_URL = os.environ['BACKEND_URL']
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

TEST_EMAIL = os.environ.get("TEST_BOOTSTRAP_EMAIL", "bootstrap@example.test")
TEST_PASSWORD = os.environ.get("TEST_BOOTSTRAP_PASSWORD", "")


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
    await db.users.delete_many({'email': TEST_EMAIL})
    await db.users.insert_many(snapshot)
    client.close()


@pytest.fixture(scope='module')
def clean_admins():
    snapshot = asyncio.run(_wipe_privileged())
    yield
    asyncio.run(_restore(snapshot))


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
