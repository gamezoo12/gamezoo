"""
Backend tests for the Competition Image upload feature.

Covers:
- POST /api/admin/uploads/image (auth, JPG/PNG/WEBP, reject non-image, 8MB cap)
- GET /api/uploads/<file> static serving with correct content-type
- Admin contest create + GET /api/contests round-trip with uploaded URL
"""
import os
import io
import uuid
import time
import random
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASSWORD = 'Herts@910022'

# ---------- Helpers / fixtures ----------

@pytest.fixture(scope='session')
def admin_token():
    r = requests.post(f'{BASE_URL}/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f'Admin login failed: {r.status_code} {r.text}'
    return r.json()['token']


@pytest.fixture(scope='session')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


def _make_jpeg_bytes(size_px=200):
    from PIL import Image
    random.seed(1)
    img = Image.new('RGB', (size_px, size_px))
    px = img.load()
    for x in range(size_px):
        for y in range(size_px):
            px[x, y] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=85)
    return buf.getvalue()


def _make_png_bytes():
    from PIL import Image
    random.seed(2)
    img = Image.new('RGB', (200, 200))
    px = img.load()
    for x in range(200):
        for y in range(200):
            px[x, y] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue()


def _make_webp_bytes():
    from PIL import Image
    random.seed(3)
    img = Image.new('RGB', (200, 200))
    px = img.load()
    for x in range(200):
        for y in range(200):
            px[x, y] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=85)
    return buf.getvalue()


# ---------- Auth ----------
class TestUploadsAuth:
    def test_upload_requires_auth(self):
        files = {'file': ('a.jpg', _make_jpeg_bytes(), 'image/jpeg')}
        r = requests.post(f'{BASE_URL}/api/admin/uploads/image', files=files, timeout=30)
        assert r.status_code == 401, f'Expected 401 without auth, got {r.status_code} - {r.text}'


# ---------- Positive uploads ----------
class TestUploadsPositive:
    def test_upload_jpg(self, admin_headers):
        data = _make_jpeg_bytes()
        files = {'file': ('sample.jpg', data, 'image/jpeg')}
        r = requests.post(f'{BASE_URL}/api/admin/uploads/image', files=files, headers=admin_headers, timeout=60)
        assert r.status_code == 200, f'JPG upload failed: {r.status_code} {r.text}'
        body = r.json()
        assert body['mime'] == 'image/jpeg'
        assert body['size'] == len(data)
        assert body['filename'].endswith('.jpg')
        assert body['url'].startswith(BASE_URL + '/api/uploads/'), f"URL does not start with backend + /api/uploads/: {body['url']}"
        # Static serve
        g = requests.get(body['url'], timeout=30)
        assert g.status_code == 200
        assert g.headers.get('content-type', '').startswith('image/jpeg')
        # persist url on the class for chain test
        TestUploadsPositive.uploaded_jpg_url = body['url']

    def test_upload_png(self, admin_headers):
        data = _make_png_bytes()
        files = {'file': ('sample.png', data, 'image/png')}
        r = requests.post(f'{BASE_URL}/api/admin/uploads/image', files=files, headers=admin_headers, timeout=60)
        assert r.status_code == 200, f'PNG upload failed: {r.status_code} {r.text}'
        body = r.json()
        assert body['mime'] == 'image/png'
        assert body['filename'].endswith('.png')
        g = requests.get(body['url'], timeout=30)
        assert g.status_code == 200
        assert g.headers.get('content-type', '').startswith('image/png')

    def test_upload_webp(self, admin_headers):
        data = _make_webp_bytes()
        files = {'file': ('sample.webp', data, 'image/webp')}
        r = requests.post(f'{BASE_URL}/api/admin/uploads/image', files=files, headers=admin_headers, timeout=60)
        assert r.status_code == 200, f'WEBP upload failed: {r.status_code} {r.text}'
        body = r.json()
        assert body['mime'] == 'image/webp'
        assert body['filename'].endswith('.webp')
        g = requests.get(body['url'], timeout=30)
        assert g.status_code == 200
        # Some static servers may report image/webp; accept any image/*
        ct = g.headers.get('content-type', '')
        assert ct.startswith('image/'), f'Unexpected content-type: {ct}'


# ---------- Negative uploads ----------
class TestUploadsNegative:
    def test_reject_text_file(self, admin_headers):
        files = {'file': ('a.txt', b'hello world not an image', 'text/plain')}
        r = requests.post(f'{BASE_URL}/api/admin/uploads/image', files=files, headers=admin_headers, timeout=30)
        assert r.status_code == 415, f'Expected 415 for text file, got {r.status_code} - {r.text}'

    def test_reject_oversize(self, admin_headers):
        big = os.urandom(9 * 1024 * 1024)
        files = {'file': ('big.jpg', big, 'image/jpeg')}
        r = requests.post(f'{BASE_URL}/api/admin/uploads/image', files=files, headers=admin_headers, timeout=120)
        assert r.status_code == 413, f'Expected 413 for oversize file, got {r.status_code} - {r.text}'


# ---------- Contest integration ----------
class TestContestImageIntegration:
    created_slug = None
    created_image = None

    def test_create_contest_with_uploaded_image(self, admin_headers):
        # 1) upload a jpg first
        data = _make_jpeg_bytes()
        files = {'file': ('cover.jpg', data, 'image/jpeg')}
        u = requests.post(f'{BASE_URL}/api/admin/uploads/image', files=files, headers=admin_headers, timeout=60)
        assert u.status_code == 200
        image_url = u.json()['url']
        assert image_url.startswith('http')
        # Ensure NOT base64
        assert not image_url.startswith('data:'), 'Uploaded image url must not be a base64 data URL'
        TestContestImageIntegration.created_image = image_url

        # 2) create contest via admin API
        title = f'TEST_UploadContest_{uuid.uuid4().hex[:6]}'
        payload = {
            'title': title,
            'subtitle': 'test upload subtitle',
            'category': 'prize-draws',
            'image': image_url,
            'price': 1,
            'tickets_total': 100,
            'prize_amount': 100,
            'end_date': None,
            'jackpot': False,
            'featured': True,
            'status': 'live',
            'skill_question': {'q': 'What is 2+2?', 'options': ['3', '4', '5', '6'], 'answer': '4', 'type': 'math'},
        }
        c = requests.post(f'{BASE_URL}/api/admin/contests', json=payload, headers=admin_headers, timeout=30)
        assert c.status_code == 200, f'Create contest failed: {c.status_code} {c.text}'
        contest = c.json()['contest']
        assert contest['image'] == image_url
        assert 'slug' in contest
        TestContestImageIntegration.created_slug = contest['slug']

    def test_get_public_contests_shows_uploaded_image(self):
        assert TestContestImageIntegration.created_slug, 'Prior test must have created a contest'
        r = requests.get(f'{BASE_URL}/api/contests', timeout=30)
        assert r.status_code == 200
        contests = r.json()
        match = next((x for x in contests if x['slug'] == TestContestImageIntegration.created_slug), None)
        assert match is not None, 'Newly created contest not found in public list'
        assert match['image'] == TestContestImageIntegration.created_image
        assert not match['image'].startswith('data:')

    def test_get_single_contest_shows_uploaded_image(self):
        assert TestContestImageIntegration.created_slug
        r = requests.get(f'{BASE_URL}/api/contests/{TestContestImageIntegration.created_slug}', timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body['image'] == TestContestImageIntegration.created_image
