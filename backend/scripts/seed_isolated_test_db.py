"""Seeds the isolated test API (127.0.0.1:8002) with a test admin and players. Credentials come from TEST_CREDS_FILE (mode 600)."""
import os
import sys

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests

CREDS_FILE = os.environ.get('TEST_CREDS_FILE', '/tmp/prizeleague_test_creds.env')
API = os.environ.get('TEST_API', 'http://127.0.0.1:8002') + '/api'
OTP = os.environ.get('TEST_OTP_BYPASS_CODE', '000000')

if not API.startswith(('http://127.0.0.1', 'http://localhost')):
    sys.exit('Refusing to seed a non-loopback API')

creds = dict(line.rstrip('\n').split('=', 1) for line in open(CREDS_FILE) if '=' in line)


def register(email: str, name: str, index: int) -> None:
    r = requests.post(f'{API}/auth/register', timeout=15, json={
        'email': email, 'password': creds['TEST_PLAYER_PASSWORD'], 'name': name,
        'phone': f'+1555010{index}001', 'otp_code': OTP, 'email_otp_code': OTP,
        'accept_terms': True, 'dob': '2000-08-02',
    })
    print(f'register {name}: {r.status_code}')


r = requests.post(f'{API}/auth/bootstrap-admin', timeout=15, json={
    'email': creds['TEST_ADMIN_EMAIL'], 'password': creds['TEST_ADMIN_PASSWORD'], 'name': 'Test Admin',
})
print(f'bootstrap admin: {r.status_code}')
register(creds['TEST_PLAYER_EMAIL'], 'Player One', 0)
register(creds['TEST_BROKE_EMAIL'], 'Player Broke', 1)


# Free World: seed the 100 holders and launch Season 1 from today's UK midnight (the only start the API accepts).
login = requests.post(f'{API}/auth/login', timeout=15, json={'email': creds['TEST_ADMIN_EMAIL'], 'password': creds['TEST_ADMIN_PASSWORD']})
admin = {'Authorization': f"Bearer {login.json()['token']}"}
london_midnight = datetime.now(ZoneInfo('Europe/London')).replace(hour=0, minute=0, second=0, microsecond=0)
print('world seed:', requests.post(f'{API}/admin/world/seed', headers=admin, timeout=60).status_code)
act = requests.post(f'{API}/admin/world/activate', headers=admin, timeout=60,
                    json={'contest_number': 1, 'start_at': london_midnight.astimezone(timezone.utc).isoformat()})
print('world activate:', act.status_code, '' if act.status_code == 200 else act.text[:160])

# Paid World: one live contest per game type.
for game_type in ('number_sequence', 'memory_match', 'emoji_riddle'):
    r = requests.post(f'{API}/admin/contests', headers=admin, timeout=30, json={
        'title': f'Seeded {game_type}', 'subtitle': 'isolated test contest', 'category': 'prize-draws',
        'image': 'https://images.example.com/test.jpg', 'price': 1.0, 'tickets_total': 100, 'prize_amount': 50,
        'jackpot': False, 'featured': False, 'status': 'live', 'game_type': game_type,
    })
    contest = r.json().get('contest') or {}
    upd = requests.put(f"{API}/admin/contests/{contest.get('contest_id')}", headers=admin, timeout=30, json={'game_type': game_type})
    print(f'contest {game_type}:', r.status_code, upd.status_code)
