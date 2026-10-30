# Draw Studio round media: screenshot/clip uploads (kind + round_index), recordings list filter, public winners media, player media access
import os
import pytest
import requests
import pymongo
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PUB_CID = "c_drawstudio_e2e"      # has published draw_studio winners for rounds 0/1
UNPUB_CID = "c_drawstudio_test"   # draw_studio winners not published
PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")
WEBM = b"\x1aE\xdf\xa3" + b"\x00" * 200
CREATED = []


@pytest.fixture(scope="module")
def db():
    d = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    yield d
    d.draw_studio_recordings.delete_many({"recording_id": {"$in": CREATED}})


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


def _upload(api, data, **meta):
    r = api.post(f"{BASE_URL}/api/admin/draw-studio/recordings", json={**meta, "size": len(data)})
    assert r.status_code == 200, r.text
    rid = r.json()["recording_id"]
    CREATED.append(rid)
    assert api.put(f"{BASE_URL}/api/admin/draw-studio/recordings/{rid}/chunks/0", data=data,
                   headers={"Content-Type": "application/octet-stream"}).status_code == 200
    c = api.post(f"{BASE_URL}/api/admin/draw-studio/recordings/{rid}/complete", json={"chunks": 1})
    assert c.status_code == 200, c.text
    return c.json()["recording"]


# --- content-type validation per kind
def test_full_rejects_image(admin):
    r = admin.post(f"{BASE_URL}/api/admin/draw-studio/recordings", json={"mode": "preview", "kind": "full", "content_type": "image/png", "size": 10})
    assert r.status_code == 415


def test_screenshot_rejects_video(admin):
    r = admin.post(f"{BASE_URL}/api/admin/draw-studio/recordings", json={"mode": "official", "kind": "screenshot", "content_type": "video/webm", "size": 10})
    assert r.status_code == 415


def test_invalid_kind_422(admin):
    r = admin.post(f"{BASE_URL}/api/admin/draw-studio/recordings", json={"mode": "official", "kind": "gif", "content_type": "image/png", "size": 10})
    assert r.status_code == 422


def test_player_cannot_upload(player):
    r = player.post(f"{BASE_URL}/api/admin/draw-studio/recordings", json={"mode": "official", "kind": "screenshot", "content_type": "image/png", "size": 10})
    assert r.status_code in (401, 403)


# --- upload + persistence + list filter + public media
def test_upload_published_media_and_access(admin, player, db):
    shot = _upload(admin, PNG, mode="official", kind="screenshot", round_index=0, contest_id=PUB_CID, label="TEST_shot", content_type="image/png")
    clip = _upload(admin, WEBM, mode="official", kind="clip", round_index=0, contest_id=PUB_CID, label="TEST_clip", content_type="video/webm")
    assert shot["kind"] == "screenshot" and shot["ext"] == "png" and shot["round_index"] == 0
    assert clip["kind"] == "clip" and clip["ext"] == "webm"
    doc = db.draw_studio_recordings.find_one({"recording_id": shot["recording_id"]})
    assert doc["status"] == "ready" and doc["kind"] == "screenshot"

    # admin recordings list excludes clip/screenshot
    rows = admin.get(f"{BASE_URL}/api/admin/draw-studio/recordings").json()["recordings"]
    ids = {r["recording_id"] for r in rows}
    assert shot["recording_id"] not in ids and clip["recording_id"] not in ids
    assert all(r.get("kind", "full") not in ("clip", "screenshot") for r in rows)

    # public contest-winners has media for this contest round 0 (latest)
    pub = requests.get(f"{BASE_URL}/api/public/contest-winners").json()["contests"]
    c = next(x for x in pub if x["contest_id"] == PUB_CID)
    m0 = next(m for m in c["media"] if m["round_index"] == 0)
    assert m0["screenshot"] == shot["recording_id"] and m0["clip"] == clip["recording_id"]

    # media file: 401 no auth, 200 player
    assert requests.get(f"{BASE_URL}/api/contest-winners/media/{shot['recording_id']}").status_code == 401
    r = player.get(f"{BASE_URL}/api/contest-winners/media/{shot['recording_id']}")
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/png") and r.content == PNG
    r = player.get(f"{BASE_URL}/api/contest-winners/media/{clip['recording_id']}")
    assert r.status_code == 200 and r.headers["content-type"].startswith("video/webm")


def test_unpublished_media_404(admin, player):
    shot = _upload(admin, PNG, mode="official", kind="screenshot", round_index=0, contest_id=UNPUB_CID, label="TEST_unpub", content_type="image/png")
    assert player.get(f"{BASE_URL}/api/contest-winners/media/{shot['recording_id']}").status_code == 404
    pub = requests.get(f"{BASE_URL}/api/public/contest-winners").json()["contests"]
    for c in pub:
        if c["contest_id"] == UNPUB_CID:
            assert all(m.get("screenshot") != shot["recording_id"] for m in c.get("media", []))


def test_preview_media_404(admin, player):
    shot = _upload(admin, PNG, mode="preview", kind="screenshot", round_index=0, contest_id=PUB_CID, label="TEST_prev", content_type="image/png")
    assert player.get(f"{BASE_URL}/api/contest-winners/media/{shot['recording_id']}").status_code == 404


def test_unknown_media_404(player):
    assert player.get(f"{BASE_URL}/api/contest-winners/media/dsv_doesnotexist").status_code == 404
