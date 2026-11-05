# Draw Studio: full-screen backdrop upload/remove/file + AI voice commentary (settings, options, TTS endpoint, auth)
import os
from urllib.parse import unquote

import pymongo
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/admin/draw-studio"
PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("bachanta8@gmail.com", "Herts@910022")


@pytest.fixture(scope="module")
def player():
    return _login("player1@example.com", "Player@12345")


@pytest.fixture(scope="module", autouse=True)
def restore_settings():
    """Snapshot existing backdrop/commentary settings and restore them after the module."""
    db = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    snap = db.settings.find_one({"_id": "draw_studio"}) or {}
    yield
    upd = {k: snap[k] for k in ("backdrop", "commentary", "volumes") if k in snap}
    if upd:
        db.settings.update_one({"_id": "draw_studio"}, {"$set": upd})


# --- backdrop
class TestBackdrop:
    def test_upload_get_delete_reupload(self, admin):
        r = admin.post(f"{API}/backdrop", files={"file": ("TEST_bd.png", PNG, "image/png")})
        assert r.status_code == 200, r.text
        assert r.json()["backdrop"]["original_filename"] == "TEST_bd.png"
        s = admin.get(f"{API}/settings").json()
        assert s["backdrop"] and s["backdrop"].get("original_filename") == "TEST_bd.png"
        f = admin.get(f"{API}/backdrop/file")
        assert f.status_code == 200 and f.headers["content-type"].startswith("image/png") and f.content == PNG
        d = admin.delete(f"{API}/backdrop")
        assert d.status_code == 200 and d.json()["backdrop"] is None
        assert admin.get(f"{API}/backdrop/file").status_code == 404
        assert not admin.get(f"{API}/settings").json().get("backdrop")
        r2 = admin.post(f"{API}/backdrop", files={"file": ("TEST_bd2.png", PNG, "image/png")})
        assert r2.status_code == 200
        assert admin.get(f"{API}/backdrop/file").status_code == 200

    def test_non_image_415(self, admin):
        r = admin.post(f"{API}/backdrop", files={"file": ("x.txt", b"hello", "text/plain")})
        assert r.status_code == 415

    def test_player_forbidden(self, player):
        assert player.post(f"{API}/backdrop", files={"file": ("a.png", PNG, "image/png")}).status_code in (401, 403)
        assert player.delete(f"{API}/backdrop").status_code in (401, 403)
        assert player.get(f"{API}/backdrop/file").status_code in (401, 403)

    def test_anon_unauth(self):
        assert requests.get(f"{API}/backdrop/file").status_code in (401, 403)


# --- commentary
class TestCommentary:
    def test_options(self, admin):
        o = admin.get(f"{API}/commentary/options").json()
        assert len(o["languages"]) == 17 and "Hindi" in o["languages"]
        assert "onyx" in o["voices"] and set(o["styles"]) == {"energetic", "classy", "fun"}

    def test_save_settings_persist_and_sanitize(self, admin):
        body = {"commentary": {"enabled": True, "language": "Spanish", "voice": "nova", "style": "fun", "hd": True,
                               "notes": "TEST_note"}, "volumes": {"commentary": 0.7}}
        r = admin.put(f"{API}/settings", json=body)
        if r.status_code == 405:
            r = admin.post(f"{API}/settings", json=body)
        assert r.status_code == 200, r.text
        c = admin.get(f"{API}/settings").json()["commentary"]
        assert c == {"enabled": True, "language": "Spanish", "voice": "nova", "style": "fun", "hd": True, "notes": "TEST_note"}
        # invalid values fall back to defaults
        bad = {"commentary": {"enabled": True, "language": "Klingon", "voice": "zzz", "style": "x"}}
        r = admin.put(f"{API}/settings", json=bad)
        if r.status_code == 405:
            r = admin.post(f"{API}/settings", json=bad)
        c = admin.get(f"{API}/settings").json()["commentary"]
        assert c["language"] == "English" and c["voice"] == "onyx" and c["style"] == "energetic"

    def test_disabled_409_and_test_stage_ok(self, admin):
        body = {"commentary": {"enabled": False}}
        r = admin.put(f"{API}/settings", json=body)
        if r.status_code == 405:
            admin.post(f"{API}/settings", json=body)
        assert admin.post(f"{API}/commentary", json={"stage": "intro"}).status_code == 409
        t = admin.post(f"{API}/commentary", json={"stage": "test", "mode": "test"}, timeout=60)
        assert t.status_code == 200 and t.headers["content-type"].startswith("audio/mpeg") and len(t.content) > 1000

    def test_override_bypasses_disabled(self, admin):
        r = admin.post(f"{API}/commentary", json={"stage": "intro", "contest_title": "TEST Draw", "eligible": 12,
                                                   "override": {"enabled": True, "language": "English"}}, timeout=60)
        assert r.status_code == 200 and r.headers["content-type"].startswith("audio/mpeg")

    @pytest.mark.parametrize("stage", ["intro", "round", "mixing", "drawing", "reveal", "finale"])
    def test_stages_enabled(self, admin, stage):
        body = {"commentary": {"enabled": True, "language": "English", "voice": "onyx", "style": "energetic"}}
        r = admin.put(f"{API}/settings", json=body)
        if r.status_code == 405:
            admin.post(f"{API}/settings", json=body)
        payload = {"stage": stage, "mode": "preview", "contest_title": "TEST Mega Draw", "round_name": "Round 1",
                   "round_index": 0, "total_rounds": 2, "prize_amount": 50, "num_winners": 1, "eligible": 30,
                   "total_prize": 100, "winners": [{"ticket_number": "123456", "display_name": "Alice"}],
                   "all_winners": [{"round_name": "Round 1", "ticket_number": "123456", "display_name": "Alice"}]}
        r = admin.post(f"{API}/commentary", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.headers["content-type"].startswith("audio/mpeg") and len(r.content) > 1000
        text = unquote(r.headers.get("x-commentary-text", ""))
        assert text
        print(stage, "=>", text)
        if stage == "reveal":
            assert "Alice" in text

    def test_invalid_stage_422(self, admin):
        assert admin.post(f"{API}/commentary", json={"stage": "bogus"}).status_code == 422

    def test_player_forbidden(self, player):
        assert player.post(f"{API}/commentary", json={"stage": "test"}).status_code in (401, 403)
        assert player.get(f"{API}/commentary/options").status_code in (401, 403)
