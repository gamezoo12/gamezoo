"""Per-grant bonus tokens with expiry.

Design rules
- The wallet (`wallets`) and ledger (`wallet_tx`) stay authoritative. `wallet.bonus` is the total of ALL
  bonus tokens: untracked legacy bonus (never expires) + the unspent part of active grants.
- Each admin bonus credit is its own `bonus_grants` document with its own expiry.
- Expiry/revocation removes only the grant's unspent remainder from `bonus` and `balance`, never from
  purchased tokens or winnings, and is capped by the live `bonus` counter.
- Every wallet change carries a unique marker in `applied_tx_refs`, and every ledger row has a
  deterministic id, so repeated or concurrent runs cannot deduct twice.
- Spending reserves from grants BEFORE the wallet debit; a crash in between can only leave a grant with
  less remaining than it should (the safe direction: its expiry then removes less, never more).
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from services.analytics_common import REPORT_TZ

log = logging.getLogger('gz.bonus')

EXPIRY_PRESET_DAYS = (1, 3, 7, 14, 30, 60, 90)
MAX_CUSTOM_DAYS = 3650
MAX_GRANT_TOKENS = 500
STUCK_AFTER = timedelta(minutes=2)
EXPIRING_SOON = timedelta(hours=24)


def _now() -> datetime:
    return datetime.now(timezone.utc)


GRANT_SOURCES = ('admin', 'signup', 'normal_topup', 'referral', 'influencer_campaign', 'promotion', 'world_competition', 'other')


def grant_source(grant: dict) -> str:
    """Stored source, or the best inference for grants created before the field existed."""
    if grant.get('source') in GRANT_SOURCES:
        return grant['source']
    return 'influencer_campaign' if grant.get('actor_id') == 'campaign-system' else 'admin'


def _credit_notice(grant: dict, amount: float) -> tuple[str, str]:
    source = grant_source(grant)
    label = {'signup': 'Signup bonus', 'referral': 'Referral bonus'}.get(source, 'Bonus tokens')
    expires_at = grant.get('expires_at')
    when = f' Use them before {uk_date(expires_at)}.' if expires_at else ' They do not expire.'
    return (
        f'{r2(amount):g} {label.lower()} tokens added',
        f'{label}: {r2(amount):g} tokens have been credited to your wallet. Use them for eligible Prize League entries.{when}',
    )


def r2(value) -> float:
    return round(float(value or 0), 2)


def _as_utc(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


# --------------------------------------------------------------------------- expiry options

def compute_expiry(now: datetime, mode: str, days: Optional[int] = None,
                   on_date: Optional[str] = None) -> Optional[datetime]:
    """mode: 'none' | 'days' | 'date'. A date means the end of that UK calendar day."""
    if mode == 'none':
        return None
    if mode == 'days':
        if days is None or not 1 <= int(days) <= MAX_CUSTOM_DAYS:
            raise HTTPException(status_code=400, detail=f'Expiry days must be between 1 and {MAX_CUSTOM_DAYS}')
        return now + timedelta(days=int(days))
    if mode == 'date':
        try:
            day = date.fromisoformat(on_date or '')
        except ValueError:
            raise HTTPException(status_code=400, detail='Expiry date must be YYYY-MM-DD')
        end = datetime.combine(day, time(23, 59, 59), tzinfo=REPORT_TZ).astimezone(timezone.utc)
        if end <= now:
            raise HTTPException(status_code=400, detail='Expiry date must be in the future')
        if (end - now).days > MAX_CUSTOM_DAYS:
            raise HTTPException(status_code=400, detail='Expiry date is too far in the future')
        return end
    raise HTTPException(status_code=400, detail="Expiry mode must be 'none', 'days' or 'date'")


def uk_date(value: datetime) -> str:
    local = _as_utc(value).astimezone(REPORT_TZ)
    return f'{local.day} {local.strftime("%B %Y")}'


# --------------------------------------------------------------------------- grant creation

async def create_grant(db, *, user_id: str, amount: float, expires_at: Optional[datetime], actor_id: str,
                       actor_email: str, reason: str, ref_key: str, source: str = 'admin',
                       max_amount: float = MAX_GRANT_TOKENS) -> dict:
    """Credit bonus tokens and record the grant. Idempotent per `ref_key`."""
    from routers.wallet_routes import _apply_tx_idempotent

    amt = r2(amount)
    if not 0 < amt <= max_amount:
        raise HTTPException(status_code=400, detail=f'Credit must be greater than 0 and at most {max_amount} tokens')
    existing = await db.bonus_grants.find_one({'ref_key': ref_key}, {'_id': 0})
    if existing:
        if existing.get('status') == 'active':
            title, body = _credit_notice(existing, existing['original_amount'])
            await _notify_once(db, existing, 'credited_notified_at', 'bonus_credited',
                               title, body)
            return {**existing, 'idempotent_replay': True}
        if existing.get('status') != 'creating':
            return {**existing, 'idempotent_replay': True}
        # A retry with the same idempotency key must complete the original grant payload,
        # never alter its amount, recipient, expiry or reason.
        user_id = existing['user_id']
        amt = r2(existing['original_amount'])
        expires_at = existing.get('expires_at')
        actor_id = existing.get('actor_id') or actor_id
        actor_email = existing.get('actor_email') or actor_email
        reason = existing.get('reason') or reason

    now = _now()
    grant = existing or {
        'grant_id': f'bg_{uuid.uuid4().hex[:16]}', 'ref_key': ref_key, 'user_id': user_id,
        'original_amount': amt, 'remaining_amount': amt, 'granted_at': now, 'expires_at': expires_at,
        'status': 'creating', 'actor_id': actor_id, 'actor_email': actor_email, 'reason': reason,
        'related_tx_ids': [], 'expired_amount': 0.0, 'revoked_amount': 0.0,
        'reserved_amount': 0.0, 'reserved_by': {}, 'source': source,
    }
    if existing is None:
        try:
            await db.bonus_grants.insert_one(dict(grant))
        except DuplicateKeyError:
            grant = await db.bonus_grants.find_one({'ref_key': ref_key}, {'_id': 0})
            if grant.get('status') != 'creating':
                return {**grant, 'idempotent_replay': True}

    # A pending grant record exists before the wallet credit. If the process crashes after
    # the wallet mutation, the scheduler replays this idempotency key and activates the grant.
    tx = await _apply_tx_idempotent(
        db, user_id, 'bonus_grant', amt,
        note=f'Bonus credit by {actor_email}: {reason}'[:300], ref_order_id=f'bonus_grant:{ref_key}',
        allow_pending_bonus_grant=True,
    )
    await db.bonus_grants.update_one(
        {'grant_id': grant['grant_id'], 'status': 'creating'},
        {'$set': {'status': 'active', 'related_tx_ids': [tx['tx']['tx_id']], 'credited_at': _now()}},
    )
    grant = await db.bonus_grants.find_one({'grant_id': grant['grant_id']}, {'_id': 0})

    title, body = _credit_notice(grant, amt)
    await _notify_once(db, grant, 'credited_notified_at', 'bonus_credited',
                       title, body)
    return {**grant, 'idempotent_replay': False}


async def recover_pending_grants(db, limit: int = 200) -> int:
    """Complete credits interrupted between grant creation and activation."""
    from routers.wallet_routes import _apply_tx_idempotent
    fixed = 0
    async for grant in db.bonus_grants.find({'status': 'creating'}, {'_id': 0}).limit(limit):
        tx = await _apply_tx_idempotent(
            db, grant['user_id'], 'bonus_grant', grant['original_amount'],
            note=f"Bonus credit by {grant.get('actor_email', '')}: {grant.get('reason', '')}"[:300],
            ref_order_id=f"bonus_grant:{grant['ref_key']}",
            allow_pending_bonus_grant=True,
        )
        await db.bonus_grants.update_one(
            {'grant_id': grant['grant_id'], 'status': 'creating'},
            {'$set': {'status': 'active', 'related_tx_ids': [tx['tx']['tx_id']], 'credited_at': _now()}},
        )
        fresh = await db.bonus_grants.find_one({'grant_id': grant['grant_id']}, {'_id': 0}) or grant
        title, body = _credit_notice(fresh, fresh['original_amount'])
        await _notify_once(db, fresh, 'credited_notified_at', 'bonus_credited',
                   title, body)
        fixed += 1
    return fixed


# --------------------------------------------------------------------------- spending

async def expired_unprocessed(db, user_id: str, now: Optional[datetime] = None) -> float:
    """Bonus tokens in grants that have passed expiry but are not yet removed from the wallet."""
    now = now or _now()
    grants = await db.bonus_grants.find({
        'user_id': user_id,
        '$or': [
            {'status': 'active', 'expires_at': {'$lte': now}},
            {'status': {'$in': ['expiring', 'revoking']}},
        ],
    }, {'_id': 0, 'grant_id': 1, 'status': 1, 'remaining_amount': 1, 'removal_take': 1}).to_list(None)
    if not grants:
        return 0.0
    wallet = await db.wallets.find_one({'user_id': user_id}, {'_id': 0, 'applied_tx_refs': 1}) or {}
    refs = set(wallet.get('applied_tx_refs') or [])
    total = 0.0
    for grant in grants:
        if grant['status'] == 'active':
            total += r2(grant.get('remaining_amount'))
        else:
            marker = _marker('bonus_expiry' if grant['status'] == 'expiring' else 'bonus_revoke', grant['grant_id'])
            # If the wallet mutation committed but grant finalisation crashed, its marker proves
            # the amount is already out of the wallet and must not be subtracted again virtually.
            if marker not in refs:
                total += r2(grant.get('removal_take', grant.get('remaining_amount')))
    return r2(total)


async def reserve_from_grants(db, user_id: str, amount: float, reservation_id: str,
                              now: Optional[datetime] = None) -> list:
    """Take `amount` from unexpired active grants, earliest expiry first, then non-expiring grants.

    The reservation reduces available-to-spend now but does not consume the grant until the
    corresponding wallet debit commits. Returns [(grant_id, taken)].
    """
    now = now or _now()
    need = r2(amount)
    taken: list = []
    if need <= 0:
        return taken
    base = {'user_id': user_id, 'status': 'active', 'remaining_amount': {'$gt': 0}}
    expiring = await db.bonus_grants.find({**base, 'expires_at': {'$gt': now}}, {'_id': 0, 'grant_id': 1}).sort(
        'expires_at', 1).to_list(200)
    permanent = await db.bonus_grants.find({**base, 'expires_at': None}, {'_id': 0, 'grant_id': 1}).sort(
        'granted_at', 1).to_list(200)
    for row in expiring + permanent:
        if need <= 0:
            break
        for _ in range(4):  # retry if a concurrent spend changed this grant under us
            current = await db.bonus_grants.find_one({'grant_id': row['grant_id']}, {
                '_id': 0, 'remaining_amount': 1, 'reserved_amount': 1, 'status': 1, 'expires_at': 1,
            })
            if not current or current['status'] != 'active':
                break
            exp = _as_utc(current.get('expires_at'))
            if exp is not None and exp <= now:
                break
            reserved_total = r2(current.get('reserved_amount'))
            available = max(0.0, r2(current['remaining_amount'] - reserved_total))
            take = min(available, need)
            if take <= 0:
                break
            reservation = {'amount': take, 'reserved_at': now}
            updated = await db.bonus_grants.find_one_and_update(
                {'grant_id': row['grant_id'], 'status': 'active',
                 'remaining_amount': current['remaining_amount'],
                 'reserved_amount': current.get('reserved_amount', 0),
                 **({'expires_at': current['expires_at']} if 'expires_at' in current else {'expires_at': None})},
                {'$inc': {'reserved_amount': take}, '$set': {f'reserved_by.{reservation_id}': reservation}},
                return_document=ReturnDocument.AFTER,
                projection={'_id': 0, 'remaining_amount': 1},
            )
            if updated is None:
                continue
            taken.append((row['grant_id'], take))
            need = r2(need - take)
            break
    return taken


async def finalize_reservation(db, reserved: list, reservation_id: str, *, committed: bool,
                              transaction_id: Optional[str] = None) -> None:
    """Commit grant consumption after wallet debit, or release it if the debit failed."""
    for grant_id, amount in reserved:
        selector = {'grant_id': grant_id, 'reserved_by.' + reservation_id: {'$exists': True}}
        if committed:
            update = {'$inc': {'remaining_amount': -r2(amount), 'reserved_amount': -r2(amount)},
                      '$unset': {'reserved_by.' + reservation_id: ''}}
            if transaction_id:
                update['$addToSet'] = {'related_tx_ids': transaction_id}
            result = await db.bonus_grants.update_one(
                selector,
                update,
            )
            if result.modified_count:
                await db.bonus_grants.update_one(
                    {'grant_id': grant_id, 'status': 'active', 'remaining_amount': {'$lte': 0},
                     'reserved_amount': 0},
                    {'$set': {'status': 'consumed', 'consumed_at': _now()}},
                )
        else:
            await db.bonus_grants.update_one(
                selector,
                {'$inc': {'reserved_amount': -r2(amount)},
                 '$unset': {'reserved_by.' + reservation_id: ''}},
            )


async def recover_reservations(db, user_id: Optional[str] = None, now: Optional[datetime] = None) -> int:
    """Resolve grant reservations left by a crashed wallet request using its atomic wallet marker."""
    now = now or _now()
    query = {'reserved_amount': {'$gt': 0}, 'reserved_by': {'$exists': True}}
    if user_id:
        query['user_id'] = user_id
    reservations: dict = {}
    async for grant in db.bonus_grants.find(query, {'_id': 0, 'grant_id': 1, 'user_id': 1, 'reserved_by': 1}):
        for reservation_id, doc in (grant.get('reserved_by') or {}).items():
            reserved_at = _as_utc((doc or {}).get('reserved_at'))
            if reserved_at and now - reserved_at < STUCK_AFTER:
                continue
            key = (grant['user_id'], reservation_id)
            reservations.setdefault(key, []).append((grant['grant_id'], r2((doc or {}).get('amount'))))
    resolved = 0
    for (owner, reservation_id), rows in reservations.items():
        wallet = await db.wallets.find_one({'user_id': owner}, {'_id': 0, 'bonus_spend_refs': 1}) or {}
        committed = reservation_id in (wallet.get('bonus_spend_refs') or [])
        await finalize_reservation(db, rows, reservation_id, committed=committed)
        await db.wallets.update_one({'user_id': owner}, {'$pull': {'bonus_spend_refs': reservation_id}})
        resolved += 1
    # A crash after grant finalisation but before marker cleanup leaves no reservation row.
    async for wallet in db.wallets.find(
        {'bonus_spend_refs': {'$exists': True, '$ne': []}, **({'user_id': user_id} if user_id else {})},
        {'_id': 0, 'user_id': 1, 'bonus_spend_refs': 1},
    ):
        for reservation_id in wallet.get('bonus_spend_refs') or []:
            exists = await db.bonus_grants.find_one(
                {'user_id': wallet['user_id'], f'reserved_by.{reservation_id}': {'$exists': True}}, {'_id': 1})
            if not exists:
                await db.wallets.update_one({'user_id': wallet['user_id']}, {'$pull': {'bonus_spend_refs': reservation_id}})
    return resolved


# --------------------------------------------------------------------------- expiry / revoke

def _marker(prefix: str, grant_id: str) -> str:
    return f'idem_{prefix}_{grant_id}'


async def _finish_removal(db, grant: dict, *, kind: str, prefix: str, final_status: str, amount_field: str,
                          pending_status: str, actor: Optional[str] = None) -> Optional[dict]:
    """Remove a claimed grant's planned amount from the wallet (idempotent) and finalise the grant."""
    from models import WalletTx

    grant_id, user_id = grant['grant_id'], grant['user_id']
    marker = _marker(prefix, grant_id)
    take = r2(grant.get('removal_take'))
    now = _now()
    new_balance = None
    applied = False
    if take > 0:
        for _ in range(5):
            wallet = await db.wallets.find_one({'user_id': user_id}, {'_id': 0, 'balance': 1, 'applied_tx_refs': 1})
            if wallet is None:
                break
            if marker in (wallet.get('applied_tx_refs') or []):
                applied, new_balance = True, r2(wallet.get('balance'))
                break
            updated = await db.wallets.find_one_and_update(
                {'user_id': user_id, 'applied_tx_refs': {'$ne': marker}, 'bonus': {'$gte': take}, 'balance': {'$gte': take}},
                {'$inc': {'bonus': -take, 'balance': -take}, '$addToSet': {'applied_tx_refs': marker},
                 '$set': {'updated_at': now}},
                return_document=ReturnDocument.AFTER, projection={'_id': 0, 'balance': 1},
            )
            if updated:
                applied, new_balance = True, r2(updated['balance'])
                break
    tx_id = None
    if applied:
        digest = hashlib.sha256(f'{user_id}|{kind}|{grant_id}'.encode()).hexdigest()
        tx = WalletTx.model_construct(
            tx_id=f'tx_{digest[:24]}', user_id=user_id, kind=kind, amount=-take, balance_after=new_balance,
            note=f'{final_status.capitalize()} bonus grant {grant_id}', ref_order_id=f'{prefix}:{grant_id}',
            bonus_amount=-take, purchased_amount=0.0, withdrawable_amount=0.0, created_at=now)
        doc = tx.model_dump()
        doc['_id'] = f'wallet_idem_{digest}'
        try:
            await db.wallet_tx.insert_one(doc)
        except DuplicateKeyError:
            pass
        tx_id = doc['tx_id']
    else:
        take = 0.0  # never deduct more than the wallet currently contains
    result = await db.bonus_grants.find_one_and_update(
        {'grant_id': grant_id, 'status': pending_status},
        {'$set': {'status': final_status, amount_field: take, 'remaining_amount': 0.0,
                  f'{final_status}_at': now, **({'revoked_by': actor} if actor else {})},
         '$addToSet': {'related_tx_ids': tx_id} if tx_id else {'related_tx_ids': {'$each': []}}},
        return_document=ReturnDocument.AFTER, projection={'_id': 0},
    )
    return result


async def _claim(db, grant_id: str, from_status: str, to_status: str, extra_filter: dict, now: datetime):
    claim = await db.bonus_grants.find_one_and_update(
        {'grant_id': grant_id, 'status': from_status, 'reserved_amount': 0, **extra_filter},
        {'$set': {'status': to_status, 'claimed_at': now}}, return_document=ReturnDocument.AFTER, projection={'_id': 0})
    if claim is None:
        return None
    wallet = await db.wallets.find_one({'user_id': claim['user_id']}, {'_id': 0, 'bonus': 1, 'balance': 1}) or {}
    take = max(0.0, min(r2(claim['remaining_amount']), r2(wallet.get('bonus')), r2(wallet.get('balance'))))
    await db.bonus_grants.update_one({'grant_id': grant_id}, {'$set': {'removal_take': take}})
    claim['removal_take'] = take
    return claim


async def expire_grant(db, grant_id: str, now: Optional[datetime] = None) -> Optional[dict]:
    """Expire one due grant. Returns the finalised grant, or None if it was not due / already handled."""
    now = now or _now()
    claim = await _claim(db, grant_id, 'active', 'expiring', {'expires_at': {'$lte': now}}, now)
    if claim is None:
        return None
    done = await _finish_removal(db, claim, kind='bonus_expiry', prefix='bonus_expiry', final_status='expired',
                                 amount_field='expired_amount', pending_status='expiring')
    if done and r2(done.get('expired_amount')) > 0:
        await _notify_once(db, done, 'expired_notified_at', 'bonus_expired', 'Bonus tokens expired',
                           f'{r2(done["expired_amount"]):g} unused bonus tokens have expired.')
    return done


async def revoke_grant(db, grant_id: str, actor_id: str) -> Optional[dict]:
    claim = await _claim(db, grant_id, 'active', 'revoking', {}, _now())
    if claim is None:
        return None
    return await _finish_removal(db, claim, kind='bonus_revoke', prefix='bonus_revoke', final_status='revoked',
                                 amount_field='revoked_amount', pending_status='revoking', actor=actor_id)


async def _notify_once(db, grant: dict, flag: str, kind: str, title: str, body: str) -> bool:
    # Deterministic _id makes notification creation retryable without duplicates.
    notification_id = f'{grant["grant_id"]}:{flag}'
    now = _now()
    doc = {
        '_id': notification_id,
        'notification_id': f'n_{hashlib.sha256(notification_id.encode()).hexdigest()[:16]}',
        'user_id': grant['user_id'], 'type': kind, 'kind': kind, 'title': title,
        'body': body, 'read': False, 'created_at': now,
    }
    inserted = False
    try:
        result = await db.notifications.update_one({'_id': notification_id}, {'$setOnInsert': doc}, upsert=True)
        inserted = result.upserted_id is not None
    except DuplicateKeyError:
        pass
    if inserted:
        try:
            from services.push_delivery import queue_notification_event
            await queue_notification_event(
                db,
                user_id=grant['user_id'],
                kind=kind,
                title=title,
                body=body,
                event_id=notification_id,
                target_url='/my-account/wallet',
            )
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Bonus Web Push enqueue failed grant=%s', grant.get('grant_id'))
    await db.bonus_grants.update_one({'grant_id': grant['grant_id'], flag: {'$exists': False}},
                                     {'$set': {flag: now}})
    return inserted


async def recover_stuck(db, user_id: Optional[str] = None, now: Optional[datetime] = None) -> int:
    """Finish removals that stopped half-way (process crash). Safe to run repeatedly."""
    now = now or _now()
    query = {'status': {'$in': ['expiring', 'revoking']}, 'claimed_at': {'$lte': now - STUCK_AFTER}}
    if user_id:
        query['user_id'] = user_id
    fixed = 0
    async for grant in db.bonus_grants.find(query, {'_id': 0}):
        if grant.get('removal_take') is None:
            wallet = await db.wallets.find_one(
                {'user_id': grant['user_id']}, {'_id': 0, 'bonus': 1, 'balance': 1}) or {}
            take = max(0.0, min(r2(grant.get('remaining_amount')), r2(wallet.get('bonus')), r2(wallet.get('balance'))))
            await db.bonus_grants.update_one(
                {'grant_id': grant['grant_id'], 'status': grant['status'], 'removal_take': {'$exists': False}},
                {'$set': {'removal_take': take}},
            )
            fresh = await db.bonus_grants.find_one({'grant_id': grant['grant_id']}, {'_id': 0, 'removal_take': 1}) or {}
            grant['removal_take'] = fresh.get('removal_take', take)
        if grant['status'] == 'expiring':
            await _finish_removal(db, grant, kind='bonus_expiry', prefix='bonus_expiry', final_status='expired',
                                  amount_field='expired_amount', pending_status='expiring')
        else:
            await _finish_removal(db, grant, kind='bonus_revoke', prefix='bonus_revoke', final_status='revoked',
                                  amount_field='revoked_amount', pending_status='revoking')
        fixed += 1
    return fixed


async def expire_due_for_user(db, user_id: str, now: Optional[datetime] = None) -> int:
    """Lazy enforcement used by balance reads and spends; cheap when the user has no due grants."""
    now = now or _now()
    due = await db.bonus_grants.find(
        {'user_id': user_id, 'status': 'active', 'expires_at': {'$lte': now}}, {'_id': 0, 'grant_id': 1}).to_list(50)
    changed = 0
    for row in due:
        if await expire_grant(db, row['grant_id'], now):
            changed += 1
    changed += await recover_stuck(db, user_id, now)
    changed += await recover_reservations(db, user_id, now)
    pending = await db.bonus_grants.find_one(
        {'user_id': user_id, '$or': [
            {'status': {'$in': ['expiring', 'revoking']}},
            {'status': 'active', 'expires_at': {'$lte': now}, 'reserved_amount': {'$gt': 0}},
        ]}, {'_id': 1})
    if pending:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail='Bonus expiry is being finalized. Please retry the wallet request.')
    return changed


async def run_expiry_job(db, now: Optional[datetime] = None, limit: int = 500) -> dict:
    """Scheduled, idempotent: expire due grants, recover stuck ones, send 24h reminders once."""
    now = now or _now()
    recovered_grants = await recover_pending_grants(db, limit)
    expired = 0
    async for row in db.bonus_grants.find(
            {'status': 'active', 'expires_at': {'$lte': now}}, {'_id': 0, 'grant_id': 1}).sort('expires_at', 1).limit(limit):
        if await expire_grant(db, row['grant_id'], now):
            expired += 1
    recovered = await recover_stuck(db, None, now)
    reservations = await recover_reservations(db, None, now)
    notifications_recovered = 0
    async for grant in db.bonus_grants.find(
            {'status': 'active', 'credited_notified_at': {'$exists': False}}, {'_id': 0}).limit(limit):
        when = f" Use them before {uk_date(grant['expires_at'])}." if grant.get('expires_at') else ' They do not expire.'
        notifications_recovered += await _notify_once(
            db, grant, 'credited_notified_at', 'bonus_credited',
            f"{r2(grant['original_amount']):g} bonus tokens added",
            f"{r2(grant['original_amount']):g} bonus tokens have been credited to your wallet.{when}")
    async for grant in db.bonus_grants.find(
            {'status': 'expired', 'expired_amount': {'$gt': 0}, 'expired_notified_at': {'$exists': False}},
            {'_id': 0}).limit(limit):
        notifications_recovered += await _notify_once(
            db, grant, 'expired_notified_at', 'bonus_expired', 'Bonus tokens expired',
            f"{r2(grant['expired_amount']):g} unused bonus tokens have expired.")
    reminded = 0
    async for grant in db.bonus_grants.find(
            {'status': 'active', 'remaining_amount': {'$gt': 0}, 'expires_at': {'$gt': now, '$lte': now + EXPIRING_SOON},
             'expiring_notified_at': {'$exists': False}}, {'_id': 0}).limit(limit):
        if await _notify_once(db, grant, 'expiring_notified_at', 'bonus_expiring', 'Bonus tokens expiring soon',
                              f'{r2(grant["remaining_amount"]):g} bonus tokens expire on {uk_date(grant["expires_at"])}. Use them before then.'):
            reminded += 1
    return {'expired': expired, 'recovered': recovered, 'reservations': reservations,
            'pending_grants': recovered_grants, 'notifications_recovered': notifications_recovered,
            'reminded': reminded}


# --------------------------------------------------------------------------- display

async def wallet_bonus_view(db, user_id: str, wallet: dict) -> dict:
    """Bonus breakdown for the player's wallet screen (never trusts the browser)."""
    now = _now()
    grants = await db.bonus_grants.find(
        {'user_id': user_id, 'status': 'active', 'remaining_amount': {'$gt': 0}},
        {'_id': 0, 'grant_id': 1, 'remaining_amount': 1, 'original_amount': 1, 'granted_at': 1, 'expires_at': 1},
    ).sort('expires_at', 1).to_list(None)
    tracked = r2(sum(g['remaining_amount'] for g in grants))
    items = [{
        'grant_id': g['grant_id'], 'remaining': r2(g['remaining_amount']), 'original': r2(g['original_amount']),
        'granted_at': _as_utc(g['granted_at']).isoformat(),
        'expires_at': _as_utc(g['expires_at']).isoformat() if g.get('expires_at') else None,
        'expires_soon': bool(g.get('expires_at') and _as_utc(g['expires_at']) - now <= timedelta(days=7)),
    } for g in grants]
    expiring_soon = r2(sum(i['remaining'] for i in items if i['expires_soon']))
    return {
        'bonus_grants': items,
        'bonus_non_expiring_tokens': max(0.0, r2(r2(wallet.get('bonus')) - sum(
            i['remaining'] for i in items if i['expires_at']))),
        'bonus_expiring_soon_tokens': expiring_soon,
        'bonus_tracked_tokens': tracked,
    }
