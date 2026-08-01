"""
Shared runtime dependencies used by routers.

Existed originally as `server.db_ref()` — extracting to its own module removes
the circular `router → server → router` import graph.
"""
from __future__ import annotations
import logging
import os
import re
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

logger = logging.getLogger(__name__)


def _sanitize_db_name(raw: str | None) -> str:
    """MongoDB rejects database names containing space, slash, backslash,
    dot, quote, dollar, and null characters. In production we've seen ops
    accidentally paste values like ``prize league`` into the env-var UI —
    the pod then crash-loops with `InvalidName`, K8s liveness probes fail,
    and the whole deploy times out. Rather than take the whole app down for
    a whitespace typo we sanitize the value: strip surrounding whitespace,
    then replace any illegal character with an underscore. A very loud
    WARNING is logged so ops can see what was auto-corrected."""
    if not raw:
        return 'gamezoo'
    cleaned = raw.strip()
    # Illegal set per MongoDB manual for database names on all platforms.
    illegal = re.compile(r'[\s/\\.\"$\x00]')
    if illegal.search(cleaned):
        fixed = illegal.sub('_', cleaned)
        logger.warning(
            "DB_NAME contains illegal characters (%r). Auto-corrected to %r. "
            "Update the env-var to a clean name to silence this warning.",
            raw, fixed,
        )
        cleaned = fixed
    return cleaned or 'gamezoo'


_mongo_url = os.environ['MONGO_URL']
_client = AsyncIOMotorClient(_mongo_url)
_db = _client[_sanitize_db_name(os.environ.get('DB_NAME'))]


def get_db():
    """Return the shared motor Database handle."""
    return _db


def get_client():
    return _client


# Back-compat alias (some legacy code imports this name).
db_ref = get_db
