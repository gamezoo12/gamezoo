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
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, UploadFile, File

from auth import require_admin

UPLOAD_DIR = Path("/app/backend/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

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
