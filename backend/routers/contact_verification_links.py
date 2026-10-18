"""One-click, expiring email and SMS verification links for existing users."""
import asyncio
import hashlib
import json
import os
import secrets
import urllib.request
from datetime import datetime, timedelta, timezone
from html import escape
from fastapi import APIRouter, HTTPException, Request, Form
from fastapi.responses import HTMLResponse
from auth import require_admin
from deps import get_db
from otp_verify import normalize_phone, twilio_verify_client

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
    record = {"was_verified": bool(user.get(channel + "_verified")), "token_hash": digest(token), "user_id": user_id, "channel": channel, "target": target, "original": original, "created_at": now, "expires_at": now + timedelta(minutes=30), "used": False}
    inserted = await db.verification_links.insert_one(record)
    link = os.getenv("PUBLIC_SITE_URL", "https://prizeleague.co.uk").rstrip("/") + "/api/verify-contact?token=" + token
    try:
        await asyncio.to_thread(email_send, target if channel == "email" else user.get("email"), link) if (channel == "email" or user.get("email")) else await asyncio.to_thread(sms_send, target, link)
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
    record = await db.verification_links.find_one({"token_hash": digest(token), "used": False, "expires_at": {"$gt": now}})
    if not record:
        return page("This verification link has expired or was already used.")
    channel, target = record["channel"], record["target"]
    if channel not in ("email", "phone"):
        return page("Invalid verification request.")
    if channel == "phone":
        return HTMLResponse('<h1>Prize League Mobile Verification</h1><p>Request an SMS code, then enter it below.</p><form method="post" action="/api/verify-contact/mobile/send"><input type="hidden" name="token" value="' + escape(token, quote=True) + '"><button type="submit">Send SMS code</button></form><form method="post" action="/api/verify-contact/mobile/check"><input type="hidden" name="token" value="' + escape(token, quote=True) + '"><label>SMS code <input name="code" required pattern="[0-9]{4,10}" autocomplete="one-time-code"></label><button type="submit">Verify mobile</button></form>')
    if channel == "phone" and await db.users.find_one({"phone": target, "phone_verified": True, "user_id": {"$ne": record["user_id"]}}, {"_id": 1}):
        return page("This number is already verified on another account.")
    query = {"user_id": record["user_id"], "erased": {"$ne": True}, channel: record["original"], channel + "_verified": {"$ne": True}}
    claimed = await db.verification_links.update_one({"_id": record["_id"], "used": False}, {"$set": {"used": True, "used_at": now}})
    if not claimed.modified_count:
        return page("Link already used.")
    updated = await db.users.update_one(query, {"$set": {channel + "_verified": True, channel + "_verified_at": now}})
    if not updated.modified_count:
        still_valid = await db.users.find_one({"user_id": record["user_id"], channel: record["original"], channel + "_verified": True, "erased": {"$ne": True}})
        if still_valid:
            return page("Your email address is already verified. Verification confirmed.")
        return page("Account details have changed. Please request a new link.")
    await db.audit_log.insert_one({"kind": "contact_verified_by_link", "target_user_id": record["user_id"], "channel": channel, "at": now})
    return page("Your " + ("email address" if channel == "email" else "mobile number") + " is verified successfully.")

@router.post("/api/verify-contact/mobile/send", response_class=HTMLResponse)
async def mobile_send(token: str = Form(...)):
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = await db.verification_links.find_one({"token_hash": digest(token), "channel": "phone", "used": False, "expires_at": {"$gt": now}})
    if not doc:
        return page("Link expired or invalid.")
    if doc.get("sms_sent_at") and (now - doc["sms_sent_at"]).total_seconds() < 60:
        return page("Please wait 60 seconds before requesting another SMS. Return to the verification link to enter your code.")
    user = await db.users.find_one({"user_id": doc["user_id"], "phone": doc["original"], "erased": {"$ne": True}})
    if not user:
        return page("Account details changed. Request a new link.")
    try:
        client, service_sid = twilio_verify_client()
        await asyncio.to_thread(lambda: client.verify.v2.services(service_sid).verifications.create(to=doc["target"], channel="sms"))
    except Exception:
        return page("Could not send SMS. Please contact support.")
    await db.verification_links.update_one({"_id": doc["_id"]}, {"$set": {"sms_sent_at": now}})
    return page("SMS code sent. Return to the verification link and enter the code.")

@router.post("/api/verify-contact/mobile/check", response_class=HTMLResponse)
async def mobile_check(token: str = Form(...), code: str = Form(...)):
    if not code.isdigit() or not 4 <= len(code) <= 10:
        return page("Invalid SMS code.")
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = await db.verification_links.find_one({"token_hash": digest(token), "channel": "phone", "used": False, "expires_at": {"$gt": now}})
    if not doc or not doc.get("sms_sent_at"):
        return page("Request an SMS code first or request a new verification link.")
    user = await db.users.find_one({"user_id": doc["user_id"], "phone": doc["original"], "erased": {"$ne": True}})
    if not user:
        return page("Account details changed.")
    if await db.users.find_one({"phone": doc["target"], "phone_verified": True, "user_id": {"$ne": doc["user_id"]}}, {"_id": 1}):
        return page("Number already verified on another account.")
    try:
        client, service_sid = twilio_verify_client()
        result = await asyncio.to_thread(lambda: client.verify.v2.services(service_sid).verification_checks.create(to=doc["target"], code=code))
        if result.status != "approved":
            return page("Incorrect or expired SMS code.")
    except Exception:
        return page("Unable to verify code. Please try again.")
    claimed = await db.verification_links.update_one({"_id": doc["_id"], "used": False}, {"$set": {"used": True, "used_at": now}})
    if not claimed.modified_count:
        return page("Link already used.")
    updated = await db.users.update_one({"user_id": doc["user_id"], "phone": doc["original"], "erased": {"$ne": True}}, {"$set": {"phone_verified": True, "phone_verified_at": now}})
    if not updated.modified_count:
        still_valid = await db.users.find_one({"user_id": doc["user_id"], "phone": doc["original"], "phone_verified": True, "erased": {"$ne": True}})
        if still_valid:
            return page("Your mobile number is already verified. Verification confirmed.")
        return page("Account could not be updated.")
    await db.audit_log.insert_one({"kind": "mobile_verified_by_sms", "target_user_id": doc["user_id"], "at": now})
    return page("Your mobile number is now verified.")
