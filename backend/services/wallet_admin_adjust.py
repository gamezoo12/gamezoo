"""Admin credit/debit of one specific token wallet (Winnings, Bonus, Winning Bonus, Top-Up)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

WALLET_FIELDS = {'winnings': 'withdrawable', 'bonus': 'bonus', 'winning_bonus': 'winning_bonus', 'topup': None}
WALLET_LABELS = {'winnings': 'Winnings Tokens', 'bonus': 'Bonus Tokens', 'winning_bonus': 'Winning Bonus Tokens', 'topup': 'Top-Up Tokens'}
TX_SOURCE = {'winnings': 'withdrawable_amount', 'bonus': 'bonus_amount', 'winning_bonus': 'winning_bonus_amount', 'topup': 'purchased_amount'}
KEYS = ('balance', 'bonus', 'bonus_untracked', 'winning_bonus', 'withdrawable', 'withdrawable_pending')


def _f(doc: dict, key: str) -> float:
    return round(float(doc.get(key) or 0), 2)


def wallet_breakdown(w: dict) -> dict:
    bal, bon, wb, wd = (_f(w, k) for k in ('balance', 'bonus', 'winning_bonus', 'withdrawable'))
    return {'winnings': wd, 'winnings_pending': _f(w, 'withdrawable_pending'), 'bonus': bon, 'winning_bonus': wb,
            'topup': round(max(0.0, bal - bon - wb - wd), 2), 'total': bal}


def available(w: dict, wallet: str) -> float:
    b = wallet_breakdown(w)
    return round(b['winnings'] - b['winnings_pending'], 2) if wallet == 'winnings' else b[wallet]


async def adjust_single_wallet(db, user_id: str, wallet: str, amount: float, *, note: str, operation_id: str, admin: dict) -> dict:
    from models import WalletTx
    from routers.wallet_routes import _get_or_create_wallet

    delta = round(float(amount), 2)
    try:
        await db.wallet_admin_adjustments.insert_one({'_id': operation_id, 'user_id': user_id, 'wallet': wallet, 'amount': delta,
                                                      'status': 'pending', 'admin_email': admin.get('email'),
                                                      'created_at': datetime.now(timezone.utc)})
    except DuplicateKeyError:
        prev = await db.wallet_admin_adjustments.find_one({'_id': operation_id})
        if prev.get('status') == 'applied':
            return {**prev.get('result', {}), 'idempotent_replay': True}
        if prev.get('user_id') != user_id or prev.get('wallet') != wallet or prev.get('amount') != delta:
            raise HTTPException(status_code=409, detail='This operation ID was already used for a different adjustment')
    await _get_or_create_wallet(db, user_id)
    field = WALLET_FIELDS[wallet]
    for _ in range(6):
        cur = await db.wallets.find_one({'user_id': user_id}, {'_id': 0, **{k: 1 for k in KEYS}}) or {}
        if delta < 0 and available(cur, wallet) + 1e-9 < abs(delta):
            await db.wallet_admin_adjustments.delete_one({'_id': operation_id, 'status': 'pending'})
            raise HTTPException(status_code=400, detail=f'{WALLET_LABELS[wallet]} has only {available(cur, wallet):.2f} available; cannot go below zero')
        inc = {'balance': delta}
        if field:
            inc[field] = delta
        if wallet == 'bonus':
            untracked = _f(cur, 'bonus_untracked')
            inc['bonus_untracked'] = delta if delta > 0 else -min(untracked, abs(delta))
        guard = {'user_id': user_id, **{k: cur.get(k) for k in KEYS if k in cur}}
        updated = await db.wallets.find_one_and_update(guard, {'$inc': inc, '$set': {'updated_at': datetime.now(timezone.utc)}},
                                                       return_document=True, projection={'_id': 0, **{k: 1 for k in KEYS}})
        if updated:
            break
    else:
        raise HTTPException(status_code=409, detail='Wallet changed concurrently; please retry')
    tx = WalletTx(tx_id=f'tx_{uuid.uuid4().hex[:24]}', user_id=user_id, kind='admin_adjust', amount=delta,
                  balance_after=round(updated['balance'], 2), note=note, ref_order_id=f'admin_user_adjust:{operation_id}',
                  **{TX_SOURCE[wallet]: delta})
    doc = tx.model_dump()
    doc['wallet_target'] = wallet
    await db.wallet_tx.insert_one(dict(doc))
    doc.pop('_id', None)
    result = {'balance': round(updated['balance'], 2), 'wallets': wallet_breakdown(updated), 'tx': doc}
    await db.wallet_admin_adjustments.update_one({'_id': operation_id}, {'$set': {'status': 'applied', 'result': result}})
    return result
