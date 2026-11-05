# Playwright body (exec'd inside browser_automation): plays arcade styles in GAMES at level LEVEL and reports outcome.
async def run_arcade(page, games, level=1, shots=False, bad='🐛'):
    BASE = "https://import-verify-6.preview.emergentagent.com"
    solv = open('/app/tests/arcade_solvers.js').read()
    out = {}
    for style in games:
        try:
            await page.goto(f"{BASE}/games/arc_{style}_fruit", wait_until="domcontentloaded")
            await page.wait_for_timeout(1800)
            if await page.locator('[data-testid="analytics-decline"]').count():
                await page.click('[data-testid="analytics-decline"]')
            if level > 1:
                await page.evaluate(f"() => {{ const p = JSON.parse(localStorage.getItem('pl-practice-progress')||'{{}}'); p['arc_{style}'] = {{unlocked: {level}, stars: {{}}}}; localStorage.setItem('pl-practice-progress', JSON.stringify(p)); }}")
                await page.reload(); await page.wait_for_timeout(1500)
            await page.click(f'[data-testid="practice-level-{level}"]', timeout=10000)
            await page.click('[data-testid="practice-start"]', timeout=10000)
            await page.wait_for_selector('[data-testid^="arcade-"][data-testid$="-stage"]', timeout=10000)
            await page.wait_for_timeout(300)
            if shots:
                await page.screenshot(path=f".screenshots/play_{style}.jpg", quality=40, full_page=False)
            await page.evaluate("() => { window.__bad = '"+bad+"'; }")
            await page.evaluate(solv)
            await page.evaluate(f"() => window.__solve('{style}')")
            await page.wait_for_selector('[data-testid="practice-pass"],[data-testid="practice-fail"]', timeout=75000)
            await page.wait_for_timeout(400)
            passed = await page.locator('[data-testid="practice-pass"]').count()
            txt = await page.locator('[data-testid="practice-pass"],[data-testid="practice-fail"]').first.inner_text()
            cel = await page.locator('[data-testid="practice-celebration"]').count()
            line = [l for l in txt.split('\n') if 'Time' in l or 'Level' in l or 'close' in l or 'up' in l][:2]
            out[style] = (passed, cel, line)
            print(f"{style}: passed={passed} celebration={cel} {line}")
        except Exception as e:
            stats = await page.evaluate("() => Array.from(document.querySelectorAll('[data-testid^=arcade-stat-]')).map(e=>e.textContent).join(' | ')")
            print(style, "ERR", str(e)[:120], "stats:", stats)
            await page.screenshot(path=f".screenshots/err_{style}.jpg", quality=40, full_page=False)
    return out
