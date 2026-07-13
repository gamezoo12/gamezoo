"""Skill Games Vol.2 - Test 14 new game types + assignment + submit flow using a new game_type."""
import os
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'

NEW_GAMES = [
    'sudoku_mini', 'sequence_predict', 'countdown_numbers', 'word_ladder',
    'chess_mate_in_one', 'tower_of_hanoi', 'lights_out', 'minesweeper_mini',
    'nonogram_mini', 'tf2048_mini', 'cryptogram', 'anagram_finder',
    'maze_solver', 'spot_pattern',
]

EXISTING_16 = [
    'jigsaw_3x3', 'jigsaw_4x4', 'memory_match', 'number_sequence',
    'slider_puzzle', 'emoji_riddle', 'target_tap', 'word_unscramble',
    'math_sprint', 'reaction_time', 'trivia_quiz', 'simon_says',
    'whack_a_mole', 'odd_one_out', 'color_match', 'pattern_repeat',
]


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()['token']


class TestGameTypesV2:
    """Verify /api/games/types returns exactly 30 games and includes all 14 new IDs."""

    def test_types_endpoint_returns_30(self):
        r = requests.get(f'{BASE_URL}/api/games/types', timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert 'games' in body
        assert len(body['games']) == 30, f"Expected 30 games, got {len(body['games'])}"

    def test_all_14_new_games_present(self):
        r = requests.get(f'{BASE_URL}/api/games/types', timeout=30)
        ids = {g['id'] for g in r.json()['games']}
        missing = [g for g in NEW_GAMES if g not in ids]
        assert not missing, f'Missing new game IDs: {missing}'

    def test_all_16_existing_games_still_present(self):
        r = requests.get(f'{BASE_URL}/api/games/types', timeout=30)
        ids = {g['id'] for g in r.json()['games']}
        missing = [g for g in EXISTING_16 if g not in ids]
        assert not missing, f'Existing games disappeared: {missing}'

    def test_new_games_have_metadata(self):
        """Each new game must have target_time_s and max_attempts."""
        r = requests.get(f'{BASE_URL}/api/games/types', timeout=30)
        games = {g['id']: g for g in r.json()['games']}
        for gid in NEW_GAMES:
            g = games[gid]
            assert isinstance(g.get('target_time_s'), int) and g['target_time_s'] > 0, f'{gid}: bad target_time_s'
            assert isinstance(g.get('max_attempts'), int) and g['max_attempts'] > 0, f'{gid}: bad max_attempts'
            assert g.get('label') and g.get('category'), f'{gid}: missing label/category'


class TestAssignNewGameType:
    """Assign each of the 14 new game_types to a contest via PUT and verify it echoes back."""

    @pytest.fixture(scope='class')
    def temp_contest(self, admin_token):
        end_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        payload = {
            'title': 'TEST V2 Game Assignment Contest',
            'subtitle': 'For new games assignment test',
            'category': 'new-games',
            'price': 1.0,
            'tickets_total': 100,
            'prize_amount': 50.0,
            'end_date': end_date,
            'image': 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg',
            'skill_question': {'q': '2+2?', 'options': ['3', '4', '5'], 'answer': '4', 'type': 'math'},
            'status': 'draft',
        }
        r = requests.post(f'{BASE_URL}/api/admin/contests', json=payload, headers=_auth(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        cid = r.json()['contest']['contest_id']
        yield cid
        try:
            requests.delete(f'{BASE_URL}/api/admin/contests/{cid}', headers=_auth(admin_token), timeout=30)
        except Exception:
            pass

    @pytest.mark.parametrize('game_id', NEW_GAMES)
    def test_assign_and_echo(self, admin_token, temp_contest, game_id):
        # PUT update game_type
        r = requests.put(
            f'{BASE_URL}/api/admin/contests/{temp_contest}',
            json={'game_type': game_id},
            headers=_auth(admin_token), timeout=30,
        )
        assert r.status_code == 200, f'{game_id}: {r.text}'
        # Public GET /api/contests must include it
        r2 = requests.get(f'{BASE_URL}/api/contests', timeout=30)
        assert r2.status_code == 200
        # The endpoint may only return live contests; fall back to admin listing
        row = next((c for c in r2.json() if c.get('contest_id') == temp_contest), None)
        if row is None:
            r3 = requests.get(f'{BASE_URL}/api/admin/contests', headers=_auth(admin_token), timeout=30)
            row = next((c for c in r3.json() if c['contest_id'] == temp_contest), None)
        assert row is not None, f'{game_id}: contest not found in listings'
        assert row.get('game_type') == game_id, f"{game_id}: echoed {row.get('game_type')}"


class TestSubmitWithNewGameType:
    """End-to-end: create contest with cryptogram game_type, buy ticket, submit, verify leaderboard."""

    @pytest.fixture(scope='class')
    def contest_and_gamer(self, admin_token):
        # Create live contest tied to cryptogram
        end_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        r = requests.post(
            f'{BASE_URL}/api/admin/contests',
            json={
                'title': 'TEST V2 Cryptogram Contest',
                'subtitle': 'V2 submit test',
                'category': 'new-games',
                'price': 1.0,
                'tickets_total': 100,
                'prize_amount': 50.0,
                'end_date': end_date,
                'image': 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg',
                'skill_question': {'q': '3+3?', 'options': ['5', '6', '7'], 'answer': '6', 'type': 'math'},
                'status': 'live',
            },
            headers=_auth(admin_token), timeout=30,
        )
        assert r.status_code == 200, r.text
        cid = r.json()['contest']['contest_id']
        # Assign cryptogram
        r2 = requests.put(
            f'{BASE_URL}/api/admin/contests/{cid}',
            json={'game_type': 'cryptogram', 'status': 'live'},
            headers=_auth(admin_token), timeout=30,
        )
        assert r2.status_code == 200, r2.text

        # Create gamer + top up + buy ticket
        ts = int(time.time() * 1000)
        email = f'test_v2_gamer_{ts}@example.com'
        rr = requests.post(f'{BASE_URL}/api/auth/register', json={'email': email, 'name': 'V2Gamer', 'password': 'Password123!'}, timeout=30)
        assert rr.status_code == 200, rr.text
        tok = rr.json()['token']
        requests.post(f'{BASE_URL}/api/wallet/topup', json={'amount': 10}, headers=_auth(tok), timeout=30)
        rc = requests.post(
            f'{BASE_URL}/api/orders/checkout',
            json={'items': [{'contest_id': cid, 'qty': 1, 'skill_answer': '6'}]},
            headers=_auth(tok), timeout=30,
        )
        assert rc.status_code == 200, rc.text
        rt = requests.get(f'{BASE_URL}/api/orders/my-tickets', headers=_auth(tok), timeout=30)
        tix = [t for t in rt.json() if t['contest_id'] == cid]
        assert tix, 'ticket not created'
        yield {'contest_id': cid, 'token': tok, 'ticket_id': tix[0]['ticket_id']}

        try:
            requests.delete(f'{BASE_URL}/api/admin/contests/{cid}', headers=_auth(admin_token), timeout=30)
        except Exception:
            pass

    def test_submit_awards_points(self, contest_and_gamer):
        d = contest_and_gamer
        r = requests.post(
            f'{BASE_URL}/api/games/submit',
            json={'ticket_id': d['ticket_id'], 'duration_ms': 5000, 'accuracy': 1.0, 'solved': True},
            headers=_auth(d['token']), timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        assert body['points'] > 0
        assert body['score']['game_type'] == 'cryptogram'

    def test_leaderboard_has_score(self, contest_and_gamer):
        d = contest_and_gamer
        r = requests.get(f'{BASE_URL}/api/contests/{d["contest_id"]}/leaderboard', timeout=30)
        assert r.status_code == 200
        rows = r.json()['leaderboard']
        assert len(rows) >= 1
        assert rows[0]['rank'] == 1
        assert rows[0]['points'] > 0
