# Iteration 66 harness: result-score display. exec() inside browser_automation.
BASE = "https://import-verify-6.preview.emergentagent.com"

async def login_player(page, email="player1@example.com", pw="Player@12345"):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    r = await page.request.post(f"{BASE}/api/auth/login", data={"email": email, "password": pw})
    tok = (await r.json())["token"]
    await page.evaluate(f"localStorage.setItem('gz_token', '{tok}'); sessionStorage.setItem('pl_santa_intro_seen','1');")
    await page.goto(f"{BASE}/world")
    await page.wait_for_selector('[data-testid="free-world-avatar"]', timeout=25000)
    try:
        await page.get_by_role("button", name="Decline").click(timeout=3000)
    except Exception:
        pass
    await page.wait_for_timeout(1500)

async def click_text(page, text):
    ok = await page.evaluate("""(t) => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().toUpperCase().includes(t.toUpperCase()) && !x.disabled); if (b) { b.click(); return true; } return false; }""", text)
    return ok

async def math_answer(page):
    q = await page.inner_text('[data-testid="math-question"]')
    expr = q.split('=')[0].replace('×', '*').replace('−', '-').replace('÷', '/').strip()
    return int(round(eval(expr)))

async def solve_math(page, wrong=0, max_q=40):
    """Answer premium math sprint; inject `wrong` wrong answers on first question."""
    made_wrong = 0
    for _ in range(max_q):
        if not await page.locator('[data-testid="math-question"]').count():
            return made_wrong
        ans = await math_answer(page)
        while made_wrong < wrong:
            opts = await page.evaluate("() => Array.from(document.querySelectorAll('[data-testid^=\"math-option-\"]')).map(e => e.dataset.testid.replace('math-option-',''))")
            bad = [o for o in opts if o != str(ans)]
            await page.click(f'[data-testid="math-option-{bad[made_wrong % len(bad)]}"]', force=True)
            made_wrong += 1
            await page.wait_for_timeout(250)
        await page.click(f'[data-testid="math-option-{ans}"]', force=True)
        await page.wait_for_timeout(350)
    return made_wrong
