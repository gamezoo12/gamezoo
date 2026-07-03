"""
Per-action handlers for the Meera assistant.

The previous implementation packed 15+ action types into one 217-line function
with cyclomatic complexity 68. Each handler here is a small, focused unit that
takes `(db, action_dict)` and returns a result dict. `_execute_actions` in
`routers/meera_routes.py` just dispatches by `type`.

Every handler:
- Never raises for "expected" errors (returns `{'ok': False, 'error': ...}`)
- Only bubbles unexpected exceptions (caught by the dispatcher)
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets

from models import Contest, SkillQuestion, Winner

# Shared question bank – kept small; expanded by seed.py's QBANK if needed.
QBANK = [
    ('What is 12 + 7?', ['17', '19', '21', '23'], '19', 'math'),
    ('What is 8 × 6?', ['42', '46', '48', '54'], '48', 'math'),
    ('What is 100 ÷ 4?', ['20', '25', '30', '40'], '25', 'math'),
    ('What is 15 - 8?', ['5', '6', '7', '8'], '7', 'math'),
    ('What is 9 × 9?', ['72', '81', '89', '99'], '81', 'math'),
    ('Capital city of France?', ['Rome', 'Madrid', 'Paris', 'Berlin'], 'Paris', 'trivia'),
    ('Which planet is closest to the Sun?', ['Venus', 'Mercury', 'Earth', 'Mars'], 'Mercury', 'trivia'),
    ('How many continents are there?', ['5', '6', '7', '8'], '7', 'trivia'),
    ('Who painted the Mona Lisa?', ['Van Gogh', 'Picasso', 'Da Vinci', 'Monet'], 'Da Vinci', 'trivia'),
    ('What colour do you get by mixing red + white?', ['Purple', 'Pink', 'Orange', 'Brown'], 'Pink', 'trivia'),
    ('How many sides does a hexagon have?', ['5', '6', '7', '8'], '6', 'trivia'),
    ('Largest ocean on Earth?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 'Pacific', 'trivia'),
    ('Which word means "happy"?', ['Gloomy', 'Joyful', 'Bitter', 'Weary'], 'Joyful', 'word'),
    ('Opposite of "hot"?', ['Warm', 'Cool', 'Cold', 'Icy'], 'Cold', 'word'),
    ('What is 25% of 200?', ['25', '40', '50', '75'], '50', 'math'),
]

DEFAULT_IMAGES = [
    'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/15633962/pexels-photo-15633962.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/19240616/pexels-photo-19240616.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/9462148/pexels-photo-9462148.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/973406/pexels-photo-973406.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/27064826/pexels-photo-27064826.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
]

VALID_ROLES = ('user', 'admin', 'super_admin', 'operator', 'support')


# ---------- helpers ----------
async def _find_contest(db, key: str) -> Optional[dict]:
    if not key:
        return None
    doc = await db.contests.find_one({'slug': key}, {'_id': 0})
    if doc:
        return doc
    return await db.contests.find_one({'contest_id': key}, {'_id': 0})


async def _find_user(db, key: str) -> Optional[dict]:
    key = (key or '').lower()
    if not key:
        return None
    return await db.users.find_one({'$or': [{'email': key}, {'user_id': key}]}, {'_id': 0})


def _slug_for(title: str, i: int) -> str:
    import re
    base = re.sub(r'[^a-z0-9]+', '-', (title or 'contest').lower()).strip('-')[:40]
    return f"{base}-{secrets.token_hex(3)}-{i}"


# ---------- action handlers ----------
async def handle_create_contests(db, a: dict) -> dict:
    count = max(1, min(int(a.get('count', 1)), 200))
    prize = float(a.get('prize_amount', 100))
    tickets = int(a.get('tickets_total', 150))
    duration = int(a.get('duration_days', 7))
    title = a.get('title') or f"Win £{int(prize)} Cash"
    category = a.get('category') or ('jackpot' if prize >= 250 else 'prize-draws')
    tag_map = {'jackpot': 'Jackpot', 'instant-wins': 'Instant Wins', 'prize-draws': 'Prize Draws', 'new-games': 'New Game'}
    tag = tag_map.get(category, 'Prize Draws')
    price = float(a.get('ticket_price', 1))
    status = a.get('status', 'draft')
    if status not in ('draft', 'live'):
        status = 'draft'

    created = []
    for i in range(count):
        q = QBANK[secrets.randbelow(len(QBANK))]
        c = Contest(
            slug=_slug_for(title, i),
            title=f"{title}" + (f" #{i + 1}" if count > 1 else ''),
            subtitle=f"£{int(prize)} cash prize",
            category=category,
            tag=tag,
            price=price,
            tickets_total=tickets,
            prize_amount=prize,
            end_date=(datetime.now(timezone.utc) + timedelta(days=duration)).replace(hour=21, minute=0, second=0, microsecond=0),
            image=DEFAULT_IMAGES[i % len(DEFAULT_IMAGES)],
            jackpot=prize >= 250,
            featured=False,
            skill_question=SkillQuestion(q=q[0], options=q[1], answer=q[2], type=q[3]),
            status=status,
        )
        await db.contests.insert_one(c.model_dump())
        created.append({'contest_id': c.contest_id, 'slug': c.slug, 'title': c.title, 'status': c.status})
    return {'action': 'create_contests', 'ok': True, 'count': len(created), 'created': created}


async def handle_update_contest(db, a: dict) -> dict:
    c = await _find_contest(db, a.get('id_or_slug') or '')
    if not c:
        return {'action': 'update_contest', 'ok': False, 'error': f'Contest not found: {a.get("id_or_slug")}'}
    updates = a.get('updates') or {}
    setter: dict = {}
    for k, v in updates.items():
        if k == 'end_date_days_from_now':
            setter['end_date'] = (datetime.now(timezone.utc) + timedelta(days=int(v))).replace(hour=21, minute=0, second=0, microsecond=0)
        elif k in {'title', 'subtitle', 'category', 'status', 'tag', 'image'}:
            setter[k] = v
        elif k in {'prize_amount', 'ticket_price', 'price'}:
            setter['price' if k == 'ticket_price' else k] = float(v)
        elif k == 'tickets_total':
            setter[k] = int(v)
    if setter:
        await db.contests.update_one({'contest_id': c['contest_id']}, {'$set': setter})
    return {'action': 'update_contest', 'ok': True, 'contest_id': c['contest_id'], 'updates': setter}


async def handle_delete_contest(db, a: dict) -> dict:
    c = await _find_contest(db, a.get('id_or_slug') or '')
    if not c:
        return {'action': 'delete_contest', 'ok': False, 'error': f'Not found: {a.get("id_or_slug")}'}
    await db.contests.delete_one({'contest_id': c['contest_id']})
    await db.tickets.delete_many({'contest_id': c['contest_id']})
    return {'action': 'delete_contest', 'ok': True, 'contest_id': c['contest_id']}


async def handle_delete_all_drafts(db, a: dict) -> dict:
    r = await db.contests.delete_many({'status': 'draft'})
    return {'action': 'delete_all_drafts', 'ok': True, 'deleted': r.deleted_count}


async def _set_contest_status(db, a: dict, status: str, action_name: str) -> dict:
    c = await _find_contest(db, a.get('id_or_slug') or '')
    if not c:
        return {'action': action_name, 'ok': False, 'error': f'Not found: {a.get("id_or_slug")}'}
    await db.contests.update_one({'contest_id': c['contest_id']}, {'$set': {'status': status}})
    return {'action': action_name, 'ok': True, 'contest_id': c['contest_id']}


async def handle_launch_contest(db, a: dict) -> dict:
    return await _set_contest_status(db, a, 'live', 'launch_contest')


async def handle_launch_all_drafts(db, a: dict) -> dict:
    r = await db.contests.update_many({'status': 'draft'}, {'$set': {'status': 'live'}})
    return {'action': 'launch_all_drafts', 'ok': True, 'launched': r.modified_count}


async def handle_pause_contest(db, a: dict) -> dict:
    return await _set_contest_status(db, a, 'draft', 'pause_contest')


async def handle_draw_winner(db, a: dict) -> dict:
    c = await _find_contest(db, a.get('id_or_slug') or '')
    if not c:
        return {'action': 'draw_winner', 'ok': False, 'error': f'Not found: {a.get("id_or_slug")}'}
    tickets = await db.tickets.find({'contest_id': c['contest_id']}, {'_id': 0}).to_list(100000)
    if not tickets:
        return {'action': 'draw_winner', 'ok': False, 'error': 'No tickets sold'}
    chosen = secrets.choice(tickets)
    user = await db.users.find_one({'user_id': chosen['user_id']}, {'_id': 0})
    w = Winner(
        contest_id=c['contest_id'],
        user_id=chosen['user_id'],
        user_name=user['name'] if user else 'Anonymous',
        ticket_number=chosen['ticket_number'],
        prize_amount=c['prize_amount'],
        prize_title=c['title'],
    )
    await db.winners.insert_one(w.model_dump())
    await db.contests.update_one({'contest_id': c['contest_id']}, {'$set': {'status': 'drawn'}})
    return {'action': 'draw_winner', 'ok': True, 'winner': w.model_dump()}


async def handle_list_contests(db, a: dict) -> dict:
    q: dict = {}
    st = a.get('status', 'all')
    if st and st != 'all':
        q['status'] = st
    docs = await db.contests.find(q, {'_id': 0, 'skill_question': 0}).sort('created_at', -1).to_list(200)
    return {'action': 'list_contests', 'ok': True, 'contests': docs}


async def handle_list_users(db, a: dict) -> dict:
    f = a.get('filter', 'all')
    q: dict = {}
    if f == 'admins':
        q = {'role': {'$in': ['admin', 'super_admin']}}
    elif f == 'kyc_pending':
        pending = await db.kyc.find({'status': 'pending'}, {'_id': 0, 'user_id': 1}).to_list(500)
        ids = [p['user_id'] for p in pending]
        q = {'user_id': {'$in': ids}}
    users = await db.users.find(q, {'_id': 0, 'password_hash': 0}).limit(200).to_list(200)
    return {'action': 'list_users', 'ok': True, 'users': users, 'count': len(users)}


async def handle_set_user_role(db, a: dict) -> dict:
    role = a.get('role')
    if role not in VALID_ROLES:
        return {'action': 'set_user_role', 'ok': False, 'error': f'Invalid role: {role}'}
    u = await _find_user(db, a.get('email_or_id') or '')
    if not u:
        return {'action': 'set_user_role', 'ok': False, 'error': f'User not found: {a.get("email_or_id")}'}
    await db.users.update_one({'user_id': u['user_id']}, {'$set': {'role': role}})
    return {'action': 'set_user_role', 'ok': True, 'user_id': u['user_id'], 'role': role}


async def handle_suspend(db, a: dict, action_name: str) -> dict:
    u = await _find_user(db, a.get('email_or_id') or '')
    if not u:
        return {'action': action_name, 'ok': False, 'error': f'User not found: {a.get("email_or_id")}'}
    await db.users.update_one({'user_id': u['user_id']}, {'$set': {'suspended': action_name == 'suspend_user'}})
    return {'action': action_name, 'ok': True, 'user_id': u['user_id']}


async def handle_kyc(db, a: dict, action_name: str) -> dict:
    u = await _find_user(db, a.get('email_or_id') or '')
    if not u:
        return {'action': action_name, 'ok': False, 'error': f'User not found: {a.get("email_or_id")}'}
    update = {
        'status': 'approved' if action_name == 'approve_kyc' else 'rejected',
        'reviewed_at': datetime.now(timezone.utc),
    }
    if action_name == 'reject_kyc':
        update['reject_reason'] = a.get('reason', '')
    r = await db.kyc.update_one({'user_id': u['user_id']}, {'$set': update})
    return {'action': action_name, 'ok': r.matched_count > 0, 'user_id': u['user_id']}


async def handle_refund_order(db, a: dict) -> dict:
    oid = a.get('order_id') or ''
    o = await db.orders.find_one({'order_id': oid}, {'_id': 0})
    if not o:
        return {'action': 'refund_order', 'ok': False, 'error': f'Order not found: {oid}'}
    for item in o.get('items', []):
        await db.contests.update_one({'contest_id': item['contest_id']}, {'$inc': {'tickets_sold': -item['qty']}})
    await db.tickets.delete_many({'order_id': oid})
    await db.orders.update_one({'order_id': oid}, {'$set': {'status': 'refunded'}})
    return {'action': 'refund_order', 'ok': True, 'order_id': oid}


async def handle_mark_winner_paid(db, a: dict) -> dict:
    key = a.get('winner_id_or_ticket') or ''
    q = {'$or': [{'winner_id': key}, {'ticket_number': int(key) if str(key).isdigit() else -1}]}
    w = await db.winners.find_one(q, {'_id': 0})
    if not w:
        return {'action': 'mark_winner_paid', 'ok': False, 'error': f'Winner not found: {key}'}
    await db.winners.update_one({'winner_id': w['winner_id']}, {'$set': {'paid_out': True}})
    return {'action': 'mark_winner_paid', 'ok': True, 'winner_id': w['winner_id']}


async def handle_site_stats(db, a: dict) -> dict:
    stats = {
        'users': await db.users.count_documents({}),
        'contests': await db.contests.count_documents({}),
        'live_contests': await db.contests.count_documents({'status': 'live'}),
        'orders': await db.orders.count_documents({}),
        'kyc_pending': await db.kyc.count_documents({'status': 'pending'}),
    }
    return {'action': 'site_stats', 'ok': True, 'stats': stats}


async def handle_explain(db, a: dict) -> dict:
    return {'action': 'explain', 'ok': True, 'topic': a.get('topic', 'other')}


# ---------- dispatch table ----------
# Simple handlers: type -> callable(db, action) -> result
_SIMPLE = {
    'create_contests': handle_create_contests,
    'update_contest': handle_update_contest,
    'delete_contest': handle_delete_contest,
    'delete_all_drafts': handle_delete_all_drafts,
    'launch_contest': handle_launch_contest,
    'launch_all_drafts': handle_launch_all_drafts,
    'pause_contest': handle_pause_contest,
    'draw_winner': handle_draw_winner,
    'list_contests': handle_list_contests,
    'list_users': handle_list_users,
    'set_user_role': handle_set_user_role,
    'refund_order': handle_refund_order,
    'mark_winner_paid': handle_mark_winner_paid,
    'site_stats': handle_site_stats,
    'explain': handle_explain,
}


async def dispatch_action(db, a: dict) -> dict:
    """Run a single action dict; never raises."""
    t = (a.get('type') or '').lower()
    try:
        if t in _SIMPLE:
            return await _SIMPLE[t](db, a)
        if t in ('suspend_user', 'unsuspend_user'):
            return await handle_suspend(db, a, t)
        if t in ('approve_kyc', 'reject_kyc'):
            return await handle_kyc(db, a, t)
        return {'action': t, 'ok': False, 'error': 'Unknown action type'}
    except Exception as e:  # noqa: BLE001
        return {'action': t, 'ok': False, 'error': str(e)}


async def execute_actions(db, actions: list) -> list:
    """Run a plan (list of actions) sequentially, returning per-action results."""
    return [await dispatch_action(db, a) for a in (actions or [])]
