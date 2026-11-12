# Iteration 68: Board style + Sound pack admin endpoints
import pytest
import requests

BASE_URL = ""
for line in open("/app/frontend/.env"):
    if line.startswith("REACT_APP_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def admin_h():
    return _login("bachanta8@gmail.com", "Herts@910022")


@pytest.fixture(scope="module")
def player_h():
    return _login("player1@example.com", "Player@12345")


BS = f"{BASE_URL}/api/admin/world/board-style"
SP = f"{BASE_URL}/api/admin/world/sound-pack"


# --- Board style ---
class TestBoardStyle:
    def test_public_get(self):
        r = requests.get(f"{BASE_URL}/api/world/public/board-style")
        assert r.status_code == 200
        d = r.json()
        assert set(d) >= {"mode", "style_id", "by_type"}
        assert d["mode"] in ("classic", "single", "by_type")

    def test_unauth(self):
        assert requests.put(BS, json={"mode": "classic"}).status_code in (401, 403)

    def test_player_forbidden(self, player_h):
        assert requests.put(BS, json={"mode": "classic"}, headers=player_h).status_code in (401, 403)

    @pytest.mark.parametrize("body", [
        {"mode": "single", "style_id": "nope"},
        {"mode": "single"},
        {"mode": "weird"},
        {"mode": "by_type", "by_type": {"unknown": "galaxy"}},
        {"mode": "by_type", "by_type": {"memory": "nope"}},
    ])
    def test_invalid(self, admin_h, body):
        assert requests.put(BS, json=body, headers=admin_h).status_code == 422

    def test_single_and_by_type_persist(self, admin_h):
        try:
            r = requests.put(BS, json={"mode": "single", "style_id": "vhs-sunset"}, headers=admin_h)
            assert r.status_code == 200, r.text
            assert r.json()["style_id"] == "vhs-sunset"
            g = requests.get(f"{BASE_URL}/api/world/public/board-style").json()
            assert g["mode"] == "single" and g["style_id"] == "vhs-sunset"

            r = requests.put(BS, json={"mode": "by_type", "style_id": "vhs-sunset", "by_type": {"memory": "galaxy"}}, headers=admin_h)
            assert r.status_code == 200, r.text
            g = requests.get(f"{BASE_URL}/api/world/public/board-style").json()
            assert g["mode"] == "by_type" and g["by_type"] == {"memory": "galaxy"} and g["style_id"] is None
        finally:
            requests.put(BS, json={"mode": "classic"}, headers=admin_h)
        assert requests.get(f"{BASE_URL}/api/world/public/board-style").json()["mode"] == "classic"

    def test_all_50_frontend_ids_accepted(self, admin_h):
        import re
        src = open("/app/frontend/src/lib/boardStyles.js").read()
        raw = src.split("const RAW = [")[1].split("];")[0]
        names = re.findall(r"\['([^']+)',", raw)
        assert len(names) == 50
        ids = [re.sub(r"[^a-z0-9]+", "-", n.lower()) for n in names]
        assert len(set(ids)) == 50
        try:
            for i in ids:
                r = requests.put(BS, json={"mode": "single", "style_id": i}, headers=admin_h)
                assert r.status_code == 200, f"{i}: {r.text}"
        finally:
            requests.put(BS, json={"mode": "classic"}, headers=admin_h)


# --- Sound pack ---
class TestSoundPack:
    def test_public_get(self):
        r = requests.get(f"{BASE_URL}/api/world/public/sound-pack")
        assert r.status_code == 200 and "pack_id" in r.json()

    def test_unauth(self):
        assert requests.put(SP, json={"pack_id": None}).status_code in (401, 403)

    def test_player_forbidden(self, player_h):
        assert requests.put(SP, json={"pack_id": None}, headers=player_h).status_code in (401, 403)

    def test_unknown(self, admin_h):
        assert requests.put(SP, json={"pack_id": "kazoo-loud"}, headers=admin_h).status_code == 422

    def test_set_and_original(self, admin_h):
        try:
            r = requests.put(SP, json={"pack_id": "retro-8-bit-epic"}, headers=admin_h)
            assert r.status_code == 200 and r.json() == {"pack_id": "retro-8-bit-epic"}
            assert requests.get(f"{BASE_URL}/api/world/public/sound-pack").json()["pack_id"] == "retro-8-bit-epic"
            r = requests.put(SP, json={"pack_id": None}, headers=admin_h)
            assert r.status_code == 200 and r.json() == {"pack_id": None}
        finally:
            requests.put(SP, json={"pack_id": None}, headers=admin_h)
        assert requests.get(f"{BASE_URL}/api/world/public/sound-pack").json()["pack_id"] is None

    def test_all_100_frontend_ids_accepted(self, admin_h):
        import re
        src = open("/app/frontend/src/lib/soundPacks.js").read()
        inst = re.findall(r"\['([^']+)', '(?:sine|square|triangle|sawtooth)'", src)
        moods = re.findall(r"\['([A-Za-z]+)', [\d.]+, \d\]", src)
        assert len(inst) == 20 and len(moods) == 5
        ids = [re.sub(r"[^a-z0-9]+", "-", f"{i} {m}".lower()) for i in inst for m in moods]
        try:
            for i in ids:
                r = requests.put(SP, json={"pack_id": i}, headers=admin_h)
                assert r.status_code == 200, f"{i}: {r.text}"
        finally:
            requests.put(SP, json={"pack_id": None}, headers=admin_h)
