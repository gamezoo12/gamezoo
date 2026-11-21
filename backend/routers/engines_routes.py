"""
Prize League — Contest Engines 2 (Random Draw) and 3 (Instant Win).

Both engines are LOCKED behind Super-Admin feature flags stored in the
`settings.company` document:
  • random_draw_engine_enabled   — flip on only after legal review
  • instant_win_engine_enabled   — flip on only after legal review

The flags gate the operational endpoints. Building the code is safe; running
the engines against a live contest requires the flag to be true.

Storage collections:
  • contest_draws              — one document per random-draw execution
  • instant_win_configs        — one document per instant-win contest
  • instant_win_reveals        — one row per revealed ticket
"""
from __future__ import annotations
import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from cryptography.fernet import Fernet

from auth import require_admin

router = APIRouter(prefix='/api/admin/engines', tags=['contest-engines'])
public_router = APIRouter(prefix='/api/engines', tags=['contest-engines-public'])


def _fernet() -> Fernet:
    key = os.environ.get('INSTANT_WIN_KEY')
    if not key:
        raise HTTPException(500, 'INSTANT_WIN_KEY missing from server environment')
    return Fernet(key.encode())


async def _company_flags(db) -> dict:
    doc = await db.settings.find_one({'_id': 'company'}, {'_id': 0})
    return doc or {}


# =====================================================================
# ENGINE 2 — RANDOM DRAW (cryptographically secure winner selection)
# =====================================================================

class RandomDrawRequest(BaseModel):
    num_winners: int
    reason: Optional[str] = None            # required when redrawing
    approver_admin_email: Optional[str] = None  # dual approval for redraws


@router.post('/random-draw/{contest_id}')
async def execute_random_draw(contest_id: str, payload: RandomDrawRequest, request: Request):
    admin = await require_admin(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(403, 'Random draw execution requires Super Admin')
    raise HTTPException(403, 'Draws are run only from Production Panel > Draw Studio')

    from deps import get_db
    db = get_db()
    flags = await _company_flags(db)
    if not flags.get('random_draw_engine_enabled'):
        raise HTTPException(423, 'Random-draw engine is disabled. Enable in Company Settings after legal review.')

    contest = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0})
    if not contest:
        raise HTTPException(404, 'Contest not found')
    if contest.get('engine_type') != 'random_draw':
        raise HTTPException(400, "Contest engine_type must be 'random_draw'")

    # Redraw guard — a prior draw exists?
    prior = await db.contest_draws.find_one({'contest_id': contest_id})
    if prior:
        if not payload.reason:
            raise HTTPException(409, 'A draw already exists — a redraw requires a reason and dual approval.')
        if not payload.approver_admin_email:
            raise HTTPException(409, 'Redraw requires a second Super Admin approver_admin_email.')
        approver = await db.users.find_one({'email': payload.approver_admin_email, 'role': 'super_admin'})
        if not approver or approver['user_id'] == admin['user_id']:
            raise HTTPException(400, 'approver_admin_email must be a different Super Admin')

    # Build eligible pool: valid paid tickets, no fraud flag, no refund
    eligible_ids: list[int] = []
    async for t in db.tickets.find(
        {'contest_id': contest_id, 'refunded': {'$ne': True}, 'disqualified': {'$ne': True}},
        {'ticket_number': 1, '_id': 0},
    ):
        eligible_ids.append(int(t['ticket_number']))
    eligible_ids.sort()
    if len(eligible_ids) < payload.num_winners:
        raise HTTPException(400, f'Only {len(eligible_ids)} eligible tickets; cannot pick {payload.num_winners} winners')

    # Pool hash — commitment to the exact eligible pool at draw time
    pool_bytes = json.dumps(eligible_ids, separators=(',', ':')).encode()
    pool_hash = hashlib.sha256(pool_bytes).hexdigest()

    # Cryptographically secure random selection (secrets.SystemRandom)
    rng = secrets.SystemRandom()
    winners = sorted(rng.sample(eligible_ids, payload.num_winners))

    draw_id = f'draw_{uuid.uuid4().hex[:12]}'
    now = datetime.now(timezone.utc)
    doc = {
        'draw_id': draw_id,
        'contest_id': contest_id,
        'algorithm_version': 'secrets.SystemRandom.sample-v1',
        'pool_size': len(eligible_ids),
        'pool_hash_sha256': pool_hash,
        'num_winners_requested': payload.num_winners,
        'winning_ticket_numbers': winners,
        'operator_admin_email': admin['email'],
        'approver_admin_email': payload.approver_admin_email,
        'reason': payload.reason or ('Initial draw' if not prior else 'Redraw'),
        'executed_at': now,
        'is_redraw': bool(prior),
        'confirmed': False,           # requires Super Admin publish confirmation
        'confirmed_at': None,
        'published': False,
    }
    await db.contest_draws.insert_one(dict(doc))
    # Audit
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'contest_random_draw',
        'admin_email': admin['email'],
        'admin_user_id': admin['user_id'],
        'contest_id': contest_id,
        'draw_id': draw_id,
        'winners': winners,
        'pool_hash': pool_hash,
        'is_redraw': bool(prior),
        'at': now,
    })
    return {'ok': True, 'draw': {**{k: v for k, v in doc.items() if k != '_id'}, 'executed_at': doc['executed_at'].isoformat()}}


@router.post('/random-draw/{contest_id}/confirm/{draw_id}')
async def confirm_random_draw(contest_id: str, draw_id: str, request: Request):
    admin = await require_admin(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(403, 'Super Admin required to publish')
    raise HTTPException(403, 'Draws are run only from Production Panel > Draw Studio')
    from deps import get_db
    db = get_db()
    d = await db.contest_draws.find_one({'draw_id': draw_id, 'contest_id': contest_id})
    if not d:
        raise HTTPException(404, 'Draw not found')
    now = datetime.now(timezone.utc)
    await db.contest_draws.update_one(
        {'draw_id': draw_id},
        {'$set': {'confirmed': True, 'confirmed_at': now, 'confirmed_by': admin['email'], 'published': True}},
    )
    # Update the contest's winner_published flag + winning tickets
    await db.contests.update_one(
        {'contest_id': contest_id},
        {'$set': {
            'winner_published': True,
            'winning_ticket_numbers': d['winning_ticket_numbers'],
            'status': 'drawn',
        }},
    )
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'contest_random_draw_confirmed',
        'admin_email': admin['email'],
        'contest_id': contest_id,
        'draw_id': draw_id,
        'at': now,
    })
    return {'ok': True}


@router.get('/random-draw/{contest_id}')
async def list_draws(contest_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    rows = await get_db().contest_draws.find(
        {'contest_id': contest_id}, {'_id': 0},
    ).sort('executed_at', -1).to_list(50)
    return {'draws': rows}


@router.get('/random-draw/{contest_id}/report/{draw_id}')
async def download_draw_report(contest_id: str, draw_id: str, request: Request):
    await require_admin(request)
    from deps import get_db
    d = await get_db().contest_draws.find_one(
        {'draw_id': draw_id, 'contest_id': contest_id}, {'_id': 0},
    )
    if not d:
        raise HTTPException(404, 'Draw not found')
    # Downloadable JSON report
    body = json.dumps(d, indent=2, default=str)
    return JSONResponse(
        content=json.loads(body),
        headers={'Content-Disposition': f'attachment; filename="{draw_id}.json"'},
    )


# =====================================================================
# ENGINE 3 — INSTANT WIN (pre-committed encrypted ticket→prize map)
# =====================================================================

class InstantWinCommit(BaseModel):
    prizes: list[dict] = []  # [{ticket_number, rank, amount, bonus_amount, description}, ...]


def _instant_prize_tiers(contest: dict) -> list[dict]:
    tiers = contest.get('instant_prize_tiers') if isinstance(contest.get('instant_prize_tiers'), list) else []
    normalized = []
    for index, tier in enumerate(tiers):
        count = max(0, int(tier.get('count') or 0))
        amount = round(max(0.0, float(tier.get('amount') or 0)), 2)
        bonus = round(max(0.0, float(tier.get('bonus_amount') or 0)), 2)
        if count and (amount > 0 or bonus > 0):
            normalized.append({
                'count': count, 'amount': amount, 'bonus_amount': bonus,
                'description': str(tier.get('description') or f'Instant Win Tier {index + 1}').strip(),
            })
    if normalized:
        return normalized
    count = max(0, int(contest.get('instant_prize_count') or 0))
    amount = round(max(0.0, float(contest.get('instant_prize_amount') or 0)), 2)
    bonus = round(max(0.0, float(contest.get('instant_prize_bonus_amount') or 0)), 2)
    return [{'count': count, 'amount': amount, 'bonus_amount': bonus, 'description': 'Instant Win'}] if count and (amount > 0 or bonus > 0) else []


async def ensure_generated_instant_config(db, contest: dict, actor_email: str = 'system') -> dict:
    tiers = _instant_prize_tiers(contest)
    if not contest.get('instant_prize_enabled') or not tiers:
        return {}
    existing = await db.instant_win_configs.find_one({'contest_id': contest['contest_id']})
    if existing:
        return existing
    count = sum(int(tier['count']) for tier in tiers)
    total = int(contest.get('tickets_total') or 0)
    if count > total:
        raise HTTPException(400, f'Instant win count ({count}) exceeds total tickets ({total})')
    numbers = secrets.SystemRandom().sample(range(1, total + 1), count)
    prizes = []
    cursor = 0
    for tier_index, tier in enumerate(tiers):
        for slot in range(int(tier['count'])):
            prizes.append({
                'ticket_number': numbers[cursor],
                'rank': cursor + 1,
                'tier_index': tier_index,
                'amount': tier['amount'],
                'bonus_amount': tier['bonus_amount'],
                'description': tier['description'],
            })
            cursor += 1
    prizes.sort(key=lambda prize: prize['ticket_number'])
    if not any(p['amount'] > 0 or p['bonus_amount'] > 0 for p in prizes):
        raise HTTPException(400, 'Instant wins require a winning-token or winning-bonus-token amount')
    plain = json.dumps(prizes, separators=(',', ':')).encode()
    now = datetime.now(timezone.utc)
    doc = {
        'contest_id': contest['contest_id'],
        'config_hash_sha256': hashlib.sha256(plain).hexdigest(),
        'num_winning_tickets': count,
        'tier_summary': [{'description': tier['description'], 'count': tier['count'], 'amount': tier['amount'], 'bonus_amount': tier['bonus_amount']} for tier in tiers],
        'encrypted_map': _fernet().encrypt(plain).decode(),
        'committed_by': actor_email,
        'committed_at': now,
        'locked': True,
        'generated': True,
    }
    await db.instant_win_configs.insert_one(doc)
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}', 'kind': 'instant_win_generated',
        'admin_email': actor_email, 'contest_id': contest['contest_id'],
        'config_hash': doc['config_hash_sha256'], 'num_winning_tickets': count, 'at': now,
    })
    return doc


async def reveal_owned_instant_ticket(db, contest: dict, ticket: dict, user: dict) -> dict:
    cfg = await db.instant_win_configs.find_one({'contest_id': contest['contest_id']})
    if not cfg:
        raise HTTPException(404, 'Instant-win config not committed for this contest')
    ticket_number = int(ticket['ticket_number'])
    existing = await db.instant_win_reveals.find_one({'contest_id': contest['contest_id'], 'ticket_number': ticket_number})
    if existing:
        existing.pop('_id', None)
        return existing
    prizes = {int(p['ticket_number']): p for p in json.loads(_fernet().decrypt(cfg['encrypted_map'].encode()))}
    prize = prizes.get(ticket_number)
    now = datetime.now(timezone.utc)
    reveal = {
        'reveal_id': f'rev_{uuid.uuid4().hex[:12]}', 'contest_id': contest['contest_id'],
        'ticket_number': ticket_number, 'ticket_id': ticket.get('ticket_id'),
        'user_id': user['user_id'], 'user_name': user.get('name') or user.get('username') or 'Winner',
        'result': 'win' if prize else 'no_prize', 'prize': prize, 'revealed_at': now,
    }
    if prize:
        from routers.wallet_routes import _apply_tx_idempotent
        amount = round(float(prize.get('amount') or 0), 2)
        bonus = round(float(prize.get('bonus_amount') or 0), 2)
        if amount:
            await _apply_tx_idempotent(db, user['user_id'], 'paid_prize_cash', amount,
                note=f"Instant win: {contest.get('title')} ticket #{ticket_number}",
                ref_order_id=f"instant:{contest['contest_id']}:{ticket_number}:winnings")
        if bonus:
            await _apply_tx_idempotent(db, user['user_id'], 'paid_prize_bonus', bonus,
                note=f"Instant winning bonus: {contest.get('title')} ticket #{ticket_number}",
                ref_order_id=f"instant:{contest['contest_id']}:{ticket_number}:winning_bonus")
        await db.winners.update_one({'winner_id': f"iw_{contest['contest_id']}_{ticket_number}"}, {'$setOnInsert': {
            'winner_id': f"iw_{contest['contest_id']}_{ticket_number}", 'contest_id': contest['contest_id'],
            'ticket_number': ticket_number, 'user_id': user['user_id'], 'user_name': reveal['user_name'],
            'prize_amount': amount + bonus, 'prize_cash_amount': amount, 'prize_bonus_tokens': bonus,
            'reward_type': 'mixed' if amount and bonus else 'winning_bonus' if bonus else 'winnings',
            'prize_title': contest.get('title'), 'source': 'instant_win', 'published': True,
            'approval_status': 'credited', 'paid_out': True, 'payment_status': 'paid',
            'credited_at': now, 'drawn_at': now,
        }}, upsert=True)
    await db.instant_win_reveals.replace_one(
        {'contest_id': contest['contest_id'], 'ticket_number': ticket_number}, reveal, upsert=True)
    revealed = await db.instant_win_reveals.count_documents({'contest_id': contest['contest_id'], 'result': 'win'})
    if (contest.get('category') == 'instant' and contest.get('instant_close_when_revealed')
            and revealed >= int(cfg.get('num_winning_tickets') or 0)):
        await db.contests.update_one({'contest_id': contest['contest_id'], 'status': 'live'},
                                     {'$set': {'status': 'closed', 'closed_at': now, 'closed_reason': 'all_instant_prizes_revealed'}})
    return reveal


async def reveal_purchased_instant_tickets(db, contest: dict, tickets: list[dict], user: dict) -> list[dict]:
    if not contest.get('instant_prize_enabled') and contest.get('engine_type') != 'instant_win':
        return []
    if not await db.instant_win_configs.find_one({'contest_id': contest['contest_id']}):
        await ensure_generated_instant_config(db, contest)
    return [await reveal_owned_instant_ticket(db, contest, ticket, user) for ticket in tickets]


@router.post('/instant-win/{contest_id}/commit')
async def commit_instant_win(contest_id: str, payload: InstantWinCommit, request: Request):
    admin = await require_admin(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(403, 'Super Admin required for instant-win commit')
    from deps import get_db
    db = get_db()
    flags = await _company_flags(db)
    if not flags.get('instant_win_engine_enabled'):
        raise HTTPException(423, 'Instant-win engine is disabled. Enable in Company Settings after legal review.')

    contest = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0})
    if not contest:
        raise HTTPException(404, 'Contest not found')
    if contest.get('engine_type') != 'instant_win' and not contest.get('instant_prize_enabled'):
        raise HTTPException(400, 'Contest does not have instant-win prizes enabled')

    if not payload.prizes:
        return await ensure_generated_instant_config(db, contest, admin['email'])

    # Cannot commit if any tickets already sold
    tsold = await db.tickets.count_documents({'contest_id': contest_id})
    if tsold > 0:
        raise HTTPException(409, 'Cannot commit instant-win config: tickets already sold. Lock before sales open.')

    if await db.instant_win_configs.find_one({'contest_id': contest_id, 'locked': True}):
        raise HTTPException(409, 'Instant-win config already locked for this contest')

    # Encrypt the ticket→prize map
    plain = json.dumps(payload.prizes, separators=(',', ':')).encode()
    config_hash = hashlib.sha256(plain).hexdigest()
    encrypted = _fernet().encrypt(plain)

    now = datetime.now(timezone.utc)
    doc = {
        'contest_id': contest_id,
        'config_hash_sha256': config_hash,
        'num_winning_tickets': len(payload.prizes),
        'encrypted_map': encrypted.decode(),
        'committed_by': admin['email'],
        'committed_at': now,
        'locked': True,          # cannot mutate after commit
    }
    await db.instant_win_configs.replace_one(
        {'contest_id': contest_id}, doc, upsert=True,
    )
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'instant_win_committed',
        'admin_email': admin['email'],
        'contest_id': contest_id,
        'config_hash': config_hash,
        'num_winning_tickets': len(payload.prizes),
        'at': now,
    })
    return {'ok': True, 'config_hash': config_hash, 'num_winning_tickets': len(payload.prizes)}


@public_router.get('/instant-win/verify')
async def verify_committed_instant_win():
    """Public verification feed — lists every contest with a committed
    instant-win configuration (config_hash only, never the plain map).
    Anyone can consult this feed to prove the winners list was pre-committed."""
    from deps import get_db
    db = get_db()
    rows = await db.instant_win_configs.find({}, {'_id': 0, 'encrypted_map': 0}).sort('committed_at', -1).to_list(500)
    # Join contest title/slug
    contest_ids = [r['contest_id'] for r in rows]
    titles = {}
    if contest_ids:
        async for c in db.contests.find({'contest_id': {'$in': contest_ids}}, {'_id': 0, 'contest_id': 1, 'slug': 1, 'title': 1}):
            titles[c['contest_id']] = c
    return {'feed': [{**r, 'contest': titles.get(r['contest_id'])} for r in rows]}


@public_router.post('/instant-win/{contest_id}/reveal')
async def reveal_instant_win(contest_id: str, ticket_number: int, request: Request):
    """Called by the frontend AFTER a user completes the required skill task.
    Returns the prize (if any) allocated to their ticket.

    Backend responsibilities:
      • Verify contest is instant_win engine + skill completed by this user
      • Verify ticket belongs to this user
      • Decrypt the winning map, check ticket number, return result
      • Store an immutable reveal row (idempotent — same ticket returns same result)
    """
    user = None
    try:
        from auth import get_current_user
        user = await get_current_user(request)
    except Exception:
        pass
    if not user:
        raise HTTPException(401, 'Login required')
    from deps import get_db
    db = get_db()
    flags = await _company_flags(db)
    if not flags.get('instant_win_engine_enabled'):
        raise HTTPException(423, 'Instant-win engine is disabled.')

    contest = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0})
    if not contest or (contest.get('engine_type') != 'instant_win' and not contest.get('instant_prize_enabled')):
        raise HTTPException(400, 'Contest does not have instant-win prizes')

    # Ownership check
    ticket = await db.tickets.find_one({
        'contest_id': contest_id,
        'ticket_number': int(ticket_number),
        'user_id': user['user_id'],
    })
    if not ticket:
        raise HTTPException(404, 'Ticket does not belong to this user')

    # Skill contests reveal after official gameplay; random-ticket contests reveal after purchase.
    if (contest.get('entry_mode') or 'skill_game') == 'skill_game':
        played = await db.game_scores.find_one({
            'contest_id': contest_id,
            'user_id': user['user_id'],
            'ticket_number': int(ticket_number),
        })
        if not played:
            raise HTTPException(400, 'Skill task must be completed before revealing')

    result = await reveal_owned_instant_ticket(db, contest, ticket, user)
    return {'result': result.get('result'), 'prize': result.get('prize')}


@public_router.get('/instant-win/{contest_id}/status')
async def instant_win_status(contest_id: str):
    from deps import get_db
    db = get_db()
    contest = await db.contests.find_one({'contest_id': contest_id}, {'_id': 0})
    if not contest:
        raise HTTPException(404, 'Contest not found')
    cfg = await db.instant_win_configs.find_one({'contest_id': contest_id}, {'_id': 0, 'encrypted_map': 0})
    wins = await db.instant_win_reveals.find({'contest_id': contest_id, 'result': 'win'}, {'_id': 0, 'ticket_number': 1, 'user_name': 1, 'prize': 1, 'revealed_at': 1}).sort('revealed_at', -1).to_list(500)
    for win in wins:
        parts = [part for part in str(win.get('user_name') or 'Winner').replace('@', ' ').split() if part]
        win['user_name'] = parts[0] + (f' {parts[-1][0]}.' if len(parts) > 1 else '') if parts else 'Winner'
    total = int((cfg or {}).get('num_winning_tickets') or contest.get('instant_prize_count') or 0)
    revealed_value = sum(float(w.get('prize', {}).get('amount') or 0) + float(w.get('prize', {}).get('bonus_amount') or 0) for w in wins)
    tiers = _instant_prize_tiers(contest)
    total_value = sum(int(tier['count']) * (tier['amount'] + tier['bonus_amount']) for tier in tiers)
    return {'enabled': bool(contest.get('instant_prize_enabled') or contest.get('engine_type') == 'instant_win'),
            'total': total, 'won': len(wins), 'remaining': max(0, total - len(wins)),
            'won_value': round(revealed_value, 2), 'remaining_value': round(max(0, total_value - revealed_value), 2),
            'winners': wins}
