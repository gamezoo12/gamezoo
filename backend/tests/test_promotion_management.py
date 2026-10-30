import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

import auth
from deps import _mongo_url, _sanitize_db_name
from routers import announcement_routes, promotion_draw_routes, promotion_routes, promotion_source_analytics_routes, world_routes


def test_promotion_management_and_winner_announcement(monkeypatch):
    db_name = _sanitize_db_name(os.environ.get('DB_NAME'))
    if not db_name.startswith('test_') or db_name == 'test_database':
        pytest.skip('Requires an isolated test database')

    async def run():
        client = AsyncIOMotorClient(_mongo_url)
        db = client[db_name]
        promotion_id = f'test-promotion-{uuid.uuid4().hex[:8]}'
        user_id = f'test-winner-{uuid.uuid4().hex[:8]}'
        previous = await db.promotion_config.find_one({'key': 'freeworld'})
        previous_badge = await db.site_announcement_settings.find_one({'_id': 'promotion_badge'})

        async def current_user(request):
            role = request.headers.get('x-test-role', 'user')
            return {'user_id': f'test-{role}', 'role': role}

        monkeypatch.setattr(auth, 'get_current_user', current_user)
        for module in (promotion_routes, promotion_draw_routes, announcement_routes, world_routes):
            monkeypatch.setattr(module, 'get_db', lambda: db)
        app = FastAPI()
        app.include_router(promotion_routes.router)
        app.include_router(promotion_routes.admin_router)
        app.include_router(promotion_draw_routes.router)
        app.include_router(promotion_source_analytics_routes.router)
        app.include_router(announcement_routes.public_router)
        app.include_router(announcement_routes.admin_router)
        transport = httpx.ASGITransport(app=app)
        now = datetime.now(timezone.utc)
        config = {'promotion_id': promotion_id, 'name': 'Isolated promotion', 'active': True, 'promotion_type': 'prize_draw',
                  'start_at': (now - timedelta(hours=1)).isoformat(),
                  'end_at': (now + timedelta(hours=1)).isoformat(),
                  'signup_offer_text': 'Signup Bonus: 5 free Tokens',
                  'topup_offer_text': 'Top-Up Offer: Top up £20 and get 40 Tokens',
                  'show_join': False, 'show_refer': True, 'show_topup': True,
                  'topup_url': '/my-account/wallet?topup=1'}
        try:
            await db.users.insert_one({'user_id': user_id, 'name': 'Test Winner'})
            await db.promotion_tickets.insert_one({'promotion_id': promotion_id, 'user_id': user_id, 'ticket_number': 'TEST-001'})
            await db.world_winner_awards.insert_one({'season_id': 'season-1', 'global_contest_number': 999999,
                'user_id': user_id, 'rank': 1, 'champion_stage_snapshot': 1, 'status': 'paid', 'currency': 'GBP'})
            async with httpx.AsyncClient(transport=transport, base_url='http://test') as api:
                admin = {'x-test-role': 'admin'}
                super_admin = {'x-test-role': 'super_admin'}
                assert (await api.put('/api/admin/promotion/config', json=config, headers=admin)).status_code == 403
                assert (await api.put('/api/admin/promotion/manual-winner', json={'user_id': user_id}, headers=admin)).status_code == 403
                assert (await api.get('/api/admin/promotion/source-analytics', headers=admin)).status_code == 403
                assert (await api.get('/api/admin/promotion/campaigns', headers=admin)).status_code == 403
                assert (await api.get('/api/admin/announcements/generated', headers=admin)).status_code == 403
                generated = (await api.get('/api/admin/announcements/generated', headers=super_admin)).json()['items']
                champion_id = 'champion-winner:999999:1'
                assert any(item['id'] == champion_id and 'Test Winner' in item['sample'] for item in generated)
                assert any(item['id'] == 'default:skill' for item in generated)
                body = {'text': 'Congratulations {winner}: {prize}', 'enabled': True, 'published': True, 'deleted': False}
                assert (await api.put(f'/api/admin/announcements/generated/{champion_id}', json=body, headers=admin)).status_code == 403
                assert (await api.put(f'/api/admin/announcements/generated/{champion_id}', json={**body, 'text': 'Not a real winner'}, headers=super_admin)).status_code == 422
                assert (await api.put(f'/api/admin/announcements/generated/{champion_id}', json=body, headers=super_admin)).status_code == 200
                assert (await api.get('/api/announcements')).json()['ticker_overrides'][champion_id]['text'] == body['text']
                assert (await api.put(f'/api/admin/announcements/generated/{champion_id}', json={**body, 'published': False}, headers=super_admin)).status_code == 200
                assert 'text' not in (await api.get('/api/announcements')).json()['ticker_overrides'][champion_id]
                fallback = {'text': 'Updated default announcement', 'enabled': False, 'published': True, 'deleted': False}
                assert (await api.put('/api/admin/announcements/generated/default:skill', json=fallback, headers=super_admin)).status_code == 200
                assert not any(item['id'] == 'default:skill' for item in (await api.get('/api/announcements')).json()['fallbacks'])
                assert await db.world_winner_awards.count_documents({'user_id': user_id, 'status': 'paid'}) == 1
                badge = {'enabled': False, 'text': 'Special offer', 'url': 'https://example.com/offer'}
                assert (await api.put('/api/admin/announcements/promotion-badge', json=badge, headers=admin)).status_code == 403
                assert (await api.put('/api/admin/announcements/promotion-badge', json=badge, headers=super_admin)).json() == badge
                assert (await api.get('/api/announcements/promotion-badge')).json() == badge
                assert (await api.put('/api/admin/announcements/promotion-badge', json={**badge, 'url': 'javascript:alert(1)'}, headers=super_admin)).status_code == 422
                assert (await api.put('/api/admin/announcements/promotion-badge', json={**badge, 'url': 'https://good.example\\@bad.example'}, headers=super_admin)).status_code == 422
                saved = await api.put('/api/admin/promotion/config', json=config, headers=super_admin)
                assert saved.status_code == 200, saved.text
                assert saved.json()['topup_url'] == config['topup_url'] and saved.json()['show_join'] is False
                offer = await api.put('/api/admin/promotion/config', json={**config, 'promotion_type': 'offer'}, headers=super_admin)
                assert offer.status_code == 200 and offer.json()['promotion_type'] == 'offer'
                assert (await api.put('/api/admin/promotion/manual-winner', json={'user_id': user_id}, headers=super_admin)).status_code == 400
                assert (await api.post('/api/admin/promotion/draw', headers=super_admin)).status_code == 400
                assert (await api.put('/api/admin/promotion/config', json=config, headers=super_admin)).status_code == 200
                public = (await api.get('/api/promotion/config')).json()
                assert public['is_live'] and public['signup_offer_text'] == config['signup_offer_text']
                assert public['topup_offer_text'] == config['topup_offer_text'] and public['show_refer'] is True
                bad = await api.put('/api/admin/promotion/config', json={**config, 'topup_url': '//example.com'}, headers=super_admin)
                assert bad.status_code == 422
                assert (await api.put('/api/admin/promotion/manual-winner', json={'user_id': 'not-eligible'}, headers=super_admin)).status_code == 422
                selected = await api.put('/api/admin/promotion/manual-winner', json={'user_id': user_id}, headers=super_admin)
                assert selected.status_code == 200, selected.text
                assert selected.json()['winner']['ticket_number'] == 'TEST-001'
                assert not any(a['id'] == f'promotion-winner-{promotion_id}' for a in (await api.get('/api/announcements')).json()['announcements'])
                assert (await api.post('/api/admin/promotion/draw', headers=super_admin)).status_code == 409
                await db.promotion_config.update_one({'key': 'freeworld'}, {'$set': {'end_at': (now - timedelta(seconds=1)).isoformat()}})
                announcements = (await api.get('/api/announcements')).json()['announcements']
                winner = next(a for a in announcements if a['id'] == f'promotion-winner-{promotion_id}')
                assert winner['text'] == 'Test Winner won Isolated promotion!'
                assert (await api.put('/api/admin/promotion/manual-winner', json={'user_id': user_id}, headers=super_admin)).status_code == 409
                assert await db.wallets.count_documents({'user_id': user_id}) == 0
        finally:
            await db.promotion_config.delete_one({'key': 'freeworld'})
            await db.site_announcement_settings.delete_one({'_id': 'promotion_badge'})
            if previous_badge:
                await db.site_announcement_settings.insert_one(previous_badge)
            await db.site_announcement_audit.delete_many({'actor_id': 'test-super_admin', 'announcement_id': 'promotion_badge'})
            if previous:
                await db.promotion_config.insert_one(previous)
            await db.promotion_manual_winners.delete_one({'_id': promotion_id})
            await db.promotion_tickets.delete_many({'promotion_id': promotion_id})
            await db.world_winner_awards.delete_many({'user_id': user_id})
            await db.site_ticker_overrides.delete_many({'_id': {'$in': ['champion-winner:999999:1', 'default:skill']}})
            await db.audit_log.delete_many({'promotion_id': promotion_id})
            await db.users.delete_one({'user_id': user_id})
            client.close()

    asyncio.run(run())