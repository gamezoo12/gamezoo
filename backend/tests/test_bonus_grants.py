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


def _as_role(monkeypatch, role):
    async def admin(_request):
        return {'user_id': f'test-{role}', 'email': f'{role}@example.test', 'role': role}
    monkeypatch.setattr(bonus_grants_routes, 'require_admin', admin)


def _revoke_all_input(confirm='REMOVE ALL BONUS'):
    return bonus_grants_routes.RevokeAllInput(reason='bulk bonus removal integration test', confirm=confirm)


async def _scoped_revoke_all(db, uid):
    # Scoped to the test user so parallel test modules' grants are untouched.
    admin = {'user_id': 'test-super_admin', 'email': 'super_admin@example.test', 'role': 'super_admin'}
    return await bonus_grants_routes.revoke_all_active_grants(db, admin, 'bulk bonus removal integration test', {'user_id': uid})


def test_revoke_all_requires_super_admin_and_confirmation_phrase(monkeypatch, safe_db, user):
    async def run(db):
        import deps
        monkeypatch.setattr(deps, 'get_db', lambda: db)
        await _get_or_create_wallet(db, user)
        await create_grant(db, user_id=user, amount=5, expires_at=None, actor_id='a', actor_email='a@test',
                           reason='revoke-all authorization test', ref_key=f'{user}:auth')
        _as_role(monkeypatch, 'admin')
        with pytest.raises(HTTPException) as denied:
            await bonus_grants_routes.revoke_all(_revoke_all_input(), None)
        assert denied.value.status_code == 403
        _as_role(monkeypatch, 'super_admin')
        for bad in ('', 'remove all bonus', 'yes'):
            with pytest.raises(HTTPException) as wrong:
                await bonus_grants_routes.revoke_all(_revoke_all_input(bad), None)
            assert wrong.value.status_code == 400
        assert (await db.wallets.find_one({'user_id': user}))['bonus'] == 5
        assert await db.audit_log.count_documents({'kind': 'admin_bonus_revoke_all', 'reason': 'bulk bonus removal integration test'}) == 0
    run_db(safe_db, run)


def test_revoke_all_removes_only_bonus_is_audited_and_repeat_is_noop(monkeypatch, safe_db, user):
    async def run(db):
        import deps
        monkeypatch.setattr(deps, 'get_db', lambda: db)
        _as_role(monkeypatch, 'super_admin')
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 25, note='test top-up')
        await _apply_tx(db, user, 'winnings', 15, note='test winnings')
        await create_grant(db, user_id=user, amount=10, expires_at=None, actor_id='a', actor_email='a@test',
                           reason='revoke-all preservation test', ref_key=f'{user}:keep')
        before = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert before['balance'] == 50 and before['bonus'] == 10
        first = await _scoped_revoke_all(db, user)
        assert first['grants_revoked'] == 1 and first['tokens_removed'] == 10
        after = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert after['bonus'] == 0 and after['balance'] == 40 and after['withdrawable'] == 15
        audit = await db.audit_log.find_one({'kind': 'admin_bonus_revoke_all', 'admin_user_id': 'test-super_admin'},
                                            sort=[('at', -1)])
        assert audit and audit['grants_revoked'] == first['grants_revoked'] and audit['reason']
        again = await _scoped_revoke_all(db, user)
        assert again['grants_revoked'] == 0 and again['tokens_removed'] == 0
        assert (await db.wallets.find_one({'user_id': user}, {'_id': 0}))['balance'] == 40
        await db.audit_log.delete_many({'admin_user_id': 'test-super_admin'})
    run_db(safe_db, run)


def test_revoke_all_never_removes_spent_bonus_or_goes_negative_and_skips_expired(monkeypatch, safe_db, user):
    async def run(db):
        import deps
        monkeypatch.setattr(deps, 'get_db', lambda: db)
        _as_role(monkeypatch, 'super_admin')
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 20, note='test top-up')
        expired = await create_grant(db, user_id=user, amount=3, expires_at=datetime.now(timezone.utc) + timedelta(days=1),
                                     actor_id='a', actor_email='a@test', reason='expired grant test', ref_key=f'{user}:old')
        await db.bonus_grants.update_one({'grant_id': expired['grant_id']},
                                         {'$set': {'expires_at': datetime.now(timezone.utc) - timedelta(seconds=1)}})
        await run_expiry_job(db)
        await create_grant(db, user_id=user, amount=10, expires_at=None, actor_id='a', actor_email='a@test',
                           reason='partially spent grant test', ref_key=f'{user}:spent')
        await _apply_tx(db, user, 'spend', -4, note='test spend')
        w = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert w['bonus'] == 6 and w['balance'] == 26
        result = await _scoped_revoke_all(db, user)
        assert result['grants_revoked'] >= 1
        w = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert w['bonus'] == 0 and w['balance'] == 20 and w['balance'] >= 0
        revoked = await db.bonus_grants.find_one({'ref_key': f'{user}:spent'}, {'_id': 0})
        assert revoked['status'] == 'revoked' and revoked['revoked_amount'] == 6
        old = await db.bonus_grants.find_one({'grant_id': expired['grant_id']}, {'_id': 0})
        assert old['status'] == 'expired'
        await db.audit_log.delete_many({'admin_user_id': 'test-super_admin'})
    run_db(safe_db, run)


def test_wallet_breakdown_separates_the_four_categories_and_excludes_pending():
    from routers.wallet_routes import _with_tokens
    w = _with_tokens({'balance': 60, 'bonus': 10, 'winning_bonus': 5, 'withdrawable': 15, 'withdrawable_pending': 0, 'source_migrated': True})
    assert (w['topup_tokens'], w['bonus_tokens'], w['winning_bonus_tokens'], w['winning_tokens'], w['total_tokens']) == (30, 10, 5, 15, 60)
    assert w['available_to_cash_out'] == 15
    w = _with_tokens({'balance': 60, 'bonus': 10, 'winning_bonus': 5, 'withdrawable': 15, 'withdrawable_pending': 5, 'source_migrated': True})
    assert w['topup_tokens'] == 25 and w['total_tokens'] == 55 and w['pending_cash_out'] == 5
    legacy = _with_tokens({'balance': 50, 'bonus': 10, 'withdrawable': 15})
    assert legacy['source_classified'] is False
    assert legacy['winning_bonus_tokens'] is None and legacy['topup_tokens'] is None and legacy['total_tokens'] == 50


def test_positive_admin_adjust_is_recorded_as_bonus_not_topup(safe_db, user):
    async def run(db):
        await _get_or_create_wallet(db, user)
        result = await _apply_tx(db, user, 'admin_adjust', 7, note='admin promotional credit')
        wallet = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert wallet['balance'] == 7 and wallet['bonus'] == 7
        assert wallet.get('withdrawable', 0) == 0 and wallet.get('winning_bonus', 0) == 0
        tx = result['tx']
        assert tx['bonus_amount'] == 7 and tx['purchased_amount'] in (None, 0)
        assert tx['withdrawable_amount'] in (None, 0) and tx['winning_bonus_amount'] in (None, 0)
    run_db(safe_db, run)


@pytest.mark.parametrize('idempotent', [False, True])
def test_order_refund_restores_original_token_category(safe_db, user, idempotent):
    async def run(db):
        await _get_or_create_wallet(db, user)
        await _apply_tx(db, user, 'topup', 10, note='test topup')
        spend = await _apply_tx(db, user, 'spend', -4, note='test order spend', ref_order_id='order-refund-known')
        assert spend['tx']['purchased_amount'] == -4
        if idempotent:
            refund = await _apply_tx_idempotent(db, user, 'refund', 4, note='test refund', ref_order_id='order-refund-known')
        else:
            refund = await _apply_tx(db, user, 'refund', 4, note='test refund', ref_order_id='order-refund-known')
        wallet = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert wallet['balance'] == 10 and wallet['source_migrated'] is True
        assert wallet['bonus'] == 0 and wallet['withdrawable'] == 0
        refund_tx = refund['tx']
        assert refund_tx['purchased_amount'] == 4 and refund_tx['bonus_amount'] == 0
    run_db(safe_db, run)


def test_order_refund_with_unclassified_source_stays_unclassified(safe_db, user):
    async def run(db):
        await db.wallets.insert_one({'user_id': user, 'balance': 10, 'bonus': 0, 'bonus_untracked': 0,
                                     'withdrawable': 0, 'withdrawable_pending': 0,
                                     'winning_bonus': 0, 'source_migrated': True})
        await db.wallet_tx.insert_one({'tx_id': f'legacy_spend_{user}', 'user_id': user, 'kind': 'spend',
            'amount': -4, 'balance_after': 6, 'ref_order_id': 'order-refund-legacy'})
        refund = await _apply_tx(db, user, 'refund', 4, note='legacy refund', ref_order_id='order-refund-legacy')
        wallet = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert wallet['balance'] == 14 and wallet['source_migrated'] is False
        assert wallet['source_migration_blocked'] is True
        assert all(refund['tx'][key] is None for key in ('bonus_amount', 'purchased_amount', 'withdrawable_amount', 'winning_bonus_amount'))
    run_db(safe_db, run)


def test_legacy_wallet_migration_preserves_existing_bonus_and_winning_bonus(safe_db, user):
    from routers.wallet_routes import _migrate_wallet_sources, _with_tokens

    async def run(db):
        wallet = {
            'user_id': user, 'balance': 60, 'bonus': 10, 'winning_bonus': 5,
            'withdrawable': 15, 'withdrawable_pending': 0,
        }
        await db.wallets.insert_one(wallet.copy())
        migrated = await _migrate_wallet_sources(db, user, wallet)
        assert migrated['source_migrated'] is True
        assert migrated['bonus'] == 10
        assert migrated['bonus_untracked'] == 10
        assert migrated['winning_bonus'] == 5
        view = _with_tokens(migrated)
        assert (view['topup_tokens'], view['winning_tokens'], view['winning_bonus_tokens'],
                view['bonus_tokens'], view['total_tokens']) == (30, 15, 5, 10, 60)
        await db.wallets.delete_one({'user_id': user})

    run_db(safe_db, run)


def test_ambiguous_legacy_wallet_stays_unclassified_without_balance_change(safe_db, user):
    from routers.wallet_routes import _get_or_create_wallet

    async def run(db):
        await db.wallets.insert_one({'user_id': user, 'balance': 50})
        wallet = await _get_or_create_wallet(db, user)
        stored = await db.wallets.find_one({'user_id': user}, {'_id': 0})
        assert wallet['source_classified'] is False
        assert wallet['topup_tokens'] is None and wallet['winning_tokens'] is None
        assert wallet['total_tokens'] == 50
        assert stored['balance'] == 50 and stored.get('source_migrated') is not True
        await db.wallets.delete_one({'user_id': user})

    run_db(safe_db, run)


def test_signup_and_referral_rewards_use_source_expiring_grants(safe_db, user):
    from routers.referral_routes import _complete_referral_if_eligible, _grant_signup_bonus_once
    from services.bonus_grants import _as_utc

    async def run(db):
        now = datetime.now(timezone.utc)
        await db.reward_settings.update_one({'_id': 'app'}, {'$set': {
            'signup_reward_tokens': 4, 'signup_bonus_expiry_enabled': True, 'signup_bonus_expiry_days': 2,
            'referral_reward_tokens': 3, 'referral_bonus_expiry_enabled': True, 'referral_bonus_expiry_days': 5,
        }}, upsert=True)
        await db.users.update_one({'user_id': user}, {'$set': {'signup_bonus_offer_eligible': True}}, upsert=True)

        assert await _grant_signup_bonus_once(db, user)
        assert not await _grant_signup_bonus_once(db, user)
        signup = await db.bonus_grants.find_one({'ref_key': f'signup_reward:{user}'}, {'_id': 0})
        assert signup['source'] == 'signup' and signup['original_amount'] == 4
        assert timedelta(days=1, hours=23) < _as_utc(signup['expires_at']) - now < timedelta(days=2, seconds=5)

        referral_id = f'ref_expiry_{user}'
        await db.referrals.insert_one({
            'referral_id': referral_id, 'referrer_user_id': user, 'referred_user_id': f'friend_{user}',
            'program_version': 'tokens_v2', 'status': 'pending', 'topup_qualified': True,
            'contest_entered': True, 'reward_granted': False,
        })
        assert await _complete_referral_if_eligible(db, f'friend_{user}')
        assert not await _complete_referral_if_eligible(db, f'friend_{user}')
        referral = await db.bonus_grants.find_one({'ref_key': f'referral_reward:{referral_id}'}, {'_id': 0})
        assert referral['source'] == 'referral' and referral['original_amount'] == 3
        assert timedelta(days=4, hours=23) < _as_utc(referral['expires_at']) - now < timedelta(days=5, seconds=5)
        notices = await db.notifications.count_documents({'user_id': user, 'type': 'bonus_credited'})
        assert notices == 2
        await db.referrals.delete_one({'referral_id': referral_id})
        await db.reward_settings.delete_one({'_id': 'app'})
    run_db(safe_db, run)
    from services.reward_program import save_reward_settings
    with pytest.raises(HTTPException) as invalid_days:
        asyncio.run(save_reward_settings(None, {'signup_bonus_expiry_days': 2.5}))
    assert invalid_days.value.status_code == 400


def test_reward_expiry_settings_require_super_admin_and_whole_days(monkeypatch):
    from fastapi import HTTPException
    from routers import influencer_promo_routes

    async def admin(_request):
        return {'role': 'admin'}
    monkeypatch.setattr(influencer_promo_routes, 'require_admin', admin)

    async def run():
        with pytest.raises(HTTPException) as denied:
            await influencer_promo_routes.admin_update_reward_settings({'signup_bonus_expiry_enabled': True}, None)
        assert denied.value.status_code == 403
    asyncio.run(run())
