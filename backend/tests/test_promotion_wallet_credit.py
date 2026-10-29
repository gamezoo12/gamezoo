import asyncio
from copy import deepcopy
from types import SimpleNamespace

from routers import promotion_draw_routes


def test_verified_promotion_cash_prize_credits_winning_tokens_once(monkeypatch):
    draw = {
        'promotion_id': 'promo-test',
        'winners': [{
            'place': 1, 'user_id': 'winner-test', 'prize_gbp': 25,
            'verification_status': 'verified', 'payment_status': 'pending',
        }],
    }
    credits, audits = [], []

    class Draws:
        async def find_one(self, *_args):
            return deepcopy(draw)

        async def update_one(self, _query, update):
            draw['winners'][0].update({key.split('$.', 1)[-1]: value for key, value in update['$set'].items()})

    class Audit:
        async def insert_one(self, record):
            audits.append(record)

    async def require_admin(_request):
        return {'user_id': 'super-admin', 'email': 'admin@example.test', 'role': 'super_admin'}

    async def config(_db, _promotion_id):
        return {'promotion_id': 'promo-test', 'name': 'Test Promo'}

    async def credit(_db, user_id, kind, amount, **kwargs):
        credits.append((user_id, kind, amount, kwargs))
        return {'balance': 25, 'tx': {'tx_id': 'tx-test'}}

    monkeypatch.setattr(promotion_draw_routes, 'require_admin', require_admin)
    monkeypatch.setattr(promotion_draw_routes, '_cfg', config)
    monkeypatch.setattr(promotion_draw_routes, '_apply_tx_idempotent', credit)
    monkeypatch.setattr(promotion_draw_routes, 'get_db', lambda: SimpleNamespace(
        promotion_draws=Draws(), audit_log=Audit(),
    ))

    async def run():
        first = await promotion_draw_routes.mark_winner_paid(1, None, 'promo-test')
        assert first['status'] == 'paid' and first['wallet_transaction_id'] == 'tx-test'
        assert credits[0][1:3] == ('paid_prize_cash', 25)
        assert audits[0]['promotion_id'] == 'promo-test'
        assert audits[0]['winner_user_id'] == 'winner-test'
        assert audits[0]['wallet_transaction_id'] == 'tx-test'
        replay = await promotion_draw_routes.mark_winner_paid(1, None, 'promo-test')
        assert replay['idempotent'] is True
        assert len(credits) == len(audits) == 1

    asyncio.run(run())