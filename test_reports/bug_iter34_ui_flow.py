"""Playwright helper for focused token-checkout blank-page regression.

The MCP browser runner executes this file with:
    namespace = {}
    exec(open(path).read(), namespace)
    await namespace['run'](page)
"""

from __future__ import annotations

import re

CONTEST_ID = "c_02091d8c359f"
CONTEST_SLUG = "bug34-ui-checkout-route-1785608389-8b8164"
CONTEST_TITLE = "BUG34 UI Checkout Route 1785608389"
CONTEST_IMAGE = "https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
ADMIN_EMAIL = "bachanta8@gmail.com"
ADMIN_PASSWORD = "Herts@910022"
BASE_URL = "https://contest-arena-16.preview.emergentagent.com"


def url(path: str) -> str:
    return BASE_URL + path


def parse_answer(question: str) -> int:
    match = re.search(r"(-?\d+)\s*([+\-−×x*÷/])\s*(-?\d+)\s*=", question)
    if not match:
        raise AssertionError(f"Could not parse skill question: {question!r}")
    a, op, b = int(match.group(1)), match.group(2), int(match.group(3))
    if op == "+":
        return a + b
    if op in ("-", "−"):
        return a - b
    if op in ("×", "x", "*"):
        return a * b
    return a // b


async def run(page):
    try:
        await page.set_viewport_size({"width": 1920, "height": 1080})
        print("Step 1: clearing browser state and logging in via player login UI")
        await page.goto(url("/"))
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(url("/login"))
        await page.get_by_test_id("login-email").fill(ADMIN_EMAIL)
        await page.get_by_test_id("login-password").fill(ADMIN_PASSWORD)
        await page.get_by_test_id("email-submit").click()
        await page.wait_for_timeout(1500)
        print(f"Login completed/current URL: {page.url}")

        print("Step 2: seeding cart localStorage with a live skill-game contest")
        cart_item = {
            "contest_id": CONTEST_ID,
            "slug": CONTEST_SLUG,
            "title": CONTEST_TITLE,
            "price": 1,
            "image": CONTEST_IMAGE,
            "qty": 1,
            "entry_mode": "skill_game",
        }
        await page.evaluate("""(item) => {
            localStorage.setItem('gamezoo_cart', JSON.stringify([item]));
        }""", cart_item)
        await page.goto(url("/cart"))
        await page.get_by_test_id("cart-page").wait_for(state="visible", timeout=15000)
        await page.get_by_test_id(f"cart-item-{CONTEST_ID}").wait_for(state="visible", timeout=15000)
        print("Cart page rendered with seeded contest item")

        print("Step 3: answering inline skill question and checking out with tokens")
        await page.get_by_test_id(f"skill-inline-{CONTEST_ID}").wait_for(state="visible", timeout=15000)
        await page.wait_for_function(
            """(cid) => {
                const el = document.querySelector(`[data-testid="skill-inline-${cid}"]`);
                return el && /\d+\s*[+−×÷-]\s*\d+\s*=/.test(el.textContent || '');
            }""",
            arg=CONTEST_ID,
            timeout=15000,
        )
        question_text = await page.evaluate("""(cid) => {
            const el = document.querySelector(`[data-testid="skill-inline-${cid}"]`);
            return el ? el.textContent : '';
        }""", CONTEST_ID)
        answer = parse_answer(question_text)
        print(f"Skill question text: {question_text}; clicking answer {answer}")
        await page.get_by_test_id(f"skill-option-{CONTEST_ID}-{answer}").click()
        await page.wait_for_timeout(300)
        await page.get_by_test_id("cart-checkout-btn").click()
        await page.wait_for_url(re.compile(rf".*/play/{CONTEST_ID}/[^/?]+\?just_bought=1$"), timeout=30000)
        final_url = page.url
        match = re.search(rf"/play/{CONTEST_ID}/([^/?]+)\?just_bought=1", final_url)
        if not match:
            raise AssertionError(f"Checkout did not navigate to two-param play URL: {final_url}")
        ticket_id = match.group(1)
        print(f"Checkout landed on correct two-param play URL: {final_url}; ticket={ticket_id}")
        await page.get_by_test_id("play-game-page").wait_for(state="visible", timeout=15000)
        await page.get_by_test_id("play-later-btn").wait_for(state="visible", timeout=15000)
        print("Play page and Play later button rendered after checkout (not blank)")

        print("Step 4: verifying My Tickets image and Play now two-param link")
        await page.goto(url("/my-account/tickets"))
        await page.get_by_test_id("panel-tickets").wait_for(state="visible", timeout=15000)
        await page.get_by_test_id(f"ticket-card-{ticket_id}").wait_for(state="visible", timeout=15000)
        image_count = await page.locator(f'[data-testid="ticket-card-{ticket_id}"] img').count()
        if image_count <= 0:
            raise AssertionError(f"Ticket card {ticket_id} has no image")
        href = await page.locator(f'[data-testid="ticket-play-{ticket_id}"]').evaluate("el => el.closest('a')?.getAttribute('href')")
        expected_href = f"/play/{CONTEST_ID}/{ticket_id}"
        if href != expected_href:
            raise AssertionError(f"Play now href mismatch: expected {expected_href}, got {href}")
        print(f"Ticket card image count={image_count}; Play now href={href}")
        await page.get_by_test_id(f"ticket-play-{ticket_id}").click()
        await page.wait_for_url(re.compile(rf".*/play/{CONTEST_ID}/{ticket_id}$"), timeout=15000)
        await page.get_by_test_id("play-game-page").wait_for(state="visible", timeout=15000)
        print("My Tickets Play now opened play-game-page successfully")

        # Get error messages using specific selectors
        error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")
        print("UI regression test PASSED")
    except Exception as exc:
        print(f"UI regression test FAILED: {exc}")
        await page.screenshot(path="/app/test_reports/bug_iter34_ui_failure.jpg", quality=40, full_page=False)
        # Get error messages using specific selectors
        error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")
        raise