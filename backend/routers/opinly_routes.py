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


# HTML responses for crawler-visible SEO. Deploy ingress rules for /blog paths
# to the backend if server-rendered metadata is required at the public URL.
from fastapi.responses import HTMLResponse
from html import escape as _escape

def _as_text(value):
    return value if isinstance(value, str) else ""

def _image(post):
    for key in ("heroImage", "hero_image", "image"):
        val = post.get(key)
        if isinstance(val, dict):
            val = val.get("url")
        if isinstance(val, str) and val.startswith("https://"):
            return val
    return ""

def _seo_html(title, description, path, body, image="", schema=None):
    canonical = SITE + path
    safe_title = _escape(title)
    safe_desc = _escape(description)
    safe_url = _escape(canonical, quote=True)
    image_tag = '<meta property="og:image" content="' + _escape(image, quote=True) + '">' if image else ""
    json_ld = '<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False).replace("<", "\\u003c") + '</script>' if schema else ""
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>' + safe_title + ' | Prize League</title>'
            '<meta name="description" content="' + _escape(description, quote=True) + '">'
            '<link rel="canonical" href="' + safe_url + '">'
            '<meta property="og:type" content="article">'
            '<meta property="og:title" content="' + _escape(title, quote=True) + '">'
            '<meta property="og:description" content="' + _escape(description, quote=True) + '">'
            '<meta property="og:url" content="' + safe_url + '">' + image_tag + json_ld
            + '</head><body><main><nav><a href="/blog">Blog</a></nav>' + body
            + '</main></body></html>')


@router.get("/blog", response_class=HTMLResponse)
@router.get("/api/opinly/render/blog", response_class=HTMLResponse)
async def blog_ssr():
    result = await _get("/content/posts", {"limit": 12, "sort": "newest"})
    posts = result.get("data", []) if isinstance(result, dict) else []
    rows = []
    for post in posts:
        if not isinstance(post, dict) or not post.get("slug"):
            continue
        slug = urllib.parse.quote(str(post["slug"]), safe="")
        rows.append('<li><a href="/blog/' + slug + '">' + _escape(_as_text(post.get("title"))) + '</a></li>')
    body = '<h1>Prize League Blog</h1><ul>' + "".join(rows) + '</ul>'
    return HTMLResponse(_seo_html("Prize League Blog", "Articles and news from Prize League", "/blog", body))


@router.get("/blog/{slug}", response_class=HTMLResponse)
@router.get("/api/opinly/render/blog/{slug}", response_class=HTMLResponse)
async def blog_post_ssr(slug: str):
    if not slug or len(slug) > 200 or "/" in slug:
        raise HTTPException(400, "Invalid slug")
    result = await _get("/content/post", {"slug": slug})
    post = result.get("data", result) if isinstance(result, dict) else {}
    if not isinstance(post, dict):
        raise HTTPException(502, "Invalid blog content")
    title = _as_text(post.get("title")) or "Article"
    description = _as_text(post.get("description") or post.get("excerpt") or post.get("summary"))
    path = "/blog/" + urllib.parse.quote(slug, safe="")
    image = _image(post)
    schema = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": title, "description": description, "mainEntityOfPage": SITE + path, "publisher": {"@type": "Organization", "name": "Prize League"}}
    if image:
        schema["image"] = image
    if post.get("publishedAt"):
        schema["datePublished"] = post["publishedAt"]
    if post.get("updatedAt"):
        schema["dateModified"] = post["updatedAt"]
    body = '<article><h1>' + _escape(title) + '</h1><p>' + _escape(description) + '</p>'
    # Render plaintext body safely. Do not trust remote HTML without sanitization.
    raw = post.get("bodyMarkdown") or post.get("markdown") or post.get("body") or post.get("content")
    if isinstance(raw, str):
        body += '<div style="white-space:pre-wrap">' + _escape(raw) + '</div>'
    body += '</article>'
    return HTMLResponse(_seo_html(title, description, path, body, image, schema))
