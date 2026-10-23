"""Contact verification link tests with mocked outbound providers."""
from __future__ import annotations

import asyncio
import os
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from deps import _mongo_url, _sanitize_db_name
from routers import contact_verification_routes as routes


def run_db(db_name, fn):
    async def run():
        client = AsyncIOMotorClient(_mongo_url)
        try:
            return await fn(client[db_name])
        finally:
            client.close()
    return asyncio.run(run())


@pytest.fixture(scope='module')
def safe_db():
    name = os.environ.get('DB_NAME', 'test_database')
    if 'test' not in name.lower():
        pytest.skip('Integration tests require a DB_NAME containing "test"')
    return _sanitize_db_name(name)


@pytest.fixture
def contact_user(safe_db):
    user_id = f'contact_itest_{uuid.uuid4().hex[:10]}'
    email = f'{user_id}@example.test'
    phone = '+447700900123'

    async def seed(db):
        await db.users.insert_one({
            'user_id': user_id, 'email': email, 'phone': phone,
            'email_verified': True, 'phone_verified': False, 'erased': False,
        })
    run_db(safe_db, seed)
    yield {'db_name': safe_db, 'user_id': user_id, 'email': email, 'phone': phone}

    async def cleanup(db):
        await db.users.delete_many({'user_id': user_id})
        await db.verification_links.delete_many({'user_id': user_id})
        await db.verification_link_limits.delete_many({'_id': {'$regex': f'^{user_id}:'}})
        await db.audit_log.delete_many({'target_user_id': user_id})
    run_db(safe_db, cleanup)


def _request():
    from starlette.requests import Request
    return Request({'type': 'http', 'method': 'POST', 'path': '/', 'headers': []})


def test_email_link_can_reverify_and_is_single_use(contact_user, monkeypatch):
    sent = []

    async def run(db):
        monkeypatch.setattr(routes, 'get_db', lambda: db)
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(routes, 'require_admin', admin)
        monkeypatch.setattr(routes, '_sendgrid_email', lambda target, link: sent.append((target, link)))
        monkeypatch.setenv('PUBLIC_SITE_URL', 'https://example.test')
        result = await routes.send_verification_link(contact_user['user_id'], 'email', _request())
        assert result['sent'] is True
        assert sent[0][0] == contact_user['email']
        token = sent[0][1].split('token=', 1)[1]
        stored = await db.verification_links.find_one({'user_id': contact_user['user_id']}, {'_id': 0})
        assert stored['token_hash'] != token
        page = await routes.verify_contact(token)
        assert 'verified successfully' in page.body.decode().lower()
        user = await db.users.find_one({'user_id': contact_user['user_id']}, {'_id': 0})
        assert user['email_verified'] is True
        replay = await routes.verify_contact(token)
        assert 'already used' in replay.body.decode().lower()
    run_db(contact_user['db_name'], run)


def test_verification_link_does_not_accept_changed_email(contact_user, monkeypatch):
    sent = []

    async def run(db):
        monkeypatch.setattr(routes, 'get_db', lambda: db)
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(routes, 'require_admin', admin)
        monkeypatch.setattr(routes, '_sendgrid_email', lambda target, link: sent.append(link))
        await routes.send_verification_link(contact_user['user_id'], 'email', _request())
        token = sent[0].split('token=', 1)[1]
        await db.users.update_one({'user_id': contact_user['user_id']}, {'$set': {'email': 'changed@example.test', 'email_verified': False}})
        page = await routes.verify_contact(token)
        assert 'contact details have changed' in page.body.decode().lower()
        user = await db.users.find_one({'user_id': contact_user['user_id']}, {'_id': 0})
        assert user['email_verified'] is False
    run_db(contact_user['db_name'], run)


def test_verification_link_rate_limit_is_atomic_for_concurrent_requests(contact_user, monkeypatch):
    sent = []

    async def run(db):
        monkeypatch.setattr(routes, 'get_db', lambda: db)
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(routes, 'require_admin', admin)
        monkeypatch.setattr(routes, '_sendgrid_email', lambda target, link: sent.append((target, link)))

        async def send_once():
            try:
                return await routes.send_verification_link(contact_user['user_id'], 'email', _request())
            except HTTPException as error:
                return error

        results = await asyncio.gather(send_once(), send_once())
        assert sum(isinstance(result, dict) and result.get('sent') for result in results) == 1
        assert sum(isinstance(result, HTTPException) and result.status_code == 429 for result in results) == 1
        assert len(sent) == 1
        assert await db.verification_links.count_documents({'user_id': contact_user['user_id']}) == 1
    run_db(contact_user['db_name'], run)


def test_phone_link_requires_sms_otp_to_verify(contact_user, monkeypatch):
    sent = []

    class Verifications:
        def create(self, **kwargs):
            sent.append(kwargs)

    class Checks:
        def create(self, **kwargs):
            return SimpleNamespace(status='approved')

    class Service:
        def __init__(self):
            self.verifications = Verifications()
            self.verification_checks = Checks()

    class Services:
        def __call__(self, _service_sid):
            return Service()

    class FakeClient:
        def __init__(self):
            self.messages = SimpleNamespace(create=lambda **kwargs: sent.append(kwargs))
            self.verify = SimpleNamespace(v2=SimpleNamespace(services=Services()))

    async def run(db):
        monkeypatch.setattr(routes, 'get_db', lambda: db)
        async def admin(_request):
            return {'user_id': 'admin-test', 'email': 'admin@example.test', 'role': 'admin'}
        monkeypatch.setattr(routes, 'require_admin', admin)
        monkeypatch.setattr(routes, 'twilio_verify_client', lambda: (FakeClient(), 'service-test'))
        monkeypatch.setenv('TWILIO_MESSAGING_SERVICE_SID', 'MG-test')
        result = await routes.send_verification_link(contact_user['user_id'], 'phone', _request())
        assert result['sent'] is True
        token = sent[0]['body'].split('token=', 1)[1].split(' ', 1)[0]
        link_page = await routes.verify_contact(token)
        assert 'enter the sms code' in link_page.body.decode().lower()
        user = await db.users.find_one({'user_id': contact_user['user_id']}, {'_id': 0})
        assert user['phone_verified'] is False
        await routes.send_mobile_code(token)
        result_page = await routes.verify_mobile_code(token, '123456')
        assert 'verified successfully' in result_page.body.decode().lower()
        user = await db.users.find_one({'user_id': contact_user['user_id']}, {'_id': 0})
        assert user['phone_verified'] is True
    run_db(contact_user['db_name'], run)