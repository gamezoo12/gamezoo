from fastapi import APIRouter, HTTPException, Request

from auth import require_admin

router = APIRouter(prefix='/api/admin/settings', tags=['settings'])

DEFAULT_SETTINGS = {
    'site_name': 'Prize League',
    'tagline': 'Play. Solve. Win.',
    'support_email': 'support@prizeleague.co.uk',
    'support_phone': '',
    'postal_address': 'Prize League Free Entry\nPO Box 4210\nLondon EC1A 1BB\nUnited Kingdom',
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

    # Homepage promotion slider.
    # Admin chooses 1-5 visible slots and uploads an image for each.
    'promotion_slide_count': 1,
    'promotion_slides': [],

    # Public game preview / marketing arena.
    # OFF by default so deploying this code changes no public behaviour
    # until an administrator explicitly enables it.
    'game_preview_enabled': False,
    'game_preview_home_enabled': False,
    'game_preview_home_count': 4,
    'game_preview_games': [],
    'game_preview_images': {},
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

    if 'promotion_slide_count' in updates:
        try:
            updates['promotion_slide_count'] = max(
                1,
                min(5, int(updates['promotion_slide_count'])),
            )
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail='Promotion slide count must be between 1 and 5',
            )

    if 'promotion_slides' in updates:
        raw_slides = updates.get('promotion_slides')

        if not isinstance(raw_slides, list):
            raise HTTPException(
                status_code=400,
                detail='Promotion slides must be a list',
            )

        clean_slides = []

        for item in raw_slides[:5]:
            if not isinstance(item, dict):
                continue

            url = str(item.get('url') or '').strip()

            if not url:
                clean_slides.append({'url': ''})
                continue

            if not (
                url.startswith('http://')
                or url.startswith('https://')
                or url.startswith('/api/uploads/')
            ):
                raise HTTPException(
                    status_code=400,
                    detail='Invalid promotion image URL',
                )

            clean_slides.append({'url': url})

        updates['promotion_slides'] = clean_slides

    # Public game preview settings.
    if 'game_preview_enabled' in updates:
        if not isinstance(updates['game_preview_enabled'], bool):
            raise HTTPException(
                status_code=400,
                detail='Game preview enabled must be true or false',
            )

    if 'game_preview_home_enabled' in updates:
        if not isinstance(updates['game_preview_home_enabled'], bool):
            raise HTTPException(
                status_code=400,
                detail='Game preview homepage enabled must be true or false',
            )

    if 'game_preview_home_count' in updates:
        try:
            updates['game_preview_home_count'] = max(
                1,
                min(12, int(updates['game_preview_home_count'])),
            )
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail='Homepage game preview count must be between 1 and 12',
            )

    if 'game_preview_images' in updates:
        raw_images = updates['game_preview_images']

        if not isinstance(raw_images, dict):
            raise HTTPException(
                status_code=400,
                detail='Game preview images must be an object',
            )

        clean_images = {}

        for game_id, raw_url in raw_images.items():
            game_id = str(game_id or '').strip()
            url = str(raw_url or '').strip()

            if (
                not game_id
                or len(game_id) > 80
                or not all(ch.isalnum() or ch == '_' for ch in game_id)
            ):
                continue

            if not url:
                clean_images[game_id] = ''
                continue

            if not (
                url.startswith('http://')
                or url.startswith('https://')
                or url.startswith('/api/uploads/')
            ):
                raise HTTPException(
                    status_code=400,
                    detail='Invalid game preview image URL',
                )

            clean_images[game_id] = url

        updates['game_preview_images'] = clean_images

    if 'game_preview_games' in updates:
        raw_games = updates['game_preview_games']

        if not isinstance(raw_games, list):
            raise HTTPException(
                status_code=400,
                detail='Game preview games must be a list',
            )

        clean_games = []
        seen = set()

        for game_id in raw_games:
            game_id = str(game_id or '').strip()

            if not game_id or game_id in seen:
                continue

            # Keep identifiers bounded and predictable.
            if len(game_id) > 80 or not all(
                ch.isalnum() or ch == '_' for ch in game_id
            ):
                raise HTTPException(
                    status_code=400,
                    detail='Invalid game preview game identifier',
                )

            seen.add(game_id)
            clean_games.append(game_id)

        updates['game_preview_games'] = clean_games

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
                 'privacy_policy_url', 'terms_url',
                 'promotion_slide_count', 'promotion_slides',
                 'game_preview_enabled', 'game_preview_home_enabled',
                 'game_preview_home_count', 'game_preview_games',
                 'game_preview_images'}
    return {k: v for k, v in merged.items() if k in safe_keys}
