async def mark_verified_reviewers(db, rows: list[dict]) -> list[dict]:
    """Add `verified_reviewer` to leaderboard rows (display only)."""
    ids = list({r.get("user_id") for r in rows if r.get("user_id")})
    verified = set(await db.users.distinct("user_id", {"user_id": {"$in": ids}, "verified_reviewer": True})) if ids else set()
    for r in rows:
        r["verified_reviewer"] = r.get("user_id") in verified
    return rows
