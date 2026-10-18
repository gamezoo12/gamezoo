"""Admin-triggered verification of existing account email addresses.

Uses the existing Twilio Verify email channel. Never returns a verification
code to admins; successful verification requires the recipient's code.
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from auth import require_admin
from deps import get_db
from otp_verify import twilio_verify_client

router = APIRouter(prefix="/api/admin/users", tags=["admin-verification"])

class VerifyEmailCode(BaseModel):
    code: str = Field(min_length=4, max_length=10)

async def _account(user_id, request):
    await require_admin(request)
    user = await get_db().users.find_one({"user_id": user_id, "erased": {"$ne": True}})
    if not user:
        raise HTTPException(404, "User not found")
    return user

@router.post("/{user_id}/email/send-otp")
async def send_existing_email_otp(user_id: str, request: Request):
    user = await _account(user_id, request)
    if user.get("email_verified"):
        return {"already_verified": True}
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "User has no email address")
    db = get_db()
    now = datetime.now(timezone.utc)
    recent = await db.otp_attempts.find({
        "channel": "admin_email", "email": email,
        "sent_at": {"$gte": now - timedelta(minutes=15)}
    }, {"sent_at": 1}).sort("sent_at", -1).to_list(5)
    if len(recent) >= 5:
        raise HTTPException(429, "Too many verification requests; retry in 15 minutes")
    if recent:
        last = recent[0]["sent_at"]
        if isinstance(last, str):
            last = datetime.fromisoformat(last)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now - last).total_seconds() < 60:
            raise HTTPException(429, "Wait 60 seconds before resending")
    try:
        client, service_sid = twilio_verify_client()
        client.verify.v2.services(service_sid).verifications.create(to=email, channel="email")
    except Exception:
        raise HTTPException(503, "Email verification service unavailable")
    await db.otp_attempts.insert_one({"channel": "admin_email", "email": email, "sent_at": now, "user_id": user_id})
    await db.admin_audit.insert_one({"action": "send_email_verification", "user_id": user_id, "at": now})
    return {"sent": True}

@router.post("/{user_id}/email/verify-otp")
async def verify_existing_email_otp(user_id: str, payload: VerifyEmailCode, request: Request):
    user = await _account(user_id, request)
    if user.get("email_verified"):
        return {"already_verified": True}
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "User has no email address")
    try:
        client, service_sid = twilio_verify_client()
        result = client.verify.v2.services(service_sid).verification_checks.create(to=email, code=payload.code)
    except Exception:
        raise HTTPException(400, "Verification failed or code expired")
    if result.status != "approved":
        raise HTTPException(400, "Incorrect or expired code")
    now = datetime.now(timezone.utc)
    update = await get_db().users.update_one({"user_id": user_id, "email": user["email"], "email_verified": {"$ne": True}}, {"$set": {"email_verified": True, "email_verified_at": now}})
    if not update.modified_count:
        raise HTTPException(409, "Account changed; refresh and retry")
    await get_db().admin_audit.insert_one({"action": "verify_email_otp", "user_id": user_id, "at": now})
    return {"verified": True}
