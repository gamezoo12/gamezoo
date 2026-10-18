"""One-click, expiring email and SMS verification links for existing users."""
import asyncio
import hashlib
import json
import os
import secrets
import urllib.request
from datetime import datetime, timedelta, timezone
from html import escape
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from auth import require_admin
from deps import get_db
from otp_verify import normalize_phone

router = APIRouter(tags=["contact-verification-links"])

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def page(message):
    return HTMLResponse('<!doctype html><html><head><meta charset="utf-8"><title>Prize League Verification</title></head><body><main><h1>Prize League</h1><p>' + escape(message) + '</p><a href="/">Return to Prize League</a></main></body></html>')

def email_send(to, link):
    key, sender = os.getenv("RESEND_API_KEY"), os.getenv("VERIFIED_EMAIL_FROM")
    if not key or not sender:
        raise HTTPException(503, "Email delivery is not configured")
    payload = json.dumps({"from": sender, "to": [to], "subject": "Verify your Prize League email", "html": '<p>Verify your email address:</p><p><a href="' + escape(link, quote=True) + '">Verify email</a></p><p>Expires in 30 minutes.</p>'}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=12) as res:
        if res.status not in (200, 201, 202):
            raise RuntimeError("Email rejected")

def sms_send(to, link):
    from twilio.rest import Client
    sid, token, sender = (os.getenv(x) for x in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM"))
    if not all((sid, token, sender)):
        raise HTTPException(503, "SMS delivery is not configured")
    Client(sid, token).messages.create(to=to, from_=sender, body="Prize League: Verify your mobile number: " + link + " (expires in 30 minutes)")

@router.post("/api/admin/users/{user_id}/{channel}/send-verification-link")
async def send_verification_link(user_id: str, channel: str, request: Request):
    admin = await require_admin(request)
    if channel not in ("email", "phone"):
        raise HTTPException(404, "Unknown verification type")
    db = get_db()
    user = await db.users.find_one({"user_id": user_id, "erased": {"$ne": True}})
    if not user:
        raise HTTPException(404, "User not found")
    if user.get(channel + "_verified"):
        return {"already_verified": True}
    original = user.get(channel)
    if not original:
        raise HTTPException(400, "User has no " + channel + " on file")
    if channel == "phone":
        try:
            target = normalize_phone(original)
        except Exception:
            raise HTTPException(400, "Invalid phone number")
        if await db.users.find_one({"phone": target, "phone_verified": True, "user_id": {"$ne": user_id}}, {"_id": 1}):
            raise HTTPException(409, "Phone is verified on another account")
    else:
        target = original.strip().lower()
    now = datetime.now(timezone.utc)
    recent = await db.verification_links.find({"user_id": user_id, "channel": channel, "created_at": {"$gte": now - timedelta(minutes=15)}}).sort("created_at", -1).to_list(5)
    if len(recent) >= 5:
        raise HTTPException(429, "Too many requests; try again in 15 minutes")
    if recent:
        last = recent[0]["created_at"]
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now - last).total_seconds() < 60:
            raise HTTPException(429, "Wait 60 seconds before resending")
    token = secrets.token_urlsafe(32)
    record = {"token_hash": digest(token), "user_id": user_id, "channel": channel, "target": target, "original": original, "created_at": now, "expires_at": now + timedelta(minutes=30), "used": False}
    inserted = await db.verification_links.insert_one(record)
    link = os.getenv("PUBLIC_SITE_URL", "https://prizeleague.co.uk").rstrip("/") + "/api/verify-contact?token=" + token
    try:
        await asyncio.to_thread(email_send if channel == "email" else sms_send, target, link)
    except HTTPException:
        await db.verification_links.delete_one({"_id": inserted.inserted_id})
        raise
    except Exception:
        await db.verification_links.delete_one({"_id": inserted.inserted_id})
        raise HTTPException(503, "Unable to send verification link")
    await db.audit_log.insert_one({"kind": "admin_verification_link_sent", "admin_user_id": admin.get("user_id"), "target_user_id": user_id, "channel": channel, "at": now})
    return {"sent": True, "expires_in_minutes": 30}

@router.get("/api/verify-contact", response_class=HTMLResponse)
async def verify_contact(token: str = ""):
    if not 32 <= len(token) <= 128:
        return page("Invalid verification link.")
    db = get_db()
    now = datetime.now(timezone.utc)
    record = await db.verification_links.find_one_and_update({"token_hash": digest(token), "used": False, "expires_at": {"$gt": now}}, {"$set": {"used": True, "used_at": now}})
    if not record:
        return page("This verification link has expired or was already used.")
    channel, target = record["channel"], record["target"]
    if channel not in ("email", "phone"):
        return page("Invalid verification request.")
    if channel == "phone" and await db.users.find_one({"phone": target, "phone_verified": True, "user_id": {"$ne": record["user_id"]}}, {"_id": 1}):
        return page("This number is already verified on another account.")
    query = {"user_id": record["user_id"], "erased": {"$ne": True}, channel: record["original"], channel + "_verified": {"$ne": True}}
    updated = await db.users.update_one(query, {"$set": {channel + "_verified": True, channel + "_verified_at": now}})
    if not updated.modified_count:
        return page("Account details have changed or were already verified.")
    await db.audit_log.insert_one({"kind": "contact_verified_by_link", "target_user_id": record["user_id"], "channel": channel, "at": now})
    return page("Your " + ("email address" if channel == "email" else "mobile number") + " is verified successfully.")
