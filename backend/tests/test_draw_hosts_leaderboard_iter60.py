# Iteration 60: AI draw hosts (duo/solo), commentary segments, global stars leaderboard, ad fixes
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
P = f"{BASE_URL}/api/games/practice"
ADM = f"{BASE_URL}/api/admin/free-games"
DS = f"{BASE_URL}/api/admin/draw-studio"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get('token') or r.json().get('access_token')
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("bachanta8@gmail.com", "Herts@910022")


@pytest.fixture(scope="module")
def player():
    return _login("player1@example.com", "Player@12345")


# Commentary hosts: options + settings persistence
class TestHosts:
    def test_options_hosts(self, admin):
        d = admin.get(f"{DS}/commentary/options").json()
        ids = {h["id"]: h["gender"] for h in d["hosts"]}
        assert ids == {"max": "male", "leo": "male", "sophia": "female", "ruby": "female"}

    def test_settings_roundtrip(self, admin):
        orig = admin.get(f"{DS}/settings").json()["commentary"]
        try:
            r = admin.put(f"{DS}/settings", json={"commentary": {**orig, "mode": "solo", "host": "ruby", "duo": ["leo", "ruby"]}})
            assert r.status_code == 200, r.text
            c = admin.get(f"{DS}/settings").json()["commentary"]
            assert c["mode"] == "solo" and c["host"] == "ruby" and c["duo"] == ["leo", "ruby"] and c["voice"] == "shimmer"
            # invalid duo (same host twice / unknown) falls back to default
            admin.put(f"{DS}/settings", json={"commentary": {**orig, "mode": "duo", "duo": ["max", "max"], "host": "zzz"}})
            c2 = admin.get(f"{DS}/settings").json()["commentary"]
            assert c2["duo"] == ["max", "sophia"] and c2["host"] == "max"
        finally:
            admin.put(f"{DS}/settings", json={"commentary": orig})
        assert admin.get(f"{DS}/settings").json()["commentary"] == orig

    def test_player_forbidden(self, player):
        assert player.get(f"{DS}/commentary/options").status_code in (401, 403)


# Commentary segments (LLM + TTS, slow)
class TestSegments:
    def test_duo_segments(self, admin):
        r = admin.post(f"{DS}/commentary", json={"stage": "intro", "mode": "preview", "contest_title": "TEST sample", "eligible": 120,
                                                 "total_prize": 1000, "override": {"enabled": True, "mode": "duo", "duo": ["leo", "sophia"]}}, timeout=90)
        assert r.status_code == 200, r.text
        segs = r.json()["segments"]
        print("DUO", [(s["name"], s["text"][:80]) for s in segs])
        assert 2 <= len(segs) <= 4
        assert {s["host"] for s in segs} == {"leo", "sophia"}
        assert all(len(s["audio_b64"]) > 100 and s["name"] in ("Leo", "Sophia") for s in segs)
        alternating = all(segs[i]["host"] != segs[i + 1]["host"] for i in range(len(segs) - 1))
        print("alternating:", alternating)

    def test_solo_segment(self, admin):
        r = admin.post(f"{DS}/commentary", json={"stage": "test", "mode": "test", "override": {"enabled": True, "mode": "solo", "host": "max"}}, timeout=90)
        assert r.status_code == 200, r.text
        segs = r.json()["segments"]
        print("SOLO", [(s["name"], s["text"]) for s in segs])
        assert len(segs) == 1 and segs[0]["host"] == "max" and segs[0]["name"] == "Max"


# Global leaderboard by stars
class TestGlobalBoard:
    def test_sorted_by_stars(self, player):
        d = player.get(f"{P}/leaderboard", params={"limit": 100}).json()
        rows = d["top"]
        keys = [(r["stars"], r["level"]) for r in rows]
        assert keys == sorted(keys, reverse=True)
        assert [r["rank"] for r in rows] == list(range(1, len(rows) + 1))
        assert d["me"] is not None and "games" in d["me"] and "user_id" not in d["me"]
        assert all("user_id" not in r for r in rows)

    def test_per_game_by_level(self):
        d = requests.get(f"{P}/leaderboard", params={"game_id": "word_unscramble"}).json()
        lv = [r["level"] for r in d["top"]]
        assert lv == sorted(lv, reverse=True) and d["me"] is None


# Ad fixes
class TestAdFixes:
    def test_unknown_ad_404(self):
        assert requests.post(f"{BASE_URL}/api/games/ads/fga_doesnotexist/click").status_code == 404
        assert requests.post(f"{BASE_URL}/api/games/ads/fga_doesnotexist/impression").status_code == 404

    def test_own_source_clears_junk(self, admin):
        base = {"enabled": False, "source": "own", "every_n_levels": 3, "skip_after_s": 5}
        try:
            r = admin.put(f"{ADM}/ads/settings", json={**base, "adsense_client": "pub-123", "adsense_slot": "12ab"})
            assert r.status_code == 200, r.text
            s = r.json()["settings"]
            assert s["adsense_client"] == "" and s["adsense_slot"] == ""
            # adsense still validated
            assert admin.put(f"{ADM}/ads/settings", json={**base, "source": "adsense", "adsense_client": "pub-123", "adsense_slot": ""}).status_code == 400
        finally:
            admin.put(f"{ADM}/ads/settings", json={**base, "adsense_client": "", "adsense_slot": ""})
        assert requests.get(f"{BASE_URL}/api/games/ads/next").json()["enabled"] is False

    def test_ad_dates_roundtrip(self, admin):
        r = admin.post(f"{ADM}/ads", json={"title": "TEST_ad60", "media_type": "image", "media_url": "https://picsum.photos/800/450",
                                             "starts_at": "2026-07-01T09:30:00Z", "ends_at": "2026-07-02T18:00:00Z"})
        assert r.status_code == 200, r.text
        ad = r.json()["ad"]
        try:
            print("dates", ad.get("starts_at"), ad.get("ends_at"))
            assert str(ad.get("starts_at", "")).startswith("2026-07-01T09:30")
            assert str(ad.get("ends_at", "")).startswith("2026-07-02T18:00")
        finally:
            assert admin.delete(f"{ADM}/ads/{ad['ad_id']}").status_code == 200
