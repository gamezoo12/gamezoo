"""Wallet: user balance, top-ups, spends, refunds, transactions."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from typing import Optional

from auth import get_current_user
from deps import get_db
from models import Wallet, WalletTx

MIN_TOPUP = 10.0
MAX_TOPUP = 5000.0

wallet_router = APIRouter(prefix='/api/wallet', tags=['wallet'])
admin_wallet_router = APIRouter(prefix='/api/admin/wallets', tags=['admin-wallets'])


class TopupInput(BaseModel):
    amount: float = Field(..., ge=MIN_TOPUP, le=MAX_TOPUP, description=f"Between £{MIN_TOPUP} and £{MAX_TOPUP}")


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
    return w


async def _apply_tx(db, user_id: str, kind: str, amount: float, note: str = '', ref_order_id: Optional[str] = None) -> dict:
    """Apply a delta to the wallet and record a transaction. Returns the new balance dict."""
    w = await _get_or_create_wallet(db, user_id)
    new_balance = round(w['balance'] + amount, 2)
    if new_balance < 0:
        raise HTTPException(status_code=400, detail='Insufficient wallet balance')
    updates = {'balance': new_balance, 'updated_at': datetime.now(timezone.utc)}
    if amount > 0 and kind in ('topup', 'referral_bonus'):
        updates['lifetime_topup'] = round(w.get('lifetime_topup', 0) + amount, 2)
    elif amount < 0 and kind == 'spend':
        updates['lifetime_spend'] = round(w.get('lifetime_spend', 0) + abs(amount), 2)
    await db.wallets.update_one({'user_id': user_id}, {'$set': updates})
    tx = WalletTx(
        user_id=user_id,
        kind=kind,
        amount=amount,
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
    """MOCKED top-up for now — credits the wallet instantly. Real Stripe wiring later."""
    user = await get_current_user(request)
    db = get_db()
    r = await _apply_tx(db, user['user_id'], 'topup', float(inp.amount), note=f"Top-up £{inp.amount} (mock)")
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
    # Enrich with user email/name
    if wallets:
        user_ids = [w['user_id'] for w in wallets]
        users = await db.users.find({'user_id': {'$in': user_ids}}, {'_id': 0, 'user_id': 1, 'email': 1, 'name': 1}).to_list(1000)
        umap = {u['user_id']: u for u in users}
        for w in wallets:
            u = umap.get(w['user_id'], {})
            w['email'] = u.get('email')
            w['name'] = u.get('name')
    totals = {
        'total_balance': round(sum(w['balance'] for w in wallets), 2),
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
