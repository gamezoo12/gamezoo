"""Shared pytest fixtures + a global backwards-compat patch that auto-injects
the new mandatory registration fields (phone, otp_code, accept_terms, dob) into
any legacy test that still posts the OLD /api/auth/register payload
{email, password, name, referral_code?}.

This exists so we don't have to hand-edit ~30 call sites across 8 legacy test
files. Any test posting to /api/auth/register with only the old fields will
have the missing ones added automatically, using the TEST_OTP_BYPASS_CODE.

Adding the fields explicitly in a test is fine — this shim only *adds* keys
that are missing.
"""
import os
import socket
import uuid
import inspect
import secrets
from urllib.parse import urlsplit
import requests
import pytest
from network_safety import install_loopback_only_network_guard

install_loopback_only_network_guard()

_LOCAL_HOSTS = {'localhost', '127.0.0.1', '::1'}
_TEST_BACKEND_URL = os.environ.get('TEST_BACKEND_URL', 'http://127.0.0.1:8002').rstrip('/')
_TEST_MONGO_URL = os.environ.get('TEST_MONGO_URL', 'mongodb://127.0.0.1:27017')
_TEST_DB_NAME = os.environ.get('TEST_DB_NAME', 'test_prizeleague')

if urlsplit(_TEST_BACKEND_URL).hostname not in _LOCAL_HOSTS:
    raise RuntimeError('TEST_BACKEND_URL must point to a loopback host')
if urlsplit(_TEST_MONGO_URL).hostname not in _LOCAL_HOSTS:
    raise RuntimeError('TEST_MONGO_URL must point to a loopback host')
if not _TEST_DB_NAME.startswith('test_'):
    raise RuntimeError('TEST_DB_NAME must start with test_')

os.environ['PYTHON_DOTENV_DISABLED'] = '1'
os.environ['REACT_APP_BACKEND_URL'] = _TEST_BACKEND_URL
os.environ['BACKEND_URL'] = _TEST_BACKEND_URL
os.environ['MONGO_URL'] = _TEST_MONGO_URL
os.environ['DB_NAME'] = _TEST_DB_NAME
os.environ['JWT_SECRET'] = os.environ.get('TEST_JWT_SECRET') or secrets.token_urlsafe(48)
os.environ.setdefault('TEST_OTP_BYPASS_CODE', '000000')
os.environ.setdefault('STRIPE_WEBHOOK_SECRET', 'whsec_pytest_only')
os.environ.setdefault('STRIPE_MODE', 'test')
os.environ.setdefault('STRIPE_SECRET_KEY', 'sk_test_pytest_only')
os.environ.setdefault('STRIPE_PUBLISHABLE_KEY', 'pk_test_pytest_only')


def _port_is_open(url):
    parsed = urlsplit(url)
    if parsed.hostname not in _LOCAL_HOSTS or not parsed.port:
        return False
    try:
        with socket.create_connection((parsed.hostname, parsed.port), timeout=0.2):
            return True
    except OSError:
        return False


_ISOLATED_BACKEND_AVAILABLE = (
    os.environ.get('TEST_BACKEND_ISOLATED') == '1'
    and _port_is_open(_TEST_BACKEND_URL)
    and _port_is_open(_TEST_MONGO_URL)
)
_LOCAL_MONGO_AVAILABLE = _port_is_open(_TEST_MONGO_URL)

_ORIG_POST = requests.Session.post
_ORIG_MODULE_POST = requests.post
_ORIG_REQUEST = requests.sessions.Session.request

_OTP_BYPASS = os.environ['TEST_OTP_BYPASS_CODE']


def _require_local_url(url):
    parsed = urlsplit(str(url))
    if parsed.hostname not in _LOCAL_HOSTS:
        raise RuntimeError('Tests may only make HTTP requests to loopback hosts')
    if parsed.port in {3000, 3001, 8001}:
        raise RuntimeError('Tests may not use shared preview ports; configure TEST_BACKEND_URL on a dedicated local test server')


def _local_only_request(self, method, url, *args, **kwargs):
    _require_local_url(url)
    return _ORIG_REQUEST(self, method, url, *args, **kwargs)


_SIGNUP_SUITES = ('test_auth_signup', 'test_phase2', 'test_phone_verification_gate')


def _is_signup_test_frame() -> bool:
    """Suites that assert on registration validation must send their own phone/OTP fields."""
    return any(any(name in (f.filename or '') for name in _SIGNUP_SUITES) for f in inspect.stack())


def _augment_register_payload(json_body):
    if not isinstance(json_body, dict):
        return json_body
    # Legacy signature has these but likely not the new ones.
    if 'email' in json_body and 'password' in json_body and 'name' in json_body:
        # Only patch if the caller hasn't already provided the new fields.
        if 'phone' not in json_body:
            # unique-ish +1555 number for each patched call to avoid collision.
            suffix = uuid.uuid4().hex[:7]  # hex → but we need digits only
            digits = ''.join(c for c in suffix if c.isdigit()).ljust(7, '0')[:7]
            json_body['phone'] = f'+1555{digits}'
        json_body.setdefault('otp_code', _OTP_BYPASS)
        json_body.setdefault('email_otp_code', _OTP_BYPASS)
        json_body.setdefault('accept_terms', True)
        json_body.setdefault('dob', '2000-08-02')
    return json_body


def _prepare_register_payload(json_body):
    body = dict(json_body) if isinstance(json_body, dict) else json_body
    if not isinstance(body, dict):
        return body
    if _is_signup_test_frame():
        # Signup suites send their own phone fields; the email code is the only mandatory field they predate.
        if 'email' in body and 'password' in body:
            body.setdefault('email_otp_code', _OTP_BYPASS)
        return body
    return _augment_register_payload(body)


def _patched_session_post(self, url, *args, **kwargs):
    if isinstance(url, str) and url.endswith('/api/auth/register') and 'json' in kwargs:
        kwargs['json'] = _prepare_register_payload(kwargs['json'])
    return _ORIG_POST(self, url, *args, **kwargs)


def _patched_module_post(url, *args, **kwargs):
    if isinstance(url, str) and url.endswith('/api/auth/register') and 'json' in kwargs:
        kwargs['json'] = _prepare_register_payload(kwargs['json'])
    return _ORIG_MODULE_POST(url, *args, **kwargs)


# Apply patches at import time (i.e., before any test module loads).
requests.sessions.Session.request = _local_only_request
requests.Session.request = _local_only_request
requests.Session.post = _patched_session_post
requests.post = _patched_module_post


def pytest_collection_modifyitems(items):
    stripe_live_cases = {
        'test_stripe_payments': {
            'test_checkout_all_four_packages',
            'test_status_endpoint_is_public',
            'test_paid_flow_credits_wallet_once_idempotent',
        },
        'test_iter33_token_topup': {
            'test_all_five_preset_packages_return_stripe_urls',
            'test_custom_topup_still_works_with_min_5',
        },
        'test_phase2b_captcha_wallet_attempts': {
            'test_custom_topup_happy_path',
            'test_legacy_topup_checkout_still_works',
        },
    }
    media_storage_cases = {
        'test_uploads': {
            'TestUploadsPositive::test_upload_jpg',
            'TestUploadsPositive::test_upload_png',
            'TestUploadsPositive::test_upload_webp',
            'TestContestImageIntegration::test_create_contest_with_uploaded_image',
            'TestContestImageIntegration::test_get_public_contests_shows_uploaded_image',
            'TestContestImageIntegration::test_get_single_contest_shows_uploaded_image',
        },
        'test_iter25_engines_user360_images': {'TestContestImageProcessor::test_01_upload_5_variants'},
    }
    llm_cases = {'test_meera_refactor': {'TestMeeraAdminCreateContests::test_admin_meera_create_contests'}}
    for item in items:
        module_name = item.module.__name__.rsplit('.', 1)[-1]
        qualified_name = f"{item.cls.__name__ if item.cls else ''}::{item.originalname}"
        if os.environ.get('TEST_LLM_SIMULATOR') != '1' and qualified_name in llm_cases.get(module_name, set()):
            item.add_marker(pytest.mark.skip(reason='Meera plans actions with an external LLM; no local simulator configured'))
        if os.environ.get('TEST_R2_SIMULATOR') != '1' and qualified_name in media_storage_cases.get(module_name, set()):
            item.add_marker(pytest.mark.skip(reason='No local R2 simulator configured; external media storage is unreachable in isolation'))
        if os.environ.get('TEST_STRIPE_SIMULATOR') != '1' and item.originalname in stripe_live_cases.get(module_name, set()):
            item.add_marker(pytest.mark.skip(reason='No local Stripe simulator configured; real Stripe calls are disabled'))
        if os.environ.get('ENABLE_MOCK_WALLET_TOPUP', '').lower() == 'true' and item.originalname == 'test_mock_wallet_topup_is_not_available':
            item.add_marker(pytest.mark.skip(reason='The isolated wallet suite explicitly enables the development mock top-up'))
        module_globals = vars(item.module)
        has_api_target = any(
            isinstance(value, str) and value.startswith(_TEST_BACKEND_URL)
            for value in module_globals.values()
        )
        has_mongo_client = any(
            name in module_globals
            for name in ('MongoClient', 'AsyncIOMotorClient', 'MONGO_URL')
        )
        if has_api_target and not _ISOLATED_BACKEND_AVAILABLE:
            item.add_marker(pytest.mark.skip(reason='Isolated local API+Mongo test services are unavailable'))
        elif has_mongo_client and not _LOCAL_MONGO_AVAILABLE:
            item.add_marker(pytest.mark.skip(reason='Local test MongoDB is unavailable'))
