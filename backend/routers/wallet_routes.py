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
        await db.wallets.insert_one(new_w)
        # Re-fetch to strip _id if driver mutated the dict
        w = await db.wallets.find_one({'user_id': user_id}, {'_id': 0})
    return _with_tokens(w)


def _with_tokens(w: Optional[dict]) -> Optional[dict]:
    """Enrich a wallet dict with `tokens` / `lifetime_tokens_bought` /
    `lifetime_tokens_spent` fields. 1 token = £1, so these are just the
    integer views of the underlying float `balance` etc. — the frontend
    labels them as tokens without any client-side maths.
    """
    if not w:
        return w
    w['tokens'] = int(round(w.get('balance', 0) or 0))
    w['lifetime_tokens_bought'] = int(round(w.get('lifetime_topup', 0) or 0))
    w['lifetime_tokens_spent'] = int(round(w.get('lifetime_spend', 0) or 0))
    return w


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

    # Build atomic mutation. Lifetime counters must also change in-doc so no
    # separate read+set exists in this function.
    inc = {'balance': delta}
    if delta > 0 and kind in ('topup', 'referral_bonus'):
        inc['lifetime_topup'] = round(delta, 2)
    elif delta < 0 and kind == 'spend':
        inc['lifetime_spend'] = round(abs(delta), 2)

    filt = {'user_id': user_id}
    if delta < 0:
        # Prevent overdraft under concurrency: only debit if we still have the
        # money at the exact moment we mutate.
        filt['balance'] = {'$gte': abs(delta)}

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
