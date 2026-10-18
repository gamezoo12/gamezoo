from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request
from auth import require_admin
from deps import get_db

router = APIRouter(prefix="/api/admin/users", tags=["user-activity"])
SOURCES = [
    ("game_scores", "Game score"),
    ("tickets", "Ticket"),
    ("orders", "Order"),
    ("wallet_transactions", "Wallet transaction"),
    ("payment_transactions", "Payment"),
    ("notifications", "Notification"),
    ("support_cases", "Support case"),
    ("referrals", "Referral"),
]
FIELDS = ("status", "kind", "type", "game", "game_id", "world", "contest_id", "ticket_id", "amount", "tokens", "reason")

@router.get("/{user_id}/activity")
async def activity(user_id: str, request: Request, day: str = "", limit: int = 200):
    await require_admin(request)
    db = get_db()
    if not await db.users.find_one({"user_id": user_id}, {"_id": 1}):
        raise HTTPException(404, "User not found")
    if day:
        try:
            start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "Invalid date")
    limit = min(max(limit, 1), 500)
    items = []
    for collection, label in SOURCES:
        query = {"user_id": user_id}
        if day:
            query["created_at"] = {"$gte": start, "$lt": start + timedelta(days=1)}
        records = await db[collection].find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        for record in records:
            at = record.get("created_at") or record.get("updated_at")
            if isinstance(at, datetime):
                at = at.isoformat()
            items.append({"source": label, "at": str(at) if at else None, "details": {k: record[k] for k in FIELDS if isinstance(record.get(k), (str, int, float, bool))}})
    items.sort(key=lambda item: item["at"] or "", reverse=True)
    return {"events": items[:limit], "note": "Only actions already recorded by Prize League are available."}
