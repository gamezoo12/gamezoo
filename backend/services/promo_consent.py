"""Promotional consent: five independent preferences stored on the user document.

Transactional and security notifications are not governed by these flags.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

PROMO_KEYS = ('sms', 'whatsapp', 'email', 'web_notifications', 'newsletter')

# Public key -> user-document field that delivery code already reads.
FIELD = {
    'sms': 'sms_consent',
    'whatsapp': 'whatsapp_consent',
    'email': 'marketing_email_consent',
    'web_notifications': 'web_push_marketing_consent',
    'newsletter': 'newsletter_consent',
}
AT_FIELD = {
    'sms': 'sms_consent_at',
    'whatsapp': 'whatsapp_consent_at',
    'email': 'marketing_email_consent_at',
    'web_notifications': 'web_push_marketing_consent_at',
    'newsletter': 'newsletter_consent_at',
}
SOURCE_FIELD = {
    'sms': 'sms_consent_source',
    'whatsapp': 'whatsapp_consent_source',
    'email': 'marketing_email_consent_source',
    'web_notifications': 'web_push_marketing_consent_source',
    'newsletter': 'newsletter_consent_source',
}


def read_preferences(user: dict) -> dict:
    return {key: user.get(FIELD[key]) is True for key in PROMO_KEYS}


def read_sources(user: dict) -> dict:
    return {key: user.get(SOURCE_FIELD[key]) for key in PROMO_KEYS}


def build_updates(values: dict, now: datetime, source: str) -> dict:
    """Mongo $set document for the given {key: bool} subset; unknown keys are ignored."""
    updates: dict = {}
    for key in PROMO_KEYS:
        if key not in values or values[key] is None:
            continue
        granted = bool(values[key])
        updates[FIELD[key]] = granted
        updates[AT_FIELD[key]] = now
        updates[SOURCE_FIELD[key]] = source
        if key == 'sms':
            updates['sms_opt_out'] = not granted
        elif key == 'email':
            updates['email_marketing_opt_in'] = granted
            updates['marketing_email_unsubscribed'] = not granted
    return updates


def registration_fields(values: dict, now: datetime, source: str) -> dict:
    """Only recorded for options the user ticked; everything else stays at its default (off)."""
    return build_updates({k: True for k in PROMO_KEYS if values.get(k) is True}, now, source)


def preference_view(user: dict, *, device_count: int = 0) -> dict:
    return {
        'preferences': read_preferences(user),
        'sources': read_sources(user),
        'phone_verified': bool(user.get('phone_verified')),
        'web_push': {
            'enabled': user.get('web_push_enabled') is True,
            'browser_permission': user.get('web_push_browser_permission') or 'default',
            'device_count': device_count,
            'admin_pending': user.get('web_push_admin_pending') is True,
        },
    }


def admin_web_push_enable_updates(now: datetime, admin_email: Optional[str], reason: str) -> dict:
    """Internal preference only: never writes user consent or enables delivery; the user must allow it in the browser."""
    return {
        'web_push_admin_enabled': True,
        'web_push_admin_pending': True,
        'web_push_admin_enabled_at': now,
        'web_push_admin_enabled_by': admin_email,
        'web_push_admin_reason': reason,
    }


def web_delivery_ready(user: dict, device_count: int) -> Optional[str]:
    """Why Web Notifications would not currently deliver, or None when ready."""
    if user.get('web_push_browser_permission') == 'denied':
        return 'browser_permission_denied'
    if user.get('web_push_admin_enabled') is True:
        return 'awaiting_user_permission'
    if user.get('web_push_marketing_consent') is not True:
        return 'not_opted_in'
    if user.get('web_push_enabled') is not True or device_count < 1:
        return 'awaiting_user_subscription'
    return None


def admin_preference_view(user: dict, device_count: int) -> dict:
    """Admin view: an admin-enabled, not yet user-confirmed Web Notifications preference shows as on."""
    view = preference_view(user, device_count=device_count)
    if user.get('web_push_admin_pending') is True:
        view['preferences']['web_notifications'] = True
        view['sources']['web_notifications'] = 'admin'
    view['web_notifications_status'] = web_delivery_ready(user, device_count)
    return view
