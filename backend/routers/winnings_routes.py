"""Winnings Wallet + Something Special £50 challenge.

Money is stored in integer PENNIES only. A per-user `winnings_wallets` cache
document is mutated atomically (conditional $inc) to guarantee no negative or
over-spend, while an immutable `winnings_ledger` provides the audit trail.
Completely separate from token/normal/entry/payment wallets.
"""

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from deps import get_db
from auth import get_current_user, require_admin

logger = logging.getLogger("winnings")

router = APIRouter(prefix="/api/winnings", tags=["winnings"])
admin_router = APIRouter(prefix="/api/admin/winnings", tags=["admin-winnings"])

CHALLENGE_ID = "something-special-100"
CHALLENGE_REWARD_PENCE = 5000  # £50.00 — fixed server-side, never from client
CHALLENGE_DURATION_MS = 60_000
EXPECTED_SEQUENCE = list(range(1, 101))
CURRENCY = "GBP"

_indexes_ready = False


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


def _mask_account(acct: str) -> str:
    if not acct:
        return ""
    tail = acct[-4:]
    return f"••••{tail}"


async def _ensure_indexes(db):
    global _indexes_ready
    if _indexes_ready:
        return
    await db.special_challenge_rewards.create_index(
        [("user_id", 1), ("challenge_id", 1)], unique=True,
        name="uniq_user_challenge_reward",
    )
    await db.special_challenge_attempts.create_index([("user_id", 1), ("created_at", -1)])
    await db.winnings_ledger.create_index([("user_id", 1), ("created_at", -1)])
    await db.winnings_ledger.create_index([("type", 1)])
    await db.withdrawal_requests.create_index([("user_id", 1), ("created_at", -1)])
    await db.withdrawal_requests.create_index([("status", 1), ("created_at", -1)])
    await db.winnings_wallets.create_index([("user_id", 1)], unique=True)
    _indexes_ready = True


async def _get_wallet(db, user_id):
    await db.winnings_wallets.update_one(
        {"user_id": user_id},
        {"$setOnInsert": {
            "user_id": user_id, "currency": CURRENCY,
            "available_pence": 0, "pending_pence": 0,
            "total_won_pence": 0, "total_paid_pence": 0,
            "created_at": _now(),
        }},
        upsert=True,
    )
    return await db.winnings_wallets.find_one({"user_id": user_id}, {"_id": 0})


async def _ledger(db, user_id, type_, amount_pence, reference=None, status="posted"):
    await db.winnings_ledger.insert_one({
        "transaction_id": uuid.uuid4().hex,
        "user_id": user_id,
        "type": type_,
        "amount_pence": int(amount_pence),
        "currency": CURRENCY,
        "reference": reference,
        "status": status,
        "created_at": _now(),
        "processed_at": _now() if status == "posted" else None,
    })


async def _audit(db, action, actor_id, target, meta=None):
    await db.winnings_audit_log.insert_one({
        "action": action, "actor_id": actor_id, "target": target,
        "meta": meta or {}, "created_at": _now(),
    })


# ------------------------- Something Special challenge -------------------------

@router.post("/challenge/start")
async def start_challenge(request: Request):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)
    attempt_id = uuid.uuid4().hex
    await db.special_challenge_attempts.insert_one({
        "attempt_id": attempt_id,
        "challenge_id": CHALLENGE_ID,
        "user_id": user["user_id"],
        "started_at": _now(),
        "completed_at": None,
        "elapsed_ms": None,
        "result": None,
        "status": "active",
    })
    already = await db.special_challenge_rewards.find_one(
        {"user_id": user["user_id"], "challenge_id": CHALLENGE_ID}, {"_id": 0}
    )
    return {
        "attempt_id": attempt_id,
        "challenge_id": CHALLENGE_ID,
        "duration_ms": CHALLENGE_DURATION_MS,
        "reward_pence": CHALLENGE_REWARD_PENCE,
        "already_rewarded": bool(already),
    }


class CompleteBody(BaseModel):
    attempt_id: str
    sequence: list[int] = []


@router.post("/challenge/complete")
async def complete_challenge(body: CompleteBody, request: Request):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)

    attempt = await db.special_challenge_attempts.find_one(
        {"attempt_id": body.attempt_id, "user_id": user["user_id"]}
    )
    if not attempt:
        raise HTTPException(404, "Attempt not found")

    now = _now()
    started = attempt["started_at"]
    if isinstance(started, str):
        started = datetime.fromisoformat(started)
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    elapsed_ms = int((now - started).total_seconds() * 1000)

    # Server-authoritative success: correct 1..100 order AND within 60s.
    correct = list(body.sequence) == EXPECTED_SEQUENCE
    in_time = elapsed_ms <= CHALLENGE_DURATION_MS
    success = correct and in_time

    if attempt.get("status") == "active":
        await db.special_challenge_attempts.update_one(
            {"attempt_id": body.attempt_id},
            {"$set": {
                "completed_at": now, "elapsed_ms": elapsed_ms,
                "result": "success" if success else "fail",
                "status": "complete",
            }},
        )

    reward_pence = 0
    already_rewarded = False
    if success:
        try:
            await db.special_challenge_rewards.insert_one({
                "reward_id": uuid.uuid4().hex,
                "user_id": user["user_id"],
                "challenge_id": CHALLENGE_ID,
                "attempt_id": body.attempt_id,
                "reward_pence": CHALLENGE_REWARD_PENCE,
                "reward_status": "credited",
                "credited_at": now,
                "created_at": now,
            })
            # Unique insert succeeded → first ever reward → credit atomically.
            await _get_wallet(db, user["user_id"])
            await db.winnings_wallets.update_one(
                {"user_id": user["user_id"]},
                {"$inc": {
                    "available_pence": CHALLENGE_REWARD_PENCE,
                    "total_won_pence": CHALLENGE_REWARD_PENCE,
                }, "$set": {"updated_at": now}},
            )
            await _ledger(db, user["user_id"], "challenge_reward",
                          CHALLENGE_REWARD_PENCE, reference=body.attempt_id)
            await _audit(db, "challenge_reward", user["user_id"],
                         body.attempt_id, {"amount_pence": CHALLENGE_REWARD_PENCE})
            reward_pence = CHALLENGE_REWARD_PENCE
        except Exception as e:
            # Duplicate key (already rewarded) → idempotent no-op, £0.
            if "duplicate" in str(e).lower() or e.__class__.__name__ == "DuplicateKeyError":
                already_rewarded = True
            else:
                logger.warning(f"reward credit issue: {e}")
                already_rewarded = True

    wallet = await _get_wallet(db, user["user_id"])
    return {
        "result": "success" if success else "fail",
        "elapsed_ms": elapsed_ms,
        "reward_pence": reward_pence,
        "already_rewarded": already_rewarded,
        "available_pence": wallet["available_pence"],
    }


# ------------------------------ Winnings wallet -------------------------------

@router.get("/wallet")
async def get_winnings_wallet(request: Request):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)
    wallet = await _get_wallet(db, user["user_id"])
    return {
        "currency": CURRENCY,
        "available_pence": wallet["available_pence"],
        "pending_pence": wallet["pending_pence"],
        "total_won_pence": wallet["total_won_pence"],
        "total_paid_pence": wallet["total_paid_pence"],
    }


@router.get("/ledger")
async def get_ledger(request: Request, limit: int = 100):
    user = await get_current_user(request)
    db = get_db()
    rows = await db.winnings_ledger.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(min(limit, 200))
    for r in rows:
        r["created_at"] = _iso(r.get("created_at"))
        r["processed_at"] = _iso(r.get("processed_at"))
    return {"items": rows}


# ------------------------------- Withdrawals ---------------------------------

class WithdrawBody(BaseModel):
    amount_pence: int
    account_holder: str
    sort_code: str
    account_number: str


@router.post("/withdraw")
async def request_withdrawal(body: WithdrawBody, request: Request):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)

    amount = int(body.amount_pence)
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if not (body.account_holder and body.sort_code and body.account_number):
        raise HTTPException(400, "Bank details required")

    await _get_wallet(db, user["user_id"])
    # Atomic reserve: only succeeds if available >= amount (prevents over-spend
    # and concurrent double-withdrawal of the same funds).
    res = await db.winnings_wallets.update_one(
        {"user_id": user["user_id"], "available_pence": {"$gte": amount}},
        {"$inc": {"available_pence": -amount, "pending_pence": amount},
         "$set": {"updated_at": _now()}},
    )
    if res.modified_count != 1:
        raise HTTPException(400, "Insufficient available winnings")

    wid = uuid.uuid4().hex
    await db.withdrawal_requests.insert_one({
        "withdrawal_id": wid,
        "user_id": user["user_id"],
        "amount_pence": amount,
        "currency": CURRENCY,
        "status": "processing",
        "account_holder": body.account_holder,
        "sort_code": body.sort_code,
        "account_number": body.account_number,  # restricted; never in user APIs
        "created_at": _now(),
        "processed_at": None,
        "admin_id": None,
        "reject_reason": None,
    })
    await _ledger(db, user["user_id"], "withdrawal_pending", amount, reference=wid,
                  status="pending")
    await _audit(db, "withdrawal_request", user["user_id"], wid,
                 {"amount_pence": amount})
    return {"withdrawal_id": wid, "status": "processing", "amount_pence": amount}


@router.get("/withdrawals")
async def my_withdrawals(request: Request):
    user = await get_current_user(request)
    db = get_db()
    rows = await db.withdrawal_requests.find(
        {"user_id": user["user_id"]}, {"_id": 0, "account_number": 0, "sort_code": 0}
    ).sort("created_at", -1).to_list(100)
    for r in rows:
        r["created_at"] = _iso(r.get("created_at"))
        r["processed_at"] = _iso(r.get("processed_at"))
    return {"items": rows}


# ------------------------------ Admin: payouts --------------------------------

@admin_router.get("/withdrawals")
async def admin_list_withdrawals(request: Request, status: str = None):
    await require_admin(request)
    db = get_db()
    q = {}
    if status:
        q["status"] = status
    rows = await db.withdrawal_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [r["user_id"] for r in rows]
    umap = {}
    if ids:
        for u in await db.users.find({"user_id": {"$in": ids}},
                                     {"_id": 0, "user_id": 1, "name": 1, "email": 1, "public_id": 1}).to_list(len(ids)):
            umap[u["user_id"]] = u
    items = []
    for r in rows:
        u = umap.get(r["user_id"], {})
        items.append({
            "withdrawal_id": r["withdrawal_id"],
            "public_id": u.get("public_id"),
            "name": u.get("name"),
            "email": u.get("email"),
            "amount_pence": r["amount_pence"],
            "status": r["status"],
            "created_at": _iso(r.get("created_at")),
            "processed_at": _iso(r.get("processed_at")),
            "account_holder": r.get("account_holder"),
            "account_number_masked": _mask_account(r.get("account_number", "")),
            "sort_code": r.get("sort_code"),
        })
    return {"items": items}


@admin_router.get("/withdrawals/{withdrawal_id}/bank")
async def admin_withdrawal_bank(withdrawal_id: str, request: Request):
    """Reveals full bank details — authorized admin/super-admin only."""
    admin = await require_admin(request)
    if admin.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Insufficient permissions")
    db = get_db()
    r = await db.withdrawal_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Not found")
    await _audit(db, "withdrawal_bank_view", admin["user_id"], withdrawal_id)
    return {
        "withdrawal_id": withdrawal_id,
        "account_holder": r.get("account_holder"),
        "sort_code": r.get("sort_code"),
        "account_number": r.get("account_number"),
        "amount_pence": r.get("amount_pence"),
        "status": r.get("status"),
    }


@admin_router.post("/withdrawals/{withdrawal_id}/mark-paid")
async def admin_mark_paid(withdrawal_id: str, request: Request):
    admin = await require_admin(request)
    if admin.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Insufficient permissions")
    db = get_db()
    now = _now()
    # Atomic status guard: only transitions from 'processing' → idempotent.
    r = await db.withdrawal_requests.find_one_and_update(
        {"withdrawal_id": withdrawal_id, "status": "processing"},
        {"$set": {"status": "paid", "processed_at": now, "admin_id": admin["user_id"]}},
    )
    if not r:
        cur = await db.withdrawal_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0, "status": 1})
        if not cur:
            raise HTTPException(404, "Not found")
        return {"withdrawal_id": withdrawal_id, "status": cur["status"], "idempotent": True}
    await db.winnings_wallets.update_one(
        {"user_id": r["user_id"]},
        {"$inc": {"pending_pence": -r["amount_pence"], "total_paid_pence": r["amount_pence"]},
         "$set": {"updated_at": now}},
    )
    await _ledger(db, r["user_id"], "withdrawal_paid", r["amount_pence"], reference=withdrawal_id)
    await _audit(db, "withdrawal_paid", admin["user_id"], withdrawal_id,
                 {"amount_pence": r["amount_pence"]})
    return {"withdrawal_id": withdrawal_id, "status": "paid"}


class RejectBody(BaseModel):
    reason: str


@admin_router.post("/withdrawals/{withdrawal_id}/reject")
async def admin_reject(withdrawal_id: str, body: RejectBody, request: Request):
    admin = await require_admin(request)
    if admin.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Insufficient permissions")
    if not body.reason.strip():
        raise HTTPException(400, "Rejection reason required")
    db = get_db()
    now = _now()
    r = await db.withdrawal_requests.find_one_and_update(
        {"withdrawal_id": withdrawal_id, "status": "processing"},
        {"$set": {"status": "rejected", "processed_at": now,
                  "admin_id": admin["user_id"], "reject_reason": body.reason.strip()}},
    )
    if not r:
        cur = await db.withdrawal_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0, "status": 1})
        if not cur:
            raise HTTPException(404, "Not found")
        return {"withdrawal_id": withdrawal_id, "status": cur["status"], "idempotent": True}
    # Release reserved funds back to available (exactly once).
    await db.winnings_wallets.update_one(
        {"user_id": r["user_id"]},
        {"$inc": {"pending_pence": -r["amount_pence"], "available_pence": r["amount_pence"]},
         "$set": {"updated_at": now}},
    )
    await _ledger(db, r["user_id"], "withdrawal_rejected", r["amount_pence"], reference=withdrawal_id)
    await _audit(db, "withdrawal_rejected", admin["user_id"], withdrawal_id,
                 {"amount_pence": r["amount_pence"], "reason": body.reason.strip()})
    return {"withdrawal_id": withdrawal_id, "status": "rejected"}
