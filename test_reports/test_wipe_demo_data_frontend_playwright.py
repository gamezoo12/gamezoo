"""Playwright script used with mcp_browser_automation for the admin wipe UI."""


async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    try:
        print("Opening admin login page")
        await page.goto("https://contest-arena-16.preview.emergentagent.com/admin/login", wait_until="domcontentloaded")
        await page.locator('input[name="email"]').fill('bachanta8@gmail.com')
        await page.locator('input[name="password"]').fill('Herts@910022')
        await page.get_by_role('button', name='Sign in to admin').click()
        await page.wait_for_url("**/admin**", timeout=15000)
        print("Admin login succeeded")

        print("Opening settings page")
        await page.goto("https://contest-arena-16.preview.emergentagent.com/admin/settings", wait_until="networkidle")
        danger = page.locator('[data-testid="danger-zone-wipe"]')
        await danger.wait_for(state="visible", timeout=15000)
        print("Danger Zone panel is visible")

        await page.locator('[data-testid="wipe-open-btn"]').click()
        await page.locator('[data-testid="wipe-password-input"]').wait_for(state="visible", timeout=5000)
        await page.locator('[data-testid="wipe-confirm-input"]').wait_for(state="visible", timeout=5000)
        await page.locator('[data-testid="wipe-password-input"]').fill('Herts@910022')
        await page.locator('[data-testid="wipe-confirm-input"]').fill('WIPE DEMO DATA')
        print("Wipe form opened and filled")

        async with page.expect_response(lambda response: '/api/admin/system/wipe-demo-data' in response.url and response.request.method == 'POST', timeout=30000) as resp_info:
            await page.locator('[data-testid="wipe-submit-btn"]').click()
        resp = await resp_info.value
        print(f"Wipe POST status: {resp.status}")
        try:
            print(f"Wipe POST body: {await resp.text()}")
        except Exception as body_err:
            print(f"Could not read wipe response body: {body_err}")

        if resp.status != 200:
            raise Exception(f"Expected wipe POST 200, got {resp.status}")

        await page.locator('[data-testid="wipe-report"]').wait_for(state="visible", timeout=1200)
        report_text = await page.locator('[data-testid="wipe-report"]').inner_text()
        print(f"Wipe report visible: {report_text[:500]}")

        error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")
        print("FRONTEND_WIPE_TEST_SUCCESS")
    except Exception as e:
        print(f"FRONTEND_WIPE_TEST_FAILURE: {e}")
        try:
            await page.screenshot(path='/app/test_reports/wipe_frontend_failure.jpg', quality=40, full_page=False)
        except Exception:
            pass
        raise