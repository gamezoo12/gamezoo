from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_admin
from deps import get_db
from services.reward_program import (
    get_reward_settings,
    save_reward_settings,
)


router = APIRouter(
    prefix="/api/admin",
    tags=["admin-influencer-promos"],
)


class PromoCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32)
    influencer_name: str = Field(..., min_length=1, max_length=120)
    campaign_name: str = Field(default="", max_length=160)

    reward_tokens: Optional[float] = Field(default=None, ge=0, le=1000)
    qualifying_topup_gbp: Optional[float] = Field(default=None, ge=0, le=10000)
    contest_entry_required: Optional[bool] = None

    max_redemptions: int = Field(default=0, ge=0, le=1000000)
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    active: bool = True


class PromoUpdate(BaseModel):
    influencer_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    campaign_name: Optional[str] = Field(default=None, max_length=160)

    reward_tokens: Optional[float] = Field(default=None, ge=0, le=1000)
    qualifying_topup_gbp: Optional[float] = Field(default=None, ge=0, le=10000)
    contest_entry_required: Optional[bool] = None

    max_redemptions: Optional[int] = Field(default=None, ge=0, le=1000000)
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    active: Optional[bool] = None


def _clean_code(value: str) -> str:
    code = str(value or "").strip().upper().replace(" ", "")

    if not code.isalnum():
        raise HTTPException(
            status_code=400,
            detail="Promo code must contain letters and numbers only.",
        )

    return code


@router.get("/reward-settings")
async def admin_reward_settings(request: Request):
    await require_admin(request)
    return await get_reward_settings(get_db())


@router.put("/reward-settings")
async def admin_update_reward_settings(payload: dict, request: Request):
    await require_admin(request)
    return await save_reward_settings(get_db(), payload)


@router.get("/influencer-promos")
async def list_influencer_promos(request: Request):
    await require_admin(request)

    db = get_db()

    promos = await db.influencer_promos.find(
        {},
        {"_id": 0},
    ).sort("created_at", -1).to_list(1000)

    return {
        "promos": promos,
        "count": len(promos),
    }


@router.post("/influencer-promos")
async def create_influencer_promo(inp: PromoCreate, request: Request):
    await require_admin(request)

    db = get_db()
    code = _clean_code(inp.code)

    existing = await db.influencer_promos.find_one(
        {"code": code},
        {"_id": 1},
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="This influencer promo code already exists.",
        )

    referral_collision = await db.users.find_one(
        {"referral_code": code},
        {"_id": 1},
    )

    if referral_collision:
        raise HTTPException(
            status_code=409,
            detail="This code already belongs to an existing user referral code.",
        )

    if (
        inp.starts_at
        and inp.expires_at
        and inp.expires_at <= inp.starts_at
    ):
        raise HTTPException(
            status_code=400,
            detail="Expiry date must be after the start date.",
        )

    now = datetime.now(timezone.utc)

    doc = {
        "promo_id": f"promo_{uuid.uuid4().hex}",
        "code": code,
        "influencer_name": inp.influencer_name.strip(),
        "campaign_name": inp.campaign_name.strip(),

        # None = use global Reward Settings default
        "reward_tokens": inp.reward_tokens,
        "qualifying_topup_gbp": inp.qualifying_topup_gbp,
        "contest_entry_required": inp.contest_entry_required,

        # 0 = unlimited
        "max_redemptions": inp.max_redemptions,

        "signups": 0,
        "redemptions": 0,

        "starts_at": inp.starts_at,
        "expires_at": inp.expires_at,

        "active": inp.active,
        "created_at": now,
        "updated_at": now,
    }

    await db.influencer_promos.insert_one(doc)

    doc.pop("_id", None)

    return doc


@router.put("/influencer-promos/{promo_id}")
async def update_influencer_promo(
    promo_id: str,
    inp: PromoUpdate,
    request: Request,
):
    await require_admin(request)

    db = get_db()

    current = await db.influencer_promos.find_one(
        {"promo_id": promo_id},
        {"_id": 0},
    )

    if not current:
        raise HTTPException(
            status_code=404,
            detail="Influencer promo code not found.",
        )

    updates = inp.model_dump(exclude_unset=True)

    if "influencer_name" in updates and updates["influencer_name"] is not None:
        updates["influencer_name"] = updates["influencer_name"].strip()

    if "campaign_name" in updates and updates["campaign_name"] is not None:
        updates["campaign_name"] = updates["campaign_name"].strip()

    effective_start = updates.get("starts_at", current.get("starts_at"))
    effective_expiry = updates.get("expires_at", current.get("expires_at"))

    if (
        effective_start
        and effective_expiry
        and effective_expiry <= effective_start
    ):
        raise HTTPException(
            status_code=400,
            detail="Expiry date must be after the start date.",
        )

    updates["updated_at"] = datetime.now(timezone.utc)

    await db.influencer_promos.update_one(
        {"promo_id": promo_id},
        {"$set": updates},
    )

    return await db.influencer_promos.find_one(
        {"promo_id": promo_id},
        {"_id": 0},
    )
