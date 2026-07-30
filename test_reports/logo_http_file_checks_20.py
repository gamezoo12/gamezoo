
import hashlib
import json
import os
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get('TEST_BASE_URL', 'https://contest-arena-16.preview.emergentagent.com')
ASSET_URL = 'https://customer-assets.emergentagent.com/job_contest-arena-16/artifacts/t9zu926h_image.png'
OUT_DIR = Path('/app/test_reports/logo_evidence')
OUT_DIR.mkdir(parents=True, exist_ok=True)

result = {'base_url': BASE_URL, 'asset_url': ASSET_URL, 'files': {}, 'network': {}}
local_path = Path('/app/frontend/public/logo.png')
if local_path.exists():
    data = local_path.read_bytes()
    result['files']['local_logo'] = {'path': str(local_path), 'size': len(data), 'md5': hashlib.md5(data).hexdigest()}

for name, url in [('user_asset', ASSET_URL), ('served_logo_v3', BASE_URL + '/logo.png?v=3'), ('served_logo_plain', BASE_URL + '/logo.png')]:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'bug-verification-logo-test'})
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = resp.read()
            key = 'files' if name == 'user_asset' else 'network'
            result[key][name] = {
                'url': url,
                'status': resp.status,
                'size': len(data),
                'md5': hashlib.md5(data).hexdigest(),
                'content_type': resp.headers.get('Content-Type'),
                'cache_control': resp.headers.get('Cache-Control'),
            }
            (OUT_DIR / f'{name}.png').write_bytes(data)
    except Exception as e:
        result['network' if name != 'user_asset' else 'files'][name + '_error'] = repr(e)

# Try to get image dimensions if Pillow is available
try:
    from PIL import Image
    for p in OUT_DIR.glob('*.png'):
        with Image.open(p) as im:
            target = result['files'].get(p.stem) or result['network'].get(p.stem)
            if target is not None:
                target['dimensions'] = {'width': im.width, 'height': im.height}
except Exception as e:
    result['dimension_probe_error'] = repr(e)

Path('/app/test_reports/logo_http_file_checks_20.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
