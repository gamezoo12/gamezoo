"""
Prize League — atomic sequential counters (Mongo).
Used to allocate PLxxxxx public User IDs and any other monotonic sequence
that must survive restarts and concurrent registrations.

Backing collection: `counters`
Document shape: { _id: <sequence_name>, seq: <int> }
"""
from __future__ import annotations
from typing import Optional


USER_PUBLIC_ID_SEQ = 'user_public_id'
USER_PUBLIC_ID_PREFIX = 'PL'
USER_PUBLIC_ID_START = 10000  # PL10000 reserved for the initial Super Admin


async def next_seq(db, name: str, start: int = 1) -> int:
    """Atomically increment and return the next value of a named sequence.
    Safe under concurrent registration. Initialises to `start` if unseen."""
    doc = await db.counters.find_one_and_update(
        {'_id': name},
        {'$inc': {'seq': 1}},
        upsert=True,
        return_document=True,  # AFTER
    )
    if not doc or doc.get('seq') is None:
        return start
    # First increment sets seq=1 → adjust so callers get `start` on very first call.
    return doc['seq'] + (start - 1)


async def allocate_user_public_id(db) -> str:
    """Return the next PLxxxxx public User ID atomically."""
    n = await next_seq(db, USER_PUBLIC_ID_SEQ, start=USER_PUBLIC_ID_START)
    return f"{USER_PUBLIC_ID_PREFIX}{n}"


async def peek_user_public_id(db) -> Optional[str]:
    """Read the current counter without incrementing. Returns None if unseen."""
    doc = await db.counters.find_one({'_id': USER_PUBLIC_ID_SEQ})
    if not doc:
        return None
    return f"{USER_PUBLIC_ID_PREFIX}{doc.get('seq', USER_PUBLIC_ID_START - 1)}"
