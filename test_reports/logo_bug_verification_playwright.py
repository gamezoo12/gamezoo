"""Focused Playwright verification for the Prize League logo regression.

Run with: python3 /app/test_reports/logo_bug_verification_playwright.py
"""

import asyncio
import json

from playwright.async_api import async_playwright


BASE = "https://contest-arena-16.preview.emergentagent.com"


async def visible_logo_infos(page, route_label):
    await page.wait_for_selector('[data-testid="prizeleague-logo"]', state="attached", timeout=15000)
    await page.wait_for_timeout(500)
    infos = await page.evaluate(
        """
        () => Array.from(document.querySelectorAll('[data-testid="prizeleague-logo"]')).map((img, index) => {
          const r = img.getBoundingClientRect();
          const style = window.getComputedStyle(img);
          return {
            index,
            src: img.currentSrc || img.src,
            attrSrc: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            renderedWidth: Math.round(r.width),
            renderedHeight: Math.round(r.height),
            visible: !!(r.width && r.height) && style.visibility !== 'hidden' && style.display !== 'none',
            complete: img.complete
          };
        })
        """
    )
    visible = [i for i in infos if i.get("visible")]
    print(f"{route_label} logo infos: {json.dumps(infos, indent=2)}")
    if not visible:
        raise AssertionError(f"No visible logo found on {route_label}")
    for info in visible:
        assert "/logo.png?v=4" in info["src"], info
        assert info["naturalWidth"] == 210 and info["naturalHeight"] == 100, info
        assert info["renderedWidth"] > 70 and info["renderedHeight"] > 30, info
        aspect = info["renderedWidth"] / info["renderedHeight"]
        assert 1.9 <= aspect <= 2.3, info
    return visible


async def fetch_asset_probe(page):
    return await page.evaluate(
        """
        async () => {
          const requested = '/logo.png?v=4';
          const res = await fetch(requested, { cache: 'reload' });
          const blob = await res.blob();
          const dims = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = URL.createObjectURL(blob);
          });
          return { requested, finalUrl: res.url, status: res.status, size: blob.size, type: blob.type, dims };
        }
        """
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        logo_requests = []
        logo_responses = []
        page.on("request", lambda request: logo_requests.append(request.url) if "/logo.png" in request.url else None)
        page.on("response", lambda response: logo_responses.append({"url": response.url, "status": response.status, "contentLength": response.headers.get("content-length")}) if "/logo.png" in response.url else None)

        await page.goto(BASE + "/", wait_until="networkidle", timeout=60000)
        home = await visible_logo_infos(page, "homepage")
        assert 126 <= home[0]["renderedWidth"] <= 142 and 60 <= home[0]["renderedHeight"] <= 68, home[0]
        asset = await fetch_asset_probe(page)
        print("Asset probe:", json.dumps(asset, indent=2))
        assert asset["status"] == 200
        assert 15000 <= asset["size"] <= 25000
        assert asset["dims"] == {"width": 210, "height": 100}

        await page.goto(BASE + "/login", wait_until="networkidle", timeout=60000)
        await visible_logo_infos(page, "/login")

        await page.goto(BASE + "/admin/login", wait_until="networkidle", timeout=60000)
        await visible_logo_infos(page, "/admin/login")
        await page.locator('input[name="email"]').fill("bachanta8@gmail.com")
        await page.locator('input[name="password"]').fill("Herts@910022")
        await page.locator('button[type="submit"]').click()
        await page.wait_for_url(lambda url: "/admin" in url and "/admin/login" not in url, timeout=20000)
        await page.wait_for_selector('[data-testid="admin-layout"]', timeout=20000)
        await visible_logo_infos(page, "/admin sidebar")

        await page.goto(BASE + "/my-account", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(1000)
        assert "/my-account" in page.url
        my_account = await visible_logo_infos(page, "/my-account")
        assert 126 <= my_account[0]["renderedWidth"] <= 142 and 60 <= my_account[0]["renderedHeight"] <= 68, my_account[0]

        print("Logo requests:", json.dumps(logo_requests, indent=2))
        print("Logo responses:", json.dumps(logo_responses, indent=2))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
