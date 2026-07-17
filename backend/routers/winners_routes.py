"""
Prize League — winner selection for random-ticket contests.
Admin-only endpoints with audit trail + lock after publish.

Flow:
  1. GET  /api/admin/winners/{contest_id}/eligible-tickets  → all paid tickets for that contest
  2. POST /api/admin/winners/{contest_id}/draw              → random-draw a winner (previews only, does not publish)
  3. POST /api/admin/winners/{contest_id}/manual            → manually select {ticket_number, reason} (previews only)
  4. POST /api/admin/winners/{contest_id}/publish           → publish + LOCK current preview; makes it public
  5. POST /api/admin/winners/{contest_id}/correct           → post-publish correction (requires reason, keeps audit)
  6. GET  /api/admin/winners/{contest_id}/audit             → full audit log for that contest
"""
from __future__ import annotations
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from auth import require_admin
from deps import get_db

winners_router = APIRouter(prefix='/api/admin/winners', tags=['winners'])


async def _log(db, contest_id: str, actor: dict, action: str, payload: dict):
    await db.winner_audit.insert_one({
        'contest_id': contest_id,
        'action': action,             # draw | manual | publish | correct | preview_clear
        'ticket_number': payload.get('ticket_number'),
        'winner_user_id': payload.get('winner_user_id'),
        'reason': payload.get('reason'),
        'method': payload.get('method'),
        'actor_id': actor.get('user_id'),
        'actor_email': actor.get('email'),
        'at': datetime.now(timezone.utc),
    })


async def _get_contest(db, contest_id: str) -> dict:
    c = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0})
    if not c:
        raise HTTPException(404, 'Contest not found')
    return c


@winners_router.get('/{contest_id}/eligible-tickets')
async def eligible_tickets(contest_id: str, request: Request):
    await require_admin(request)
    db = get_db()
    tickets = await db.tickets.find(
        {'contest_id': contest_id},
        {'_id': 0, 'ticket_number': 1, 'user_id': 1, 'order_id': 1, 'created_at': 1},
    ).sort('ticket_number', 1).to_list(10000)
    # Enrich with user email/name (single round trip)
    user_ids = list({t['user_id'] for t in tickets})
    users = {}
    if user_ids:
        async for u in db.users.find({'user_id': {'$in': user_ids}}, {'_id': 0, 'user_id': 1, 'email': 1, 'name': 1}):
            users[u['user_id']] = u
    for t in tickets:
        u = users.get(t['user_id'], {})
        t['user_email'] = u.get('email', '—')
        t['user_name'] = u.get('name', '—')
    return {'tickets': tickets, 'count': len(tickets)}


@winners_router.post('/{contest_id}/draw')
async def random_draw(contest_id: str, request: Request):
    """Cryptographically-secure random draw. Sets a PREVIEW winner only. Not yet published."""
    admin = await require_admin(request)
    db = get_db()
    c = await _get_contest(db, contest_id)
    if c.get('winner_published'):
        raise HTTPException(400, 'Winner is already published and locked. Use /correct with a reason instead.')

    tickets = await db.tickets.find({'contest_id': contest_id}, {'_id': 0, 'ticket_number': 1, 'user_id': 1}).to_list(10000)
    if not tickets:
        raise HTTPException(400, 'No eligible tickets to draw from')

    picked = tickets[secrets.randbelow(len(tickets))]
    preview = {
        'preview_winning_ticket_number': picked['ticket_number'],
        'preview_winner_user_id': picked['user_id'],
        'preview_method': 'random_draw',
        'preview_selected_at': datetime.now(timezone.utc),
        'preview_selected_by': admin.get('user_id'),
    }
    await db.contests.update_one({'contest_id': contest_id}, {'$set': preview})
    await _log(db, contest_id, admin, 'draw', {'ticket_number': picked['ticket_number'], 'winner_user_id': picked['user_id'], 'method': 'random_draw'})
    return {'ok': True, 'winner_ticket_number': picked['ticket_number'], 'winner_user_id': picked['user_id']}


@winners_router.post('/{contest_id}/manual')
async def manual_pick(contest_id: str, payload: dict, request: Request):
    admin = await require_admin(request)
    ticket_number = payload.get('ticket_number')
    reason = (payload.get('reason') or '').strip()
    if not ticket_number:
        raise HTTPException(400, 'ticket_number required')
    if len(reason) < 10:
        raise HTTPException(400, 'A reason of at least 10 characters is required for manual selection')

    db = get_db()
    c = await _get_contest(db, contest_id)
    if c.get('winner_published'):
        raise HTTPException(400, 'Winner is already published and locked. Use /correct instead.')

    t = await db.tickets.find_one({'contest_id': contest_id, 'ticket_number': int(ticket_number)}, {'_id': 0})
    if not t:
        raise HTTPException(404, f'Ticket #{ticket_number} not found among paid tickets for this contest')

    preview = {
        'preview_winning_ticket_number': int(ticket_number),
        'preview_winner_user_id': t['user_id'],
        'preview_method': 'manual',
        'preview_reason': reason,
        'preview_selected_at': datetime.now(timezone.utc),
        'preview_selected_by': admin.get('user_id'),
    }
    await db.contests.update_one({'contest_id': contest_id}, {'$set': preview})
    await _log(db, contest_id, admin, 'manual', {'ticket_number': int(ticket_number), 'winner_user_id': t['user_id'], 'reason': reason, 'method': 'manual'})
    return {'ok': True, 'winner_ticket_number': int(ticket_number), 'winner_user_id': t['user_id']}


@winners_router.post('/{contest_id}/publish')
async def publish_winner(contest_id: str, request: Request):
    admin = await require_admin(request)
    db = get_db()
    c = await _get_contest(db, contest_id)
    if c.get('winner_published'):
        raise HTTPException(400, 'Already published and locked')
    tn = c.get('preview_winning_ticket_number')
    if not tn:
        raise HTTPException(400, 'No previewed winner. Run /draw or /manual first.')

    await db.contests.update_one({'contest_id': contest_id}, {'$set': {
        'winning_ticket_number': int(tn),
        'winner_user_id': c.get('preview_winner_user_id'),
        'winner_method': c.get('preview_method'),
        'winner_reason': c.get('preview_reason'),
        'winner_published': True,
        'winner_published_at': datetime.now(timezone.utc),
        'winner_published_by': admin.get('user_id'),
        'status': 'drawn',
    }})
    await _log(db, contest_id, admin, 'publish', {'ticket_number': int(tn), 'winner_user_id': c.get('preview_winner_user_id'), 'method': c.get('preview_method')})

    # In-app notifications: winner gets a big win alert; every other paid participant gets a "not selected" note.
    from notifications import notify
    winner_uid = c.get('preview_winner_user_id')
    ticket_holders = await db.tickets.find(
        {'contest_id': contest_id, 'user_id': {'$exists': True}},
        {'_id': 0, 'user_id': 1}
    ).to_list(10000)
    unique_uids = {t['user_id'] for t in ticket_holders if t.get('user_id')}
    prize_amt = c.get('prize_amount', 0)
    for uid in unique_uids:
        if uid == winner_uid:
            await notify(db, user_id=uid, kind='winner_alert',
                         title=f'🏆 You won “{c.get("title", "the contest")}”!',
                         body=f'Ticket #{int(tn)} is the winning number. Prize £{prize_amt:.0f} — our team will be in touch to arrange payout.',
                         contest_id=contest_id)
        else:
            await notify(db, user_id=uid, kind='draw_result',
                         title=f'Draw published — “{c.get("title", "contest")}”',
                         body=f'Winning ticket: #{int(tn)}. See Draw Centre for full result.',
                         contest_id=contest_id)
    return {'ok': True, 'locked': True, 'notified_users': len(unique_uids)}


@winners_router.post('/{contest_id}/correct')
async def correct_winner(contest_id: str, payload: dict, request: Request):
    admin = await require_admin(request)
    ticket_number = payload.get('ticket_number')
    reason = (payload.get('reason') or '').strip()
    if not ticket_number:
        raise HTTPException(400, 'ticket_number required')
    if len(reason) < 20:
        raise HTTPException(400, 'Post-publish correction requires a reason of at least 20 characters')

    db = get_db()
    c = await _get_contest(db, contest_id)
    if not c.get('winner_published'):
        raise HTTPException(400, 'Winner not yet published — use /manual instead of /correct')

    t = await db.tickets.find_one({'contest_id': contest_id, 'ticket_number': int(ticket_number)}, {'_id': 0})
    if not t:
        raise HTTPException(404, 'Ticket not found')

    prev_tn = c.get('winning_ticket_number')
    prev_uid = c.get('winner_user_id')
    await db.contests.update_one({'contest_id': contest_id}, {'$set': {
        'winning_ticket_number': int(ticket_number),
        'winner_user_id': t['user_id'],
        'winner_correction_reason': reason,
        'winner_corrected_at': datetime.now(timezone.utc),
        'winner_corrected_by': admin.get('user_id'),
    }})
    await _log(db, contest_id, admin, 'correct', {
        'ticket_number': int(ticket_number), 'winner_user_id': t['user_id'],
        'reason': f'CORRECTION from ticket #{prev_tn} (user {prev_uid}) → ticket #{ticket_number}: {reason}',
        'method': 'correction',
    })
    return {'ok': True, 'previous_ticket_number': prev_tn, 'new_ticket_number': int(ticket_number)}


@winners_router.get('/{contest_id}/audit')
async def audit_log(contest_id: str, request: Request):
    await require_admin(request)
    db = get_db()
    logs = await db.winner_audit.find({'contest_id': contest_id}, {'_id': 0}).sort('at', -1).to_list(1000)
    return {'logs': logs, 'count': len(logs)}
