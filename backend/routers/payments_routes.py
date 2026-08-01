"""
Prize League — Stripe wallet top-up payments (Flow A / claimable sandbox).

Endpoints:
  POST /api/payments/wallet-topup/checkout   → creates Stripe Checkout session (from lookup_key)
  GET  /api/payments/status/{session_id}      → polls session status; credits wallet on 'paid' (idempotent)
  POST /api/stripe/webhook                    → Stripe webhook (signature verified)

Contract:
  - Frontend sends { lookup_key: 'wallet_topup_10'|'20'|'50'|'100', origin_url } only.
  - Backend derives the amount from the Stripe Price server-side (never trusts client).
  - Wallet is credited exactly once (idempotency guard on payment_status).
"""
from __future__ import annotations
import os
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from deps import get_db
from routers.wallet_routes import _apply_tx

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

payments_router = APIRouter(prefix='/api', tags=['payments'])

ALLOWED_TOPUP_KEYS = {'wallet_topup_10', 'wallet_topup_20', 'wallet_topup_50', 'wallet_topup_100'}


def _current_stripe_mode() -> dict:
    """Return the effective Stripe mode WITHOUT leaking key material.
    A single source of truth for the /admin/payments/stripe-mode diagnostic
    and for the checkout endpoints (so we can log which mode a session was
    minted in — critical when investigating "why is my live deploy still
    showing test payments?" tickets).
    """
    key = os.environ.get("STRIPE_SECRET_KEY") or ""
    pub = os.environ.get("STRIPE_PUBLISHABLE_KEY") or ""
    declared_mode = (os.environ.get("STRIPE_MODE") or "").lower()
    if key.startswith("sk_live_"):
        actual = "live"
    elif key.startswith("sk_test_"):
        actual = "test"
    else:
        actual = "unknown"
    return {
        "actual_mode": actual,                          # derived from the KEY itself — the only truth
        "declared_mode": declared_mode or None,         # STRIPE_MODE env var (informational)
        "secret_key_prefix": (key[:8] + '…') if key else None,
        "publishable_key_prefix": (pub[:8] + '…') if pub else None,
        "webhook_secret_present": bool(STRIPE_WEBHOOK_SECRET),
        "mismatch": bool(declared_mode and actual != "unknown" and declared_mode != actual),
    }


class CheckoutRequest(BaseModel):
    lookup_key: str = Field(..., description="e.g. wallet_topup_10")
    origin_url: str


@payments_router.post('/payments/wallet-topup/checkout')
async def create_topup_checkout(req: CheckoutRequest, request: Request):
    user = await get_current_user(request)
    if req.lookup_key not in ALLOWED_TOPUP_KEYS:
        raise HTTPException(400, f"Invalid top-up package: {req.lookup_key}")

    prices = stripe.Price.list(lookup_keys=[req.lookup_key], active=True, limit=1).data
    if not prices:
        raise HTTPException(500, f"Price not configured for {req.lookup_key}")
    price = prices[0]

    kwargs = dict(
        line_items=[{"price": price.id, "quantity": 1}],
        mode="payment",
        success_url=f"{req.origin_url}/my-account?tab=wallet&topup=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/my-account?tab=wallet&topup=cancel",
        metadata={
            "user_id": user['user_id'],
            "user_email": user.get('email', ''),
            "lookup_key": req.lookup_key,
            "kind": "wallet_topup",
        },
    )
    # SMP-eligible GB account with digital tax code → managed_payments (tax handled by Stripe).
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (e.user_message or "").lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(
                **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required",
            )
        else:
            raise

    db = get_db()
    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "user_id": user['user_id'],
        "lookup_key": req.lookup_key,
        "amount": (price.unit_amount or 0),      # pence
        "currency": price.currency,               # gbp
        "status": "initiated",
        "payment_status": "pending",
        "kind": "wallet_topup",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return {"checkout_url": session.url, "session_id": session.id}


class CustomTopupRequest(BaseModel):
    amount: float = Field(..., ge=5.0, le=1000.0, description='Amount in GBP, min £5, max £1000')
    origin_url: str


@payments_router.post('/payments/wallet-topup/custom')
async def create_custom_topup(req: CustomTopupRequest, request: Request):
    """Custom amount wallet top-up. Creates a Stripe Checkout Session with
    an inline price_data instead of a preconfigured Price lookup_key.
    """
    user = await get_current_user(request)
    amount_pence = int(round(req.amount * 100))
    if amount_pence < 500:
        raise HTTPException(400, 'Minimum top-up is £5')

    kwargs = dict(
        line_items=[{
            "price_data": {
                "currency": "gbp",
                "unit_amount": amount_pence,
                "product_data": {
                    "name": f"Prize League Wallet — £{req.amount:g} top-up",
                    # Digital: Software as a Service — required by Stripe Managed Payments.
                    "tax_code": "txcd_10103001",
                },
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{req.origin_url}/my-account?tab=wallet&topup=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/my-account?tab=wallet&topup=cancel",
        metadata={
            "user_id": user['user_id'],
            "user_email": user.get('email', ''),
            "custom_amount": str(amount_pence),
            "kind": "wallet_topup",
        },
    )
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (e.user_message or "").lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(
                **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required",
            )
        else:
            raise

    db = get_db()
    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "user_id": user['user_id'],
        "lookup_key": None,
        "amount": amount_pence,
        "currency": "gbp",
        "status": "initiated",
        "payment_status": "pending",
        "kind": "wallet_topup",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return {"checkout_url": session.url, "session_id": session.id}


async def _credit_wallet_once(db, tx: dict) -> Optional[dict]:
    """Idempotency: only credit if payment_status is 'paid' AND not yet credited.

    ATOMIC FLIP: we set `wallet_credited=True` inside the same
    `find_one_and_update` filter that requires it to still be false. Only
    the winning caller (the one whose update actually matched) proceeds
    to credit the wallet. This closes the race between the success-page
    poll and the Stripe webhook both firing for the same session.
    """
    if tx.get("wallet_credited"):
        return None
    flip = await db.payment_transactions.find_one_and_update(
        {"session_id": tx["session_id"], "wallet_credited": {"$ne": True}},
        {"$set": {"wallet_credited": True, "credited_at": datetime.now(timezone.utc)}},
        return_document=True,  # AFTER
    )
    if not flip:
        # Someone else won the race; they will do the crediting. We're done.
        return None
    amount_gbp = round(tx["amount"] / 100.0, 2)
    r = await _apply_tx(
        db, tx["user_id"], 'topup',
        amount_gbp,
        note=f"Stripe top-up £{amount_gbp:.2f} — session {tx['session_id'][:14]}…",
    )
    # In-app notification
    from notifications import notify
    tx_receipt = None
    if isinstance(r, dict):
        # _apply_tx returns {'balance', 'tx'}; the tx dict carries tx_id.
        tx_receipt = (r.get('tx') or {}).get('tx_id') or r.get('tx_id')
    await notify(
        db,
        user_id=tx["user_id"],
        kind='topup_success',
        title=f'£{amount_gbp:.2f} added to wallet 💰',
        body='Your Stripe top-up completed. You can now enter contests.',
        ref_tx_id=tx_receipt,
    )
    return r


@payments_router.get('/payments/status/{session_id}')
async def get_status(session_id: str):
    db = get_db()
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Transaction not found")

    # Webhook fallback: if still pending, ask Stripe directly.
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {
                        "status": "completed",
                        "payment_status": "paid",
                        "stripe_payment_intent_id": s.payment_intent,
                        "updated_at": datetime.now(timezone.utc),
                    }},
                )
                record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError:
            pass

    # Credit wallet on first paid observation (idempotent).
    if record.get("payment_status") == "paid" and not record.get("wallet_credited"):
        await _credit_wallet_once(db, record)
        record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})

    return {
        "session_id": record["session_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
        "amount_gbp": round(record["amount"] / 100.0, 2),
        "wallet_credited": bool(record.get("wallet_credited")),
    }


@payments_router.post('/stripe/webhook')
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    db = get_db()
    obj, t = event["data"]["object"], event["type"]

    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {
                "status": "completed",
                "payment_status": obj.get("payment_status", "paid"),
                "stripe_payment_intent_id": obj.get("payment_intent"),
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        rec = await db.payment_transactions.find_one({"session_id": obj["id"]}, {"_id": 0})
        if rec and rec.get("payment_status") == "paid" and not rec.get("wallet_credited"):
            await _credit_wallet_once(db, rec)

    elif t == "checkout.session.async_payment_succeeded":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc)}},
        )
        rec = await db.payment_transactions.find_one({"session_id": obj["id"]}, {"_id": 0})
        if rec and not rec.get("wallet_credited"):
            await _credit_wallet_once(db, rec)

    elif t == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": datetime.now(timezone.utc)}},
        )

    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": datetime.now(timezone.utc)}},
        )

    elif t == "charge.refunded":
        await db.payment_transactions.update_one(
            {"stripe_payment_intent_id": obj.get("payment_intent")},
            {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": datetime.now(timezone.utc)}},
        )

    return {"status": "ok"}


# --- Admin diagnostic ---------------------------------------------------------
@payments_router.get('/admin/payments/stripe-mode')
async def get_stripe_mode(request: Request):
    """Reveal which Stripe environment is REALLY active on this pod.
    Deliberately does NOT leak the full key — only the 8-char prefix.
    Admin-only. Use to debug "prod still shows sandbox" reports.
    """
    from auth import require_admin
    await require_admin(request)
    info = _current_stripe_mode()
    # Round-trip the key with a lightweight balance() call — if the key is
    # invalid or points to a wrong account, Stripe rejects with a 401.
    try:
        balance = stripe.Balance.retrieve()
        info["stripe_api_reachable"] = True
        info["account_livemode"] = getattr(balance, "livemode", None)
    except Exception as e:
        info["stripe_api_reachable"] = False
        info["stripe_api_error"] = str(e)[:200]
    return info
