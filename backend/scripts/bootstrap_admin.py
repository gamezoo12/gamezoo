"""
Prize League — standalone Super Admin bootstrap.

Purpose: create (or reset) the first Super Admin directly against the
configured MongoDB. Uses the SAME sanitized DB name the FastAPI app uses
(via deps._sanitize_db_name), which prevents the classic "seed inserted
into `prize league`, runtime reads from `prize_league`" split-brain that
manifests on production as "invalid credentials".

Usage:
    python3 /app/backend/scripts/bootstrap_admin.py \
        --email admin@example.com \
        --password 'YourStrongPassword!' \
        --name 'Super Admin'

Idempotent: if the email already exists it is promoted to super_admin
and its password is reset to the provided value.
"""
from __future__ import annotations
import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from auth import hash_password  # noqa: E402
from counters import allocate_user_public_id, USER_PUBLIC_ID_START, USER_PUBLIC_ID_PREFIX  # noqa: E402
from deps import _sanitize_db_name  # noqa: E402
from models import User  # noqa: E402


async def bootstrap(email: str, password: str, name: str) -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
    mongo = os.environ['MONGO_URL']
    raw_db_name = os.environ.get('DB_NAME')
    db_name = _sanitize_db_name(raw_db_name)
    if raw_db_name and raw_db_name != db_name:
        print(f'[warn] DB_NAME {raw_db_name!r} sanitized to {db_name!r}')

    client = AsyncIOMotorClient(mongo)
    db = client[db_name]

    email = email.strip().lower()
    existing = await db.users.find_one({'email': email})

    if existing:
        await db.users.update_one(
            {'email': email},
            {'$set': {
                'role': 'super_admin',
                'password_hash': hash_password(password),
                'method': 'email',
                'suspended': False,
                'name': name or existing.get('name') or 'Super Admin',
                'must_change_password': False,
            }},
        )
        # Ensure public_id exists
        if not existing.get('public_id'):
            pid = f'{USER_PUBLIC_ID_PREFIX}{USER_PUBLIC_ID_START}'
            await db.users.update_one({'email': email}, {'$set': {'public_id': pid}})
        print(f'[ok] Promoted existing user {email} → super_admin (password reset).')
    else:
        public_id = await allocate_user_public_id(db)
        user = User(
            email=email,
            name=name.strip() or 'Super Admin',
            password_hash=hash_password(password),
            method='email',
            role='super_admin',
            public_id=public_id,
            terms_accepted_at=datetime.now(timezone.utc),
        )
        await db.users.insert_one(user.model_dump())
        print(f'[ok] Created new super_admin {email} ({public_id}).')

    # Ensure baseline indexes so app doesn't crash on cold starts.
    await db.users.create_index('email', unique=True)
    await db.users.create_index('public_id', unique=True, sparse=True)
    print(f'[ok] Indexes ensured on {db_name}.users')

    # Confirm the admin is actually visible.
    check = await db.users.find_one({'email': email}, {'_id': 0, 'email': 1, 'role': 1, 'public_id': 1})
    print(f'[verify] {check}')
    client.close()


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Bootstrap Prize League super admin')
    p.add_argument('--email', required=True)
    p.add_argument('--password', required=True)
    p.add_argument('--name', default='Super Admin')
    return p.parse_args()


if __name__ == '__main__':
    args = _parse_args()
    asyncio.run(bootstrap(args.email, args.password, args.name))
