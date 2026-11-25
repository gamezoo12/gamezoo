# Signup Challenge anti-forgery scoring + demo cap (public URL, QA seed users only). Reseeds sc.uk between groups.
import os
import subprocess
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
PW = 'Player@12345'


def reseed():
    subprocess.run(['python', 'scripts/seed_signup_challenge_test.py', '--enable'], cwd='/app/backend', check=True, capture_output=True)


def login(email, pw=PW):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={'email': email, 'password': pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    s.headers['Authorization'] = 'Bearer ' + r.json()['token']
    return s


def start(s):
    r = s.post(f"{BASE_URL}/api/signup-challenge/attempts/start", json={'request_id': uuid.uuid4().hex[:12]})
    assert r.status_code == 200, r.text
    return r.json()['attempt']


def submit(s, aid, **body):
    r = s.post(f"{BASE_URL}/api/signup-challenge/attempts/{aid}/submit", json=body)
    assert r.status_code == 200, r.text
    return r.json()['attempt']


# Forged submits must be rejected (status failed, score null)
class TestForgery:
    @pytest.fixture(scope='class', autouse=True)
    def _seed(self):
        reseed()
        yield

    def test_missing_tap_ms_and_short_duration(self):
        s = login('sc.uk@example.com')
        s.get(f"{BASE_URL}/api/signup-challenge/me")
        a = start(s); n = a['board']['target']
        time.sleep(4)
        r = submit(s, a['attempt_id'], taps=list(range(1, n + 1)), tap_ms=[], duration_ms=100, finished=True)
        print('missing tap_ms ->', r['status'], r.get('score'))
        assert r['status'] == 'failed' and r.get('score') is None

    def test_short_tap_ms_list(self):
        s = login('sc.uk@example.com')
        a = start(s); n = a['board']['target']
        time.sleep(3 + n * 0.2)
        r = submit(s, a['attempt_id'], taps=list(range(1, n + 1)), tap_ms=[200 * (i + 1) for i in range(n - 3)], duration_ms=200 * n, finished=True)
        print('short tap_ms ->', r['status'], r.get('score'))
        assert r['status'] == 'failed' and r.get('score') is None

    def test_duration_much_shorter_than_server(self):
        s = login('sc.uk@example.com')
        a = start(s); n = a['board']['target']
        time.sleep(3 + 8)  # server play ~8s, claim 4s (realistic taps)
        r = submit(s, a['attempt_id'], taps=list(range(1, n + 1)), tap_ms=[200 * (i + 1) for i in range(n)], duration_ms=200 * n, finished=True)
        print('short duration ->', r['status'], r.get('score'))
        assert r['status'] == 'failed' and r.get('score') is None


class TestForgery2:
    @pytest.fixture(scope='class', autouse=True)
    def _seed(self):
        reseed()
        yield

    def test_tap_gap_below_40(self):
        s = login('sc.uk@example.com')
        s.get(f"{BASE_URL}/api/signup-challenge/me")
        a = start(s); n = a['board']['target']
        stamps = [250 * (i + 1) for i in range(n)]
        stamps[10] = stamps[9] + 20  # one 20ms gap
        time.sleep(3 + stamps[-1] / 1000)
        r = submit(s, a['attempt_id'], taps=list(range(1, n + 1)), tap_ms=stamps, duration_ms=stamps[-1], finished=True)
        print('gap<40 ->', r['status'], r.get('score'))
        assert r['status'] == 'failed' and r.get('score') is None

    def test_avg_below_150(self):
        s = login('sc.uk@example.com')
        a = start(s); n = a['board']['target']
        stamps = [120 * (i + 1) for i in range(n)]  # 2.4s for 20
        time.sleep(3 + stamps[-1] / 1000)
        r = submit(s, a['attempt_id'], taps=list(range(1, n + 1)), tap_ms=stamps, duration_ms=stamps[-1], finished=True)
        print('avg<150 ->', r['status'], r.get('score'))
        assert r['status'] == 'failed' and r.get('score') is None

    def test_genuine_accepted(self):
        s = login('sc.uk@example.com')
        a = start(s); n = a['board']['target']
        stamps = [220 * (i + 1) + (i % 3) * 30 for i in range(n)]
        time.sleep(3 + stamps[-1] / 1000)
        r = submit(s, a['attempt_id'], taps=list(range(1, n + 1)), tap_ms=stamps, duration_ms=stamps[-1], finished=True)
        print('genuine ->', r['status'], r.get('score'))
        assert r['status'] == 'completed' and abs(r['score'] - stamps[-1]) <= 5


# Genuine run with network latency (+1s extra wait) accepted; demo cap enforced
class TestGenuineLatencyAndDemoCap:
    @pytest.fixture(scope='class', autouse=True)
    def _seed(self):
        reseed()
        yield

    def test_genuine_with_latency(self):
        s = login('sc.uk@example.com')
        s.get(f"{BASE_URL}/api/signup-challenge/me")
        a = start(s); n = a['board']['target']
        stamps = [300 * (i + 1) for i in range(n)]
        time.sleep(3 + stamps[-1] / 1000 + 1.0)
        r = submit(s, a['attempt_id'], taps=list(range(1, n + 1)), tap_ms=stamps, duration_ms=stamps[-1], finished=True)
        print('genuine+latency ->', r['status'], r.get('score'))
        assert r['status'] == 'completed' and r['score'] == stamps[-1]

    def test_duration_longer_than_server_rejected(self):
        s = login('sc.uk@example.com')
        a = start(s); n = a['board']['target']
        time.sleep(3 + 4)
        stamps = [400 * (i + 1) for i in range(n)]  # claims 8s while server ~4s
        r = submit(s, a['attempt_id'], taps=list(range(1, n + 1)), tap_ms=stamps, duration_ms=stamps[-1], finished=True)
        print('longer ->', r['status'])
        assert r['status'] == 'failed'

    def test_demo_cap(self):
        s = login('sc.uk@example.com')
        codes = [s.post(f"{BASE_URL}/api/signup-challenge/event", json={'type': 'demo_start'}).status_code for _ in range(4)]
        print('demo codes', codes)
        assert codes == [200, 200, 200, 409]
