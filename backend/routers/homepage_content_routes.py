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


def _winner_sort_key(winner: dict):
    value = winner.get('credited_at') or winner.get('drawn_at') or winner.get('created_at')
    if isinstance(value, datetime):
        return value.timestamp()
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()
    except (TypeError, ValueError):
        return 0


def _real_prize(winner: dict) -> str:
    reward_type = str(winner.get('reward_type') or '').lower()
    physical_prize = str(winner.get('other_prize_description') or '').strip()
    if reward_type == 'other' and physical_prize:
        return physical_prize
    if reward_type in {'bonus', 'winning_bonus'}:
        return ''
    amount = float(winner.get('prize_cash_amount') or winner.get('prize_amount') or 0)
    if amount <= 0:
        return ''
    return f'£{amount:,.2f}'.replace('.00', '')


async def _real_homepage_winners(db):
    rows = await db.winners.find(
        {'public_hidden': {'$ne': True}, 'quarantined': {'$ne': True}, 'prize_blocked': {'$ne': True},
         '$or': [
             {'paid_out': True},
             {'approval_status': {'$in': ['approved', 'credited']}},
             {'credited_at': {'$exists': True, '$ne': None}},
         ]},
        {'_id': 0},
    ).sort([('credited_at', -1), ('drawn_at', -1), ('created_at', -1)]).to_list(1000)
    rows = [row for row in rows if _real_prize(row)]
    rows.sort(key=_winner_sort_key, reverse=True)
    users = {user['user_id']: user async for user in db.users.find(
        {'user_id': {'$in': list({row.get('user_id') for row in rows if row.get('user_id')})}},
        {'_id': 0, 'user_id': 1, 'name': 1, 'username': 1, 'profile_image_url': 1, 'profile_image_public': 1},
    )}
    winners = []
    for row in rows[:100]:
        user = users.get(row.get('user_id'), {})
        name = row.get('user_full_name') or row.get('user_name') or user.get('name') or user.get('username') or 'Winner'
        parts = [part for part in str(name).replace('@', ' ').split() if part]
        public_name = parts[0] if not parts else parts[0] + (f' {parts[-1][0]}.' if len(parts) > 1 else '')
        winners.append({
            'content_id': row.get('winner_id'),
            'winner_id': row.get('winner_id'),
            'kind': 'winner',
            'name': public_name,
            'prize': _real_prize(row),
            'image_url': row.get('winner_image_url') or (user.get('profile_image_url') if user.get('profile_image_public') else ''),
            'created_at': row.get('credited_at') or row.get('drawn_at') or row.get('created_at'),
            'contest_id': row.get('contest_id'),
        })
    total_winners = await db.winners.count_documents({
        'public_hidden': {'$ne': True}, 'quarantined': {'$ne': True}, 'prize_blocked': {'$ne': True},
        '$or': [
            {'paid_out': True},
            {'approval_status': {'$in': ['approved', 'credited']}},
            {'credited_at': {'$exists': True, '$ne': None}},
        ],
        '$and': [
            {'$or': [
                {'reward_type': {'$nin': ['bonus', 'winning_bonus']}, 'prize_cash_amount': {'$gt': 0}},
                {'reward_type': {'$nin': ['bonus', 'winning_bonus']}, 'prize_cash_amount': {'$exists': False}, 'prize_amount': {'$gt': 0}},
                {'reward_type': 'other', 'other_prize_description': {'$nin': [None, '']}},
            ]},
        ],
    })
    return winners, max(total_winners, len(rows))


@public_router.get('')
async def public_homepage_content():
    db = get_db()
    await _ensure_demo_content(db)
    rows = await db.homepage_content.find({'kind': 'review'}, {'_id': 0}).sort('created_at', -1).to_list(200)
    settings = await db.homepage_content_settings.find_one({'_id': 'app'}, {'_id': 0}) or {}
    winners, total_winners = await _real_homepage_winners(db)
    reviews = [row for row in rows if row.get('kind') == 'review'][:100]
    return {
        'winners': winners,
        'total_winners': total_winners,
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
