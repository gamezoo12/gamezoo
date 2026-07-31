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
from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, File
from PIL import Image, ImageOps

from auth import require_admin

UPLOAD_DIR = Path("/app/backend/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CONTEST_IMG_DIR = UPLOAD_DIR / "contest-images"
CONTEST_IMG_DIR.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 8 * 1024 * 1024  # 8 MB

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
    dest = UPLOAD_DIR / name
    dest.write_bytes(data)

    # Public URL — served via the /api/uploads static mount so k8s ingress
    # routes it to the backend pod.
    base = _base_url_from(request).rstrip("/")
    url = f"{base}/api/uploads/{name}"

    return {"url": url, "filename": name, "size": len(data), "mime": mime}


# =====================================================================
# Contest image processor — one upload → 5 responsive variants
# =====================================================================
# Sizes chosen for the current homepage / detail / mobile grid.
VARIANTS = {
    "thumb":  (300, 200),   # feature-list thumbnails
    "card":   (600, 400),   # contest cards
    "mobile": (900, 600),   # mobile hero
    "hero":   (1600, 900),  # desktop hero (16:9)
    "full":   (2000, 1500), # full-page detail (safe max)
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

    # Clamp focal point.
    fx = max(0.0, min(1.0, float(focal_x)))
    fy = max(0.0, min(1.0, float(focal_y)))

    base_id = uuid.uuid4().hex[:12]
    out_dir = CONTEST_IMG_DIR / base_id
    out_dir.mkdir(parents=True, exist_ok=True)
    base_url_public = _base_url_from(request).rstrip("/")

    urls: dict[str, str] = {}
    for label, (tw, th) in VARIANTS.items():
        # ImageOps.fit crops to fit, honouring focal point (centering=(x,y))
        variant = ImageOps.fit(src, (tw, th), method=Image.Resampling.LANCZOS, centering=(fx, fy))
        # Save WITHOUT any EXIF (metadata stripped)
        buf = io.BytesIO()
        variant.save(buf, format="JPEG", quality=82, optimize=True, progressive=True)
        path = out_dir / f"{label}.jpg"
        path.write_bytes(buf.getvalue())
        urls[label] = f"{base_url_public}/api/uploads/contest-images/{base_id}/{label}.jpg"

    return {
        "id": base_id,
        "alt": alt or "",
        "focal": {"x": fx, "y": fy},
        "sizes": urls,
        # Recommended default field to store on Contest.image:
        "recommended_image_url": urls["card"],
        "recommended_mobile_image_url": urls["mobile"],
    }
