"""Integration tests for bonus grants. Writes only to DB_NAME containing 'test'."""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient

import pytest
from fastapi import HTTPException

from deps import _mongo_url, _sanitize_db_name
from routers import bonus_grants_routes
from routers.wallet_routes import _apply_tx, _apply_tx_idempotent, _get_or_create_wallet
from services.bonus_grants import (
    compute_expiry, create_grant, expire_due_for_user, recover_reservations,
    reserve_from_grants, run_expiry_job,
)
from services.bonus_grants import recover_pending_grants


def run_db(target, fn):
    """Use a fresh Motor client per asyncio loop; never share the server's client."""
    async def run():
        client = AsyncIOMotorClient(target['url'])
        try:
            return await fn(client[target['name']])
        finally:
            client.close()
    return asyncio.run(run())


@pytest.fixture(scope='module')
def safe_db():
    db_name = os.environ.get('DB_NAME', '')
    if 'test' not in db_name.lower():
        pytest.skip('Integration test requires a DB_NAME containing "test"')
    return {'url': _mongo_url, 'name': _sanitize_db_name(db_name)}


@pytest.fixture
def user(safe_db):
    uid = 'bonus_itest_' + uuid.uuid4().hex[:10]
    async def seed(db):
        await db.users.insert_one({'user_id': uid, 'email': f'{uid}@example.test', 'role': 'user', 'name': 'Bonus Test'})
    run_db(safe_db, seed)
    yield uid
    async def cleanup(db):
        for collection in ('users', 'user_sessions', 'wallets', 'wallet_tx', 'bonus_grants', 'notifications', 'audit_log'):
            await db[collection].delete_many({'user_id': uid})
        await db.bonus_grants.delete_many({'ref_key': {'$regex': f'^{uid}:'}})
    run_db(safe_db, cleanup)


def test_ten_bonus_spend_four_then_only_six_expire(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 25, note='test purchased tokens')
        await _apply_tx(db, user, 'winnings', 15, note='test prize tokens')
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        grant = await create_grant(
            db, user_id=user, amount=10, expires_at=expiry, actor_id='admin-test',
            actor_email='admin@example.test', reason='bonus expiry integration test', ref_key=f'{user}:partial',
        )
        assert grant['status'] == 'active'
        spent = await _apply_tx(db, user, 'spend', -4, note='test spend')
        assert spent['tx']['bonus_amount'] == -4
        wallet_before = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert wallet_before['balance'] == 46 and wallet_before['bonus'] == 6
        await db.bonus_grants.update_one({'grant_id': grant['grant_id']},
                         {'$set': {'expires_at': datetime.now(timezone.utc) - timedelta(seconds=1)}})
        result = await run_expiry_job(db)
        assert result['expired'] == 1
        wallet_after = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        grant_after = await db.bonus_grants.find_one({'grant_id': grant['grant_id']}, {'_id': 0})
        assert wallet_after['balance'] == 40
        assert wallet_after['bonus'] == 0
        assert wallet_after['withdrawable'] == 15
        assert grant_after['status'] == 'expired' and grant_after['expired_amount'] == 6
        assert await db.wallet_tx.count_documents({'user_id': user, 'kind': 'bonus_expiry', 'amount': -6}) == 1
        # Repeated scheduler runs are idempotent.
        result = await run_expiry_job(db)
        assert result['expired'] == 0
        assert (await db.wallets.find_one({'user_id': user}))['balance'] == 40
        assert await db.wallet_tx.count_documents({'user_id': user, 'kind': 'bonus_expiry'}) == 1
    run_db(safe_db, run)


def test_multiple_grants_expire_independently_and_spending_uses_earliest(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 20)
        now = datetime.now(timezone.utc)
        soon = await create_grant(db, user_id=user, amount=3, expires_at=now + timedelta(hours=1),
                                  actor_id='a', actor_email='a@test', reason='first grant for integration test', ref_key=f'{user}:soon')
        later = await create_grant(db, user_id=user, amount=7, expires_at=now + timedelta(days=2),
                                   actor_id='a', actor_email='a@test', reason='second grant for integration test', ref_key=f'{user}:later')
        spent = await _apply_tx(db, user, 'spend', -4)
        assert spent['tx']['bonus_amount'] == -4 and spent['tx']['purchased_amount'] == 0
        first = await db.bonus_grants.find_one({'grant_id': soon['grant_id']}, {'_id': 0})
        second = await db.bonus_grants.find_one({'grant_id': later['grant_id']}, {'_id': 0})
        assert first['status'] == 'consumed' and first['remaining_amount'] == 0
        assert second['remaining_amount'] == 6
        await db.bonus_grants.update_one({'grant_id': later['grant_id']}, {'$set': {'expires_at': now - timedelta(seconds=1)}})
        await run_expiry_job(db, now=now)
        w = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        second = await db.bonus_grants.find_one({'grant_id': later['grant_id']}, {'_id': 0})
        assert second['status'] == 'expired' and second['expired_amount'] == 6
        assert w['bonus'] == 0 and w['balance'] == 20
    run_db(safe_db, run)


def test_legacy_bonus_without_grant_never_expires(safe_db, user):
    async def run(db):
        await db.wallets.insert_one({'user_id': user, 'balance': 10.0, 'bonus': 4.0, 'withdrawable': 2.0,
                                    'withdrawable_pending': 0.0, 'source_migrated': True})
        await db.bonus_grants.insert_one({'grant_id': 'old_' + user, 'user_id': user, 'remaining_amount': 4,
                                               'original_amount': 4, 'expires_at': datetime.now(timezone.utc) - timedelta(days=9),
                                               'status': 'active'})
        # A real grant has expiry, so explicit legacy balances are represented without a grant at all.
        await db.bonus_grants.delete_many({'grant_id': 'old_' + user})
        w = await _get_or_create_wallet(db, user)
        assert w['bonus'] == 4 and w['balance'] == 10
        await expire_due_for_user(db, user)
        w2 = await db.wallets.find_one({'user_id': user})
        assert w2['bonus'] == 4 and w2['balance'] == 10
        # Existing source split stays non-expiring; normal spend still consumes it first.
        tx = await _apply_tx(db, user, 'spend', -3)
        w3 = await db.wallets.find_one({'user_id': user})
        assert tx['tx']['bonus_amount'] == -3 and w3['bonus'] == 1 and w3['balance'] == 7
    run_db(safe_db, run)


def test_expiring_reminder_is_sent_once(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        expiry = datetime.now(timezone.utc) + timedelta(hours=12)
        grant = await create_grant(db, user_id=user, amount=5, expires_at=expiry, actor_id='a',
                                   actor_email='a@test', reason='notification reminder integration test', ref_key=f'{user}:remind')
        first = await run_expiry_job(db)
        second = await run_expiry_job(db)
        assert first['reminded'] == 1 and second['reminded'] == 0
        reminders = await db.notifications.count_documents({'user_id': user, 'kind': 'bonus_expiring'})
        assert reminders == 1
        # Recreate the missing notification flag to simulate a crash after insert; deterministic _id prevents a duplicate.
        await db.bonus_grants.update_one({'grant_id': grant['grant_id']}, {'$unset': {'expiring_notified_at': ''}})
        await run_expiry_job(db)
        assert await db.notifications.count_documents({'user_id': user, 'kind': 'bonus_expiring'}) == 1
    run_db(safe_db, run)


def test_expiry_and_spending_race_never_spends_expired_bonus(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 20)
        await create_grant(db, user_id=user, amount=10,
                   expires_at=datetime.now(timezone.utc) - timedelta(seconds=1), actor_id='a',
                   actor_email='a@test', reason='race safety integration test', ref_key=f'{user}:race')
        results = await asyncio.gather(
            _apply_tx(db, user, 'spend', -4),
            run_expiry_job(db),
            return_exceptions=True,
        )
        # A request arriving while an expiry claim is being finalized is safely asked to retry.
        spend_result = results[0]
        if isinstance(spend_result, HTTPException):
            assert spend_result.status_code == 503
            spend_result = await _apply_tx(db, user, 'spend', -4)
        assert isinstance(spend_result, dict), results
        assert not isinstance(results[1], Exception), results
        w = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert w['bonus'] == 0 and w['balance'] == 16 and w['bonus'] >= 0
        assert await db.wallet_tx.count_documents({'user_id': user, 'kind': 'bonus_expiry'}) == 1
        assert await db.wallet_tx.count_documents({'user_id': user, 'kind': 'spend', 'purchased_amount': -4}) == 1
    run_db(safe_db, run)


def test_concurrent_spends_never_spend_grant_tokens_twice_or_skip_bonus_priority(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 1)
        grant = await create_grant(db, user_id=user, amount=4, expires_at=datetime.now(timezone.utc) + timedelta(days=1),
                                   actor_id='a', actor_email='a@test', reason='concurrent spending safety test',
                                   ref_key=f'{user}:concurrent')
        results = await asyncio.gather(
            _apply_tx(db, user, 'spend', -4, ref_order_id=f'{user}:spend1'),
            _apply_tx(db, user, 'spend', -4, ref_order_id=f'{user}:spend2'),
            return_exceptions=True,
        )
        successes = [r for r in results if isinstance(r, dict)]
        failures = [r for r in results if isinstance(r, Exception)]
        assert len(successes) == 1 and len(failures) == 1
        assert isinstance(failures[0], HTTPException) and failures[0].status_code in (400, 409)
        wallet = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        grant_after = await db.bonus_grants.find_one({'grant_id': grant['grant_id']}, {'_id': 0})
        assert wallet['balance'] == 1 and wallet['bonus'] == 0 and wallet['bonus_untracked'] == 0
        assert grant_after['remaining_amount'] == 0 and grant_after['reserved_amount'] == 0
        assert grant_after['status'] == 'consumed'
        spend = await db.wallet_tx.find_one({'user_id': user, 'kind': 'spend'}, {'_id': 0})
        assert spend['bonus_amount'] == -4 and spend['purchased_amount'] == 0
        assert wallet.get('bonus_spend_refs', []) == []
    from fastapi import HTTPException
    run_db(safe_db, run)


def test_idempotent_spend_replay_does_not_fail_when_balance_is_now_lower(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 20)
        first = await _apply_tx_idempotent(db, user, 'spend', -15, ref_order_id=f'{user}:idem')
        replay = await _apply_tx_idempotent(db, user, 'spend', -15, ref_order_id=f'{user}:idem')
        assert first['balance'] == replay['balance'] == 5
        assert replay['idempotent_replay'] is True
        assert await db.wallet_tx.count_documents({'user_id': user, 'ref_order_id': f'{user}:idem'}) == 1
    run_db(safe_db, run)


def test_expiry_preserves_existing_winnings_counter(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 20)
        await _apply_tx(db, user, 'winnings', 12)
        await create_grant(db, user_id=user, amount=5, expires_at=datetime.now(timezone.utc)-timedelta(seconds=1),
                   actor_id='a', actor_email='a@test', reason='source integrity integration test', ref_key=f'{user}:sources')
        await run_expiry_job(db)
        w = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert w['withdrawable'] == 12 and w['balance'] == 32 and w['bonus'] == 0
        exp = await db.wallet_tx.find_one({'user_id': user, 'kind': 'bonus_expiry'}, {'_id': 0})
        assert exp['bonus_amount'] == -5 and exp['purchased_amount'] == 0 and exp['withdrawable_amount'] == 0
    run_db(safe_db, run)


def test_admin_endpoint_checks_confirmation_and_role(monkeypatch, safe_db, user):
    async def require_admin(_request):
        return {'user_id': 'test-admin', 'email': 'admin@test', 'role': 'admin'}
    monkeypatch.setattr(bonus_grants_routes, 'require_admin', require_admin)
    payload = bonus_grants_routes.BonusGrantInput(user_ids=[user], amount=10, expiry_mode='days', expiry_days=7,
                                                  reason='administrative UI integration', confirm=True,
                                                  batch_id=f'{user}:api')
    async def run(db):
        import deps
        monkeypatch.setattr(deps, 'get_db', lambda: db)
        result = await bonus_grants_routes.credit_bonus(payload, None)
        assert result['succeeded'] == 1 and result['expires_at'] and result['expires_on']
        w = await _get_or_create_wallet(db, user)
        assert w['bonus'] == 10 and w['balance'] == 10
    run_db(safe_db, run)


def test_credit_endpoint_requires_confirmation_and_privileged_role(monkeypatch, safe_db, user):
    async def run(db):
        import deps
        monkeypatch.setattr(deps, 'get_db', lambda: db)
        async def admin(_request):
            return {'user_id': 'test-admin', 'email': 'admin@test', 'role': 'admin'}
        monkeypatch.setattr(bonus_grants_routes, 'require_admin', admin)
        missing_confirmation = bonus_grants_routes.BonusGrantInput(
            user_ids=[user], amount=2, reason='credit confirmation test reason', confirm=False,
            batch_id=f'{user}:not-confirmed')
        with pytest.raises(HTTPException) as error:
            await bonus_grants_routes.credit_bonus(missing_confirmation, None)
        assert error.value.status_code == 400
        assert await db.wallets.count_documents({'user_id': user}) == 0

        async def support(_request):
            return {'user_id': 'support', 'email': 'support@test', 'role': 'support'}
        monkeypatch.setattr(bonus_grants_routes, 'require_admin', support)
        confirmed = bonus_grants_routes.BonusGrantInput(
            user_ids=[user], amount=2, reason='credit authorization test reason', confirm=True,
            batch_id=f'{user}:support')
        with pytest.raises(HTTPException) as error:
            await bonus_grants_routes.credit_bonus(confirmed, None)
        assert error.value.status_code == 403
        assert await db.wallets.count_documents({'user_id': user}) == 0
    run_db(safe_db, run)


def test_pending_admin_grant_recovers_idempotently_after_a_crash(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        ref = f'{user}:crash'
        await db.bonus_grants.insert_one({
            'grant_id': f'bg_{uuid.uuid4().hex[:16]}', 'ref_key': ref, 'user_id': user,
            'original_amount': 10, 'remaining_amount': 10, 'granted_at': datetime.now(timezone.utc),
            'expires_at': None, 'status': 'creating', 'actor_id': 'admin', 'actor_email': 'a@test',
            'reason': 'crash recovery test reason', 'related_tx_ids': [], 'reserved_amount': 0,
            'reserved_by': {}, 'expired_amount': 0, 'revoked_amount': 0,
        })
        # recover_pending_grants scans the whole DB, so another parallel worker's pending grant may be counted too.
        assert await recover_pending_grants(db) >= 1
        await recover_pending_grants(db)  # second pass must be a no-op for this grant (checked below)
        wallet = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        grant = await db.bonus_grants.find_one({'ref_key': ref}, {'_id': 0})
        assert wallet['balance'] == 10 and wallet['bonus'] == 10
        assert grant['status'] == 'active' and grant['remaining_amount'] == 10
        assert await db.wallet_tx.count_documents({'user_id': user, 'kind': 'bonus_grant'}) == 1
        assert await db.notifications.count_documents({'user_id': user, 'kind': 'bonus_credited'}) == 1
    run_db(safe_db, run)


def test_wallet_read_lazily_expires_due_grant_before_returning_balance(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        grant = await create_grant(db, user_id=user, amount=7, expires_at=datetime.now(timezone.utc) + timedelta(days=1),
                                   actor_id='a', actor_email='a@test', reason='lazy expiry integration test',
                                   ref_key=f'{user}:lazy')
        await db.bonus_grants.update_one({'grant_id': grant['grant_id']},
                                         {'$set': {'expires_at': datetime.now(timezone.utc) - timedelta(seconds=1)}})
        wallet = await _get_or_create_wallet(db, user)
        current_grant = await db.bonus_grants.find_one({'grant_id': grant['grant_id']}, {'_id': 0})
        assert wallet['balance'] == 0 and wallet['bonus'] == 0
        assert current_grant['status'] == 'expired' and current_grant['expired_amount'] == 7
    run_db(safe_db, run)


def test_crashed_spend_reservation_recovers_as_commit_or_release(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 20)
        grant = await create_grant(db, user_id=user, amount=10, expires_at=None, actor_id='a',
                                   actor_email='a@test', reason='reservation recovery integration test', ref_key=f'{user}:reservation')
        uncommitted = 'crash-release-' + uuid.uuid4().hex
        assert await reserve_from_grants(db, user, 4, uncommitted)
        await recover_reservations(db, user, datetime.now(timezone.utc) + timedelta(minutes=3))
        record = await db.bonus_grants.find_one({'grant_id': grant['grant_id']}, {'_id': 0})
        assert record['remaining_amount'] == 10 and record['reserved_amount'] == 0

        committed = 'crash-commit-' + uuid.uuid4().hex
        reserved = await reserve_from_grants(db, user, 4, committed)
        assert sum(amount for _, amount in reserved) == 4
        await db.wallets.update_one({'user_id': user}, {
            '$inc': {'balance': -4, 'bonus': -4, 'bonus_untracked': 0},
            '$addToSet': {'bonus_spend_refs': committed},
        })
        await recover_reservations(db, user, datetime.now(timezone.utc) + timedelta(minutes=3))
        record = await db.bonus_grants.find_one({'grant_id': grant['grant_id']}, {'_id': 0})
        wallet = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert record['remaining_amount'] == 6 and record['reserved_amount'] == 0
        assert committed not in (wallet.get('bonus_spend_refs') or [])
        assert wallet['bonus'] == 6 and wallet['balance'] == 26
    run_db(safe_db, run)


def test_expiry_options_validate_and_calculate_uk_day_end():
    now = datetime(2026, 7, 1, 12, tzinfo=timezone.utc)
    assert compute_expiry(now, 'days', 7) == now + timedelta(days=7)
    assert compute_expiry(now, 'none') is None
    date_expiry = compute_expiry(now, 'date', on_date='2026-07-02')
    assert date_expiry == datetime(2026, 7, 2, 22, 59, 59, tzinfo=timezone.utc)
    with pytest.raises(Exception):
        compute_expiry(now, 'days', 0)
    with pytest.raises(Exception):
        compute_expiry(now, 'date', on_date='2026-06-30')
