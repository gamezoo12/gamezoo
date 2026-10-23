"""VAPID Web Push delivery helpers shared by notifications and campaigns."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from pywebpush import WebPushException, webpush

log = logging.getLogger(__name__)


def _vapid_config() -> tuple[str, str, str] | None:
    public_key = os.getenv('VAPID_PUBLIC_KEY', '').strip()
    private_key = os.getenv('VAPID_PRIVATE_KEY', '').strip()
    subject = os.getenv('VAPID_SUBJECT', '').strip()
    if not (public_key and private_key and subject.startswith('mailto:')):
        return None
    return public_key, private_key, subject


def public_vapid_config() -> dict[str, Any]:
    config = _vapid_config()
    if not config:
        return {'available': False, 'public_key': None}
    return {'available': True, 'public_key': config[0]}


def _send(subscription: dict, payload: dict, private_key: str, subject: str) -> None:
    webpush(
        subscription_info={
            'endpoint': subscription['endpoint'],
            'keys': subscription['keys'],
        },
        data=json.dumps(payload, separators=(',', ':')),
        vapid_private_key=private_key,
        vapid_claims={'sub': subject},
        ttl=3600,
        timeout=5,
    )


async def send_web_push_to_user(
    db,
    user_id: str,
    payload: dict,
    *,
    marketing: bool = False,
) -> dict[str, Any]:
    """Send to every active device, honoring separate push/marketing consent."""
    user = await db.users.find_one(
        {'user_id': user_id},
        {'_id': 0, 'web_push_enabled': 1, 'web_push_marketing_consent': 1},
    )
    if not user or user.get('web_push_enabled') is not True:
        return {'status': 'skipped', 'delivered': 0, 'reason': 'Web Push is disabled'}
    if marketing and user.get('web_push_marketing_consent') is not True:
        return {'status': 'skipped', 'delivered': 0, 'reason': 'Marketing Push consent is not enabled'}

    config = _vapid_config()
    if not config:
        return {'status': 'skipped', 'delivered': 0, 'reason': 'VAPID is not configured'}

    subscriptions = await db.web_push_subscriptions.find(
        {'user_id': user_id, 'active': True},
    ).to_list(100)
    if not subscriptions:
        return {'status': 'skipped', 'delivered': 0, 'reason': 'No active Web Push devices'}

    _, private_key, subject = config
    delivered = 0
    failed = 0
    removed = 0
    for subscription in subscriptions:
        try:
            await asyncio.to_thread(_send, subscription, payload, private_key, subject)
            delivered += 1
        except WebPushException as exc:
            status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
            if status_code in (404, 410):
                await db.web_push_subscriptions.delete_one({'_id': subscription['_id']})
                removed += 1
            else:
                failed += 1
                log.warning('Web Push delivery failed subscription=%s status=%s', subscription.get('_id'), status_code)
        except Exception:
            failed += 1
            log.exception('Web Push delivery failed subscription=%s', subscription.get('_id'))

    status = 'sent' if delivered else ('failed' if failed else 'skipped')
    reason = '' if delivered else ('All Web Push devices failed' if failed else 'Expired Web Push devices were removed')
    return {'status': status, 'delivered': delivered, 'failed': failed, 'removed': removed, 'reason': reason}


async def send_notification_push(db, notification: dict) -> dict[str, Any]:
    """Deliver an existing in-app notification as a Web Push event."""
    return await send_web_push_to_user(
        db,
        notification['user_id'],
        {
            'event_id': notification['notification_id'],
            'title': notification.get('title') or 'Prize League',
            'body': notification.get('body') or '',
            'url': notification.get('target_url') or '/my-account/notifications',
        },
    )


def _notification_url(kind: str, contest_id: str | None = None) -> str:
    if kind in {'topup_success', 'bonus_expired', 'bonus_expiring', 'influencer_bonus'}:
        return '/my-account/wallet'
    if kind in {'purchase_success', 'tickets_confirmed'}:
        return '/my-account/tickets'
    if kind in {'winner_alert', 'draw_result'}:
        return '/my-account/winnings'
    if kind in {'support_reply', 'support_status'}:
        return '/my-account/support'
    if kind.startswith('influencer_commission_'):
        return '/influencer'
    if contest_id:
        return f'/competition/{quote(str(contest_id), safe="")}'
    return '/my-account/notifications'


def _as_utc(value):
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def queue_notification_event(
    db,
    *,
    user_id: str,
    kind: str,
    title: str,
    body: str,
    event_id: str | None = None,
    contest_id: str | None = None,
    ref_order_id: str | None = None,
    ref_tx_id: str | None = None,
    ref_ticket_id: str | None = None,
    target_url: str | None = None,
    marketing: bool = False,
) -> bool:
    """Create an outbox row keyed by a stable business event, never random retry IDs."""
    if not _vapid_config() or not user_id:
        return False
    event_ref = event_id or ref_tx_id or ref_order_id or ref_ticket_id or contest_id
    if not event_ref:
        return False
    event_key = hashlib.sha256(f'{user_id}|{kind}|{event_ref}'.encode('utf-8')).hexdigest()
    now = datetime.now(timezone.utc)
    await db.web_push_outbox.update_one(
        {'_id': event_key},
        {'$setOnInsert': {
            'user_id': user_id,
            'event_id': event_key,
            'payload': {
                'event_id': event_key,
                'title': title,
                'body': body,
                'url': target_url or _notification_url(kind, contest_id),
            },
            'marketing': bool(marketing),
            'status': 'pending',
            'attempts': 0,
            'created_at': now,
            'updated_at': now,
        }},
        upsert=True,
    )
    return True


async def process_web_push_outbox(db, current_time=None, limit: int = 100) -> int:
    """Atomically claim and deliver pending business-event pushes."""
    from pymongo import ReturnDocument

    if not _vapid_config():
        return 0
    current_time = current_time or datetime.now(timezone.utc)
    reminder_horizon = current_time + timedelta(hours=1)
    await db.web_push_outbox.update_many(
        {'status': 'processing', 'claimed_at': {'$lte': current_time - timedelta(minutes=5)}},
        {'$set': {'status': 'pending', 'updated_at': current_time}},
    )
    processed = 0
    for _ in range(max(1, min(int(limit), 500))):
        row = await db.web_push_outbox.find_one_and_update(
            {'status': 'pending', '$or': [
                {'next_attempt_at': {'$exists': False}},
                {'next_attempt_at': {'$lte': current_time}},
            ]},
            {'$set': {'status': 'processing', 'claimed_at': current_time, 'updated_at': current_time},
             '$inc': {'attempts': 1}},
            sort=[('created_at', 1)],
            return_document=ReturnDocument.AFTER,
        )
        if not row:
            break
        try:
            result = await send_web_push_to_user(
                db, row['user_id'], row['payload'], marketing=bool(row.get('marketing')),
            )
            attempts = int(row.get('attempts') or 1)
            retry = result['status'] == 'failed' and attempts < 5
            update = {
                'status': 'pending' if retry else result['status'],
                'reason': result.get('reason', ''),
                'delivered_devices': result.get('delivered', 0),
                'updated_at': current_time,
            }
            if retry:
                update['next_attempt_at'] = current_time + timedelta(seconds=min(3600, 30 * (2 ** (attempts - 1))))
            else:
                update['next_attempt_at'] = None
            await db.web_push_outbox.update_one(
                {'_id': row['_id'], 'status': 'processing'}, {'$set': update},
            )
        except Exception as exc:
            log.exception('Web Push outbox delivery failed event=%s', row.get('event_id'))
            await db.web_push_outbox.update_one(
                {'_id': row['_id'], 'status': 'processing'},
                {'$set': {'status': 'pending' if int(row.get('attempts') or 1) < 5 else 'failed',
                          'reason': type(exc).__name__, 'updated_at': current_time,
                          'next_attempt_at': current_time + timedelta(seconds=30)}},
            )
        processed += 1
    return processed

async def _queue_marketing_announcement(db, *, event_id: str, title: str, body: str, target_url: str):
    if not _vapid_config():
        return 0
    users = await db.users.find(
        {'web_push_enabled': True, 'web_push_marketing_consent': True},
        {'_id': 0, 'user_id': 1},
    ).limit(10000).to_list(10000)
    for user in users:
        await queue_notification_event(
            db, user_id=user['user_id'], kind='new_contest', title=title, body=body,
            event_id=event_id, target_url=target_url, marketing=True,
        )
    return len(users)

async def announce_new_contest(db, contest: dict) -> int:
    contest_id = str(contest.get('contest_id') or '')
    if not contest_id:
        return 0
    return await _queue_marketing_announcement(
        db,
        event_id=f'new-contest:{contest_id}',
        title=f"New contest: {contest.get('title') or 'Prize League'}",
        body='A new contest is available to enter.',
        target_url=f"/competition/{quote(str(contest.get('slug') or contest_id), safe='')}",
    )

async def process_contest_lifecycle_alerts(db, current_time=None) -> int:
    """Queue participant start/end alerts and Free World challenge transitions."""
    if not _vapid_config():
        return 0
    current_time = current_time or datetime.now(timezone.utc)
    await db.app_settings.update_one(
        {'key': 'web_push_lifecycle_cutoff'},
        {'$setOnInsert': {'key': 'web_push_lifecycle_cutoff', 'value': current_time}},
        upsert=True,
    )
    cutoff_doc = await db.app_settings.find_one({'key': 'web_push_lifecycle_cutoff'}, {'_id': 0, 'value': 1})
    cutoff = cutoff_doc.get('value', current_time) if cutoff_doc else current_time
    queued = 0
    paid_due = await db.contests.find({
        'status': 'live',
        '$or': [
            {'start_alert_queued': {'$ne': True}, 'open_date': {'$gte': cutoff, '$lte': current_time}},
            {'start_alert_queued': {'$ne': True}, 'start_date': {'$gte': cutoff, '$lte': current_time}},
            {'end_alert_queued': {'$ne': True}, 'end_date': {'$gte': current_time, '$lte': reminder_horizon}},
        ],
    }, {'_id': 0}).limit(500).to_list(500)

    for contest in paid_due:
        contest_id = contest.get('contest_id')
        if not contest_id:
            continue
        start_time = _as_utc(contest.get('open_date') or contest.get('start_date'))
        start_due = (
            contest.get('status') == 'live'
            and start_time is not None
            and cutoff <= start_time <= current_time
            and contest.get('start_alert_queued') is not True
        )
        end_time = _as_utc(contest.get('end_date'))
        end_due = end_time is not None and current_time <= end_time <= reminder_horizon and contest.get('end_alert_queued') is not True
        event_kind = 'contest_start' if start_due else 'contest_ending' if end_due else None
        if not event_kind:
            continue
        event_key = f'{event_kind}:{contest_id}'
        user_ids = await db.tickets.distinct('user_id', {'contest_id': contest_id, 'user_id': {'$type': 'string'}})
        for user_id in user_ids:
            await queue_notification_event(
                db, user_id=user_id, kind=event_kind,
                title='Contest is starting' if event_kind == 'contest_start' else 'Contest is ending',
                body=f"{contest.get('title') or 'Your contest'} is {'now open' if event_kind == 'contest_start' else 'ending within an hour'}.",
                event_id=event_key, contest_id=contest_id,
                target_url=f"/competition/{quote(str(contest.get('slug') or contest_id), safe='')}",
            )
            queued += 1
        marker = 'start_alert_queued' if event_kind == 'contest_start' else 'end_alert_queued'
        await db.contests.update_one({'contest_id': contest_id, marker: {'$ne': True}}, {'$set': {marker: True}})

    world_due = await db.world_global_contests.find({
        'season_id': 'season-1',
        '$or': [
            {'world_push_start_queued': {'$ne': True}, 'start_at': {'$gte': cutoff, '$lte': current_time}},
            {'world_push_end_queued': {'$ne': True}, 'end_at': {'$gte': current_time, '$lte': reminder_horizon}},
        ],
    }, {'_id': 0, 'contest_number': 1, 'start_at': 1, 'end_at': 1,
        'world_push_start_queued': 1, 'world_push_end_queued': 1}).limit(100).to_list(100)
    for contest in world_due:
        contest_number = contest.get('contest_number')
        start_time = _as_utc(contest.get('start_at'))
        end_time = _as_utc(contest.get('end_at'))
        start_due = start_time is not None and cutoff <= start_time <= current_time and contest.get('world_push_start_queued') is not True
        end_due = end_time is not None and current_time <= end_time <= reminder_horizon and contest.get('world_push_end_queued') is not True
        event_kind = 'free_world_challenge_start' if start_due else 'free_world_challenge_end' if end_due else None
        if not event_kind or not contest_number:
            continue
        rows = await db.world_progress.find(
            {'champion_stage': contest_number}, {'_id': 0, 'user_id': 1},
        ).limit(10000).to_list(10000)
        for row in rows:
            if row.get('user_id'):
                await queue_notification_event(
                    db, user_id=row['user_id'], kind=event_kind,
                    title='Free World challenge is open' if start_due else 'Free World challenge has closed',
                    body=f'Championship {contest_number} is now available.' if start_due else f'Championship {contest_number} is ending within an hour.',
                    event_id=f'{event_kind}:{contest_number}',
                    target_url='/choose-world',
                )
                queued += 1
        marker = 'world_push_start_queued' if start_due else 'world_push_end_queued'
        await db.world_global_contests.update_one(
            {'season_id': 'season-1', 'contest_number': contest_number, marker: {'$ne': True}},
            {'$set': {marker: True}},
        )
    return queued
