"""Wallet: user balance, top-ups, spends, refunds, transactions.

Token model: 1 token = £1. All amounts stored in `balance` represent tokens.
The API returns both `balance` (numeric, legacy) and `tokens` (integer form)
so the frontend can render clean "5 tokens" labels while the underlying
accounting stays penny-precise for refunds/adjustments.
"""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import Optional
import hashlib

from pymongo.errors import DuplicateKeyError

from auth import get_current_user
from deps import get_db
from models import Wallet, WalletTx

MIN_TOPUP = 5.0   # 5 tokens minimum
MAX_TOPUP = 1000.0

wallet_router = APIRouter(prefix='/api/wallet', tags=['wallet'])
admin_wallet_router = APIRouter(prefix='/api/admin/wallets', tags=['admin-wallets'])


class TopupInput(BaseModel):
    # amount = number of tokens (integer). 1 token = £1.
    amount: int = Field(..., ge=int(MIN_TOPUP), le=int(MAX_TOPUP), description=f'Number of tokens. Min {int(MIN_TOPUP)}, max {int(MAX_TOPUP)}.')


class AdminAdjustInput(BaseModel):
    user_id: str
    amount: float  # positive credit / negative debit
    note: str = ''


async def _get_or_create_wallet(db, user_id: str) -> dict:
    w = await db.wallets.find_one({'user_id': user_id}, {'_id': 0})
    if not w:
        new_w = Wallet(user_id=user_id).model_dump()
        new_w['bonus'] = 0.0
        new_w['withdrawable'] = 0.0
        new_w['source_migrated'] = True
        await db.wallets.insert_one(new_w)
        w = await db.wallets.find_one({'user_id': user_id}, {'_id': 0})
    elif not w.get('source_migrated'):
        w = await _migrate_wallet_sources(db, user_id, w)
    return _with_tokens(w)


async def _migrate_wallet_sources(db, user_id: str, w: dict) -> dict:
    """One-time, idempotent backfill of source sub-counters for a legacy
    wallet. Bonus = min(current balance, sum of historical bonus credits).
    Withdrawable defaults to 0 (existing balances are NON-withdrawable per
    the cash-out safety rule) unless already set. Runs lazily on first
    wallet access after deploy."""
    balance = round(float(w.get('balance', 0) or 0), 2)
    bonus_credited = 0.0
    async for tx in db.wallet_tx.find(
        {'user_id': user_id, 'kind': {'$in': list(BONUS_TX_KINDS)}, 'amount': {'$gt': 0}},
        {'_id': 0, 'amount': 1},
    ):
        bonus_credited += float(tx.get('amount', 0) or 0)
    bonus = round(min(balance, max(0.0, bonus_credited)), 2)
    withdrawable = round(float(w.get('withdrawable', 0) or 0), 2)
    await db.wallets.update_one(
        {'user_id': user_id, 'source_migrated': {'$ne': True}},
        {'$set': {'bonus': bonus, 'withdrawable': withdrawable, 'source_migrated': True}},
    )
    return await db.wallets.find_one({'user_id': user_id}, {'_id': 0})


def _split_debit(balance: float, bonus: float, withdrawable: float, withdrawable_pending: float, amount: float):
    """Return (d_bonus, d_withdrawable) to consume `amount` in the protected
    spend order: bonus -> purchased -> withdrawable. Reserved cash-out funds
    (withdrawable_pending) are never spendable. Purchased is derived
    (balance - bonus - withdrawable - withdrawable_pending)."""
    amt = round(float(amount), 2)
    bonus = max(0.0, round(bonus, 2))
    withdrawable = max(0.0, round(withdrawable, 2))
    pending = max(0.0, round(withdrawable_pending, 2))
    d_bonus = min(bonus, amt)
    rem = round(amt - d_bonus, 2)
    purchased = max(0.0, round(balance - bonus - withdrawable - pending, 2))
    d_purch = min(purchased, rem)
    rem2 = round(rem - d_purch, 2)
    d_withdrawable = min(withdrawable, rem2)
    return round(d_bonus, 2), round(d_withdrawable, 2)


async def reserve_withdrawable(db, user_id: str, amount: float) -> bool:
    """Atomically lock `amount` of unreserved withdrawable tokens for a
    cash-out request (withdrawable -> withdrawable_pending). Returns False if
    the user does not have enough unreserved withdrawable balance."""
    amt = round(float(amount), 2)
    now = datetime.now(timezone.utc)
    res = await db.wallets.update_one(
        {'user_id': user_id, 'withdrawable': {'$gte': amt}},
        {'$inc': {'withdrawable': -amt, 'withdrawable_pending': amt}, '$set': {'updated_at': now}},
    )
    return res.modified_count == 1


async def settle_withdrawable_paid(db, user_id: str, amount: float) -> bool:
    """Cash-out paid: remove reserved tokens from the wallet permanently
    (they became real GBP). withdrawable_pending -= amt AND balance -= amt."""
    amt = round(float(amount), 2)
    now = datetime.now(timezone.utc)
    res = await db.wallets.update_one(
        {'user_id': user_id, 'withdrawable_pending': {'$gte': amt}},
        {'$inc': {'withdrawable_pending': -amt, 'balance': -amt}, '$set': {'updated_at': now}},
    )
    return res.modified_count == 1


async def release_withdrawable(db, user_id: str, amount: float) -> bool:
    """Cash-out rejected/cancelled: return reserved tokens to available
    withdrawable (withdrawable_pending -> withdrawable)."""
    amt = round(float(amount), 2)
    now = datetime.now(timezone.utc)
    res = await db.wallets.update_one(
        {'user_id': user_id, 'withdrawable_pending': {'$gte': amt}},
        {'$inc': {'withdrawable_pending': -amt, 'withdrawable': amt}, '$set': {'updated_at': now}},
    )
    return res.modified_count == 1


async def credit_withdrawable(db, user_id: str, amount: float, note: str, ref_order_id: str) -> dict:
    """Credit championship/challenge winnings as withdrawable tokens
    (idempotent). 1 token = £1."""
    return await _apply_tx_idempotent(db, user_id, 'winnings', round(float(amount), 2),
                                      note=note, ref_order_id=ref_order_id)


def _with_tokens(w: Optional[dict]) -> Optional[dict]:
    """Enrich a wallet dict with `tokens` / `lifetime_tokens_bought` /
    `lifetime_tokens_spent` fields. 1 token = £1, so these are just the
    integer views of the underlying float `balance` etc. — the frontend
    labels them as tokens without any client-side maths.

    Source split (1 token = £1):
      total_tokens          = balance (purchased + championship + bonus)
      bonus_tokens          = free/promotional (non-withdrawable)
      tokens                = total (kept for backward compat / Home total)
      spendable_tokens      = total - bonus  (the user-facing "Tokens" line)
      withdrawable_tokens   = unused championship-prize tokens (cash-outable)
      available_to_cash_out = withdrawable_tokens (£, 1:1)
    """
    if not w:
        return w
    total = float(w.get('balance', 0) or 0)
    bonus = float(w.get('bonus', 0) or 0)
    withdrawable = float(w.get('withdrawable', 0) or 0)
    pending = float(w.get('withdrawable_pending', 0) or 0)
    spendable = max(0.0, total - bonus - withdrawable - pending)
    w['tokens'] = int(round(total))
    w['total_tokens'] = int(round(total))
    w['bonus_tokens'] = int(round(bonus))
    # "Tokens" line = purchased + championship = total - bonus
    w['spendable_tokens'] = int(round(max(0.0, total - bonus)))
    w['purchased_tokens'] = int(round(spendable))
    w['withdrawable_tokens'] = int(round(withdrawable))
    w['withdrawable_pending_tokens'] = int(round(pending))
    w['available_to_cash_out'] = round(withdrawable, 2)
    w['pending_cash_out'] = round(pending, 2)
    w['lifetime_tokens_bought'] = int(round(w.get('lifetime_topup', 0) or 0))
    w['lifetime_tokens_spent'] = int(round(w.get('lifetime_spend', 0) or 0))
    return w


# Kinds whose positive credits are BONUS (free / non-withdrawable) tokens.
BONUS_TX_KINDS = {
    'signup_bonus', 'referral_bonus', 'referral', 'bonus', 'bonus_credit',
    'influencer_bonus', 'promo', 'promo_bonus', 'reward', 'free_tokens',
}
# Kinds whose positive credits are WITHDRAWABLE championship-prize tokens.
WITHDRAWABLE_TX_KINDS = {'champion_prize', 'championship_prize', 'winnings'}


def _source_inc_for_credit(kind: str, delta: float) -> dict:
    """Extra $inc sub-counters to tag a positive credit by source."""
    extra = {}
    if delta > 0:
        if kind in BONUS_TX_KINDS:
            extra['bonus'] = round(delta, 2)
        elif kind in WITHDRAWABLE_TX_KINDS:
            extra['withdrawable'] = round(delta, 2)
    return extra


async def _apply_tx(db, user_id: str, kind: str, amount: float, note: str = '', ref_order_id: Optional[str] = None) -> dict:
    """Apply a delta to the wallet atomically and record a transaction.

    Uses `find_one_and_update` with `$inc` so concurrent writers cannot
    clobber each other's balances (lost-update bug). For debits (amount < 0)
    the update is guarded with a `balance >= abs(amount)` filter so a race
    can never leave the balance negative — the update simply fails and we
    raise 400 to the loser.
    """
    # Ensure the wallet document exists so the subsequent atomic $inc has
    # something to hit. Any create-race is safe: unique index on user_id in
    # the Wallet model (upsert=True keeps us idempotent).
    await _get_or_create_wallet(db, user_id)

    delta = round(float(amount), 2)
    now = datetime.now(timezone.utc)

    # DEBIT: consume tokens in the protected order bonus -> purchased ->
    # withdrawable, using optimistic concurrency (guard on the exact values
    # we read) so sub-counters can never drift negative under races.
    if delta < 0:
        amt = round(abs(delta), 2)
        new_balance = None
        for _ in range(6):
            cur = await db.wallets.find_one(
                {'user_id': user_id},
                {'_id': 0, 'balance': 1, 'bonus': 1, 'withdrawable': 1, 'withdrawable_pending': 1},
            ) or {}
            bal = round(float(cur.get('balance', 0) or 0), 2)
            bon = round(float(cur.get('bonus', 0) or 0), 2)
            wd = round(float(cur.get('withdrawable', 0) or 0), 2)
            wp = round(float(cur.get('withdrawable_pending', 0) or 0), 2)
            if round(bal - wp, 2) + 1e-9 < amt:
                raise HTTPException(status_code=400, detail='Insufficient wallet balance')
            d_bonus, d_wd = _split_debit(bal, bon, wd, wp, amt)
            inc = {'balance': delta, 'bonus': -d_bonus, 'withdrawable': -d_wd}
            if kind == 'spend':
                inc['lifetime_spend'] = amt
            # Legacy wallets may not have source fields yet; match missing as well
            # as zero instead of repeatedly failing the optimistic update.
            guard = {'user_id': user_id, 'balance': cur.get('balance', 0)}
            for field, value in (('bonus', bon), ('withdrawable', wd), ('withdrawable_pending', wp)):
                guard[field] = cur[field] if field in cur else {'$exists': False}
            updated = await db.wallets.find_one_and_update(
                guard,
                {'$inc': inc, '$set': {'updated_at': now}},
                return_document=True,
                projection={'_id': 0, 'balance': 1},
            )
            if updated:
                new_balance = round(updated['balance'], 2)
                break
        if new_balance is None:
            raise HTTPException(status_code=409, detail='Wallet changed during checkout. Please try again.')
        tx = WalletTx(
            user_id=user_id, kind=kind, amount=delta,
            balance_after=new_balance, note=note, ref_order_id=ref_order_id,
        )
        await db.wallet_tx.insert_one(tx.model_dump())
        return {'balance': new_balance, 'tx': tx.model_dump()}

    # CREDIT path.
    inc = {'balance': delta}
    if delta > 0 and kind == 'topup':
        inc['lifetime_topup'] = round(delta, 2)
    inc.update(_source_inc_for_credit(kind, delta))

    filt = {'user_id': user_id}

    updated = await db.wallets.find_one_and_update(
        filt,
        {'$inc': inc, '$set': {'updated_at': now}},
        return_document=True,  # pymongo maps this to ReturnDocument.AFTER
        projection={'_id': 0, 'balance': 1},
    )
    if not updated:
        # If it wasn't a debit filter that failed, some other race happened;
        # either way the safe response is 400 with the same message we've
        # always shown to users.
        raise HTTPException(status_code=400, detail='Insufficient wallet balance')

    new_balance = round(updated['balance'], 2)
    tx = WalletTx(
        user_id=user_id,
        kind=kind,
        amount=delta,
        balance_after=new_balance,
        note=note,
        ref_order_id=ref_order_id,
    )
    await db.wallet_tx.insert_one(tx.model_dump())
    return {'balance': new_balance, 'tx': tx.model_dump()}


async def _apply_tx_idempotent(
    db,
    user_id: str,
    kind: str,
    amount: float,
    note: str = '',
    ref_order_id: Optional[str] = None,
) -> dict:
    """
    Idempotent wallet mutation for recoverable workflows.

    Existing _apply_tx remains untouched.

    The wallet document itself records the applied reference in the
    SAME atomic update as the balance change. Therefore a retry after
    a process/network failure cannot debit the same reference twice.

    wallet_tx is then mirrored using a deterministic Mongo _id. If the
    process stops between wallet mutation and history insertion, the
    same request can safely repair the history record later.
    """

    if not ref_order_id:
        raise ValueError(
            "ref_order_id is required for idempotent wallet transactions"
        )

    await _get_or_create_wallet(
        db,
        user_id,
    )

    delta = round(
        float(amount),
        2,
    )

    now = datetime.now(
        timezone.utc
    )

    raw_key = (
        f"{user_id}|{kind}|{ref_order_id}"
    )

    digest = hashlib.sha256(
        raw_key.encode("utf-8")
    ).hexdigest()

    marker = (
        f"idem_{digest}"
    )

    inc = {
        "balance":
            delta,
    }

    if (
        delta > 0
        and kind == "topup"
    ):
        inc["lifetime_topup"] = (
            round(delta, 2)
        )

    elif (
        delta < 0
        and kind == "spend"
    ):
        inc["lifetime_spend"] = (
            round(
                abs(delta),
                2,
            )
        )

    inc.update(_source_inc_for_credit(kind, delta))

    if delta < 0:
        # Consume in protected order bonus -> purchased -> withdrawable.
        _cur = await db.wallets.find_one(
            {"user_id": user_id},
            {"_id": 0, "balance": 1, "bonus": 1, "withdrawable": 1, "withdrawable_pending": 1},
        ) or {}
        _bal = round(float(_cur.get("balance", 0) or 0), 2)
        _wp = round(float(_cur.get("withdrawable_pending", 0) or 0), 2)
        if round(_bal - _wp, 2) + 1e-9 < abs(delta):
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")
        _d_bonus, _d_wd = _split_debit(
            _bal,
            round(float(_cur.get("bonus", 0) or 0), 2),
            round(float(_cur.get("withdrawable", 0) or 0), 2),
            _wp,
            abs(delta),
        )
        inc["bonus"] = -_d_bonus
        inc["withdrawable"] = -_d_wd

    filt = {
        "user_id":
            user_id,

        "applied_tx_refs": {
            "$ne":
                marker,
        },
    }

    if delta < 0:
        filt["balance"] = {
            "$gte":
                abs(delta),
        }

    updated = (
        await db.wallets.find_one_and_update(
            filt,
            {
                "$inc":
                    inc,

                "$addToSet": {
                    "applied_tx_refs":
                        marker,
                },

                "$set": {
                    "updated_at":
                        now,
                },
            },
            return_document=True,
            projection={
                "_id": 0,
                "balance": 1,
                "applied_tx_refs": 1,
            },
        )
    )

    idempotent_replay = False

    if updated:
        new_balance = round(
            float(
                updated.get(
                    "balance",
                    0,
                )
            ),
            2,
        )

    else:
        current = await db.wallets.find_one(
            {
                "user_id":
                    user_id,
            },
            {
                "_id": 0,
                "balance": 1,
                "applied_tx_refs": 1,
            },
        )

        refs = (
            current.get(
                "applied_tx_refs",
                [],
            )
            if current
            else []
        )

        if marker not in refs:
            raise HTTPException(
                status_code=400,
                detail="Insufficient wallet balance",
            )

        # This exact transaction already changed the wallet.
        idempotent_replay = True

        new_balance = round(
            float(
                current.get(
                    "balance",
                    0,
                )
            ),
            2,
        )

    deterministic_id = (
        f"wallet_idem_{digest}"
    )

    tx = WalletTx(
        user_id=user_id,
        kind=kind,
        amount=delta,
        balance_after=new_balance,
        note=note,
        ref_order_id=ref_order_id,
    )

    tx_doc = tx.model_dump()

    # Stable ids make the history mirror repairable/idempotent too.
    tx_doc["_id"] = deterministic_id
    tx_doc["tx_id"] = (
        f"tx_{digest[:24]}"
    )

    try:
        await db.wallet_tx.insert_one(
            dict(tx_doc)
        )

    except DuplicateKeyError:
        # History already exists. This is the expected replay case.
        pass

    clean_tx = {
        key: value
        for key, value
        in tx_doc.items()
        if key != "_id"
    }

    return {
        "balance":
            new_balance,

        "tokens":
            int(
                round(
                    new_balance
                )
            ),

        "tx":
            clean_tx,

        "idempotent_replay":
            idempotent_replay,
    }


# ---------- Player endpoints ----------
@wallet_router.get('/me')
async def my_wallet(request: Request):
    user = await get_current_user(request)
    db = get_db()
    w = await _get_or_create_wallet(db, user['user_id'])
    return w


@wallet_router.get('/transactions')
async def my_txs(request: Request, limit: int = 50):
    user = await get_current_user(request)
    db = get_db()
    docs = await db.wallet_tx.find({'user_id': user['user_id']}, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    return {'transactions': docs}


@wallet_router.post('/topup')
async def topup(inp: TopupInput, request: Request):
    """MOCKED token top-up for dev only — instantly credits N tokens.
    Production uses Stripe checkout via /payments/wallet-topup/*.
    """
    user = await get_current_user(request)
    db = get_db()
    tokens = int(inp.amount)
    r = await _apply_tx(db, user['user_id'], 'topup', float(tokens), note=f"Top-up {tokens} tokens (mock)")
    r['tokens'] = int(round(r['balance']))
    return {'ok': True, **r}


# ---------- Admin endpoints ----------
async def _require_admin(request: Request):
    u = await get_current_user(request)
    if u.get('role') not in ('admin', 'super_admin', 'operator', 'support'):
        raise HTTPException(status_code=403, detail='Admin only')
    return u


@admin_wallet_router.get('')
async def list_wallets(request: Request, limit: int = 500):
    await _require_admin(request)
    db = get_db()
    wallets = await db.wallets.find({}, {'_id': 0}).sort('balance', -1).limit(limit).to_list(limit)
    # Enrich with user email/name AND token view
    if wallets:
        user_ids = [w['user_id'] for w in wallets]
        users = await db.users.find({'user_id': {'$in': user_ids}}, {'_id': 0, 'user_id': 1, 'email': 1, 'name': 1}).to_list(1000)
        umap = {u['user_id']: u for u in users}
        for w in wallets:
            u = umap.get(w['user_id'], {})
            w['email'] = u.get('email')
            w['name'] = u.get('name')
            _with_tokens(w)
    totals = {
        'total_balance': round(sum(w['balance'] for w in wallets), 2),
        'total_tokens': int(round(sum(w['balance'] for w in wallets))),
        'total_lifetime_topup': round(sum(w.get('lifetime_topup', 0) for w in wallets), 2),
        'total_lifetime_spend': round(sum(w.get('lifetime_spend', 0) for w in wallets), 2),
        'wallet_count': len(wallets),
    }
    return {'wallets': wallets, 'totals': totals}


@admin_wallet_router.post('/adjust')
async def admin_adjust(inp: AdminAdjustInput, request: Request):
    admin = await _require_admin(request)
    if admin.get('role') not in ('admin', 'super_admin'):
        raise HTTPException(status_code=403, detail='Only admin/super_admin can adjust')
    db = get_db()
    r = await _apply_tx(db, inp.user_id, 'admin_adjust', float(inp.amount), note=inp.note or f'Adjusted by {admin["email"]}')
    return {'ok': True, **r}


@admin_wallet_router.get('/{user_id}/transactions')
async def user_txs(user_id: str, request: Request, limit: int = 200):
    await _require_admin(request)
    db = get_db()
    docs = await db.wallet_tx.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    return {'transactions': docs}
