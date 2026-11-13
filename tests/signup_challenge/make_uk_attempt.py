"""Create one completed attempt for sc.uk (for admin Participants tab checks)."""
import time
import uuid
from test_signup_challenge_e2e_api import BASE, UK, login, realistic_run

s = login(UK)
s.get(f'{BASE}/signup-challenge/me')
a = s.post(f'{BASE}/signup-challenge/attempts/start', json={'request_id': uuid.uuid4().hex}).json()['attempt']
stamps, taps, dur = realistic_run(wait=6.5)
print(s.post(f'{BASE}/signup-challenge/attempts/{a["attempt_id"]}/submit',
             json={'taps': taps, 'tap_ms': stamps, 'duration_ms': dur, 'finished': True}).json()['attempt'])
