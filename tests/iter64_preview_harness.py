# Iteration 64 harness: play the 11 batch6 games inside the admin GC preview dialog. exec() inside browser_automation.
import re
BASE = "https://import-verify-6.preview.emergentagent.com"

async def setup_admin(page):
    r = await page.request.post(f"{BASE}/api/auth/login", data={"email": "bachanta8@gmail.com", "password": "Herts@910022"})
    tok = (await r.json())["token"]
    await page.evaluate(f"localStorage.setItem('gz_token', '{tok}')")
    await page.goto(f"{BASE}/admin/world-gc-settings")
    await page.wait_for_selector('[data-testid="gc-select"]', timeout=20000)
    try:
        await page.get_by_role("button", name="Decline").click(timeout=3000)
    except Exception:
        pass
    await page.select_option('[data-testid="gc-select"]', "12")
    await page.wait_for_timeout(2000)
    await page.select_option('[data-testid="gc-game-1"]', "pipe_connect")
    await page.click('[data-testid="gc-preview-game-1"]')
    await page.wait_for_selector('[data-testid="game-preview-dialog"]', timeout=5000)

async def open_game(page, gid, level):
    await page.select_option('[data-testid="preview-game-select"]', gid)
    await page.select_option('[data-testid="preview-difficulty-select"]', str(level))
    await page.click('[data-testid="preview-start-demo"]')
    await page.wait_for_timeout(500)

async def completed(page):
    if await page.locator('[data-testid="preview-result"]').count():
        return (await page.inner_text('[data-testid="preview-result"]')).split("\n")[0]
    return None

async def frame_text(page):
    return await page.inner_text('[data-testid="preview-frame"]')

async def play(page, gid, level, max_s=60):
    t = page.locator
    if gid == "pipe_connect":
        n = await t('[data-testid^="pipe-"]:not([data-testid="pipe-board"])').count()
        for k in range(min(n, 6)):
            await page.click(f'[data-testid="pipe-{k}"]')
        txt = await frame_text(page)
        return f"tiles={n} turnsOK={'6' in txt}"
    if gid == "ball_sort":
        tubes = await t('[data-testid^="tube-"]').count()
        last = tubes - 1
        await page.click('[data-testid="tube-0"]'); await page.click(f'[data-testid="tube-{last}"]')
        moved = await t(f'[data-testid="tube-{last}"] span').count()
        await page.click('[data-testid="ballsort-restart"]')
        after = await t(f'[data-testid="tube-{last}"] span').count()
        return f"tubes={tubes} moved={moved} afterRestart={after}"
    if gid == "colour_flood":
        cols = await t('[data-testid^="flood-colour-"]').count()
        for i in range(400):
            if await completed(page): break
            await page.click(f'[data-testid="flood-colour-{i % cols}"]')
        return f"colours={cols} clicks={i}"
    if gid == "code_breaker":
        cols = await t('[data-testid^="code-colour-"]').count()
        slots = await t('[data-testid="code-current"] button').count()
        for k in range(slots):
            await page.click(f'[data-testid="code-colour-{k % cols}"]')
        await page.click('[data-testid="code-submit"]')
        hist = await t('[data-testid="code-history"] > div').count()
        return f"colours={cols} len={slots} history={hist}"
    if gid == "word_search":
        cells = await t('[data-testid^="ws-"]').count()
        await page.click('[data-testid="ws-0"]'); await page.click('[data-testid="ws-1"]')
        txt = await frame_text(page)
        return f"cells={cells} txt_has_misses={'1' in txt}"
    if gid == "speed_typing":
        for _ in range(40):
            if await completed(page): break
            w = (await page.inner_text('[data-testid="typing-word"]')).strip()
            await page.click('[data-testid="typing-input"]')
            await page.keyboard.type(w.lower(), delay=10)
            await page.wait_for_timeout(100)
        return "typed"
    if gid == "quick_count":
        for _ in range(20):
            if await completed(page): break
            c = await t('[data-testid="count-board"] span').count()
            if c == 0:
                await page.wait_for_timeout(150); continue
            await page.wait_for_selector('[data-testid^="count-option-"]:not([disabled])', timeout=5000)
            await page.click(f'[data-testid="count-option-{c}"]')
            await page.wait_for_timeout(200)
        return "counted"
    if gid == "shape_rotation":
        for _ in range(40):
            if await completed(page): break
            for k in range(4):
                rb = re.search(r"round\s*(\d+)/", await frame_text(page), re.I).group(1)
                await page.click(f'[data-testid="shape-option-{k}"]')
                await page.wait_for_timeout(350)
                if await completed(page): break
                ra = re.search(r"round\s*(\d+)/", await frame_text(page), re.I)
                if ra and ra.group(1) != rb: break
        return "picked"
    if gid == "path_memory":
        for _ in range(8):
            if await completed(page): break
            seq = []
            for _ in range(400):
                lit = await page.evaluate("""() => { const b = Array.from(document.querySelectorAll('[data-testid^="path-"]')).filter(e => /^path-\\d+$/.test(e.dataset.testid)); const i = b.findIndex(e => e.className.includes('bg-fuchsia-400')); return i; }""")
                if lit >= 0 and (not seq or seq[-1] != lit): seq.append(lit)
                ph = await page.inner_text('[data-testid="path-phase"]')
                if ph.startswith("Now") and seq: break
                await page.wait_for_timeout(30)
            for k in seq:
                await page.click(f'[data-testid="path-{k}"]')
            await page.wait_for_timeout(200)
        return f"lastseq={len(seq)}"
    if gid == "stack_tower":
        clicks = 0
        for _ in range(3000):
            if await completed(page) or clicks > 40: break
            d = await page.evaluate("""() => { const m = document.querySelector('[data-testid="stack-moving"]'); const spans = m.parentElement.querySelectorAll('span'); const top = spans[spans.length-2]; return [parseFloat(m.style.left), parseFloat(top.style.left)]; }""")
            if abs(d[0] - d[1]) < 4:
                await page.click('[data-testid="stack-board"]'); clicks += 1
                await page.wait_for_timeout(60)
        return f"drops={clicks}"
    if gid == "sum_hunt":
        for _ in range(10):
            if await completed(page): break
            res = await page.evaluate("""() => { const tiles = Array.from(document.querySelectorAll('[data-testid^="sum-"]')).filter(e => /^sum-\\d+$/.test(e.dataset.testid)); const nums = tiles.map(e => parseInt(e.textContent)); const m = document.querySelector('[data-testid="preview-frame"]').innerText.match(/target\\s*(\\d+)/i); const target = parseInt(m[1]);
              const pick = []; const dfs = (i, s) => { if (s === target) return true; if (i >= nums.length || s > target) return false; pick.push(i); if (dfs(i+1, s+nums[i])) return true; pick.pop(); return dfs(i+1, s); }; dfs(0, 0); return pick; }""")
            for k in res:
                await page.click(f'[data-testid="sum-{k}"]')
            await page.wait_for_timeout(200)
        return "summed"
