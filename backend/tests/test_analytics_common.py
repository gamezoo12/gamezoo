"""Pure-function checks for traffic classification, page routing and report date ranges."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from services.analytics_common import (
    classify_page, classify_traffic, device_of, resolve_range, route_template, visitor_state,
)


@pytest.mark.parametrize('kwargs, expected', [
    (dict(referrer_host='l.instagram.com'), 'instagram'),
    (dict(utm_source='ig'), 'instagram'),
    (dict(referrer_host='l.facebook.com'), 'facebook'),
    (dict(referrer_host='t.co'), 'x_twitter'),
    (dict(utm_source='twitter'), 'x_twitter'),
    (dict(referrer_host='www.tiktok.com'), 'tiktok'),
    (dict(referrer_host='m.youtube.com'), 'youtube'),
    (dict(referrer_host='wa.me'), 'whatsapp'),
    (dict(referrer_host='google.co.uk'), 'google_organic'),
    (dict(utm_source='google', utm_medium='cpc'), 'google_ads'),
    (dict(has_gclid=True), 'google_ads'),
    (dict(referrer_host='someblog.example'), 'referral'),
    (dict(), 'direct'),
    (dict(utm_source='newsletterx'), 'other'),
    (dict(referrer_host='prizeleague.co.uk', own_hosts={'prizeleague.co.uk'}), 'direct'),
])
def test_traffic_classification(kwargs, expected):
    assert classify_traffic(**kwargs)['source_key'] == expected


@pytest.mark.parametrize('path, variant, key', [
    ('/', '', 'world_selection'), ('/choose-world', '', 'world_selection'), ('/world', '', 'free_world'),
    ('/paid-leagues', '', 'paid_world'), ('/challenge', '', 'special_challenges'),
    ('/competitions', '', 'competitions'), ('/competition/some-slug', '', 'competition_detail'),
    ('/leaderboard/abc', '', 'leaderboards'), ('/login', '', 'login'), ('/login', 'signup', 'registration'),
    ('/my-account/wallet', '', 'wallet'), ('/my-account/profile', '', 'my_account'), ('/nowhere', '', 'other'),
])
def test_page_classification(path, variant, key):
    assert classify_page(path, variant)[0] == key


def test_routes_are_grouped_and_query_ignored():
    assert route_template('/competition/abc?utm_source=x') == '/competition/:slug'
    assert route_template('/world/') == '/world'


def test_ranges_use_uk_days_and_utc_bounds():
    # 2026-07-01 is BST (UTC+1): UK midnight is 23:00 UTC the day before.
    now = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)
    r = resolve_range('today', now=now)
    assert r['start'] == datetime(2026, 6, 30, 23, 0, tzinfo=timezone.utc)
    assert r['end'] == datetime(2026, 7, 1, 23, 0, tzinfo=timezone.utc)
    assert resolve_range('yesterday', now=now)['end'] == r['start']
    assert (resolve_range('7d', now=now)['end'] - resolve_range('7d', now=now)['start']).days == 7
    assert resolve_range('month', now=now)['start'] == datetime(2026, 6, 30, 23, 0, tzinfo=timezone.utc)
    winter = resolve_range('today', now=datetime(2026, 12, 1, 12, 0, tzinfo=timezone.utc))
    assert winter['start'] == datetime(2026, 12, 1, 0, 0, tzinfo=timezone.utc)


def test_custom_range_validation():
    r = resolve_range('custom', '2026-10-01', '2026-10-03')
    assert (r['end'] - r['start']).days == 3 and r['timezone'] == 'Europe/London'
    for bad in (('custom', 'x', 'y'), ('custom', '2026-10-05', '2026-10-01'), ('nonsense', None, None)):
        with pytest.raises(HTTPException):
            resolve_range(*bad)


def test_visitor_state_and_device():
    assert visitor_state(None) == 'anonymous'
    assert visitor_state({'phone_verified': False}) == 'registered'
    assert visitor_state({'phone_verified': True}) == 'verified'
    assert device_of('Mozilla/5.0 (iPhone; CPU iPhone OS) Mobile') == 'mobile'
    assert device_of('Mozilla/5.0 (iPad)') == 'tablet'
    assert device_of('Mozilla/5.0 (X11; Linux x86_64)') == 'desktop'
