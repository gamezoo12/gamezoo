from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException


DEFAULT_REWARD_SETTINGS = {
    # Signup bonus
    "signup_reward_tokens": 5.0,
    "signup_qualifying_topup_gbp": 10.0,

    # Personal referral bonus
    "referral_reward_tokens": 5.0,
    "referral_qualifying_topup_gbp": 10.0,
    "referral_contest_entry_required": True,

    # Influencer promo bonus
    "influencer_reward_tokens": 2.0,
    "influencer_qualifying_topup_gbp": 10.0,
    "influencer_contest_entry_required": True,
}


async def get_reward_settings(db) -> dict:
    """
    Return current reward programme settings.

    New settings keys always receive safe defaults so old databases remain
    compatible without requiring a migration.
    """
    doc = await db.reward_settings.find_one(
        {"_id": "app"},
        {"_id": 0},
    ) or {}

    return {
        **DEFAULT_REWARD_SETTINGS,
        **doc,
    }


async def save_reward_settings(db, payload: dict) -> dict:
    """
    Admin-only caller can update future reward rules.

    Already-issued wallet rewards are never recalculated.
    """
    allowed = set(DEFAULT_REWARD_SETTINGS)

    updates = {
        key: value
        for key, value in (payload or {}).items()
        if key in allowed
    }

    numeric_fields = {
        "signup_reward_tokens": (0.0, 1000.0),
        "signup_qualifying_topup_gbp": (0.0, 10000.0),

        "referral_reward_tokens": (0.0, 1000.0),
        "referral_qualifying_topup_gbp": (0.0, 10000.0),

        "influencer_reward_tokens": (0.0, 1000.0),
        "influencer_qualifying_topup_gbp": (0.0, 10000.0),
    }

    for field, (minimum, maximum) in numeric_fields.items():
        if field not in updates:
            continue

        try:
            value = round(float(updates[field]), 2)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid value for {field}",
            )

        if value < minimum or value > maximum:
            raise HTTPException(
                status_code=400,
                detail=f"{field} is outside the allowed range",
            )

        updates[field] = value

    boolean_fields = (
        "referral_contest_entry_required",
        "influencer_contest_entry_required",
    )

    for field in boolean_fields:
        if field not in updates:
            continue

        if not isinstance(updates[field], bool):
            raise HTTPException(
                status_code=400,
                detail=f"{field} must be true or false",
            )

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)

        await db.reward_settings.update_one(
            {"_id": "app"},
            {"$set": updates},
            upsert=True,
        )

    return await get_reward_settings(db)


def _promo_is_available(promo: dict, now: datetime) -> bool:
    """
    Validate whether an influencer campaign can accept a NEW signup.

    Reward qualification itself will be handled separately later.
    """
    if not promo.get("active", True):
        return False

    starts_at = promo.get("starts_at")
    expires_at = promo.get("expires_at")

    if starts_at and starts_at > now:
        return False

    if expires_at and expires_at < now:
        return False

    max_redemptions = int(promo.get("max_redemptions") or 0)

    # Redemptions count actual rewards, not signups.
    # A campaign may continue collecting attributed users until the
    # redemption cap is actually reached.
    if max_redemptions > 0:
        if int(promo.get("redemptions") or 0) >= max_redemptions:
            return False

    return True


async def find_active_influencer_promo(
    db,
    code: str,
):
    code = str(code or "").strip().upper()

    if not code:
        return None

    promo = await db.influencer_promos.find_one(
        {"code": code},
        {"_id": 0},
    )

    if not promo:
        return None

    if not _promo_is_available(
        promo,
        datetime.now(timezone.utc),
    ):
        return None

    return promo


async def create_influencer_attribution(
    db,
    *,
    user_id: str,
    promo: dict,
):
    """
    Attach one influencer campaign to a newly-created account.

    NO wallet credit happens here.
    """
    import uuid

    now = datetime.now(timezone.utc)

    existing = await db.influencer_attributions.find_one(
        {"user_id": user_id},
        {"_id": 1},
    )

    if existing:
        return False

    attribution = {
        "attribution_id": f"ipa_{uuid.uuid4().hex}",
        "user_id": user_id,

        "promo_id": promo["promo_id"],
        "code": promo["code"],
        "influencer_name": promo.get("influencer_name") or "",
        "campaign_name": promo.get("campaign_name") or "",

        "status": "pending",

        "topup_qualified": False,
        "contest_entered": False,

        "reward_granted": False,
        "reward_tokens": 0.0,
        "reward_tx_id": None,

        "created_at": now,
    }

    await db.influencer_attributions.insert_one(
        attribution
    )

    await db.influencer_promos.update_one(
        {"promo_id": promo["promo_id"]},
        {
            "$inc": {
                "signups": 1,
            },
            "$set": {
                "updated_at": now,
            },
        },
    )

    return True


async def _complete_influencer_if_eligible(
    db,
    user_id: str,
) -> bool:
    """
    Grant an influencer promo reward exactly once after all required,
    verified milestones are stored.

    This function never trusts frontend state.
    """
    attribution = await db.influencer_attributions.find_one(
        {
            "user_id": user_id,
            "status": "pending",
            "reward_granted": {"$ne": True},
            "reward_processing": {"$ne": True},
        },
        {"_id": 0},
    )

    if not attribution:
        return False

    promo = await db.influencer_promos.find_one(
        {
            "promo_id": attribution["promo_id"],
        },
        {"_id": 0},
    )

    if not promo:
        return False

    settings = await get_reward_settings(db)

    contest_required = promo.get("contest_entry_required")

    if contest_required is None:
        contest_required = settings[
            "influencer_contest_entry_required"
        ]

    if not attribution.get("topup_qualified"):
        return False

    if contest_required and not attribution.get("contest_entered"):
        return False

    now = datetime.now(timezone.utc)

    claim = await db.influencer_attributions.find_one_and_update(
        {
            "attribution_id": attribution["attribution_id"],
            "status": "pending",
            "reward_granted": {"$ne": True},
            "reward_processing": {"$ne": True},
        },
        {
            "$set": {
                "reward_processing": True,
                "reward_processing_at": now,
            }
        },
        return_document=True,
    )

    if not claim:
        return False

    max_redemptions = int(promo.get("max_redemptions") or 0)

    campaign_filter = {
        "promo_id": promo["promo_id"],
        "active": True,
    }

    if max_redemptions > 0:
        campaign_filter["redemptions"] = {
            "$lt": max_redemptions
        }

    campaign_claim = await db.influencer_promos.find_one_and_update(
        campaign_filter,
        {
            "$inc": {
                "redemptions": 1,
            },
            "$set": {
                "updated_at": now,
            },
        },
        return_document=True,
    )

    if not campaign_claim:
        await db.influencer_attributions.update_one(
            {
                "attribution_id": attribution["attribution_id"],
            },
            {
                "$set": {
                    "status": "limit_reached",
                },
                "$unset": {
                    "reward_processing": "",
                    "reward_processing_at": "",
                },
            },
        )

        return False

    reward_tokens = campaign_claim.get("reward_tokens")

    if reward_tokens is None:
        reward_tokens = settings["influencer_reward_tokens"]

    reward_tokens = round(float(reward_tokens), 2)

    try:
        from routers.wallet_routes import _apply_tx

        result = await _apply_tx(
            db,
            user_id,
            "influencer_bonus",
            reward_tokens,
            note=(
                f"Influencer promo reward — "
                f"{campaign_claim['code']}"
            ),
        )

        reward_tx_id = None

        if isinstance(result, dict):
            reward_tx_id = (
                (result.get("tx") or {}).get("tx_id")
                or result.get("tx_id")
            )

        await db.influencer_attributions.update_one(
            {
                "attribution_id": attribution["attribution_id"],
            },
            {
                "$set": {
                    "status": "completed",
                    "reward_granted": True,
                    "reward_tokens": reward_tokens,
                    "reward_tx_id": reward_tx_id,
                    "completed_at": now,
                },
                "$unset": {
                    "reward_processing": "",
                    "reward_processing_at": "",
                },
            },
        )

        from notifications import notify

        await notify(
            db,
            user_id=user_id,
            kind="influencer_bonus",
            title=f"🎁 {reward_tokens:g} promo tokens added",
            body=(
                f"Your {campaign_claim['code']} promotion "
                f"reward has been added."
            ),
            ref_tx_id=reward_tx_id,
        )

        return True

    except Exception:
        # Reverse only the redemption reservation, not any wallet transaction.
        # _apply_tx itself is the atomic wallet credit boundary.
        await db.influencer_promos.update_one(
            {
                "promo_id": promo["promo_id"],
            },
            {
                "$inc": {
                    "redemptions": -1,
                }
            },
        )

        await db.influencer_attributions.update_one(
            {
                "attribution_id": attribution["attribution_id"],
            },
            {
                "$unset": {
                    "reward_processing": "",
                    "reward_processing_at": "",
                }
            },
        )

        raise


async def record_influencer_topup(
    db,
    user_id: str,
    amount_gbp: float,
    session_id: str | None = None,
):
    """
    Called only from the verified Stripe wallet-credit flow.
    """
    attribution = await db.influencer_attributions.find_one(
        {
            "user_id": user_id,
            "status": "pending",
        },
        {"_id": 0},
    )

    if not attribution:
        return False

    promo = await db.influencer_promos.find_one(
        {
            "promo_id": attribution["promo_id"],
        },
        {"_id": 0},
    )

    if not promo:
        return False

    settings = await get_reward_settings(db)

    minimum = promo.get("qualifying_topup_gbp")

    if minimum is None:
        minimum = settings["influencer_qualifying_topup_gbp"]

    amount_gbp = round(float(amount_gbp), 2)

    if amount_gbp < float(minimum):
        return False

    now = datetime.now(timezone.utc)

    await db.influencer_attributions.update_one(
        {
            "attribution_id": attribution["attribution_id"],
            "status": "pending",
        },
        {
            "$set": {
                "topup_qualified": True,
                "topup_qualified_at": now,
                "topup_amount_gbp": amount_gbp,
                "topup_session_id": session_id,
            }
        },
    )

    await _complete_influencer_if_eligible(
        db,
        user_id,
    )

    return True


async def record_influencer_contest_entry(
    db,
    user_id: str,
    order_id: str | None = None,
):
    """
    Called only after a successful paid contest order/ticket creation.
    """
    now = datetime.now(timezone.utc)

    result = await db.influencer_attributions.update_one(
        {
            "user_id": user_id,
            "status": "pending",
        },
        {
            "$set": {
                "contest_entered": True,
                "contest_entered_at": now,
                "first_contest_order_id": order_id,
            }
        },
    )

    if not result.matched_count:
        return False

    await _complete_influencer_if_eligible(
        db,
        user_id,
    )

    return True


async def influencer_admin_snapshot(db) -> dict:
    """
    Read-only operational view for Admin → Referrals & Bonuses.

    This function never credits wallets or changes qualification state.
    """
    promos = await db.influencer_promos.find(
        {},
        {"_id": 0},
    ).sort("created_at", -1).to_list(1000)

    attributions = await db.influencer_attributions.find(
        {},
        {"_id": 0},
    ).sort("created_at", -1).to_list(5000)

    user_ids = list({
        row.get("user_id")
        for row in attributions
        if row.get("user_id")
    })

    user_map = {}

    if user_ids:
        users = await db.users.find(
            {"user_id": {"$in": user_ids}},
            {
                "_id": 0,
                "user_id": 1,
                "public_id": 1,
                "name": 1,
                "email": 1,
            },
        ).to_list(5000)

        user_map = {
            u["user_id"]: u
            for u in users
            if u.get("user_id")
        }

    for row in attributions:
        user = user_map.get(row.get("user_id"), {})

        row["user_name"] = user.get("name")
        row["user_email"] = user.get("email")
        row["user_public_id"] = user.get("public_id")

        if row.get("reward_granted"):
            row["display_status"] = "Rewarded"
        elif row.get("status") == "limit_reached":
            row["display_status"] = "Campaign limit reached"
        elif not row.get("topup_qualified"):
            row["display_status"] = "Waiting for qualifying top-up"
        elif not row.get("contest_entered"):
            row["display_status"] = "Waiting for contest entry"
        elif row.get("reward_processing"):
            row["display_status"] = "Processing reward"
        else:
            row["display_status"] = "Pending"

    rewarded = [
        row
        for row in attributions
        if row.get("reward_granted")
    ]

    tokens_granted = round(
        sum(
            float(row.get("reward_tokens") or 0)
            for row in rewarded
        ),
        2,
    )

    pending = [
        row
        for row in attributions
        if not row.get("reward_granted")
        and row.get("status") == "pending"
    ]

    return {
        "promos": promos,
        "attributions": attributions,
        "summary": {
            "influencer_signups": len(attributions),
            "influencer_rewards_issued": len(rewarded),
            "influencer_tokens_granted": tokens_granted,
            "influencer_pending": len(pending),
            "influencer_campaigns": len(promos),
            "influencer_active_campaigns": sum(
                1 for p in promos if p.get("active", True)
            ),
        },
    }
