from services.contest_lifecycle import is_expired
from bisect import bisect_right
import asyncio
import secrets
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone, timedelta

from auth import get_current_user, require_verified_user
from deps import get_db
from models import CheckoutInput, Order, Ticket
from routers.wallet_routes import _apply_tx, _get_or_create_wallet
from skill_challenge import verify_challenge
from pymongo import ReturnDocument
from pymongo.errors import BulkWriteError, DuplicateKeyError

router = APIRouter(prefix='/api/orders', tags=['orders'])


def _choose_random_ticket_numbers(total: int, occupied: set[int], quantity: int) -> list[int]:
    used = sorted(number for number in occupied if isinstance(number, int) and not isinstance(number, bool)
                  and 1 <= number <= total)
    available = total - len(used)
    if quantity < 0 or quantity > available:
        raise HTTPException(status_code=409, detail='Not enough unassigned ticket numbers are available for this contest.')
    ranks = secrets.SystemRandom().sample(range(available), quantity)
    selected = []
    for rank in ranks:
        left, right = 1, total
        while left < right:
            midpoint = (left + right) // 2
            if midpoint - bisect_right(used, midpoint) >= rank + 1:
                right = midpoint
            else:
                left = midpoint + 1
        selected.append(left)
    return selected


async def _lock_contest_ticket_allocation(db, contest_id: str, token: str) -> None:
    for _attempt in range(100):
        now = datetime.now(timezone.utc)
        try:
            lock = await db.paid_contest_ticket_locks.find_one_and_update(
                {'_id': contest_id, '$or': [{'expires_at': {'$lte': now}}, {'expires_at': {'$exists': False}}]},
                {'$set': {'token': token, 'expires_at': now + timedelta(minutes=5)}},
                upsert=True, return_document=ReturnDocument.AFTER,
            )
            if lock and lock.get('token') == token:
                return
        except DuplicateKeyError:
            pass
        await asyncio.sleep(0.05)
    raise HTTPException(status_code=409, detail='Ticket allocation is busy. Please try checkout again.')


def _validate_skill(c: dict, item) -> None:
    """Enforce the skill gate at purchase time.

    Three paths in priority order:
      1. Random-ticket contests (`entry_mode != 'skill_game'`) — no skill check.
      2. Dynamic engine (contest has `skill_question_type` set) — verify the
         signed challenge_token carried in the cart item.
      3. Legacy static question — string-match the user's answer against the
         stored `skill_question.answer`.
    """
    if c.get('entry_mode', 'skill_game') != 'skill_game' and not c.get('skill_question_type'):
        return
    if item.skill_clearance_token and item.skill_clearance_contest_id and item.skill_clearance_answer is not None:
        clearance = verify_challenge(
            item.skill_clearance_contest_id,
            item.skill_clearance_answer,
            item.skill_clearance_token,
        )
        if clearance['ok']:
            return
        raise HTTPException(status_code=400, detail=f"Skill verification expired for '{c['title']}'. Return to the contest page and answer again.")
    if c.get('skill_question_type'):
        r = verify_challenge(c['contest_id'], (item.skill_answer or '').strip(), item.challenge_token or '')
        if not r['ok']:
            raise HTTPException(status_code=400, detail=f"Skill check failed for '{c['title']}': {r.get('reason', 'incorrect')}. Return to the contest page and try a fresh question.")
        return
    sq = c.get('skill_question') or {}
    if (item.skill_answer or '').strip() != sq.get('answer'):
        raise HTTPException(status_code=400, detail=f'Incorrect skill answer for: {c["title"]}')


def _allocate_contest_token(order_items: list[dict], contest_by_id: dict, prior_usage: dict, cap_field: str) -> list[float]:
    usage_field = ('bonus_tokens_used' if cap_field == 'bonus_token_limit_per_user'
                   else 'winning_bonus_tokens_used')
    remaining = {}
    limits = []
    for item in order_items:
        contest_id = item['contest_id']
        cap = contest_by_id[contest_id].get(cap_field)
        if cap is None:
            limits.append(round(float(item['line_total']), 2))
            continue
        if contest_id not in remaining:
            remaining[contest_id] = max(0.0, round(float(cap) - float(prior_usage.get(contest_id, {}).get(usage_field, 0)), 2))
        allowance = min(round(float(item['line_total']), 2), remaining[contest_id])
        limits.append(allowance)
        remaining[contest_id] = round(remaining[contest_id] - allowance, 2)
    return limits


@router.post('/checkout')
async def checkout(inp: CheckoutInput, request: Request):
    user = await require_verified_user(request)
    from services.country_policy import require_country_permission as _ccheck
    from deps import get_db as _cdb
    await _ccheck(_cdb(), user, 'allow_paid_contests')
    if not inp.items:
        raise HTTPException(status_code=400, detail='Cart is empty')

    db = get_db()

    # Protect only against accidental rapid duplicate submissions.
    #
    # `basket_sig` identifies the basket contents and is used for the short
    # three-second duplicate window. `idempotency_sig` additionally contains
    # a three-second time bucket so the existing unique Mongo index still
    # prevents concurrent double submissions, while a genuine later purchase
    # of the same quantity in the same contest remains allowed.
    from hashlib import sha256

    basket_material = user['user_id'] + '|' + '|'.join(
        sorted(f"{i.contest_id}:{i.qty}" for i in inp.items)
    )
    basket_sig = sha256(basket_material.encode()).hexdigest()

    now = datetime.now(timezone.utc)
    recent = await db.orders.find_one({
        'user_id': user['user_id'],
        'basket_sig': basket_sig,
        'created_at': {'$gte': now - timedelta(seconds=3)},
    }, {'_id': 0, 'order_id': 1, 'total': 1})

    if recent:
        raise HTTPException(
            status_code=409,
            detail=f"Duplicate checkout detected. Existing order: {recent['order_id']}",
        )

    time_bucket = int(now.timestamp() // 3)
    sig = sha256(f"{basket_sig}|{time_bucket}".encode()).hexdigest()

    # Serialize checkouts for this user, including across browser tabs.
    # A unique Mongo _id provides an atomic lock; expired locks are recoverable.
    lock_id = f"paid_checkout:{user['user_id']}"
    lock_token = sig
    try:
        lock = await db.paid_checkout_locks.find_one_and_update(
            {'_id': lock_id, '$or': [
                {'expires_at': {'$lte': now}},
                {'expires_at': {'$exists': False}},
            ]},
            {'$set': {'token': lock_token, 'expires_at': now + timedelta(minutes=5)}},
            upsert=True, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail='Another checkout is processing. Please try again shortly.')
    if not lock or lock.get('token') != lock_token:
        raise HTTPException(status_code=409, detail='Another checkout is processing. Please try again shortly.')

    allocation_locks = []
    allocation_token = secrets.token_hex(16)
    try:
        order_items = []
        total = 0.0
        contest_by_id = {}

        # Pass 1: pure validation (skill answer, quantity, contest status). NO
        # writes yet. If any item fails here we haven't touched inventory so
        # nothing needs to be rolled back.
        for item in inp.items:
            c = await db.contests.find_one({'contest_id': item.contest_id}, {'_id': 0})
            if not c:
                raise HTTPException(status_code=404, detail=f'Contest not found: {item.contest_id}')
            if c.get('status') != 'live' or is_expired(c):
                raise HTTPException(status_code=400, detail=f'Contest closed: {c["title"]} has ended and is awaiting its draw')
            _validate_skill(c, item)
            if item.qty <= 0 or item.qty > 500:
                raise HTTPException(status_code=400, detail='Invalid quantity')

            limit = int(c.get('max_tickets_per_user') or 0)
            if limit > 0:
                already = await db.tickets.count_documents({
                    'contest_id': c['contest_id'], 'user_id': user['user_id'],
                })
                requested = sum(x.qty for x in inp.items if x.contest_id == c['contest_id'])
                if already + requested > limit:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Maximum {limit} tickets per user for {c['title']}. You already have {already}; you can buy {max(0, limit - already)} more.",
                    )

            # Preliminary capacity check — a real ATOMIC guard runs in pass 2.
            available = c['tickets_total'] - c.get('tickets_sold', 0)
            if item.qty > available:
                raise HTTPException(status_code=400, detail=f'Only {available} tickets left for {c["title"]}')

            line_total = item.qty * float(c['price'])
            total += line_total
            contest_by_id[c['contest_id']] = c
            order_items.append({
                'contest_id': c['contest_id'],
                'title': c['title'],
                'image': c['image'],
                'qty': item.qty,
                'price': float(c['price']),
                'line_total': line_total,
            })

        # Wallet balance check BEFORE mutating anything (cheap early rejection so
        # we don't burn ticket reservations for buyers who can't pay).
        wallet = await _get_or_create_wallet(db, user['user_id'])
        if wallet['balance'] < total:
            raise HTTPException(
                status_code=402,
                detail=f'Insufficient wallet balance. You have £{wallet["balance"]:.2f}, need £{total:.2f}. Top up your wallet to continue.',
            )

        capped_contests = [contest_id for contest_id, contest in contest_by_id.items()
                   if contest.get('bonus_token_limit_per_user') is not None
                   or contest.get('winning_bonus_token_limit_per_user') is not None]
        prior_usage = {}
        if capped_contests:
            rows = await db.orders.aggregate([
                {'$match': {'user_id': user['user_id'], 'status': 'paid', 'items.contest_id': {'$in': capped_contests}}},
                {'$unwind': '$items'},
                {'$match': {'items.contest_id': {'$in': capped_contests}}},
                {'$group': {'_id': '$items.contest_id',
                            'bonus_tokens_used': {'$sum': {'$ifNull': ['$items.bonus_tokens_used', 0]}},
                            'winning_bonus_tokens_used': {'$sum': {'$ifNull': ['$items.winning_bonus_tokens_used', 0]}}}},
            ]).to_list(None)
            prior_usage = {row['_id']: row for row in rows}
        bonus_allowances = _allocate_contest_token(order_items, contest_by_id, prior_usage, 'bonus_token_limit_per_user')
        winning_bonus_allowances = _allocate_contest_token(order_items, contest_by_id, prior_usage, 'winning_bonus_token_limit_per_user')
        bonus_limit = round(sum(bonus_allowances), 2) if any(contest_by_id[cid].get('bonus_token_limit_per_user') is not None for cid in capped_contests) else None
        winning_bonus_limit = round(sum(winning_bonus_allowances), 2) if any(contest_by_id[cid].get('winning_bonus_token_limit_per_user') is not None for cid in capped_contests) else None

        for contest_id in sorted(contest_by_id):
            await _lock_contest_ticket_allocation(db, contest_id, allocation_token)
            allocation_locks.append(contest_id)
        occupied_by_contest = {}
        for contest_id in contest_by_id:
            rows = await db.tickets.find({'contest_id': contest_id}, {'_id': 0, 'ticket_number': 1}).to_list(None)
            occupied_by_contest[contest_id] = {row['ticket_number'] for row in rows if isinstance(row.get('ticket_number'), int)}

        # Pass 2: ATOMIC ticket reservations. Each `$inc` is guarded by a filter
        # on `tickets_sold` so two buyers can't oversell the last N tickets. If
        # any reservation fails we roll back the earlier ones before responding.
        reserved: list[tuple[str, int]] = []  # (contest_id, base_before, qty)
        tickets_to_insert = []
        debit_applied = False  # tracks whether we already took the money — if so
                               # and a later step fails, we MUST refund it.
        order = Order(user_id=user['user_id'], items=order_items, total=total, status='paid', method='wallet')
        try:
            for item in inp.items:
                c = contest_by_id[item.contest_id]
                res = await db.contests.find_one_and_update(
                    {
                        'contest_id': c['contest_id'],
                        'status': 'live',
                        # Only reserve if there's still room. This is the atomic
                        # equivalent of the earlier `available >= qty` check.
                        '$expr': {'$lte': [{'$add': [{'$ifNull': ['$tickets_sold', 0]}, item.qty]}, '$tickets_total']},
                    },
                    {'$inc': {'tickets_sold': item.qty}},
                    projection={'_id': 0, 'tickets_sold': 1, 'tickets_total': 1},
                    return_document=False,  # BEFORE — we want the base index
                )
                if not res:
                    # Someone beat us to the last tickets between pass 1 and now.
                    raise HTTPException(status_code=409, detail=f'Tickets just sold out for {c["title"]}. Please refresh and try again.')
                reserved.append((c['contest_id'], res.get('tickets_sold', 0), item.qty))
                occupied = occupied_by_contest[c['contest_id']]
                numbers = _choose_random_ticket_numbers(int(res['tickets_total']), occupied, item.qty)
                occupied.update(numbers)
                for number in numbers:
                    ticket = Ticket(
                        order_id=order.order_id,
                        user_id=user['user_id'],
                        contest_id=c['contest_id'],
                        ticket_number=number,
                    ).model_dump()
                    ticket['_id'] = f"ticket-number:{c['contest_id']}:{number}"
                    tickets_to_insert.append(ticket)

            # Debit wallet ATOMICALLY (find_one_and_update with balance guard).
            # If insufficient (a race between check and here), this raises 400
            # and the outer except reverses ticket reservations. Once this line
            # returns without raising we own an unbalanced debit and MUST refund
            # it if any later step fails.
            debit = await _apply_tx(db, user['user_id'], 'spend', -total, note=f'Order {order.order_id}',
                                    ref_order_id=order.order_id, bonus_limit=bonus_limit,
                                    winning_bonus_limit=winning_bonus_limit)
            debit_applied = True

            bonus_remaining = round(abs(float(debit['tx'].get('bonus_amount') or 0)), 2)
            winning_bonus_remaining = round(abs(float(debit['tx'].get('winning_bonus_amount') or 0)), 2)
            for item, bonus_allowance, winning_bonus_allowance in zip(order.items, bonus_allowances, winning_bonus_allowances):
                bonus_used = min(bonus_allowance, bonus_remaining)
                winning_bonus_used = min(winning_bonus_allowance, winning_bonus_remaining)
                item['bonus_tokens_used'] = bonus_used
                item['winning_bonus_tokens_used'] = winning_bonus_used
                bonus_remaining = round(bonus_remaining - bonus_used, 2)
                winning_bonus_remaining = round(winning_bonus_remaining - winning_bonus_used, 2)

            order_doc = order.model_dump()
            order_doc['basket_sig'] = basket_sig
            order_doc['idempotency_sig'] = sig
            try:
                await db.orders.insert_one(order_doc)
            except Exception as _ins_err:
                # Duplicate key from the unique (user_id, idempotency_sig) index:
                # a concurrent double-submit beat us to the insert. Convert to
                # a friendly 409 so the compensating refund path fires cleanly.
                if 'duplicate key' in str(_ins_err).lower() or 'E11000' in str(_ins_err):
                    raise HTTPException(status_code=409, detail='Duplicate checkout detected — the other tab already completed this purchase.')
                raise
            if tickets_to_insert:
                try:
                    await db.tickets.insert_many(tickets_to_insert)
                except (DuplicateKeyError, BulkWriteError):
                    raise HTTPException(status_code=409, detail='Ticket allocation changed during checkout. Please try again.')

            from routers.engines_routes import reveal_purchased_instant_tickets
            for contest_id, contest in contest_by_id.items():
                bought = [ticket for ticket in tickets_to_insert if ticket['contest_id'] == contest_id]
                await reveal_purchased_instant_tickets(db, contest, bought, user)
        except HTTPException:
            await db.tickets.delete_many({'order_id': order.order_id})
            # Roll back any reservations we already made this request.
            for contest_id, _base, qty in reserved:
                await db.contests.update_one({'contest_id': contest_id}, {'$inc': {'tickets_sold': -qty}})
            # Compensating refund: if we already debited the wallet but a later
            # step (order/ticket insert) blew up, credit the money back so the
            # buyer isn't out of pocket for a purchase they didn't get.
            if debit_applied:
                try:
                    await _apply_tx(
                        db, user['user_id'], 'refund', total,
                        note=f'Auto-refund: checkout failed after wallet debit (order {order.order_id})',
                        ref_order_id=order.order_id,
                    )
                    await db.orders.update_one({'order_id': order.order_id}, {'$set': {'status': 'refunded'}})
                except Exception:
                    import logging as _lg
                    _lg.exception('CRITICAL: failed to auto-refund debited wallet after checkout error user=%s order=%s amount=%.2f', user['user_id'], order.order_id, total)
            raise
        except Exception:
            await db.tickets.delete_many({'order_id': order.order_id})
            for contest_id, _base, qty in reserved:
                await db.contests.update_one({'contest_id': contest_id}, {'$inc': {'tickets_sold': -qty}})
            if debit_applied:
                try:
                    await _apply_tx(
                        db, user['user_id'], 'refund', total,
                        note=f'Auto-refund: checkout failed after wallet debit (order {order.order_id})',
                        ref_order_id=order.order_id,
                    )
                    await db.orders.update_one({'order_id': order.order_id}, {'$set': {'status': 'refunded'}})
                except Exception:
                    import logging as _lg
                    _lg.exception('CRITICAL: failed to auto-refund debited wallet after checkout error user=%s order=%s amount=%.2f', user['user_id'], order.order_id, total)
            raise

        # In-app notification per contest so users see the winning tickets grouped.
        from notifications import notify
        for item in inp.items:
            c = contest_by_id.get(item.contest_id, {})
            entry_mode = c.get('entry_mode', 'skill_game')
            title = 'Tickets confirmed 🎟️'
            if entry_mode == 'random_tickets':
                body = f"{item.qty} ticket{'s' if item.qty != 1 else ''} in “{c.get('title', 'contest')}”. Your numbers are ready in My Tickets."
            else:
                body = f"{item.qty} ticket{'s' if item.qty != 1 else ''} in “{c.get('title', 'contest')}”. Head to My Games to play."
            await notify(
                db,
                user_id=user['user_id'],
                kind='purchase_success',
                title=title,
                body=body,
                contest_id=item.contest_id,
                ref_order_id=order.order_id,
            )

        # Referral qualification runs only AFTER the order, wallet debit and
        # ticket creation have successfully completed.
        try:
            from routers.referral_routes import record_contest_entry

            await record_contest_entry(
                db,
                user['user_id'],
                order.order_id,
            )
        except Exception:
            # Referral processing must never turn a successful paid contest
            # entry into a failed checkout.
            import logging
            logging.exception(
                'Referral contest-entry qualification failed user=%s order=%s',
                user.get('user_id'),
                order.order_id,
            )

        # Return the first ticket_id + slug of the first item's contest so the
        # frontend can offer "Play now" straight after checkout without an extra
        # round-trip (see Cart.jsx post-checkout flow).
        first_ticket_id = tickets_to_insert[0]['ticket_id'] if tickets_to_insert else None
        first_contest_id = tickets_to_insert[0]['contest_id'] if tickets_to_insert else None
        first_slug = None
        first_game_type = None
        if first_contest_id:
            _c = contest_by_id.get(first_contest_id) or {}
            first_slug = _c.get('slug')
            first_game_type = _c.get('game_type')
        return {
            'order_id': order.order_id,
            'total': total,
            'tickets': len(tickets_to_insert),
            'method': 'wallet',
            'first_ticket_id': first_ticket_id,
            'first_contest_id': first_contest_id,
            'first_contest_slug': first_slug,
            'first_game_type': first_game_type,
        }

    finally:
        for contest_id in allocation_locks:
            await db.paid_contest_ticket_locks.delete_one({'_id': contest_id, 'token': allocation_token})
        await db.paid_checkout_locks.delete_one({'_id': lock_id, 'token': lock_token})

@router.get('/mine')
async def my_orders(request: Request, limit: int = 50):
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    limit = max(1, min(limit, 200))  # cap so a rogue client can't ask for millions
    orders = await db.orders.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(limit)
    return orders


@router.get('/my-joined-contest-ids')
async def my_joined_contest_ids(request: Request):
    """Distinct contest_ids the current user holds a ticket for.
    Used by the client to render a "Joined" badge on contest tiles."""
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    contest_ids = await db.tickets.distinct('contest_id', {'user_id': user['user_id']})
    return {'contest_ids': contest_ids}



@router.get('/my-tickets')
async def my_tickets(request: Request, limit: int = 200):
    """Return the user's tickets ENRICHED with contest title/image/slug/game_type
    so the dashboard can render a proper card (title, thumbnail, Play CTA)
    without additional round-trips per ticket.
    """
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()
    limit = max(1, min(limit, 1000))
    tickets = await db.tickets.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(limit)
    if not tickets:
        return tickets
    contest_ids = list({t['contest_id'] for t in tickets})
    contest_map = {}
    async for c in db.contests.find(
        {'contest_id': {'$in': contest_ids}},
        {'_id': 0, 'contest_id': 1, 'title': 1, 'slug': 1, 'image': 1, 'hero_image': 1, 'game_type': 1, 'entry_mode': 1, 'status': 1, 'end_time': 1, 'prize_title': 1}
    ):
        contest_map[c['contest_id']] = c
    for t in tickets:
        c = contest_map.get(t['contest_id']) or {}
        t['contest'] = {
            'contest_id': t['contest_id'],
            'title': c.get('title'),
            'slug': c.get('slug'),
            # Contest documents can carry either `image` or `hero_image` depending on
            # when the record was created — accept both.
            'image': c.get('image') or c.get('hero_image'),
            'game_type': c.get('game_type'),
            'entry_mode': c.get('entry_mode') or 'skill_game',
            'status': c.get('status'),
            'end_time': c.get('end_time'),
            'prize_title': c.get('prize_title'),
        }
    return tickets


@router.get('/my-games')
async def my_games(request: Request):
    """Skill-game tickets that the player can still play.
    Returns one row per ticket with contest + attempts + best-score info so the
    dashboard can show Play / Continue / Expired buttons without extra round-trips.
    """
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()

    # Only skill-game tickets (contest has game_type set OR entry_mode='skill_game')
    tickets = await db.tickets.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    if not tickets:
        return {'games': []}

    contest_ids = list({t['contest_id'] for t in tickets})
    contests = {}
    async for c in db.contests.find({'contest_id': {'$in': contest_ids}}, {'_id': 0}):
        if c.get('game_type') and (c.get('entry_mode', 'skill_game') == 'skill_game'):
            contests[c['contest_id']] = c
    if not contests:
        return {'games': []}

    now = datetime.now(timezone.utc)

    # Bulk-fetch usage stats to avoid N+1: previously this endpoint fired one
    # `count_documents` + one `find` per ticket, meaning a user with 50
    # tickets across 10 contests would hit the DB 100+ times.
    ticket_ids = [t['ticket_id'] for t in tickets]
    attempts_by_ticket: dict[str, list] = {}
    if ticket_ids:
        # One find that returns every score row for every ticket the user owns;
        # we sort in Python (attempts_by_ticket lists are small, typically ≤10).
        async for row in db.game_scores.find(
            {'ticket_id': {'$in': ticket_ids}},
            {'_id': 0, 'ticket_id': 1, 'points': 1, 'completed_at': 1},
        ):
            attempts_by_ticket.setdefault(row['ticket_id'], []).append(row)
        for lst in attempts_by_ticket.values():
            lst.sort(key=lambda r: r.get('points') or 0, reverse=True)

    out = []
    for t in tickets:
        c = contests.get(t['contest_id'])
        if not c:
            continue
        apt = int(c.get('attempts_per_ticket') or c.get('max_attempts') or 3)
        apt = max(1, min(apt, 10))
        tickets_owned = sum(1 for t2 in tickets if t2['contest_id'] == c['contest_id'])

        # Every purchased ticket is an independent leaderboard entry and gets
        # its own attempts_per_ticket allowance.
        total_allowed = apt
        attempts = attempts_by_ticket.get(t['ticket_id'], [])
        used = len(attempts)
        best = attempts[0] if attempts else None

        end_raw = c.get('end_date')
        expired = False
        try:
            if end_raw:
                end_dt = datetime.fromisoformat(str(end_raw).replace('Z', '+00:00'))
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=timezone.utc)
                expired = now > end_dt
        except (ValueError, TypeError):
            pass

        status = 'expired' if expired else ('completed' if used >= total_allowed else ('in_progress' if used > 0 else 'ready'))
        out.append({
            'ticket_id': t['ticket_id'],
            'contest_id': c['contest_id'],
            'contest_slug': c.get('slug') or c['contest_id'],
            'contest_title': c.get('title'),
            'contest_image': c.get('image'),
            'game_type': c.get('game_type'),
            'end_date': c.get('end_date'),
            'attempts_used': used,
            'attempts_remaining': max(0, total_allowed - used),
            'max_attempts': total_allowed,  # legacy key; now per-ticket
            'attempts_per_ticket': apt,
            'tickets_owned': tickets_owned,
            'best_points': best.get('points') if best else None,
            'last_attempt_at': attempts[0].get('completed_at') if attempts else None,
            'status': status,
        })
    # ready first, then in_progress, then completed, then expired
    order = {'ready': 0, 'in_progress': 1, 'completed': 2, 'expired': 3}
    out.sort(key=lambda x: (order.get(x['status'], 9), x.get('end_date') or ''))
    return {'games': out}
