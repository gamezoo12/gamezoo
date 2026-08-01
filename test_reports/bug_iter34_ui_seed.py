#!/usr/bin/env python3
"""Seed a fresh live skill-game contest for the browser checkout flow only."""
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

BASE = 'https://contest-arena-16.preview.emergentagent.com'
OUT = Path('/app/test_reports/bug_iter34_ui_seed.json')

s = requests.Session()
login = s.post(f'{BASE}/api/auth/login', json={'email': 'bachanta8@gmail.com', 'password': 'Herts@910022'}, timeout=30)
login.raise_for_status()
tok = login.json()['token']
s.headers.update({'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
me = s.get(f'{BASE}/api/auth/me', timeout=30).json()
ts = int(time.time())
payload = {
    'title': f'BUG34 UI Checkout Route {ts}',
    'category': 'prize-draws',
    'price': 1.0,
    'tickets_total': 10,
    'prize_amount': 25.0,
    'end_date': (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    'image': 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'skill_question_type': 'addition',
    'skill_question_difficulty': 'easy',
    'status': 'live',
}
created = s.post(f'{BASE}/api/admin/contests', json=payload, timeout=30)
created.raise_for_status()
contest = created.json()['contest']
cid = contest['contest_id']
upd = s.put(f'{BASE}/api/admin/contests/{cid}', json={
    'game_type': 'math_sprint',
    'game_config': {'rounds': 3},
    'entry_mode': 'skill_game',
    'attempts_per_ticket': 3,
    'max_attempts': 3,
    'status': 'live',
    'winner_selection_method': 'leaderboard',
}, timeout=30)
upd.raise_for_status()
wallet = s.post(f'{BASE}/api/admin/wallets/adjust', json={'user_id': me['user_id'], 'amount': 10, 'note': 'bug34 UI flow seed'}, timeout=30)
wallet.raise_for_status()
contests = s.get(f'{BASE}/api/admin/contests', timeout=30).json()
contest = next(c for c in contests if c['contest_id'] == cid)
result = {'contest': contest, 'user_id': me['user_id'], 'wallet': wallet.json()}
OUT.write_text(json.dumps(result, indent=2, default=str))
print(json.dumps(result, indent=2, default=str))