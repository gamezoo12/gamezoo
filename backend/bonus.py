"""Bonus token grants — small helper module.

Business rule: every wallet top-up of ≥ BONUS_MIN_TOPUP tokens gives the user
BONUS_AMOUNT free tokens that expire after BONUS_EXPIRY_DAYS days. Grants live
in the `bonus_grants` collection; the bonus is credited to the wallet
immediately as a wallet_tx of kind='bonus'. Expiry is enforced lazily by
`sweep_expired_bonuses()` — call it before serving admin stats or a wallet
read that must be exact.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

BONUS_MIN_TOPUP = 10           # tokens; £10 minimum purchase to earn bonus
BONUS_AMOUNT = 5               # tokens rewarded
BONUS_EXPIRY_DAYS = 30         # 1 month


async def maybe_grant_bonus(db, user_id: str, tokens_purchased: int, ref_session_id: Optional[str] = None) -> Optional[dict]:
    """Called from the Stripe top-up credit path. If tokens ≥ threshold,
    inserts a bonus_grants row and returns the grant doc so the caller can
    credit the wallet in the SAME atomic write path (`_apply_tx` of kind bonus).
    Returns None when the top-up is below threshold.
    """
    if tokens_purchased < BONUS_MIN_TOPUP:
        return None
    now = datetime.now(timezone.utc)
    grant = {
        'grant_id': f'bg_{uuid.uuid4().hex[:12]}',
        'user_id': user_id,
        'amount': BONUS_AMOUNT,
        'granted_at': now,
        'expires_at': now + timedelta(days=BONUS_EXPIRY_DAYS),
        'status': 'active',           # active | expired | redeemed
        'ref_session_id': ref_session_id,
        'source': 'topup_bonus',
    }
    await db.bonus_grants.insert_one(grant)
    return grant


async def sweep_expired_bonuses(db) -> int:
    """Mark any active grants whose expires_at is in the past as expired.
    Returns the number of grants flipped. Idempotent — safe to call on every
    admin-stats read.
    """
    now = datetime.now(timezone.utc)
    r = await db.bonus_grants.update_many(
        {'status': 'active', 'expires_at': {'$lt': now}},
        {'$set': {'status': 'expired', 'expired_at': now}},
    )
    return r.modified_count


async def get_bonus_stats(db) -> dict:
    """Admin-only aggregate over the bonus_grants collection. Runs a sweep
    first so the numbers are always fresh."""
    await sweep_expired_bonuses(db)
    pipe = [
        {'$group': {
            '_id': '$status',
            'total_tokens': {'$sum': '$amount'},
            'count': {'$sum': 1},
        }},
    ]
    rows = {r['_id']: r async for r in db.bonus_grants.aggregate(pipe)}
    active = rows.get('active') or {'total_tokens': 0, 'count': 0}
    expired = rows.get('expired') or {'total_tokens': 0, 'count': 0}
    redeemed = rows.get('redeemed') or {'total_tokens': 0, 'count': 0}
    total_grants = await db.bonus_grants.estimated_document_count()
    total_users = len(await db.bonus_grants.distinct('user_id')) if total_grants else 0
    return {
        'active_tokens': active['total_tokens'],
        'active_grants': active['count'],
        'expired_tokens': expired['total_tokens'],
        'expired_grants': expired['count'],
        'redeemed_tokens': redeemed['total_tokens'],
        'redeemed_grants': redeemed['count'],
        'total_users_granted': total_users,
        'config': {
            'min_topup_tokens': BONUS_MIN_TOPUP,
            'bonus_amount_tokens': BONUS_AMOUNT,
            'expiry_days': BONUS_EXPIRY_DAYS,
        },
    }
