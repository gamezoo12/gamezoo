"""Visual Draw Studio: multi-round, verifiable, cryptographically random Paid World draws.

Fairness: at lock time the eligible ticket pool is snapshotted and hashed and a secret
server seed is generated; only sha256(seed) is stored publicly. Each winner index is
derived from HMAC-SHA256(seed, "plan:round:winner:counter") with rejection sampling, so the
result is fixed the moment the plan is locked and can be recomputed by anyone once the
seed is revealed after the final round. The browser animation only reveals results.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from auth import require_super_admin
from deps import get_db

router = APIRouter(prefix="/api/admin/draw-studio", tags=["draw-studio"])

PLANS = "draw_studio_plans"
RESULTS = "draw_studio_results"
AUDIO = "draw_studio_audio"
AUDIT = "draw_studio_audit"
AUDIO_SLOTS = ("entry", "music", "heartbeat", "countdown", "drumroll", "reveal", "announcement", "celebration")
REWARD_TYPES = ("winnings", "bonus")
AUDIO_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/ogg", "audio/webm",
               "audio/aac", "audio/mp4", "audio/x-m4a"}
ALGORITHM = "hmac-sha256-rejection-v1"


def _now():
    return datetime.now(timezone.utc)


def _display_name(name: Optional[str], email: Optional[str]) -> str:
    raw = (name or "").strip() or (email or "Player").split("@")[0]
    parts = raw.split()
    return f"{parts[0]} {parts[-1][0]}." if len(parts) > 1 else parts[0][:18]


async def _audit(db, action: str, admin: dict, **fields):
    await db[AUDIT].insert_one({"audit_id": f"dsa_{secrets.token_hex(8)}", "action": action,
                                "actor_id": admin.get("user_id"), "actor_email": admin.get("email"),
                                "at": _now(), **fields})


async def _pool(db, contest_id: str) -> list[dict]:
    tickets = await db.tickets.find(
        {"contest_id": contest_id, "refunded": {"$ne": True}, "disqualified": {"$ne": True}},
        {"_id": 0, "ticket_id": 1, "ticket_number": 1, "user_id": 1},
    ).sort("ticket_number", 1).to_list(200000)
    users = {}
    ids = list({t["user_id"] for t in tickets})
    for chunk in range(0, len(ids), 5000):
        async for u in db.users.find({"user_id": {"$in": ids[chunk:chunk + 5000]}},
                                     {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
            users[u["user_id"]] = u
    return [{"ticket_id": t.get("ticket_id"), "ticket_number": int(t["ticket_number"]), "user_id": t["user_id"],
             "display_name": _display_name(users.get(t["user_id"], {}).get("name"), users.get(t["user_id"], {}).get("email"))}
            for t in tickets]


def _pool_hash(pool: list[dict]) -> str:
    canon = json.dumps([[p["ticket_number"], p["user_id"]] for p in pool], separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()


def select_winners(seed: str, plan_id: str, round_index: int, candidates: list[int], count: int) -> list[int]:
    """Deterministic, unbiased selection of `count` distinct ticket numbers from sorted candidates."""
    remaining = sorted(candidates)
    chosen = []
    for w in range(count):
        n = len(remaining)
        limit = (2 ** 256 // n) * n
        counter = 0
        while True:
            digest = hmac.new(seed.encode(), f"{plan_id}:{round_index}:{w}:{counter}".encode(), hashlib.sha256).digest()
            value = int.from_bytes(digest, "big")
            if value < limit:
                break
            counter += 1
        chosen.append(remaining.pop(value % n))
    return chosen


async def _upsert_winners(db, plan: dict, result: dict):
    """Idempotently create PENDING reward records; credited only after Super Admin approval."""
    cfg = plan["rounds"][result["round_index"]]
    reward_type = cfg.get("reward_type") or "winnings"
    users = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": [w["user_id"] for w in result["winners"]]}},
                                                          {"_id": 0, "user_id": 1, "name": 1, "username": 1, "email": 1})}
    for w in result["winners"]:
        u = users.get(w["user_id"], {})
        amount = float(w["prize_amount"])
        await db.winners.update_one({"winner_id": w["winner_id"]}, {"$setOnInsert": {
            "winner_id": w["winner_id"], "contest_id": plan["contest_id"], "contest_title": plan.get("contest_title"),
            "user_id": w["user_id"], "user_name": w["display_name"], "user_full_name": u.get("name"),
            "username": u.get("username"), "ticket_number": w["ticket_number"], "ticket_id": w.get("ticket_id"),
            "prize_amount": amount, "reward_type": reward_type,
            "prize_cash_amount": amount if reward_type == "winnings" else 0.0,
            "prize_bonus_tokens": amount if reward_type == "bonus" else 0.0,
            "proposed_amount": amount, "proposed_reward_type": reward_type,
            "prize_title": f"{plan.get('contest_title') or 'Prize draw'} — {cfg['name']}", "drawn_at": result["drawn_at"],
            "paid_out": False, "payment_status": "pending", "approval_status": "pending", "edit_history": [],
            "source": "draw_studio", "draw_plan_id": plan["plan_id"], "draw_round_index": result["round_index"],
            "draw_round_name": cfg["name"], "draw_result_id": result["result_id"]}}, upsert=True)


class RoundIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    prize_amount: float = Field(..., gt=0, le=1_000_000)
    num_winners: int = Field(..., ge=1, le=100)
    reward_type: Literal["winnings", "bonus"] = "winnings"
    load_duration_s: int = Field(default=12, ge=3, le=300)
    mix_duration_s: int = Field(default=15, ge=3, le=300)
    reveal_duration_s: int = Field(default=10, ge=3, le=120)
    duration_s: int = Field(default=30, ge=3, le=600)
    reveals: int = Field(default=3, ge=0, le=20)
    announcement_text: str = Field(default="", max_length=300)
    allow_previous_winners: bool = False


class PlanIn(BaseModel):
    contest_id: str
    rounds: list[RoundIn] = Field(..., min_length=1, max_length=20)


class ConfirmIn(BaseModel):
    confirmation: str


def _budget(rounds: list[dict]) -> float:
    return round(sum(float(r["prize_amount"]) * int(r["num_winners"]) for r in rounds), 2)


async def _validate(db, contest: dict, rounds: list[dict], pool_size: int):
    budget = _budget(rounds)
    published = round(float(contest.get("prize_amount") or 0), 2)
    if budget > published:
        raise HTTPException(status_code=422, detail=f"Total prizes £{budget:.2f} exceed the contest's published prize £{published:.2f}")
    used = 0
    for i, r in enumerate(rounds):
        available = pool_size - (0 if r["allow_previous_winners"] else used)
        if r["num_winners"] > available:
            raise HTTPException(status_code=422, detail=f"Round {i + 1} needs {r['num_winners']} winners but only {available} eligible tickets remain")
        used += r["num_winners"]
    return budget, published


def _public_plan(plan: dict) -> dict:
    out = {k: v for k, v in plan.items() if k not in ("_id", "server_seed", "pool_snapshot", "official_contest_lock")}
    if plan.get("status") == "completed":
        out["server_seed"] = plan.get("server_seed")
    return out


@router.get("/contests")
async def list_contests(request: Request):
    await require_super_admin(request)
    db = get_db()
    contests = await db.contests.find({}, {"_id": 0, "contest_id": 1, "title": 1, "prize_amount": 1, "status": 1,
                                           "tickets_sold": 1, "tickets_total": 1}).sort("created_at", -1).to_list(500)
    counts = {r["_id"]: r["n"] async for r in db.tickets.aggregate([
        {"$match": {"refunded": {"$ne": True}, "disqualified": {"$ne": True}}},
        {"$group": {"_id": "$contest_id", "n": {"$sum": 1}}}])}
    for c in contests:
        c["eligible_tickets"] = counts.get(c["contest_id"], 0)
    return {"contests": contests}


@router.get("/contests/{contest_id}/pool")
async def contest_pool(contest_id: str, request: Request):
    await require_super_admin(request)
    db = get_db()
    contest = await db.contests.find_one({"contest_id": contest_id}, {"_id": 0, "contest_id": 1, "title": 1, "prize_amount": 1, "status": 1})
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    pool = await _pool(db, contest_id)
    flags = await db.settings.find_one({"_id": "company"}, {"_id": 0, "random_draw_engine_enabled": 1}) or {}
    return {"contest": contest, "count": len(pool), "pool_hash": _pool_hash(pool),
            "tickets": [{"ticket_number": p["ticket_number"], "display_name": p["display_name"]} for p in pool],
            "official_draws_enabled": bool(flags.get("random_draw_engine_enabled"))}


@router.get("/plans")
async def list_plans(request: Request, contest_id: Optional[str] = None):
    await require_super_admin(request)
    db = get_db()
    rows = await db[PLANS].find({"contest_id": contest_id} if contest_id else {}, {"_id": 0, "pool_snapshot": 0}) \
        .sort("created_at", -1).to_list(100)
    return {"plans": [_public_plan(r) for r in rows]}


@router.post("/plans")
async def create_plan(body: PlanIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    contest = await db.contests.find_one({"contest_id": body.contest_id}, {"_id": 0})
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    rounds = [r.model_dump() for r in body.rounds]
    pool_size = len(await _pool(db, body.contest_id))
    budget, published = await _validate(db, contest, rounds, pool_size)
    plan = {"plan_id": f"dsp_{uuid.uuid4().hex[:12]}", "contest_id": body.contest_id, "contest_title": contest.get("title"),
            "rounds": rounds, "total_budget": budget, "published_prize": published, "status": "draft",
            "created_at": _now(), "created_by": admin.get("email"), "updated_at": _now()}
    await db[PLANS].insert_one(dict(plan))
    await _audit(db, "plan_created", admin, plan_id=plan["plan_id"], contest_id=body.contest_id, rounds=rounds)
    return {"plan": _public_plan(plan)}


@router.put("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    plan = await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan["status"] != "draft" or body.contest_id != plan["contest_id"]:
        raise HTTPException(status_code=409, detail="Locked plans cannot be edited")
    contest = await db.contests.find_one({"contest_id": plan["contest_id"]}, {"_id": 0})
    rounds = [r.model_dump() for r in body.rounds]
    budget, _ = await _validate(db, contest, rounds, len(await _pool(db, plan["contest_id"])))
    result = await db[PLANS].update_one({"plan_id": plan_id, "status": "draft"},
                                        {"$set": {"rounds": rounds, "total_budget": budget, "updated_at": _now()}})
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Plan was locked concurrently")
    await _audit(db, "plan_updated", admin, plan_id=plan_id, rounds=rounds)
    return {"plan": _public_plan(await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0}))}


@router.post("/plans/{plan_id}/lock")
async def lock_plan(plan_id: str, body: ConfirmIn, request: Request):
    admin = await require_super_admin(request)
    if body.confirmation != "LOCK DRAW":
        raise HTTPException(status_code=400, detail="Type LOCK DRAW to confirm")
    db = get_db()
    plan = await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan["status"] != "draft":
        return {"plan": _public_plan(plan), "idempotent_replay": True}
    if await db[PLANS].find_one({"contest_id": plan["contest_id"], "status": {"$in": ["locked", "in_progress", "completed"]}}):
        raise HTTPException(status_code=409, detail="This contest already has a locked or completed official draw")
    contest = await db.contests.find_one({"contest_id": plan["contest_id"]}, {"_id": 0})
    if contest.get("status") == "live":
        raise HTTPException(status_code=409, detail="Ticket sales are still open. Close the contest before locking the draw so every ticket is included.")
    pool = await _pool(db, plan["contest_id"])
    await _validate(db, contest, plan["rounds"], len(pool))
    seed = secrets.token_hex(32)
    fields = {"status": "locked", "locked_at": _now(), "locked_by": admin.get("email"), "pool_snapshot": pool,
              "pool_size": len(pool), "pool_hash_sha256": _pool_hash(pool), "server_seed": seed,
              "seed_commitment_sha256": hashlib.sha256(seed.encode()).hexdigest(), "algorithm": ALGORITHM,
              "official_contest_lock": plan["contest_id"]}
    try:
        result = await db[PLANS].update_one({"plan_id": plan_id, "status": "draft"}, {"$set": fields})
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="This contest already has a locked or completed official draw")
    if result.modified_count != 1:
        return {"plan": _public_plan(await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0})), "idempotent_replay": True}
    await _audit(db, "plan_locked", admin, plan_id=plan_id, pool_size=len(pool), pool_hash=fields["pool_hash_sha256"],
                 seed_commitment=fields["seed_commitment_sha256"])
    return {"plan": _public_plan(await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0})), "idempotent_replay": False}


@router.post("/plans/{plan_id}/rounds/{round_index}/draw")
async def draw_round(plan_id: str, round_index: int, body: ConfirmIn, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    plan = await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    existing = await db[RESULTS].find_one({"plan_id": plan_id, "round_index": round_index}, {"_id": 0})
    if existing:
        await _upsert_winners(db, plan, existing)
        return {"result": existing, "resumed": True}
    if body.confirmation != f"DRAW ROUND {round_index + 1}":
        raise HTTPException(status_code=400, detail=f"Type DRAW ROUND {round_index + 1} to confirm")
    flags = await db.settings.find_one({"_id": "company"}, {"_id": 0, "random_draw_engine_enabled": 1}) or {}
    if not flags.get("random_draw_engine_enabled"):
        raise HTTPException(status_code=423, detail="Official draws are disabled until the Random Draw engine is enabled in Company Settings after legal review")
    if plan["status"] not in ("locked", "in_progress"):
        raise HTTPException(status_code=409, detail="Lock the draw settings before starting the official draw")
    if not 0 <= round_index < len(plan["rounds"]):
        raise HTTPException(status_code=404, detail="Round not found")
    done = await db[RESULTS].find({"plan_id": plan_id}, {"_id": 0}).sort("round_index", 1).to_list(50)
    if len(done) != round_index:
        raise HTTPException(status_code=409, detail=f"Run Round {len(done) + 1} first")
    cfg = plan["rounds"][round_index]
    previous = {w["ticket_number"] for r in done for w in r["winners"]}
    by_number = {p["ticket_number"]: p for p in plan["pool_snapshot"]}
    candidates = [n for n in by_number if cfg["allow_previous_winners"] or n not in previous]
    numbers = select_winners(plan["server_seed"], plan_id, round_index, candidates, int(cfg["num_winners"]))
    now = _now()
    winners = [{"position": i + 1, "ticket_number": n, "ticket_id": by_number[n]["ticket_id"],
                "user_id": by_number[n]["user_id"], "display_name": by_number[n]["display_name"],
                "prize_amount": float(cfg["prize_amount"]),
                "winner_id": f"w_ds_{plan_id}_{round_index}_{i + 1}"} for i, n in enumerate(numbers)]
    result = {"result_id": f"dsr_{plan_id}_{round_index}", "plan_id": plan_id, "contest_id": plan["contest_id"],
              "round_index": round_index, "round_name": cfg["name"], "candidate_count": len(candidates),
              "candidates_hash_sha256": hashlib.sha256(json.dumps(sorted(candidates)).encode()).hexdigest(),
              "winners": winners, "drawn_at": now, "drawn_by": admin.get("email"), "algorithm": ALGORITHM}
    try:
        await db[RESULTS].insert_one(dict(result))
    except DuplicateKeyError:
        existing = await db[RESULTS].find_one({"plan_id": plan_id, "round_index": round_index}, {"_id": 0})
        await _upsert_winners(db, plan, existing)
        return {"result": existing, "resumed": True}
    await _upsert_winners(db, plan, result)
    final = round_index == len(plan["rounds"]) - 1
    await db[PLANS].update_one({"plan_id": plan_id}, {"$set": {"status": "completed" if final else "in_progress",
                                                               **({"completed_at": now} if final else {})}})
    await _audit(db, "round_drawn", admin, plan_id=plan_id, round_index=round_index,
                 winning_ticket_numbers=numbers, candidate_count=len(candidates))
    return {"result": result, "resumed": False}


@router.post("/plans/{plan_id}/rounds/{round_index}/revealed")
async def mark_revealed(plan_id: str, round_index: int, request: Request):
    """Marks the on-screen show of an already-fixed result as completed (recovery bookkeeping only)."""
    admin = await require_super_admin(request)
    db = get_db()
    r = await db[RESULTS].update_one({"plan_id": plan_id, "round_index": round_index, "revealed_at": {"$exists": False}},
                                     {"$set": {"revealed_at": _now(), "revealed_by": admin.get("email")}})
    if r.modified_count:
        await _audit(db, "round_revealed", admin, plan_id=plan_id, round_index=round_index)
    elif not await db[RESULTS].find_one({"plan_id": plan_id, "round_index": round_index}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Round has not been drawn")
    return {"ok": True}


@router.get("/plans/{plan_id}")
async def get_plan(plan_id: str, request: Request):
    await require_super_admin(request)
    db = get_db()
    plan = await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    results = await db[RESULTS].find({"plan_id": plan_id}, {"_id": 0}).sort("round_index", 1).to_list(50)
    return {"plan": _public_plan(plan), "results": results}


def _verify(plan: dict, results: list[dict]) -> dict:
    pool = plan.get("pool_snapshot") or []
    checks = {"pool_hash_matches": _pool_hash(pool) == plan.get("pool_hash_sha256"),
              "seed_matches_commitment": hashlib.sha256((plan.get("server_seed") or "").encode()).hexdigest() == plan.get("seed_commitment_sha256"),
              "rounds": []}
    previous = set()
    for r in results:
        cfg = plan["rounds"][r["round_index"]]
        candidates = [p["ticket_number"] for p in pool if cfg["allow_previous_winners"] or p["ticket_number"] not in previous]
        expected = select_winners(plan["server_seed"], plan["plan_id"], r["round_index"], candidates, int(cfg["num_winners"]))
        actual = [w["ticket_number"] for w in r["winners"]]
        checks["rounds"].append({"round_index": r["round_index"], "matches": expected == actual})
        previous |= set(actual)
    checks["verified"] = checks["pool_hash_matches"] and checks["seed_matches_commitment"] and all(x["matches"] for x in checks["rounds"])
    return checks


@router.get("/plans/{plan_id}/report")
async def plan_report(plan_id: str, request: Request):
    await require_super_admin(request)
    db = get_db()
    plan = await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    results = await db[RESULTS].find({"plan_id": plan_id}, {"_id": 0}).sort("round_index", 1).to_list(50)
    audit = await db[AUDIT].find({"plan_id": plan_id}, {"_id": 0}).sort("at", 1).to_list(200)
    completed = plan.get("status") == "completed"
    report = {"plan": _public_plan(plan), "results": results, "audit": audit,
              "pool_snapshot": [[p["ticket_number"], p["user_id"]] for p in plan.get("pool_snapshot") or []],
              "verification": _verify(plan, results) if completed else {"verified": None, "note": "Seed revealed after the final round"},
              "how_to_verify": ("sha256 of the JSON [[ticket_number,user_id],...] (no spaces) equals pool_hash_sha256; "
                                "sha256(server_seed) equals seed_commitment_sha256; for each round, candidates = sorted ticket numbers "
                                "(minus earlier winners unless allow_previous_winners); for winner w, counter c from 0: "
                                "v = int(HMAC_SHA256(server_seed, f'{plan_id}:{round}:{w}:{c}')); accept v < floor(2^256/n)*n; "
                                "pick index v % n and remove it.")}
    return JSONResponse(content=json.loads(json.dumps(report, default=str)),
                        headers={"Content-Disposition": f'attachment; filename="{plan_id}-audit.json"'})


@router.post("/plans/{plan_id}/rounds/{round_index}/announce")
async def announce_round(plan_id: str, round_index: int, request: Request):
    admin = await require_super_admin(request)
    db = get_db()
    result = await db[RESULTS].find_one({"plan_id": plan_id, "round_index": round_index}, {"_id": 0})
    if not result:
        raise HTTPException(status_code=404, detail="Round has not been drawn")
    if result.get("announcement_id"):
        return {"announcement_id": result["announcement_id"], "idempotent_replay": True}
    claim = await db[RESULTS].update_one(
        {"plan_id": plan_id, "round_index": round_index, "announcement_id": {"$exists": False},
         "announcement_claimed": {"$ne": True}}, {"$set": {"announcement_claimed": True}})
    if claim.modified_count != 1:
        raise HTTPException(status_code=409, detail="This announcement is already being published")
    plan = await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0, "rounds": 1, "contest_title": 1})
    cfg = plan["rounds"][round_index]
    names = ", ".join(f"#{w['ticket_number']} {w['display_name']}" for w in result["winners"])
    text = (cfg.get("announcement_text") or f"{cfg['name']} winner{'s' if len(result['winners']) > 1 else ''}: {{winners}} — £{cfg['prize_amount']:.2f}")
    text = text.replace("{winners}", names)[:300]
    from routers.announcement_routes import AnnouncementIn, create_announcement

    try:
        created = await create_announcement(AnnouncementIn(title=f"{plan.get('contest_title') or 'Prize draw'} — {cfg['name']}"[:120],
                                                           text=text, publish=True), request)
    except Exception:
        await db[RESULTS].update_one({"plan_id": plan_id, "round_index": round_index}, {"$unset": {"announcement_claimed": ""}})
        raise
    ann_id = created.get("announcement_id")
    await db[RESULTS].update_one({"plan_id": plan_id, "round_index": round_index},
                                 {"$set": {"announcement_id": ann_id, "announced_at": _now()}})
    await db.winners.update_many({"draw_plan_id": plan_id, "draw_round_index": round_index}, {"$set": {"published": True, "published_at": _now()}})
    await _audit(db, "round_announced", admin, plan_id=plan_id, round_index=round_index, announcement_id=ann_id)
    return {"announcement_id": ann_id, "idempotent_replay": False}


@router.post("/plans/{plan_id}/announce-all")
async def announce_all(plan_id: str, request: Request):
    """One site announcement listing every winner of every round; makes the winners public."""
    admin = await require_super_admin(request)
    db = get_db()
    plan = await db[PLANS].find_one({"plan_id": plan_id}, {"_id": 0, "pool_snapshot": 0, "server_seed": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.get("announcement_id"):
        return {"announcement_id": plan["announcement_id"], "idempotent_replay": True}
    results = await db[RESULTS].find({"plan_id": plan_id}, {"_id": 0}).sort("round_index", 1).to_list(50)
    if len(results) != len(plan["rounds"]):
        raise HTTPException(status_code=409, detail="Complete every round before announcing the winners")
    claim = await db[PLANS].update_one({"plan_id": plan_id, "announcement_id": {"$exists": False}, "announcement_claimed": {"$ne": True}},
                                       {"$set": {"announcement_claimed": True}})
    if claim.modified_count != 1:
        raise HTTPException(status_code=409, detail="This announcement is already being published")
    lines = [f"{plan['rounds'][r['round_index']]['name']}: " + ", ".join(f"#{w['ticket_number']} {w['display_name']}" for w in r["winners"])
             for r in results]
    from routers.announcement_routes import AnnouncementIn, create_announcement

    try:
        created = await create_announcement(AnnouncementIn(title=f"Winners — {plan.get('contest_title') or 'Prize draw'}"[:120],
                                                           text=("Congratulations! " + " · ".join(lines))[:300],
                                                           link="/my-account/contest-winners", publish=True), request)
    except Exception:
        await db[PLANS].update_one({"plan_id": plan_id}, {"$unset": {"announcement_claimed": ""}})
        raise
    now = _now()
    await db[PLANS].update_one({"plan_id": plan_id}, {"$set": {"announcement_id": created.get("announcement_id"), "winners_published_at": now}})
    await db.winners.update_many({"draw_plan_id": plan_id}, {"$set": {"published": True, "published_at": now}})
    await _audit(db, "winners_announced", admin, plan_id=plan_id, announcement_id=created.get("announcement_id"))
    return {"announcement_id": created.get("announcement_id"), "idempotent_replay": False}


@router.get("/audio")
async def list_audio(request: Request):
    await require_super_admin(request)
    db = get_db()
    rows = await db[AUDIO].find({"is_deleted": False}, {"_id": 0}).to_list(50)
    cfg = await db.settings.find_one({"_id": "draw_studio"}, {"_id": 0, "volumes": 1}) or {}
    return {"slots": AUDIO_SLOTS, "audio": rows, "volumes": cfg.get("volumes") or {}}


@router.post("/audio/{slot}")
async def upload_audio(slot: str, request: Request, file: UploadFile = File(...)):
    admin = await require_super_admin(request)
    if slot not in AUDIO_SLOTS:
        raise HTTPException(status_code=404, detail="Unknown sound slot")
    content_type = (file.content_type or "").lower()
    if content_type not in AUDIO_TYPES:
        raise HTTPException(status_code=415, detail="Upload an MP3, WAV, OGG, AAC or M4A audio file")
    data = await file.read()
    if not data or len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio must be under 15 MB")
    from object_storage import APP_NAME, put_object

    ext = (file.filename or "a.mp3").rsplit(".", 1)[-1][:5].lower()
    stored = put_object(f"{APP_NAME}/draw-studio/audio/{slot}/{uuid.uuid4().hex}.{ext}", data, content_type)
    db = get_db()
    await db[AUDIO].update_many({"slot": slot, "is_deleted": False}, {"$set": {"is_deleted": True}})
    doc = {"slot": slot, "storage_path": stored["path"], "original_filename": file.filename, "content_type": content_type,
           "size": len(data), "is_deleted": False, "uploaded_at": _now(), "uploaded_by": admin.get("email")}
    await db[AUDIO].insert_one(dict(doc))
    doc.pop("_id", None)
    return {"audio": doc}


@router.get("/audio/{slot}/file")
async def audio_file(slot: str, request: Request):
    await require_super_admin(request)
    doc = await get_db()[AUDIO].find_one({"slot": slot, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No audio uploaded for this slot")
    from object_storage import get_object

    data, _ = get_object(doc["storage_path"])
    return Response(content=data, media_type=doc["content_type"])


async def ensure_draw_studio_indexes(db):
    await db[RESULTS].create_index([("plan_id", 1), ("round_index", 1)], unique=True)
    await db.draw_studio_recordings.create_index("recording_id", unique=True)
    await db[PLANS].create_index("plan_id", unique=True)
    await db[PLANS].create_index("official_contest_lock", unique=True, sparse=True)
