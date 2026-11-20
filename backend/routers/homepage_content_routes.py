from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_admin
from deps import get_db

public_router = APIRouter(prefix='/api/public/homepage-content', tags=['homepage-content-public'])
admin_router = APIRouter(prefix='/api/admin/homepage-content', tags=['homepage-content-admin'])


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _ensure_demo_content(db):
    marker = await db.homepage_content_seed.update_one(
        {'_id': 'homepage-demo-v1'},
        {'$setOnInsert': {'seeded_at': _now()}},
        upsert=True,
    )
    if marker.upserted_id is None:
        return

    now = datetime.now(timezone.utc)
    winners = [
        ('hc_demo_winner_1', 'Amelia R.', '£250 cash', 'https://images.pexels.com/photos/3768131/pexels-photo-3768131.jpeg?auto=compress&cs=tinysrgb&w=800', 8),
        ('hc_demo_winner_2', 'Daniel K.', 'Wireless headphones', 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=800', 32),
        ('hc_demo_winner_3', 'Priya S.', '£100 cash', 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=800', 145),
    ]
    reviews = [
        ('hc_demo_review_1', 'Sophie M.', 'Really simple to enter and the countdowns make everything easy to follow. Lovely experience from start to finish.', 12, 5),
        ('hc_demo_review_2', 'James T.', 'The games are quick, fun, and clear. I was especially impressed by how easy it was to track my entries.', 76, 5),
        ('hc_demo_review_3', 'Leah W.', 'A polished site with regular competitions and plenty to keep an eye on. The winner updates are a nice touch.', 360, 4),
    ]
    items = [
        {
            'content_id': content_id, 'kind': 'winner', 'name': name, 'prize': prize,
            'text': '', 'rating': 5, 'image_url': image_url,
            'created_at': (now - timedelta(minutes=minutes)).isoformat(), 'is_demo': True,
        }
        for content_id, name, prize, image_url, minutes in winners
    ]
    items.extend({
        'content_id': content_id, 'kind': 'review', 'name': name, 'prize': '',
        'text': text, 'rating': rating, 'image_url': '',
        'created_at': (now - timedelta(minutes=minutes)).isoformat(), 'is_demo': True,
    } for content_id, name, text, minutes, rating in reviews)
    await db.homepage_content.insert_many(items)


class HomepageContentIn(BaseModel):
    kind: Literal['winner', 'review']
    name: str = Field(min_length=1, max_length=80)
    prize: Optional[str] = Field(default='', max_length=160)
    text: Optional[str] = Field(default='', max_length=1000)
    rating: int = Field(default=5, ge=1, le=5)
    image_url: Optional[str] = Field(default='', max_length=500)


class HomepageSettingsIn(BaseModel):
    review_count: int = Field(default=0, ge=0)
    review_rating: float = Field(default=5, ge=0, le=5)
    google_review_url: Optional[str] = None


def _clean_image_url(value: str) -> str:
    value = (value or '').strip()
    if value and not (
        value.startswith('http://')
        or value.startswith('https://')
        or value.startswith('/api/uploads/')
    ):
        raise HTTPException(status_code=400, detail='Invalid image URL')
    return value


@public_router.get('')
async def public_homepage_content():
    db = get_db()
    await _ensure_demo_content(db)
    rows = await db.homepage_content.find({}, {'_id': 0}).sort('created_at', -1).to_list(200)
    settings = await db.homepage_content_settings.find_one({'_id': 'app'}, {'_id': 0}) or {}
    winners = [row for row in rows if row.get('kind') == 'winner'][:24]
    reviews = [row for row in rows if row.get('kind') == 'review'][:100]
    return {
        'winners': winners,
        'reviews': reviews,
        'review_count': int(settings.get('review_count') or 0),
        'review_rating': float(settings.get('review_rating') or 0),
        'google_review_url': settings.get('google_review_url') or '',
    }


@admin_router.get('')
async def admin_homepage_content(request: Request):
    await require_admin(request)
    return await public_homepage_content()


@admin_router.post('')
async def add_homepage_content(payload: HomepageContentIn, request: Request):
    await require_admin(request)
    db = get_db()
    item = {
        'content_id': f'hc_{uuid4().hex[:16]}',
        'kind': payload.kind,
        'name': payload.name.strip(),
        'prize': (payload.prize or '').strip(),
        'text': (payload.text or '').strip(),
        'rating': payload.rating,
        'image_url': _clean_image_url(payload.image_url or ''),
        'created_at': _now(),
    }
    if payload.kind == 'review' and not item['text']:
        raise HTTPException(status_code=400, detail='Review text is required')
    if payload.kind == 'winner' and not item['image_url']:
        raise HTTPException(status_code=400, detail='Winner image is required')
    await db.homepage_content.insert_one(item)
    item.pop('_id', None)
    return item


@admin_router.delete('/{content_id}')
async def delete_homepage_content(content_id: str, request: Request):
    await require_admin(request)
    result = await get_db().homepage_content.delete_one({'content_id': content_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail='Homepage content not found')
    return {'deleted': True}


@admin_router.put('/settings')
async def update_homepage_content_settings(payload: HomepageSettingsIn, request: Request):
    await require_admin(request)
    values = payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()
    values['google_review_url'] = (values.get('google_review_url') or '').strip()
    if values['google_review_url'] and not values['google_review_url'].startswith(('http://', 'https://')):
        raise HTTPException(status_code=400, detail='Google review URL must use http or https')
    await get_db().homepage_content_settings.update_one(
        {'_id': 'app'}, {'$set': values, '$setOnInsert': {'_id': 'app'}}, upsert=True
    )
    return values
