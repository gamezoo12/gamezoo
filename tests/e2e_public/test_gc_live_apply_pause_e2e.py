# E2E regression (public URL): GC live apply-current/apply-future, Free World pause/resume, preview sandbox isolation
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"
SUPER = {"email": "bachanta8@gmail.com", "password": "Herts@910022"}
PLAYER = {"email": "player1@example.com", "password": "Player@12345"}
TMP_ADMIN_EMAIL = "test_tmp_admin_gc@example.com"


def _mongo():
    env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l and not l.startswith("#"))
    return MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def db():
    return _mongo()


@pytest.fixture(scope="module")
def su():
    return _login(SUPER)


@pytest.fixture(scope="module")
def player():
    return _login(PLAYER)


@pytest.fixture(scope="module")
def plain_admin(db):
    src = db.users.find_one({"email": PLAYER["email"]})
    doc = {k: v for k, v in src.items() if k != "_id"}
    doc.update({"email": TMP_ADMIN_EMAIL, "user_id": "user_tmp_admin_gc", "public_id": "PLTMPADM", "role": "admin",
                "referral_code": "TMPADMGC", "phone": None})
    db.users.delete_many({"email": TMP_ADMIN_EMAIL})
    db.users.insert_one(doc)
    try:
        yield _login({"email": TMP_ADMIN_EMAIL, "password": PLAYER["password"]})
    finally:
        db.users.delete_many({"email": TMP_ADMIN_EMAIL})


# ---------------- GC settings GET / status
class TestGCGet:
    def test_gc4_get_active_with_level_states(self, su):
        r = requests.get(f"{API}/admin/world-gc/competitions/4", headers=su, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["config"]["activation_status"] == "active"
        ls = d["level_states"]
        assert ls["is_active_gc"] is True and ls["active_gc"] == 4
        assert [l["opened"] for l in ls["levels"][:8]] == [True] * 8
        assert ls["levels"][8]["opened"] is False
        assert ls["next_unopened_level"] == 9
        assert ls["levels"][8]["game_id"] in ("colour_match", "number_sequence")

    def test_legacy_schedule_activate_410(self, su):
        for ep in ("schedule", "activate"):
            r = requests.post(f"{API}/admin/world-gc/competitions/4/{ep}", json={"confirmation": "x"}, headers=su, timeout=30)
            assert r.status_code == 410, (ep, r.status_code, r.text)


# ---------------- apply-current on GC4
class TestApplyCurrent:
    def test_put_strips_schedule_and_apply(self, su, db):
        before_audit = db.world_gc_config_audit.count_documents({"gc_number": 4, "action": "apply_current"})
        TOP = 50 + int(time.time()) % 400
        d = requests.get(f"{API}/admin/world-gc/competitions/4", headers=su, timeout=30).json()
        draft = d["draft"]
        levels = []
        for row in draft["levels"]:
            row = {k: row.get(k) for k in ("level", "game_id", "game_config", "bonus_rewards")}
            row["opens_at"] = "2030-01-01T00:00:00Z"
            if row["level"] == 9:
                row["game_id"] = "colour_match"
                row["game_config"] = {"colours": 5, "rounds": 10}
                row["bonus_rewards"] = {"1": TOP, "2": 41, "3": 31, "4": 21, "5": 11}
            levels.append(row)
        body = {"model": "every_level", "levels": levels,
                "champion": {"game_id": "colour_match", "game_config": {"colours": 6, "rounds": 20},
                             "opens_at": "2030-01-01T00:00:00Z", "closes_at": "2030-01-02T00:00:00Z"}}
        r = requests.put(f"{API}/admin/world-gc/competitions/4", json=body, headers=su, timeout=30)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/admin/world-gc/competitions/4", headers=su, timeout=30).json()
        assert g["has_unapplied_draft"] is True
        for row in g["draft"]["levels"]:
            assert row.get("opens_at") in (None, ""), row
        assert g["level_states"]["levels"][8]["opens_at"].startswith("2026-10-30")
        # bad confirmation
        r = requests.post(f"{API}/admin/world-gc/competitions/4/apply-current", json={"confirmation": "apply gc4"}, headers=su, timeout=30)
        assert r.status_code == 400
        r = requests.post(f"{API}/admin/world-gc/competitions/4/apply-current", json={"confirmation": "APPLY GC4"}, headers=su, timeout=30)
        assert r.status_code == 200, r.text
        res = r.json()
        assert res["idempotent_replay"] is False
        assert res["affected_levels"] == [9, 10]
        assert res["locked_levels"] == list(range(1, 9))
        assert res["config"]["levels"][8]["bonus_rewards"]["1"] == TOP
        assert "pending_draft" not in res["config"]
        after = db.world_gc_config_audit.count_documents({"gc_number": 4, "action": "apply_current"})
        assert after == before_audit + 1

    def test_apply_repeat_idempotent_no_audit(self, su, db):
        before = db.world_gc_config_audit.count_documents({"gc_number": 4})
        r = requests.post(f"{API}/admin/world-gc/competitions/4/apply-current", json={"confirmation": "APPLY GC4"}, headers=su, timeout=30)
        assert r.status_code == 200
        assert r.json()["idempotent_replay"] is True
        assert db.world_gc_config_audit.count_documents({"gc_number": 4}) == before

    def test_identical_draft_replay_clears_pending(self, su):
        """Saving a draft identical to applied, then apply → idempotent; draft should not stay 'unapplied'."""
        g = requests.get(f"{API}/admin/world-gc/competitions/4", headers=su, timeout=30).json()
        cfg = g["config"]
        body = {"model": cfg["model"], "levels": [{k: r.get(k) for k in ("level", "game_id", "game_config", "bonus_rewards")} for r in cfg["levels"]],
                "champion": {"game_id": cfg["champion"]["game_id"], "game_config": cfg["champion"].get("game_config") or {}}}
        assert requests.put(f"{API}/admin/world-gc/competitions/4", json=body, headers=su, timeout=30).status_code == 200
        r = requests.post(f"{API}/admin/world-gc/competitions/4/apply-current", json={"confirmation": "APPLY GC4"}, headers=su, timeout=30)
        assert r.status_code == 200
        assert r.json()["idempotent_replay"] is True
        g2 = requests.get(f"{API}/admin/world-gc/competitions/4", headers=su, timeout=30).json()
        assert g2["has_unapplied_draft"] is False, "pending_draft left behind after idempotent replay (UI keeps 'unapplied draft')"

    def test_apply_current_admin_role_403(self, plain_admin):
        r = requests.post(f"{API}/admin/world-gc/competitions/4/apply-current", json={"confirmation": "APPLY GC4"}, headers=plain_admin, timeout=30)
        assert r.status_code == 403

    def test_apply_current_player_forbidden(self, player):
        r = requests.post(f"{API}/admin/world-gc/competitions/4/apply-current", json={"confirmation": "APPLY GC4"}, headers=player, timeout=30)
        assert r.status_code in (401, 403)

    def test_apply_future_on_gc4_409(self, su):
        r = requests.post(f"{API}/admin/world-gc/competitions/4/apply-future", json={"confirmation": "APPLY GC4 FUTURE"}, headers=su, timeout=30)
        assert r.status_code == 409

    def test_gc5_apply_current_409(self, su):
        r = requests.post(f"{API}/admin/world-gc/competitions/5/apply-current", json={"confirmation": "APPLY GC5"}, headers=su, timeout=30)
        assert r.status_code == 409


# ---------------- apply-future on GC5 (restored after)
class TestApplyFutureGC5:
    def test_gc5_future_flow(self, su, db):
        key = {"season_id": "season-1", "gc_number": 5}
        original = db.world_gc_competition_configs.find_one(key)
        try:
            levels = [{"level": n, "game_id": "number_sequence" if n % 2 else "colour_match",
                       "game_config": {} if n % 2 else {"colours": 6, "rounds": 10},
                       "bonus_rewards": {"1": 5, "2": 4, "3": 3, "4": 2, "5": 1}} for n in range(1, 11)]
            body = {"model": "every_level", "levels": levels, "champion": {"game_id": "number_sequence", "game_config": {}}}
            r = requests.put(f"{API}/admin/world-gc/competitions/5", json=body, headers=su, timeout=30)
            assert r.status_code == 200, r.text
            r = requests.post(f"{API}/admin/world-gc/competitions/5/apply-future", json={"confirmation": "APPLY GC5"}, headers=su, timeout=30)
            assert r.status_code == 400
            r = requests.post(f"{API}/admin/world-gc/competitions/5/apply-future", json={"confirmation": "APPLY GC5 FUTURE"}, headers=su, timeout=30)
            assert r.status_code == 200, r.text
            cfg = r.json()["config"]
            assert cfg["activation_status"] == "active"
            assert cfg["engine"] == "legacy_hybrid"
            assert all(l.get("opens_at") for l in cfg["levels"])
            r2 = requests.post(f"{API}/admin/world-gc/competitions/5/apply-future", json={"confirmation": "APPLY GC5 FUTURE"}, headers=su, timeout=30)
            assert r2.status_code in (200, 409)
            if r2.status_code == 200:
                assert r2.json()["idempotent_replay"] is True
        finally:
            db.world_gc_competition_configs.delete_many(key)
            if original:
                db.world_gc_competition_configs.insert_one(original)
            db.world_gc_config_audit.delete_many({"gc_number": 5})


# ---------------- pause / resume (always resumed at end)
class TestPause:
    def test_pause_resume_flow(self, su, player, plain_admin, db):
        sched_before = db.world_settings.find_one({"_id": "active_global_contest"}, {"_id": 0, "season_start_at": 1, "championship_extensions": 1})
        try:
            assert requests.post(f"{API}/admin/world-gc/free-world/pause", json={}, headers=plain_admin, timeout=30).status_code == 403
            assert requests.post(f"{API}/admin/world-gc/free-world/pause", json={}, headers=player, timeout=30).status_code in (401, 403)
            r = requests.post(f"{API}/admin/world-gc/free-world/pause", json={"reason": "TEST_pause"}, headers=su, timeout=30)
            assert r.status_code == 200 and r.json()["paused"] is True and r.json()["idempotent_replay"] is False
            r = requests.post(f"{API}/admin/world-gc/free-world/pause", json={"reason": "TEST_pause"}, headers=su, timeout=30)
            assert r.json()["idempotent_replay"] is True
            assert requests.get(f"{API}/world/pause-status", timeout=30).json()["paused"] is True
            r = requests.post(f"{API}/world/session/start", json={"level": 1}, headers=player, timeout=30)
            assert r.status_code == 423, r.text
            assert r.json()["detail"]["code"] == "FREE_WORLD_PAUSED"
            assert requests.post(f"{API}/admin/world-gc/free-world/resume", json={}, headers=plain_admin, timeout=30).status_code == 403
        finally:
            r = requests.post(f"{API}/admin/world-gc/free-world/resume", json={}, headers=su, timeout=30)
            if r.status_code == 409:
                r = requests.post(f"{API}/admin/world-gc/free-world/resume",
                                  json={"acknowledge_schedule_passed": True, "confirmation": "RESUME ON EXISTING SCHEDULE"}, headers=su, timeout=30)
            assert r.status_code == 200, r.text
        assert requests.get(f"{API}/world/pause-status", timeout=30).json()["paused"] is False
        r = requests.post(f"{API}/admin/world-gc/free-world/resume", json={}, headers=su, timeout=30)
        assert r.json()["idempotent_replay"] is True
        sched_after = db.world_settings.find_one({"_id": "active_global_contest"}, {"_id": 0, "season_start_at": 1, "championship_extensions": 1})
        assert sched_before == sched_after
        audits = list(db.world_gc_config_audit.find({"action": {"$in": ["pause", "resume"]}}).sort("created_at", -1).limit(2))
        assert {a["action"] for a in audits} == {"pause", "resume"}


# ---------------- preview isolation
class TestPreview:
    COLS = ["world_progress", "world_game_sessions", "wallets", "bonus_grants", "world_gc_level_bests",
            "world_gc_level_bonus_awards", "world_winner_awards", "world_gc_competition_configs"]

    def _snap(self, db):
        snap = {c: db[c].count_documents({}) for c in self.COLS}
        snap["gc4_contest"] = db.world_global_contests.find_one({"contest_number": 4}, {"_id": 0})
        snap["gc4_cfg"] = db.world_gc_competition_configs.find_one({"gc_number": 4}, {"_id": 0})
        snap["settings"] = db.world_settings.find_one({"_id": "active_global_contest"}, {"_id": 0})
        return snap

    def test_preview_full_flow_isolated(self, su, db, plain_admin):
        assert requests.post(f"{API}/admin/world-gc/preview/reset", json={"gc_number": 4}, headers=plain_admin, timeout=30).status_code == 403
        before = self._snap(db)
        act = lambda body: requests.post(f"{API}/admin/world-gc/preview/action", json=body, headers=su, timeout=30)
        r = requests.post(f"{API}/admin/world-gc/preview/reset", json={"gc_number": 4}, headers=su, timeout=30)
        assert r.status_code == 200 and r.json()["isolated"] is True
        assert act({"action": "update_config", "config": {"model": "every_level", "levels": [{"level": 1, "game_id": "memory_match", "game_config": {"pair_count": 2}}]}}).status_code == 200
        assert act({"action": "set_time", "sim_now": "2026-11-01T00:00:00Z"}).status_code == 200
        assert act({"action": "open_level", "level": "L1"}).status_code == 200
        r = act({"action": "memory_start", "level": "L1"})
        assert r.status_code == 200, r.text
        cards = r.json()["preview"]["memory"]["card_count"]
        assert cards == 4
        # brute-force solve via reveals
        symbols = {}
        for p in range(cards):
            rr = act({"action": "memory_click", "level": "L1", "position": p})
            if rr.status_code == 200:
                symbols[p] = rr.json()["reveal"]["symbol"]
        done = False
        for _ in range(10):
            st = requests.get(f"{API}/admin/world-gc/preview", headers=su, timeout=30).json()["preview"]["memory"]
            if st["status"] == "completed":
                done = True
                break
            matched = set(st["matched_positions"])
            left = [p for p in range(cards) if p not in matched]
            sym_to = {}
            for p in left:
                sym_to.setdefault(symbols.get(p), []).append(p)
            pair = next((v for v in sym_to.values() if len(v) >= 2), None)
            if not pair:
                break
            act({"action": "memory_click", "level": "L1", "position": pair[0]})
            act({"action": "memory_click", "level": "L1", "position": pair[1]})
        assert done, "memory match not completed"
        r = act({"action": "memory_start", "level": "L1"})
        assert r.json()["preview"]["memory"]["retries"] == 1
        assert act({"action": "simulate_players", "level": "L1", "count": 6}).status_code == 200
        r = act({"action": "finalize_level", "level": "L1"})
        assert r.status_code == 200
        assert len(r.json()["preview"]["finalizations"]["L1"]) == 5
        assert act({"action": "finalize_level", "level": "L1"}).status_code == 409
        assert act({"action": "jump", "level": "champion"}).status_code == 200
        assert act({"action": "simulate_players", "level": "champion", "count": 6}).status_code == 200
        r = act({"action": "finalize_level", "level": "champion"})
        assert r.status_code == 200
        p = r.json()["preview"]
        assert p["champion_result"] and len(p["champion_result"]) == 5
        assert any(w.get("bonus_credited") or w.get("bonus_forfeited") for w in p["wallet"].values())
        assert act({"action": "bogus"}).status_code == 422
        bad = act({"action": "jump", "level": "L99"})
        assert bad.status_code == 422
        after = self._snap(db)
        assert before == after
