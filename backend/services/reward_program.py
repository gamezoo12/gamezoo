from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException


DEFAULT_REWARD_SETTINGS = {
    # Offer versioning: bumped whenever a rule that affects eligibility or rewards changes.
    "offer_version": 1,
    "offer_effective_from": None,

    # Signup bonus
    "signup_offer_enabled": True,
    "signup_reward_tokens": 5.0,
    "signup_qualifying_topup_gbp": 10.0,
    "signup_bonus_expiry_enabled": False,
    "signup_bonus_expiry_days": 30,
    "normal_topup_bonus_enabled": False,
    "normal_topup_bonus_mode": "fixed",
    "normal_topup_bonus_tokens": 0.0,
    "normal_topup_bonus_percent": 0.0,
    "normal_topup_bonus_minimum_gbp": 0.0,
    "normal_topup_bonus_first_only": True,
    "normal_topup_bonus_expiry_enabled": False,
    "normal_topup_bonus_expiry_days": 30,

    # Personal referral bonus
    "referral_offer_enabled": True,
    "referral_reward_tokens": 5.0,
    "referral_referred_reward_tokens": 0.0,
    "referral_qualifying_topup_gbp": 10.0,
    "referral_contest_entry_required": True,
    "referral_bonus_expiry_enabled": False,
    "referral_bonus_expiry_days": 30,

    # Paid World draw prizes awarded as Bonus Tokens
    "draw_prize_bonus_expiry_enabled": False,
    "draw_prize_bonus_expiry_days": 30,

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


async def _heal_influencer_pending(db, user: dict) -> bool:
    """Finish an influencer signup that crashed after the account was stored but before attribution.

    The campaign was validated when the user signed up, so only the stored promo id is needed.
    Never re-attributes an account that already has a different attribution.
    """
    promo_id = user.get('influencer_promo_id')
    if not promo_id:
        return False
    user_id = user['user_id']
    attribution = await db.influencer_attributions.find_one({'user_id': user_id}, {'_id': 0, 'promo_id': 1})
    if not attribution:
        promo = await db.influencer_promos.find_one({'promo_id': promo_id}, {'_id': 0})
        if not promo:
            return False
        await create_influencer_attribution(db, user_id=user_id, promo=promo)
        attribution = await db.influencer_attributions.find_one({'user_id': user_id}, {'_id': 0, 'promo_id': 1})
    if not attribution:
        return False
    await db.users.update_one(
        {'user_id': user_id, 'acquisition_type': {'$in': ['influencer_pending', 'unresolved']}},
        {'$set': {'acquisition_type': 'influencer', 'promotion_eligibility_status': 'resolved',
                  'signup_bonus_offer_eligible': False}},
    )
    return True


async def resolve_acquisition_program(db, user_id: str, user: dict | None = None) -> str:
    """The single authority for which promotional programme applies to an account.

    Returns 'normal', 'influencer', 'staff' or 'unresolved'. Rewards are issued only for
    'normal' (normal programme) or 'influencer' (campaign programme); anything else gets nothing.
    The decision comes from persisted data, never from a browser flag.
    """
    user = user or await db.users.find_one({'user_id': user_id}, {'_id': 0}) or {}
    user = {**user, 'user_id': user_id}
    acquisition = user.get('acquisition_type')
    status = user.get('promotion_eligibility_status')

    attribution = await db.influencer_attributions.find_one({'user_id': user_id}, {'_id': 1})
    if attribution:
        # An attribution row is the strongest evidence; it always wins over a stale 'normal' marker.
        if acquisition != 'influencer' or status != 'resolved':
            await db.users.update_one(
                {'user_id': user_id, 'acquisition_type': {'$ne': 'staff'}},
                {'$set': {'acquisition_type': 'influencer', 'promotion_eligibility_status': 'resolved'}},
            )
        return 'influencer'

    if acquisition == 'staff':
        return 'staff'
    if acquisition in ('influencer_pending', 'unresolved') or (acquisition == 'influencer' and not attribution):
        if user.get('influencer_promo_id') and await _heal_influencer_pending(db, user):
            return 'influencer'
        return 'unresolved'
    if acquisition == 'normal':
        return 'normal' if status in (None, 'resolved') else 'unresolved'
    if status == 'pending':
        return 'unresolved'

    if user.get('influencer_promo_id') or user.get('influencer_promo_code'):
        return 'influencer' if await _heal_influencer_pending(db, user) else 'unresolved'

    personal_referral = await db.referrals.find_one({'referred_user_id': user_id}, {'_id': 1})
    if personal_referral or user.get('referred_by') or user.get('signup_bonus_offer_eligible') is True:
        await db.users.update_one(
            {'user_id': user_id, 'acquisition_type': {'$exists': False}},
            {'$set': {'acquisition_type': 'normal', 'promotion_eligibility_status': 'resolved'}},
        )
        return 'normal'
    return 'unresolved'


async def promo_conflict(db, user_id: str) -> dict | None:
    """An influencer-attributed account that already holds a normal signup reward needs review.

    Nothing is deducted or rewritten; further influencer credits are held until reviewed.
    """
    normal = await db.bonus_grants.find(
        {'user_id': user_id, 'source': {'$in': ['signup', 'normal_topup']}},
        {'_id': 0, 'grant_id': 1, 'original_amount': 1, 'ref_key': 1},
    ).to_list(20)
    user = await db.users.find_one({'user_id': user_id}, {'_id': 0, 'signup_bonus_granted': 1,
                                                         'signup_bonus_tx_id': 1, 'signup_bonus_tokens': 1}) or {}
    if not normal and not user.get('signup_bonus_granted'):
        return None
    return {
        'reason': 'normal_signup_bonus_already_issued',
        'normal_grants': normal,
        'signup_bonus_tx_id': user.get('signup_bonus_tx_id'),
        'signup_bonus_tokens': user.get('signup_bonus_tokens'),
    }


async def claim_campaign_redemption(db, attribution: dict, promo: dict) -> bool:
    """Count this account once against the campaign's max_redemptions; False when the cap is reached.

    Unlimited campaigns (max_redemptions 0) always pass. The counter is incremented before the
    per-account flag so a crash can only over-count, never exceed the cap.
    """
    if attribution.get('redemption_counted') is True:
        return True
    cap = int(promo.get('max_redemptions') or 0)
    now = datetime.now(timezone.utc)
    if cap > 0:
        claimed = await db.influencer_promos.find_one_and_update(
            {'promo_id': promo['promo_id'],
             '$or': [{'redemptions': {'$lt': cap}}, {'redemptions': {'$exists': False}}]},
            {'$inc': {'redemptions': 1}, '$set': {'updated_at': now}},
        )
        if not claimed:
            return False
    else:
        await db.influencer_promos.update_one({'promo_id': promo['promo_id']}, {'$inc': {'redemptions': 1}})
    await db.influencer_attributions.update_one(
        {'attribution_id': attribution['attribution_id']},
        {'$set': {'redemption_counted': True, 'redemption_counted_at': now}},
    )
    return True


async def save_reward_settings(db, payload: dict) -> dict:
    """
    Admin-only caller can update future reward rules.

    Already-issued wallet rewards are never recalculated.
    """
    allowed = set(DEFAULT_REWARD_SETTINGS) - {"offer_version", "offer_effective_from"}

    updates = {
        key: value
        for key, value in (payload or {}).items()
        if key in allowed
    }

    numeric_fields = {
        "signup_reward_tokens": (0.0, 1000.0),
        "signup_qualifying_topup_gbp": (0.0, 10000.0),
        "signup_bonus_expiry_days": (1, 3650),
        "normal_topup_bonus_tokens": (0.0, 10000.0),
        "normal_topup_bonus_percent": (0.0, 100.0),
        "normal_topup_bonus_minimum_gbp": (0.0, 10000.0),
        "normal_topup_bonus_expiry_days": (1, 3650),

        "referral_reward_tokens": (0.0, 1000.0),
        "referral_referred_reward_tokens": (0.0, 1000.0),
        "referral_qualifying_topup_gbp": (0.0, 10000.0),
        "referral_bonus_expiry_days": (1, 3650),
        "draw_prize_bonus_expiry_days": (1, 3650),

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

    for field in ('signup_bonus_expiry_days', 'referral_bonus_expiry_days', 'normal_topup_bonus_expiry_days',
                  'draw_prize_bonus_expiry_days'):
        if field not in updates:
            continue
        if not float(updates[field]).is_integer():
            raise HTTPException(status_code=400, detail=f'{field} must be a whole number of days')
        updates[field] = int(updates[field])

    boolean_fields = (
        "signup_offer_enabled",
        "referral_offer_enabled",
        "signup_bonus_expiry_enabled",
        "referral_bonus_expiry_enabled",
        "normal_topup_bonus_enabled",
        "normal_topup_bonus_first_only",
        "normal_topup_bonus_expiry_enabled",
        "draw_prize_bonus_expiry_enabled",
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

    if 'normal_topup_bonus_mode' in updates and updates['normal_topup_bonus_mode'] not in ('fixed', 'percentage'):
        raise HTTPException(status_code=400, detail='normal_topup_bonus_mode must be fixed or percentage')

    if updates:
        now = datetime.now(timezone.utc)
        current = await get_reward_settings(db)
        changed = {k: v for k, v in updates.items() if current.get(k) != v}
        updates["updated_at"] = now
        if changed:
            updates["offer_version"] = int(current.get("offer_version") or 1) + 1
            updates["offer_effective_from"] = now
            await db.reward_settings_history.insert_one({
                "offer_version": updates["offer_version"], "changed_at": now,
                "changes": {k: {"from": current.get(k), "to": v} for k, v in changed.items()},
            })

        await db.reward_settings.update_one(
            {"_id": "app"},
            {"$set": updates},
            upsert=True,
        )

    return await get_reward_settings(db)


def reward_bonus_expiry(settings: dict, category: str, now: datetime | None = None):
    """Snapshot configured expiry onto an individual signup/referral grant."""
    enabled_key = f'{category}_bonus_expiry_enabled'
    days_key = f'{category}_bonus_expiry_days'
    if not settings.get(enabled_key, False):
        return None
    from services.bonus_grants import compute_expiry
    return compute_expiry(now or datetime.now(timezone.utc), 'days', int(settings[days_key]))


def _as_aware(value):
    """Mongo returns naive UTC datetimes; compare everything as aware UTC."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _promo_is_available(promo: dict, now: datetime) -> bool:
    """
    Validate whether an influencer campaign can accept a NEW signup.

    Reward qualification itself will be handled separately later.
    """
    if not promo.get("active", True):
        return False

    starts_at = _as_aware(promo.get("starts_at"))
    expires_at = _as_aware(promo.get("expires_at"))
    now = _as_aware(now)

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
        "influencer_id": promo.get("influencer_id"),
        "code": promo["code"],
        "influencer_name": promo.get("influencer_name") or "",
        "campaign_name": promo.get("campaign_name") or "",
        "campaign_snapshot": {
            key: promo.get(key)
            for key in (
                "reward_type", "registration_commission_pence", "registration_eligibility",
                "registration_commission_tokens", "topup_commission_mode", "topup_commission_bps",
                "topup_fixed_commission_pence", "topup_token_mode", "topup_commission_tokens",
                "topup_qualification", "topup_first_n", "topup_minimum_pence", "attribution_window_days",
                "exclude_tax", "signup_reward_tokens", "topup_reward_mode", "topup_reward_bps",
                "topup_reward_tokens", "bonus_expiry_days", "commission_cap_pence", "budget_pence",
                "starts_at", "expires_at",
            )
        },

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
    """Grant the campaign's explicit single "qualifying reward" once, after every stored milestone.

    This is the older top-up-plus-entry reward. It only pays when the campaign itself sets
    `reward_tokens` (no global fallback, which used to add an unconfigured extra reward on top of
    the campaign's signup and top-up rewards). The credit is an idempotent bonus grant labelled
    `influencer_campaign`, so a crash and retry can never credit twice.
    """
    now = datetime.now(timezone.utc)
    attribution = await db.influencer_attributions.find_one(
        {
            "user_id": user_id,
            "status": "pending",
            "reward_granted": {"$ne": True},
            "$or": [
                {"reward_processing": {"$ne": True}},
                {"reward_processing_at": {"$lt": now - timedelta(minutes=5)}},
            ],
        },
        {"_id": 0},
    )
    if not attribution:
        return False

    if await resolve_acquisition_program(db, user_id) != "influencer":
        return False

    promo = await db.influencer_promos.find_one(
        {"promo_id": attribution["promo_id"]},
        {"_id": 0},
    )
    if not promo:
        return False

    reward_tokens = promo.get("reward_tokens")
    if reward_tokens is None or float(reward_tokens) <= 0:
        return False
    reward_tokens = round(float(reward_tokens), 2)

    settings = await get_reward_settings(db)
    contest_required = promo.get("contest_entry_required")
    if contest_required is None:
        contest_required = settings["influencer_contest_entry_required"]

    if not attribution.get("topup_qualified"):
        return False
    if contest_required and not attribution.get("contest_entered"):
        return False

    if not promo.get("active", True):
        return False

    if await promo_conflict(db, user_id):
        await db.influencer_attributions.update_one(
            {"attribution_id": attribution["attribution_id"]},
            {"$set": {"promo_conflict": True, "promo_conflict_at": now,
                      "promo_conflict_reason": "normal_signup_bonus_already_issued"}},
        )
        return False

    claim = await db.influencer_attributions.find_one_and_update(
        {
            "attribution_id": attribution["attribution_id"],
            "status": "pending",
            "reward_granted": {"$ne": True},
            "$or": [
                {"reward_processing": {"$ne": True}},
                {"reward_processing_at": {"$lt": now - timedelta(minutes=5)}},
            ],
        },
        {"$set": {"reward_processing": True, "reward_processing_at": now}},
        return_document=True,
    )
    if not claim:
        return False

    if not await claim_campaign_redemption(db, claim, promo):
        await db.influencer_attributions.update_one(
            {"attribution_id": attribution["attribution_id"]},
            {"$set": {"status": "limit_reached"},
             "$unset": {"reward_processing": "", "reward_processing_at": ""}},
        )
        return False

    try:
        from services.bonus_grants import create_grant

        expiry_days = promo.get("bonus_expiry_days")
        expires_at = now + timedelta(days=int(expiry_days)) if expiry_days else None
        grant = await create_grant(
            db, user_id=user_id, amount=reward_tokens, expires_at=expires_at,
            actor_id="campaign-system", actor_email="campaign-system@prizeleague.co.uk",
            reason=f"Campaign {promo['code']} qualifying top-up and entry reward",
            ref_key=f"influencer-qualifying:{attribution['attribution_id']}",
            source="influencer_campaign",
        )
        reward_tx_id = next(iter(grant.get("related_tx_ids") or []), None)

        await db.influencer_attributions.update_one(
            {"attribution_id": attribution["attribution_id"]},
            {
                "$set": {
                    "status": "completed",
                    "reward_granted": True,
                    "reward_tokens": reward_tokens,
                    "reward_tx_id": reward_tx_id,
                    "completed_at": now,
                },
                "$unset": {"reward_processing": "", "reward_processing_at": ""},
            },
        )
        return True
    except Exception:
        # The grant is idempotent per attribution, so the next attempt finishes it without re-crediting.
        await db.influencer_attributions.update_one(
            {"attribution_id": attribution["attribution_id"]},
            {"$unset": {"reward_processing": "", "reward_processing_at": ""}},
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
    if await resolve_acquisition_program(db, user_id) != "influencer":
        return False

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
    if await resolve_acquisition_program(db, user_id) != "influencer":
        return False

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
