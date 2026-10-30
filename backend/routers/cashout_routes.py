"""Cash-Out (manual GBP withdrawal of Championship-winnings tokens).

Only WITHDRAWABLE tokens (championship prizes + Something Special winnings)
can be cashed out. 1 token = £1. Purchased and bonus tokens are never
withdrawable. Reservation, payout and release all mutate the single token
wallet atomically via helpers in wallet_routes. Backend-enforced feature
flag (CASHOUT_ENABLED) gates live submissions.
"""

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from typing import Literal

from pydantic import BaseModel, Field

from deps import get_db
from auth import get_current_user, require_admin, require_verified_user
from routers.wallet_routes import (
    _get_or_create_wallet, reserve_withdrawable, settle_withdrawable_paid,
    release_withdrawable,
)
from notifications import notify

logger = logging.getLogger("cashout")

router = APIRouter(prefix="/api/cashout", tags=["cashout"])
admin_router = APIRouter(prefix="/api/admin/cashout", tags=["admin-cashout"])

SETTINGS_KEY = "cashout"
CURRENCY = "GBP"
RATE = 1.0  # 1 token = £1

DEFAULT_SETTINGS = {
    "enabled": False,
    "google_review_url": "",
    "trustpilot_review_url": "",
    "review_mode": "disabled",
}
REVIEW_MODES = ("mandatory", "optional", "disabled")


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


def _mask_acct(acct: str) -> str:
    if not acct:
        return ""
    return f"••••{acct[-4:]}"


def _mask_sort(code: str) -> str:
    if not code:
        return ""
    digits = code.replace("-", "").replace(" ", "")
    return f"••-••-{digits[-2:]}" if len(digits) >= 2 else "••-••-••"


async def get_settings(db) -> dict:
    doc = await db.app_settings.find_one({"key": SETTINGS_KEY}, {"_id": 0}) or {}
    s = dict(DEFAULT_SETTINGS)
    s.update({k: doc.get(k) for k in DEFAULT_SETTINGS if doc.get(k) is not None})
    return s


async def _audit(db, action, actor_id, target, meta=None):
    await db.cashout_audit_log.insert_one({
        "action": action, "actor_id": actor_id, "target": target,
        "meta": meta or {}, "created_at": _now(),
    })


# ------------------------------- Public API ----------------------------------

@router.get("/config")
async def cashout_config(request: Request):
    user = await get_current_user(request)
    db = get_db()
    s = await get_settings(db)
    return {
        "enabled": bool(s["enabled"]),
        "rate": RATE,
        "currency": CURRENCY,
        "google_review_url": s["google_review_url"],
        "trustpilot_review_url": s["trustpilot_review_url"],
        "review_mode": s["review_mode"],
        "has_review_bypass": bool((await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "cashout_review_bypass": 1}) or {}).get("cashout_review_bypass")),
    }


class ReviewBody(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    feedback: str = Field("", max_length=2000)


@router.post("/review")
async def submit_review(body: ReviewBody, request: Request):
    user = await get_current_user(request)
    db = get_db()
    rid = "RV-" + uuid.uuid4().hex[:12].upper()
    await db.cashout_reviews.insert_one({
        "review_id": rid, "user_id": user["user_id"], "rating": body.rating,
        "feedback": body.feedback.strip(), "context": "cashout", "withdrawal_id": None, "created_at": _now(),
    })
    return {"review_id": rid}


@router.get("/summary")
async def cashout_summary(request: Request):
    user = await get_current_user(request)
    db = get_db()
    w = await _get_or_create_wallet(db, user["user_id"])
    kyc = await db.kyc.find_one({"user_id": user["user_id"]}, {"_id": 0, "status": 1})
    return {
        "total_tokens": w["total_tokens"],
        "tokens": w["spendable_tokens"],
        "bonus_tokens": w["bonus_tokens"],
        "available_to_cash_out": w["available_to_cash_out"],
        "pending_cash_out": w.get("pending_cash_out", 0),
        "rate": RATE,
        "currency": CURRENCY,
        "kyc_status": (kyc or {}).get("status", "none"),
    }


class BankAccountBody(BaseModel):
    account_holder: str
    email: str
    sort_code: str
    account_number: str
    iban: str
    bacs: str


@router.post("/bank-accounts")
async def add_bank_account(body: BankAccountBody, request: Request):
    user = await get_current_user(request)
    db = get_db()
    holder = (body.account_holder or "").strip()
    email = (body.email or "").strip()
    sort_code = (body.sort_code or "").strip()
    account_number = (body.account_number or "").strip()
    iban = (body.iban or "").strip()
    bacs = (body.bacs or "").strip()
    if not holder or not email or not sort_code or not account_number or not iban or not bacs:
        raise HTTPException(400, "All bank fields are required")
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(400, "Invalid email address")
    digits = account_number.replace(" ", "")
    if not digits.isdigit() or not (6 <= len(digits) <= 12):
        raise HTTPException(400, "Invalid account number")
    acct_id = uuid.uuid4().hex
    await db.bank_accounts.insert_one({
        "bank_account_id": acct_id,
        "user_id": user["user_id"],
        "account_holder": holder,
        "email": email,
        "sort_code": sort_code,
        "account_number": digits,  # restricted; never returned to users in full
        "iban": iban,
        "bacs": bacs,
        "created_at": _now(),
    })
    return {
        "bank_account_id": acct_id,
        "account_holder": holder,
        "email": email,
        "sort_code_masked": _mask_sort(sort_code),
        "account_number_masked": _mask_acct(digits),
        "iban_masked": _mask_acct(iban),
        "bacs_masked": _mask_acct(bacs),
    }


@router.get("/bank-accounts")
async def list_bank_accounts(request: Request):
    user = await get_current_user(request)
    db = get_db()
    rows = await db.bank_accounts.find(
        {"user_id": user["user_id"]}, {"_id": 0, "account_number": 0}
    ).sort("created_at", -1).to_list(50)
    out = []
    for r in rows:
        full = await db.bank_accounts.find_one(
            {"bank_account_id": r["bank_account_id"]}, {"_id": 0, "account_number": 1}
        )
        out.append({
            "bank_account_id": r["bank_account_id"],
            "account_holder": r.get("account_holder"),
            "email": r.get("email"),
            "sort_code_masked": _mask_sort(r.get("sort_code", "")),
            "account_number_masked": _mask_acct((full or {}).get("account_number", "")),
            "iban_masked": _mask_acct(r.get("iban", "")),
            "bacs_masked": _mask_acct(r.get("bacs", "")),
        })
    return {"items": out}


class CashOutBody(BaseModel):
    amount_tokens: int
    bank_account_id: str
    review_id: str | None = None


@router.post("/request")
async def create_cashout(body: CashOutBody, request: Request):
    user = await require_verified_user(request)
    db = get_db()

    settings = await get_settings(db)
    if not settings["enabled"]:
        raise HTTPException(403, "Cash out is not available yet")

    amount = int(body.amount_tokens)
    if amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")

    acct = await db.bank_accounts.find_one(
        {"bank_account_id": body.bank_account_id, "user_id": user["user_id"]}
    )
    if not acct:
        raise HTTPException(404, "Bank account not found")

    kyc = await db.kyc.find_one({"user_id": user["user_id"]}, {"_id": 0, "status": 1})
    kyc_status = (kyc or {}).get("status", "none")
    # User may submit while KYC is pending; admin reviews before paying.
    if kyc_status == "rejected":
        raise HTTPException(400, "Your KYC was rejected. Please resubmit before cashing out.")

    review = None
    if body.review_id:
        review = await db.cashout_reviews.find_one({"review_id": body.review_id, "user_id": user["user_id"], "withdrawal_id": None})
        if not review:
            raise HTTPException(400, "Review not found or already used")
    bypass = False
    if settings["review_mode"] == "mandatory" and not review:
        bypass = bool(await db.users.find_one_and_update(
            {"user_id": user["user_id"], "cashout_review_bypass": True},
            {"$set": {"cashout_review_bypass": False, "cashout_review_bypass_used_at": _now()}}))
        if not bypass:
            raise HTTPException(409, {"code": "REVIEW_REQUIRED", "message": "Please leave a quick review, or contact Support to withdraw without one."})

    # Atomic reserve of withdrawable tokens (prevents double-withdrawal).
    ok = await reserve_withdrawable(db, user["user_id"], float(amount))
    if not ok:
        raise HTTPException(400, "Insufficient withdrawable balance")

    wid = "WD-" + uuid.uuid4().hex[:12].upper()
    now = _now()
    try:
        await db.cashout_requests.insert_one({
            "withdrawal_id": wid,
            "user_id": user["user_id"],
            "amount_tokens": amount,
            "amount_gbp": round(amount * RATE, 2),
            "conversion_rate": RATE,
            "currency": CURRENCY,
            "status": "processing",
            "bank_account_id": body.bank_account_id,
            "account_holder": acct.get("account_holder"),
            "bank_email": acct.get("email"),
            "sort_code": acct.get("sort_code"),
            "account_number": acct.get("account_number"),  # restricted
            "iban": acct.get("iban"),
            "bacs": acct.get("bacs"),
            "kyc_status_snapshot": kyc_status,
            "created_at": now,
            "updated_at": now,
            "paid_at": None,
            "admin_id": None,
            "admin_notes": None,
            "reject_reason": None,
        })
    except Exception:
        # Defense-in-depth: never leave tokens reserved without a request.
        await release_withdrawable(db, user["user_id"], float(amount))
        raise HTTPException(500, "Could not create cash-out request")
    if review:
        await db.cashout_reviews.update_one({"review_id": review["review_id"]}, {"$set": {"withdrawal_id": wid}})
    await _audit(db, "cashout_request", user["user_id"], wid,
                 {"amount_tokens": amount, "kyc": kyc_status, "review_id": (review or {}).get("review_id"), "review_bypass": bypass})
    return {
        "withdrawal_id": wid,
        "status": "processing",
        "amount_tokens": amount,
        "amount_gbp": round(amount * RATE, 2),
        "kyc_status": kyc_status,
        "google_review_url": settings["google_review_url"],
        "trustpilot_review_url": settings["trustpilot_review_url"],
    }


@router.get("/requests")
async def my_cashouts(request: Request):
    user = await get_current_user(request)
    db = get_db()
    rows = await db.cashout_requests.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "account_number": 0, "sort_code": 0, "iban": 0, "bacs": 0},
    ).sort("created_at", -1).to_list(100)
    for r in rows:
        r["created_at"] = _iso(r.get("created_at"))
        r["paid_at"] = _iso(r.get("paid_at"))
        r["updated_at"] = _iso(r.get("updated_at"))
        r["account_number_masked"] = _mask_acct("")
    return {"items": rows}


# ------------------------------- Admin API -----------------------------------

def _require_payout_admin(admin):
    if admin.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Insufficient permissions")


@admin_router.get("/config")
async def admin_get_config(request: Request):
    await require_admin(request)
    db = get_db()
    return await get_settings(db)


class ConfigBody(BaseModel):
    enabled: bool | None = None
    google_review_url: str | None = None
    trustpilot_review_url: str | None = None
    review_mode: Literal["mandatory", "optional", "disabled"] | None = None


@admin_router.put("/config")
async def admin_update_config(body: ConfigBody, request: Request):
    admin = await require_admin(request)
    _require_payout_admin(admin)
    db = get_db()
    update = {}
    if body.enabled is not None:
        update["enabled"] = bool(body.enabled)
    if body.google_review_url is not None:
        update["google_review_url"] = body.google_review_url.strip()
    if body.trustpilot_review_url is not None:
        update["trustpilot_review_url"] = body.trustpilot_review_url.strip()
    if body.review_mode is not None:
        update["review_mode"] = body.review_mode
    if update:
        update["key"] = SETTINGS_KEY
        update["updated_at"] = _now()
        await db.app_settings.update_one(
            {"key": SETTINGS_KEY}, {"$set": update}, upsert=True
        )
        await _audit(db, "cashout_config_update", admin["user_id"], SETTINGS_KEY, update)
    return await get_settings(db)


@admin_router.get("/reviews")
async def admin_reviews(request: Request):
    await require_admin(request)
    db = get_db()
    rows = await db.cashout_reviews.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    ids = list({r["user_id"] for r in rows})
    users = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1})}
    for r in rows:
        r["created_at"] = _iso(r.get("created_at"))
        r["name"] = users.get(r["user_id"], {}).get("name")
        r["email"] = users.get(r["user_id"], {}).get("email")
    return {"items": rows}


class BypassBody(BaseModel):
    email: str
    reason: str = Field(..., min_length=5, max_length=300)


@admin_router.post("/review-bypass")
async def grant_review_bypass(body: BypassBody, request: Request):
    admin = await require_admin(request)
    _require_payout_admin(admin)
    db = get_db()
    u = await db.users.find_one({"email": body.email.strip().lower()}, {"_id": 0, "user_id": 1, "email": 1})
    if not u:
        raise HTTPException(404, "No user with that email")
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"cashout_review_bypass": True}})
    await _audit(db, "cashout_review_bypass_granted", admin["user_id"], u["user_id"], {"reason": body.reason.strip()})
    return {"ok": True, "user_id": u["user_id"]}


@admin_router.get("/withdrawals")
async def admin_list(request: Request, status: str = None):
    await require_admin(request)
    db = get_db()
    q = {}
    if status:
        q["status"] = status
    rows = await db.cashout_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = list({r["user_id"] for r in rows})
    umap = {}
    if ids:
        for u in await db.users.find(
            {"user_id": {"$in": ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "public_id": 1},
        ).to_list(len(ids)):
            umap[u["user_id"]] = u
    items = []
    for r in rows:
        u = umap.get(r["user_id"], {})
        items.append({
            "withdrawal_id": r["withdrawal_id"],
            "user_id": r["user_id"],
            "public_id": u.get("public_id"),
            "name": u.get("name"),
            "amount_tokens": r["amount_tokens"],
            "amount_gbp": r["amount_gbp"],
            "status": r["status"],
            "kyc_status_snapshot": r.get("kyc_status_snapshot"),
            "created_at": _iso(r.get("created_at")),
            "paid_at": _iso(r.get("paid_at")),
            "account_holder": r.get("account_holder"),
            "email": r.get("email"),
            "sort_code_masked": _mask_sort(r.get("sort_code", "")),
            "account_number_masked": _mask_acct(r.get("account_number", "")),
        })
    return {"items": items}


@admin_router.get("/withdrawals/{withdrawal_id}")
async def admin_detail(withdrawal_id: str, request: Request):
    admin = await require_admin(request)
    _require_payout_admin(admin)
    db = get_db()
    r = await db.cashout_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Not found")
    u = await db.users.find_one(
        {"user_id": r["user_id"]},
        {"_id": 0, "name": 1, "email": 1, "public_id": 1},
    ) or {}
    kyc = await db.kyc.find_one({"user_id": r["user_id"]}, {"_id": 0}) or {}
    await _audit(db, "cashout_bank_view", admin["user_id"], withdrawal_id)
    return {
        "withdrawal_id": r["withdrawal_id"],
        "user": {"name": u.get("name"), "email": u.get("email"), "public_id": u.get("public_id")},
        "amount_tokens": r["amount_tokens"],
        "amount_gbp": r["amount_gbp"],
        "conversion_rate": r["conversion_rate"],
        "status": r["status"],
        "kyc_status_snapshot": r.get("kyc_status_snapshot"),
        "kyc_current_status": kyc.get("status", "none"),
        "bank": {
            "account_holder": r.get("account_holder"),
            "email": r.get("bank_email"),
            "sort_code": r.get("sort_code"),
            "account_number": r.get("account_number"),
            "iban": r.get("iban"),
            "bacs": r.get("bacs"),
        },
        "created_at": _iso(r.get("created_at")),
        "paid_at": _iso(r.get("paid_at")),
        "admin_notes": r.get("admin_notes"),
        "reject_reason": r.get("reject_reason"),
    }


class MarkPaidBody(BaseModel):
    notification_message: str


@admin_router.post("/withdrawals/{withdrawal_id}/mark-paid")
async def admin_mark_paid(withdrawal_id: str, body: MarkPaidBody, request: Request):
    admin = await require_admin(request)
    _require_payout_admin(admin)
    message = (body.notification_message or "").strip()
    if not message:
        raise HTTPException(400, "Notification message required")
    db = get_db()
    now = _now()
    r = await db.cashout_requests.find_one_and_update(
        {"withdrawal_id": withdrawal_id, "status": "processing"},
        {"$set": {"status": "paid", "paid_at": now, "updated_at": now,
                  "admin_id": admin["user_id"]}},
    )
    if not r:
        cur = await db.cashout_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0, "status": 1})
        if not cur:
            raise HTTPException(404, "Not found")
        return {"withdrawal_id": withdrawal_id, "status": cur["status"], "idempotent": True}
    # Permanently consume reserved tokens (exactly once — guarded by status).
    await settle_withdrawable_paid(db, r["user_id"], float(r["amount_tokens"]))
    await notify(
        db,
        user_id=r["user_id"],
        kind="cashout_paid",
        title="Cash-out paid",
        body=message,
        ref_tx_id=withdrawal_id,
    )
    await _audit(db, "cashout_paid", admin["user_id"], withdrawal_id,
                 {"amount_tokens": r["amount_tokens"], "notification_message": message})
    return {"withdrawal_id": withdrawal_id, "status": "paid"}


class RejectBody(BaseModel):
    reason: str
    notification_message: str


@admin_router.post("/withdrawals/{withdrawal_id}/reject")
async def admin_reject(withdrawal_id: str, body: RejectBody, request: Request):
    admin = await require_admin(request)
    _require_payout_admin(admin)
    if not (body.reason or "").strip():
        raise HTTPException(400, "Rejection reason required")
    message = (body.notification_message or "").strip()
    if not message:
        raise HTTPException(400, "Notification message required")
    db = get_db()
    now = _now()
    r = await db.cashout_requests.find_one_and_update(
        {"withdrawal_id": withdrawal_id, "status": "processing"},
        {"$set": {"status": "rejected", "paid_at": None, "updated_at": now,
                  "admin_id": admin["user_id"], "reject_reason": body.reason.strip()}},
    )
    if not r:
        cur = await db.cashout_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0, "status": 1})
        if not cur:
            raise HTTPException(404, "Not found")
        return {"withdrawal_id": withdrawal_id, "status": cur["status"], "idempotent": True}
    # Release reserved tokens back to available withdrawable (exactly once).
    await release_withdrawable(db, r["user_id"], float(r["amount_tokens"]))
    await notify(
        db,
        user_id=r["user_id"],
        kind="cashout_rejected",
        title="Cash-out rejected",
        body=message,
        ref_tx_id=withdrawal_id,
    )
    await _audit(db, "cashout_rejected", admin["user_id"], withdrawal_id,
                 {"amount_tokens": r["amount_tokens"], "reason": body.reason.strip(),
                  "notification_message": message})
    return {"withdrawal_id": withdrawal_id, "status": "rejected"}
