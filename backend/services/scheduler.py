"""Background scheduler that auto-draws contests whose end_date has passed."""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone

from services.draw_service import draw_contest
from services.world_championship_scheduler import tick_free_world

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

    # Free World Season 1 uses the same 60-second scheduler.
    # This does not create a second background task.
    try:
        await tick_free_world(
            db,
            now=now,
        )
    except Exception as e:  # noqa: BLE001
        log.exception(
            "[scheduler] Free World tick failed: %s",
            e,
        )

    # Bonus-token expiry: idempotent, also enforced lazily on wallet reads and spends.
    try:
        from services.bonus_grants import run_expiry_job
        result = await run_expiry_job(db, now=now)
        if result['expired'] or result['recovered'] or result['reminded']:
            log.info("[scheduler] bonus expiry: %s", result)
    except Exception as e:  # noqa: BLE001
        log.exception("[scheduler] bonus expiry failed: %s", e)

    try:
        from routers.influencer_routes import recover_claimed_influencer_invites
        recovered = await recover_claimed_influencer_invites(db)
        if recovered:
            log.info('[scheduler] recovered influencer invites: %s', recovered)
    except Exception as e:  # noqa: BLE001
        log.exception('[scheduler] influencer invite recovery failed: %s', e)

    try:
        from services.influencer_commissions import recover_pending_registration_commissions
        recovered = await recover_pending_registration_commissions(db, now=now)
        if recovered:
            log.info('[scheduler] recovered influencer registrations: %s', recovered)
    except Exception as e:  # noqa: BLE001
        log.exception('[scheduler] influencer registration recovery failed: %s', e)

    try:
        from routers.admin_alerts_routes import process_due_campaigns
        await process_due_campaigns(db, current_time=now)
    except Exception as e:  # noqa: BLE001
        log.exception('[scheduler] scheduled alert processing failed: %s', e)

    try:
        from services.push_delivery import process_web_push_outbox
        processed = await process_web_push_outbox(db, current_time=now)
        if processed:
            log.info('[scheduler] processed Web Push events: %s', processed)
    except Exception as e:  # noqa: BLE001
        log.exception('[scheduler] Web Push outbox processing failed: %s', e)

    try:
        from services.push_delivery import process_contest_lifecycle_alerts
        queued = await process_contest_lifecycle_alerts(db, current_time=now)
        if queued:
            log.info('[scheduler] queued contest Web Push reminders: %s', queued)
    except Exception as e:  # noqa: BLE001
        log.exception('[scheduler] contest Web Push lifecycle failed: %s', e)


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
