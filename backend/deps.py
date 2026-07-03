"""
Shared runtime dependencies used by routers.

Existed originally as `server.db_ref()` — extracting to its own module removes
the circular `router → server → router` import graph.
"""
from __future__ import annotations
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

_mongo_url = os.environ['MONGO_URL']
_client = AsyncIOMotorClient(_mongo_url)
_db = _client[os.environ.get('DB_NAME', 'gamezoo')]


def get_db():
    """Return the shared motor Database handle."""
    return _db


def get_client():
    return _client


# Back-compat alias (some legacy code imports this name).
db_ref = get_db
