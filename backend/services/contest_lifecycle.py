"""Contest lifecycle: live -> closed (awaiting draw) when end_date passes -> drawn after the official draw."""
from datetime import datetime, timezone

OPEN = 'live'
AWAITING = 'closed'
DONE = ('drawn', 'archived', 'closed_no_entries')


def is_expired(c: dict) -> bool:
    end = c.get('end_date')
    if isinstance(end, str):
        try:
            end = datetime.fromisoformat(end.replace('Z', '+00:00'))
        except ValueError:
            return False
    if not isinstance(end, datetime):
        return False
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return end <= datetime.now(timezone.utc)


async def close_expired_contests(db) -> int:
    """Move every live contest whose end time has passed to 'closed' so no more entries are accepted."""
    now = datetime.now(timezone.utc)
    done = await db.draw_studio_plans.distinct('contest_id', {'status': 'completed'})
    await db.contests.update_many({'status': {'$in': [OPEN, AWAITING]}, '$or': [{'contest_id': {'$in': done}}, {'winners_published': True}]},
                                  {'$set': {'status': 'drawn', 'drawn_at': now}})
    ids = [c['contest_id'] async for c in db.contests.find({'status': OPEN}, {'_id': 0, 'contest_id': 1, 'end_date': 1}) if is_expired(c)]
    if not ids:
        return 0
    res = await db.contests.update_many({'contest_id': {'$in': ids}, 'status': OPEN}, {'$set': {'status': AWAITING, 'closed_at': now}})
    return res.modified_count


def prize_value(c: dict) -> float:
    """Total prize pool for draw budgeting: cash prize plus winning bonus tokens."""
    return round(float(c.get('prize_amount') or 0) + float(c.get('prize_bonus_tokens') or 0), 2)
