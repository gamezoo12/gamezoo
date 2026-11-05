# Reference playwright snippet used by testing agent (iteration 62) for party game sweep at 430x900.
SWEEP = r'''
import random, hashlib
await page.set_viewport_size({"width": 430, "height": 900})
BASE = "https://import-verify-6.preview.emergentagent.com"
results = []
errs = []
page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:200]))
page.on("console", lambda m: errs.append("CONSOLE " + m.text[:200]) if m.type == "error" else None)
for gid, kind in GAMES:
    r = {"id": gid}
    errs.clear()
    try:
        await page.goto(f"{BASE}/games/{gid}", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        d = page.get_by_role("button", name="Decline")
        if await d.count():
            await d.first.click()
        r["cover"] = await page.evaluate("""() => { const i = Array.from(document.images).find(x => !x.src.includes('logo')); return i ? (i.complete && i.naturalWidth > 0) : false }""")
        await page.click('[data-testid="practice-level-1"]', timeout=8000)
        await page.wait_for_timeout(500)
        await page.click('[data-testid="practice-start"]', timeout=8000)
        await page.wait_for_timeout(4200)
        board = page.locator('[data-testid$="-board"]').first
        await board.wait_for(timeout=8000)
        r["board"] = await board.get_attribute("data-testid")
        r["theme"] = await page.locator('[data-testid="party-theme-name"]').inner_text()
        r["p1"] = (await page.locator('[data-testid="party-player-1"]').inner_text()).replace("\n", " ")[:40]
        r["match_clock"] = await page.locator('[data-testid="party-match-clock"]').count()
        st = page.locator('[data-testid$="-status"]').first
        statuses = set()
        changes = 0
        bot_ok = 0
        bot_slow = 0
        for step in range(MOVES):
            if kind == "duel":
                try:
                    await page.wait_for_selector('[data-testid="party-turn-clock"]', timeout=4000)
                except Exception:
                    if await page.locator('[data-testid="practice-run"]').count() == 0 or await st.count() == 0:
                        break
            if step == 0:
                r["turn_clock"] = await page.locator('[data-testid="party-turn-clock"]').count()
            if await st.count() == 0:
                break
            statuses.add((await st.inner_text())[:50])
            before = hashlib.md5((await board.inner_html()).encode()).hexdigest()
            btns = board.locator("button:not([disabled])")
            n = await btns.count()
            if n == 0:
                btns = page.locator('[data-testid="party-stage"] button:not([disabled])').filter(has_not=page.locator('xx'))
                n = await btns.count()
            if n == 0:
                break
            # try a few buttons until board changes
            moved = False
            for _ in range(6):
                idx = random.randrange(n)
                try:
                    await btns.nth(idx).click(timeout=1500, force=True)
                except Exception:
                    pass
                await page.wait_for_timeout(250)
                if await board.count() == 0:
                    moved = True; break
                after = hashlib.md5((await board.inner_html()).encode()).hexdigest()
                if after != before:
                    moved = True; break
                n = await btns.count()
                if n == 0: break
            if moved:
                changes += 1
            if await st.count():
                statuses.add((await st.inner_text())[:50])
            if kind == "duel" and moved:
                try:
                    await page.wait_for_selector('[data-testid="party-turn-clock"]', timeout=2600)
                    bot_ok += 1
                except Exception:
                    bot_slow += 1
        r["moves"] = changes
        r["bot_ok"] = bot_ok
        r["bot_slow_or_over"] = bot_slow
        r["statuses"] = list(statuses)[:4]
        r["overflow"] = await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        r["end"] = await page.evaluate("""() => Array.from(document.querySelectorAll('[data-testid^="practice-"]')).map(e=>e.dataset.testid).filter(t=>/pass|fail|result/.test(t)).slice(0,3)""")
    except Exception as e:
        r["ERR"] = str(e)[:200]
        await page.screenshot(path=f".screenshots/err_{gid}.jpg", quality=40)
    r["errors"] = [x for x in errs if "posthog" not in x.lower()][:3]
    print(r)
'''
