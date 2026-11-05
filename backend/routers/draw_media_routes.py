"""Draw Studio: full-screen backdrop image + AI voice commentary (Super Admin only)."""
from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth import require_super_admin
from deps import get_db
from services.draw_commentary import HOSTS, LANGUAGES, STYLES, VOICES, clean_commentary, commentary_settings, speak, write_lines

router = APIRouter(prefix="/api/admin/draw-studio", tags=["draw-studio-media"])
log = logging.getLogger("gz.draw_commentary")
IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


async def _cfg(db) -> dict:
    return await db.settings.find_one({"_id": "draw_studio"}, {"_id": 0}) or {}


@router.post("/backdrop")
async def upload_backdrop(request: Request, file: UploadFile = File(...)):
    admin = await require_super_admin(request)
    ctype = (file.content_type or "").lower()
    if ctype not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG or WEBP image")
    data = await file.read()
    if not data or len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be under 12 MB")
    from object_storage import APP_NAME, put_object

    stored = put_object(f"{APP_NAME}/draw-studio/backdrop/{uuid.uuid4().hex}.{IMAGE_TYPES[ctype]}", data, ctype)
    meta = {"storage_path": stored["path"], "content_type": ctype, "original_filename": (file.filename or "")[:160],
            "uploaded_at": datetime.now(timezone.utc), "uploaded_by": admin.get("email")}
    await get_db().settings.update_one({"_id": "draw_studio"}, {"$set": {"backdrop": meta}}, upsert=True)
    return {"backdrop": {"original_filename": meta["original_filename"], "uploaded_at": meta["uploaded_at"]}}


@router.delete("/backdrop")
async def delete_backdrop(request: Request):
    await require_super_admin(request)
    await get_db().settings.update_one({"_id": "draw_studio"}, {"$unset": {"backdrop": ""}})
    return {"backdrop": None}


@router.get("/backdrop/file")
async def backdrop_file(request: Request):
    await require_super_admin(request)
    b = (await _cfg(get_db())).get("backdrop") or {}
    if not b.get("storage_path"):
        raise HTTPException(status_code=404, detail="No backdrop image uploaded")
    from object_storage import get_object

    data, _ = get_object(b["storage_path"])
    return Response(content=data, media_type=b["content_type"], headers={"Cache-Control": "private, max-age=300"})


@router.get("/commentary/options")
async def commentary_options(request: Request):
    await require_super_admin(request)
    return {"languages": LANGUAGES, "voices": VOICES, "styles": list(STYLES),
            "hosts": [{"id": k, "name": v["name"], "gender": v["gender"], "persona": v["persona"]} for k, v in HOSTS.items()]}


class Winner(BaseModel):
    ticket_number: Optional[str | int] = None
    display_name: Optional[str] = Field(default=None, max_length=80)
    round_name: Optional[str] = Field(default=None, max_length=80)


class CommentaryIn(BaseModel):
    stage: Literal["intro", "round", "loading", "mixing", "drawing", "reveal", "finale", "test"]
    mode: Literal["preview", "replay", "official", "test"] = "preview"
    contest_title: str = Field(default="", max_length=160)
    round_name: str = Field(default="", max_length=80)
    round_index: int = Field(default=0, ge=0, le=50)
    total_rounds: int = Field(default=1, ge=1, le=51)
    prize_amount: float = Field(default=0, ge=0, le=10_000_000)
    num_winners: int = Field(default=1, ge=0, le=1000)
    eligible: int = Field(default=0, ge=0, le=10_000_000)
    total_prize: float = Field(default=0, ge=0, le=100_000_000)
    winners: list[Winner] = Field(default_factory=list, max_length=50)
    all_winners: list[Winner] = Field(default_factory=list, max_length=200)
    override: Optional[dict] = None  # unsaved settings for the "Test voice" button


@router.post("/commentary")
async def commentary(body: CommentaryIn, request: Request):
    await require_super_admin(request)
    cfg = clean_commentary(body.override) if body.override else commentary_settings(await _cfg(get_db()))
    if not cfg["enabled"] and body.stage != "test":
        raise HTTPException(status_code=409, detail="Voice commentary is turned off in Draw Settings")
    try:
        facts = body.model_dump(exclude={"override"})
        if body.stage != "reveal":
            facts["winners"] = []  # never let an early stage announce a winner
        if body.stage != "finale":
            facts["all_winners"] = []
        lines = await write_lines(cfg, body.stage, facts)
        audios = await asyncio.gather(*(speak(cfg, ln["text"], ln["host"]) for ln in lines))
    except Exception as exc:  # provider failure must never break the draw
        log.warning("commentary failed: %s", exc)
        raise HTTPException(status_code=502, detail="Commentary is unavailable right now") from exc
    return {"text": " ".join(ln["text"] for ln in lines),
            "segments": [{"host": ln["host"], "name": HOSTS[ln["host"]]["name"], "text": ln["text"], "audio_b64": base64.b64encode(a).decode()} for ln, a in zip(lines, audios)]}
