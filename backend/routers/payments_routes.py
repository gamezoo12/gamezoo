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
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlsplit

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_verified_user
from deps import get_db
from routers.wallet_routes import _apply_tx_idempotent

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
logger = logging.getLogger('gz.payments')

payments_router = APIRouter(prefix='/api', tags=['payments'])

ALLOWED_TOPUP_KEYS = {'wallet_topup_5', 'wallet_topup_10', 'wallet_topup_20', 'wallet_topup_50', 'wallet_topup_100'}


def _checkout_site_origin() -> str:
    """Return the configured frontend origin, never a caller-provided URL."""
    value = (os.environ.get('PUBLIC_SITE_URL') or 'https://prizeleague.co.uk').strip()
    parsed = urlsplit(value)
    local_http = parsed.scheme == 'http' and parsed.hostname in {'localhost', '127.0.0.1'}
    if (parsed.scheme != 'https' and not local_http) or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=503, detail='Public site URL is not configured safely')
    if parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise HTTPException(status_code=503, detail='Public site URL must contain only an origin')
    return f'{parsed.scheme}://{parsed.netloc}'


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
    publishable_mode = 'live' if pub.startswith('pk_live_') else 'test' if pub.startswith('pk_test_') else 'unknown'
    return {
        "actual_mode": actual,                          # derived from the KEY itself — the only truth
        "declared_mode": declared_mode or None,         # STRIPE_MODE env var (informational)
        "environment": (os.environ.get('ENVIRONMENT') or '').strip().lower() or None,
        "app_env": (os.environ.get('APP_ENV') or '').strip().lower() or None,
        "publishable_mode": publishable_mode,
        "secret_key_prefix": (key[:8] + '…') if key else None,
        "publishable_key_prefix": (pub[:8] + '…') if pub else None,
        "webhook_secret_present": bool(os.environ.get('STRIPE_WEBHOOK_SECRET', '').strip()),
        "mismatch": bool(
            (declared_mode and actual != "unknown" and declared_mode != actual)
            or (pub and actual != "unknown" and publishable_mode != actual)
        ),
    }


def _require_stripe_configuration(*, require_webhook: bool = False) -> str:
    info = _current_stripe_mode()
    environments = {
        value.strip().lower()
        for value in (os.environ.get('ENVIRONMENT') or '', os.environ.get('APP_ENV') or '')
        if value.strip()
    }
    production_environments = {'prod', 'production', 'live'}
    nonproduction_environments = {'development', 'dev', 'local', 'test', 'testing', 'staging'}
    production = bool(environments & production_environments)
    if production and environments & nonproduction_environments:
        raise HTTPException(status_code=503, detail='Stripe environment markers conflict')
    if info['actual_mode'] == 'unknown' or info['mismatch']:
        raise HTTPException(status_code=503, detail='Stripe keys are missing or mode-mismatched')
    if info['actual_mode'] == 'live' and not production:
        raise HTTPException(status_code=503, detail='Live Stripe keys require an explicit production environment')
    if production and (info['actual_mode'] != 'live' or info['publishable_mode'] != 'live'):
        raise HTTPException(status_code=503, detail='Production requires matching live Stripe keys')
    if (require_webhook or production) and not info['webhook_secret_present']:
        raise HTTPException(status_code=503, detail='Stripe webhook secret is not configured')
    stripe.api_key = os.environ['STRIPE_SECRET_KEY']
    return info['actual_mode']


def _validate_paid_session(record: dict, session: dict, mode: str) -> dict:
    if session.get('id') != record.get('session_id'):
        raise HTTPException(status_code=503, detail='Stripe session does not match payment record')
    if str(session.get('currency') or '').lower() != 'gbp' or str(record.get('currency') or '').lower() != 'gbp':
        raise HTTPException(status_code=503, detail='Payment currency does not match the GBP wallet package')
    expected_amount = int(record.get('amount') or 0)
    amount_total = int(session.get('amount_total') or 0)
    amount_subtotal = session.get('amount_subtotal')
    if expected_amount <= 0 or amount_total < expected_amount or (
        amount_subtotal is not None and int(amount_subtotal) != expected_amount
    ):
        raise HTTPException(status_code=503, detail='Stripe amount does not match the recorded package')
    live_mode = session.get('livemode')
    if live_mode is not None and bool(live_mode) != (mode == 'live'):
        raise HTTPException(status_code=503, detail='Stripe session mode does not match configured keys')
    recorded_mode = record.get('stripe_livemode')
    if recorded_mode is not None and bool(recorded_mode) != (mode == 'live'):
        raise HTTPException(status_code=503, detail='Payment record mode does not match configured keys')
    metadata = session.get('metadata') or {}
    if metadata.get('user_id') and metadata.get('user_id') != record.get('user_id'):
        raise HTTPException(status_code=503, detail='Stripe session owner does not match payment record')
    return {
        'amount_received_pence': amount_total,
        'amount_subtotal_pence': int(amount_subtotal) if amount_subtotal is not None else expected_amount,
        'amount_tax_pence': int(((session.get('total_details') or {}).get('amount_tax')) or 0),
        'stripe_payment_intent_id': session.get('payment_intent'),
        'stripe_livemode': bool(live_mode) if live_mode is not None else None,
    }


class CheckoutRequest(BaseModel):
    lookup_key: str = Field(..., description="e.g. wallet_topup_10")
    origin_url: str


@payments_router.post('/payments/wallet-topup/checkout')
async def create_topup_checkout(req: CheckoutRequest, request: Request):
    user = await require_verified_user(request)
    stripe_mode = _require_stripe_configuration()
    site_origin = _checkout_site_origin()
    if req.lookup_key not in ALLOWED_TOPUP_KEYS:
        raise HTTPException(400, f"Invalid top-up package: {req.lookup_key}")

    # Derive amount + token count directly from the lookup_key. This
    # eliminates any dependency on the Stripe catalog having a matching
    # Price row — the app is now zero-config: no `setup_stripe.py` run
    # required for launch. We still SEND the lookup_key in metadata so a
    # customer running the seeded catalog gets identical downstream data.
    #
    # Contract: `wallet_topup_<tokens>` where tokens is an int and 1 token = £1.
    try:
        tokens = int(req.lookup_key.rsplit('_', 1)[1])
    except (ValueError, IndexError):
        raise HTTPException(400, f"Malformed lookup key: {req.lookup_key}")
    amount_pence = tokens * 100

    kwargs = dict(
        line_items=[{
            "quantity": 1,
            "price_data": {
                "currency": "gbp",
                "unit_amount": amount_pence,
                "product_data": {
                    "name": f"Prize League — {tokens} tokens (£{tokens})",
                    "tax_code": "txcd_10103001",  # Digital: SaaS
                },
            },
        }],
        mode="payment",
        success_url=f"{site_origin}/my-account/wallet?topup=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{site_origin}/my-account/wallet?topup=cancel",
        metadata={
            "user_id": user['user_id'],
            "user_email": user.get('email', ''),
            "lookup_key": req.lookup_key,
            "tokens": str(tokens),
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
    if not session or not getattr(session, 'id', None) or not getattr(session, 'url', None):
        raise HTTPException(status_code=502, detail='Stripe did not return a valid Checkout session')
    if getattr(session, 'livemode', None) is not None and bool(session.livemode) != (stripe_mode == 'live'):
        raise HTTPException(status_code=502, detail='Stripe returned a Checkout session in the wrong mode')

    db = get_db()
    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "user_id": user['user_id'],
        "lookup_key": req.lookup_key,
        "amount": amount_pence,                    # pence
        "currency": "gbp",                          # gbp
        "status": "initiated",
        "payment_status": "pending",
        "kind": "wallet_topup",
        "stripe_livemode": stripe_mode == 'live',
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return {"checkout_url": session.url, "session_id": session.id}


class CustomTopupRequest(BaseModel):
    # Tokens: integer amount, minimum 5, maximum 1000 (1 token = £1).
    amount: int = Field(..., ge=5, le=1000, description='Number of tokens to buy (1 token = £1). Min 5.')
    origin_url: str


@payments_router.post('/payments/wallet-topup/custom')
async def create_custom_topup(req: CustomTopupRequest, request: Request):
    """Custom-amount token top-up. `amount` is the number of tokens (each
    worth £1). Creates a Stripe Checkout Session with inline price_data.
    """
    user = await require_verified_user(request)
    stripe_mode = _require_stripe_configuration()
    site_origin = _checkout_site_origin()
    tokens = int(req.amount)
    amount_pence = tokens * 100
    if tokens < 5:
        raise HTTPException(400, 'Minimum top-up is 5 tokens')

    kwargs = dict(
        line_items=[{
            "price_data": {
                "currency": "gbp",
                "unit_amount": amount_pence,
                "product_data": {
                    "name": f"Prize League — {tokens} tokens (£{tokens})",
                    # Digital: Software as a Service — required by Stripe Managed Payments.
                    "tax_code": "txcd_10103001",
                },
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{site_origin}/my-account/wallet?topup=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{site_origin}/my-account/wallet?topup=cancel",
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
    if not session or not getattr(session, 'id', None) or not getattr(session, 'url', None):
        raise HTTPException(status_code=502, detail='Stripe did not return a valid Checkout session')
    if getattr(session, 'livemode', None) is not None and bool(session.livemode) != (stripe_mode == 'live'):
        raise HTTPException(status_code=502, detail='Stripe returned a Checkout session in the wrong mode')

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
        "stripe_livemode": stripe_mode == 'live',
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return {"checkout_url": session.url, "session_id": session.id}


async def _credit_wallet_once(db, tx: dict) -> Optional[dict]:
    """Apply a paid Stripe session through the wallet's recoverable idempotency marker."""
    if tx.get('wallet_credited') or tx.get('payment_status') != 'paid':
        return None
    current = await db.payment_transactions.find_one(
        {'session_id': tx.get('session_id'), 'payment_status': 'paid'}, {'_id': 0})
    if not current or current.get('wallet_credited'):
        return None
    mode = _require_stripe_configuration()
    settlement = {
        'id': current.get('session_id'),
        'currency': current.get('currency'),
        'amount_total': current.get('amount_received_pence'),
        'amount_subtotal': current.get('amount_subtotal_pence'),
        'livemode': current.get('stripe_livemode'),
        'payment_intent': current.get('stripe_payment_intent_id'),
        'metadata': {'user_id': current.get('user_id')},
    }
    _validate_paid_session(current, settlement, mode)
    amount_gbp = round(int(current['amount']) / 100.0, 2)
    tokens = int(round(amount_gbp))
    result = await _apply_tx_idempotent(
        db, current['user_id'], 'topup', amount_gbp,
        note=f"Bought {tokens} tokens (£{amount_gbp:.2f}) — Stripe session {current['session_id'][:14]}…",
        ref_order_id=f"stripe_checkout:{current['session_id']}",
    )
    await db.payment_transactions.update_one(
        {'session_id': current['session_id'], 'payment_status': 'paid', 'wallet_credited': {'$ne': True}},
        {'$set': {'wallet_credited': True, 'credited_at': datetime.now(timezone.utc),
                  'wallet_tx_id': result['tx']['tx_id']}},
    )
    # In-app notification
    if not result.get('idempotent_replay'):
        from notifications import notify
        await notify(
            db,
            user_id=current['user_id'],
            kind='topup_success',
            title=f'+{tokens} tokens added 🪙',
            body=f'You now have tokens ready to enter contests. Purchase total £{amount_gbp:.2f}.',
            ref_tx_id=result['tx']['tx_id'],
        )

    # Bonus qualification is based ONLY on this verified Stripe payment.
    # A normal £5 top-up remains valid but does not qualify.
    try:
        from routers.referral_routes import record_verified_topup

        await record_verified_topup(
            db,
            current["user_id"],
            amount_gbp,
            current.get("session_id"),
        )
        from services.influencer_commissions import record_topup_commission
        await record_topup_commission(db, current['user_id'], current['session_id'])
    except Exception:
        # Never fail or reverse a valid Stripe wallet credit because the
        # promotional reward subsystem had a temporary problem.
        import logging
        logging.exception(
            'Bonus qualification failed after verified top-up user=%s session=%s',
            current.get("user_id"),
            current.get("session_id"),
        )

    return result


@payments_router.get('/payments/status/{session_id}')
async def get_status(session_id: str):
    db = get_db()
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Transaction not found")

    # Status alone is not a settlement signal: async Checkout sessions can be complete but unpaid.
    terminal = {'paid', 'failed', 'expired', 'refunded', 'disputed'}
    if record.get('payment_status') not in terminal:
        try:
            mode = _require_stripe_configuration()
            s = stripe.checkout.Session.retrieve(session_id)
            if s.get('payment_status') == 'paid':
                settlement = _validate_paid_session(record, s, mode)
                await db.payment_transactions.update_one(
                    {'session_id': session_id, 'payment_status': {'$nin': ['paid', 'failed', 'expired', 'refunded', 'disputed']}},
                    {'$set': {'status': 'completed', 'payment_status': 'paid', **settlement,
                              'updated_at': datetime.now(timezone.utc)}},
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
    secret = os.environ.get('STRIPE_WEBHOOK_SECRET', '').strip()
    if not secret:
        raise HTTPException(status_code=503, detail='Stripe webhook secret is not configured')
    mode = _require_stripe_configuration(require_webhook=True)
    try:
        event = stripe.Webhook.construct_event(payload, sig, secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")
    except ValueError:
        raise HTTPException(400, 'Invalid webhook payload')

    live_mode = event.get('livemode')
    if live_mode is not None and bool(live_mode) != (mode == 'live'):
        raise HTTPException(status_code=400, detail='Webhook mode does not match configured Stripe keys')

    db = get_db()
    obj, t = event["data"]["object"], event["type"]

    if t == "checkout.session.completed":
        record = await db.payment_transactions.find_one({'session_id': obj['id']}, {'_id': 0})
        if not record:
            raise HTTPException(status_code=503, detail='No local payment record for Stripe Checkout session')
        payment_status = obj.get('payment_status') or 'unpaid'
        if payment_status == 'paid':
            settlement = _validate_paid_session(record, obj, mode)
            await db.payment_transactions.update_one(
                {'session_id': obj['id'], 'payment_status': {'$nin': ['paid', 'disputed', 'refunded']}},
                {'$set': {'status': 'completed', 'payment_status': 'paid', **settlement,
                          'updated_at': datetime.now(timezone.utc)}},
            )
        else:
            await db.payment_transactions.update_one(
                {'session_id': obj['id'], 'payment_status': {'$nin': ['paid', 'disputed', 'refunded']}},
                {'$set': {'status': 'completed', 'payment_status': 'unpaid',
                          'stripe_payment_intent_id': obj.get('payment_intent'),
                          'stripe_livemode': bool(obj.get('livemode')) if obj.get('livemode') is not None else None,
                          'updated_at': datetime.now(timezone.utc)}},
            )
        rec = await db.payment_transactions.find_one({"session_id": obj["id"]}, {"_id": 0})
        if rec and rec.get("payment_status") == "paid" and not rec.get("wallet_credited"):
            await _credit_wallet_once(db, rec)

    elif t == "checkout.session.async_payment_succeeded":
        record = await db.payment_transactions.find_one({'session_id': obj['id']}, {'_id': 0})
        if not record:
            raise HTTPException(status_code=503, detail='No local payment record for Stripe Checkout session')
        settlement = _validate_paid_session(record, obj, mode)
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$nin": ["disputed", "refunded"]}},
            {"$set": {"status": "completed", "payment_status": "paid", **settlement,
                       "updated_at": datetime.now(timezone.utc)}},
        )
        rec = await db.payment_transactions.find_one({"session_id": obj["id"]}, {"_id": 0})
        if rec and not rec.get("wallet_credited"):
            await _credit_wallet_once(db, rec)

    elif t == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "wallet_credited": {'$ne': True},
             "payment_status": {"$nin": ["paid", "refunded", "disputed"]}},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": datetime.now(timezone.utc)}},
        )

    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "wallet_credited": {'$ne': True},
             "payment_status": {"$nin": ["paid", "refunded", "disputed"]}},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": datetime.now(timezone.utc)}},
        )

    elif t == "charge.refunded":
        payment = await db.payment_transactions.find_one(
            {"stripe_payment_intent_id": obj.get("payment_intent")}, {'_id': 0, 'session_id': 1})
        await db.payment_transactions.update_one(
            {"stripe_payment_intent_id": obj.get("payment_intent")},
            {"$set": {"status": "refunded", "payment_status": "refunded",
                       "amount_refunded_pence": int(obj.get('amount_refunded') or 0),
                       "updated_at": datetime.now(timezone.utc)}},
        )
        if payment and payment.get('session_id'):
            from services.influencer_commissions import reverse_payment_commissions
            await reverse_payment_commissions(db, payment['session_id'], int(obj.get('amount_refunded') or 0))

    elif t in ('charge.dispute.created', 'charge.dispute.funds_withdrawn',
               'charge.dispute.funds_reinstated', 'charge.dispute.closed'):
        dispute_id = obj.get('id')
        payment_intent = obj.get('payment_intent')
        if isinstance(payment_intent, dict):
            payment_intent = payment_intent.get('id')
        if not payment_intent and obj.get('charge'):
            charge_id = obj.get('charge')
            if isinstance(charge_id, dict):
                charge_id = charge_id.get('id')
            try:
                charge = await asyncio.to_thread(stripe.Charge.retrieve, charge_id)
                payment_intent = getattr(charge, 'payment_intent', None)
            except Exception:
                logger.exception('Could not resolve Stripe charge dispute %s to payment intent', dispute_id)
        if not payment_intent:
            raise HTTPException(status_code=503, detail='Could not map Stripe dispute to its payment')
        payment = await db.payment_transactions.find_one(
            {'stripe_payment_intent_id': payment_intent},
            {'_id': 0, 'session_id': 1, 'amount_received_pence': 1, 'dispute_status': 1},
        )
        if payment and payment.get('session_id') and dispute_id:
            session_id = payment['session_id']
            from services.influencer_commissions import hold_payment_commissions, resolve_payment_dispute
            if t in ('charge.dispute.created', 'charge.dispute.funds_withdrawn'):
                if payment.get('dispute_status') in ('won', 'lost'):
                    return {'status': 'ok', 'duplicate_dispute': True}
                await db.payment_transactions.update_one(
                    {'session_id': session_id},
                    {'$set': {'status': 'disputed', 'payment_status': 'disputed',
                              'stripe_dispute_id': dispute_id, 'dispute_status': obj.get('status', 'under_review'),
                              'updated_at': datetime.now(timezone.utc)}},
                )
                await hold_payment_commissions(db, session_id, dispute_id)
            else:
                outcome = 'won' if t == 'charge.dispute.funds_reinstated' or obj.get('status') == 'won' else \
                    'lost' if obj.get('status') == 'lost' else ''
                if outcome:
                    await resolve_payment_dispute(
                        db, session_id, dispute_id, outcome,
                        int(obj.get('amount') or payment.get('amount_received_pence') or 0),
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
        secret = os.environ.get('STRIPE_SECRET_KEY', '').strip()
        if not secret:
            raise RuntimeError('Stripe secret key missing')
        stripe.api_key = secret
        balance = stripe.Balance.retrieve()
        info["stripe_api_reachable"] = True
        info["account_livemode"] = getattr(balance, "livemode", None)
    except Exception as e:
        info["stripe_api_reachable"] = False
        info["stripe_api_error"] = type(e).__name__
    return info
