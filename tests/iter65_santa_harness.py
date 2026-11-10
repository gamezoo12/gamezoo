# Iteration 65 harness: festive Santa map click-through / replay tests. exec() inside browser_automation.
BASE = "https://import-verify-6.preview.emergentagent.com"
ERRS = []

def hook_logs(page):
    page.on("pageerror", lambda e: ERRS.append(f"PAGEERR {e}"))
    page.on("console", lambda m: ERRS.append(f"{m.type}: {m.text[:220]}") if m.type == "error" else None)

async def login_world(page, w=390, h=800, skip_intro=True):
    await page.set_viewport_size({"width": w, "height": h})
    r = await page.request.post(f"{BASE}/api/auth/login", data={"email": "bachanta8@gmail.com", "password": "Herts@910022"})
    tok = (await r.json())["token"]
    js = f"localStorage.setItem('gz_token', '{tok}');"
    if skip_intro:
        js += "sessionStorage.setItem('pl_santa_intro_seen','1');"
    await page.evaluate(js)
    await page.goto(f"{BASE}/world")
    await page.wait_for_selector('[data-testid="free-world-avatar"]', timeout=25000)
    try:
        await page.get_by_role("button", name="Decline").click(timeout=3000)
    except Exception:
        pass
    await page.wait_for_timeout(1500)

async def hit_info(page, testid):
    return await page.evaluate("""(tid) => {
      const el = document.querySelector(`[data-testid="${tid}"]`); if (!el) return null;
      const r = el.getBoundingClientRect(); const x = r.left + r.width/2, y = r.top + r.height/2;
      const h = document.elementFromPoint(x, y);
      return {x, y, tag: h && h.tagName, cls: h && String(h.className).slice(0,80), tid: h && (h.closest('[data-testid]')||{}).dataset?.testid,
              inside: !!(h && el.contains(h)), canvas: !!(h && (h.tagName==='CANVAS' || h.closest('[data-testid="santa-3d"]')))};
    }""", testid)

async def fps(page, ms=3000):
    return await page.evaluate("""(ms) => new Promise(res => { let n=0, worst=0, last=performance.now(); const t0=last;
      function f(t){ n++; worst=Math.max(worst,t-last); last=t; if (t-t0<ms) requestAnimationFrame(f); else res({fps: +(n*1000/(t-t0)).toFixed(1), worstFrameMs: +worst.toFixed(0)}); }
      requestAnimationFrame(f); })""", ms)

async def btn(page, text):
    return page.locator("button", has_text=text).first

async def solve_memory(page, max_wait=1100):
    n = await page.locator('[data-testid^="memory-card-"]').count()
    sym = {}
    async def lab(i):
        return await page.get_attribute(f'[data-testid="memory-card-{i}"]', "aria-label")
    async def is_done(i):
        return await page.locator(f'[data-testid="memory-card-{i}"]').is_disabled()
    for i in range(0, n, 2):
        for k in (i, i + 1):
            if k < n and not await is_done(k):
                await page.click(f'[data-testid="memory-card-{k}"]', force=True)
                await page.wait_for_timeout(60)
                sym[k] = await lab(k)
        await page.wait_for_timeout(max_wait)
    groups = {}
    for k, s in sym.items():
        groups.setdefault(s, []).append(k)
    for s, ks in groups.items():
        ks = [k for k in ks if not await is_done(k)]
        if len(ks) >= 2:
            await page.click(f'[data-testid="memory-card-{ks[0]}"]', force=True)
            await page.wait_for_timeout(60)
            await page.click(f'[data-testid="memory-card-{ks[1]}"]', force=True)
            await page.wait_for_timeout(450)
    return n

SIMON_OBS = """() => { window.__lit = []; const seen = new WeakMap();
  const mo = new MutationObserver(ms => ms.forEach(m => { const el = m.target; const id = el.dataset && el.dataset.testid;
    if (!id || !id.startsWith('simon-pad-')) return; const on = (el.style.filter||'').includes('1.8');
    if (on && !seen.get(el)) window.__lit.push(+id.split('-').pop()); seen.set(el, on); }));
  mo.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['style']}); }"""

async def solve_simon(page):
    import re as _re
    await page.wait_for_selector('[data-testid="simon-pad-0"]', timeout=15000)
    for _ in range(40):
        if not await page.locator('[data-testid="simon-pad-0"]').count():
            return "done"
        try:
            await page.wait_for_function("() => /STATUS\\s*Repeat/i.test(document.body.innerText)", timeout=20000)
        except Exception:
            return "no-repeat"
        txt = await page.evaluate("document.body.innerText")
        m = _re.search(r"SEQUENCE\s*(\d+)\s*/\s*(\d+)", txt, _re.I)
        if not m:
            return "done"
        L = int(m.group(1))
        seq = await page.evaluate(f"window.__lit.slice(-{L})")
        await page.evaluate("window.__lit = []")
        for p in seq:
            await page.click(f'[data-testid="simon-pad-{p}"]', force=True)
            await page.wait_for_timeout(70)
        # wait for next playback to start (Watch) or finish
        try:
            await page.wait_for_function("() => !document.querySelector('[data-testid=\"simon-pad-0\"]') || /STATUS\\s*Watch/i.test(document.body.innerText)", timeout=4000)
        except Exception:
            pass
    return "loop-exhausted"
