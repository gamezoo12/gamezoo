# Iteration 55: chunked Mongo-backed video upload + seasonal arcade games catalog
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN = {"email": "bachanta8@gmail.com", "password": "Herts@910022"}
V = f"{BASE_URL}/api/admin/uploads/video"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    sess.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return sess


def _fake_mp4(size):
    head = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00"
    return head + os.urandom(size - len(head))


# --- video start validation
def test_start_rejects_long_duration(s):
    r = s.post(f"{V}/start", json={"size": 1000, "content_type": "video/mp4", "duration": 61})
    assert r.status_code == 400


def test_start_rejects_too_large(s):
    r = s.post(f"{V}/start", json={"size": 121 * 1024 * 1024, "content_type": "video/mp4", "duration": 10})
    assert r.status_code == 413


def test_start_rejects_png(s):
    r = s.post(f"{V}/start", json={"size": 1000, "content_type": "image/png", "duration": 10})
    assert r.status_code == 415


def test_start_requires_auth():
    r = requests.post(f"{V}/start", json={"size": 1000, "content_type": "video/mp4", "duration": 10})
    assert r.status_code in (401, 403)


# --- full multi-chunk upload
def test_full_multichunk_upload(s):
    data = _fake_mp4(5 * 1024 * 1024)
    st = s.post(f"{V}/start", json={"size": len(data), "content_type": "video/quicktime", "duration": 12.3})
    assert st.status_code == 200, st.text
    j = st.json()
    assert j["chunk_size"] == 2097152 and isinstance(j["upload_id"], str)
    cs = j["chunk_size"]
    for i in range(0, (len(data) + cs - 1) // cs):
        r = s.put(f"{V}/{j['upload_id']}/chunk/{i}", data=data[i * cs:(i + 1) * cs],
                  headers={"Content-Type": "application/octet-stream"})
        assert r.status_code == 200, r.text
    c = s.post(f"{V}/{j['upload_id']}/complete")
    assert c.status_code == 200, c.text
    cj = c.json()
    assert cj["mime"] == "video/mp4" and cj["url"].startswith("http") and cj["size"] == len(data)
    head = requests.head(cj["url"], timeout=30)
    assert head.status_code == 200, f"public URL {cj['url']} -> {head.status_code}"
    # session cleaned up
    c2 = s.post(f"{V}/{j['upload_id']}/complete")
    assert c2.status_code == 404


def test_complete_missing_chunk(s):
    data = _fake_mp4(3 * 1024 * 1024)
    j = s.post(f"{V}/start", json={"size": len(data), "content_type": "video/mp4", "duration": 5}).json()
    r = s.put(f"{V}/{j['upload_id']}/chunk/0", data=data[:2097152],
              headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 200
    c = s.post(f"{V}/{j['upload_id']}/complete")
    assert c.status_code == 400 and "Upload incomplete" in c.text
    assert s.post(f"{V}/{j['upload_id']}/complete").status_code == 404


def test_oversized_chunk_rejected(s):
    j = s.post(f"{V}/start", json={"size": 3 * 1024 * 1024, "content_type": "video/mp4", "duration": 5}).json()
    r = s.put(f"{V}/{j['upload_id']}/chunk/0", data=b"x" * (2097152 + 1),
              headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 400
    s.post(f"{V}/{j['upload_id']}/complete")  # cleanup


def test_chunk_unknown_session(s):
    r = s.put(f"{V}/doesnotexist/chunk/0", data=b"abc", headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 404


# --- seasonal games catalog
def test_games_types_seasonal():
    r = requests.get(f"{BASE_URL}/api/games/types")
    assert r.status_code == 200
    d = r.json()
    games = d if isinstance(d, list) else (d.get("games") or d.get("types") or d.get("items"))
    ids = {g.get("id") for g in games}
    assert len(games) == 190, len(games)
    assert sum(1 for g in games if g.get("family") == "arcade") == 160
    for gid in ("arc_balloon_pop_christmas", "arc_safe_cracker_halloween", "arc_quick_quiz_summer"):
        assert gid in ids
