"""Shared logic for drawing a winner and notifying them."""
from __future__ import annotations
from datetime import datetime, timezone
import random
import uuid

from models import Winner


async def draw_contest(db, contest_id: str) -> dict:
    """
    Draw a winner for the given contest.

    - Only tickets stored in the DB are considered (checkout only creates tickets
      when the skill answer was correct, so this already satisfies the
      "correct-answer only" rule).
    - Creates a Winner document, marks the contest as `drawn`, creates an
      in-app notification for the lucky user.

    Returns a dict describing the result. Never raises on empty tickets — it
    just returns `{'ok': False, 'reason': ...}` so schedulers can keep running.
    """
    c = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0})
    if not c:
        return {'ok': False, 'reason': 'contest_not_found'}
    if c.get('status') == 'drawn':
        return {'ok': False, 'reason': 'already_drawn'}

    tickets = await db.tickets.find({'contest_id': contest_id}, {'_id': 0}).to_list(100000)
    if not tickets:
        # No entries -> just close the contest so it's not re-processed forever
        await db.contests.update_one(
            {'contest_id': contest_id},
            {'$set': {'status': 'closed_no_entries', 'closed_at': datetime.now(timezone.utc)}},
        )
        return {'ok': False, 'reason': 'no_tickets'}

    chosen = random.choice(tickets)
    user = await db.users.find_one(
        {'user_id': chosen['user_id']},
        {'_id': 0, 'password_hash': 0},
    )
    winner = Winner(
        contest_id=contest_id,
        user_id=chosen['user_id'],
        user_name=user['name'] if user else 'Anonymous',
        ticket_number=chosen['ticket_number'],
        prize_amount=c['prize_amount'],
        prize_title=c['title'],
    )
    await db.winners.insert_one(winner.model_dump())
    await db.contests.update_one(
        {'contest_id': contest_id},
        {'$set': {'status': 'drawn', 'drawn_at': datetime.now(timezone.utc)}},
    )

    # In-app notification for the winner
    await db.notifications.insert_one({
        'notification_id': f"n_{uuid.uuid4().hex[:12]}",
        'user_id': chosen['user_id'],
        'type': 'winner',
        'title': f"🎉 You won {c['title']}!",
        'body': (
            f"Congratulations! Your ticket #{chosen['ticket_number']} was drawn. "
            f"Prize £{c['prize_amount']}. Our team will contact you within 24h."
        ),
        'contest_id': contest_id,
        'winner_id': winner.winner_id,
        'read': False,
        'created_at': datetime.now(timezone.utc),
    })

    return {'ok': True, 'winner': winner.model_dump()}
