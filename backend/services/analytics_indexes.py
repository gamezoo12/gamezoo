"""Indexes for analytics, activity and bonus-grant collections (idempotent, additive only)."""
from __future__ import annotations

import logging

log = logging.getLogger('gz.analytics')

INDEX_SPECS = [
    ('acquisition_page_views', [('view_id', 1)], {'unique': True, 'partialFilterExpression': {'view_id': {'$type': 'string'}}}),
    ('acquisition_page_views', [('created_at', -1)], {}),
    ('acquisition_page_views', [('session_id', 1)], {'partialFilterExpression': {'session_id': {'$type': 'string'}}}),
    ('acquisition_page_views', [('page_key', 1), ('created_at', -1)], {}),
    ('acquisition_page_views', [('visitor_id', 1), ('created_at', -1)], {}),
    ('acquisition_sessions', [('session_id', 1)], {'unique': True}),
    ('acquisition_sessions', [('started_at', -1)], {}),
    ('acquisition_sessions', [('last_seen_at', -1)], {}),
    ('acquisition_sessions', [('visitor_id', 1), ('started_at', 1)], {}),
    ('acquisition_visits', [('created_at', -1)], {}),
    ('acquisition_visitors', [('visitor_id', 1)], {'unique': True}),
    ('acquisition_events', [('dedupe', 1)], {'unique': True}),
    ('acquisition_events', [('created_at', -1)], {}),
    ('acquisition_attributions', [('user_id', 1)], {'unique': True}),
    ('acquisition_attributions', [('user_created_at', -1)], {}),
    ('staff_activity_log', [('created_at', -1)], {}),
    ('staff_role_history', [('user_id', 1), ('started_at', 1)], {}),
    ('staff_role_history', [('transition_id', 1)], {'unique': True, 'partialFilterExpression': {'transition_id': {'$type': 'string'}}}),
    ('user_activity_days', [('user_id', 1), ('day', 1), ('kind', 1)], {'unique': True}),
    ('user_activity_days', [('day', 1)], {}),
    ('users', [('last_active_at', -1)], {'partialFilterExpression': {'last_active_at': {'$type': 'date'}}}),
    ('users', [('role', 1)], {}),
    ('users', [('is_test', 1)], {'partialFilterExpression': {'is_test': True}}),
    ('users', [('is_test_account', 1)], {'partialFilterExpression': {'is_test_account': True}}),
    ('world_level_attempts', [('created_at', 1), ('user_id', 1)], {}),
    ('world_level_attempts', [('completed_at', 1), ('user_id', 1)], {}),
    ('world_champion_sessions', [('begun_at', 1), ('user_id', 1)], {}),
    ('world_champion_sessions', [('submitted_at', 1), ('user_id', 1)], {}),
    ('special_challenge_attempts', [('started_at', 1), ('user_id', 1)], {}),
    ('special_challenge_attempts', [('completed_at', 1), ('user_id', 1)], {}),
    ('game_scores', [('created_at', 1), ('user_id', 1)], {}),
    ('world_contest_entries', [('entered_at', 1), ('user_id', 1)], {}),
    ('orders', [('created_at', 1), ('user_id', 1)], {}),
    ('wallet_tx', [('user_id', 1)], {}),
    ('bonus_grants', [('grant_id', 1)], {'unique': True}),
    ('bonus_grants', [('ref_key', 1)], {'unique': True}),
    ('bonus_grants', [('user_id', 1), ('status', 1), ('expires_at', 1)], {}),
    ('bonus_grants', [('status', 1), ('expires_at', 1)], {}),
    ('influencers', [('influencer_id', 1)], {'unique': True}),
    ('influencers', [('user_id', 1)], {'unique': True}),
    ('influencer_promos', [('code', 1)], {'unique': True}),
    ('influencer_commissions', [('event_key', 1)], {'unique': True}),
    ('influencer_commissions', [('influencer_id', 1), ('created_at', -1)], {}),
    ('influencer_commissions', [('payment_session_id', 1)], {}),
    ('influencer_visits', [('dedupe', 1)], {'unique': True}),
    ('influencer_visits', [('influencer_id', 1), ('created_at', -1)], {}),
    ('influencer_topup_events', [('session_id', 1)], {'unique': True}),
    ('influencer_topup_events', [('influencer_id', 1), ('created_at', -1)], {}),
    ('verification_links', [('token_hash', 1)], {'unique': True}),
    ('verification_links', [('user_id', 1), ('channel', 1), ('created_at', -1)], {}),
    ('influencer_commission_payments', [('commission_id', 1)], {'unique': True}),
    ('influencer_commission_payments', [('payment_reference', 1)], {'unique': True}),
    ('influencer_attributions', [('user_id', 1)], {'unique': True}),
    ('influencer_attributions', [('influencer_id', 1), ('created_at', -1)], {}),
    ('influencer_attributions', [('user_id', 1), ('created_at', -1)], {}),
        ('influencer_attributions', [('registration_eligible', 1), ('created_at', 1)], {}),
    ('influencer_invites', [('token_hash', 1)], {'unique': True}),
    ('influencer_invites', [('email', 1)], {'unique': True, 'partialFilterExpression': {'used': False}}),
    ('influencer_invites', [('expires_at', -1)], {}),
    ('influencer_invites', [('claimed_by_user_id', 1), ('used', 1)], {}),
    ('payment_transactions', [('user_id', 1), ('payment_status', 1), ('created_at', 1)], {}),
]


async def ensure_analytics_indexes(db) -> int:
    ok = 0
    for coll, keys, opts in INDEX_SPECS:
        try:
            await db[coll].create_index(keys, **opts)
            ok += 1
        except Exception as exc:  # one incompatible index must not block the rest
            log.warning('index skip %s%s: %s', coll, keys, str(exc)[:120])
    return ok
