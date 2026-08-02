"""
Prize League — Company Settings & Postal Entry admin API.

Company Settings (Super Admin only):
    GET  /api/admin/company              — current settings
    PUT  /api/admin/company              — update, writes audit_log
    GET  /api/public/company             — public-safe subset (footer, postal)

Postal Entry Admin Queue:
    GET  /api/admin/postal-entries       — list (filterable by status)
    POST /api/admin/postal-entries       — create (admin logs a received envelope)
    PUT  /api/admin/postal-entries/{id}  — status transitions + notes (audit-logged)
"""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional, Literal
import uuid

from auth import get_current_user, require_admin

public_router = APIRouter(prefix='/api/public', tags=['public'])
admin_router = APIRouter(prefix='/api/admin', tags=['admin'])


# ---------- Defaults ----------
DEFAULT_COMPANY = {
    'legal_name': 'PRIZE LEAGUE LTD',
    'company_number': '17338919',
    'incorporated_on': '2026-07-14',
    'jurisdiction': 'England and Wales',
    'company_type': 'Private company limited by shares',
    'registered_address': {
        'line1': '118 Windsor Road',
        'line2': 'London',
        'country': 'England',
        'postcode': 'E7 0RB',
        'country_full': 'United Kingdom',
    },
    'website': 'https://www.prizeleague.co.uk',
    'email_general': 'info@prizeleague.co.uk',
    'email_support': 'support@prizeleague.co.uk',
    'legal_footer': (
        'Prize League is operated by PRIZE LEAGUE LTD, a company registered '
        'in England and Wales under company number 17338919. Registered '
        'office: 118 Windsor Road, London, England, E7 0RB, United Kingdom.'
    ),
    # Postal entry
    'postal_address_line1': '118 Windsor Road',
    'postal_address_line2': 'London',
    'postal_address_country': 'England',
    'postal_address_postcode': 'E7 0RB',
    'postal_address_country_full': 'United Kingdom',
    'postal_required_details': (
        '- Full name\n- Prize League public ID or registered email\n'
        '- Confirmation you are aged 18+ and agree to the Terms & Conditions\n'
        '- Competition name\n- Your answer to the skill task'
    ),
    'postal_max_entries_per_person': 1,
    'postal_eligibility_rules': 'Only available for competitions where "Free Postal Entry Available" is enabled by the administrator.',
    # Feature flag — must remain OFF pending legal review for contest types 2 & 3
    'random_draw_engine_enabled': False,
    'instant_win_engine_enabled': False,
    'legal_review_notes': '',
}


# ---------- Company Settings ----------
class CompanyUpdate(BaseModel):
    legal_name: Optional[str] = None
    company_number: Optional[str] = None
    incorporated_on: Optional[str] = None
    jurisdiction: Optional[str] = None
    company_type: Optional[str] = None
    website: Optional[str] = None
    email_general: Optional[str] = None
    email_support: Optional[str] = None
    legal_footer: Optional[str] = None
    registered_address: Optional[dict] = None
    postal_address_line1: Optional[str] = None
    postal_address_line2: Optional[str] = None
    postal_address_country: Optional[str] = None
    postal_address_postcode: Optional[str] = None
    postal_address_country_full: Optional[str] = None
    postal_required_details: Optional[str] = None
    postal_max_entries_per_person: Optional[int] = None
    postal_eligibility_rules: Optional[str] = None
    random_draw_engine_enabled: Optional[bool] = None
    instant_win_engine_enabled: Optional[bool] = None
    legal_review_notes: Optional[str] = None


async def _get_company(db) -> dict:
    doc = await db.settings.find_one({'_id': 'company'}, {'_id': 0})
    if not doc:
        await db.settings.insert_one({'_id': 'company', **DEFAULT_COMPANY})
        return dict(DEFAULT_COMPANY)
    # Merge missing keys from defaults so newly-added fields appear automatically.
    merged = {**DEFAULT_COMPANY, **doc}
    return merged


@public_router.get('/company')
async def public_company():
    """Public-safe subset of company settings (used by frontend footer, legal
    pages, postal-entry page). Excludes internal flags."""
    from deps import get_db
    doc = await _get_company(get_db())
    return {
        'legal_name': doc.get('legal_name'),
        'company_number': doc.get('company_number'),
        'jurisdiction': doc.get('jurisdiction'),
        'registered_address': doc.get('registered_address'),
        'website': doc.get('website'),
        'email_general': doc.get('email_general'),
        'email_support': doc.get('email_support'),
        'legal_footer': doc.get('legal_footer'),
        'postal_address_line1': doc.get('postal_address_line1'),
        'postal_address_line2': doc.get('postal_address_line2'),
        'postal_address_country': doc.get('postal_address_country'),
        'postal_address_postcode': doc.get('postal_address_postcode'),
        'postal_address_country_full': doc.get('postal_address_country_full'),
        'postal_required_details': doc.get('postal_required_details'),
    }


@admin_router.get('/company')
async def get_company(request: Request):
    await require_admin(request)
    from deps import get_db
    return await _get_company(get_db())


@admin_router.put('/company')
async def update_company(payload: CompanyUpdate, request: Request):
    admin = await require_admin(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(403, 'Only Super Admin can edit company settings')
    from deps import get_db
    db = get_db()
    current = await _get_company(db)

    incoming = payload.model_dump(exclude_none=True)
    if not incoming:
        raise HTTPException(400, 'No fields to update')

    await db.settings.update_one(
        {'_id': 'company'},
        {'$set': incoming},
        upsert=True,
    )
    # Audit — only when something actually changed.
    diff = {k: {'before': current.get(k), 'after': v} for k, v in incoming.items() if current.get(k) != v}
    if diff:
        await db.audit_log.insert_one({
            'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
            'kind': 'company_settings_update',
            'admin_email': admin['email'],
            'admin_user_id': admin['user_id'],
            'diff': diff,
            'at': datetime.now(timezone.utc),
        })
    return {'ok': True, 'updated_fields': list(incoming.keys())}


# ---------- Postal Entry Admin Queue ----------
POSTAL_STATUSES = ('received', 'under_review', 'validated', 'rejected',
                   'allocated', 'duplicate', 'late_entry')


class PostalCreate(BaseModel):
    entrant_name: str
    entrant_email: Optional[str] = None
    entrant_public_id: Optional[str] = None
    contest_slug: Optional[str] = None
    contest_id: Optional[str] = None
    envelope_reference: Optional[str] = None
    skill_answer: Optional[str] = None
    received_at: Optional[str] = None
    postmark_date: Optional[str] = None
    internal_notes: Optional[str] = None


class PostalUpdate(BaseModel):
    status: Optional[Literal['received', 'under_review', 'validated',
                             'rejected', 'allocated', 'duplicate',
                             'late_entry']] = None
    rejection_reason: Optional[str] = None
    internal_notes: Optional[str] = None
    allocated_ticket_number: Optional[int] = None


@admin_router.get('/postal-entries')
async def list_postal_entries(
    request: Request,
    status: Optional[str] = Query(None),
    contest_slug: Optional[str] = Query(None),
):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    q: dict = {}
    if status and status in POSTAL_STATUSES:
        q['status'] = status
    if contest_slug:
        q['contest_slug'] = contest_slug
    rows = await db.postal_entries.find(q, {'_id': 0}).sort('received_at', -1).limit(500).to_list(500)
    counts = {}
    for s in POSTAL_STATUSES:
        counts[s] = await db.postal_entries.count_documents({'status': s})
    return {'entries': rows, 'counts': counts}


@admin_router.post('/postal-entries')
async def create_postal_entry(payload: PostalCreate, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    now = datetime.now(timezone.utc)
    received_at = now
    if payload.received_at:
        try:
            received_at = datetime.fromisoformat(payload.received_at.replace('Z', '+00:00'))
        except Exception:
            pass
    postmark_date = None
    if payload.postmark_date:
        try:
            postmark_date = datetime.fromisoformat(payload.postmark_date.replace('Z', '+00:00'))
        except Exception:
            postmark_date = None
    entry_id = f'pe_{uuid.uuid4().hex[:12]}'
    doc = {
        'entry_id': entry_id,
        'entrant_name': payload.entrant_name,
        'entrant_email': payload.entrant_email,
        'entrant_public_id': payload.entrant_public_id,
        'contest_slug': payload.contest_slug,
        'contest_id': payload.contest_id,
        'envelope_reference': payload.envelope_reference,
        'skill_answer': payload.skill_answer,
        'received_at': received_at,
        'postmark_date': postmark_date,
        'status': 'received',
        'internal_notes': payload.internal_notes or '',
        'rejection_reason': None,
        'allocated_ticket_number': None,
        'created_at': now,
        'audit': [{
            'at': now,
            'status': 'received',
            'reviewer': admin['email'],
            'note': 'Logged into admin queue',
        }],
    }
    await db.postal_entries.insert_one(doc)
    return {'ok': True, 'entry_id': entry_id}


@admin_router.put('/postal-entries/{entry_id}')
async def update_postal_entry(entry_id: str, payload: PostalUpdate, request: Request):
    admin = await require_admin(request)
    from deps import get_db
    db = get_db()
    row = await db.postal_entries.find_one({'entry_id': entry_id}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Postal entry not found')
    now = datetime.now(timezone.utc)
    updates = {}
    audit_entry: dict = {'at': now, 'reviewer': admin['email']}
    if payload.status:
        updates['status'] = payload.status
        audit_entry['status'] = payload.status
    if payload.rejection_reason is not None:
        updates['rejection_reason'] = payload.rejection_reason
        audit_entry['rejection_reason'] = payload.rejection_reason
    if payload.internal_notes is not None:
        updates['internal_notes'] = payload.internal_notes
        audit_entry['note'] = payload.internal_notes
    if payload.allocated_ticket_number is not None:
        updates['allocated_ticket_number'] = payload.allocated_ticket_number
        audit_entry['allocated_ticket_number'] = payload.allocated_ticket_number
    if not updates:
        raise HTTPException(400, 'No fields to update')
    await db.postal_entries.update_one(
        {'entry_id': entry_id},
        {
            '$set': updates,
            '$push': {'audit': audit_entry},
        },
    )
    return {'ok': True}


@admin_router.delete('/postal-entries/{entry_id}')
async def delete_postal_entry(entry_id: str, request: Request):
    admin = await require_admin(request)
    if admin.get('role') != 'super_admin':
        raise HTTPException(403, 'Only Super Admin can delete postal entries')
    from deps import get_db
    db = get_db()
    r = await db.postal_entries.delete_one({'entry_id': entry_id})
    if r.deleted_count == 0:
        raise HTTPException(404, 'Not found')
    return {'ok': True}


# ---------- Contest Skill Leaderboard (Engine 1) ----------
contest_router = APIRouter(prefix='/api/contests', tags=['contests-leaderboard'])


@contest_router.get('/{contest_id}/leaderboard')
async def contest_leaderboard(
    contest_id: str,
    request: Request,
    limit: int = 50,
):
    """Contest-specific leaderboard using each user's best verified attempt.

    Ranking:
      1. Higher verified score
      2. Higher accuracy
      3. Faster duration in milliseconds
      4. Earlier valid submission
    """
    from auth import decode_jwt
    from deps import get_db

    db = get_db()
    safe_limit = max(1, min(int(limit), 100))

    contest = await db.contests.find_one(
        {'contest_id': contest_id},
        {'_id': 0},
    )
    if not contest:
        raise HTTPException(404, 'Contest not found')

    current_user_id = None

    auth_header = request.headers.get('Authorization') or ''
    if auth_header.lower().startswith('bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        current_user_id = decode_jwt(token)

        if not current_user_id:
            session = await db.user_sessions.find_one(
                {'session_token': token},
                {'_id': 0, 'user_id': 1},
            )
            if session:
                current_user_id = session.get('user_id')

    if not current_user_id:
        cookie_token = request.cookies.get('session_token')
        if cookie_token:
            session = await db.user_sessions.find_one(
                {'session_token': cookie_token},
                {'_id': 0, 'user_id': 1},
            )
            if session:
                current_user_id = session.get('user_id')

    pipeline = [
        {'$match': {'contest_id': contest_id}},
        {
            '$sort': {
                'points': -1,
                'accuracy': -1,
                'duration_ms': 1,
                'created_at': 1,
            }
        },
        {
            '$group': {
                '_id': '$user_id',
                'user_id': {'$first': '$user_id'},
                'user_name': {'$first': '$user_name'},
                'points': {'$first': '$points'},
                'accuracy': {'$first': '$accuracy'},
                'duration_ms': {'$first': '$duration_ms'},
                'created_at': {'$first': '$created_at'},
                'best_score_id': {'$first': '$score_id'},
                'attempts': {'$sum': 1},
            }
        },
        {
            '$sort': {
                'points': -1,
                'accuracy': -1,
                'duration_ms': 1,
                'created_at': 1,
            }
        },
    ]

    ranked_rows = await db.game_scores.aggregate(pipeline).to_list(10000)

    user_ids = [row['user_id'] for row in ranked_rows]
    users = {}

    if user_ids:
        async for user in db.users.find(
            {'user_id': {'$in': user_ids}},
            {
                '_id': 0,
                'user_id': 1,
                'public_id': 1,
                'username': 1,
                'name': 1,
            },
        ):
            users[user['user_id']] = user

    for index, row in enumerate(ranked_rows, start=1):
        user = users.get(row['user_id'], {})

        row.pop('_id', None)
        row['rank'] = index
        row['public_id'] = user.get('public_id')
        row['username'] = user.get('username')
        row['user_name'] = (
            user.get('username')
            or user.get('name')
            or row.get('user_name')
            or 'Player'
        )
        row['points'] = round(float(row.get('points') or 0), 2)
        row['accuracy'] = round(float(row.get('accuracy') or 0), 6)
        row['accuracy_pct'] = round(row['accuracy'] * 100.0, 2)
        row['duration_ms'] = int(row.get('duration_ms') or 0)
        row['is_current_user'] = row['user_id'] == current_user_id

    visible_entries = ranked_rows[:safe_limit]

    my_position = None
    if current_user_id:
        my_position = next(
            (
                {
                    **row,
                    'is_current_user': True,
                }
                for row in ranked_rows
                if row['user_id'] == current_user_id
            ),
            None,
        )

    scores = [float(row.get('points') or 0) for row in ranked_rows]
    durations = [
        int(row.get('duration_ms') or 0)
        for row in ranked_rows
        if int(row.get('duration_ms') or 0) > 0
    ]

    stats = {
        'participants': len(ranked_rows),
        'completed_attempts': await db.game_scores.count_documents(
            {'contest_id': contest_id}
        ),
        'highest_score': round(max(scores), 2) if scores else 0.0,
        'average_score': (
            round(sum(scores) / len(scores), 2)
            if scores
            else 0.0
        ),
        'fastest_time_ms': min(durations) if durations else None,
    }

    return {
        'contest_id': contest_id,
        'contest_title': contest.get('title'),
        'engine_type': contest.get('engine_type', 'leaderboard'),
        'closed': contest.get('status') != 'live',
        'entries': visible_entries,
        'my_position': my_position,
        'stats': stats,
        'tie_break_rules': [
            '1. Higher verified score',
            '2. Higher accuracy',
            '3. Faster valid completion time in milliseconds',
            '4. Earlier valid submission',
        ],
    }
