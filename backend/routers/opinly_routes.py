"""Read-only Opinly content gateway. The bearer secret never reaches the browser."""
import asyncio
import hashlib
import hmac
import html
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import PlainTextResponse

router = APIRouter(tags=["opinly"])
BASE = "https://sdk.opinly.ai/v1"
SITE = os.getenv("PUBLIC_SITE_URL", "https://prizeleague.co.uk").rstrip("/")
_cache = {}
_lock = asyncio.Lock()


def _fetch(path, params=None):
    key = os.getenv("OPINLY_API_KEY")
    if not key:
        raise HTTPException(503, "Blog integration is not configured")
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None and v != ""})
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.load(r)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise HTTPException(404, "Blog content not found")
        raise HTTPException(502, "Blog provider unavailable")
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise HTTPException(502, "Blog provider unavailable")


async def _get(path, params=None):
    cache_key = (path, tuple(sorted((params or {}).items())))
    now = time.monotonic()
    item = _cache.get(cache_key)
    if item and now - item[0] < 120:
        return item[1]
    value = await asyncio.to_thread(_fetch, path, params)
    async with _lock:
        if len(_cache) > 512:
            _cache.clear()
        _cache[cache_key] = (time.monotonic(), value)
    return value


@router.get("/api/opinly/posts")
async def posts(limit: int = 12, cursor: str = "", category: str = "", author: str = "", sort: str = "newest"):
    if not 1 <= limit <= 50 or sort not in ("newest", "oldest"):
        raise HTTPException(400, "Invalid pagination parameters")
    return await _get("/content/posts", dict(limit=limit, cursor=cursor, category=category, author=author, sort=sort))


@router.get("/api/opinly/post")
async def post(slug: str):
    if not slug or len(slug) > 200 or "/" in slug:
        raise HTTPException(400, "Invalid slug")
    return await _get("/content/post", {"slug": slug})


@router.get("/api/opinly/categories")
async def categories():
    return await _get("/content/categories")


@router.get("/api/opinly/authors")
async def authors():
    return await _get("/content/authors")


@router.get("/api/opinly/authors/{slug}")
async def author(slug: str):
    if not slug or len(slug) > 200 or "/" in slug:
        raise HTTPException(400, "Invalid slug")
    return await _get("/content/authors/" + urllib.parse.quote(slug, safe=""))


def _route_path(item):
    # Opinly may return a ready-made URL/path; prefer it over reconstructing slugs.
    url = item.get("url") or item.get("path")
    if isinstance(url, str):
        parsed = urllib.parse.urlsplit(url)
        if not parsed.netloc or parsed.netloc == urllib.parse.urlsplit(SITE).netloc:
            path = parsed.path
            if path.startswith("/") and not path.startswith("//"):
                return path
    kind, slug = item.get("type"), item.get("slug", "")
    if kind == "home":
        return "/blog"
    if kind in ("post", "category", "author") and isinstance(slug, str) and slug:
        prefix = {"post": "/blog/", "category": "/blog/category/", "author": "/blog/author/"}[kind]
        return prefix + urllib.parse.quote(slug, safe="")
    return None


@router.get("/sitemap.xml")
async def sitemap():
    result = await _get("/content/routes")
    entries = result if isinstance(result, list) else result.get("data", result.get("routes", []))
    root = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for item in entries:
        if not isinstance(item, dict):
            continue
        path = _route_path(item)
        if not path:
            continue
        node = ET.SubElement(root, "url")
        ET.SubElement(node, "loc").text = SITE + path
        modified = item.get("lastModified") or item.get("last_modified")
        if isinstance(modified, str):
            ET.SubElement(node, "lastmod").text = modified
    return Response(ET.tostring(root, encoding="unicode"), media_type="application/xml")


@router.get("/rss.xml")
async def rss():
    result = await _get("/content/rss", {"limit": 20})
    entries = result if isinstance(result, list) else result.get("data", result.get("items", []))
    root = ET.Element("rss", version="2.0")
    channel = ET.SubElement(root, "channel")
    for name, value in (("title", "Prize League Blog"), ("link", SITE + "/blog"), ("description", "Prize League news and articles")):
        ET.SubElement(channel, name).text = value
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        item = ET.SubElement(channel, "item")
        path = _route_path({"type": "post", **entry})
        for name, value in (("title", entry.get("title", "")), ("link", SITE + path if path else ""), ("description", entry.get("description") or entry.get("excerpt") or ""), ("guid", SITE + path if path else "")):
            ET.SubElement(item, name).text = str(value)
        if entry.get("publishedAt"):
            ET.SubElement(item, "pubDate").text = str(entry["publishedAt"])
    return Response(ET.tostring(root, encoding="unicode"), media_type="application/rss+xml")


@router.post("/api/opinly-webhook")
async def webhook(request: Request):
    secret = os.getenv("OPINLY_WEBHOOK_SIGNING_SECRET")
    if not secret:
        raise HTTPException(503, "Webhook is not configured")
    raw = await request.body()
    if len(raw) > 1024 * 1024:
        raise HTTPException(413, "Payload too large")
    try:
        from svix.webhooks import Webhook
        Webhook(secret).verify(raw, dict(request.headers))
    except Exception:
        raise HTTPException(400, "Invalid webhook signature")
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    if event.get("type") == "content.routes-changed":
        async with _lock:
            _cache.clear()
    return {"ok": True}
