"""Winnings Wallet + configurable Something Special challenges.

Money is stored in integer PENNIES only. A per-user `winnings_wallets` cache
document is mutated atomically (conditional $inc) to guarantee no negative or
over-spend, while an immutable `winnings_ledger` provides the audit trail.
Completely separate from token/normal/entry/payment wallets.
"""

import uuid
import secrets
import re
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, OperationFailure
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from deps import get_db
from routers.wallet_routes import _apply_tx, _apply_tx_idempotent, credit_withdrawable, _get_or_create_wallet
from auth import get_current_user, require_admin

logger = logging.getLogger("winnings")

router = APIRouter(prefix="/api/winnings", tags=["winnings"])
admin_router = APIRouter(prefix="/api/admin/winnings", tags=["admin-winnings"])

CHALLENGE_ID = "something-special-100"
CHALLENGE_REWARD_PENCE = 50000  # £500.00 — fixed server-side, never from client
CHALLENGE_DURATION_MS = 60_000
EXPECTED_SEQUENCE = list(range(1, 101))
CURRENCY = "GBP"

_indexes_ready = False


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return _as_utc(dt).isoformat()


def _as_utc(dt):
    if not dt:
        return None
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _mask_account(acct: str) -> str:
    if not acct:
        return ""
    tail = acct[-4:]
    return f"••••{tail}"


async def _ensure_indexes(db):
    global _indexes_ready
    if _indexes_ready:
        return
    reward_indexes = await db.special_challenge_rewards.index_information()
    for name, index in reward_indexes.items():
        keys = list(index.get("key", []))
        if index.get("unique") and keys == [("user_id", 1), ("challenge_id", 1)]:
            try:
                await db.special_challenge_rewards.drop_index(name)
            except OperationFailure as exc:
                if exc.code != 27:
                    raise
    await db.special_challenge_rewards.create_index(
        [("user_id", 1), ("challenge_id", 1), ("created_at", -1)],
        name="challenge_reward_history",
    )
    await db.special_challenge_cooldowns.create_index(
        [("user_id", 1), ("challenge_id", 1)], unique=True,
        name="uniq_user_game_cooldown",
    )
    await db.special_challenge_attempts.create_index([("user_id", 1), ("created_at", -1)])
    await db.special_challenge_attempts.create_index([("user_id", 1), ("started_at", -1)])
    await db.special_challenge_attempts.create_index([("attempt_id", 1)], unique=True)
    await db.special_challenge_games.create_index([("game_id", 1)], unique=True)
    await db.winnings_ledger.create_index([("user_id", 1), ("created_at", -1)])
    await db.winnings_ledger.create_index([("type", 1)])
    await db.withdrawal_requests.create_index([("user_id", 1), ("created_at", -1)])
    await db.withdrawal_requests.create_index([("status", 1), ("created_at", -1)])
    await db.winnings_wallets.create_index([("user_id", 1)], unique=True)
    _indexes_ready = True


async def _game_cooldown_until(db, user_id, game_id, now=None):
    now = now or _now()
    cooldown = await db.special_challenge_cooldowns.find_one(
        {"user_id": user_id, "challenge_id": game_id},
        {"_id": 0, "next_allowed_at": 1},
    )
    cooldown_until = _as_utc((cooldown or {}).get("next_allowed_at"))

    recent_reward = await db.special_challenge_rewards.find_one(
        {"user_id": user_id, "challenge_id": game_id,
         "created_at": {"$gte": now - timedelta(hours=24)}},
        {"_id": 0, "created_at": 1},
        sort=[("created_at", -1)],
    )
    if recent_reward:
        reward_until = _as_utc(recent_reward.get("created_at")) + timedelta(hours=24)
        if not cooldown_until or reward_until > cooldown_until:
            try:
                await db.special_challenge_cooldowns.update_one(
                    {"user_id": user_id, "challenge_id": game_id},
                    {"$max": {"next_allowed_at": reward_until},
                     "$setOnInsert": {"user_id": user_id, "challenge_id": game_id}},
                    upsert=True,
                )
            except DuplicateKeyError:
                pass
            cooldown_until = reward_until
    return cooldown_until if cooldown_until and cooldown_until > now else None


async def _claim_game_win_cooldown(db, user_id, game_id, attempt_id, now):
    next_allowed_at = now + timedelta(hours=24)
    try:
        claimed = await db.special_challenge_cooldowns.find_one_and_update(
            {"user_id": user_id, "challenge_id": game_id,
             "$or": [{"next_allowed_at": {"$lte": now}},
                     {"next_allowed_at": {"$exists": False}}]},
            {"$set": {"next_allowed_at": next_allowed_at,
                      "last_win_attempt_id": attempt_id,
                      "updated_at": now},
             "$setOnInsert": {"user_id": user_id, "challenge_id": game_id}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return claimed is not None
    except DuplicateKeyError:
        return False


async def _get_wallet(db, user_id):
    await db.winnings_wallets.update_one(
        {"user_id": user_id},
        {"$setOnInsert": {
            "user_id": user_id, "currency": CURRENCY,
            "available_pence": 0, "pending_pence": 0,
            "total_won_pence": 0, "total_paid_pence": 0,
            "created_at": _now(),
        }},
        upsert=True,
    )
    return await db.winnings_wallets.find_one({"user_id": user_id}, {"_id": 0})


async def _ledger(db, user_id, type_, amount_pence, reference=None, status="posted"):
    await db.winnings_ledger.insert_one({
        "transaction_id": uuid.uuid4().hex,
        "user_id": user_id,
        "type": type_,
        "amount_pence": int(amount_pence),
        "currency": CURRENCY,
        "reference": reference,
        "status": status,
        "created_at": _now(),
        "processed_at": _now() if status == "posted" else None,
    })


async def _audit(db, action, actor_id, target, meta=None):
    await db.winnings_audit_log.insert_one({
        "action": action, "actor_id": actor_id, "target": target,
        "meta": meta or {}, "created_at": _now(),
    })


# ------------------------- Configurable Special Challenges -------------------------
# Each attempt snapshots settings so later admin edits cannot change a paid game.
DEFAULT_TIMES = {20: 8, 25: 10, 30: 12, 36: 14, 42: 16, 49: 18, 64: 23, 81: 30, 100: 40}
DEFAULT_COLOUR_TIMES = {4: 8, 5: 9, 6: 10, 7: 11, 8: 12, 9: 13, 10: 14}
PALETTE = [
    {"name": "BLUE", "hex": "#0000ff"}, {"name": "RED", "hex": "#ff0000"},
    {"name": "GREEN", "hex": "#00c853"}, {"name": "ORANGE", "hex": "#ff7900"},
    {"name": "PINK", "hex": "#ff1493"}, {"name": "WHITE", "hex": "#ffffff"},
    {"name": "YELLOW", "hex": "#ffff00"}, {"name": "BLACK", "hex": "#000000"},
    {"name": "VIOLET", "hex": "#8f00ff"}, {"name": "LIGHT GREEN", "hex": "#7cfc00"},
    {"name": "PALE YELLOW", "hex": "#fff3a3"},
]


def _default_games():
    rows = []
    for count, seconds in DEFAULT_TIMES.items():
        rows.append({"game_id": CHALLENGE_ID if count == 100 else f"number-sequence-{count}",
                     "type": "number_sequence", "size": count, "name": f"{count} Number Sequence",
                     "time_limit_seconds": seconds, "entry_tokens": 1, "prize_pence": 50000,
                     "max_attempts": 0, "target_matches": 0, "enabled": True})
    for count, seconds in DEFAULT_COLOUR_TIMES.items():
        rows.append({"game_id": f"colour-match-{count}", "type": "colour_match", "size": count,
                     "name": f"{count} Colour Match", "time_limit_seconds": seconds,
                     "entry_tokens": 1, "prize_pence": 50000, "max_attempts": 0,
                     "target_matches": 10, "enabled": True})
    return rows


async def _seed_challenges(db):
    for item in _default_games():
        await db.special_challenge_games.update_one(
            {"game_id": item["game_id"]}, {"$setOnInsert": item}, upsert=True)


def _public_game(g):
    game = {k: g[k] for k in ("game_id", "type", "size", "name", "time_limit_seconds",
                              "entry_tokens", "prize_pence", "max_attempts", "target_matches", "enabled")}
    game["entry_tokens"] = 1
    return game


def _question(size):
    colours = PALETTE[:size]
    ink = secrets.choice(colours)
    words = [c for c in colours if c["name"] != ink["name"]]
    word = secrets.choice(words)
    options = [c["name"] for c in colours]
    # Server retains the answer; client receives only the question and choices.
    return {"word": word["name"], "ink": ink["hex"], "answer": ink["name"],
            "options": secrets.SystemRandom().sample(options, len(options))}


def _question_public(q):
    return {"word": q["word"], "ink": q["ink"], "options": q["options"]}


def _elapsed_ms(attempt):
    started = attempt["started_at"]
    if isinstance(started, str):
        started = datetime.fromisoformat(started)
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return int((_now() - started).total_seconds() * 1000)


async def _finalise(db, attempt, success):
    """Atomically close an active attempt; only the winner of that transition can award."""
    await _ensure_indexes(db)
    elapsed = _elapsed_ms(attempt)
    success = bool(success and elapsed <= attempt["time_limit_seconds"] * 1000)
    updated = await db.special_challenge_attempts.find_one_and_update(
        {"attempt_id": attempt["attempt_id"], "user_id": attempt["user_id"], "status": "active"},
        {"$set": {"status": "complete", "completed_at": _now(), "elapsed_ms": elapsed,
                  "result": "success" if success else "fail", "question": None}},
        return_document=ReturnDocument.BEFORE)
    if not updated:
        latest = await db.special_challenge_attempts.find_one({"attempt_id": attempt["attempt_id"]})
        return {"result": latest.get("result", "fail"), "elapsed_ms": latest.get("elapsed_ms", elapsed),
                "reward_pence": 0, "already_rewarded": True, "finished": True}
    prize = int(attempt["prize_pence"])
    rewarded = False
    if success:
        now = _now()
        cooldown_until = await _game_cooldown_until(
            db, attempt["user_id"], attempt["challenge_id"], now,
        )
        claimed = not cooldown_until and await _claim_game_win_cooldown(
            db, attempt["user_id"], attempt["challenge_id"],
            attempt["attempt_id"], now,
        )
        if not claimed:
            await db.special_challenge_attempts.update_one(
                {"attempt_id": attempt["attempt_id"]},
                {"$set": {"result": "fail", "cooldown_blocked": True}},
            )
            return {"result": "fail", "elapsed_ms": elapsed, "reward_pence": 0,
                    "cooldown_blocked": True, "finished": True}
        if prize > 0:
            try:
                await db.special_challenge_rewards.insert_one({
                    "reward_id": uuid.uuid4().hex, "user_id": attempt["user_id"],
                    "challenge_id": attempt["challenge_id"], "attempt_id": attempt["attempt_id"],
                    "reward_pence": prize, "reward_status": "pending", "created_at": now})
                # Idempotent wallet credit protects against retries. If credit fails, retain
                # a pending reward for operational reconciliation rather than losing it.
                await credit_withdrawable(db, attempt["user_id"], prize / 100.0,
                                         note="Something Special challenge winnings",
                                         ref_order_id=f"challenge_reward:{attempt['attempt_id']}")
                await db.special_challenge_rewards.update_one(
                    {"attempt_id": attempt["attempt_id"]},
                    {"$set": {"reward_status": "credited", "credited_at": _now()}})
                await _ledger(db, attempt["user_id"], "challenge_reward", prize,
                              reference=attempt["attempt_id"])
                await _audit(db, "challenge_reward", attempt["user_id"], attempt["attempt_id"],
                             {"amount_pence": prize})
                rewarded = True
            except Exception as exc:
                logger.exception("Special Challenge reward requires review: %s", exc)
    return {"result": "success" if success else "fail", "elapsed_ms": elapsed,
            "reward_pence": prize if rewarded else 0,
            "already_rewarded": success and prize > 0 and not rewarded, "finished": True}


@router.get("/challenge/games")
async def list_challenge_games(request: Request):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)
    await _seed_challenges(db)
    rows = await db.special_challenge_games.find({"enabled": True}, {"_id": 0}).to_list(1000)
    games = []
    for row in rows:
        game = _public_game(row)
        game["cooldown_until"] = _iso(
            await _game_cooldown_until(db, user["user_id"], row["game_id"])
        )
        games.append(game)
    return {"games": games}


@router.get("/challenge/attempts")
async def list_challenge_attempts(request: Request, limit: int = 500):
    user = await get_current_user(request)
    db = get_db()
    rows = await db.special_challenge_attempts.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "attempt_id": 1, "challenge_id": 1, "entry_tokens": 1,
         "started_at": 1, "completed_at": 1, "elapsed_ms": 1, "status": 1,
         "result": 1, "type": 1, "size": 1, "prize_pence": 1},
    ).sort("started_at", -1).to_list(max(1, min(limit, 1000)))
    game_ids = list({row.get("challenge_id") for row in rows if row.get("challenge_id")})
    games = await db.special_challenge_games.find(
        {"game_id": {"$in": game_ids}}, {"_id": 0, "game_id": 1, "name": 1}
    ).to_list(len(game_ids)) if game_ids else []
    game_names = {game["game_id"]: game.get("name") for game in games}
    for row in rows:
        row["game_name"] = game_names.get(row.get("challenge_id"), row.get("challenge_id"))
        row["tokens_spent"] = int(row.pop("entry_tokens", 0) or 0)
        row["started_at"] = _iso(row.get("started_at"))
        row["completed_at"] = _iso(row.get("completed_at"))
    return {"items": rows}


class StartChallengeBody(BaseModel):
    game_id: str = CHALLENGE_ID


@router.post("/challenge/start")
async def start_challenge(request: Request, body: StartChallengeBody = None):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)
    await _seed_challenges(db)
    game_id = body.game_id if body else CHALLENGE_ID
    game = await db.special_challenge_games.find_one({"game_id": game_id, "enabled": True})
    if not game:
        raise HTTPException(404, "Challenge not available")
    user_id = user["user_id"]
    cooldown_until = await _game_cooldown_until(db, user_id, game_id)
    if cooldown_until:
        raise HTTPException(
            429,
            f"You already won this game. You can play it again after {cooldown_until.isoformat()}. Other games are still available.",
        )
    limit = int(game["max_attempts"])
    if limit:
        used = await db.special_challenge_attempts.count_documents({"user_id": user_id, "challenge_id": game_id})
        if used >= limit:
            raise HTTPException(403, "Attempt limit reached")
    attempt_id = uuid.uuid4().hex
    cost = 1
    if cost:
        await _apply_tx_idempotent(db, user_id, "spend", -float(cost),
                                   note=f"Special Challenge entry - {game['name']}",
                                   ref_order_id=f"impossible_challenge_entry:{attempt_id}")
    q = _question(game["size"]) if game["type"] == "colour_match" else None
    attempt = {"attempt_id": attempt_id, "challenge_id": game_id, "user_id": user_id,
               "type": game["type"], "size": game["size"], "target_matches": game["target_matches"],
               "time_limit_seconds": game["time_limit_seconds"], "prize_pence": game["prize_pence"],
               "entry_tokens": cost, "started_at": _now(), "completed_at": None,
               "elapsed_ms": None, "result": None, "status": "active", "round": 0,
               "question": q}
    await db.special_challenge_attempts.insert_one(attempt)
    return {"attempt_id": attempt_id, "challenge_id": game_id,
            "duration_ms": game["time_limit_seconds"] * 1000,
            "reward_pence": game["prize_pence"], "already_rewarded": False,
            "question": _question_public(q) if q else None, "round": 0,
            "target_matches": game["target_matches"]}


class CompleteBody(BaseModel):
    attempt_id: str
    sequence: list[int] = []


@router.post("/challenge/complete")
async def complete_challenge(body: CompleteBody, request: Request):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)
    attempt = await db.special_challenge_attempts.find_one(
        {"attempt_id": body.attempt_id, "user_id": user["user_id"]})
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if attempt.get("type", "number_sequence") != "number_sequence":
        raise HTTPException(400, "Use the colour match answer endpoint")
    if attempt.get("status") != "active":
        return {"result": attempt.get("result", "fail"), "reward_pence": 0,
                "already_rewarded": True, "finished": True}
    size = int(attempt.get("size", 100))
    return await _finalise(db, attempt, body.sequence == list(range(1, size + 1)))


class ColourAnswerBody(BaseModel):
    attempt_id: str
    answer: str
    round: int


@router.post("/challenge/colour-answer")
async def colour_answer(body: ColourAnswerBody, request: Request):
    user = await get_current_user(request)
    db = get_db()
    attempt = await db.special_challenge_attempts.find_one(
        {"attempt_id": body.attempt_id, "user_id": user["user_id"]})
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if attempt.get("type") != "colour_match":
        raise HTTPException(400, "Not a Colour Match attempt")
    if attempt.get("status") != "active":
        return {"finished": True, "result": attempt.get("result", "fail"), "reward_pence": 0}
    if _elapsed_ms(attempt) > int(attempt["time_limit_seconds"]) * 1000:
        return await _finalise(db, attempt, False)
    if body.round != attempt["round"]:
        raise HTTPException(409, "Outdated question; refresh not permitted during a paid attempt")
    if body.answer.upper() != attempt["question"]["answer"]:
        return await _finalise(db, attempt, False)
    if attempt["round"] + 1 >= attempt["target_matches"]:
        return await _finalise(db, attempt, True)
    next_q = _question(attempt["size"])
    changed = await db.special_challenge_attempts.update_one(
        {"attempt_id": body.attempt_id, "user_id": user["user_id"], "status": "active",
         "round": body.round},
        {"$set": {"question": next_q}, "$inc": {"round": 1}})
    if changed.modified_count != 1:
        raise HTTPException(409, "Answer already processed")
    return {"finished": False, "round": body.round + 1,
            "question": _question_public(next_q), "target_matches": attempt["target_matches"]}


class ChallengeGameBody(BaseModel):
    game_id: str
    type: str
    size: int
    name: str
    time_limit_seconds: int
    entry_tokens: int
    prize_pence: int
    max_attempts: int = 0
    target_matches: int = 10
    enabled: bool = True


@admin_router.get("/challenge/games")
async def admin_challenge_games(request: Request):
    await require_admin(request)
    db = get_db()
    await _seed_challenges(db)
    rows = await db.special_challenge_games.find({}, {"_id": 0}).to_list(1000)
    return {"games": [_public_game(r) for r in rows]}


@admin_router.get("/challenge/report")
async def admin_challenge_report(
    request: Request,
    game_id: str = None,
    search: str = None,
    skip: int = 0,
    limit: int = 500,
):
    await require_admin(request)
    db = get_db()
    await _ensure_indexes(db)
    await _seed_challenges(db)

    attempt_match = {}
    matched_user_ids = None
    if game_id:
        attempt_match["challenge_id"] = game_id
    if search:
        safe_search = re.escape(search.strip())
        users = await db.users.find(
            {"$or": [
                {"name": {"$regex": safe_search, "$options": "i"}},
                {"username": {"$regex": safe_search, "$options": "i"}},
                {"email": {"$regex": safe_search, "$options": "i"}},
                {"public_id": {"$regex": safe_search, "$options": "i"}},
                {"user_id": {"$regex": safe_search, "$options": "i"}},
            ]},
            {"_id": 0, "user_id": 1},
        ).to_list(5000)
        matched_user_ids = [user["user_id"] for user in users]
        attempt_match["user_id"] = {"$in": matched_user_ids}

    group_stage = {"$group": {
        "_id": {"user_id": "$user_id", "game_id": "$challenge_id"},
        "attempt_count": {"$sum": 1},
        "tokens_spent": {"$sum": {"$ifNull": ["$entry_tokens", 0]}},
        "wins": {"$sum": {"$cond": [{"$eq": ["$result", "success"]}, 1, 0]}},
        "last_attempt": {"$max": {"$ifNull": ["$started_at", "$created_at"]}},
    }}
    count_rows = await db.special_challenge_attempts.aggregate([
        {"$match": attempt_match}, group_stage, {"$count": "total"},
    ]).to_list(1)
    grouped_rows = await db.special_challenge_attempts.aggregate([
        {"$match": attempt_match}, group_stage,
        {"$sort": {"tokens_spent": -1, "attempt_count": -1}},
        {"$skip": max(0, skip)}, {"$limit": max(1, min(limit, 1000))},
    ]).to_list(None)

    game_match = {"challenge_id": game_id} if game_id else {}
    if matched_user_ids is not None:
        game_match["user_id"] = {"$in": matched_user_ids}
    game_totals = await db.special_challenge_attempts.aggregate([
        {"$match": game_match},
        {"$group": {
            "_id": "$challenge_id",
            "attempt_count": {"$sum": 1},
            "tokens_spent": {"$sum": {"$ifNull": ["$entry_tokens", 0]}},
            "wins": {"$sum": {"$cond": [{"$eq": ["$result", "success"]}, 1, 0]}},
        }},
    ]).to_list(None)

    user_ids = list({row["_id"]["user_id"] for row in grouped_rows})
    game_ids = list({row["_id"]["game_id"] for row in grouped_rows})
    users = await db.users.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "public_id": 1, "name": 1, "username": 1, "email": 1},
    ).to_list(len(user_ids)) if user_ids else []
    games = await db.special_challenge_games.find(
        {"game_id": {"$in": game_ids}},
        {"_id": 0, "game_id": 1, "name": 1},
    ).to_list(len(game_ids)) if game_ids else []
    user_map = {user["user_id"]: user for user in users}
    game_map = {game["game_id"]: game.get("name", game["game_id"]) for game in games}

    reward_totals = await db.special_challenge_rewards.aggregate([
        {"$match": {
            "user_id": {"$in": user_ids},
            "challenge_id": {"$in": game_ids},
            "reward_status": "credited",
        }},
        {"$group": {
            "_id": {"user_id": "$user_id", "game_id": "$challenge_id"},
            "credited_winnings_pence": {"$sum": "$reward_pence"},
        }},
    ]).to_list(None) if user_ids and game_ids else []
    winnings_map = {
        (row["_id"]["user_id"], row["_id"]["game_id"]): row["credited_winnings_pence"]
        for row in reward_totals
    }
    game_reward_match = {"reward_status": "credited"}
    if game_id:
        game_reward_match["challenge_id"] = game_id
    if matched_user_ids is not None:
        game_reward_match["user_id"] = {"$in": matched_user_ids}
    game_winnings = await db.special_challenge_rewards.aggregate([
        {"$match": game_reward_match},
        {"$group": {
            "_id": "$challenge_id",
            "credited_winnings_pence": {"$sum": "$reward_pence"},
        }},
    ]).to_list(None)
    game_winnings_map = {row["_id"]: row["credited_winnings_pence"] for row in game_winnings}
    cooldown_rows = await db.special_challenge_cooldowns.find(
        {"user_id": {"$in": user_ids}, "challenge_id": {"$in": game_ids}},
        {"_id": 0, "user_id": 1, "challenge_id": 1, "next_allowed_at": 1},
    ).to_list(None) if user_ids and game_ids else []
    cooldown_map = {
        (row["user_id"], row["challenge_id"]): _iso(row.get("next_allowed_at"))
        for row in cooldown_rows
    }
    recent_rewards = await db.special_challenge_rewards.find(
        {"user_id": {"$in": user_ids}, "challenge_id": {"$in": game_ids},
         "created_at": {"$gte": _now() - timedelta(hours=24)}},
        {"_id": 0, "user_id": 1, "challenge_id": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(None) if user_ids and game_ids else []
    for reward in recent_rewards:
        key = (reward["user_id"], reward["challenge_id"])
        effective_until = (_as_utc(reward["created_at"]) + timedelta(hours=24)).isoformat()
        current_until = _as_utc(cooldown_map.get(key))
        if not current_until or datetime.fromisoformat(effective_until) > current_until:
            cooldown_map[key] = effective_until

    items = []
    for row in grouped_rows:
        uid = row["_id"]["user_id"]
        gid = row["_id"]["game_id"]
        user = user_map.get(uid, {"user_id": uid})
        items.append({
            **user,
            "game_id": gid,
            "game_name": game_map.get(gid, gid),
            "attempt_count": row["attempt_count"],
            "tokens_spent": row["tokens_spent"],
            "wins": row["wins"],
            "credited_winnings_pence": winnings_map.get((uid, gid), 0),
            "cooldown_until": cooldown_map.get((uid, gid)),
            "last_attempt": _iso(row.get("last_attempt")),
        })

    return {
        "items": items,
        "total_rows": count_rows[0]["total"] if count_rows else 0,
        "skip": max(0, skip),
        "limit": max(1, min(limit, 1000)),
        "games": [{
            "game_id": row["_id"],
            "game_name": game_map.get(row["_id"], row["_id"]),
            "attempt_count": row["attempt_count"],
            "tokens_spent": row["tokens_spent"],
            "wins": row["wins"],
            "credited_winnings_pence": game_winnings_map.get(row["_id"], 0),
        } for row in game_totals],
    }


@admin_router.post("/challenge/games/launch-all")
async def launch_all_challenge_games(request: Request):
    await require_admin(request)
    db = get_db()
    await _seed_challenges(db)
    rows = await db.special_challenge_games.find({}, {"_id": 0, "game_id": 1}).to_list(1000)
    for game in rows:
        await db.special_challenge_games.update_one(
            {"game_id": game["game_id"]},
            {"$set": {"enabled": True, "entry_tokens": 1}},
        )
    return {"launched_count": len(rows)}


@admin_router.put("/challenge/games/{game_id}")
async def save_challenge_game(game_id: str, body: ChallengeGameBody, request: Request):
    await require_admin(request)
    if body.game_id != game_id or not re.fullmatch(r"[a-z0-9-]{3,80}", game_id):
        raise HTTPException(400, "Invalid game ID")
    if body.type not in ("number_sequence", "colour_match"):
        raise HTTPException(400, "Unsupported game type")
    if not (2 <= body.size <= (200 if body.type == "number_sequence" else len(PALETTE))):
        raise HTTPException(400, "Invalid game size")
    if not (1 <= body.time_limit_seconds <= 3600):
        raise HTTPException(400, "Invalid timer")
    if body.entry_tokens != 1:
        raise HTTPException(400, "Each challenge attempt costs exactly 1 token")
    if not (0 <= body.prize_pence <= 100000000) or not (0 <= body.max_attempts <= 100000):
        raise HTTPException(400, "Invalid prize or attempt limit")
    if not (1 <= body.target_matches <= 500):
        raise HTTPException(400, "Target matches must be 1–500")
    if not body.name.strip() or len(body.name) > 100:
        raise HTTPException(400, "Invalid name")
    db = get_db()
    await _seed_challenges(db)
    existing = await db.special_challenge_games.find_one({"game_id": game_id})
    if existing and (existing["type"] != body.type or existing["size"] != body.size):
        raise HTTPException(400, "Cannot change the type or size of an existing game")
    row = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    row["entry_tokens"] = 1
    await db.special_challenge_games.update_one({"game_id": game_id}, {"$set": row}, upsert=True)
    return {"game": row}


# ------------------------------ Winnings wallet -------------------------------

@router.get("/wallet")
async def get_winnings_wallet(request: Request):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)
    wallet = await _get_wallet(db, user["user_id"])
    return {
        "currency": CURRENCY,
        "available_pence": wallet["available_pence"],
        "pending_pence": wallet["pending_pence"],
        "total_won_pence": wallet["total_won_pence"],
        "total_paid_pence": wallet["total_paid_pence"],
    }


@router.get("/ledger")
async def get_ledger(request: Request, limit: int = 100):
    user = await get_current_user(request)
    db = get_db()
    rows = await db.winnings_ledger.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(min(limit, 200))
    for r in rows:
        r["created_at"] = _iso(r.get("created_at"))
        r["processed_at"] = _iso(r.get("processed_at"))
    return {"items": rows}


# ------------------------------- Withdrawals ---------------------------------

class WithdrawBody(BaseModel):
    amount_pence: int
    account_holder: str
    sort_code: str
    account_number: str


@router.post("/withdraw")
async def request_withdrawal(body: WithdrawBody, request: Request):
    user = await get_current_user(request)
    db = get_db()
    await _ensure_indexes(db)

    amount = int(body.amount_pence)
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if not (body.account_holder and body.sort_code and body.account_number):
        raise HTTPException(400, "Bank details required")

    await _get_wallet(db, user["user_id"])
    # Atomic reserve: only succeeds if available >= amount (prevents over-spend
    # and concurrent double-withdrawal of the same funds).
    res = await db.winnings_wallets.update_one(
        {"user_id": user["user_id"], "available_pence": {"$gte": amount}},
        {"$inc": {"available_pence": -amount, "pending_pence": amount},
         "$set": {"updated_at": _now()}},
    )
    if res.modified_count != 1:
        raise HTTPException(400, "Insufficient available winnings")

    wid = uuid.uuid4().hex
    await db.withdrawal_requests.insert_one({
        "withdrawal_id": wid,
        "user_id": user["user_id"],
        "amount_pence": amount,
        "currency": CURRENCY,
        "status": "processing",
        "account_holder": body.account_holder,
        "sort_code": body.sort_code,
        "account_number": body.account_number,  # restricted; never in user APIs
        "created_at": _now(),
        "processed_at": None,
        "admin_id": None,
        "reject_reason": None,
    })
    await _ledger(db, user["user_id"], "withdrawal_pending", amount, reference=wid,
                  status="pending")
    await _audit(db, "withdrawal_request", user["user_id"], wid,
                 {"amount_pence": amount})
    return {"withdrawal_id": wid, "status": "processing", "amount_pence": amount}


@router.get("/withdrawals")
async def my_withdrawals(request: Request):
    user = await get_current_user(request)
    db = get_db()
    rows = await db.withdrawal_requests.find(
        {"user_id": user["user_id"]}, {"_id": 0, "account_number": 0, "sort_code": 0}
    ).sort("created_at", -1).to_list(100)
    for r in rows:
        r["created_at"] = _iso(r.get("created_at"))
        r["processed_at"] = _iso(r.get("processed_at"))
    return {"items": rows}


# ------------------------------ Admin: payouts --------------------------------

@admin_router.get("/withdrawals")
async def admin_list_withdrawals(request: Request, status: str = None):
    await require_admin(request)
    db = get_db()
    q = {}
    if status:
        q["status"] = status
    rows = await db.withdrawal_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [r["user_id"] for r in rows]
    umap = {}
    if ids:
        for u in await db.users.find({"user_id": {"$in": ids}},
                                     {"_id": 0, "user_id": 1, "name": 1, "email": 1, "public_id": 1}).to_list(len(ids)):
            umap[u["user_id"]] = u
    items = []
    for r in rows:
        u = umap.get(r["user_id"], {})
        items.append({
            "withdrawal_id": r["withdrawal_id"],
            "public_id": u.get("public_id"),
            "name": u.get("name"),
            "email": u.get("email"),
            "amount_pence": r["amount_pence"],
            "status": r["status"],
            "created_at": _iso(r.get("created_at")),
            "processed_at": _iso(r.get("processed_at")),
            "account_holder": r.get("account_holder"),
            "account_number_masked": _mask_account(r.get("account_number", "")),
            "sort_code": r.get("sort_code"),
        })
    return {"items": items}


@admin_router.get("/withdrawals/{withdrawal_id}/bank")
async def admin_withdrawal_bank(withdrawal_id: str, request: Request):
    """Reveals full bank details — authorized admin/super-admin only."""
    admin = await require_admin(request)
    if admin.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Insufficient permissions")
    db = get_db()
    r = await db.withdrawal_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Not found")
    await _audit(db, "withdrawal_bank_view", admin["user_id"], withdrawal_id)
    return {
        "withdrawal_id": withdrawal_id,
        "account_holder": r.get("account_holder"),
        "sort_code": r.get("sort_code"),
        "account_number": r.get("account_number"),
        "amount_pence": r.get("amount_pence"),
        "status": r.get("status"),
    }


@admin_router.post("/withdrawals/{withdrawal_id}/mark-paid")
async def admin_mark_paid(withdrawal_id: str, request: Request):
    admin = await require_admin(request)
    if admin.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Insufficient permissions")
    db = get_db()
    now = _now()
    # Atomic status guard: only transitions from 'processing' → idempotent.
    r = await db.withdrawal_requests.find_one_and_update(
        {"withdrawal_id": withdrawal_id, "status": "processing"},
        {"$set": {"status": "paid", "processed_at": now, "admin_id": admin["user_id"]}},
    )
    if not r:
        cur = await db.withdrawal_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0, "status": 1})
        if not cur:
            raise HTTPException(404, "Not found")
        return {"withdrawal_id": withdrawal_id, "status": cur["status"], "idempotent": True}
    await db.winnings_wallets.update_one(
        {"user_id": r["user_id"]},
        {"$inc": {"pending_pence": -r["amount_pence"], "total_paid_pence": r["amount_pence"]},
         "$set": {"updated_at": now}},
    )
    await _ledger(db, r["user_id"], "withdrawal_paid", r["amount_pence"], reference=withdrawal_id)
    await _audit(db, "withdrawal_paid", admin["user_id"], withdrawal_id,
                 {"amount_pence": r["amount_pence"]})
    return {"withdrawal_id": withdrawal_id, "status": "paid"}


class RejectBody(BaseModel):
    reason: str


@admin_router.post("/withdrawals/{withdrawal_id}/reject")
async def admin_reject(withdrawal_id: str, body: RejectBody, request: Request):
    admin = await require_admin(request)
    if admin.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Insufficient permissions")
    if not body.reason.strip():
        raise HTTPException(400, "Rejection reason required")
    db = get_db()
    now = _now()
    r = await db.withdrawal_requests.find_one_and_update(
        {"withdrawal_id": withdrawal_id, "status": "processing"},
        {"$set": {"status": "rejected", "processed_at": now,
                  "admin_id": admin["user_id"], "reject_reason": body.reason.strip()}},
    )
    if not r:
        cur = await db.withdrawal_requests.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0, "status": 1})
        if not cur:
            raise HTTPException(404, "Not found")
        return {"withdrawal_id": withdrawal_id, "status": cur["status"], "idempotent": True}
    # Release reserved funds back to available (exactly once).
    await db.winnings_wallets.update_one(
        {"user_id": r["user_id"]},
        {"$inc": {"pending_pence": -r["amount_pence"], "available_pence": r["amount_pence"]},
         "$set": {"updated_at": now}},
    )
    await _ledger(db, r["user_id"], "withdrawal_rejected", r["amount_pence"], reference=withdrawal_id)
    await _audit(db, "withdrawal_rejected", admin["user_id"], withdrawal_id,
                 {"amount_pence": r["amount_pence"], "reason": body.reason.strip()})
    return {"withdrawal_id": withdrawal_id, "status": "rejected"}
