"""Free games: admin stats + ads (own sponsor ads and/or Google AdSense) shown before a level starts."""
from __future__ import annotations

import random
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_admin
from deps import get_db
from routers.practice_routes import ALLOWED, _col

admin_router = APIRouter(prefix='/api/admin/free-games', tags=['free-games-admin'])
public_router = APIRouter(prefix='/api/games/ads', tags=['free-games-ads'])

AD_DEFAULTS = {'enabled': False, 'source': 'own', 'every_n_levels': 3, 'skip_after_s': 5, 'adsense_client': '', 'adsense_slot': ''}


def _now():
    return datetime.now(timezone.utc)


async def _ad_settings(db) -> dict:
    doc = await db.settings.find_one({'_id': 'free_game_ads'}, {'_id': 0}) or {}
    return {**AD_DEFAULTS, **{k: doc[k] for k in AD_DEFAULTS if k in doc}}


class AdSettingsIn(BaseModel):
    enabled: bool
    source: Literal['own', 'adsense', 'mix']
    every_n_levels: int = Field(..., ge=1, le=50)
    skip_after_s: int = Field(..., ge=0, le=30)
    adsense_client: str = Field(default='', max_length=40)
    adsense_slot: str = Field(default='', max_length=20)


class AdIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=80)
    media_type: Literal['image', 'video']
    media_url: str = Field(..., min_length=8, max_length=600)
    click_url: str = Field(default='', max_length=600)
    cta: str = Field(default='Learn more', max_length=30)
    active: bool = True
    weight: int = Field(default=1, ge=1, le=10)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


def _check_ad(body: AdIn):
    if body.click_url and not re.match(r'^(https://|/)', body.click_url):
        raise HTTPException(status_code=400, detail='Link must start with https:// or /')
    if not re.match(r'^(https://|/api/)', body.media_url):
        raise HTTPException(status_code=400, detail='Upload the image or video first')


def _iso(v):
    return v.astimezone(timezone.utc).isoformat() if isinstance(v, datetime) and v.tzinfo else (v.replace(tzinfo=timezone.utc).isoformat() if isinstance(v, datetime) else v)


def _ad_out(d: dict) -> dict:
    return {**{k: v for k, v in d.items() if k != '_id'}, 'starts_at': _iso(d.get('starts_at')), 'ends_at': _iso(d.get('ends_at')),
            'created_at': _iso(d.get('created_at')), 'updated_at': _iso(d.get('updated_at'))}


@admin_router.get('/ads')
async def list_ads(request: Request):
    await require_admin(request)
    db = get_db()
    ads = await db.free_game_ads.find({}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return {'settings': await _ad_settings(db), 'ads': [_ad_out(a) for a in ads]}


@admin_router.put('/ads/settings')
async def save_ad_settings(body: AdSettingsIn, request: Request):
    await require_admin(request)
    if body.adsense_client and not re.match(r'^ca-pub-\d{10,20}$', body.adsense_client):
        raise HTTPException(status_code=400, detail='AdSense publisher ID looks like ca-pub-1234567890123456')
    if body.adsense_slot and not body.adsense_slot.isdigit():
        raise HTTPException(status_code=400, detail='AdSense ad slot ID should be digits only')
    if body.enabled and body.source in ('adsense', 'mix') and not (body.adsense_client and body.adsense_slot):
        raise HTTPException(status_code=400, detail='Add your AdSense publisher ID and ad slot ID first')
    db = get_db()
    await db.settings.update_one({'_id': 'free_game_ads'}, {'$set': {**body.model_dump(), 'updated_at': _now()}}, upsert=True)
    return {'settings': await _ad_settings(db)}


@admin_router.post('/ads')
async def create_ad(body: AdIn, request: Request):
    admin = await require_admin(request)
    _check_ad(body)
    doc = {**body.model_dump(), 'ad_id': f'fga_{uuid.uuid4().hex[:12]}', 'impressions': 0, 'clicks': 0, 'created_at': _now(), 'updated_at': _now(), 'created_by': admin.get('email')}
    await get_db().free_game_ads.insert_one(doc)
    return {'ad': _ad_out(doc)}


@admin_router.put('/ads/{ad_id}')
async def update_ad(ad_id: str, body: AdIn, request: Request):
    await require_admin(request)
    _check_ad(body)
    r = await get_db().free_game_ads.find_one_and_update({'ad_id': ad_id}, {'$set': {**body.model_dump(), 'updated_at': _now()}}, projection={'_id': 0}, return_document=True)
    if not r:
        raise HTTPException(status_code=404, detail='Ad not found')
    return {'ad': _ad_out(r)}


@admin_router.delete('/ads/{ad_id}')
async def delete_ad(ad_id: str, request: Request):
    await require_admin(request)
    r = await get_db().free_game_ads.delete_one({'ad_id': ad_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail='Ad not found')
    return {'ok': True}


@admin_router.get('/stats')
async def stats(request: Request, days: int = 30):
    await require_admin(request)
    days = max(1, min(days, 365))
    db = get_db()
    col = await _col()
    since = (_now() - timedelta(days=days - 1)).strftime('%Y-%m-%d')
    daily = await db.practice_daily.find({'date': {'$gte': since}}, {'_id': 0}).to_list(50_000)
    per, series = {}, {}
    for d in daily:
        g = per.setdefault(d['game_id'], {'game_id': d['game_id'], 'starts': 0, 'passes': 0, 'fails': 0, 'top_level': 0})
        s = series.setdefault(d['date'], {'date': d['date'], 'starts': 0, 'passes': 0, 'fails': 0})
        for k in ('starts', 'passes', 'fails'):
            g[k] += d.get(k, 0)
            s[k] += d.get(k, 0)
        g['top_level'] = max(g['top_level'], d.get('top_level', 0))
    prog = await col.aggregate([{'$group': {'_id': '$game_id', 'players': {'$sum': 1}, 'best': {'$max': '$best'}, 'avg': {'$avg': '$best'}}}]).to_list(200)
    for p in prog:
        g = per.setdefault(p['_id'], {'game_id': p['_id'], 'starts': 0, 'passes': 0, 'fails': 0, 'top_level': 0})
        g.update({'players': p['players'], 'best_level': p.get('best') or 0, 'avg_level': round(p.get('avg') or 0, 1)})
    rows = sorted((r for r in per.values() if r['game_id'] in ALLOWED), key=lambda r: -r['starts'])
    for r in rows:
        done = r['passes'] + r['fails']
        r['pass_rate'] = round(100 * r['passes'] / done) if done else None
    ads = await db.free_game_ads.find({}, {'_id': 0, 'ad_id': 1, 'title': 1, 'impressions': 1, 'clicks': 1, 'active': 1}).to_list(200)
    totals = {k: sum(r[k] for r in rows) for k in ('starts', 'passes', 'fails')}
    totals['players'] = len(await col.distinct('user_id'))
    totals['ad_impressions'] = sum(a.get('impressions', 0) for a in ads)
    totals['ad_clicks'] = sum(a.get('clicks', 0) for a in ads)
    return {'days': days, 'totals': totals, 'games': rows, 'series': sorted(series.values(), key=lambda s: s['date']), 'ads': ads}


@public_router.get('/next')
async def next_ad():
    db = get_db()
    cfg = await _ad_settings(db)
    out = {'enabled': cfg['enabled'], 'every_n_levels': cfg['every_n_levels'], 'skip_after_s': cfg['skip_after_s'], 'ad': None, 'adsense': None}
    if not cfg['enabled']:
        return out
    now = _now()
    own = []
    if cfg['source'] in ('own', 'mix'):
        own = await db.free_game_ads.find({'active': True, '$and': [
            {'$or': [{'starts_at': None}, {'starts_at': {'$lte': now}}]}, {'$or': [{'ends_at': None}, {'ends_at': {'$gte': now}}]}]},
            {'_id': 0, 'ad_id': 1, 'title': 1, 'media_type': 1, 'media_url': 1, 'click_url': 1, 'cta': 1, 'weight': 1}).to_list(100)
    use_adsense = cfg['source'] == 'adsense' or (cfg['source'] == 'mix' and (not own or random.random() < 0.5))
    if use_adsense and cfg['adsense_client'] and cfg['adsense_slot']:
        out['adsense'] = {'client': cfg['adsense_client'], 'slot': cfg['adsense_slot']}
    elif own:
        out['ad'] = random.choices(own, weights=[a.get('weight', 1) for a in own])[0]
    return out


@public_router.post('/{ad_id}/{kind}')
async def ad_event(ad_id: str, kind: Literal['impression', 'click']):
    await get_db().free_game_ads.update_one({'ad_id': ad_id}, {'$inc': {f'{kind}s': 1}})
    return {'ok': True}
