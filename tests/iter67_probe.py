import json, sys, requests
BASE = "https://import-verify-6.preview.emergentagent.com/api"
for email, pw in [("player1@example.com", "Player@12345"), ("player_broke@example.com", "Player@12345"), ("bachanta8@gmail.com", "Herts@910022")]:
    t = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}).json()["token"]
    h = {"Authorization": f"Bearer {t}"}
    s = requests.get(f"{BASE}/world/state", headers=h).json()
    prog = s.get("progress") or {}
    print(email, json.dumps({k: prog.get(k) for k in ("current_level", "completed_levels", "highest_unlocked_level", "champion_stage")}))
    print("  state keys:", list(s.keys())[:30])
    lv = prog.get("current_level") or 1
    for L in range(1, 11):
        r = requests.get(f"{BASE}/world/level/{L}", headers=h)
        if r.status_code == 200:
            l = r.json().get("level", {})
            print("  L", L, l.get("game_id"), l.get("time_limit_seconds"), l.get("status") or l.get("unlocked"))
