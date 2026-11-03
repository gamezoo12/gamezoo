"""
Prize League — image upload endpoint.
Admin only. Accepts JPG/PNG/WEBP (max 8 MB), stores under /app/backend/uploads,
returns a public URL served via the /api/uploads static mount.

Design decisions:
  • Filesystem storage (fastest, no S3 dependency yet). Files persist across pod restarts.
  • Random UUID filenames — no PII / no clashes.
  • MIME sniffed via first bytes, not just the client-declared Content-Type.
"""
from __future__ import annotations
import io
import os
import uuid
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, File
from PIL import Image, ImageOps

from auth import require_admin

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CONTEST_IMG_DIR = UPLOAD_DIR / "contest-images"
CONTEST_IMG_DIR.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 8 * 1024 * 1024  # 8 MB


# =====================================================================
# Persistent media storage — Cloudflare R2
# =====================================================================

def _r2_config() -> dict[str, str]:
    """Read R2 configuration at request time.

    Keeping this lazy avoids creating a cloud client during module import and
    makes local/test environments fail only when an upload is actually used.
    """
    values = {
        "bucket": os.getenv("R2_BUCKET", "").strip(),
        "endpoint": os.getenv("R2_ENDPOINT", "").strip().rstrip("/"),
        "access_key": os.getenv("R2_ACCESS_KEY_ID", "").strip(),
        "secret_key": os.getenv("R2_SECRET_ACCESS_KEY", "").strip(),
        "public_url": os.getenv("R2_PUBLIC_URL", "").strip().rstrip("/"),
    }

    missing = [k for k, v in values.items() if not v]
    if missing:
        raise HTTPException(
            status_code=503,
            detail="Media storage is not configured.",
        )

    return values


def _r2_client(cfg: dict[str, str]):
    return boto3.client(
        "s3",
        endpoint_url=cfg["endpoint"],
        aws_access_key_id=cfg["access_key"],
        aws_secret_access_key=cfg["secret_key"],
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def _upload_to_r2(
    *,
    key: str,
    body: bytes,
    content_type: str,
    cache_control: str = "public, max-age=31536000, immutable",
) -> str:
    """Upload bytes to R2 and return their permanent public URL."""
    cfg = _r2_config()

    try:
        _r2_client(cfg).put_object(
            Bucket=cfg["bucket"],
            Key=key,
            Body=body,
            ContentType=content_type,
            CacheControl=cache_control,
        )
    except (BotoCoreError, ClientError) as exc:
        # Do not expose provider credentials/details to the browser.
        print(f"[media-upload] R2 upload failed for {key}: {type(exc).__name__}")
        raise HTTPException(
            status_code=503,
            detail="Image storage is temporarily unavailable. Please try again.",
        ) from exc

    return f'{cfg["public_url"]}/{key}'


# Magic-byte signatures (first N bytes)
SIGNATURES = {
    b"\xff\xd8\xff": ("image/jpeg", ".jpg"),
    b"\x89PNG\r\n\x1a\n": ("image/png", ".png"),
    b"RIFF": ("image/webp", ".webp"),      # WebP starts with "RIFF....WEBP"
}


def _sniff_mime(data: bytes) -> tuple[str, str] | None:
    for sig, meta in SIGNATURES.items():
        if data.startswith(sig):
            if meta[0] == "image/webp" and b"WEBP" not in data[:16]:
                continue
            return meta
    return None


uploads_router = APIRouter(prefix='/api/admin/uploads', tags=['uploads'])


def _base_url_from(request: Request) -> str:
    """Prefer x-forwarded-host so behind the k8s ingress we build the public URL correctly."""
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    if host:
        return f"{proto}://{host}"
    return str(request.base_url).rstrip("/")


@uploads_router.post('/image')
async def upload_image(request: Request, file: UploadFile = File(...)):
    await require_admin(request)

    # Read bounded
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 8 MB)")

    sniffed = _sniff_mime(data)
    if not sniffed:
        raise HTTPException(415, "Unsupported file type. Use JPG, PNG, or WEBP.")
    mime, ext = sniffed

    name = f"{uuid.uuid4().hex}{ext}"
    key = f"promotions/{name}"

    url = _upload_to_r2(
        key=key,
        body=data,
        content_type=mime,
    )

    return {
        "url": url,
        "filename": name,
        "size": len(data),
        "mime": mime,
        "storage": "r2",
    }


# =====================================================================
# Contest image processor — one upload → 5 responsive variants
# =====================================================================
# Sizes chosen for the current homepage / detail / mobile grid.
VARIANTS = {
    "thumb":  (400, 200),    # 2:1 thumbnail
    "card":   (1200, 600),   # 2:1 card/listing image
    "mobile": (1600, 800),   # 2:1 mobile image
    "hero":   (1920, 960),   # 2:1 desktop image
    "full":   (2400, 1200),  # 2:1 contest-detail image
}


@uploads_router.post('/contest-image')
async def upload_contest_image(
    request: Request,
    file: UploadFile = File(...),
    focal_x: float = Form(0.5),  # 0..1, horizontal focal point
    focal_y: float = Form(0.5),  # 0..1, vertical focal point
    alt: str = Form(''),
):
    """Admin uploads ONE image → we generate 5 responsive JPG variants
    with metadata stripped, focal-point-aware smart cropping, aspect-safe
    sizing so nothing stretches. Returns URLs for each variant."""
    await require_admin(request)

    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 8 MB)")
    if not _sniff_mime(data):
        raise HTTPException(415, "Unsupported file type. Use JPG, PNG, or WEBP.")

    try:
        src = Image.open(io.BytesIO(data))
        # Auto-rotate per EXIF and STRIP metadata by re-creating the image.
        src = ImageOps.exif_transpose(src)
        src = src.convert("RGB")
    except Exception as e:
        raise HTTPException(400, f"Could not decode image: {e}")

    # Clamp focal point — reject non-numeric values with 422.
    try:
        fx = max(0.0, min(1.0, float(focal_x)))
        fy = max(0.0, min(1.0, float(focal_y)))
    except (TypeError, ValueError):
        raise HTTPException(422, 'focal_x and focal_y must be numbers in [0, 1]')

    base_id = uuid.uuid4().hex[:12]

    urls: dict[str, str] = {}
    for label, (tw, th) in VARIANTS.items():
        # ImageOps.fit crops to fit, honouring focal point (centering=(x,y))
        variant = ImageOps.fit(src, (tw, th), method=Image.Resampling.LANCZOS, centering=(fx, fy))
        # Save WITHOUT any EXIF (metadata stripped)
        buf = io.BytesIO()
        variant.save(buf, format="JPEG", quality=82, optimize=True, progressive=True)
        image_bytes = buf.getvalue()
        key = f"contests/{base_id}/{label}.jpg"

        urls[label] = _upload_to_r2(
            key=key,
            body=image_bytes,
            content_type="image/jpeg",
        )

    return {
        "id": base_id,
        "alt": alt or "",
        "focal": {"x": fx, "y": fy},
        "sizes": urls,
        # Recommended default field to store on Contest.image:
        "recommended_image_url": urls["card"],
        "recommended_mobile_image_url": urls["mobile"],
    }



# =====================================================================
# Banner video upload — chunked (proxy-safe), max 60 MB / 30 seconds
# =====================================================================
VIDEO_MAX_BYTES = 120 * 1024 * 1024
VIDEO_CHUNK = 2 * 1024 * 1024
VIDEO_MAX_SECONDS = 60.5
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-m4v", ""}


# Chunks live in MongoDB so the upload works when requests hit different server instances.
async def _video_session(db, upload_id: str) -> dict:
    session = await db.video_upload_sessions.find_one({"upload_id": upload_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Upload expired. Please try again.")
    return session


@uploads_router.post('/video/start')
async def start_video_upload(request: Request):
    from datetime import datetime, timezone
    from deps import get_db
    await require_admin(request)
    body = await request.json()
    size, ctype = int(body.get("size") or 0), str(body.get("content_type") or "").split(";")[0].lower()
    duration = float(body.get("duration") or 0)
    if ctype not in VIDEO_TYPES:
        raise HTTPException(415, "Unsupported video. Use MP4, MOV or WebM.")
    if not 0 < size <= VIDEO_MAX_BYTES:
        raise HTTPException(413, "Video too large (max 120 MB)")
    if not 0 < duration <= VIDEO_MAX_SECONDS:
        raise HTTPException(400, "Video must be 1 minute or shorter")
    upload_id = uuid.uuid4().hex
    await get_db().video_upload_sessions.insert_one({"upload_id": upload_id, "size": size, "created_at": datetime.now(timezone.utc)})
    return {"upload_id": upload_id, "chunk_size": VIDEO_CHUNK}


@uploads_router.put('/video/{upload_id}/chunk/{index}')
async def upload_video_chunk(upload_id: str, index: int, request: Request):
    from bson import Binary
    from deps import get_db
    await require_admin(request)
    db = get_db()
    await _video_session(db, upload_id)
    data = await request.body()
    if not data or len(data) > VIDEO_CHUNK or not 0 <= index < 64:
        raise HTTPException(400, "Invalid chunk")
    await db.video_upload_chunks.update_one({"upload_id": upload_id, "index": index},
                                            {"$set": {"data": Binary(data)}}, upsert=True)
    return {"ok": True}


@uploads_router.post('/video/{upload_id}/complete')
async def complete_video_upload(upload_id: str, request: Request):
    from deps import get_db
    await require_admin(request)
    db = get_db()
    session = await _video_session(db, upload_id)
    try:
        chunks = await db.video_upload_chunks.find({"upload_id": upload_id}, {"_id": 0}).sort("index", 1).to_list(64)
        data = b"".join(bytes(c["data"]) for c in chunks)
        if len(data) != int(session["size"]):
            raise HTTPException(400, "Upload incomplete. Please try again.")
        is_mp4 = data[4:8] == b"ftyp"
        is_webm = data[:4] == b"\x1a\x45\xdf\xa3"
        if not (is_mp4 or is_webm):
            raise HTTPException(415, "Unsupported video. Use MP4, MOV or WebM.")
        mime, ext = ("video/mp4", ".mp4") if is_mp4 else ("video/webm", ".webm")
        try:
            url = _upload_to_r2(key=f"promotions/videos/{upload_id}{ext}", body=data, content_type=mime)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, "Video storage failed. Please try again.") from exc
    finally:
        await db.video_upload_chunks.delete_many({"upload_id": upload_id})
        await db.video_upload_sessions.delete_one({"upload_id": upload_id})
    return {"url": url, "mime": mime, "size": len(data), "storage": "r2"}
