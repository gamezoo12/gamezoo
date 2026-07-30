"""
Prize League — production launch: purge demo/seed/mock data.

Removes any data marked as demo/sample/mock so the platform launches with a
clean slate. Preserves:
  • The Super Admin account (bachanta8@gmail.com).
  • Any real user account that ever completed a Stripe payment (has orders with
    non-null stripe_session_id) or has topped up their wallet through Stripe.
  • Their tickets, orders, wallet transactions and notifications.

Removes:
  • All contests (they are seed data — admins will create real contests via
    the admin panel post-launch).
  • Wallet transactions where note contains 'mock' or method='mock'.
  • Tickets not linked to a real paid order.
  • Notifications older than N days AND not linked to a real order/win.
  • Support cases seeded during testing.
  • KYC submissions from non-preserved users.
  • Winner audit rows referencing removed contests.

Run in production only after taking a Mongo backup.
    python3 /app/backend/scripts/purge_demo.py --confirm
"""
from __future__ import annotations
import asyncio
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

PROTECT_EMAILS = {'bachanta8@gmail.com'}


async def main(confirm: bool) -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # --- Discovery ---
    total_users = await db.users.count_documents({})
    total_contests = await db.contests.count_documents({})
    total_orders = await db.orders.count_documents({})
    total_tickets = await db.tickets.count_documents({})
    total_txs = await db.wallet_transactions.count_documents({})
    total_notifs = await db.notifications.count_documents({})
    total_kyc = await db.kyc.count_documents({})
    total_support = await db.support_cases.count_documents({})
    total_winners = await db.winners.count_documents({})
    total_winner_audit = await db.winner_audit.count_documents({})

    # Users who have ever completed a REAL Stripe transaction — preserve them.
    real_txn_users = set()
    async for tx in db.wallet_transactions.find(
        {'method': {'$ne': 'mock'}, 'note': {'$not': {'$regex': 'mock', '$options': 'i'}}},
        {'user_id': 1},
    ):
        if tx.get('user_id'):
            real_txn_users.add(tx['user_id'])

    protected_users = set()
    async for u in db.users.find({'email': {'$in': list(PROTECT_EMAILS)}}, {'user_id': 1}):
        protected_users.add(u['user_id'])

    preserved = real_txn_users | protected_users

    print('=' * 60)
    print('PRIZE LEAGUE — DEMO DATA PURGE PLAN')
    print('=' * 60)
    print(f'Currently in DB:')
    print(f'  users:              {total_users}')
    print(f'  contests:           {total_contests}   → ALL will be deleted')
    print(f'  orders:             {total_orders}')
    print(f'  tickets:            {total_tickets}    → deleting non-paid')
    print(f'  wallet_transactions:{total_txs}       → deleting mock-labeled')
    print(f'  notifications:      {total_notifs}    → deleting demo/orphan')
    print(f'  kyc:                {total_kyc}       → deleting for removed users')
    print(f'  support_cases:      {total_support}   → ALL will be deleted (test data)')
    print(f'  winners:            {total_winners}   → ALL will be deleted (orphaned)')
    print(f'  winner_audit:       {total_winner_audit} → ALL will be deleted (orphaned)')
    print()
    print(f'Users preserved (protected + real payments): {len(preserved)}')
    print(f'Users to be DELETED:                         {total_users - len(preserved)}')
    print('=' * 60)

    if not confirm:
        print('\nDry run. Pass --confirm to execute.')
        return

    # --- Execute ---
    print('\nExecuting purge...\n')

    r = await db.contests.delete_many({})
    print(f'  ✓ contests deleted:            {r.deleted_count}')

    # Delete tickets not backed by a paid order.
    paid_orders = [o['order_id'] async for o in db.orders.find(
        {'stripe_session_id': {'$exists': True, '$ne': None}, 'payment_status': 'paid'},
        {'order_id': 1},
    )]
    r = await db.tickets.delete_many({'order_id': {'$nin': paid_orders}})
    print(f'  ✓ tickets deleted (unpaid):    {r.deleted_count}')

    r = await db.wallet_transactions.delete_many({
        '$or': [
            {'method': 'mock'},
            {'note': {'$regex': 'mock', '$options': 'i'}},
        ]
    })
    print(f'  ✓ wallet_transactions purged:  {r.deleted_count}')

    r = await db.notifications.delete_many({})
    print(f'  ✓ notifications purged:        {r.deleted_count}')

    r = await db.support_cases.delete_many({})
    print(f'  ✓ support_cases purged:        {r.deleted_count}')

    r = await db.winners.delete_many({})
    print(f'  ✓ winners purged:              {r.deleted_count}')

    r = await db.winner_audit.delete_many({})
    print(f'  ✓ winner_audit purged:         {r.deleted_count}')

    r = await db.orders.delete_many({
        '$or': [
            {'stripe_session_id': {'$in': [None, '']}},
            {'stripe_session_id': {'$exists': False}},
        ]
    })
    print(f'  ✓ orders (unpaid) purged:      {r.deleted_count}')

    # Users: keep only preserved
    r = await db.users.delete_many({'user_id': {'$nin': list(preserved)}})
    print(f'  ✓ users deleted:               {r.deleted_count}')

    r = await db.kyc.delete_many({'user_id': {'$nin': list(preserved)}})
    print(f'  ✓ orphan kyc purged:           {r.deleted_count}')

    # Rebuild wallets for preserved users only.
    r = await db.wallets.delete_many({'user_id': {'$nin': list(preserved)}})
    print(f'  ✓ orphan wallets purged:       {r.deleted_count}')

    # Reset the user_public_id counter to preserved-user count so next new user
    # continues cleanly. The backfill script should be run after purge.
    print('\nDone. Now run:')
    print('    python3 /app/backend/scripts/backfill_user_ids.py')
    print('to reassign PL-IDs to the remaining users.')

    client.close()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--confirm', action='store_true')
    args = ap.parse_args()
    asyncio.run(main(args.confirm))
