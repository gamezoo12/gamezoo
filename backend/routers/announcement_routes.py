"""Super Admin-managed announcements for the existing site ticker (public read-only feed filtered server-side)."""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_super_admin
from deps import get_db

public_router = APIRouter(prefix="/api/announcements", tags=["announcements"])
admin_router = APIRouter(prefix="/api/admin/announcements", tags=["announcements-admin"])

COLLECTION = "site_announcements"
AUDIT = "site_announcement_audit"
BADGE_SETTINGS = "promotion_badge"
BADGE_DEFAULTS = {"enabled": True, "text": "", "url": "/my-account/promotions"}
FALLBACKS = [
    {"id": "default:skill", "text": "Play Skill-Based Games", "icon": "🎉"},
    {"id": "default:contests", "text": "Enter Exciting Contests", "icon": "⚡"},
    {"id": "default:prizes", "text": "Win Amazing Prizes with Prize League", "icon": "🏆"},
    {"id": "default:weekly", "text": "New contests every week — brand-new skill games each drop", "icon": "✨"},
]
_TAGS = re.compile(r"[<>]")


def _clean_text(value: str, label: str, limit: int) -> str:
    value = (value or "").strip()
    if not value:
        raise HTTPException(status_code=422, detail=f"{label} is required")
    if _TAGS.search(value):
        raise HTTPException(status_code=422, detail=f"{label} cannot contain HTML characters (< or >)")
    if len(value) > limit:
        raise HTTPException(status_code=422, detail=f"{label} must be at most {limit} characters")
    return value


def _clean_link(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None
    if re.search(r"[\s<>\\\"']", value) or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise HTTPException(status_code=422, detail="Link must be an internal path (/page) or an http(s) URL")
    try:
        parsed = urlsplit(value)
        internal = value.startswith("/") and not value.startswith("//") and not parsed.netloc
        external = parsed.scheme.lower() in ("http", "https") and bool(parsed.hostname) and not parsed.username and not parsed.password
        if external:
            parsed.port
    except ValueError:
        internal = external = False
    if not (internal or external):
        raise HTTPException(status_code=422, detail="Link must be an internal path (/page) or an http(s) URL")
    return value


def _utc(value, label: str) -> Optional[datetime]:
    if value in (None, ""):
        return None
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{label} must be an ISO-8601 timestamp")
    if parsed.tzinfo is None:
        raise HTTPException(status_code=422, detail=f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _as_aware(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return None


def effective_status(doc: dict, now: Optional[datetime] = None) -> str:
    now = now or datetime.now(timezone.utc)
    if not doc.get("enabled", True):
        return "disabled"
    if not doc.get("published"):
        return "draft"
    start, end = _as_aware(doc.get("start_at")), _as_aware(doc.get("end_at"))
    if end and end <= now:
        return "expired"
    if start and start > now:
        return "scheduled"
    return "published"


class AnnouncementIn(BaseModel):
    title: str = Field(..., max_length=120)
    text: str = Field(..., max_length=300)
    icon: Optional[str] = Field(default=None, max_length=8)
    link: Optional[str] = Field(default=None, max_length=500)
    priority: int = Field(default=0, ge=0, le=100)
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    publish: bool = False


class ReorderIn(BaseModel):
    ids: list[str] = Field(..., min_length=1)


class BadgeSettingsIn(BaseModel):
    enabled: bool = True
    text: str = Field(default="", max_length=80)
    url: str = Field(default="/my-account/promotions", max_length=500)


class GeneratedAnnouncementIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)
    enabled: bool = True
    published: bool = True
    deleted: bool = False


async def _badge_settings(db):
    doc = await db.site_announcement_settings.find_one({"_id": BADGE_SETTINGS}, {"_id": 0, "enabled": 1, "text": 1, "url": 1})
    return {**BADGE_DEFAULTS, **(doc or {})}


def _validated(body: AnnouncementIn) -> dict:
    start, end = _utc(body.start_at, "Start"), _utc(body.end_at, "End")
    if start and end and end <= start:
        raise HTTPException(status_code=422, detail="End must be after start")
    icon = (body.icon or "").strip() or None
    if icon and _TAGS.search(icon):
        raise HTTPException(status_code=422, detail="Icon cannot contain HTML characters")
    return {"title": _clean_text(body.title, "Title", 120), "text": _clean_text(body.text, "Text", 200),
            "icon": icon, "link": _clean_link(body.link), "priority": body.priority, "start_at": start, "end_at": end}


def _admin_view(doc: dict) -> dict:
    out = {k: (_as_aware(v).isoformat() if isinstance(v, datetime) else v) for k, v in doc.items() if k != "_id"}
    out["status"] = effective_status(doc)
    return out


async def _audit(db, announcement_id: str, action: str, admin: dict, previous=None, new=None):
    await db[AUDIT].insert_one({
        "audit_id": f"ana_{secrets.token_hex(8)}", "announcement_id": announcement_id, "action": action,
        "actor_id": admin.get("user_id"), "previous": previous, "new": new, "created_at": datetime.now(timezone.utc)})


async def _get(db, announcement_id: str) -> dict:
    doc = await db[COLLECTION].find_one({"announcement_id": announcement_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return doc


async def _promotion_winner(db, now):
    config = await db.promotion_config.find_one({"key": "freeworld"}, {"_id": 0, "promotion_id": 1, "end_at": 1, "name": 1, "promotion_type": 1})
    if not config or config.get("promotion_type") != "prize_draw" or not config.get("promotion_id") or not config.get("end_at"):
        return None
    try:
        end_at = _utc(config["end_at"], "Promotion end")
    except HTTPException:
        return None
    if not end_at or end_at > now:
        return None
    winner = await db.promotion_manual_winners.find_one({"_id": config["promotion_id"]}, {"_id": 0, "user_id": 1})
    user = await db.users.find_one({"user_id": winner["user_id"]}, {"_id": 0, "name": 1, "username": 1, "public_id": 1}) if winner else None
    if not user:
        return None
    return {"id": f"promotion-winner-{config['promotion_id']}", "text": "{winner} won {promotion}!", "icon": "🏆", "link": "/winners",
            "values": {"winner": (user.get("name") or user.get("username") or user.get("public_id") or "Player")[:120],
                       "promotion": config.get("name") or "the promotion"}}


def _render_generated(item, override):
    if override.get("deleted") or not override.get("enabled", True) or not override.get("published", True):
        return None
    text = override.get("text", item["text"])
    for key, value in item.get("values", {}).items():
        text = text.replace("{" + key + "}", str(value))
    return {"id": item["id"], "text": text, "icon": item.get("icon"), "link": item.get("link")}


async def _generated_announcements(db, now):
    from routers.world_routes import public_champion_winners

    winners = await public_champion_winners()
    items = [dict(item) for item in FALLBACKS]
    for winner in winners.get("winners", []):
        source_id = (f"manual-winner:{winner['winner_id']}" if winner.get("manual") and winner.get("winner_id")
                     else f"champion-winner:{winners.get('contest_number')}:{winner['rank']}")
        amount = float(winner.get("prize_amount") or 0)
        prize = f"{amount:,.0f}" if amount.is_integer() else f"{amount:,.2f}"
        items.append({"id": source_id, "text": "{winner} won {prize}", "icon": "🏆", "kind": "winner",
                      "values": {"winner": winner.get("user_name") or "Player",
                                 "prize": ("£" if winner.get("currency") == "GBP" else "") + prize}})
    promotion = await _promotion_winner(db, now)
    if promotion:
        items.append({**promotion, "kind": "promotion_winner"})
    return items


@public_router.get("")
async def public_announcements():
    db = get_db()
    now = datetime.now(timezone.utc)
    rows = await db[COLLECTION].find(
        {"published": True, "enabled": {"$ne": False}}, {"_id": 0},
    ).to_list(None)
    live = [r for r in rows if effective_status(r, now) == "published"]
    live.sort(key=lambda r: (-int(r.get("priority") or 0), int(r.get("order") or 0), str(r.get("created_at"))))
    announcements = [{"id": r["announcement_id"], "text": r["text"], "icon": r.get("icon"), "link": r.get("link")}
                     for r in live]
    overrides = {row["_id"]: {k: v for k, v in row.items() if k != "_id"} async for row in db.site_ticker_overrides.find({})}
    promotion = await _promotion_winner(db, now)
    if promotion:
        rendered = _render_generated(promotion, overrides.get(promotion["id"], {}))
        if rendered:
            announcements.append(rendered)
    fallbacks = [_render_generated(item, overrides.get(item["id"], {})) for item in FALLBACKS]
    public_overrides = {key: (value if not value.get("deleted") and value.get("enabled", True) and value.get("published", True)
                              else {field: value.get(field) for field in ("deleted", "enabled", "published")})
                        for key, value in overrides.items()}
    return {"announcements": announcements, "fallbacks": [item for item in fallbacks if item], "ticker_overrides": public_overrides}


@public_router.get("/promotion-badge")
async def public_badge_settings():
    return await _badge_settings(get_db())


@admin_router.get("")
async def list_announcements(request: Request):
    await require_super_admin(request)
    rows = await get_db()[COLLECTION].find({}, {"_id": 0}).to_list(None)
    rows.sort(key=lambda r: (-int(r.get("priority") or 0), int(r.get("order") or 0), str(r.get("created_at"))))
    return {"announcements": [_admin_view(r) for r in rows]}


@admin_router.get("/promotion-badge")
async def admin_badge_settings(request: Request):
    await require_super_admin(request)
    return await _badge_settings(get_db())


@admin_router.get("/generated")
async def admin_generated_announcements(request: Request):
    await require_super_admin(request)
    db = get_db()
    overrides = {row["_id"]: {k: v for k, v in row.items() if k != "_id"} async for row in db.site_ticker_overrides.find({})}
    items = await _generated_announcements(db, datetime.now(timezone.utc))
    return {"items": [{**item, **overrides.get(item["id"], {}), "sample": _render_generated(item, {"text": overrides.get(item["id"], {}).get("text", item["text"])})["text"]} for item in items]}


@admin_router.put("/generated/{source_id}")
async def update_generated_announcement(source_id: str, body: GeneratedAnnouncementIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    items = await _generated_announcements(db, datetime.now(timezone.utc))
    item = next ( (row for row in items if row["id"] == source_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Ticker announcement not found")
    text = _clean_text(body.text, "Announcement text", 200)
    if any("{" + key + "}" not in text for key in item.get("values", {})):
        raise HTTPException(status_code=422, detail="Winner announcements must retain their winner and prize or promotion placeholders")
    previous = await db.site_ticker_overrides.find_one({"_id": source_id}, {"_id": 0})
    updated = {"text": text, "enabled": body.enabled, "published": body.published, "deleted": body.deleted}
    await db.site_ticker_overrides.update_one({"_id": source_id}, {"$set": updated}, upsert=True)
    await _audit(db, source_id, "ticker_display_update", admin, previous=previous, new=updated)
    return updated


@admin_router.put("/promotion-badge")
async def save_badge_settings(body: BadgeSettingsIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    text = body.text.strip()
    if _TAGS.search(text):
        raise HTTPException(status_code=422, detail="Badge text cannot contain HTML characters")
    link = _clean_link(body.url)
    if not link:
        raise HTTPException(status_code=422, detail="Badge destination is required")
    previous = await _badge_settings(db)
    updated = {"enabled": body.enabled, "text": text, "url": link}
    await db.site_announcement_settings.update_one({"_id": BADGE_SETTINGS}, {"$set": updated}, upsert=True)
    await _audit(db, BADGE_SETTINGS, "badge_settings", admin, previous=previous, new=updated)
    return updated


@admin_router.get("/audit")
async def announcement_audit(request: Request, announcement_id: Optional[str] = None):
    await require_super_admin(request)
    query = {"announcement_id": announcement_id} if announcement_id else {}
    rows = await get_db()[AUDIT].find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    for row in rows:
        row["created_at"] = _as_aware(row["created_at"]).isoformat()
    return {"items": rows}


@admin_router.post("/reorder")
async def reorder_announcements(body: ReorderIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    previous = {r["announcement_id"]: r.get("order", 0) async for r in db[COLLECTION].find({}, {"announcement_id": 1, "order": 1})}
    if len(set(body.ids)) != len(body.ids):
        raise HTTPException(status_code=422, detail="Announcement order contains duplicates")
    unknown = [i for i in body.ids if i not in previous]
    if unknown:
        raise HTTPException(status_code=404, detail="Unknown announcement in order list")
    for position, announcement_id in enumerate(body.ids):
        await db[COLLECTION].update_one({"announcement_id": announcement_id}, {"$set": {"order": position}})
    await _audit(db, "*", "reorder", admin, previous=previous, new={i: n for n, i in enumerate(body.ids)})
    return {"ok": True}


@admin_router.post("")
async def create_announcement(body: AnnouncementIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {"announcement_id": f"ann_{secrets.token_hex(8)}", **_validated(body), "published": bool(body.publish),
           "enabled": True, "order": await db[COLLECTION].count_documents({}), "created_at": now, "created_by": admin.get("user_id"),
           "updated_at": now, "updated_by": admin.get("user_id")}
    await db[COLLECTION].insert_one(dict(doc))
    await _audit(db, doc["announcement_id"], "create_published" if body.publish else "create_draft", admin, new=doc)
    return _admin_view(doc)


@admin_router.put("/{announcement_id}")
async def update_announcement(announcement_id: str, body: AnnouncementIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    previous = await _get(db, announcement_id)
    changes = {**_validated(body), "published": bool(body.publish),
               "updated_at": datetime.now(timezone.utc), "updated_by": admin.get("user_id")}
    await db[COLLECTION].update_one({"announcement_id": announcement_id}, {"$set": changes})
    updated = await _get(db, announcement_id)
    scheduling = (previous.get("start_at"), previous.get("end_at")) != (updated.get("start_at"), updated.get("end_at"))
    await _audit(db, announcement_id, "edit", admin, previous=previous, new=updated)
    if scheduling:
        await _audit(db, announcement_id, "schedule", admin,
                     previous={"start_at": previous.get("start_at"), "end_at": previous.get("end_at")},
                     new={"start_at": updated.get("start_at"), "end_at": updated.get("end_at")})
    if previous.get("published") != updated.get("published"):
        await _audit(db, announcement_id, "publish" if updated.get("published") else "unpublish", admin,
                     previous={"published": previous.get("published")}, new={"published": updated.get("published")})
    return _admin_view(updated)


async def _set_flag(announcement_id: str, request: Request, action: str, **flags):
    admin = await require_super_admin(request)
    db = get_db()
    previous = await _get(db, announcement_id)
    await db[COLLECTION].update_one({"announcement_id": announcement_id},
                                    {"$set": {**flags, "updated_at": datetime.now(timezone.utc), "updated_by": admin.get("user_id")}})
    updated = await _get(db, announcement_id)
    await _audit(db, announcement_id, action, admin, previous={k: previous.get(k) for k in flags}, new={k: updated.get(k) for k in flags})
    return _admin_view(updated)


@admin_router.post("/{announcement_id}/publish")
async def publish_announcement(announcement_id: str, request: Request):
    return await _set_flag(announcement_id, request, "publish", published=True, enabled=True)


@admin_router.post("/{announcement_id}/unpublish")
async def unpublish_announcement(announcement_id: str, request: Request):
    return await _set_flag(announcement_id, request, "unpublish", published=False)


@admin_router.post("/{announcement_id}/disable")
async def disable_announcement(announcement_id: str, request: Request):
    return await _set_flag(announcement_id, request, "disable", enabled=False)


@admin_router.post("/{announcement_id}/enable")
async def enable_announcement(announcement_id: str, request: Request):
    return await _set_flag(announcement_id, request, "enable", enabled=True)


@admin_router.delete("/{announcement_id}")
async def delete_announcement(announcement_id: str, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    previous = await _get(db, announcement_id)
    await db[COLLECTION].delete_one({"announcement_id": announcement_id})
    await _audit(db, announcement_id, "delete", admin, previous=previous)
    return {"ok": True}
