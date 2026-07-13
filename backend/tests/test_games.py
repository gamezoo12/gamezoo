"""Skill games: types listing, contest creation with game_type, submit scoring, leaderboard, attempts cap."""
import os
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASS = 'Herts@910022'


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()['token']


@pytest.fixture(scope='module')
def game_contest(admin_token):
    """Create a memory_match contest, launch it, yield it, then delete on teardown."""
    end_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    payload = {
        'title': 'TEST Memory Match Contest',
        'subtitle': 'Test contest for games pytest',
        'category': 'new-games',
        'price': 1.0,
        'tickets_total': 100,
        'prize_amount': 50.0,
        'end_date': end_date,
        'image': 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg',
        'skill_question': {'q': '1+1?', 'options': ['1', '2', '3'], 'answer': '2', 'type': 'math'},
        'status': 'live',
    }
    r = requests.post(f'{BASE_URL}/api/admin/contests', json=payload, headers=_auth(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    contest = r.json()['contest']
    contest_id = contest['contest_id']
    # Assign game_type via update endpoint
    r2 = requests.put(
        f'{BASE_URL}/api/admin/contests/{contest_id}',
        json={'game_type': 'memory_match', 'game_config': {'pairs': 6}, 'status': 'live'},
        headers=_auth(admin_token),
        timeout=30,
    )
    assert r2.status_code == 200, r2.text

    yield contest

    # cleanup
    try:
        requests.delete(f'{BASE_URL}/api/admin/contests/{contest_id}', headers=_auth(admin_token), timeout=30)
    except Exception:
        pass


@pytest.fixture(scope='module')
def gamer(game_contest):
    """A user with £10 wallet + 1 ticket bought on game_contest."""
    ts = int(time.time() * 1000)
    email = f'test_gamer_{ts}@example.com'
    r = requests.post(f'{BASE_URL}/api/auth/register', json={'email': email, 'name': 'Gamer', 'password': 'Password123!'}, timeout=30)
    assert r.status_code == 200, r.text
    token = r.json()['token']
    # top up
    r2 = requests.post(f'{BASE_URL}/api/wallet/topup', json={'amount': 10}, headers=_auth(token), timeout=30)
    assert r2.status_code == 200
    # checkout
    r3 = requests.post(
        f'{BASE_URL}/api/orders/checkout',
        json={'items': [{'contest_id': game_contest['contest_id'], 'qty': 1, 'skill_answer': '2'}]},
        headers=_auth(token),
        timeout=30,
    )
    assert r3.status_code == 200, r3.text
    # fetch tickets
    r4 = requests.get(f'{BASE_URL}/api/orders/my-tickets', headers=_auth(token), timeout=30)
    tix = [t for t in r4.json() if t['contest_id'] == game_contest['contest_id']]
    assert tix, 'no ticket found for game contest'
    return {'token': token, 'ticket_id': tix[0]['ticket_id'], 'email': email}


class TestGameTypes:
    def test_list_game_types(self):
        r = requests.get(f'{BASE_URL}/api/games/types', timeout=30)
        assert r.status_code == 200
        ids = [g['id'] for g in r.json()['games']]
        for expected in ('memory_match', 'jigsaw_3x3', 'jigsaw_4x4', 'number_sequence', 'target_tap', 'word_unscramble', 'emoji_riddle', 'slider_puzzle'):
            assert expected in ids, f'missing game type {expected}'


class TestContestGameType:
    def test_admin_contests_includes_game_type(self, admin_token, game_contest):
        r = requests.get(f'{BASE_URL}/api/admin/contests', headers=_auth(admin_token), timeout=30)
        assert r.status_code == 200
        row = next((c for c in r.json() if c['contest_id'] == game_contest['contest_id']), None)
        assert row is not None
        assert row.get('game_type') == 'memory_match'


class TestSubmitScore:
    def test_attempts_starts_empty(self, gamer):
        r = requests.get(f'{BASE_URL}/api/games/attempts/{gamer["ticket_id"]}', headers=_auth(gamer['token']), timeout=30)
        assert r.status_code == 200
        assert r.json()['attempts'] == []

    def test_submit_score_first_attempt(self, gamer):
        r = requests.post(
            f'{BASE_URL}/api/games/submit',
            json={'ticket_id': gamer['ticket_id'], 'duration_ms': 15000, 'accuracy': 1.0, 'solved': True},
            headers=_auth(gamer['token']),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['ok'] is True
        assert body['points'] > 0
        assert body['attempts_left'] == 2

    def test_submit_second_and_third(self, gamer):
        for expected_left in (1, 0):
            r = requests.post(
                f'{BASE_URL}/api/games/submit',
                json={'ticket_id': gamer['ticket_id'], 'duration_ms': 20000, 'accuracy': 0.8, 'solved': True},
                headers=_auth(gamer['token']),
                timeout=30,
            )
            assert r.status_code == 200, r.text
            assert r.json()['attempts_left'] == expected_left

    def test_fourth_submit_rejected(self, gamer):
        r = requests.post(
            f'{BASE_URL}/api/games/submit',
            json={'ticket_id': gamer['ticket_id'], 'duration_ms': 15000, 'accuracy': 1.0, 'solved': True},
            headers=_auth(gamer['token']),
            timeout=30,
        )
        assert r.status_code == 400
        assert 'No attempts left' in r.text or 'attempts' in r.text.lower()

    def test_leaderboard_has_user(self, gamer, game_contest):
        r = requests.get(f'{BASE_URL}/api/contests/{game_contest["contest_id"]}/leaderboard', timeout=30)
        assert r.status_code == 200
        rows = r.json()['leaderboard']
        assert len(rows) >= 1
        assert rows[0]['rank'] == 1
