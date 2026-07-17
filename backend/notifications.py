"""Central helper for creating in-app notifications from anywhere in the
backend.  All notifications land in the `notifications` collection and are
served by /api/users/notifications (existing).
"""
import uuid
from datetime import datetime, timezone
from typing import Optional


async def notify(db, *,
                 user_id: str,
                 kind: str,
                 title: str,
                 body: str,
                 contest_id: Optional[str] = None,
                 ref_order_id: Optional[str] = None,
                 ref_tx_id: Optional[str] = None,
                 ref_ticket_id: Optional[str] = None) -> None:
    """Insert a notification doc. Idempotency is NOT enforced here — callers
    should only invoke on the state-transition event (e.g. first-time payment
    confirmation)."""
    doc = {
        'notification_id': f'n_{uuid.uuid4().hex[:16]}',
        'user_id': user_id,
        'type': kind,  # keep legacy key name used by frontend
        'kind': kind,
        'title': title,
        'body': body,
        'read': False,
        'created_at': datetime.now(timezone.utc),
    }
    if contest_id:      doc['contest_id'] = contest_id
    if ref_order_id:    doc['ref_order_id'] = ref_order_id
    if ref_tx_id:       doc['ref_tx_id'] = ref_tx_id
    if ref_ticket_id:   doc['ref_ticket_id'] = ref_ticket_id
    await db.notifications.insert_one(doc)
