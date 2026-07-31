"""Playwright DOM assertions used via mcp_browser_automation.

This file documents the focused browser check for CompetitionCard responsive
image output on /competitions and / (Featured Contests) at a mobile viewport.
The script is run by the browser automation tool, which supplies `page`.
"""

MOBILE_URL = "https://example.com/iter26-mobile-test.jpg"
CONTEST_SLUG = "test-skill-leaderboard-contest-a0e33a"
CONTEST_TITLE = "Test Skill Leaderboard Contest"

async def assert_card_has_source(page, route, in_featured_section=False):
    await page.goto(route)
    await page.wait_for_timeout(1000)
    await page.get_by_text(CONTEST_TITLE, exact=True).first.wait_for(timeout=15000)
    if in_featured_section:
        section = page.locator('xpath=//h2[normalize-space()="Featured Contests"]/ancestor::section[1]')
        card = section.locator(f'a[href="/competition/{CONTEST_SLUG}"]').first
    else:
        card = page.locator(f'a[href="/competition/{CONTEST_SLUG}"]').first
    await card.wait_for(timeout=10000)
    source = card.locator('picture source[media="(max-width: 640px)"]').first
    await source.wait_for(state="attached", timeout=5000)
    srcset = await source.get_attribute('srcset')
    assert srcset == MOBILE_URL

async def assert_card_has_no_source(page, route, in_featured_section=False):
    await page.goto(route)
    await page.wait_for_timeout(1000)
    await page.get_by_text(CONTEST_TITLE, exact=True).first.wait_for(timeout=15000)
    if in_featured_section:
        section = page.locator('xpath=//h2[normalize-space()="Featured Contests"]/ancestor::section[1]')
        card = section.locator(f'a[href="/competition/{CONTEST_SLUG}"]').first
    else:
        card = page.locator(f'a[href="/competition/{CONTEST_SLUG}"]').first
    count = await card.locator('picture source[media="(max-width: 640px)"]').count()
    assert count == 0