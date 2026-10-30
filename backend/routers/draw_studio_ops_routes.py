"""Draw Studio operations: winner reward approvals, draw settings and saved recordings (Super Admin only)."""
from __future__ import annotations

import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth import require_super_admin
from deps import get_db
from routers.draw_studio_routes import AUDIO_SLOTS, AUDIT, PLANS, _audit

router = APIRouter(prefix="/api/admin/draw-studio", tags=["draw-studio-ops"])
REC_DIR = "/tmp/draw_studio_recordings"
MAX_CHUNK = 8 * 1024 * 1024
MAX_RECORDING = 600 * 1024 * 1024


def _now():
    return datetime.now(timezone.utc)


def _status(w: dict) -> str:
    return "credited" if w.get("paid_out") else (w.get("approval_status") or "pending")


# --------------------------------------------------------------------------- winners & approvals

@router.get("/winners")
async def list_winners(request: Request, status: str = "all", contest_id: Optional[str] = None):
    await require_super_admin(request)
    db = get_db()
    q = {"contest_id": contest_id} if contest_id else {}
    rows = await db.winners.find(q, {"_id": 0}).sort("drawn_at", -1).to_list(1000)
    users = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": list({r["user_id"] for r in rows})}},
                                                          {"_id": 0, "user_id": 1, "name": 1, "username": 1})}
    titles = {c["contest_id"]: c.get("title") async for c in db.contests.find(
        {"contest_id": {"$in": list({r["contest_id"] for r in rows})}}, {"_id": 0, "contest_id": 1, "title": 1})}
    out = []
    for r in rows:
        r["status"] = _status(r)
        if status != "all" and r["status"] != status:
            continue
        u = users.get(r["user_id"], {})
        r["user_full_name"] = r.get("user_full_name") or u.get("name")
        r["username"] = r.get("username") or u.get("username")
        r["contest_title"] = r.get("contest_title") or titles.get(r["contest_id"])
        r.setdefault("reward_type", "bonus" if float(r.get("prize_bonus_tokens") or 0) > 0 and not float(r.get("prize_cash_amount") or 0) else "winnings")
        out.append(r)
    counts = {k: sum(1 for r in rows if _status(r) == k) for k in ("pending", "approved", "credited")}
    return {"winners": out, "counts": counts}


class EditIn(BaseModel):
    prize_amount: float = Field(..., gt=0, le=1_000_000)
    reward_type: Literal["winnings", "bonus"]
    reason: str = Field(..., min_length=5, max_length=300)


async def _draw_winner(db, winner_id: str) -> dict:
    w = await db.winners.find_one({"winner_id": winner_id}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Winner not found")
    if w.get("source") != "draw_studio":
        raise HTTPException(status_code=409, detail="Only Draw Studio rewards use this approval flow")
    return w


@router.patch("/winners/{winner_id}")
async def edit_winner(winner_id: str, body: EditIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    w = await _draw_winner(db, winner_id)
    if _status(w) != "pending":
        raise HTTPException(status_code=409, detail="Only pending rewards can be edited")
    amount = round(body.prize_amount, 2)
    if amount == round(float(w["prize_amount"]), 2) and body.reward_type == w.get("reward_type"):
        raise HTTPException(status_code=400, detail="Nothing changed")
    plan = await db[PLANS].find_one({"plan_id": w["draw_plan_id"]}, {"_id": 0, "total_budget": 1, "published_prize": 1})
    budget = round(float(plan.get("total_budget") or 0), 2)
    others = [x async for x in db.winners.find({"draw_plan_id": w["draw_plan_id"], "winner_id": {"$ne": winner_id}},
                                                {"_id": 0, "prize_amount": 1})]
    total = round(sum(float(x["prize_amount"]) for x in others) + amount, 2)
    if total > budget or total > round(float(plan.get("published_prize") or 0), 2):
        raise HTTPException(status_code=422, detail=f"Total rewards £{total:.2f} would exceed the approved prize budget £{budget:.2f}")
    entry = {"at": _now(), "by": admin.get("email"), "reason": body.reason.strip(),
             "from": {"prize_amount": w["prize_amount"], "reward_type": w.get("reward_type")},
             "to": {"prize_amount": amount, "reward_type": body.reward_type}}
    r = await db.winners.update_one({"winner_id": winner_id, "approval_status": "pending", "paid_out": {"$ne": True}}, {
        "$set": {"prize_amount": amount, "reward_type": body.reward_type, "updated_at": _now(),
                 "prize_cash_amount": amount if body.reward_type == "winnings" else 0.0,
                 "prize_bonus_tokens": amount if body.reward_type == "bonus" else 0.0},
        "$push": {"edit_history": entry}})
    if r.modified_count != 1:
        raise HTTPException(status_code=409, detail="Reward was approved concurrently")
    await _audit(db, "reward_edited", admin, plan_id=w["draw_plan_id"], winner_id=winner_id, **{k: entry[k] for k in ("from", "to", "reason")})
    return {"winner": await db.winners.find_one({"winner_id": winner_id}, {"_id": 0})}


@router.post("/winners/{winner_id}/approve")
async def approve_winner(winner_id: str, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    w = await _draw_winner(db, winner_id)
    if w.get("paid_out"):
        return {"winner": w, "idempotent_replay": True}
    now = _now()
    claimed = await db.winners.update_one({"winner_id": winner_id, "approval_status": "pending", "paid_out": {"$ne": True}}, {"$set": {
        "approval_status": "approved", "approved_at": now, "approved_by_email": admin.get("email"),
        "approved_by_user_id": admin.get("user_id"), "approved_amount": round(float(w["prize_amount"]), 2),
        "approved_reward_type": w.get("reward_type") or "winnings"}})
    if claimed.modified_count:
        await _audit(db, "reward_approved", admin, plan_id=w["draw_plan_id"], winner_id=winner_id,
                     amount=w["prize_amount"], reward_type=w.get("reward_type"))
    w = await db.winners.find_one({"winner_id": winner_id}, {"_id": 0})
    if w.get("paid_out"):
        return {"winner": w, "idempotent_replay": True}
    if w.get("approval_status") != "approved":
        raise HTTPException(status_code=409, detail="Reward is not awaiting credit")
    amount, rtype, title = w["approved_amount"], w["approved_reward_type"], w.get("prize_title") or w["contest_id"]
    extra = {}
    if rtype == "winnings":
        from routers.wallet_routes import _apply_tx_idempotent

        ref = f"paid-world:winner:{winner_id}:cash"
        tx = await _apply_tx_idempotent(db, w["user_id"], "paid_prize_cash", amount, note=f"Paid World draw prize: {title}"[:300], ref_order_id=ref)
        tx_ids, refs = [tx["tx"]["tx_id"]], [ref]
    else:
        from services.bonus_grants import create_grant
        from services.reward_program import get_reward_settings, reward_bonus_expiry

        ref = f"paid-world-draw:{winner_id}"
        expires = reward_bonus_expiry(await get_reward_settings(db), "draw_prize")
        grant = await create_grant(db, user_id=w["user_id"], amount=amount, expires_at=expires, actor_id=admin.get("user_id"),
                                   actor_email=admin.get("email"), reason=f"Paid World draw prize: {title}"[:200], ref_key=ref,
                                   source="paid_world_draw", max_amount=1_000_000)
        tx_ids, refs = grant.get("related_tx_ids") or [], [f"bonus_grant:{ref}"]
        extra = {"bonus_grant_id": grant["grant_id"], "bonus_expires_at": grant.get("expires_at")}
    done = _now()
    await db.winners.update_one({"winner_id": winner_id, "paid_out": {"$ne": True}}, {"$set": {
        "approval_status": "credited", "paid_out": True, "payment_status": "paid", "paid_at": done, "credited_at": done,
        "paid_by_user_id": admin.get("user_id"), "paid_by_email": admin.get("email"),
        "wallet_transaction_ids": tx_ids, "wallet_transaction_refs": refs,
        "prize_cash_amount": amount if rtype == "winnings" else 0.0,
        "prize_bonus_tokens": amount if rtype == "bonus" else 0.0, **extra}})
    audit_id = f"aud_paid_world_winner_{winner_id}"
    await db.audit_log.update_one({"audit_id": audit_id}, {"$setOnInsert": {
        "audit_id": audit_id, "kind": "paid_world_prize_wallet_credit", "winner_id": winner_id, "contest_id": w["contest_id"],
        "user_id": w["user_id"], "reward_type": rtype, "amount": amount, "wallet_transaction_ids": tx_ids,
        "wallet_transaction_refs": refs, "admin_user_id": admin.get("user_id"), "admin_email": admin.get("email"), "at": done}}, upsert=True)
    await _audit(db, "reward_credited", admin, plan_id=w["draw_plan_id"], winner_id=winner_id, amount=amount,
                 reward_type=rtype, wallet_transaction_ids=tx_ids)
    return {"winner": await db.winners.find_one({"winner_id": winner_id}, {"_id": 0}), "idempotent_replay": False}


@router.get("/winners/{winner_id}/audit")
async def winner_audit(winner_id: str, request: Request):
    await require_super_admin(request)
    rows = await get_db()[AUDIT].find({"winner_id": winner_id}, {"_id": 0}).sort("at", 1).to_list(100)
    return {"audit": rows}


# --------------------------------------------------------------------------- settings

class SettingsIn(BaseModel):
    bonus_expiry_enabled: Optional[bool] = None
    bonus_expiry_days: Optional[int] = Field(default=None, ge=1, le=3650)
    volumes: Optional[dict[str, float]] = None


async def _settings(db) -> dict:
    from services.reward_program import get_reward_settings

    rs = await get_reward_settings(db)
    cfg = await db.settings.find_one({"_id": "draw_studio"}, {"_id": 0}) or {}
    flags = await db.settings.find_one({"_id": "company"}, {"_id": 0, "random_draw_engine_enabled": 1}) or {}
    return {"bonus_expiry_enabled": bool(rs.get("draw_prize_bonus_expiry_enabled")),
            "bonus_expiry_days": int(rs.get("draw_prize_bonus_expiry_days") or 30),
            "volumes": cfg.get("volumes") or {}, "slots": AUDIO_SLOTS,
            "official_draws_enabled": bool(flags.get("random_draw_engine_enabled"))}


@router.get("/settings")
async def get_settings(request: Request):
    await require_super_admin(request)
    return await _settings(get_db())


@router.put("/settings")
async def put_settings(body: SettingsIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    reward = {}
    if body.bonus_expiry_enabled is not None:
        reward["draw_prize_bonus_expiry_enabled"] = body.bonus_expiry_enabled
    if body.bonus_expiry_days is not None:
        reward["draw_prize_bonus_expiry_days"] = body.bonus_expiry_days
    if reward:
        from services.reward_program import save_reward_settings

        await save_reward_settings(db, reward)
    if body.volumes is not None:
        vols = {k: round(min(1.0, max(0.0, float(v))), 2) for k, v in body.volumes.items() if k in AUDIO_SLOTS}
        await db.settings.update_one({"_id": "draw_studio"}, {"$set": {"volumes": vols, "updated_at": _now()}}, upsert=True)
    await _audit(db, "settings_updated", admin, changes=body.model_dump(exclude_none=True))
    return await _settings(db)


# --------------------------------------------------------------------------- recordings (chunked upload)

class RecordingIn(BaseModel):
    mode: Literal["preview", "official"]
    contest_id: Optional[str] = None
    plan_id: Optional[str] = None
    label: str = Field(default="", max_length=120)
    content_type: str = Field(..., max_length=80)
    size: int = Field(..., gt=0, le=MAX_RECORDING)


@router.post("/recordings")
async def init_recording(body: RecordingIn, request: Request):
    admin = await require_super_admin(request)
    if not body.content_type.startswith(("video/webm", "video/mp4")):
        raise HTTPException(status_code=415, detail="Recordings must be WebM or MP4")
    rid = f"dsv_{uuid.uuid4().hex[:14]}"
    os.makedirs(os.path.join(REC_DIR, rid), exist_ok=True)
    doc = {"recording_id": rid, **body.model_dump(), "status": "uploading", "created_at": _now(), "created_by": admin.get("email")}
    await get_db().draw_studio_recordings.insert_one(dict(doc))
    return {"recording_id": rid, "chunk_size": MAX_CHUNK}


@router.put("/recordings/{rid}/chunks/{index}")
async def upload_chunk(rid: str, index: int, request: Request):
    await require_super_admin(request)
    doc = await get_db().draw_studio_recordings.find_one({"recording_id": rid, "status": "uploading"}, {"_id": 0})
    if not doc or not 0 <= index < 200:
        raise HTTPException(status_code=404, detail="Upload not found")
    data = await request.body()
    if not data or len(data) > MAX_CHUNK:
        raise HTTPException(status_code=413, detail="Chunk too large")
    with open(os.path.join(REC_DIR, rid, f"{index:04d}"), "wb") as f:
        f.write(data)
    return {"ok": True}


class CompleteIn(BaseModel):
    chunks: int = Field(..., ge=1, le=200)


@router.post("/recordings/{rid}/complete")
async def complete_recording(rid: str, body: CompleteIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    doc = await db.draw_studio_recordings.find_one({"recording_id": rid, "status": "uploading"}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Upload not found")
    folder = os.path.join(REC_DIR, rid)
    parts = [os.path.join(folder, f"{i:04d}") for i in range(body.chunks)]
    if not all(os.path.exists(p) for p in parts):
        raise HTTPException(status_code=409, detail="Some chunks are missing; retry the upload")
    data = b"".join(open(p, "rb").read() for p in parts)
    from object_storage import APP_NAME, put_object

    ext = "mp4" if "mp4" in doc["content_type"] else "webm"
    stored = put_object(f"{APP_NAME}/draw-studio/recordings/{rid}.{ext}", data, doc["content_type"].split(";")[0])
    shutil.rmtree(folder, ignore_errors=True)
    await db.draw_studio_recordings.update_one({"recording_id": rid}, {"$set": {
        "status": "ready", "storage_path": stored["path"], "size": len(data), "ext": ext, "completed_at": _now()}})
    await _audit(db, "recording_saved", admin, plan_id=doc.get("plan_id"), recording_id=rid, mode=doc["mode"], size=len(data))
    return {"recording": await db.draw_studio_recordings.find_one({"recording_id": rid}, {"_id": 0})}


@router.get("/recordings")
async def list_recordings(request: Request, contest_id: Optional[str] = None):
    await require_super_admin(request)
    q = {"status": "ready", **({"contest_id": contest_id} if contest_id else {})}
    return {"recordings": await get_db().draw_studio_recordings.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)}


@router.get("/recordings/{rid}/file")
async def recording_file(rid: str, request: Request):
    await require_super_admin(request)
    doc = await get_db().draw_studio_recordings.find_one({"recording_id": rid, "status": "ready"}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Recording not found")
    from object_storage import get_object

    data, _ = get_object(doc["storage_path"])
    return Response(content=data, media_type=doc["content_type"].split(";")[0],
                    headers={"Content-Disposition": f'attachment; filename="prize-league-draw-{rid}.{doc["ext"]}"'})


# --------------------------------------------------------------------------- studio backdrops (live contests + offers)

async def _backdrop_items(db) -> list[dict]:
    from services.reward_program import get_reward_settings

    items = []
    async for c in db.contests.find({"status": "live"}, {"_id": 0, "title": 1, "prize_amount": 1, "price": 1, "image": 1,
                                                         "ticket_price": 1}).sort("created_at", -1).limit(8):
        price = c.get("ticket_price") or c.get("price")
        items.append({"kind": "contest", "title": c.get("title") or "Live contest", "headline": f"£{float(c.get('prize_amount') or 0):,.0f}",
                      "subtitle": f"Tickets from £{float(price):.2f} · Enter now at Prize League" if price else "Enter now at Prize League",
                      "image_url": c.get("image") if str(c.get("image") or "").startswith("https://") else None})
    rs = await get_reward_settings(db)
    if rs.get("signup_offer_enabled") and float(rs.get("signup_reward_tokens") or 0) > 0:
        items.append({"kind": "offer", "title": "Welcome bonus for new players", "headline": f"{float(rs['signup_reward_tokens']):g} FREE TOKENS",
                      "subtitle": f"Top up £{float(rs.get('signup_qualifying_topup_gbp') or 0):g} to unlock", "image_url": None})
    if rs.get("referral_offer_enabled") and float(rs.get("referral_reward_tokens") or 0) > 0:
        items.append({"kind": "offer", "title": "Refer a friend and earn", "headline": f"{float(rs['referral_reward_tokens']):g} TOKENS",
                      "subtitle": "For every friend who joins and plays", "image_url": None})
    if not items:
        items.append({"kind": "offer", "title": "Skill contests with real prizes", "headline": "PRIZE LEAGUE", "subtitle": "Play. Compete. Win.", "image_url": None})
    return items


@router.get("/backdrops")
async def backdrops(request: Request):
    await require_super_admin(request)
    return {"items": await _backdrop_items(get_db())}


@router.get("/backdrops/image")
async def backdrop_image(url: str, request: Request):
    await require_super_admin(request)
    if url not in {i["image_url"] for i in await _backdrop_items(get_db()) if i.get("image_url")}:
        raise HTTPException(status_code=404, detail="Unknown backdrop image")
    import asyncio

    import requests

    resp = await asyncio.to_thread(requests.get, url, timeout=15)
    if resp.status_code != 200 or not resp.headers.get("Content-Type", "").startswith("image/") or len(resp.content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=502, detail="Backdrop image unavailable")
    return Response(content=resp.content, media_type=resp.headers["Content-Type"])
