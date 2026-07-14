"""
Prize League — Stripe catalog setup for wallet top-ups.
Run once (idempotent). Creates 4 fixed one-time GBP packages the customer can pick from.
"""
import os
import stripe
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

CATALOG = [
    {
        "emergent_product_id": "wallet_topup",
        "name": "Prize League — Wallet top-up",
        "tax_code": "txcd_10000000",  # general digital
        "prices": [
            {"lookup_key": "wallet_topup_10",  "amount": 1000,  "currency": "gbp"},  # £10
            {"lookup_key": "wallet_topup_20",  "amount": 2000,  "currency": "gbp"},  # £20
            {"lookup_key": "wallet_topup_50",  "amount": 5000,  "currency": "gbp"},  # £50
            {"lookup_key": "wallet_topup_100", "amount": 10000, "currency": "gbp"},  # £100
        ],
    },
]


def ensure_tax_settings():
    """Tax head-office is required before SMP can charge tax; safe to set to GB HQ."""
    s = stripe.tax.Settings.retrieve()
    if s.head_office and getattr(s.head_office, "address", None):
        return
    stripe.tax.Settings.modify(
        head_office={"address": {"country": "GB", "line1": "1 Prize League Way",
                                  "city": "London", "postal_code": "SW1A 1AA"}},
        defaults={"tax_behavior": "exclusive"},
    )


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True, limit=100).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(
        name=entry["name"],
        tax_code=entry.get("tax_code"),
        metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]},
    )


def upsert_price(product_id, price):
    existing = stripe.Price.list(lookup_keys=[price["lookup_key"]], active=True, limit=1).data
    if existing and (existing[0].unit_amount != price["amount"] or existing[0].currency != price["currency"]):
        stripe.Price.modify(existing[0].id, active=False)
        existing = []
    if not existing:
        stripe.Price.create(
            product=product_id,
            unit_amount=price["amount"],
            currency=price["currency"],
            lookup_key=price["lookup_key"],
            transfer_lookup_key=True,
        )


if __name__ == "__main__":
    ensure_tax_settings()
    for entry in CATALOG:
        product = get_or_create_product(entry)
        for p in entry["prices"]:
            upsert_price(product.id, p)
            print(f"✓ {p['lookup_key']} @ {p['amount']/100:.2f} {p['currency'].upper()}")
    print("Catalog ready.")
