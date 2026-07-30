
import json
import time
import urllib.request
from pathlib import Path

BASE = 'https://contest-arena-16.preview.emergentagent.com/api'
email = f'e2e_logo_{int(time.time())}@test.com'
payload = {
    'email': email,
    'password': 'Password123!',
    'name': 'Logo Test User',
    'phone': '+4477009' + str(int(time.time()))[-5:],
    'otp_code': '000000',
    'accept_terms': True,
    'dob': '2000-08-02',
    'address': '221B Baker St, London'
}
result = {'payload_email': email}
try:
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(BASE + '/auth/register', data=data, headers={'Content-Type':'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=45) as resp:
        body = json.loads(resp.read().decode('utf-8'))
        result['status'] = resp.status
        result['token_present'] = bool(body.get('token'))
        result['user'] = {k: body.get('user', {}).get(k) for k in ['email', 'name', 'role', 'id']}
        result['token'] = body.get('token')
except Exception as e:
    result['error'] = repr(e)
Path('/app/test_reports/logo_player_register_20.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k != 'token'}, indent=2))
