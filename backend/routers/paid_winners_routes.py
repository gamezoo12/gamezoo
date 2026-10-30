"""Paid World winners: Super Admin approvals + publication controls, and the public Winners / Past Leaderboards / Draw Gallery (Paid World only)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth import require_super_admin
from deps import get_db

admin_router = APIRouter(prefix="/api/admin/paid-winners", tags=["paid-winners-admin"])
public_router = APIRouter(prefix="/api/public/paid-winners", tags=["paid-winners-public"])
PUB = "paid_winner_publication"
COMPLETED = ["closed", "drawn", "archived"]
OFFICIAL = {"approved", "credited"}
MAX_MEDIA = 150 * 1024 * 1024
Wallet = Literal["winnings", "bonus", "winning_bonus", "topup"]


def _now():
    return datetime.now(timezone.utc)


def _mask(name: Optional[str]) -> str:
    parts = [p for p in str(name or "").replace("@", " ").split() if p]
    if not parts:
        return "Winner"
    return parts[0][:1].upper() + parts[0][1:] + (f" {parts[-1][0].upper()}." if len(parts) > 1 else "")


def _official(w: dict) -> bool:
    if w.get("public_hidden"):
        return False
    if w.get("source") == "draw_studio":
        return bool(w.get("published")) and (w.get("approval_status") in OFFICIAL or bool(w.get("credited_at")))
    return True


async def _contests(db, cid: Optional[str] = None) -> list[dict]:
    q = {"status": {"$in": COMPLETED}, "contest_id": cid or {"$not": {"$regex": "^promo_"}}}
    cs = await db.contests.find(q, {"_id": 0, "contest_id": 1, "title": 1, "image": 1, "prize_amount": 1, "end_date": 1,
                                    "game_type": 1, "status": 1}).to_list(500)
    ids = [c["contest_id"] for c in cs]
    pubs = {p["contest_id"]: p async for p in db[PUB].find({"contest_id": {"$in": ids}}, {"_id": 0})}
    draw_ids = set(await db.winners.distinct("contest_id", {"contest_id": {"$in": ids}, "source": "draw_studio"}))
    draw_ids |= set(await db.draw_studio_plans.distinct("contest_id", {"contest_id": {"$in": ids}}))
    for c in cs:
        p = pubs.get(c["contest_id"], {})
        c["kind"] = "leaderboard" if c.get("game_type") and c["contest_id"] not in draw_ids else "draw"
        c["publication"] = {k: p.get(k, False) for k in ("show_winners", "show_leaderboard", "show_gallery")}
        c["publication"].update({"display_order": p.get("display_order", 100), "cover": p.get("cover"), "media": p.get("media", []),
                                 "hidden_round_media": p.get("hidden_round_media", [])})
    return sorted(cs, key=lambda c: (c["publication"]["display_order"], -datetime.timestamp(c["end_date"]) if isinstance(c.get("end_date"), datetime) else 0))


async def _audit(db, admin, action, **fields):
    await db.audit_log.insert_one({"audit_id": f"aud_pw_{uuid.uuid4().hex[:12]}", "kind": f"paid_winners_{action}",
                                   "admin_email": admin.get("email"), "at": _now(), **fields})


# ------------------------------------------------------------------ admin: winners & approvals

@admin_router.get("/winners")
async def admin_winners(request: Request, status: str = "all", kind: Literal["all", "draw", "leaderboard"] = "all"):
    from routers.draw_studio_ops_routes import list_winners

    data = await list_winners(request, status="all")
    rows = [w for w in data["winners"] if not str(w.get("contest_id", "")).startswith("promo_")]
    for w in rows:
        w["kind"] = "draw" if w.get("source") == "draw_studio" else "leaderboard"
        w["public_visible"] = not w.get("public_hidden")
    rows = [w for w in rows if kind == "all" or w["kind"] == kind]
    counts = {k: sum(1 for w in rows if w["status"] == k) for k in ("pending", "approved", "credited")}
    return {"winners": [w for w in rows if status == "all" or w["status"] == status], "counts": counts}


class ApproveIn(BaseModel):
    wallet: Wallet = "winnings"


@admin_router.post("/winners/{winner_id}/approve")
async def approve(winner_id: str, body: ApproveIn, request: Request):
    from services.wallet_admin_adjust import WALLET_LABELS, adjust_single_wallet

    admin = await require_super_admin(request)
    db = get_db()
    w = await db.winners.find_one({"winner_id": winner_id}, {"_id": 0})
    if not w or str(w.get("contest_id", "")).startswith("promo_"):
        raise HTTPException(status_code=404, detail="Paid World winner not found")
    if w.get("paid_out"):
        return {"winner": w, "idempotent_replay": True}
    studio = w.get("source") == "draw_studio"
    if studio and w.get("approval_status") not in (None, "pending", "approved"):
        raise HTTPException(status_code=409, detail="Reward is not awaiting approval")
    amount = round(float(w.get("approved_amount") or w.get("prize_amount") or 0), 2)
    extra = 0.0 if studio else round(float(w.get("prize_bonus_tokens") or 0), 2)
    if amount <= 0 and extra <= 0:
        raise HTTPException(status_code=400, detail="This winner has no reward amount to credit")
    now = _now()
    if studio:
        await db.winners.update_one({"winner_id": winner_id, "approval_status": "pending"}, {"$set": {
            "approval_status": "approved", "approved_at": now, "approved_by_email": admin.get("email"),
            "approved_by_user_id": admin.get("user_id"), "approved_amount": amount, "approved_reward_type": body.wallet}})
    title = w.get("prize_title") or w.get("contest_title") or w["contest_id"]
    tx_ids = []
    for wallet, amt, tag in ((body.wallet, amount, "main"), ("winning_bonus", extra, "bonus")):
        if amt > 0:
            r = await adjust_single_wallet(db, w["user_id"], wallet, amt, note=f"Paid World prize: {title}"[:300],
                                           operation_id=f"paid_winner_credit:{winner_id}:{tag}", admin=admin)
            tx_ids.append(r["tx"]["tx_id"])
    done = _now()
    await db.winners.update_one({"winner_id": winner_id, "paid_out": {"$ne": True}}, {"$set": {
        "approval_status": "credited", "paid_out": True, "payment_status": "paid", "paid_at": done, "credited_at": done,
        "paid_by_user_id": admin.get("user_id"), "paid_by_email": admin.get("email"), "credited_wallet": body.wallet,
        "reward_type": body.wallet, "wallet_transaction_ids": tx_ids}})
    await db.audit_log.update_one({"audit_id": f"aud_paid_world_winner_{winner_id}"}, {"$setOnInsert": {
        "audit_id": f"aud_paid_world_winner_{winner_id}", "kind": "paid_world_prize_wallet_credit", "winner_id": winner_id,
        "contest_id": w["contest_id"], "user_id": w["user_id"], "wallet": body.wallet, "amount": amount, "winning_bonus_extra": extra,
        "wallet_transaction_ids": tx_ids, "admin_user_id": admin.get("user_id"), "admin_email": admin.get("email"), "at": done}}, upsert=True)
    if studio:
        from routers.draw_studio_routes import _audit as studio_audit
        await studio_audit(db, "reward_credited", admin, plan_id=w.get("draw_plan_id"), winner_id=winner_id, amount=amount,
                           reward_type=body.wallet, wallet_transaction_ids=tx_ids)
    return {"winner": await db.winners.find_one({"winner_id": winner_id}, {"_id": 0}), "wallet_label": WALLET_LABELS[body.wallet],
            "idempotent_replay": False}


class VisibilityIn(BaseModel):
    visible: bool


@admin_router.put("/winners/{winner_id}/visibility")
async def winner_visibility(winner_id: str, body: VisibilityIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    r = await db.winners.update_one({"winner_id": winner_id}, {"$set": {"public_hidden": not body.visible}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Winner not found")
    await _audit(db, admin, "winner_visibility", winner_id=winner_id, visible=body.visible)
    return {"ok": True}


# ------------------------------------------------------------------ admin: publication controls

@admin_router.get("/contests")
async def admin_contests(request: Request):
    await require_super_admin(request)
    db = get_db()
    cs = await _contests(db)
    from routers.draw_studio_ops_routes import published_round_media
    clips = await published_round_media(db, [c["contest_id"] for c in cs])
    for c in cs:
        ws = await db.winners.find({"contest_id": c["contest_id"]}, {"_id": 0, "approval_status": 1, "published": 1, "source": 1,
                                                                      "credited_at": 1, "public_hidden": 1}).to_list(500)
        c["winner_counts"] = {"total": len(ws), "official": sum(1 for w in ws if _official(w))}
        c["round_media"] = clips.get(c["contest_id"], [])
    return {"contests": cs}


class PublicationIn(BaseModel):
    show_winners: bool
    show_leaderboard: bool
    show_gallery: bool
    display_order: int = Field(default=100, ge=0, le=10000)


@admin_router.put("/contests/{cid}/publication")
async def set_publication(cid: str, body: PublicationIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    if not await db.contests.find_one({"contest_id": cid, "status": {"$in": COMPLETED}}):
        raise HTTPException(status_code=404, detail="Only completed Paid World contests can be published")
    await db[PUB].update_one({"contest_id": cid}, {"$set": {**body.model_dump(), "updated_at": _now(), "updated_by": admin.get("email")}}, upsert=True)
    await _audit(db, admin, "publication", contest_id=cid, settings=body.model_dump())
    sent = await _shout_out(db, cid) if body.show_winners else 0
    return {"ok": True, "shoutouts_sent": sent}


async def _shout_out(db, cid: str) -> int:
    claimed = await db[PUB].update_one({"contest_id": cid, "shoutout_sent_at": {"$exists": False}}, {"$set": {"shoutout_sent_at": _now()}})
    if not claimed.modified_count:
        return 0
    from notifications import notify
    c = await db.contests.find_one({"contest_id": cid}, {"_id": 0, "title": 1}) or {}
    users = {w["user_id"] async for w in db.winners.find({"contest_id": cid}, {"_id": 0}) if _official(w) and w.get("user_id")}
    for uid in users:
        await notify(db, user_id=uid, kind="winner_shoutout", title=f"You're in the Hall of Winners! 🏆",
                     body=f"Your win in “{c.get('title') or 'Prize League'}” is now published. Tap to see your result.",
                     contest_id=cid, target_url=f"/my-account/contest-winners?contest={cid}")
    await db[PUB].update_one({"contest_id": cid}, {"$set": {"shoutout_count": len(users)}})
    return len(users)


@admin_router.post("/contests/{cid}/media")
async def upload_media(cid: str, request: Request, kind: Literal["cover", "gallery"] = Form(...), caption: str = Form(""), file: UploadFile = File(...)):
    admin = await require_super_admin(request)
    ctype = (file.content_type or "").split(";")[0]
    if not ctype.startswith(("image/", "video/")):
        raise HTTPException(status_code=415, detail="Upload an image or a video")
    if kind == "cover" and not ctype.startswith("image/"):
        raise HTTPException(status_code=415, detail="Cover must be an image")
    data = await file.read()
    if not data or len(data) > MAX_MEDIA:
        raise HTTPException(status_code=413, detail="File must be under 150 MB")
    db = get_db()
    if not await db.contests.find_one({"contest_id": cid, "status": {"$in": COMPLETED}}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Only completed Paid World contests accept media")
    from object_storage import APP_NAME, put_object
    mid = f"pwm_{uuid.uuid4().hex[:14]}"
    ext = (file.filename or "").rsplit(".", 1)[-1][:5].lower() or ("mp4" if ctype.startswith("video") else "jpg")
    stored = put_object(f"{APP_NAME}/paid-winners/{cid}/{mid}.{ext}", data, ctype)
    item = {"media_id": mid, "path": stored["path"], "content_type": ctype, "type": "video" if ctype.startswith("video") else "image",
            "caption": caption[:140], "uploaded_at": _now().isoformat()}
    op = {"$set": {"cover": item}} if kind == "cover" else {"$push": {"media": item}}
    await db[PUB].update_one({"contest_id": cid}, {**op, "$setOnInsert": {"contest_id": cid}}, upsert=True)
    await _audit(db, admin, "media_upload", contest_id=cid, media_id=mid, kind=kind)
    return {"media": item}


class OrderIn(BaseModel):
    media_ids: list[str]


@admin_router.put("/contests/{cid}/media/order")
async def reorder_media(cid: str, body: OrderIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    doc = await db[PUB].find_one({"contest_id": cid}, {"_id": 0, "media": 1}) or {}
    by = {m["media_id"]: m for m in doc.get("media", [])}
    ordered = [by[i] for i in body.media_ids if i in by] + [m for k, m in by.items() if k not in body.media_ids]
    await db[PUB].update_one({"contest_id": cid}, {"$set": {"media": ordered}})
    await _audit(db, admin, "media_reorder", contest_id=cid)
    return {"media": ordered}


@admin_router.delete("/contests/{cid}/media/{mid}")
async def delete_media(cid: str, mid: str, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    r1 = await db[PUB].update_one({"contest_id": cid}, {"$pull": {"media": {"media_id": mid}}})
    r2 = await db[PUB].update_one({"contest_id": cid, "cover.media_id": mid}, {"$unset": {"cover": ""}})
    if not (r1.modified_count or r2.modified_count):
        raise HTTPException(status_code=404, detail="Media not found")
    await _audit(db, admin, "media_delete", contest_id=cid, media_id=mid)
    return {"ok": True}


@admin_router.put("/contests/{cid}/round-media/{rid}/visibility")
async def round_media_visibility(cid: str, rid: str, body: VisibilityIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    if not await db.draw_studio_recordings.find_one({"recording_id": rid, "contest_id": cid}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Recording not found for this contest")
    op = {"$pull": {"hidden_round_media": rid}} if body.visible else {"$addToSet": {"hidden_round_media": rid}}
    await db[PUB].update_one({"contest_id": cid}, {**op, "$setOnInsert": {"contest_id": cid}}, upsert=True)
    await _audit(db, admin, "round_media_visibility", contest_id=cid, recording_id=rid, visible=body.visible)
    return {"ok": True}


@admin_router.get("/media/{cid}/{mid}")
async def admin_media(cid: str, mid: str, request: Request):
    await require_super_admin(request)
    return await _media_response(get_db(), cid, mid, public=False, request=request)


# ------------------------------------------------------------------ public (Paid World only)

def _card(c: dict) -> dict:
    p = c["publication"]
    return {"contest_id": c["contest_id"], "title": c.get("title"), "kind": c["kind"], "prize_amount": c.get("prize_amount"),
            "end_date": c["end_date"].replace(tzinfo=timezone.utc).isoformat() if isinstance(c.get("end_date"), datetime) else c.get("end_date"),
            "image": c.get("image"), "cover_id": (p.get("cover") or {}).get("media_id")}


@public_router.get("")
async def public_list(tab: Literal["winners", "leaderboards", "gallery"] = "winners"):
    db = get_db()
    flag = {"winners": "show_winners", "leaderboards": "show_leaderboard", "gallery": "show_gallery"}[tab]
    want = {"leaderboards": "leaderboard", "gallery": "draw"}.get(tab)
    return {"contests": [_card(c) for c in await _contests(db) if c["publication"][flag] and (not want or c["kind"] == want)]}


async def _visible(db, cid: str, flag: str) -> dict:
    c = next((x for x in await _contests(db, cid) if x["publication"][flag]), None)
    if not c:
        raise HTTPException(status_code=404, detail="Not published")
    return c


@public_router.get("/{cid}/winners")
async def public_winners(cid: str):
    db = get_db()
    c = await _visible(db, cid, "show_winners")
    rows = await db.winners.find({"contest_id": cid}, {"_id": 0}).sort([("draw_round_index", 1), ("drawn_at", 1)]).to_list(500)
    ws = [{"name": _mask(w.get("user_name")), "ticket_number": w.get("ticket_number"), "prize_amount": w.get("prize_amount"),
           "prize_bonus_tokens": w.get("prize_bonus_tokens") if w.get("source") != "draw_studio" else 0,
           "round_name": w.get("draw_round_name"), "drawn_at": w.get("drawn_at"),
           "source": "draw" if w.get("source") == "draw_studio" else "leaderboard"} for w in rows if _official(w)]
    return {"contest": _card(c), "winners": ws}


@public_router.get("/{cid}/leaderboard")
async def public_leaderboard(cid: str, request: Request):
    db = get_db()
    c = await _visible(db, cid, "show_leaderboard")
    if c["kind"] != "leaderboard":
        raise HTTPException(status_code=404, detail="Not a leaderboard contest")
    from routers.company_routes import contest_leaderboard
    lb = await contest_leaderboard(cid, request, limit=100)
    rows = [{"rank": r["rank"], "name": _mask(r.get("user_name")), "points": r.get("points"), "accuracy_pct": r.get("accuracy_pct"),
             "duration_ms": r.get("duration_ms"), "ticket_number": r.get("ticket_number")} for r in lb.get("entries", [])]
    return {"contest": _card(c), "leaderboard": rows, "stats": lb.get("stats"), "tie_break_rules": lb.get("tie_break_rules")}


@public_router.get("/{cid}/gallery")
async def public_gallery(cid: str):
    db = get_db()
    c = await _visible(db, cid, "show_gallery")
    from routers.draw_studio_ops_routes import published_round_media
    hidden = set(c["publication"]["hidden_round_media"])
    clips = []
    for m in (await published_round_media(db, [cid])).get(cid, []):
        m = {k: v for k, v in m.items() if k == "round_index" or v not in hidden}
        if m.get("clip") or m.get("screenshot"):
            clips.append(m)
    return {"contest": _card(c), "media": [{k: m[k] for k in ("media_id", "type", "caption", "content_type")} for m in c["publication"]["media"]],
            "round_media": clips}


def _ranged(request: Request, data: bytes, ctype: str, cache: str) -> Response:
    headers = {"Accept-Ranges": "bytes", "Cache-Control": cache}
    rng = (request.headers.get("range") or "").replace("bytes=", "")
    if rng and "-" in rng and "," not in rng:
        a, b = rng.split("-", 1)
        size = len(data)
        start, end = (int(a), int(b) if b else size - 1) if a else (max(0, size - int(b or 0)), size - 1)
        end = min(end, size - 1)
        if start > end:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        return Response(content=data[start:end + 1], status_code=206, media_type=ctype, headers=headers)
    return Response(content=data, media_type=ctype, headers=headers)


async def _media_response(db, cid: str, mid: str, public: bool, request: Request):
    p = await db[PUB].find_one({"contest_id": cid}, {"_id": 0}) or {}
    cover = p.get("cover") or {}
    item = cover if cover.get("media_id") == mid else next((m for m in p.get("media", []) if m.get("media_id") == mid), None)
    allowed = (p.get("show_winners") or p.get("show_gallery") or p.get("show_leaderboard")) if item is cover else p.get("show_gallery")
    if not item or (public and not allowed):
        raise HTTPException(status_code=404, detail="Media not found")
    from object_storage import get_object
    data, _ = get_object(item["path"])
    return _ranged(request, data, item["content_type"], "public, max-age=300" if public else "private, max-age=60")


@public_router.get("/media/{cid}/{mid}")
async def public_media(cid: str, mid: str, request: Request):
    return await _media_response(get_db(), cid, mid, public=True, request=request)


@public_router.get("/round-media/{cid}/{rid}")
async def public_round_media(cid: str, rid: str, request: Request):
    db = get_db()
    c = await _visible(db, cid, "show_gallery")
    from routers.draw_studio_ops_routes import published_round_media
    ok = rid not in c["publication"]["hidden_round_media"] and any(
        rid in (m.get("clip"), m.get("screenshot")) for m in (await published_round_media(db, [cid])).get(cid, []))
    doc = ok and await db.draw_studio_recordings.find_one({"recording_id": rid, "contest_id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Media not found")
    from object_storage import get_object
    data, _ = get_object(doc["storage_path"])
    return _ranged(request, data, doc["content_type"].split(";")[0], "public, max-age=300")
