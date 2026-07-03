"""Meera AI assistant for GameZoo admin/production panels.

Uses Emergent LLM to interpret natural-language commands and returns a
structured plan of actions (create/update/delete/launch/pause/draw contests),
which the backend executes deterministically.
"""
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel
import json
import os
import re
import uuid
import random

from auth import require_admin
from models import Contest, SkillQuestion, new_id

router = APIRouter(prefix='/api/admin/meera', tags=['meera'])

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# Reuse the seed's question bank so Meera-created contests always have a valid skill Q
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
    ('Square root of 64?', ['6', '7', '8', '9'], '8', 'math'),
    ('What year did WWII end?', ['1943', '1945', '1947', '1950'], '1945', 'trivia'),
    ('Chemical symbol for gold?', ['Go', 'Gd', 'Au', 'Ag'], 'Au', 'trivia'),
    ('Fastest land animal?', ['Lion', 'Cheetah', 'Horse', 'Leopard'], 'Cheetah', 'trivia'),
    ('Days in a leap year?', ['364', '365', '366', '367'], '366', 'trivia'),
]

DEFAULT_IMAGES = [
    'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/15633962/pexels-photo-15633962.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/19240616/pexels-photo-19240616.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/9462148/pexels-photo-9462148.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/973406/pexels-photo-973406.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'https://images.pexels.com/photos/27064826/pexels-photo-27064826.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
]


SYSTEM_PROMPT = """You are Meera, the AI operations assistant for GameZoo — a UK skill-based prize competition platform. You help both admins and end-users. You are fluent in every language and MUST reply in the SAME language the user wrote to you.

You MUST always reply with a single JSON object (no markdown, no code fences, no extra text):
{
  "reply": "friendly natural-language reply in the user's language",
  "actions": [ ...zero or more action objects... ]
}

Supported action types (exact keys):
- {"type": "create_contests", "count": <int>, "prize_amount": <number>, "tickets_total": <int>, "duration_days": <int>, "title": "<optional>", "category": "<prize-draws|instant-wins|jackpot|new-games>", "ticket_price": <optional, default 1>, "status": "<draft|live, default draft>"}
- {"type": "update_contest", "id_or_slug": "<>", "updates": {"prize_amount"?, "tickets_total"?, "title"?, "subtitle"?, "image"?, "end_date_days_from_now"?, "category"?, "status"?, "price"?}}
- {"type": "delete_contest", "id_or_slug": "<>"}
- {"type": "delete_all_drafts"}
- {"type": "launch_contest", "id_or_slug": "<>"}
- {"type": "launch_all_drafts"}
- {"type": "pause_contest", "id_or_slug": "<>"}
- {"type": "draw_winner", "id_or_slug": "<>"}
- {"type": "list_contests", "status": "<draft|live|drawn|all>"}
- {"type": "list_users", "filter": "<all|admins|kyc_pending>"}
- {"type": "set_user_role", "email_or_id": "<>", "role": "<user|admin|super_admin|operator|support>"}
- {"type": "suspend_user", "email_or_id": "<>"}
- {"type": "unsuspend_user", "email_or_id": "<>"}
- {"type": "approve_kyc", "email_or_id": "<>"}
- {"type": "reject_kyc", "email_or_id": "<>", "reason": "<>"}
- {"type": "refund_order", "order_id": "<>"}
- {"type": "mark_winner_paid", "winner_id_or_ticket": "<>"}
- {"type": "site_stats"}
- {"type": "explain", "topic": "<free_entry|how_to_play|payouts|kyc|skill_law|other>"}  // for public users who ask general questions

Rules:
1. If the user writes in Hindi, reply in Hindi. If Tamil, reply in Tamil. If French, reply in French. Match their language exactly.
2. New contests default to status="draft" unless user explicitly says "launch"/"start live"/"go live".
3. Parse casual money references (£100, 100 pounds, 100 gbp, 100 quid → 100). Parse spelled-out numbers.
4. Default duration_days=7 if not specified.
5. Only emit actions the user asked for. Ask clarifying questions via "reply" only if genuinely ambiguous.
6. For non-admin users, only use the "explain" action or ask polite clarifying questions. Never expose admin actions to public users; if asked, politely say those need admin rights.
7. Keep "reply" short, warm, natural. Confirm what you're about to do.
8. Output MUST be valid JSON parseable by json.loads. No trailing commas, no markdown.
"""


class MeeraInput(BaseModel):
    message: str
    session_id: Optional[str] = None


async def _run_meera(user_msg: str, session_id: str) -> dict:
    """Call the Emergent LLM and parse a JSON plan."""
    if not EMERGENT_LLM_KEY:
        return {'reply': "Meera is offline — EMERGENT_LLM_KEY not configured on the server.", 'actions': []}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except Exception as e:
        return {'reply': f"Meera library missing: {e}", 'actions': []}

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=SYSTEM_PROMPT,
    ).with_model('openai', 'gpt-4o-mini')

    try:
        resp = await chat.send_message(UserMessage(text=user_msg))
    except Exception as e:
        return {'reply': f"Meera couldn't reach the LLM ({e}).", 'actions': []}

    # Extract JSON from response
    text = (resp or '').strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
    try:
        plan = json.loads(text)
    except Exception:
        # Try to find first {...} block
        m = re.search(r'\{[\s\S]*\}', text)
        if not m:
            return {'reply': text or "I didn't understand that.", 'actions': []}
        try:
            plan = json.loads(m.group(0))
        except Exception:
            return {'reply': text, 'actions': []}
    if 'actions' not in plan:
        plan['actions'] = []
    if 'reply' not in plan:
        plan['reply'] = 'Ok.'
    return plan


def _slug_for(title: str, idx: int) -> str:
    base = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    if not base:
        base = 'contest'
    return f"{base}-{uuid.uuid4().hex[:6]}"


async def _find_contest(db, key: str) -> Optional[dict]:
    if not key:
        return None
    doc = await db.contests.find_one({'slug': key}, {'_id': 0})
    if doc:
        return doc
    return await db.contests.find_one({'contest_id': key}, {'_id': 0})


async def _execute_actions(db, actions: List[dict]) -> List[dict]:
    results = []
    for a in actions or []:
        t = (a.get('type') or '').lower()
        try:
            if t == 'create_contests':
                count = int(a.get('count', 1))
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
                for i in range(max(1, min(count, 200))):
                    q = QBANK[random.randint(0, len(QBANK) - 1)]
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
                    doc = c.model_dump()
                    await db.contests.insert_one(doc)
                    created.append({'contest_id': c.contest_id, 'slug': c.slug, 'title': c.title, 'status': c.status})
                results.append({'action': 'create_contests', 'ok': True, 'count': len(created), 'created': created})

            elif t == 'update_contest':
                key = a.get('id_or_slug') or ''
                c = await _find_contest(db, key)
                if not c:
                    results.append({'action': t, 'ok': False, 'error': f'Contest not found: {key}'})
                    continue
                updates = a.get('updates') or {}
                setter = {}
                for k, v in updates.items():
                    if k == 'end_date_days_from_now':
                        setter['end_date'] = (datetime.now(timezone.utc) + timedelta(days=int(v))).replace(hour=21, minute=0, second=0, microsecond=0)
                    elif k in {'title', 'subtitle', 'category', 'status', 'tag', 'image'}:
                        setter[k] = v
                    elif k in {'prize_amount', 'ticket_price', 'price'}:
                        setter['price' if k == 'ticket_price' else k] = float(v)
                    elif k in {'tickets_total'}:
                        setter[k] = int(v)
                if setter:
                    await db.contests.update_one({'contest_id': c['contest_id']}, {'$set': setter})
                results.append({'action': t, 'ok': True, 'contest_id': c['contest_id'], 'updates': setter})

            elif t == 'delete_contest':
                key = a.get('id_or_slug') or ''
                c = await _find_contest(db, key)
                if not c:
                    results.append({'action': t, 'ok': False, 'error': f'Not found: {key}'})
                    continue
                await db.contests.delete_one({'contest_id': c['contest_id']})
                await db.tickets.delete_many({'contest_id': c['contest_id']})
                results.append({'action': t, 'ok': True, 'contest_id': c['contest_id']})

            elif t == 'delete_all_drafts':
                r = await db.contests.delete_many({'status': 'draft'})
                results.append({'action': t, 'ok': True, 'deleted': r.deleted_count})

            elif t == 'launch_contest':
                key = a.get('id_or_slug') or ''
                c = await _find_contest(db, key)
                if not c:
                    results.append({'action': t, 'ok': False, 'error': f'Not found: {key}'})
                    continue
                await db.contests.update_one({'contest_id': c['contest_id']}, {'$set': {'status': 'live'}})
                results.append({'action': t, 'ok': True, 'contest_id': c['contest_id']})

            elif t == 'launch_all_drafts':
                r = await db.contests.update_many({'status': 'draft'}, {'$set': {'status': 'live'}})
                results.append({'action': t, 'ok': True, 'launched': r.modified_count})

            elif t == 'pause_contest':
                key = a.get('id_or_slug') or ''
                c = await _find_contest(db, key)
                if not c:
                    results.append({'action': t, 'ok': False, 'error': f'Not found: {key}'})
                    continue
                await db.contests.update_one({'contest_id': c['contest_id']}, {'$set': {'status': 'draft'}})
                results.append({'action': t, 'ok': True, 'contest_id': c['contest_id']})

            elif t == 'draw_winner':
                key = a.get('id_or_slug') or ''
                c = await _find_contest(db, key)
                if not c:
                    results.append({'action': t, 'ok': False, 'error': f'Not found: {key}'})
                    continue
                tickets = await db.tickets.find({'contest_id': c['contest_id']}, {'_id': 0}).to_list(100000)
                if not tickets:
                    results.append({'action': t, 'ok': False, 'error': 'No tickets sold'})
                    continue
                chosen = random.choice(tickets)
                user = await db.users.find_one({'user_id': chosen['user_id']}, {'_id': 0})
                from models import Winner
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
                results.append({'action': t, 'ok': True, 'winner': w.model_dump()})

            elif t == 'list_contests':
                q = {}
                st = a.get('status', 'all')
                if st and st != 'all':
                    q['status'] = st
                docs = await db.contests.find(q, {'_id': 0, 'skill_question': 0}).sort('created_at', -1).to_list(200)
                results.append({'action': t, 'ok': True, 'contests': docs})

            elif t == 'list_users':
                f = a.get('filter', 'all')
                q = {}
                if f == 'admins':
                    q = {'role': {'$in': ['admin', 'super_admin']}}
                elif f == 'kyc_pending':
                    pending = await db.kyc.find({'status': 'pending'}, {'_id': 0, 'user_id': 1}).to_list(500)
                    ids = [p['user_id'] for p in pending]
                    q = {'user_id': {'$in': ids}}
                users = await db.users.find(q, {'_id': 0, 'password_hash': 0}).limit(200).to_list(200)
                results.append({'action': t, 'ok': True, 'users': users, 'count': len(users)})

            elif t == 'set_user_role':
                key = (a.get('email_or_id') or '').lower()
                role = a.get('role')
                if role not in ('user', 'admin', 'super_admin', 'operator', 'support'):
                    results.append({'action': t, 'ok': False, 'error': f'Invalid role: {role}'}); continue
                u = await db.users.find_one({'$or': [{'email': key}, {'user_id': key}]}, {'_id': 0})
                if not u:
                    results.append({'action': t, 'ok': False, 'error': f'User not found: {key}'}); continue
                await db.users.update_one({'user_id': u['user_id']}, {'$set': {'role': role}})
                results.append({'action': t, 'ok': True, 'user_id': u['user_id'], 'role': role})

            elif t in ('suspend_user', 'unsuspend_user'):
                key = (a.get('email_or_id') or '').lower()
                u = await db.users.find_one({'$or': [{'email': key}, {'user_id': key}]}, {'_id': 0})
                if not u:
                    results.append({'action': t, 'ok': False, 'error': f'User not found: {key}'}); continue
                await db.users.update_one({'user_id': u['user_id']}, {'$set': {'suspended': t == 'suspend_user'}})
                results.append({'action': t, 'ok': True, 'user_id': u['user_id']})

            elif t in ('approve_kyc', 'reject_kyc'):
                key = (a.get('email_or_id') or '').lower()
                u = await db.users.find_one({'$or': [{'email': key}, {'user_id': key}]}, {'_id': 0})
                if not u:
                    results.append({'action': t, 'ok': False, 'error': f'User not found: {key}'}); continue
                update = {'status': 'approved' if t == 'approve_kyc' else 'rejected', 'reviewed_at': datetime.now(timezone.utc)}
                if t == 'reject_kyc':
                    update['reject_reason'] = a.get('reason', '')
                r = await db.kyc.update_one({'user_id': u['user_id']}, {'$set': update})
                results.append({'action': t, 'ok': r.matched_count > 0, 'user_id': u['user_id']})

            elif t == 'refund_order':
                oid = a.get('order_id') or ''
                o = await db.orders.find_one({'order_id': oid}, {'_id': 0})
                if not o:
                    results.append({'action': t, 'ok': False, 'error': f'Order not found: {oid}'}); continue
                for item in o.get('items', []):
                    await db.contests.update_one({'contest_id': item['contest_id']}, {'$inc': {'tickets_sold': -item['qty']}})
                await db.tickets.delete_many({'order_id': oid})
                await db.orders.update_one({'order_id': oid}, {'$set': {'status': 'refunded'}})
                results.append({'action': t, 'ok': True, 'order_id': oid})

            elif t == 'mark_winner_paid':
                key = a.get('winner_id_or_ticket') or ''
                w = await db.winners.find_one({'$or': [{'winner_id': key}, {'ticket_number': int(key) if str(key).isdigit() else -1}]}, {'_id': 0})
                if not w:
                    results.append({'action': t, 'ok': False, 'error': f'Winner not found: {key}'}); continue
                await db.winners.update_one({'winner_id': w['winner_id']}, {'$set': {'paid_out': True}})
                results.append({'action': t, 'ok': True, 'winner_id': w['winner_id']})

            elif t == 'site_stats':
                users_count = await db.users.count_documents({})
                contests_count = await db.contests.count_documents({})
                live_count = await db.contests.count_documents({'status': 'live'})
                orders_count = await db.orders.count_documents({})
                kyc_pending = await db.kyc.count_documents({'status': 'pending'})
                results.append({'action': t, 'ok': True, 'stats': {
                    'users': users_count, 'contests': contests_count, 'live_contests': live_count,
                    'orders': orders_count, 'kyc_pending': kyc_pending,
                }})

            elif t == 'explain':
                # No side effects — Meera's "reply" already contains the explanation.
                results.append({'action': t, 'ok': True, 'topic': a.get('topic', 'other')})
            else:
                results.append({'action': t, 'ok': False, 'error': 'Unknown action type'})
        except Exception as e:
            results.append({'action': t, 'ok': False, 'error': str(e)})
    return results


@router.post('/chat')
async def chat(inp: MeeraInput, request: Request):
    await require_admin(request)
    from server import db_ref
    db = db_ref()
    session_id = inp.session_id or new_id('meera')
    plan = await _run_meera(inp.message, session_id)
    exec_results = await _execute_actions(db, plan.get('actions', []))
    await db.meera_log.insert_one({
        'session_id': session_id, 'user_msg': inp.message,
        'plan': plan, 'results': exec_results, 'at': datetime.now(timezone.utc),
    })
    return {
        'session_id': session_id, 'reply': plan.get('reply'),
        'actions': plan.get('actions', []), 'results': exec_results,
    }


# Public Meera — for end users. Only "explain" actions are ever executed here.
public_router = APIRouter(prefix='/api/meera', tags=['meera-public'])


@public_router.post('/chat')
async def public_chat(inp: MeeraInput):
    from server import db_ref
    db = db_ref()
    session_id = inp.session_id or new_id('meerap')
    plan = await _run_meera(inp.message, session_id)
    # Only allow safe explain actions for anonymous / user callers
    safe_actions = [a for a in plan.get('actions', []) if (a.get('type') or '') == 'explain']
    exec_results = await _execute_actions(db, safe_actions)
    return {
        'session_id': session_id, 'reply': plan.get('reply'),
        'actions': safe_actions, 'results': exec_results,
    }
