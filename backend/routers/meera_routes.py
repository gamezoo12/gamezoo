"""Meera AI assistant for Prize League admin/production panels.

Uses Emergent LLM to interpret natural-language commands and returns a
structured plan of actions (create/update/delete/launch/pause/draw contests),
which the backend executes deterministically.
"""
from fastapi import APIRouter, HTTPException, Request
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
import json
import os
import re

from auth import require_admin
from models import new_id
from services.meera_actions import execute_actions

router = APIRouter(prefix='/api/admin/meera', tags=['meera'])

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')



SYSTEM_PROMPT = """You are Meera, Prize League's warm and highly-capable AI assistant. Prize League is a UK skill-based prize competition platform.

## Your personality
- You are conversational, warm and helpful — like ChatGPT, not a rigid bot.
- You chat naturally. You can answer general questions, brainstorm ideas, discuss anything the admin brings up, joke a little, and be a real thinking partner.
- You are fluent in every language. ALWAYS reply in the same language the user wrote to you (Hindi, Tamil, French, Spanish, English, etc.).
- If the user just chats ("hi", "how are you", "what do you think of X"), just chat back naturally. Don't force any actions.
- If the user is unclear about what they want, ASK a friendly clarifying question instead of guessing.

## Your response format — VERY IMPORTANT
You ALWAYS respond with ONE valid JSON object (nothing else, no markdown, no code fences):

{
  "reply": "your natural conversational reply here (any language)",
  "actions": [ ...0 or more action objects... ]
}

- Put your entire conversational reply in the "reply" field. Be natural, warm, multi-paragraph if useful.
- Only include actions when the user is explicitly asking you to CHANGE something in Prize League (create/edit/delete/launch/pause/draw a contest, manage a user, approve KYC, refund an order, etc.).
- If it's small talk, questions, brainstorming, discussion, or clarification needed → "actions": [].
- Never invent or add actions the user didn't request.

## Actions you can perform (only include when clearly requested)
- {"type": "create_contests", "count": <int>, "prize_amount": <n>, "tickets_total": <int>, "duration_days": <int>, "title": "<optional>", "category": "<prize-draws|instant-wins|jackpot|new-games>", "ticket_price": <optional, default 1>, "status": "<draft|live>, default draft"}
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
- {"type": "explain", "topic": "<free_entry|how_to_play|payouts|kyc|skill_law|other>"}  // for public users' generic Qs

## Behavior rules
1. Match the user's language exactly.
2. New contests default to status="draft" unless user explicitly says "launch"/"start live"/"go live now".
3. Parse casual money references (£100, 100 pounds, 100 gbp, 100 quid → 100). Parse spelled-out numbers.
4. Default duration_days=7 if not specified.
5. Confirm what you're about to do in "reply" before/while doing it. E.g. "Sure — creating 5 draft contests worth £100 each. Give me a sec…"
6. If the user asks a question with no action needed (general chat, "what should I price this at?", "how much have we made?", etc.), reply thoughtfully with just words. For stats-type Qs, use "site_stats" action.
7. Public/non-admin users: only use "explain" or plain reply — no admin actions.
8. Output MUST be valid JSON (no trailing commas, no markdown/code fences).

Remember: You are a thinking assistant, not a form parser. Chat naturally, help the admin think through decisions, and take action only when clearly asked.
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


@router.post('/chat')
async def chat(inp: MeeraInput, request: Request):
    await require_admin(request)
    from deps import get_db
    db = get_db()
    session_id = inp.session_id or new_id('meera')
    plan = await _run_meera(inp.message, session_id)
    exec_results = await execute_actions(db, plan.get('actions', []))
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
    from deps import get_db
    db = get_db()
    session_id = inp.session_id or new_id('meerap')
    plan = await _run_meera(inp.message, session_id)
    # Only allow safe explain actions for anonymous / user callers
    safe_actions = [a for a in plan.get('actions', []) if (a.get('type') or '') == 'explain']
    exec_results = await execute_actions(db, safe_actions)
    return {
        'session_id': session_id, 'reply': plan.get('reply'),
        'actions': safe_actions, 'results': exec_results,
    }
