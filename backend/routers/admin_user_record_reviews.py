"""Scoped, auditable admin case notes for user contest and ticket records.

Does not alter score, rank, ticket ownership, payout or financial ledgers.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from auth import require_admin
from deps import get_db

router = APIRouter(prefix="/api/admin/users", tags=["admin-user-record-reviews"])
COLLECTIONS = {
    "free_world": ("world_contest_entries", "entry_id"),
    "paid_world": ("game_scores", "score_id"),
    "tickets": ("tickets", "ticket_id"),
}

class ReviewInput(BaseModel):
    record_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=10, max_length=1000)
    review_status: str

@router.get("/{user_id}/record-reviews")
async def list_reviews(user_id: str, request: Request):
    await require_admin(request)
    db = get_db()
    if not await db.users.find_one({"user_id": user_id}, {"_id": 1}):
        raise HTTPException(404, "User not found")
    docs = await db.admin_record_reviews.find({"user_id": user_id}, {"_id": 0}).sort("at", -1).limit(200).to_list(200)
    return {"reviews": docs}

@router.post("/{user_id}/{record_type}/record-review")
async def review_record(user_id: str, record_type: str, payload: ReviewInput, request: Request):
    admin = await require_admin(request)
    if admin.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Admin role required")
    if record_type not in COLLECTIONS:
        raise HTTPException(404, "Unknown record type")
    if payload.review_status not in ("under_review", "cleared", "escalated"):
        raise HTTPException(400, "Unsupported review status")
    db = get_db()
    collection, key = COLLECTIONS[record_type]
    record = await db[collection].find_one({"user_id": user_id, key: payload.record_id}, {"_id": 1})
    if not record:
        raise HTTPException(404, "Record not found for user")
    entry = {"user_id": user_id, "record_type": record_type, "record_id": payload.record_id, "review_status": payload.review_status, "reason": payload.reason, "admin_user_id": admin.get("user_id"), "at": datetime.now(timezone.utc)}
    await db.admin_record_reviews.insert_one(dict(entry))
    await db.audit_log.insert_one({"kind": "admin_user_record_review", "target_user_id": user_id, **entry})
    return {"ok": True}
