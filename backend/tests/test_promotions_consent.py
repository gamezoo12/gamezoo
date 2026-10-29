"""Promotions Consent API. Writes only to the isolated test database."""
from __future__ import annotations

import asyncio
import os
import uuid

import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import ValidationError

from deps import _mongo_url, _sanitize_db_name
from models import RegisterInput
from routers import consent_routes
from services.promo_consent import PROMO_KEYS, registration_fields
from services.push_delivery import send_web_push_to_user


def run_db(target, fn):
    async def run():
        client = AsyncIOMotorClient(target['url'])
        try:
            return await fn(client[target['name']])
        finally:
            client.close()
    return asyncio.run(run())


@pytest.fixture(scope='module')
def safe_db():
    name = os.environ.get('DB_NAME', '')
    if 'test' not in name.lower():
        pytest.skip('Integration test requires a DB_NAME containing "test"')
    return {'url': _mongo_url, 'name': _sanitize_db_name(name)}


@pytest.fixture
def user(safe_db):
    uid = 'promo_itest_' + uuid.uuid4().hex[:10]

    async def seed(db):
        await db.users.insert_one({'user_id': uid, 'email': f'{uid}@example.test', 'role': 'user', 'name': 'Promo Test',
                                   'phone_verified': True})
    run_db(safe_db, seed)
    yield uid

    async def cleanup(db):
        await db.users.delete_many({'user_id': uid})
        await db.audit_log.delete_many({'target_user_id': uid})
        await db.web_push_subscriptions.delete_many({'user_id': uid})
    run_db(safe_db, cleanup)


def _login_as(monkeypatch, uid, role='user', admin_id='promo-admin'):
    async def current(_request):
        return {'user_id': uid, 'role': 'user'}

    async def admin(_request):
        return {'user_id': admin_id, 'email': 'admin@example.test', 'role': role}
    monkeypatch.setattr(consent_routes, 'get_current_user', current)
    monkeypatch.setattr(consent_routes, 'require_admin', admin)


def _with_db(monkeypatch, db):
    import deps
    monkeypatch.setattr(deps, 'get_db', lambda: db)


def test_registration_defaults_are_off_and_only_ticked_options_are_recorded():
    base = dict(email='a@example.com', password='longenough1', name='A', email_otp_code='000000',
                phone='+447700900123', otp_code='000000', accept_terms=True, dob='1990-01-01')
    inp = RegisterInput(**base)
    assert not any([inp.sms_consent, inp.marketing_email_consent, inp.whatsapp_consent,
                    inp.newsletter_consent, inp.web_notifications_consent])
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    assert registration_fields({k: False for k in PROMO_KEYS}, now, 'registration') == {}
    ticked = registration_fields({'whatsapp': True, 'newsletter': True}, now, 'registration')
    assert ticked['whatsapp_consent'] is True and ticked['newsletter_consent'] is True
    assert 'sms_consent' not in ticked and 'marketing_email_consent' not in ticked


def test_user_saves_each_preference_independently_and_reload_matches(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user)
        first = await consent_routes.get_promotions_consent(None)
        assert first['preferences'] == {k: False for k in PROMO_KEYS}
        await consent_routes.save_promotions_consent(consent_routes.PromotionsConsentInput(whatsapp=True), None)
        await consent_routes.save_promotions_consent(consent_routes.PromotionsConsentInput(email=True, sms=True), None)
        await consent_routes.save_promotions_consent(consent_routes.PromotionsConsentInput(sms=False), None)
        again = await consent_routes.get_promotions_consent(None)
        assert again['preferences'] == {'sms': False, 'whatsapp': True, 'email': True,
                                        'web_notifications': False, 'newsletter': False}
        stored = await db.users.find_one({'user_id': user}, {'_id': 0})
        assert stored['sms_consent'] is False and stored['sms_opt_out'] is True
        assert stored['marketing_email_consent'] is True and stored['marketing_email_unsubscribed'] is False
        assert stored['whatsapp_consent_source'] == 'user'
        # Revoking is allowed at any time and does not disturb other choices.
        await consent_routes.save_promotions_consent(consent_routes.PromotionsConsentInput(whatsapp=False, newsletter=True), None)
        final = (await consent_routes.get_promotions_consent(None))['preferences']
        assert final['whatsapp'] is False and final['newsletter'] is True and final['email'] is True
    run_db(safe_db, run)


def test_save_rejects_empty_and_unknown_fields(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user)
        with pytest.raises(HTTPException) as empty:
            await consent_routes.save_promotions_consent(consent_routes.PromotionsConsentInput(), None)
        assert empty.value.status_code == 400
        with pytest.raises(ValidationError):
            consent_routes.PromotionsConsentInput(role='super_admin')
    run_db(safe_db, run)


def test_saving_promotions_does_not_touch_transactional_or_security_state(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user)
        await db.users.update_one({'user_id': user}, {'$set': {'web_push_enabled': True, 'phone_verified': True,
                                                               'email_verified': True}})
        await consent_routes.save_promotions_consent(
            consent_routes.PromotionsConsentInput(sms=False, email=False, web_notifications=False), None)
        stored = await db.users.find_one({'user_id': user}, {'_id': 0})
        assert stored['web_push_enabled'] is True and stored['phone_verified'] is True and stored['email_verified'] is True
    run_db(safe_db, run)


def test_admin_enabling_web_notifications_is_internal_only_until_user_subscribes(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user, role='admin')
        with pytest.raises(HTTPException) as no_reason:
            await consent_routes.admin_save_promotions_consent(
                user, consent_routes.AdminPromotionsConsentInput(web_notifications=True), None)
        assert no_reason.value.status_code == 400
        view = await consent_routes.admin_save_promotions_consent(
            user, consent_routes.AdminPromotionsConsentInput(web_notifications=True, reason='Customer asked by phone to enable'), None)
        assert view['preferences']['web_notifications'] is True
        assert view['sources']['web_notifications'] == 'admin'
        assert view['web_notifications_status'] == 'awaiting_user_permission'
        stored = await db.users.find_one({'user_id': user}, {'_id': 0})
        assert stored.get('web_push_enabled') is not True and stored['web_push_admin_pending'] is True
        assert stored.get('web_push_marketing_consent') is not True
        sent = await send_web_push_to_user(db, user, {'title': 'x'}, marketing=True)
        assert sent['status'] == 'skipped' and sent['delivered'] == 0
        audit = await db.audit_log.find_one({'kind': 'admin_promotions_consent_change', 'target_user_id': user})
        assert audit and audit['changes'] == {'web_notifications': True} and audit['before']['web_notifications'] is False
        # The user can revoke an admin-set preference.
        _login_as(monkeypatch, user)
        revoked = await consent_routes.save_promotions_consent(consent_routes.PromotionsConsentInput(web_notifications=False), None)
        assert revoked['preferences']['web_notifications'] is False and revoked['sources']['web_notifications'] == 'user'
    run_db(safe_db, run)


def test_admin_web_notifications_reports_browser_permission_denied(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user, role='super_admin')
        await db.users.update_one({'user_id': user}, {'$set': {'web_push_browser_permission': 'denied'}})
        view = await consent_routes.admin_save_promotions_consent(
            user, consent_routes.AdminPromotionsConsentInput(web_notifications=True, reason='Documented verbal request'), None)
        assert view['web_notifications_status'] == 'browser_permission_denied'
    run_db(safe_db, run)


def test_admin_roles_and_disable_without_reason(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user, role='support')
        with pytest.raises(HTTPException) as denied:
            await consent_routes.admin_get_promotions_consent(user, None)
        assert denied.value.status_code == 403
        _login_as(monkeypatch, user, role='admin')
        await consent_routes.admin_save_promotions_consent(
            user, consent_routes.AdminPromotionsConsentInput(sms=True, reason='Opt-in recorded on support call'), None)
        view = await consent_routes.admin_save_promotions_consent(user, consent_routes.AdminPromotionsConsentInput(sms=False), None)
        assert view['preferences']['sms'] is False
        with pytest.raises(HTTPException) as missing:
            await consent_routes.admin_get_promotions_consent('no_such_user', None)
        assert missing.value.status_code == 404
    run_db(safe_db, run)


def _push_as(monkeypatch, db, uid):
    from routers import push_routes
    async def current(_request):
        return {'user_id': uid, 'role': 'user'}
    monkeypatch.setattr(push_routes, 'get_current_user', current)
    monkeypatch.setattr(push_routes, 'get_db', lambda: db)
    monkeypatch.setattr(push_routes, 'public_vapid_config', lambda: {'available': True, 'public_key': 'k'})
    return push_routes


class _Req:
    headers = {'user-agent': 'pytest'}


def _subscription(push_routes):
    return push_routes.WebPushSubscriptionInput(
        endpoint='https://fcm.googleapis.com/fcm/send/' + uuid.uuid4().hex,
        keys=push_routes.WebPushKeys(p256dh='B' * 60, auth='a' * 22))


def test_admin_enable_without_subscription_then_user_allow_creates_consent(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user, role='super_admin')
        await consent_routes.admin_save_promotions_consent(
            user, consent_routes.AdminPromotionsConsentInput(web_notifications=True, reason='Customer asked by phone to enable'), None)
        push_routes = _push_as(monkeypatch, db, user)
        settings = await push_routes.get_push_settings(None)
        assert settings['prompt_required'] is True and settings['web_push_status'] == 'Pending Browser Permission'
        sent = await send_web_push_to_user(db, user, {'title': 'x'}, marketing=True)
        assert sent['delivered'] == 0
        await push_routes.register_web_subscription(_subscription(push_routes), _Req())
        stored = await db.users.find_one({'user_id': user}, {'_id': 0})
        assert stored['web_push_admin_pending'] is False and stored.get('web_push_marketing_consent') is not True
        assert (await push_routes.get_push_settings(None))['prompt_required'] is False
        still_blocked = await send_web_push_to_user(db, user, {'title': 'x'}, marketing=True)
        assert still_blocked['delivered'] == 0 and still_blocked['status'] == 'skipped'
        _login_as(monkeypatch, user)
        await consent_routes.save_promotions_consent(
            consent_routes.PromotionsConsentInput(web_notifications=True), None)
        allowed = await db.users.find_one({'user_id': user}, {'_id': 0})
        assert allowed['web_push_marketing_consent'] is True
        assert allowed['web_push_marketing_consent_source'] == 'user'
        # The user can revoke later.
        revoked = await consent_routes.save_promotions_consent(consent_routes.PromotionsConsentInput(web_notifications=False), None)
        assert revoked['preferences']['web_notifications'] is False
        await db.web_push_subscriptions.delete_many({'user_id': user})
    run_db(safe_db, run)


def test_blocking_the_browser_prompt_stops_further_prompting(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user, role='admin')
        await consent_routes.admin_save_promotions_consent(
            user, consent_routes.AdminPromotionsConsentInput(web_notifications=True, reason='Customer asked by phone to enable'), None)
        push_routes = _push_as(monkeypatch, db, user)
        await push_routes.update_push_preferences(push_routes.PushPreferencesInput(web_push_browser_permission='denied'), None)
        settings = await push_routes.get_push_settings(None)
        assert settings['prompt_required'] is False
        stored = await db.users.find_one({'user_id': user}, {'_id': 0})
        assert stored.get('web_push_marketing_consent') is not True
    run_db(safe_db, run)


def test_admin_disable_clears_pending_state(monkeypatch, safe_db, user):
    async def run(db):
        _with_db(monkeypatch, db)
        _login_as(monkeypatch, user, role='admin')
        await consent_routes.admin_save_promotions_consent(
            user, consent_routes.AdminPromotionsConsentInput(web_notifications=True, reason='Customer asked by phone to enable'), None)
        view = await consent_routes.admin_save_promotions_consent(
            user, consent_routes.AdminPromotionsConsentInput(web_notifications=False), None)
        assert view['preferences']['web_notifications'] is False
        assert (await db.users.find_one({'user_id': user}))['web_push_admin_pending'] is False
    run_db(safe_db, run)
