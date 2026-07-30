"""Static/network checks for the Prize League logo regression."""

from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image


BASE = "https://contest-arena-16.preview.emergentagent.com"
ROOT = Path("/app")


def assert_logo_bytes(label, data):
    img = Image.open(BytesIO(data))
    print({"label": label, "bytes": len(data), "dimensions": img.size, "mode": img.mode})
    assert 15000 <= len(data) <= 25000, f"{label}: expected cropped ~18KB logo, got {len(data)} bytes"
    assert img.size == (210, 100), f"{label}: expected 210x100 cropped logo, got {img.size}"


def main():
    local_logo = ROOT / "frontend/public/logo.png"
    assert_logo_bytes("local /frontend/public/logo.png", local_logo.read_bytes())

    request = Request(f"{BASE}/logo.png?v=4", headers={"User-Agent": "Mozilla/5.0 logo-verification"})
    with urlopen(request, timeout=20) as response:
        remote_data = response.read()
        print({"remote_status": response.status, "content_type": response.headers.get("content-type"), "content_length": response.headers.get("content-length")})
    assert_logo_bytes("preview /logo.png?v=4", remote_data)

    brand = (ROOT / "frontend/src/lib/brand.js").read_text()
    component = (ROOT / "frontend/src/components/layout/PrizeLeagueLogo.jsx").read_text()
    header = (ROOT / "frontend/src/components/layout/Header.jsx").read_text()
    assert "logoUrl: '/logo.png?v=4'" in brand
    assert "logoAspect: 210 / 100" in brand
    assert "data-testid=\"prizeleague-logo\"" in component
    assert "<PrizeLeagueLogo size={64} />" in header
    print("Static/network logo checks passed")


if __name__ == "__main__":
    main()
