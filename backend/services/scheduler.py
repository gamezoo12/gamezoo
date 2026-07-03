"""Background scheduler that auto-draws contests whose end_date has passed."""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone

from services.draw_service import draw_contest

log = logging.getLogger('gz.scheduler')
_TASK: asyncio.Task | None = None
_INTERVAL_SECONDS = 60
_running = False


async def _tick(db):
    now = datetime.now(timezone.utc)
    due = await db.contests.find(
        {'status': 'live', 'end_date': {'$lte': now}},
        {'_id': 0, 'contest_id': 1, 'title': 1},
    ).to_list(100)
    for c in due:
        try:
            result = await draw_contest(db, c['contest_id'])
            log.info("[scheduler] contest=%s -> %s", c['contest_id'], result)
        except Exception as e:  # noqa: BLE001
            log.exception("[scheduler] draw failed for %s: %s", c['contest_id'], e)


async def _loop(db):
    global _running
    _running = True
    log.info("[scheduler] started; interval=%ss", _INTERVAL_SECONDS)
    while _running:
        try:
            await _tick(db)
        except Exception as e:  # noqa: BLE001
            log.exception("[scheduler] tick error: %s", e)
        await asyncio.sleep(_INTERVAL_SECONDS)


def start(db):
    global _TASK
    if _TASK and not _TASK.done():
        return
    _TASK = asyncio.create_task(_loop(db))


def stop():
    global _running, _TASK
    _running = False
    if _TASK:
        _TASK.cancel()
        _TASK = None
