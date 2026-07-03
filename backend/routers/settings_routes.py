from fastapi import APIRouter, HTTPException, Request

from auth import require_admin

router = APIRouter(prefix='/api/admin/settings', tags=['settings'])

DEFAULT_SETTINGS = {
    'site_name': 'GameZoo',
    'tagline': 'Play. Solve. Win.',
    'support_email': 'support@gamezoo.co.uk',
    'support_phone': '',
    'postal_address': 'GameZoo Free Entry\nPO Box 4210\nLondon EC1A 1BB\nUnited Kingdom',
    'currency': 'GBP',
    'kyc_required_for_payout': True,
    'min_withdrawal': 10,
    'signup_enabled': True,
    'auto_launch_contests': False,
    'age_gate_enabled': True,
    'min_age': 18,
    'company_registration': '',
    'vat_number': '',
    'privacy_policy_url': '',
    'terms_url': '',
}


@router.get('')
async def get_settings(request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    doc = await db.settings.find_one({'_id': 'app'}, {'_id': 0})
    if not doc:
        return DEFAULT_SETTINGS
    # Merge with defaults so new keys always appear
    return {**DEFAULT_SETTINGS, **doc}


@router.put('')
async def update_settings(payload: dict, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    updates = {k: v for k, v in (payload or {}).items() if k in DEFAULT_SETTINGS}
    if not updates:
        raise HTTPException(status_code=400, detail='No valid settings to update')
    await db.settings.update_one({'_id': 'app'}, {'$set': updates}, upsert=True)
    doc = await db.settings.find_one({'_id': 'app'}, {'_id': 0})
    return {**DEFAULT_SETTINGS, **(doc or {})}


# Also expose a public settings endpoint (safe fields only)
public_router = APIRouter(prefix='/api/settings', tags=['settings-public'])


@public_router.get('')
async def public_settings():
    from deps import get_db
    db = get_db()
    doc = await db.settings.find_one({'_id': 'app'}, {'_id': 0}) or {}
    merged = {**DEFAULT_SETTINGS, **doc}
    safe_keys = {'site_name', 'tagline', 'support_email', 'support_phone',
                 'postal_address', 'currency', 'min_age', 'age_gate_enabled',
                 'privacy_policy_url', 'terms_url'}
    return {k: v for k, v in merged.items() if k in safe_keys}
