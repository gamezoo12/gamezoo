"""
Prize League — backfill sequential PLxxxxx public User IDs.

Idempotent: only assigns to users missing `public_id`.
Rules:
  1. bachanta8@gmail.com → PL10000 (Super Admin)
  2. All other users, sorted by created_at ascending → PL10001, PL10002, ...
  3. Sets counter to (last allocated) so new registrations continue the sequence.
  4. Forces `must_change_password=True` on the Super Admin account.
  5. Ensures Super Admin `role='super_admin'` and unsuspended.

Run:  python3 /app/backend/scripts/backfill_user_ids.py
"""
from __future__ import annotations
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from counters import (  # noqa: E402
    USER_PUBLIC_ID_SEQ,
    USER_PUBLIC_ID_PREFIX,
    USER_PUBLIC_ID_START,
)

SUPER_ADMIN_EMAIL = 'bachanta8@gmail.com'


async def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
    mongo = os.environ['MONGO_URL']
    dbname = os.environ['DB_NAME']
    client = AsyncIOMotorClient(mongo)
    db = client[dbname]

    # 1. Super Admin: PL10000
    sa = await db.users.find_one({'email': SUPER_ADMIN_EMAIL})
    if not sa:
        print(f'[warn] Super Admin {SUPER_ADMIN_EMAIL} not found — create it first via seed.')
    else:
        await db.users.update_one(
            {'email': SUPER_ADMIN_EMAIL},
            {'$set': {
                'public_id': f'{USER_PUBLIC_ID_PREFIX}{USER_PUBLIC_ID_START}',
                'role': 'super_admin',
                'suspended': False,
                'must_change_password': True,
            }},
        )
        print(f'[ok] {SUPER_ADMIN_EMAIL} → PL{USER_PUBLIC_ID_START} (super_admin, must_change_password)')

    # 2. All other users lacking public_id — assign sequentially.
    cursor = db.users.find(
        {'email': {'$ne': SUPER_ADMIN_EMAIL}, 'public_id': {'$in': [None, '']}},
        {'user_id': 1, 'email': 1, 'created_at': 1},
    ).sort('created_at', 1)

    next_num = USER_PUBLIC_ID_START + 1
    assigned = 0
    async for u in cursor:
        # Skip if it somehow got a public_id via a concurrent path
        current = await db.users.find_one({'user_id': u['user_id']}, {'public_id': 1})
        if current and current.get('public_id'):
            continue
        pid = f'{USER_PUBLIC_ID_PREFIX}{next_num}'
        await db.users.update_one(
            {'user_id': u['user_id']},
            {'$set': {'public_id': pid}},
        )
        assigned += 1
        next_num += 1

    # 3. Sync the counter forward so new registrations continue from here.
    last_num = next_num - 1
    await db.counters.update_one(
        {'_id': USER_PUBLIC_ID_SEQ},
        {'$set': {'seq': last_num - USER_PUBLIC_ID_START + 1}},
        upsert=True,
    )
    print(f'[ok] Assigned {assigned} sequential IDs. Counter now at {last_num}. Next new user → PL{last_num + 1}')

    client.close()


if __name__ == '__main__':
    asyncio.run(main())
