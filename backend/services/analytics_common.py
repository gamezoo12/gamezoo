"""Shared helpers for acquisition analytics, activity tracking and reports."""
from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from fastapi import HTTPException

# All reports are bucketed in the UK business timezone; timestamps are stored in UTC.
REPORT_TZ_NAME = 'Europe/London'
REPORT_TZ = ZoneInfo(REPORT_TZ_NAME)

# Server-verified roles whose activity is internal, never public traffic.
STAFF_ROLES = ('admin', 'super_admin', 'operator', 'support', 'influencer')

# Shared dashboard filter: 1h, 6h, 24h roll back from now; yesterday/7d/1m/1y use UK calendar days.
PERIOD_KEYS = ('1h', '6h', '24h', 'yesterday', '7d', '1m', '1y', 'all_time')
PERIOD_ALIASES = {'lifetime': 'all_time'}
RANGE_KEYS = (*PERIOD_KEYS, 'today', '30d', '6m', 'month', 'last_month', 'custom', 'lifetime')
ROLLING_HOURS = {'1h': 1, '6h': 6, '24h': 24}
ALL_TIME_START = datetime(2000, 1, 1, tzinfo=timezone.utc)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _local_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=REPORT_TZ).astimezone(timezone.utc)


def resolve_range(range_key: str = '7d', start: Optional[str] = None, end: Optional[str] = None,
                  now: Optional[datetime] = None) -> dict:
    """Return {start, end (UTC, end exclusive), label, timezone}. Days are UK calendar days."""
    now = now or utcnow()
    today = now.astimezone(REPORT_TZ).date()
    range_key = PERIOD_ALIASES.get(range_key, range_key)
    if range_key in ROLLING_HOURS:
        return {'start': now - timedelta(hours=ROLLING_HOURS[range_key]), 'end': now + timedelta(seconds=1),
                'label': f'last {ROLLING_HOURS[range_key]} hour(s) to {now.isoformat(timespec="minutes")}',
                'timezone': REPORT_TZ_NAME}
    if range_key == 'all_time':
        return {'start': ALL_TIME_START, 'end': now + timedelta(seconds=1), 'label': 'all time',
                'timezone': REPORT_TZ_NAME}
    if range_key in ('1m', '1y', '6m'):
        s, e = today - timedelta(days={'1m': 29, '1y': 364, '6m': 181}[range_key]), today + timedelta(days=1)
    elif range_key == 'today':
        s, e = today, today + timedelta(days=1)
    elif range_key == 'yesterday':
        s, e = today - timedelta(days=1), today
    elif range_key == '7d':
        s, e = today - timedelta(days=6), today + timedelta(days=1)
    elif range_key == '30d':
        s, e = today - timedelta(days=29), today + timedelta(days=1)
    elif range_key == 'month':
        s, e = today.replace(day=1), today + timedelta(days=1)
    elif range_key == 'last_month':
        first = today.replace(day=1)
        e = first
        s = (first - timedelta(days=1)).replace(day=1)
    elif range_key == 'custom':
        try:
            s = date.fromisoformat(start or '')
            last = date.fromisoformat(end or '')
        except ValueError:
            raise HTTPException(status_code=400, detail='Custom range needs start and end as YYYY-MM-DD')
        if last < s:
            raise HTTPException(status_code=400, detail='End date must not be before start date')
        if (last - s).days > 400:
            raise HTTPException(status_code=400, detail='Custom range is limited to 400 days')
        e = last + timedelta(days=1)
    else:
        raise HTTPException(status_code=400, detail=f'range must be one of {", ".join(RANGE_KEYS)}')
    return {
        'start': _local_midnight(s),
        'end': _local_midnight(e),
        'label': f'{s.isoformat()} to {(e - timedelta(days=1)).isoformat()}',
        'timezone': REPORT_TZ_NAME,
    }


# --------------------------------------------------------------------------- paths

# (regex, page_key, label). First match wins; paths are matched without query string.
_PAGE_RULES = [
    (r'^/(choose-world)?$', 'world_selection', 'World Selection'),
    (r'^/world$', 'free_world', 'Free World'),
    (r'^/free-world$', 'free_world_info', 'Free World (landing)'),
    (r'^/paid-leagues$', 'paid_world', 'Paid World'),
    (r'^/challenge$', 'special_challenges', 'Special / Impossible Challenges'),
    (r'^/competitions$', 'competitions', 'Competitions'),
    (r'^/competition/[^/]+$', 'competition_detail', 'Competition detail'),
    (r'^/leaderboard(/[^/]+)?$', 'leaderboards', 'Leaderboards'),
    (r'^/login$', 'login', 'Login'),
    (r'^/forgot-password$', 'login', 'Login'),
    (r'^/my-account/wallet$', 'wallet', 'Wallet'),
    (r'^/my-account(/.*)?$', 'my_account', 'My Account'),
    (r'^/cart$', 'cart', 'Cart'),
    (r'^/(games|play)(/.*)?$', 'gameplay_pages', 'Games'),
    (r'^/(winners|draw-results|draw-centre|results/[^/]+)$', 'results', 'Winners & draws'),
    (r'^/(how-it-works|faq|stories|refer|free-entry|verify)$', 'info_pages', 'Info pages'),
    (r'^/(legal/[^/]+|terms|privacy|website-terms|mobile-terms)$', 'legal', 'Legal'),
]
_COMPILED_RULES = [(re.compile(p), k, l) for p, k, l in _PAGE_RULES]
PAGE_LABELS = {k: l for _, k, l in _PAGE_RULES}
PAGE_LABELS['registration'] = 'Registration'
PAGE_LABELS['other'] = 'Other pages'


def normalise_path(raw: str) -> str:
    path = (raw or '/').split('?')[0].split('#')[0].strip() or '/'
    if not path.startswith('/'):
        path = '/' + path
    if len(path) > 1:
        path = path.rstrip('/')
    return path[:300]


def classify_page(path: str, variant: str = '') -> tuple:
    """Return (page_key, label). `variant='signup'` marks the registration form on /login."""
    p = normalise_path(path)
    if p == '/login' and variant == 'signup':
        return 'registration', PAGE_LABELS['registration']
    for rx, key, label in _COMPILED_RULES:
        if rx.match(p):
            return key, label
    return 'other', PAGE_LABELS['other']


def route_template(path: str) -> str:
    """Collapse ids/slugs so dynamic pages group into one route."""
    p = normalise_path(path)
    p = re.sub(r'^/competition/[^/]+$', '/competition/:slug', p)
    p = re.sub(r'^/leaderboard/[^/]+$', '/leaderboard/:contestId', p)
    p = re.sub(r'^/results/[^/]+$', '/results/:slug', p)
    p = re.sub(r'^/play/[^/]+/[^/]+$', '/play/:contestId/:ticketId', p)
    p = re.sub(r'^/games/[^/]+$', '/games/:gameId', p)
    p = re.sub(r'^/legal/[^/]+$', '/legal/:slug', p)
    return p


# --------------------------------------------------------------------------- sources

_HOST_SOURCES = [
    (('instagram.com', 'l.instagram.com'), 'instagram'),
    (('facebook.com', 'l.facebook.com', 'm.facebook.com', 'lm.facebook.com', 'fb.com', 'fb.me'), 'facebook'),
    (('twitter.com', 't.co', 'x.com'), 'x_twitter'),
    (('tiktok.com',), 'tiktok'),
    (('youtube.com', 'youtu.be', 'm.youtube.com'), 'youtube'),
    (('whatsapp.com', 'wa.me', 'api.whatsapp.com'), 'whatsapp'),
]
_UTM_ALIASES = {
    'instagram': 'instagram', 'ig': 'instagram',
    'facebook': 'facebook', 'fb': 'facebook', 'meta': 'facebook',
    'twitter': 'x_twitter', 'x': 'x_twitter', 'x_twitter': 'x_twitter',
    'tiktok': 'tiktok', 'youtube': 'youtube', 'yt': 'youtube',
    'whatsapp': 'whatsapp', 'wa': 'whatsapp',
}
_PAID_MEDIUMS = {'cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'display'}
SOURCE_LABELS = {
    'google_organic': 'Google organic search', 'google_ads': 'Google Ads',
    'instagram': 'Instagram', 'facebook': 'Facebook', 'x_twitter': 'X / Twitter',
    'tiktok': 'TikTok', 'youtube': 'YouTube', 'whatsapp': 'WhatsApp',
    'referral': 'Referral websites', 'direct': 'Direct', 'other': 'Other / unknown',
    'email': 'Email',
}


def host_of(url: str) -> str:
    try:
        netloc = urlparse(url or '').netloc.lower().split(':')[0]
    except Exception:
        return ''
    return netloc[4:] if netloc.startswith('www.') else netloc


def classify_traffic(utm_source: str = '', utm_medium: str = '', referrer_host: str = '',
                     own_hosts: Optional[set] = None, has_gclid: bool = False) -> dict:
    """Pick one source bucket. UTM wins over referrer; referrer wins over direct."""
    src = (utm_source or '').strip().lower()
    medium = (utm_medium or '').strip().lower()
    own = own_hosts or set()
    host = referrer_host if referrer_host and referrer_host not in own else ''

    key = None
    if has_gclid or (src == 'google' and medium in _PAID_MEDIUMS):
        key = 'google_ads'
    elif src in _UTM_ALIASES:
        key = _UTM_ALIASES[src]
    elif src == 'google':
        key = 'google_organic'
    elif src in ('email', 'newsletter'):
        key = 'email'
    elif src:
        key = 'other'
    elif host:
        key = None
        for hosts, name in _HOST_SOURCES:
            if host in hosts or any(host.endswith('.' + h) for h in hosts):
                key = name
                break
        if key is None:
            parts = host.split('.')
            if 'google' in parts:
                key = 'google_ads' if medium in _PAID_MEDIUMS else 'google_organic'
            else:
                key = 'referral'
    else:
        key = 'direct'
    return {
        'source_key': key,
        'source_label': SOURCE_LABELS.get(key, key),
        'medium': medium or ('organic' if key in ('google_organic',) else ('referral' if key == 'referral' else ('(none)' if key == 'direct' else 'social' if key in ('instagram', 'facebook', 'x_twitter', 'tiktok', 'youtube', 'whatsapp') else '(unknown)'))),
        'referrer_host': host,
    }


def device_of(user_agent: str) -> str:
    low = (user_agent or '').lower()
    if any(k in low for k in ('ipad', 'tablet', 'kindle', 'playbook')):
        return 'tablet'
    if any(k in low for k in ('mobi', 'iphone', 'android', 'ipod')):
        return 'mobile'
    return 'desktop' if low else 'unknown'


def visitor_state(user: Optional[dict]) -> str:
    if not user:
        return 'anonymous'
    return 'verified' if user.get('phone_verified') is True else 'registered'


def is_staff(user: Optional[dict]) -> bool:
    return bool(user) and user.get('role') in STAFF_ROLES


def is_test_account(user: Optional[dict]) -> bool:
    return bool(user) and bool(user.get('is_test') or user.get('is_test_account'))
