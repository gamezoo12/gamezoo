# Free games iteration 59: endless levels, leaderboards, play events, admin stats, ads, commentary JSON
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
P = f"{BASE_URL}/api/games/practice"
ADM = f"{BASE_URL}/api/admin/free-games"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code} {r.text[:200]}")
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


@pytest.fixture(scope="module")
def fresh():
    # player1 on a game it never played (word_unscramble) - registration needs phone OTP in preview
    return _login("player1@example.com", "Player@12345")


# Unlimited levels
class TestUnlimited:
    def test_level_above_100(self, fresh):
        entries = [{"game_id": "word_unscramble", "level": i, "stars": 3 if i % 2 else 2} for i in range(1, 152)]
        r = fresh.post(f"{P}/progress", json={"entries": entries})
        assert r.status_code == 200, r.text
        st = r.json()["progress"]["word_unscramble"]
        assert st["unlocked"] == 152
        assert st["stars"]["101"] == 3
        g = fresh.get(f"{P}/progress").json()["progress"]["word_unscramble"]
        assert g["unlocked"] == 152

    def test_skip_ahead_ignored(self, fresh):
        r = fresh.post(f"{P}/progress", json={"entries": [{"game_id": "word_unscramble", "level": 500, "stars": 3}]})
        assert r.status_code == 200
        assert fresh.get(f"{P}/progress").json()["progress"]["word_unscramble"]["unlocked"] == 152

    def test_level_bounds(self, fresh):
        r = fresh.post(f"{P}/progress", json={"entries": [{"game_id": "word_unscramble", "level": 100001, "stars": 3}]})
        assert r.status_code == 422


# Leaderboards
class TestLeaderboard:
    def test_game_board_masked(self, fresh):
        r = fresh.get(f"{P}/leaderboard", params={"game_id": "word_unscramble"})
        assert r.status_code == 200
        d = r.json()
        assert d["game_id"] == "word_unscramble" and isinstance(d["top"], list) and d["players"] >= 1
        assert all("user_id" not in row for row in d["top"])
        assert d["me"] is not None and d["me"]["level"] == 151
        assert d["me"]["name"] == "Player O."
        assert d["me"]["rank"] >= 1
        assert d["top"][0]["rank"] == 1

    def test_overall_board(self, fresh):
        r = fresh.get(f"{P}/leaderboard")
        assert r.status_code == 200
        d = r.json()
        assert d["game_id"] is None and d["me"] is not None and "games" in d["me"]
        lv = [row["level"] for row in d["top"]]
        assert lv == sorted(lv, reverse=True)

    def test_anon_board(self):
        r = requests.get(f"{P}/leaderboard", params={"game_id": "math_sprint"})
        assert r.status_code == 200 and r.json()["me"] is None

    def test_unknown_game(self):
        assert requests.get(f"{P}/leaderboard", params={"game_id": "nope_game"}).status_code == 400


# Play events + admin stats
class TestEventsStats:
    def test_event_increments(self, admin):
        before = admin.get(f"{ADM}/stats").json()
        b = next((g for g in before["games"] if g["game_id"] == "math_sprint"), {"starts": 0, "passes": 0, "fails": 0})
        for o in ("start", "pass", "fail"):
            r = requests.post(f"{P}/event", json={"game_id": "math_sprint", "level": 3, "outcome": o})
            assert r.status_code == 200 and r.json()["ok"] is True
        after = admin.get(f"{ADM}/stats").json()
        a = next(g for g in after["games"] if g["game_id"] == "math_sprint")
        assert a["starts"] == b["starts"] + 1 and a["passes"] == b["passes"] + 1 and a["fails"] == b["fails"] + 1
        assert set(after["totals"]) >= {"starts", "passes", "fails", "players", "ad_impressions", "ad_clicks"}
        assert isinstance(after["series"], list) and len(after["series"]) >= 1

    def test_event_validation(self):
        assert requests.post(f"{P}/event", json={"game_id": "nope", "level": 1, "outcome": "start"}).status_code == 400
        assert requests.post(f"{P}/event", json={"game_id": "math_sprint", "level": 1, "outcome": "win"}).status_code == 422

    def test_stats_requires_admin(self, player):
        assert requests.get(f"{ADM}/stats").status_code in (401, 403)
        assert player.get(f"{ADM}/stats").status_code in (401, 403)


# Ads
class TestAds:
    def test_settings_validation(self, admin):
        base = {"enabled": False, "source": "own", "every_n_levels": 3, "skip_after_s": 5, "adsense_client": "", "adsense_slot": ""}
        assert admin.put(f"{ADM}/ads/settings", json={**base, "adsense_client": "pub-123"}).status_code == 400
        assert admin.put(f"{ADM}/ads/settings", json={**base, "adsense_slot": "12ab"}).status_code == 400
        r = admin.put(f"{ADM}/ads/settings", json={**base, "enabled": True, "source": "adsense"})
        assert r.status_code == 400 and "AdSense" in r.json()["detail"]

    def test_ad_crud_and_public(self, admin):
        bad = admin.post(f"{ADM}/ads", json={"title": "TEST_bad", "media_type": "image", "media_url": "http://x.com/a.png"})
        assert bad.status_code == 400
        r = admin.post(f"{ADM}/ads", json={"title": "TEST_ad59", "media_type": "image", "media_url": "https://picsum.photos/800/450",
                                             "click_url": "https://example.com", "cta": "Visit"})
        assert r.status_code == 200, r.text
        ad_id = r.json()["ad"]["ad_id"]
        try:
            u = admin.put(f"{ADM}/ads/{ad_id}", json={"title": "TEST_ad59_edit", "media_type": "image", "media_url": "https://picsum.photos/800/450",
                                                      "click_url": "https://example.com", "cta": "Go"})
            assert u.status_code == 200 and u.json()["ad"]["title"] == "TEST_ad59_edit"
            s = admin.put(f"{ADM}/ads/settings", json={"enabled": True, "source": "own", "every_n_levels": 1, "skip_after_s": 3,
                                                       "adsense_client": "", "adsense_slot": ""})
            assert s.status_code == 200 and s.json()["settings"]["enabled"] is True
            n = requests.get(f"{BASE_URL}/api/games/ads/next").json()
            assert n["enabled"] and n["ad"] is not None and n["skip_after_s"] == 3
            assert requests.post(f"{BASE_URL}/api/games/ads/{ad_id}/impression").status_code == 200
            assert requests.post(f"{BASE_URL}/api/games/ads/{ad_id}/click").status_code == 200
            lst = admin.get(f"{ADM}/ads").json()["ads"]
            mine = next(a for a in lst if a["ad_id"] == ad_id)
            assert mine["impressions"] == 1 and mine["clicks"] == 1
            # adsense with valid IDs
            s2 = admin.put(f"{ADM}/ads/settings", json={"enabled": True, "source": "adsense", "every_n_levels": 1, "skip_after_s": 3,
                                                        "adsense_client": "ca-pub-1234567890123456", "adsense_slot": "1234567890"})
            assert s2.status_code == 200
            n2 = requests.get(f"{BASE_URL}/api/games/ads/next").json()
            assert n2["adsense"] == {"client": "ca-pub-1234567890123456", "slot": "1234567890"}
        finally:
            admin.put(f"{ADM}/ads/settings", json={"enabled": False, "source": "own", "every_n_levels": 3, "skip_after_s": 5,
                                                   "adsense_client": "", "adsense_slot": ""})
            d = admin.delete(f"{ADM}/ads/{ad_id}")
            assert d.status_code == 200
        assert admin.delete(f"{ADM}/ads/{ad_id}").status_code == 404
        assert requests.get(f"{BASE_URL}/api/games/ads/next").json()["enabled"] is False

    def test_ads_admin_only(self, player):
        assert player.get(f"{ADM}/ads").status_code in (401, 403)


# Commentary JSON with override
class TestCommentary:
    def test_commentary_json(self, admin):
        opts = admin.get(f"{BASE_URL}/api/admin/draw-studio/commentary/options")
        assert opts.status_code == 200 and len(opts.json()["languages"]) == 17
        r = admin.post(f"{BASE_URL}/api/admin/draw-studio/commentary",
                       json={"stage": "intro", "mode": "preview", "contest_title": "Sample show", "override": {"enabled": True}}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["text"], str) and len(d["text"]) > 3 and len(d["audio_b64"]) > 100
