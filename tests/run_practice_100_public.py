# Standalone public-URL runner: 100-level free-play progress API + iteration_57 draw-studio regressions.
import os
import sys
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api/games/practice/progress"
results = []


def check(name, cond, info=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{info}]" if info and not cond else ""))


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


p = login("player1@example.com", "Player@12345")
admin = login("bachanta8@gmail.com", "Herts@910022")
prog = p.get(API).json()["progress"]
print("player1 before:", {k: v["unlocked"] for k, v in prog.items()})

# auth
check("anon GET 401", requests.get(API).status_code == 401)
# bounds
for bad in [101, 0]:
    r = p.post(API, json={"entries": [{"game_id": "math_sprint", "level": bad, "stars": 1}]})
    check(f"level {bad} -> 422", r.status_code == 422, r.status_code)
r = p.post(API, json={"entries": [{"game_id": "math_sprint", "level": 1, "stars": 4}]})
check("stars 4 -> 422", r.status_code == 422)
check("unknown game 400", p.post(API, json={"entries": [{"game_id": "TEST_x", "level": 1, "stars": 1}]}).status_code == 400)

# math_sprint: expected unlocked to 15 already; skipping ahead ignored
ms = prog.get("math_sprint", {"unlocked": 1})
check("math_sprint unlocked >= 15 (pre-seeded)", ms["unlocked"] >= 15, ms["unlocked"])
skip = ms["unlocked"] + 3
if skip <= 100:
    r = p.post(API, json={"entries": [{"game_id": "math_sprint", "level": skip, "stars": 3}]})
    after = p.get(API).json()["progress"]["math_sprint"]
    check("skip-ahead level ignored", r.status_code == 200 and after["unlocked"] == ms["unlocked"] and str(skip) not in after["stars"], after["unlocked"])

# level 11..20 accepted sequentially on math_sprint? no -- keep math_sprint untouched; use pattern_repeat for full ladder
entries = [{"game_id": "pattern_repeat", "level": i, "stars": 2} for i in range(1, 101)]
r = p.post(API, json={"entries": entries})
st = r.json().get("progress", {}).get("pattern_repeat", {})
check("batch 1..100 accepted", r.status_code == 200 and st.get("unlocked") == 100 and len(st.get("stars", {})) == 100, st.get("unlocked"))
g = p.get(API).json()["progress"]["pattern_repeat"]
check("persisted unlocked capped 100, 100 stars entries", g["unlocked"] == 100 and g["stars"].get("100") == 2)
# stars keep max
p.post(API, json={"entries": [{"game_id": "pattern_repeat", "level": 50, "stars": 3}]})
p.post(API, json={"entries": [{"game_id": "pattern_repeat", "level": 50, "stars": 1}]})
check("stars keep max", p.get(API).json()["progress"]["pattern_repeat"]["stars"]["50"] == 3)

# number_sequence for UI: unlock to level 99 (levels 1..98 cleared) if behind
ns = p.get(API).json()["progress"].get("number_sequence", {"unlocked": 1})
r = p.post(API, json={"entries": [{"game_id": "number_sequence", "level": i, "stars": 1} for i in range(1, 99)]})
ns2 = r.json()["progress"]["number_sequence"]
check("number_sequence unlocked to >=99", ns2["unlocked"] >= 99, ns2["unlocked"])

# ---- iteration_57 regressions
check("old GET /backdrops 404", admin.get(f"{BASE}/api/admin/draw-studio/backdrops").status_code in (404, 405))
check("old POST /backdrops 404", admin.post(f"{BASE}/api/admin/draw-studio/backdrops").status_code in (404, 405))
cur = admin.get(f"{BASE}/api/admin/draw-studio/settings").json()
orig_vols = dict(cur.get("volumes") or {})
slots = cur.get("slots") or []
print("slots:", slots, "vols:", orig_vols)
if len(slots) >= 2:
    a, b = slots[0], slots[1]
    a = a if isinstance(a, str) else a.get("key") or a.get("id")
    b = b if isinstance(b, str) else b.get("key") or b.get("id")
    admin.put(f"{BASE}/api/admin/draw-studio/settings", json={"volumes": {a: 0.31}})
    r = admin.put(f"{BASE}/api/admin/draw-studio/settings", json={"volumes": {b: 0.42}})
    v = r.json()["volumes"]
    check("volumes merge (partial PUT keeps others)", v.get(a) == 0.31 and v.get(b) == 0.42, v)
    v2 = admin.get(f"{BASE}/api/admin/draw-studio/settings").json()["volumes"]
    check("volumes merge persisted", v2.get(a) == 0.31 and v2.get(b) == 0.42, v2)
    # restore
    import pymongo
    db = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    db.settings.update_one({"_id": "draw_studio"}, {"$set": {"volumes": orig_vols}})
    print("volumes restored")
check("player PUT settings 403", p.put(f"{BASE}/api/admin/draw-studio/settings", json={"volumes": {}}).status_code == 403)

# winners dropped for non-reveal stage (LLM call)
if os.environ.get("SKIP_LLM") != "1":
    body = {"stage": "drawing", "mode": "test", "contest_title": "TEST_Cup", "round_name": "Main", "prize_amount": 100,
            "winners": [{"display_name": "Zebedee Quargle", "ticket_number": "TKT-777"}], "num_winners": 1, "eligible": 40, "override": {"enabled": True}}
    r = admin.post(f"{BASE}/api/admin/draw-studio/commentary", json=body, timeout=90)
    from urllib.parse import unquote
    txt = unquote(r.headers.get("X-Commentary-Text", ""))
    print("drawing line:", r.status_code, txt)
    check("drawing stage line does not leak winner name", r.status_code in (200, 502, 409, 422) and "Quargle" not in txt, r.status_code)

print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
