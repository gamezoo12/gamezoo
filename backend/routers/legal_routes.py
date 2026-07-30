"""
Prize League — Legal Documents CRUD API.

Public: GET /api/legal/documents          — list published slugs + titles
        GET /api/legal/documents/{slug}   — read the currently-published version

Admin:  GET  /api/admin/legal/documents        — full list (all statuses)
        GET  /api/admin/legal/documents/{slug} — full doc + version history
        PUT  /api/admin/legal/documents/{slug} — save draft (any admin)
        POST /api/admin/legal/documents/{slug}/publish — publish (Super Admin only)

Storage: `legal_documents` collection, one document per policy.
         `legal_document_versions` collection, one per historical version.
"""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import Optional
import uuid

from auth import get_current_user, require_admin
from legal_docs_seed import LEGAL_DOCS

public_router = APIRouter(prefix='/api/legal', tags=['legal'])
admin_router = APIRouter(prefix='/api/admin/legal', tags=['legal-admin'])


class DocEdit(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    owner: Optional[str] = None
    change_note: Optional[str] = None


# ---------- Seeder ----------
async def ensure_legal_docs_seeded(db) -> None:
    """Idempotent — inserts any missing policy at v1 (draft)."""
    now = datetime.now(timezone.utc)
    for spec in LEGAL_DOCS:
        existing = await db.legal_documents.find_one({'slug': spec['slug']}, {'_id': 0})
        if existing:
            continue
        doc = {
            'doc_id': f'ldoc_{uuid.uuid4().hex[:12]}',
            'slug': spec['slug'],
            'title': spec['title'],
            'owner': spec['owner'],
            'content': spec['content'],
            'status': 'draft',      # draft | published
            'version': 1,
            'ai_generated': spec.get('ai_generated', False),
            'source_url': spec.get('source_url'),
            'effective_date': None,
            'last_updated': now,
            'created_at': now,
        }
        await db.legal_documents.insert_one(doc)


# ---------- Public ----------
@public_router.get('/documents')
async def list_public_documents():
    from deps import get_db
    db = get_db()
    docs = await db.legal_documents.find(
        {'status': 'published'},
        {'_id': 0, 'slug': 1, 'title': 1, 'version': 1, 'effective_date': 1, 'owner': 1},
    ).sort('title', 1).to_list(200)
    return {'documents': docs}


@public_router.get('/documents/{slug}')
async def get_public_document(slug: str):
    from deps import get_db
    db = get_db()
    doc = await db.legal_documents.find_one({'slug': slug, 'status': 'published'}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Document not published')
    return doc


# ---------- Admin ----------
@admin_router.get('/documents')
async def admin_list_documents(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    docs = await db.legal_documents.find(
        {}, {'_id': 0, 'content': 0},  # content excluded from list for speed
    ).sort('title', 1).to_list(200)
    return {'documents': docs}


@admin_router.get('/documents/{slug}')
async def admin_get_document(slug: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    doc = await db.legal_documents.find_one({'slug': slug}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Document not found')
    versions = await db.legal_document_versions.find(
        {'slug': slug}, {'_id': 0},
    ).sort('version', -1).limit(20).to_list(20)
    return {**doc, 'version_history': versions}


@admin_router.get('/documents/{slug}/download', response_class=PlainTextResponse)
async def admin_download_document(slug: str, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    doc = await db.legal_documents.find_one({'slug': slug}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Document not found')
    header = (
        f"# {doc['title']}\n\n"
        f"Prize League Ltd — Company 17338919\n"
        f"Version: {doc['version']} · Status: {doc['status']}\n"
        f"Last updated: {doc.get('last_updated')}\n"
        f"Effective date: {doc.get('effective_date') or '(not yet published)'}\n\n"
        "---\n\n"
    )
    return PlainTextResponse(
        header + (doc.get('content') or ''),
        headers={
            'Content-Disposition': f'attachment; filename="{slug}-v{doc["version"]}.md"'
        },
    )


@admin_router.put('/documents/{slug}')
async def admin_save_draft(slug: str, edit: DocEdit, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    doc = await db.legal_documents.find_one({'slug': slug}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Document not found')

    # Archive current version
    await db.legal_document_versions.insert_one({
        'slug': slug,
        'version': doc['version'],
        'title': doc['title'],
        'content': doc.get('content'),
        'status': doc['status'],
        'saved_at': datetime.now(timezone.utc),
        'saved_by': admin['email'],
        'change_note': edit.change_note or '',
    })

    updates = {'last_updated': datetime.now(timezone.utc), 'status': 'draft'}
    if edit.title is not None:
        updates['title'] = edit.title
    if edit.content is not None:
        updates['content'] = edit.content
    if edit.owner is not None:
        updates['owner'] = edit.owner
    updates['version'] = doc['version'] + 1
    await db.legal_documents.update_one({'slug': slug}, {'$set': updates})
    return {'ok': True, 'version': updates['version']}


@admin_router.post('/documents/{slug}/publish')
async def admin_publish(slug: str, request: Request):
    admin = await require_admin(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(403, 'Only Super Admin can publish legal documents')
    from deps import get_db
    db = get_db()
    doc = await db.legal_documents.find_one({'slug': slug}, {'_id': 0})
    if not doc:
        raise HTTPException(404, 'Document not found')
    now = datetime.now(timezone.utc)
    await db.legal_documents.update_one(
        {'slug': slug},
        {'$set': {
            'status': 'published',
            'effective_date': now,
            'last_updated': now,
            'published_by': admin['email'],
        }},
    )
    return {'ok': True}
