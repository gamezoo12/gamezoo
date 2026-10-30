"""Super Admin winners overview across Free World, Paid World, Promotions and Impossible Challenges, with audited four-wallet adjustments."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_super_admin
from deps import get_db

router = APIRouter(prefix="/api/admin/winners-all", tags=["admin-winners-all"])
World = Literal["free", "paid", "promotions", "challenges"]
ADJ = "winner_wallet_adjustments"


def _iso(v):
    return v.replace(tzinfo=timezone.utc).isoformat() if isinstance(v, datetime) and v.tzinfo is None else v.isoformat() if isinstance(v, datetime) else v


def _row(rid, world, d, *, contest, user_id, rank=None, ticket=None, prize, wallet, status, at=None, editable=False):
    return {"record_id": rid, "world": world, "contest": contest, "user_id": user_id, "rank": rank, "ticket_number": ticket,
            "prize_amount": round(float(prize or 0), 2), "wallet_type": wallet, "credit_status": status, "at": _iso(at),
            "pending_editable": editable, "winner_id": d.get("winner_id")}


def _paid_status(w):
    return "credited" if w.get("paid_out") else (w.get("approval_status") or "pending")


async def _free(db):
    out = []
    async for d in db.world_winner_awards.find({}).sort("frozen_at", -1).limit(500):
        out.append(_row(f"wwa:{d['_id']}", "free", d, contest=f"Free World · Global Contest {d.get('global_contest_number')}", user_id=d["user_id"],
                        rank=d.get("rank"), prize=d.get("winning_amount"), wallet="winnings",
                        status="credited" if d.get("wallet_credited") or d.get("status") == "paid" else d.get("status") or "pending", at=d.get("frozen_at")))
    async for d in db.world_gc_champion_awards.find({}).sort("frozen_at", -1).limit(500):
        out.append(_row(f"wgca:{d['_id']}", "free", d, contest=f"Free World · GC{d.get('gc_number')} Champion", user_id=d["user_id"], rank=d.get("rank"),
                        prize=d.get("champion_prize_tokens"), wallet="winnings", status="credited" if d.get("status") == "credited" else "pending", at=d.get("frozen_at")))
    async for d in db.world_gc_level_bonus_awards.find({}).sort("finalized_at", -1).limit(500):
        out.append(_row(f"wglb:{d['_id']}", "free", d, contest=f"Free World · GC{d.get('gc_number')} {d.get('level_key')}", user_id=d["user_id"], rank=d.get("rank"),
                        prize=d.get("bonus_tokens"), wallet="bonus", status="credited" if d.get("status") == "credited" else d.get("status") or "pending", at=d.get("finalized_at")))
    return out


async def _winners(db, promo: bool):
    q = {"contest_id": {"$regex": "^promo_"}} if promo else {"contest_id": {"$not": {"$regex": "^promo_"}}}
    rows = await db.winners.find(q).sort("drawn_at", -1).to_list(1000)
    titles = {c["contest_id"]: c.get("title") async for c in db.contests.find({"contest_id": {"$in": list({r["contest_id"] for r in rows})}}, {"_id": 0, "contest_id": 1, "title": 1})}
    world = "promotions" if promo else "paid"
    return [_row(f"win:{d['winner_id']}", world, d, contest=d.get("contest_title") or titles.get(d["contest_id"]) or d.get("prize_title") or d["contest_id"],
                 user_id=d["user_id"], rank=d.get("position") or d.get("rank"), ticket=d.get("ticket_number"), prize=d.get("prize_amount"),
                 wallet=d.get("credited_wallet") or d.get("reward_type") or "winnings", status=_paid_status(d), at=d.get("drawn_at"),
                 editable=d.get("source") == "draw_studio" and _paid_status(d) == "pending") for d in rows]


async def _promotion_draws(db):
    out = []
    async for d in db.promotion_draws.find({}).sort("drawn_at", -1).limit(200):
        for w in d.get("winners", []):
            out.append(_row(f"pdw:{d['_id']}:{w.get('place')}", "promotions", {}, contest=f"Promotion · {d.get('promotion_name') or d.get('promotion_id')}",
                            user_id=w["user_id"], rank=w.get("place"), ticket=w.get("ticket_number"), prize=w.get("prize_gbp"), wallet="winnings",
                            status="credited" if w.get("payment_status") == "paid" else w.get("verification_status") or "pending", at=d.get("drawn_at")))
    async for d in db.promotion_manual_winners.find({}):
        out.append(_row(f"pmw:{d['_id']}", "promotions", {}, contest=f"Promotion · {d.get('promotion_id')} (selected winner)", user_id=d["user_id"],
                        ticket=d.get("ticket_number"), prize=0, wallet="winnings", status="selected", at=d.get("selected_at")))
    return out


async def _challenges(db):
    names = {g.get("challenge_id") or g.get("game_id"): g.get("title") or g.get("name") async for g in db.special_challenge_games.find({}, {"_id": 0})}
    return [_row(f"scr:{d['_id']}", "challenges", {}, contest=f"Impossible Challenge · {names.get(d.get('challenge_id')) or d.get('challenge_id')}",
                 user_id=d["user_id"], prize=(d.get("reward_pence") or 0) / 100, wallet="winnings",
                 status="credited" if d.get("reward_status") == "credited" else d.get("reward_status") or "pending", at=d.get("created_at"))
            async for d in db.special_challenge_rewards.find({}).sort("created_at", -1).limit(500)]


async def _rows(db, world: str):
    if world == "free":
        return await _free(db)
    if world == "paid":
        return await _winners(db, promo=False)
    if world == "promotions":
        return await _winners(db, promo=True) + await _promotion_draws(db)
    return await _challenges(db)


@router.get("")
async def list_all(request: Request, world: World = "paid"):
    await require_super_admin(request)
    db = get_db()
    rows = await _rows(db, world)
    uids = list({r["user_id"] for r in rows})
    users = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "username": 1, "email": 1})}
    hist: dict = {}
    async for a in db[ADJ].find({"record_id": {"$in": [r["record_id"] for r in rows]}}, {"_id": 0}).sort("at", -1):
        a["at"] = _iso(a["at"])
        hist.setdefault(a["record_id"], []).append(a)
    for r in rows:
        u = users.get(r["user_id"], {})
        r.update(username=u.get("username"), full_name=u.get("name"), email=u.get("email"), adjustments=hist.get(r["record_id"], []))
    return {"world": world, "winners": rows}


class AdjustIn(BaseModel):
    world: World
    record_id: str = Field(..., max_length=120)
    wallet: Literal["winnings", "bonus", "winning_bonus", "topup"]
    action: Literal["credit", "debit"]
    amount: float = Field(..., gt=0, le=1_000_000)
    reason: str = Field(..., min_length=5, max_length=300)
    operation_id: str = Field(..., min_length=8, max_length=80)


@router.post("/adjust")
async def adjust(body: AdjustIn, request: Request):
    from services.wallet_admin_adjust import WALLET_LABELS, adjust_single_wallet

    admin = await require_super_admin(request)
    db = get_db()
    row = next((r for r in await _rows(db, body.world) if r["record_id"] == body.record_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Winner record not found")
    amount = round(body.amount, 2) * (1 if body.action == "credit" else -1)
    note = f"Winner {body.action} · {row['contest']}: {body.reason.strip()}"[:300]
    res = await adjust_single_wallet(db, row["user_id"], body.wallet, amount, note=note, operation_id=f"winner_adj:{body.operation_id}", admin=admin)
    if not res.get("idempotent_replay"):
        await db[ADJ].insert_one({"record_id": body.record_id, "world": body.world, "user_id": row["user_id"], "contest": row["contest"],
                                  "wallet": body.wallet, "action": body.action, "amount": abs(amount), "reason": body.reason.strip(),
                                  "tx_id": res["tx"]["tx_id"], "operation_id": body.operation_id, "admin_email": admin.get("email"),
                                  "at": datetime.now(timezone.utc)})
        await db.audit_log.insert_one({"audit_id": f"aud_wadj_{body.operation_id}", "kind": "winner_wallet_adjustment", "record_id": body.record_id,
                                       "world": body.world, "user_id": row["user_id"], "wallet": body.wallet, "amount": amount,
                                       "reason": body.reason.strip(), "tx_id": res["tx"]["tx_id"], "admin_email": admin.get("email"),
                                       "at": datetime.now(timezone.utc)})
    return {"ok": True, "wallet_label": WALLET_LABELS[body.wallet], "wallets": res.get("wallets"), "idempotent_replay": bool(res.get("idempotent_replay"))}

