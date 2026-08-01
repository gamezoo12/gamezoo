#!/usr/bin/env python3
"""Probe checkout status for the UI contest after browser timeouts."""
import json
import re
from pathlib import Path

import requests

BASE = 'https://contest-arena-16.preview.emergentagent.com'
CID = 'c_5c85d1c66ba2'
SLUG = 'bug34-checkout-play-route-1785608154-7777b0'
OUT = Path('/app/test_reports/bug_iter34_checkout_probe.json')


def ans(q):
    m = re.search(r'(\d+)\s*([+−×÷-])\s*(\d+)\s*=', q)
    a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
    return a + b if op == '+' else a - b if op in ('-', '−') else a * b if op == '×' else a // b


s = requests.Session()
r = s.post(f'{BASE}/api/auth/login', json={'email': 'bachanta8@gmail.com', 'password': 'Herts@910022'}, timeout=30)
tok = r.json()['token']
s.headers.update({'Authorization': f'Bearer {tok}'})
ch = s.get(f'{BASE}/api/contests/{SLUG}/skill-challenge', timeout=30).json()
answer = ans(ch['question'])
checkout = s.post(f'{BASE}/api/orders/checkout', json={'items': [{'contest_id': CID, 'qty': 1, 'skill_answer': str(answer), 'challenge_token': ch['challenge_token']}]}, timeout=30)
wallet = s.get(f'{BASE}/api/wallet/me', timeout=30).json()
tickets = s.get(f'{BASE}/api/orders/my-tickets', timeout=30).json()
result = {
    'challenge': {'question': ch['question'], 'answer': answer},
    'checkout_status': checkout.status_code,
    'checkout_body': checkout.text[:1000],
    'wallet': wallet,
    'matching_ticket_count': sum(1 for t in tickets if t.get('contest_id') == CID),
    'matching_tickets': [t.get('ticket_id') for t in tickets if t.get('contest_id') == CID][:20],
}
OUT.write_text(json.dumps(result, indent=2, default=str))
print(json.dumps(result, indent=2, default=str))