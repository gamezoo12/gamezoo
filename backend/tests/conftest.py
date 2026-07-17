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
import uuid
import requests

_ORIG_POST = requests.Session.post
_ORIG_MODULE_POST = requests.post

_OTP_BYPASS = os.environ.get('TEST_OTP_BYPASS_CODE', '000000')


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
        json_body.setdefault('accept_terms', True)
        json_body.setdefault('dob', '2000-08-02')
    return json_body


def _patched_session_post(self, url, *args, **kwargs):
    if isinstance(url, str) and url.endswith('/api/auth/register') and 'json' in kwargs:
        kwargs['json'] = _augment_register_payload(dict(kwargs['json']))
    return _ORIG_POST(self, url, *args, **kwargs)


def _patched_module_post(url, *args, **kwargs):
    if isinstance(url, str) and url.endswith('/api/auth/register') and 'json' in kwargs:
        kwargs['json'] = _augment_register_payload(dict(kwargs['json']))
    return _ORIG_MODULE_POST(url, *args, **kwargs)


# Apply patches at import time (i.e., before any test module loads).
requests.Session.post = _patched_session_post
requests.post = _patched_module_post
