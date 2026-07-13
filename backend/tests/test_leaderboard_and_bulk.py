"""Regression tests for iteration 11 features:

1. Global leaderboard: GET /api/leaderboard/global
2. game_type field exposed in public contest listings: GET /api/contests
3. Admin bulk launch/pause endpoints with filters (only_games, category, status_from)
4. Auth guard on bulk endpoints
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://contest-arena-16.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = os.environ.get("ADMIN_TEST_EMAIL", "bachanta8@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_TEST_PASSWORD", "Herts@910022")


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    data = r.json()
    tok = data.get("token") or data.get("access_token") or data.get("session_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


# ---------- Global leaderboard ----------
class TestGlobalLeaderboard:
    def test_global_leaderboard_returns_200(self, api):
        r = api.get(f"{BASE_URL}/api/leaderboard/global")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "leaderboard" in data
        assert isinstance(data["leaderboard"], list)

    def test_global_leaderboard_row_shape(self, api):
        r = api.get(f"{BASE_URL}/api/leaderboard/global")
        assert r.status_code == 200
        rows = r.json()["leaderboard"]
        if not rows:
            pytest.skip("No game_scores in DB — cannot assert row shape")
        row = rows[0]
        # Expect keys per game_routes.py::global_leaderboard
        for key in ("user_id", "user_name", "total_points", "contests_played", "rank"):
            assert key in row, f"Missing key {key} in {row}"
        assert row["rank"] == 1
        assert isinstance(row["total_points"], (int, float))
        # Ranks must be strictly increasing
        for i, r_ in enumerate(rows):
            assert r_["rank"] == i + 1

    def test_global_leaderboard_ranked_desc(self, api):
        rows = api.get(f"{BASE_URL}/api/leaderboard/global").json()["leaderboard"]
        if len(rows) < 2:
            pytest.skip("Not enough rows to check ordering")
        for a, b in zip(rows, rows[1:]):
            assert a["total_points"] >= b["total_points"]

    def test_global_leaderboard_limit(self, api):
        r = api.get(f"{BASE_URL}/api/leaderboard/global?limit=3")
        assert r.status_code == 200
        assert len(r.json()["leaderboard"]) <= 3


# ---------- game_type field exposed on public contests ----------
class TestContestGameTypeField:
    def test_public_contests_include_game_type_key(self, api):
        r = api.get(f"{BASE_URL}/api/contests")
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        if not arr:
            pytest.skip("No live contests in DB — key presence cannot be asserted on empty list")
        for c in arr:
            assert "game_type" in c, f"Contest missing game_type key: {c.get('slug')}"

    def test_admin_contests_have_game_type_seeded(self, admin_client):
        """Verify at least the 3 seeded contests (memory_match, number_sequence, emoji_riddle) exist."""
        r = admin_client.get(f"{BASE_URL}/api/admin/contests")
        assert r.status_code == 200
        all_contests = r.json()
        game_contests = [c for c in all_contests if c.get("game_type")]
        print(f"Contests with game_type: {len(game_contests)}")
        seen_types = {c.get("game_type") for c in game_contests}
        # Expect the seeded three types at minimum
        expected = {"memory_match", "number_sequence", "emoji_riddle"}
        missing = expected - seen_types
        if missing:
            pytest.fail(f"Missing seeded game_type contests: {missing}. Seen: {seen_types}")


# ---------- Admin bulk endpoints ----------
class TestBulkContestOps:
    def test_bulk_launch_requires_admin(self, api):
        r = api.post(f"{BASE_URL}/api/admin/contests/bulk/launch", json={"only_games": True, "status_from": "draft"})
        assert r.status_code in (401, 403), f"Expected auth failure, got {r.status_code}: {r.text}"

    def test_bulk_pause_requires_admin(self, api):
        r = api.post(f"{BASE_URL}/api/admin/contests/bulk/pause", json={"only_games": True, "status_from": "live"})
        assert r.status_code in (401, 403), f"Expected auth failure, got {r.status_code}: {r.text}"

    def test_bulk_launch_only_games_draft(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/admin/contests/bulk/launch",
            json={"only_games": True, "status_from": "draft"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "updated" in data and "matched" in data
        assert isinstance(data["updated"], int)
        assert data["updated"] >= 0
        print(f"bulk/launch only_games draft: {data}")

    def test_after_launch_game_contests_are_live(self, admin_client):
        """After launching game contests, verify at least one contest with game_type is live."""
        r = admin_client.get(f"{BASE_URL}/api/admin/contests")
        assert r.status_code == 200
        contests = r.json()
        game_live = [c for c in contests if c.get("game_type") and c.get("status") == "live"]
        assert len(game_live) >= 1, "No game contests are live after bulk/launch"
        print(f"Live game contests: {len(game_live)}")

    def test_public_contest_list_shows_game_type_after_launch(self, api):
        r = api.get(f"{BASE_URL}/api/contests")
        assert r.status_code == 200
        arr = r.json()
        game_contests = [c for c in arr if c.get("game_type")]
        print(f"Public live game contests: {len(game_contests)}")
        # Should have at least 1 after launch
        assert len(game_contests) >= 1, "No public live contests with game_type"

    def test_bulk_launch_with_category_filter(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/admin/contests/bulk/launch",
            json={"category": "prize-draws", "status_from": "draft"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data["filter"].get("category") == "prize-draws"

    def test_bulk_launch_all_draft(self, admin_client):
        """Without only_games flag → all draft contests."""
        r = admin_client.post(
            f"{BASE_URL}/api/admin/contests/bulk/launch",
            json={"status_from": "draft"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "game_type" not in data["filter"]

    def test_bulk_pause_only_games_live(self, admin_client):
        # First ensure at least one game is live
        r_launch = admin_client.post(
            f"{BASE_URL}/api/admin/contests/bulk/launch",
            json={"only_games": True, "status_from": "draft"},
        )
        assert r_launch.status_code == 200
        # Now pause
        r = admin_client.post(
            f"{BASE_URL}/api/admin/contests/bulk/pause",
            json={"only_games": True, "status_from": "live"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert isinstance(data["updated"], int)
        print(f"bulk/pause only_games live: {data}")

        # Verify state - no game contests should be live now (if pause worked)
        r_list = admin_client.get(f"{BASE_URL}/api/admin/contests")
        contests = r_list.json()
        game_live_after = [c for c in contests if c.get("game_type") and c.get("status") == "live"]
        assert len(game_live_after) == 0, f"Still live after pause: {[c['slug'] for c in game_live_after]}"

    def test_relaunch_game_contests_for_cleanup(self, admin_client):
        """Relaunch the game contests so /api/contests still shows them for frontend tests."""
        r = admin_client.post(
            f"{BASE_URL}/api/admin/contests/bulk/launch",
            json={"only_games": True, "status_from": "draft"},
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True
