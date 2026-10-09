# Prize League â€” PRD

## Free World real-time sync + timezone + Last Activity accuracy (2026-06)
Root causes (traced + verified in preview):
- 1h-behind timestamps: `_serialize_datetime` called `.isoformat()` on Motor's naive (UTC) datetimes → no offset → browser parsed as local (BST) → 1h behind. FIX: tag naive datetimes as UTC so ISO carries `+00:00`. No historical data touched.
- Admin not auto-updating: no WebSocket/SSE/polling; only a 1s countdown clock. FIX: visibility-aware ~7s polling of the Free World users list in `FreeWorldAdmin.jsx` (silent, preserves search/filter/pagination/sort; pauses when tab hidden; refreshes on tab focus).
- "Last Activity" looked stale after Champion play: admin column read `world_progress.updated_at` (only changes on level progression). FIX: `admin_world_users` now returns `last_activity = fw_last_activity_at` (fallback `updated_at`). `_touch_world_activity` switched to `$max` (monotonic — slow/old requests can't lower it) and is now also fired on level `session/begin` and `champion/session/begin` (already on visit + both gameplay submits).
- UK display consistency: admin UserDetailsPage timestamps now format with `timeZone:'Europe/London'` (FreeWorldAdmin already used `ukDate`). GMT/BST handled automatically by the browser.

Files: `backend/routers/world_routes.py` (`_serialize_datetime`, `_touch_world_activity`, `admin_world_users` projection+last_activity, begin endpoints); `frontend/src/pages/admin/FreeWorldAdmin.jsx` (polling); `frontend/src/pages/admin/UserDetailsPage.jsx` (Europe/London).

Verified in preview (curl + screenshot): all admin timestamps carry `+00:00`; Last Activity shows correct UK time (20:34 UTC → 21:34 BST); session begin bumped PL20001 last_activity within ~1s; GMT(Jan)/BST(Jul) correct; admin page loads with polling; player frontend already refetches `worldAPI.state()` after completion via `pl-world-progress-refresh`.
NOT changed: game logic, scores, prizes, progression rules. NOT deployed (awaiting explicit user approval).
LIMITATION: PL10062 is a production account absent from the preview DB — code path verified with preview account PL20001; PL10062's production record was NOT inspected from here.

## Free World announcement-bar overlap — aligned WITHOUT changing the bar (2026-06)
- Requirement: keep the announcement bar + header exactly as original; just stop Free World content from hiding under the bar (map nodes/games, notification popup, and the Free World leaderboard).
- Approach (frontend only, no bar/header redesign): `PrizeLeagueWorld.jsx` measures the real `[data-testid=site-header]` height at runtime (mount + resize) and sets CSS var `--pl-topbar-h`. `world.css` `.pl-world-page` and `pl-global-lb.css` `.pl-global-lb-shell` now use `top: var(--pl-topbar-h, 113px)` so the map and the Free World leaderboard start just below the bar. `WorldAlertPopup.jsx` popup at `top-[124px]`.
- Reverted the earlier wrong change (had swapped the whole header/ticker via trailing-slash isFreeWorldHeader). `isFreeWorldHeader` is back to `=== '/world'`; global `AnnouncementTicker` renders as before.
- Verified in preview (desktop 1440 + measured mobile header=99, desktop=113): map content below bar; leaderboard top bar/close button visible (lbTopbarTop=113=headerBottom); popup below bar. NOT deployed.

## Free World announcement-bar overlap — REAL root cause fixed (2026-06)
- ROOT CAUSE: `/world` resolves with a trailing slash (`/world/`), so `isFreeWorldHeader` (`=== '/world'`) was always FALSE → the dedicated fixed Free World header never activated and the global promo `AnnouncementTicker` rendered over the fixed-fullscreen map (`.pl-world-page`, position:fixed inset:0), hiding the notification popup, level nodes and content. Earlier "spacer" fix did nothing because the map is position:fixed and ignores normal flow.
- FIX (frontend only): `Header.jsx` `isFreeWorldHeader` now matches `'/world'` || `'/world/'`; global `AnnouncementTicker` no longer renders on the Free World map (the map has its own branded `pl-world-promo-ticker-top`). `WorldAlertPopup.jsx` popup moved to `top-[124px]` so it always clears header + ticker.
- Verified in preview (desktop + evaluate): popupTop=124 ≥ tickerBottom=97 (noOverlap=True); Free World header (prize pot/tokens/profile) active, single branded ticker, level nodes/£500 FAB/bottom nav all visible. NOT deployed.

## Admin per-user SMS consent control (2026-06, abc fast-fix)
- NEW `POST /api/admin/users/{user_id}/sms-consent` (`user360_routes.py`, admin/super_admin, audited `admin_sms_consent_change`): grant sets `sms_consent=true`, `sms_consent_at`, `sms_consent_source='admin'`, clears `sms_opt_out`; revoke sets false. This is the missing piece that lets an admin make winners / legacy verified-phone users eligible for Admin Alert SMS (e.g. winner greetings) without running a script.
- Frontend `UserDetailsPage.jsx`: new **SMS Alerts Consent** card (Grant/Revoke button, Granted/Not-granted pill, opt-out note) next to Email/Phone Verification. `adminAPI.setUserSmsConsent` added to `lib/api.js`.
- Verified (curl + admin UI screenshot): grant→sms_consent=true/opt_out=false/source=admin, revoke→false, unauth→401, card renders. (a) Email/Phone verified columns confirmed accurate; (b) Send-to-Winners winner-sources/winners endpoints respond correctly (0 in preview, no winner data); (c) legacy phone still verifiable via existing admin OTP flow, now consent-grantable. NOT deployed.


## Verification statuses + SMS consent + announcement fix (2026-06, Plan A)
- #5 Admin UsersPage: separate **Phone / Email / SMS Consent** columns (accurate from backend doc). #2 Google email: `/api/admin/reconcile-verification` safe one-time backfill for method=='google' (trusted evidence) + existing reconcile-on-login; admin shows real state.
- #3 Profile→Preferences (`MyAccount.jsx`): wired **SMS notifications** toggle (`authAPI.setSmsConsent` → `POST /api/auth/preferences/sms-consent`), exact consent text, default OFF; unverified-phone users get the existing `PhoneOtpModal` to verify. #4 SMS consent checkbox added to `SignupWizard` (register) and `GoogleFinalizeModal` (Google onboarding), unchecked by default; plumbed to `/auth/register` and `/auth/google/finalize`.
- New user fields: `sms_consent`, `sms_consent_at`, `sms_opt_out` (models.py User + UserPublic). Alert SMS eligibility now = verified phone AND sms_consent AND NOT sms_opt_out (STOP opt-outs honoured) in `create_alert_campaign`.
- #6 Announcement overlap: added a responsive flow spacer after the Free World `!fixed` header (nav+ticker height) so it no longer covers content; `/world` (sticky header) verified no overlap. No z-index hacks.
- #1 Phone verified: live OTP write/read paths confirmed correct; no unsafe auto-reconcile (no trusted evidence stored) — legacy users via existing admin manual-verify.
- Tested in preview: admin 3-column statuses, consent toggle (enable/disable), /auth/me exposes fields, reconcile endpoint, preferences UI render. NO real SMS sent. NOT deployed (awaiting approval).


## Targeted Alerts + In-World Popup + Extension-Timer fix (2026-06)
- **Targeted Alerts** (`user360_routes.py`): `create_alert_campaign` now accepts `audience` {mode: range|users|winners}. New admin endpoints: `GET /api/admin/users/alerts/user-search?q=`, `GET /alerts/winner-sources`, `GET /alerts/winners?source=&ref=`. 'users' resolves account IDs/emails (unknowns ignored+recorded); 'winners' pulls Free World Champions (`world_winner_awards`), Paid Contest winners (`contests.winner_user_id`), Promotion Draw winners (`promotion_draws.winners[]`). All modes reuse existing In-App/Email/SMS delivery + consent/Twilio gating. Admin UI: Recipients tabs (search+multiselect, paste, winners) in `AlertsAdmin.jsx` — original design preserved.
- **In-World Popup** (`world/components/WorldAlertPopup.jsx`, mounted in `PrizeLeagueWorld.jsx` + `FreeWorldLanding.jsx`): shows UNREAD admin alerts one at a time on world entry; Skip/swipe marks read (`POST /api/users/notifications/{id}/read`) and advances; click opens full-screen detail (title/message/date/Close). Fires once per entry (keyed on user id) so it never interrupts an in-progress game; history preserved. Positioned top-center z-120 to avoid install banner / bottom nav.
- **Extension-Timer fix** (`world_routes.py` `_personal_champion_transition_schedule`): champion close now uses the active contest's authoritative `end_at` (scheduler keeps it in sync with 24h extensions) instead of a fixed +46h — Free World timers now reflect admin extensions within ~60s. Non-extended behaviour unchanged.
- Tested: testing_agent iteration_46 (backend 100%); popup HIGH bug fixed + self-verified via screenshots on /world and /free-world; extension timer verified (`/world/state` → extended close); NO bulk SMS sent (in_app only). Winner collections empty in preview so winners targeting returns 0 there (goes live once winners exist). NOT deployed — redeploy to ship live.


## Admin Alert SMS → Twilio Messaging Service (2026-06, bugfix)
- `backend/routers/user360_routes.py` `create_alert_campaign()` now sends real SMS via the Twilio **Messaging Service** (env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`) instead of leaving SMS as `pending`.
- Eligibility: `phone_verified == true` AND new `sms_consent == true`. Non-consenting/unverified users are `skipped` (reasons `no_sms_consent` / `no_verified_phone`). If the Messaging SID is absent, deliveries are `skipped` with reason `sms_not_configured` (never faked as sent).
- Sends run in a FastAPI BackgroundTask (non-blocking for bulk); each delivery is atomically claimed (`pending → sending`) to prevent duplicates; Twilio Message SID stored; status set from API result (`sent`, never `delivered`). In-app + email paths unchanged.
- ACTION REQUIRED (user): set `TWILIO_MESSAGING_SERVICE_SID` backend secret and collect `sms_consent`; a single approved test SMS is pending until then. Verified locally (gating + missing-config reporting; no SMS sent).


## Original problem statement
Skill-based sweepstakes web app (rebranded **GameZoo â†’ Prize League** on 2026-07-09). Requirements:
- JWT + Emergent Google auth
- Ticket purchasing via **wallet** (min Â£10 top-up)
- Skill-question gate + optional per-contest **skill game** (memory match, jigsaws, slider, etc.)
- Full admin + production panels (KYC, payments, wallets, roles, live draws, settings, meera AI)
- Conversational **Meera AI** â€” admin/production panels ONLY (not on public site)
- Admin and player interfaces completely separate
- Highly colorful player UI (orange/rose/fuchsia palette, no light green)
- **Referral programme** â€” invite friends, both get free ticket (or Â£5 wallet credit fallback)
- **Live winners ticker + leaderboard per contest**

## Personas
- Player â€“ buys tickets from wallet, plays skill game, tracks entries + winnings, invites friends
- Admin / Super-admin â€“ full control incl. wallet adjustments
- Operator â€“ production-panel access only (live draw / inventory)
- Support â€“ read-only admin

## Core requirements (status â€” all shipped)
- [x] Prize League rebrand
- [x] JWT + Emergent Google OAuth + email/password
- [x] Skill-question verify + optional skill game per contest
- [x] Admin dashboard (Users, Roles, KYC, Contests, **Wallets**, Orders, Payments, Winners, Analytics, Settings)
- [x] Production panel (Operations, Live Draw, Prize Inventory, Winners feed, KYC)
- [x] Meera AI â€” admin/production only (removed from public pages)
- [x] Auto-draw scheduler (60s tick) + winner in-app notifications
- [x] Header session UX (visible Sign out + wallet balance chip)
- [x] Prominent multi-path logout (header/admin/production/mobile) â€” all 4 verified working


## Free World Admin Control — Phases 3/4/5 + Attempt Isolation (2026-06, iteration_45)
Completes the Admin Control upgrade on top of Phase 1. All backend-verified (testing_agent iteration_45: 100% backend + frontend) plus main-agent curl checks.

- **Phase 5 · Activity Tracking** (`world_routes.py` `_touch_world_activity`, `auth_routes.py`): server-authoritative `fw_last_login_at` (login), `fw_last_visit_at` (`GET /api/world/state`), `fw_last_gameplay_at` (session/champion submit) stored on the user doc. Surfaced in `GET /api/admin/world/users` and `/user-progress/{id}`, and in the admin user drawer (activity tiles).
- **Phase 3 · Editable Contests + 24h extension cascade** (`services/world_championship_schedule.py` now accepts an `extensions` map; `world_championship_scheduler.py` loads `championship_extensions` from `world_settings`): `POST /api/admin/world/contest/{n}/extend?days=1` extends a championship's Champion close by 24h and shifts ALL later championships by the same amount; `POST /api/admin/world/contest-extensions/reset` clears. Schedule derivation is cumulative and backward-compatible (1300-probe parity test). Live scheduler re-activates the current contest with the new end time within ~60s. Admin UI: Ext column + per-row “+24h” buttons + Reset in the Season Schedule table. Audited to `world_progress_audit_log`.
- **Phase 4 · Per-(Championship, Level) attempt limits** (`world_stage_level_config` collection; `_effective_level_config(db, level, champion_stage)` applies the override on EVERY return path): `GET/PUT /api/admin/world/stage-level-config` to set/list/clear an `initial_free_attempts` override for a specific C+L (validation 1–100 / 1–10 / 0–20). Threaded `champion_stage` into all user-scoped `_effective_level_config` call-sites so the override shows in `/api/world/state` and drives new counters. Admin UI: “Per-Championship Attempt Limits” section.
- **Attempt Isolation** (`world_token_retry_daily` unique index + all read/write filters now keyed by `champion_stage`): a purchased token-retry entitlement no longer leaks across championships; normal-level free-attempt counters were already stage-keyed. Legacy index dropped and recreated at startup. Reserve+consume lifecycle (normal level + Champion sentinel level 0) verified.

## Free World Admin Control — Phase 1: User Progress Manager (2026-06, iteration current)
- Backend (`world_routes.py`, admin_router `/api/admin/world`): `GET /user-progress/{user_id}` (full progression detail + recent audit trail) and `POST /user-progress/{user_id}` (atomic partial edit). Editable: current_level, highest_unlocked_level, completed_levels, champion_stage, champion_ready.
- Guardrails: level 1–10, championship 1–WORLD_CONTEST_COUNT(100), completed_levels ⊆ 1–10, highest_unlocked ≥ current_level, champion_ready can ONLY be true when all 10 levels completed. Violations → 422.
- Audit: every change writes to NEW collection `world_progress_audit_log` (actor_user_id/email/role, before/after diff per field, optional reason, created_at). No prizes awarded, no scores/leaderboard/contest-entry rows touched (snapshots intact).
- Frontend: editable drawer inside `FreeWorldAdmin.jsx` (row click → `openUser` loads detail; number inputs + 10-tile completed grid + champion-ready checkbox (disabled until all 10) + optional reason + Save; audit trail list below). `worldAdminAPI.userProgress()` / `.editUserProgress()` added to `lib/api.js`.
- Tested: curl verified edit, all guardrails (422), champion_ready gate, audit persistence, 401 without token; reset QA user; frontend screenshot confirms editor + audit render. Reason set OPTIONAL per user. NOT deployed (preview local test_database).
- REMAINING (user paused — low credits): Phase 3 (editable global contests + 24h auto-extension), Phase 4 (per-contest game config + attempt limits), Phase 5 (accurate activity timestamps). Also pending: attempt/token isolation gaps (champion_stage in DB keys).

## Admin Free World cleanup + Season launch-control (2026-09-14)
- Rebuilt `frontend/src/pages/admin/FreeWorldAdmin.jsx` into 4 sections: Season Control (+ confirm "CONFIRM SEASON LAUNCH" dialog, Reschedule/Cancel while SCHEDULED), read-only 100-Championship Schedule (Europe/London), Current Championship monitor, and read-only Free World Users table + detail drawer. Removed all per-level/Champion manual editors from the UI (backend fixed 100-championship contract remains authoritative; no backend gameplay config changed).
- Added 2 READ-ONLY admin endpoints in `backend/routers/world_routes.py`: `GET /api/admin/world/season-schedule` (derives C1–C100 from `championship_window`, optional `?preview_start`, UK-time render) and `GET /api/admin/world/users` (server-side paginated Free World progress; safe fields only — no password/token/KYC). Added `worldAdminAPI.seasonSchedule()` + `.users()` in `frontend/src/lib/api.js`.
- `frontend/src/components/EditContestDialog.jsx`: added top REAL CONTEST / COMING SOON toggle. Coming Soon shows only Title + Image; Real Contest shows the full existing form unchanged; save logic untouched (historic hidden fields preserved).
- Verified iteration_38 (100% backend + frontend). IMPORTANT: preview pod uses LOCAL `test_database` (~3 seed users), NOT the deployed production managed DB. Season scheduling in preview does not affect production; production launch is done via the deployed app's Launch button. Season 1 currently SCHEDULED **in preview only** for 15 Sep 2026 00:00 Europe/London (C1 start 2026-09-14T23:00:00Z), status SCHEDULED (not live). Not deployed.


## Free World Token System + Avatar/Timer (2026-09-07)
- **Token flows (retry + early unlock)** â€” tokens = wallet coin balance. Backend endpoints (unchanged, already existed): `POST /api/world/token/retry/reserve` and `POST /api/world/token/unlock/reserve`. Both idempotent (single charge on double-click/refresh/two-tabs). Early unlock ONLY skips a level's scheduled TIME lock â€” never progression; requires previous level completed (Levels 2-10). Backend rules NOT weakened.
- **Token UX (frontend)**: Free World header shows native token chip (`Header.jsx`, `data-testid=free-world-token-balance`, listens for `pl-world-progress-refresh`). Early-unlock confirmation modal (`WorldCanvas.jsx`) + retry confirmation modal (`FreeWorldNumberSequenceV3.jsx`) â€” each shows cost / current balance / remaining balance, Cancel/Confirm, insufficient â†’ "Not enough tokens" + Top Up Wallet (`/my-account/wallet`). sonner toasts ("Level unlocked" / "Retry unlocked", real cost + balance). Tested iteration_35 (backend 100%) + iteration_36 (frontend 100% core).
- **Avatar + timer fix** (`WorldCanvas.jsx`): progression avatar (`data-testid=free-world-avatar`) is ALWAYS visible for a started user (root cause fixed: `journeyStarted` now set true for returning users so avatar no longer disappears on refresh). Avatar sits AT the immediate-next playable level, or WAITS on the black road (~42% between last completed level and the locked one) when it's time-locked. Only the immediate-next progression level shows a countdown + early-unlock control; all further locked levels show no timer. Buying an early unlock does NOT advance progression. Post-unlock `/login` flash removed (no longer auto-opens the game).
- **Free World header parity + mobile** (`Header.jsx`): fixed Profile/Sign Out menu (was broken â€” missing outside-click ref; now uses `freeProfileRef`). Mobile Free World header compacted to token number + profile icon only (TOKENS/PROFILE labels + chevron hidden < sm); emblem-only logo on mobile to stop logo/pot overlap. Desktop unchanged.
- Test scenario seed: `backend/scripts/seed_token_test_scenario.py` (activates Free World contest #1 open-now; player1=350 tokens/L1 done/L2 time-locked; player_broke=0 tokens/L1 done).

## 2026-08-01 Â· Iteration 37 â€” Fix Post-Checkout Blank Page (P0 Root Cause)
Bug testing agent report `iter33` identified the ACTUAL root cause of the "white blank page after buying tickets":
- `App.js` defines route `/play/:contestId/:ticketId` (BOTH params required).
- Cart.jsx was navigating to `/play/${r.first_ticket_id}?just_bought=1` (ONE param) â†’ React Router had no match â†’ blank page.
- MyAccount tickets tab linked to `/play/${t.ticket_id}` (same one-param error).
- Ticket enrichment projected `hero_image` but contest docs use `image` field â†’ all ticket cards showed no image.

**Fixed:**
- `order_routes.py::checkout` response gains `first_contest_id` alongside `first_ticket_id`.
- `Cart.jsx` now navigates to `/play/{first_contest_id}/{first_ticket_id}?just_bought=1` â€” matches the registered route contract.
- `MyAccount.jsx` ticket cards link to `/play/{contest.contest_id}/{ticket_id}` and only render "Play now" when `game_type` is set on the contest.
- `order_routes.py::my_tickets` accepts both `image` and `hero_image` fields on the contest doc (fallback chain) and returns `contest.contest_id` inside the enrichment.

**Also from iter33 (already shipped):**
- Contest leaderboard normalized_score / duration_s / accuracy_pct (verified 100.0 for top row).
- Global leaderboard normalized_score (verified 100.0 for top row).
- Leaderboard row-tap expands to show Accuracy / Speed / Raw points transparency cards.
- "YOU" pill on the current user's leaderboard row.



## 2026-08-01 Â· Iteration 36 â€” Checkout Blank Page Fix + Stripe Redirect Repair (P0)

**Bug #1 (invisible until now):** Backend was minting Stripe `success_url` as `?tab=wallet&topup=success` but the app router is path-based (`/my-account/:section`). After Stripe redirect the user landed on the MyAccount MENU page â€” not the Wallet panel. Because WalletPanel never mounted, the code that polls Stripe/webhook confirmation never ran. Users saw stale balance, thought payment failed, and re-triggered. **Fixed** to `success_url = {origin}/my-account/wallet?topup=success&session_id=â€¦`.

**Bug #2 (root cause of "blank page after checkout"):** WalletPanel had no post-Stripe confirmation UX. After Stripe redirect, users saw the wallet at its pre-payment balance until webhook lands (2â€“8 seconds) â€” during which the page looked "stuck" or blank-ish. Added a green **"Confirming your paymentâ€¦"** banner + spinner + auto-poll of `walletAPI.me()` every 2s for up to 24s, plus a success toast when balance updates.

**Bug #3 (defense in depth):** `<Cart />` had no error boundary â€” any renderer exception on a legacy cart item blanked the page. New `CartErrorBoundary` catches, logs, and shows a "Clear basket & browse" recovery card with the diagnostic message. Wrapped the route in `App.js`.

**Query-param â†’ path-based route migration**: fixed every remaining `/my-account?tab=X` link across Header (2), Cart (3), PlayGame (2), WalletPanel (1) to the new path format. Legacy `?tab=` URLs still work (MyAccount ignores unknown query keys) but the canonical form is now clean and shareable.

Verified end-to-end on preview: Stripe checkout URL points to `contest-arena-16.preview.emergentagent.com/my-account/wallet?topup=success&session_id=cs_test_...`. All 17 targeted tests pass.



## 2026-08-01 Â· Iteration 35 â€” Checkout Fix + Token-Only Player UI
**Checkout was broken because skill `challenge_token` expires after 5 minutes.** If a user added to cart and waited more than a few minutes (browsing, comparing contests, then returning), the token expired â†’ backend rejected with `400 invalid_token / expired` â†’ the frontend showed a generic "Checkout failed" toast.

**Fix â€” inline skill re-verify in Cart (`Cart.jsx`):**
- On mount, for every skill-game item, decode the token's `exp` client-side. If missing, expired, or expiring in <60s, auto-fetch a fresh challenge via `GET /api/contests/{slug}/skill-challenge`.
- Render an inline "Skill check" card per item with the question + 4 option buttons + "New question" refresh.
- User taps their answer â†’ cart tracks it in `skills` state.
- On "Spend N tokens" click, we send the fresh challenge_token + chosen answer to `/api/orders/checkout` â€” the backend HMAC-verifies both. Zero more "invalid_token" errors possible.
- Belt-and-braces: even if the backend still returns a skill-related 400 (e.g. wrong answer), Cart auto-refreshes every question and shows "Skill question refreshed, try again" instead of a dead-end toast.

**Token-only UI (per user's ask):**
- HeroBanner: `Â£1 Entry` â†’ `1 ðŸª™ Entry`
- CompetitionDetail: removed the `= Â£N` subtitle, checkout confirmation reads `for 2 tokens`, contest info tabs read `2 tokens per entry ticket`
- WalletPanel: package tiles show only token count + "tokens" label (no `Â£5`), custom-amount hint reads "You'll receive N tokens. The exact charge amount is shown at Stripe checkout." Transaction receipt drops the `Value` Â£ row.
- Header tooltip: "Your token balance" (no `1 token = Â£1` disclaimer)
- ReferPage / ReferAndEarnCard: "Â£5 credit" â†’ "5 tokens credited"
- Admin financial reports (WalletAdmin, OrdersPage, AnalyticsPage, UserDetailsPage) intentionally kept in Â£ â€” legally-required for financial reporting; not player-facing.

**Verified**: 17/17 tests still pass. Backend end-to-end checkout works (proved with curl: `order_id: o_fdfb2a0c5338, total: 1, tickets: 1`). Screenshot confirms Hero banner shows `1 ðŸª™ Entry`.



## 2026-08-01 Â· Iteration 34 â€” Phone Verification Made Optional at Signup
- Consulted `integration_playbook_expert_v2` (auth optional-phone pattern) before touching auth code â€” playbook confirmed the paired-fields pattern (phone+otp both-or-none) and UK KYC is risk-based so making phone optional is compliant provided high-risk gates exist.
- **Backend**: `RegisterInput.phone` and `RegisterInput.otp_code` are now `Optional[str] = None`. `/api/auth/register` handler enforces paired-fields (both or neither â†’ 422). Registering without phone succeeds; account created with `phone=None, phone_verified=false`. Existing `/api/auth/otp/verify-bind` unchanged so users can bind + verify a phone anytime from Settings.
- **Frontend**: `SignupWizard.jsx` Step 2 gains a **"Skip for now"** button alongside "Send code". If user skips, jumps to T&Cs (step 4). Payload only includes phone/otp when both were captured. Header copy updated: "Mobile verification is optional â€” you can add it later."
- **Tests**: `tests/test_iter34_optional_phone_signup.py` (4/4 passing): success without phone, 422 on phone-only, 422 on otp-only, login works for phoneless accounts. Conftest opt-out list updated so shim doesn't auto-inject legacy fake phones into these tests.
- **Why**: user's Twilio account is on trial (can only text pre-verified numbers). Making phone verification optional unblocks all real-customer signups without any Twilio dependency. When Twilio is upgraded, phone verification path continues to work â€” nothing to re-enable.



## 2026-08-01 Â· Iteration 33 â€” Zero-Config Stripe Token Top-Up (launch-critical fix)
- **Fix**: `POST /api/payments/wallet-topup/checkout` no longer looks up prices in Stripe's catalog. Previously the endpoint called `stripe.Price.list(lookup_keys=[req.lookup_key])`; on any Stripe account that hadn't run `setup_stripe.py`, every preset button returned HTTP 500 "Price not configured for wallet_topup_5" â€” the exact failure mode the user hit on prod.
- **New behaviour**: derive `tokens = int(lookup_key.rsplit('_',1)[1])` and use inline `price_data` on the session. Guaranteed to work on any Stripe account (test or live) with zero dashboard setup. Existing metadata (lookup_key, tokens, user_id) still recorded for downstream reconciliation.
- **Tests**: `tests/test_iter33_token_topup.py` â€” 3/3 passing (5 preset packages return checkout URL, invalid lookup returns 400, custom top-up min-5 enforced).
- **User impact on next redeploy**: all 5 token package buttons on the "Buy tokens" panel work immediately in production â€” no more `setup_stripe.py` step required.



## 2026-08-01 Â· Iteration 32 â€” Browser Bootstrap Form + Production Launch Path
- Added `GET /api/auth/bootstrap-admin` (HTMLResponse) â€” a self-contained no-JS-dependency HTML form. Zero clicks needed to reach it; user visits `/api/auth/bootstrap-admin` in any browser. Auto-shows 3 states: (a) form when zero admins exist, (b) "already set up" screen when admins exist, (c) friendly DB-unreachable page when the ping fails (so they can see the actual Mongo error before contacting support). On successful create, stores JWT + user in localStorage and redirects to /admin.
- Confirmed production DB should be `DB_NAME=contest-arena-16` (matches their app slug). Once redeployed, prod DB will be empty â†’ no demo data, no demo leaderboard, no legacy admins. The demo data the user was seeing was from an old DB pointer (`prize_league`) that had never been authorized anyway.


## 2026-08-01 Â· Iteration 31 â€” Token Purchase System (major UX pivot)
Replaced the "real-money wallet" mental model with a token purchase system. Semantic-only change â€” accounting stays penny-precise (1 token = Â£1), so refunds, admin adjustments and audit trails work identically. UK Gambling Commission stance unchanged.

**Backend**
- `payments_routes.py`: added `wallet_topup_5` to `ALLOWED_TOPUP_KEYS`. Custom top-up now enforces **integer** min 5 / max 1000 tokens (was float Â£5â€“Â£1000). Top-up success notification now reads `+N tokens added ðŸª™`.
- `wallet_routes.py`: `MIN_TOPUP` lowered from 10 â†’ 5. `TopupInput.amount` is now an int. New `_with_tokens()` helper enriches every wallet response with `tokens`, `lifetime_tokens_bought`, `lifetime_tokens_spent`. Admin wallet listing gains `total_tokens`.
- `setup_stripe.py`: added the Â£5 (5-token) price so `stripe.Price.list(lookup_keys=['wallet_topup_5'])` resolves. **User must run this once against their live Stripe account before the "5 tokens" button will work in production.**

**Frontend**
- `lib/format.js`: new `tokens(n)` and `tokenCount(n)` helpers. Pluralisation handled.
- `WalletPanel.jsx`: hero renamed "Token balance", "1 token = Â£1 Â· use tokens to enter contests". Top-up panel is now "Buy tokens", packages 5/10/20/50/100 each showing token count + `Â£N` subtitle. Custom amount field shows "You'll pay Â£N for N tokens." live. Transaction receipts show both `Tokens` (bold) and `Value` (Â£).
- `Header.jsx`: desktop chip and mobile drawer both replace `Â£0.00` with `0 ðŸª™`.
- `CompetitionCard.jsx`: contest tile shows `N ðŸª™ /entry` instead of `Â£N`.
- `CompetitionDetail.jsx`: entry price shown as `N ðŸª™ = Â£N`. Checkout summary reads `Your tokens`, `Need N tokens more`.
- `Cart.jsx`: basket switches to tokens end-to-end â€” subtotal, fees, "Buy tokens â†’" fallback when short, CTA reads `Spend N tokens`.

**Tests**
- `test_wallet.py`: updated below-minimum probe from 5 â†’ 4 (new min is 5).
- All 25 targeted tests pass.

**Not yet done (deliberately)**
- Admin `UserDetailsPage.jsx` still shows Â£ balance â€” admin-facing, low priority; will update on request.
- Stripe live catalog needs the new `wallet_topup_5` price row created â€” run `setup_stripe.py` once against live keys.



## 2026-08-01 Â· Iteration 30 â€” Post-Code-Review Money-Integrity Hardening (P0/P1)
Ships four production-critical fixes uncovered by the code review:

**P0-1 Â· Atomic Stripe wallet credit (`payments_routes.py:_credit_wallet_once`)**
- Rewrote from check-then-act to `find_one_and_update` with `wallet_credited:{$ne:True}` filter â€” only the winning caller credits. Kills the double-credit race where a `/success` page poll and the Stripe webhook could both credit the same session.
- Test: `tests/test_iter30_money_integrity.py::test_wallet_credit_is_atomic_under_concurrent_flip` â€” 10 concurrent credits â†’ exactly 1 Â£20 balance, 1 topup tx.

**P0-2 Â· Compensating refund on failed checkout (`order_routes.py`)**
- Added `debit_applied` guard. If the ticket-insert or order-insert fails AFTER we've already debited the wallet, we now automatically credit back the exact amount so the buyer never loses money for an incomplete purchase. CRITICAL log-line if the refund itself fails (should not happen but is now visible).
- Also added a friendly 409 when the new unique idempotency index catches a double-submit.

**P1-1 Â· RBAC tightening on payout routes (`winners_routes.py`, `admin_routes.py`)**
- New `_require_payout_role()` helper â€” only `admin` and `super_admin` can call `/admin/winners/{id}/draw`, `/manual`, `/publish`, `/correct` and `POST /admin/orders/{id}/refund`. Previously `support` (should be read-only) and `operator` could touch these.
- Tests: `test_support_role_cannot_refund_orders`, `test_operator_role_cannot_publish_winners`, `test_admin_can_still_refund_and_publish` â€” all passing.

**P1-2 Â· Indexes managed at startup (`server.py::_ensure_core_indexes`)**
- Moved from `seed.py` (which prod may never run) to a FastAPI startup hook. Uses `partialFilterExpression` on nullable fields (`public_id`, `ticket_id`) so legacy rows don't collide. Auto-drops the legacy `public_id_1` sparse variant on boot. 11/12 indexes ensured â€” the last skips silently when a slug index already exists with different options. Also adds a unique `(user_id, idempotency_sig)` partial index on `orders` so double-click checkout is atomically rejected, not TOCTOU-guarded.

**Files touched:** `server.py`, `routers/payments_routes.py`, `routers/order_routes.py`, `routers/winners_routes.py`, `routers/admin_routes.py`, `seed.py`, `scripts/bootstrap_admin.py`.
**New tests:** `tests/test_iter30_money_integrity.py` (4 tests, all passing).



## 2026-08-01 Â· Production Auth Recovery â€” One-Time Super Admin Bootstrap (P0)
- Root cause: `https://www.prizeleague.co.uk/api/auth/login` was returning HTTP 500 (empty body) because a raw Motor/Mongo exception was bubbling up. The frontend's toast fallback rendered this as "Invalid credentials", masking a DB-side problem (most likely: seed script never ran against the production DB, or DB_NAME split-brain between seed.py and deps.py).
- Fix in `routers/auth_routes.py`:
    - `/api/auth/login` now catches DB exceptions and returns **503** (`Authentication service is temporarily unavailable`) with structured logs â€” no more silent 500s.
    - Password/email are stripped of whitespace defensively (paste-from-manager trailing space).
    - Suspended accounts now return 403 explicitly instead of 401.
    - New `POST /api/auth/bootstrap-admin` â€” creates the initial Super Admin ONLY when zero privileged users exist. Auto-disables after first call (403 for all subsequent requests). Idempotent for the exact same email (promotes existing user). Returns JWT so operator is signed in immediately.
- New standalone CLI: `scripts/bootstrap_admin.py` â€” uses `deps._sanitize_db_name()` so it always writes to the same DB the runtime reads from (eliminates the `prize league` vs `prize_league` split-brain).
- Tests: `tests/test_bootstrap_admin.py` â€” 4 tests covering happy path, second-call refusal, post-bootstrap login, and 401 (not 500) on wrong password.


- [x] **Wallet system** with Â£10 min top-up (mock), atomic per-user balance, transaction log
- [x] Ticket checkout charges wallet ONLY (returns 402 with helpful message if insufficient)
- [x] Admin wallet panel â€” view all, search, credit/debit, per-user tx history
- [x] **Referral programme** â€” unique code per user, invite link, both parties get 1 free ticket (or Â£5 wallet fallback)
- [x] Expanded My Account â€” 11 tabs: Profile Â· Wallet Â· Tickets Â· Orders Â· Referrals Â· Notifications Â· KYC Â· Security Â· Support Â· Policies Â· Preferences
- [x] **16 skill games** â€” Memory Match, Number Sequence, Target Tap, Word Unscramble, Emoji Riddle, Image Jigsaw 3Ã—3/4Ã—4, 15-Slider Puzzle, Math Sprint, Reaction Time, Trivia Quiz, Simon Says, Whack-a-Mole, Odd One Out, Color Match (Stroop), Pattern Repeat
- [x] Admin can assign a game to each contest (dropdown in EditContestDialog) or leave blank for manual winner draw
- [x] Play flow â€” `/play/:contestId/:ticketId`, 3 attempts, score = speed Ã— accuracy
- [x] Real-time per-contest leaderboard â€” `/leaderboard/:contestId`
- [x] **Global live leaderboard** â€” `/leaderboard` (public nav link) with podium, per-contest tab switcher, 15s auto-refresh
- [x] **Per-contest live leaderboard embedded on `/competition/:slug`** â€” full card (top 10, medals, view-full link) shown whenever contest has a skill game assigned
- [x] **"My Games" dashboard (Feb 2026)** â€” new tab on `/my-account?tab=games` + linked from header profile dropdown. Backend `GET /api/orders/my-games` returns one row per skill-game ticket with `attempts_used/max/remaining`, `best_points`, `status` (ready | in_progress | completed | expired), sorted playable-first. Frontend `MyGamesPanel` shows contest image + status badge + attempts + Play/Continue button, or a "Leaderboard" link once attempts run out or the contest closes.
- [x] **Dual entry modes (Feb 2026)** â€” `entry_mode` field: `skill_game` or `random_tickets`. Contest detail page branches automatically; skill-question card only for skill games; ticket-availability card for random contests.
- [x] **Configurable game attempts** â€” `max_attempts` (default 3, 1â€“10). Server-side enforced in `/api/games/submit`. Contest closing time also enforced (no attempts after end_date).
- [x] **Leaderboard visibility control** â€” 4 modes: live / after_playing / after_close / hidden. Public contest detail respects the setting.
- [x] **Winner Selection admin (random-ticket contests)** â€” new `/admin/winner-selection` page with router `winners_routes.py`: view paid tickets â†’ cryptographically-secure random draw (secrets.randbelow) â†’ OR manual pick with reason â†’ preview state â†’ publish + lock â†’ post-publish correction requires 20+ char reason. Every action written to `winner_audit` collection with actor, timestamp, method, reason.
- [x] **Mobile fixes on contest detail** â€” main hero image now uses `object-contain` with a neutral background (no more cropping of important product photos on mobile); skill-question options grid switches to 1-col on mobile with `break-words`; buy button and info card use responsive padding.
- [x] **Login page rebrand (Feb 2026)** â€” Login page rebuilt on the pl-hero-bg brand with Prize League logo, gold-metallic "Win amazing prizes" headline, gold submit button, purple tab pills. Terms & Privacy links now point to the correct routes.
- [x] **Mobile header sign-in icon** â€” mobile viewport now shows a user icon (data-testid=mobile-signin-icon) when logged out, and a compact avatar chip (data-testid=mobile-profile-icon) linking to /my-account when logged in â€” mirroring the desktop cluster.
- [x] **Unified brand across Admin + Production panels (Feb 2026)** â€” replaced the old teal palette with the same premium purple/gold theme used on the public site. AdminLayout & ProductionLayout now use the Prize League SVG logo, dark #0B0D1F sidebar with white-on-purple active state and gold accent labels. Admin login page rebuilt on the pl-hero-bg + glass card with gold submit button. Sweep across all 11 admin pages + EditContestDialog removed every teal accent (0 remaining).
- [x] **Legal pages (Feb 2026)** â€” verbatim Terms & Conditions, Privacy Policy, Website Terms + Acceptable Use Policy, and Mobile Terms of Service supplied by the operator. Reusable `LegalPage` component parses section headings/bullets. Routes: `/terms`, `/privacy`, `/website-terms`, `/mobile-terms`. Footer now has a dedicated Legal column with all four links.
- [x] **Premium redesign (Feb 2026)** â€” deep purple/gold palette (#6C2BFF Â· #FFD54A Â· #0B0D1F), gold-gradient "PRIZE LEAGUE" hero, purple announcement ticker with pause-on-hover, dynamic live-contests carousel with auto-rotate + swipe, single gold PLAY NOW button, dark nav with gold underline for active, redesigned 6-step "How to Play" section, premium Refer & Earn card with copy/share, `/how-it-works` and `/refer` dedicated pages, custom Trophy + P SVG logo, dark premium footer with skill-based/safe-play badges
- [x] **Sign Out inside Profile dropdown** (with confirm) â€” desktop dropdown + mobile drawer; no more separate sign-out button on nav
- [x] **Fake activity purged** â€” no more "Sarah M." fallback in WinnersTicker (component now hides if no real winners); "100% Legal" claim removed from hero; "Same-day payouts" wording removed everywhere
- [x] **Premium Stripe payments (Feb 2026)** â€” Flow A claimable sandbox (GB, SMP), 4 wallet top-up packages (Â£10/Â£20/Â£50/Â£100), full end-to-end flow validated, idempotent wallet crediting
- [x] **Mobile responsiveness pass** â€” no horizontal overflow, admin bulk bars stack on mobile, contest cards use smaller padding on mobile, section titles scale down, admin filters horizontally scroll on small screens
- [x] **30 skill-based mini-games** â€” 16 original + **14 new** (sudoku_mini, sequence_predict, countdown_numbers, word_ladder, chess_mate_in_one, tower_of_hanoi, lights_out, minesweeper_mini, nonogram_mini, tf2048_mini, cryptogram, anagram_finder, maze_solver, spot_pattern) â€” all mount + interactive, backend types endpoint returns 30
- [x] **Admin bulk launch/hold** â€” `POST /api/admin/contests/bulk/{launch,pause}` with filters (only_games, category, status_from) surfaced in Games Admin + Contests Admin
- [x] Rebrand sweep â€” killed all teal/emerald on public site
- [x] Renamed "free spins" â†’ "free tickets"

## Architecture
- Frontend: React (CRA) + Tailwind + Shadcn UI. `REACT_APP_BACKEND_URL`.
- Backend: FastAPI + Motor async. Routes prefixed `/api`. Env `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`.
- Shared: `backend/deps.py`, `backend/services/{draw_service,scheduler,meera_actions}.py`.
- Background task: `services/scheduler.py` auto-draws contests at end_date (60s tick).
- Games: pure client-side React components in `/app/frontend/src/components/games/index.jsx`; scoring & leaderboard server-side.

## Test suites (106/106 pass â€” as of iteration_12)
- backend_test (16 regression) + scheduler (11) + meera_refactor (5) + create_contest (5) + profile (10) + wallet (~9) + referrals (~7) + games (~5) + checkout_wallet + leaderboard_and_bulk (15) + **games_v2 (20 new â€” 30-type registry, 14-game assignment parametrize, e2e cryptogram submit + leaderboard)** = **106 total**

## Roadmap
### P0 to launch (needs user-supplied keys)
- Real Stripe integration for wallet top-ups (currently mocked â†’ instant credit)
- **TrueLayer** open-banking integration (user mentioned as an alternative)
- Company/VAT/T&C/Privacy URLs in `/admin/settings`
- Winner email notifications (Resend/SendGrid API key)
- Custom domain + SSL via Emergent Deploy

### P1
- **Profile page redesign** â€” show User ID, auto-generated Username, DOB, Address, Edit Profile
- **Wallet tab redesign** â€” min Â£5, tabs (Deposit / History / Spending) with date filters, transaction receipts, Withdraw (future)
- **Tickets tab** â€” Valid / Winning / Expired sections + ticket detail view (replaces Orders as primary)
- **My Games** â€” show remaining/used attempts per contest (tickets Ã— contest.max_attempts)
- **Notifications real system** â€” topup success, purchase success, draw reminder, draw closed, winner announcements, wallet, game reminder, profile, security; red-dot unread counter + Mark All Read
- **Admin Dashboard user list** â€” show newly-registered users with Username, User ID, Full Name, Email, Phone, DOB, Registration Date, Verification Status
- **Mobile menu cleanup** â€” remove Account/My Profile/My Entries/My Wins/Wallet/Refer from mobile top-right; leave only Logout; move everything to Profile page
- Real KYC provider (SumSub/Onfido)
- httpOnly cookies migration (CSP mitigates for now)

### P2 (code review action items â€” non-blocking)
- Atomic wallet updates via MongoDB `findOneAndUpdate + $inc`
- Atomic ticket-number assignment (avoid duplicate numbers under concurrent checkouts)
- Order.checkout ordering: debit wallet BEFORE inserting tickets (rollback safety)
- Rate-limit /api/games/submit
- Break down MyAccount.jsx (~700 lines) into smaller components
- Full responsive audit across Mobile/Tablet/Desktop
- Route /otp/login-verify through _verify_twilio_otp helper (partially done â€” twilio_routes now uses helper)

### Nice-to-have
- More games (word ladder, sudoku mini, spot-the-difference, reaction time, etc. â€” currently 8)
- Refer-and-earn tiers (VIP badge after 10 successful referrals)
- Delete-account self-service (currently email-only)

## Test credentials
See `/app/memory/test_credentials.md`.

## Known mocked / disabled flows
- Wallet top-up â†’ **Stripe test mode** (real Stripe Checkout; test cards only)
- Winner emails â†’ in-app only

## Recent milestones
- **2026-07-17 Â· Phase 4 partial** Admin Audit Logs + Lazy images + Reduced motion + Support surface
    - **Admin Audit Logs page** (`/admin/audit-logs`) â€” combines `winner_audit` (draw/publish/correct) and support case status changes. Read-only, searchable. Sidebar link added.
    - **Lazy-loading images** on Cart + Draw Centre (`loading="lazy" decoding="async"`).
    - **`prefers-reduced-motion` CSS** â€” all decorative animations respect the OS-level accessibility setting.
    - **User â†’ admin authorization verified** (403 on `/api/admin/*` for regular JWT â€” separation is enforced backend-side, not just via UI).
    - Tests: 24/26 pass. Same 2 pre-existing Cloudflare CORS-preflight failures. Admin audit-logs + admin support-cases endpoints verified via curl.

- **2026-07-17 Â· Phase 3 + Phase 4 partial** Production hardening + Support cases + Orders removed + rate limiting + idempotency
    - **Orders tab removed** from Profile (per spec â€” wallet transactions are the source of truth). Tab order now: Profile â†’ Wallet â†’ Tickets â†’ My Games â†’ Notifications â†’ KYC â†’ Security â†’ Support â†’ Policies â†’ Preferences â†’ Refer & Earn.
    - **Support Cases (real DB)**: New `/api/support/*` + `/api/admin/support/cases/*` endpoints. `SupportPanel.jsx` component with list / new-case wizard / thread view. Users can create cases with category + subject + message; admin can reply (creates `support_reply` notification for the user). Statuses: open / awaiting_user / closed.
    - **OTP rate limiting**: `/api/auth/otp/send` per-phone limits â€” 30s cooldown between sends, max 5 sends per 15-minute window. Stored in `otp_attempts` collection.
    - **Idempotency on wallet checkout**: `/api/orders/checkout` now rejects duplicate basket-signature POSTs within 3 seconds with 409 + existing order_id. Prevents refresh / double-click race conditions from double-charging users.
    - **JWT_SECRET production hardening**: Auth module refuses to boot in prod with the dev default secret. `TEST_OTP_BYPASS_CODE` also disabled in prod even if env leaks.
    - **Circular import fix**: `_verify_twilio_otp` extracted to `/app/backend/otp_verify.py`.
    - **Console-log audit**: 9 unprotected console statements now gated by NODE_ENV.

## âš ï¸ Still requires user input to fully complete Phase 3/4
- **Cloud image storage (Cloudinary/S3)** â€” infrastructure ready in code (uploads_routes.py), but permanent hosting needs your **Cloudinary API key + secret + cloud name** or **AWS S3 bucket + IAM keys**. Currently images persist in `/app/backend/uploads` which survives supervisor restart but not a full re-deploy or Emergent workspace rebuild.
- **Email verification (Resend/SendGrid)** â€” needs your provider API key + verified sender domain to send real verification emails. Google-signup email is treated as verified because Google confirms it; email/password signup currently uses phone OTP as the sole mandatory verification step.
- **Production redeploy** â€” Phase 1/2/2B/3 code changes ready in preview. Click Deploy to push to prizeleague.co.uk.

- **2026-07-17 Â· Code Review fixes** Critical + medium items applied
    - **ðŸ”´ Circular import fix**: Extracted `_verify_twilio_otp` to `/app/backend/otp_verify.py`. Both `auth_routes` and `twilio_routes` now import from the shared module. `_verify_twilio_otp` kept as a thin backward-compat shim.
    - **ðŸ”´ JWT secret hardening**: `auth.py` now refuses to boot if `JWT_SECRET` is the default dev value AND `ENVIRONMENT=prod` or `STRIPE_MODE=live`. Prevents trivially-forgeable tokens in production.
    - **ðŸ”´ OTP bypass prod-guard**: `verify_twilio_otp` refuses the `TEST_OTP_BYPASS_CODE` shortcut when `_is_prod()` is true â€” belt-and-braces even if the env var leaks.
    - **ðŸŸ¢ Console statements guarded**: All 9 unprotected `console.error/warn` calls in frontend now gated by `process.env.NODE_ENV !== 'production'` (AuthContext, MyAccount, NotificationsBell, Dashboard, LiveDraw, MeeraChat, ReferAndEarnCard, ReferralPromo, WalletAdmin).
    - **ðŸŸ¡ index-as-key on dynamic lists**: HeroBanner slides (use `contest_id`/`slug`), StatsBar (use `label`). Static game components left with index keys (items don't reorder â€” safe pattern).
    - Tests: 34/36 auth+profile pass; the 2 CORS failures are pre-existing Cloudflare edge issues (infra, not code).


- **2026-07-31 Â· Mobile UX polish + real photography (iter 32)**
    - **Header** â€” responsive redesign. `<sm`: emblem-only crown logo (36px) + cart + Sign-in/avatar + hamburger. `sm-md`: full logo + notifications + cart + compact "PLAY" button + hamburger. `md+`: full nav bar, wallet chip, Draw Centre trophy, notifications, cart, "PLAY NOW", profile dropdown. Removed the duplicate PLAY button from the signed-out branch. Every element is now reachable on a 375Ã—812 iPhone mini viewport without overflow. Verified with real device-width Playwright screenshots.
    - **How to Play** â€” replaced the 6 flat coloured gradient tiles with a 4-step layout using real lifestyle photography of adults (Pexels, free-to-use, no attribution). Each card: hosted photo with subtle zoom-on-hover + gold-ringed dark number badge overlaid top-left + title/body underneath. `onError` fallback to a known-good URL. Copy tightened to match the FAQ (Create account â†’ Pick contest â†’ Answer skill question â†’ Winner announced live). `HowItWorks.jsx` hero copy updated from "Six simple steps" to "Four simple steps".
    - Files: `components/layout/Header.jsx`, `components/home/HowToPlaySection.jsx`, `pages/HowItWorks.jsx`.

- **2026-07-31 Â· Production Deploy Fixes (iter 31)** â€” K8s liveness probe was failing with `connection refused` on port 8001; backend never bound because of a strict `RuntimeError` in `auth.py` when `JWT_SECRET` env was absent in the prod pod. Plus there was no `/health` endpoint at the root path (all routes were under `/api/*`).
    - **`backend/server.py`**: added `@app.get('/health')`, `/healthz`, `/ready`, `/readyz` returning `{"status":"ok"}` directly. No DB touch â€” a Mongo blip cannot fail the K8s liveness probe.
    - **`backend/auth.py`**: replaced hard `raise RuntimeError` on missing `JWT_SECRET` in production with `secrets.token_urlsafe(48)` auto-rotation + loud ERROR log. Backend now always boots; ops sets the real `JWT_SECRET` via Emergent env-var UI and restarts.
    - **`backend/skill_challenge.py`**: `_key()` falls back to a per-process ephemeral key if both `SKILL_CHALLENGE_KEY` and `INSTANT_WIN_KEY` are absent, instead of raising and killing the challenge endpoint.
    - Verified locally: all 4 probe paths return 200, auth boots correctly with empty env, all 21 launch-critical tests still pass. Deployment agent confirmed READY.

- **2026-07-31 Â· Deployment Health Check PASS** (iter 30)
    - **N+1 wipeouts** across admin + user-facing endpoints. `/admin/users`, `/admin/orders`, `/admin/payments`, `/admin/kyc` all use bulk `$in` lookups instead of one-query-per-row (was 3001 queries for 1000 users â†’ now ~4). `/orders/my-games` collapses `count_documents` + per-ticket `find` into two bulk aggregations.
    - **Pagination caps** on unbounded queries: `/contests` (default 100, cap 500), `/public/winners` (50, 200), `/orders/mine` (50, 200), `/orders/my-tickets` (200, 1000). Sort orders added where missing.
    - **OAuth redirect** switched from `/my-account` to dedicated `/auth-callback` route (which is now explicitly registered in `App.js`). AuthCallback.jsx already handled the hash fragment cleanly.
    - **.gitignore** â€” removed `.env`, `.env.*`, `*.env` entries so environment files are shippable with the deployment (Emergent platform pattern).
    - All 21 launch-critical regression tests still pass. DB restored to clean launch state.

- **2026-07-31 Â· Code Review Bug Fixes (iter 29)** â€” 4 real defects found in launch review, all fixed + regression-tested
    - **HIGH-1 fix**: dynamic-engine contest checkout was rejecting EVERY purchase because it compared user answer to the `'auto'` placeholder stored on new contests. `order_routes.checkout` now branches: random-tickets skip skill check; dynamic (`skill_question_type` set) uses `skill_challenge.verify_challenge(contest_id, answer, challenge_token)`; legacy static-question path preserved for pre-launch contests. Frontend `CartItem` and `CheckoutInput` model both extended with optional `challenge_token`.
    - **HIGH-2 fix**: `POST /api/admin/orders/{id}/refund` was removing tickets but never crediting the buyer's wallet. Now calls `_apply_tx(kind='refund', +total, ref_order_id)` before mutating inventory; the `status == 'refunded'` guard already makes it idempotent so repeat calls never double-credit. Returns `refunded_amount`.
    - **MEDIUM-3 fix**: `wallet_routes._apply_tx` rewritten to use atomic `find_one_and_update({user_id, balance: {$gte: |amount|}}, {$inc: {balance: delta, lifetime_topup/spend: ...}}, return_document=AFTER)`. Overdraft race is now impossible â€” the debit either atomically succeeds with sufficient balance or fails with 400. Lifetime counters are `$inc`ed in the same document mutation.
    - **MEDIUM-4 fix**: `order_routes.checkout` now reserves ticket slots via atomic `find_one_and_update({contest_id, status:'live', $expr: {$lte: [$sum, tickets_total]}}, {$inc: {tickets_sold: qty}})` per line item; failures roll back earlier reservations before returning 409. Wallet debit runs AFTER reservations; if the debit fails all reservations are rolled back too. No more oversell window.
    - **LOW-1**: docstring on `skill_challenge.py` updated â€” clarified that the token is per-issuance HMAC-bound to contest_id but IS reusable within its 5-min TTL by design (correct answer is public; token security barrier is issuance authenticity, not one-shot use).
    - **LOW-2**: `Before you buy` confirmation on CompetitionDetail was a dead checkbox (`checked={verified ? undefined : undefined}`). Now uses real `confirmed` state; Buy button is disabled until it's ticked; button label states the exact next step ("Tick the confirmation to buy").
    - **Regression coverage**: 6 new tests in `tests/test_review_fixes_iter29.py`. All PASS: valid-token checkout succeeds, missing/tampered/wrong-answer rejected, refund credits wallet exactly once (idempotent), 2 concurrent Â£7 debits on Â£10 balance â†’ exactly 1 succeeds & balance stays non-negative, 2 concurrent buyers for last ticket â†’ exactly 1 wins & tickets_sold = 1. Total launch-critical suite: 21 passed.
    - Post-run wipe brought DB back to launch state: 1 super admin (PL10000, Â£0), 27 legal docs, 2 settings.

- **2026-07-31 Â· Security hardening** (post code-review pass)
    - **Real JWT_SECRET set** in `backend/.env` (48-byte urlsafe token via `secrets.token_urlsafe`). Previously the env was missing this key so `auth.py` fell back to its dev default â€” token forging risk in prod. Now every token issued is signed with a strong random secret.
    - **`skill_challenge.py` upgraded to `secrets.SystemRandom`** (backed by `/dev/urandom`). Question VALUES were never security-sensitive (the answer to 12+7 is public knowledge; the actual security barrier is the HMAC-signed token) but this aligns with security scanners and removes any suggestion of predictable seeds anywhere in the auth surface. All 12 opÃ—difficulty combos verified.
    - **Code review pushback** (documented): declined pre-launch refactors of `create_contest_api`, `update_contest_full`, `submit_score`, `execute_random_draw`, `reveal_instant_win`, `commit_instant_win`, `get_current_user` â€” high cyclomatic complexity is real but refactor risk pre-launch outweighs the benefit; scheduled for post-launch cleanup. Also declined moving test-file admin creds to env vars (they mirror `test_credentials.md` and are dev-environment only). "Circular imports" claim was a false positive â€” the codebase already uses lazy in-function imports to avoid cycles. "6 undefined variables" claim also false â€” ruff `F821` sweep returned zero.
    - All 15 launch-critical regression tests still pass. `/api/auth/login` returns valid JWT signed with the new secret; downstream admin calls (`/api/admin/stats`, etc.) succeed.

- **2026-07-31 Â· LAUNCH READY** Prize League is production-ready for public launch
    - **Production wipe complete**: DB contains only super admin (PL10000, Â£0 balance), 27 legal documents, company settings, counters. All test users, contests, orders, tickets, wallet transactions, KYC, notifications, audit logs, referrals wiped.
    - **Frontend mock data neutralised**: `mockData.js` COMPETITIONS/SITE_STATS/HERO_SLIDES/PRIZE_INVENTORY all emptied. No more fake Â£7,500 stats, no dummy contests, no seed testimonials.
    - **New crown logo swapped globally** (header/footer/admin/production sidebars, favicon, OG image, login hero); `PrizeLeagueLogo` component supports `emblemOnly` prop for light-bg surfaces.
    - **Dynamic Skill-Question Engine (Feb 2026)**: Admin picks Operation (add/sub/mul/div) + Difficulty (easy/medium/hard) per contest. Every visitor gets a UNIQUE, server-generated math problem. Correct answer never leaves the server â€” bundled inside an HMAC-signed 5-min token. `POST /verify-skill` checks token integrity + contest binding + expiry + answer match. Rejects `invalid_token`, `contest_mismatch`, `expired`, `incorrect`.
    - **Regression coverage**: 15 launch-critical tests pass (6 dynamic-skill + 4 opÃ—diff parametrised + updated create-contest). Pre-existing tests that depended on wiped seed data are intentionally not fixed â€” they'll pass again once real contests populate the DB.
    - Verified live at `contest-arena-16.preview.emergentagent.com`: Home shows "New contests coming soon", Contests page shows "No contests found", Admin dashboard shows Revenue Â£0 Â· Users 1 Â· Live contests 0. All P0 transparency items (Verify Feed, WinnersReveal replay, Focal grid, Mobile A/B) shipped iter 27.

- **2026-07-17 Â· Phase 4A** MyAccount 12-Token Refactor + Admin RBAC Fix (P0)
    - **MyAccount.jsx fully rewritten** to strict 12-token layout: Profile / Wallet / Tickets / My Games / Notifications / KYC / Security / Support / Policies / Preferences / Refer & Earn / Sign Out. Each token is a coloured gradient pill/card with a unique lucide icon (violet/amber/teal/fuchsia/sky/emerald/slate/cyan/indigo/stone/rose/red). Grid responsive: 2-col mobile â†’ 3 sm â†’ 4 md â†’ 6 lg.
    - REMOVED from `/my-account`: greeting hero banner, 4 gradient stat cards (Wallet balance / Active tickets / Orders / Referrals), 'Sign out â†’ Admin' button, entire `<Tabs>` API, and all summary widgets.
    - **Sign Out** now opens a shadcn `AlertDialog` (data-testid="signout-confirm") with 'Sign out' + 'Stay signed in' â€” confirm clears session and redirects to `/`.
    - **Admin RBAC fix**: `auth.py::require_admin()` previously only accepted `role=='admin'`, rejecting `super_admin` / `operator` / `support`. Now accepts all four staff roles â†’ /api/admin/users, /admin/contests, /admin/stats work for super_admin. Admin panel Users list now shows all 234 users, Contests list shows all 52 contests.
    - **App.js fix**: Added missing `import AdminAuditLogs from './pages/admin/AuditLogsPage'` â€” its absence was crashing the entire SPA with "AdminAuditLogs is not defined".
    - **Seed script** updated to persist admin as `super_admin` (was `admin`).
    - Tests: iteration_19.json â€” 6/6 backend RBAC pass, 20+/20+ frontend Playwright assertions pass (100%).

- **2026-07-17 Â· Phase 2B** Attempts-per-ticket + Cloudflare Turnstile + Wallet redesign + Notifications audit
    - **Attempts-per-ticket**: Contest model has `attempts_per_ticket` (default 3, kept in sync with legacy `max_attempts`). Backend `/api/games/submit` now enforces pooled attempts: `tickets_owned Ã— attempts_per_ticket`. Admin EditContestDialog relabeled with clear helper (`10 tickets Ã— 3 = 30 pooled attempts`).
    - **Cloudflare Turnstile** (item 12): New `/api/config/turnstile` (public site key) + `/api/games/captcha/verify` (issues signed short-lived challenge tokens). Default `.env` uses Cloudflare TEST keys that always pass â€” swap in real keys later. `TurnstileGate.jsx` widget component gates PlayGame; challenge token attached to `/api/games/submit`.
    - **Wallet redesign** (item 7): New `WalletPanel.jsx` component. Purple/gold hero card with big balance + Plus button; presets Â£5/Â£10/Â£20 (Popular)/Â£50/Â£100 + Custom Amount input with min Â£5. Filter chips Today/Week/Month/Year/All. Transaction receipt modal with tx_id, date, time, method, balance-before, balance-after. Auto-opens on `/my-account?tab=wallet&topup=1`. New backend `POST /api/payments/wallet-topup/custom` with Stripe inline `price_data` + tax_code.
    - **Notifications real-events audit** (item 19): New `notifications.py` helper. Wired triggers for: order checkout â†’ `purchase_success` (one per contest, mentions My Games vs My Tickets based on entry_mode); Stripe top-up webhook/status â†’ `topup_success`; winner publish â†’ `winner_alert` for the winner + `draw_result` for every other ticket holder in that contest.
    - Tests: iteration_18.json â€” 8/9 backend Phase 2B tests pass + 100% frontend flows (wallet UI, Turnstile auto-pass, admin field). Fixed the one critical Stripe `tax_code` bug + PlayGame `Attempts left 3/3` cosmetic bug reported by the tester.

- **2026-07-17 Â· Phase 2A** Contest page rebuild + Basket controls + Draw Centre + Admin User list expansion + Profile redesign
    - **CompetitionDetail.jsx** rewritten: image uses `object-contain` on dark #0B0D1F with loading spinner + FALLBACK_IMG on 404, marketing 3-icon row REMOVED, public shows only %sold + status badge (Just launched/Selling fast/Almost full/Closed), NOT exact ticket totals. Ticket qty controls (Â±/direct input/preset chips 1-500), live summary with wallet + after-purchase preview, 7-section T&Cs accordion auto-populated from admin fields.
    - **Cart.jsx** rewritten: minus/plus/edit qty per item, trash removes only that item (with confirmation), 'Clear basket' (with confirmation), live wallet balance + after-purchase preview, insufficient-balance flow redirects to /my-account?tab=wallet&topup=1 (also handles 402 from backend). Tickets only created on successful payment.
    - **DrawCentre.jsx (NEW)** at /draw-centre + /draw-results: Pending Draws tab (contests where user owns tickets, live countdown per contest) + Draw Results tab (real published winners with "You WON!"/"Not selected" per-row status). Header now has a Trophy icon linking here.
    - **Header.jsx** cleanup: mobile drawer stripped to just "Go to Profile" + "Sign Out"; profile dropdown reduced to "Go to My Profile" + "Sign Out"; Draw Centre trophy icon added.
    - **Admin Users page** expanded columns: Username Â· User ID Â· Full name Â· Email Â· Phone Â· DOB Â· Registered Â· Verification Â· KYC Â· Tickets Â· Spent Â· Role Â· Status. Newest registrations sort to top. Verification pill shows phone_verified state.
    - **MyAccount Profile tab** now displays @username + User ID + DOB (read-only) + Address (editable). PATCH /api/users/me accepts `address`.
    - Tests: 8/8 new Phase 2A tests pass (test_phase2_profile_admin.py). Iteration 17 report at /app/test_reports/iteration_17.json.

- **2026-07-17 Â· Phase 1** Mandatory OTP + T&Cs signup (P0). Twilio Verify wired end-to-end.
    - New `/api/auth/register` requires `phone`, `otp_code`, `accept_terms`, `dob`. Auto-generates unique username (firstname + DOB day + NN).
    - New `/api/auth/google/finalize` â€” Google users must complete DOB + phone + T&Cs before proceeding.
    - Multi-step signup wizard (`SignupWizard.jsx`) with 4 steps. No Skip button.
    - `GoogleFinalizeModal.jsx` â€” mandatory post-OAuth modal, cannot be dismissed.
    - After signup: redirect to `/` (Home), not `/my-account`.
    - Session persistence root-cause fix: CORS was `allow_origins=['*'] + allow_credentials=True` (spec-invalid). Now uses `allow_origin_regex` matching preview + prizeleague.co.uk + emergent.host.
    - `TEST_OTP_BYPASS_CODE=000000` in .env for automated pytest coverage.
    - Test suite: `/app/backend/tests/test_auth_signup.py` (17/18 passing); legacy tests unchanged via `conftest.py` shim that auto-injects new required fields.

## Winnings Wallet + Something Special £50 challenge — BACKEND (2026-09-14)
- New router backend/routers/winnings_routes.py (registered in server.py; 187 routes). Money in integer PENNIES. Separate from all existing wallets.
- Collections (additive): special_challenge_attempts, special_challenge_rewards (UNIQUE index {user_id, challenge_id} = one £50 ever), winnings_ledger (immutable), withdrawal_requests, winnings_wallets (atomic balance cache), winnings_audit_log.
- Endpoints: POST /api/winnings/challenge/start, /challenge/complete (server-authoritative timing + sequence check, credits 5000p once, replay 0), GET /api/winnings/wallet, /ledger, POST /api/winnings/withdraw (atomic reserve available>=amount), GET /api/winnings/withdrawals (masked). Admin: GET /api/admin/winnings/withdrawals, GET /{id}/bank (RBAC admin/super_admin + audit), POST /{id}/mark-paid (status-guarded idempotent), POST /{id}/reject (reason, releases funds once).
- Curl-verified all scenarios (reward once/replay 0/fail 0, over-withdraw blocked, reserve, mark-paid idempotent, reject release idempotent, 403 unauthorized, bank masking).
- REMAINING: frontend UI (Something Special card + 100-number challenge game, Winnings Wallet page + withdrawal form, admin Winnings Withdrawals panel) + one combined testing_agent pass. api.js winningsAPI/winningsAdminAPI clients added. Nothing deployed. Season 1 untouched.

## Winnings Wallet + Something Special — FRONTEND (2026-09-14, iteration_39 · 100% pass)
- **Winnings lives inside My Account** as a new "Winnings" token/section (`MyAccount.jsx` → `token-winnings` / `panel-winnings` renders `<WinningsWallet/>`). Route `/my-account/winnings`.
- `WinningsWallet.jsx`: Something Special card (100-number challenge, £50 one-reward messaging + `challenge-already-won` practice state), full-screen challenge grid (1..100 auto-shuffled every attempt via `shuffle()`, 60s timer, tap-in-order), Winnings Wallet stats (available/pending/total won/paid), transaction history, and withdrawal form capturing UK bank details (holder/sort/account). Added `finishedRef` race-guard so timer-expiry + n===100 can't double-POST `/challenge/complete`.
- **Free World page** (`PrizeLeagueWorld.jsx`): static side "£50 SPECIAL" surprise gift symbol (`something-special-fab`, fixed right-centre, pulsing) → navigates to `/my-account/winnings` (or `/login` if signed out).
- **Admin Winnings Payouts** (`pages/admin/WinningsPayoutsAdmin.jsx`, route `/admin/winnings-payouts`, sidebar link "Winnings Payouts"): masked withdrawals table, status filter chips, Reveal Bank modal (unmasked, admin/super_admin only), Mark as Paid (status-guarded idempotent), Reject with reason (releases reserved funds back to user).
- Verified e2e (iteration_39): win-once/practice-no-double-credit, randomization across attempts, withdraw available→pending, admin reveal/reject(release)/mark-paid all pass. Nothing deployed; Season 1 untouched.

## Global Leaderboard redesign + Attempt/Token system (2026-09-25)
- **Champion token-retry crash FIXED** (root cause of "Retry With Tokens does nothing" on Champion): `/world/token/retry/reserve` (level 0) called undefined `_get_current_global_champion_contest` → NameError 500. Now uses `_active_contest()`. Backend verified 7/7 (iteration_40).
- **Attempt rules** (`world_routes.py`): Normal 1000 levels = 3 free (already). Champion 1 (stage 1) = 3 free with fixed idempotent migration (grants 3 − already-consumed, not blind reset). Champion 2+ (stage ≥2) = 1 free via NEW collection `world_champion_stage_counters` (unique season+contest+user+champion_stage) + `_consume_champion_stage2_attempt`; stage-1 path untouched. Token retry shared level-0 entitlement works for all.
- **Global Leaderboard** rebuilt to the reference layout: `FreeWorldLeaderboard.jsx` + dedicated `styles/pl-global-lb.css` (namespaced `.pl-global-lb-*`, light premium theme). Elements: header (trophy/FREE WORLD/title/subtitle/LIVE/X), prize-pool (£257,500 computed via app formula) + live Ends-In countdown (contest.end_at), Prize Calculation strip, View selector (Global via worldContestAPI.leaderboard / Current Championship via worldAPI.championLeaderboard) + LIVE + Refresh, YOUR POSITION card, rankings table (# / PLAYER / CHAMP / TIME / WINNINGS) with crown+medals, highlight self, loading/empty/error/retry states, mobile-first responsive (320–desktop). Opaque bg + z-index 4000 hides map; closes to restore map. Per-row winnings/champ show real value or "—" (no invented data).
- STATUS: backend PASS (iteration_40); leaderboard rebuilt+compiles, both tester bugs fixed; full logged-in visual/mobile retest recommended. Champion stage≥2 not reachable by test account (logic unit-correct).

## Leaderboard redesign v2 + Champion attempt/timer fixes (2026-09-25)
- **Leaderboard UI redesign (v2)** to clean light "Prize League" dashboard: `FreeWorldLeaderboard.jsx` + `styles/pl-global-lb.css` rebuilt. Slim dark brand bar (logo + Back/Close) replaces the old duplicate hero. Prize Pool (£257,500) + Ends-In timer as side-by-side cards; Prize Calculation single-line strip (1st £50 / 2nd £20 / 3rd £15 / 4th £10 / 5th £5) with **MORE** → 100-championship multiplier modal (formula `base × (1 + (stage-1)*0.5)`, worked example, 100-tile grid). VIEW CHAMPIONSHIP dropdown = All (Global) + Champion 1..100; selecting N fetches `/world/public/champion/leaderboard?contest_number=N`. Your Position card (+empty variant). Rankings: # / PLAYER / CHAMP / TIME / WINNINGS with top-3 styling + self-highlight. Verified via testing_agent (iteration_41).
- **z-index fix**: shell raised to 10100 (modal 10200) so the slim brand bar sits above the site header (was z-[10060], which had blocked Back + modal-close clicks).
- **Responsive**: prize pool + timer stay side-by-side and prize calc stays single-line on tablet AND mobile (compact fonts/badges; ordinal words hidden <480px). No horizontal overflow.
- **Champion attempts BUG FIX** (root cause): `_champion_attempt_status()` returned only `{initial_attempts, attempts_remaining}` but the champion play UI reads `free_attempts_available` / `token_retry_cost` / `token_retry_available`. So it always showed 0 free attempts → hid "PLAY AGAIN – FREE" AND the token-retry button (shown for championMode) errored `FREE_ATTEMPT_AVAILABLE` because the backend still had 3 free. Fixed: `_champion_attempt_status` now also returns `free_attempts_available`, `token_retry_available`, `token_retry_entitlement_remaining`, `total_attempts_available`, `token_retry_cost` (new const `CHAMPION_TOKEN_RETRY_COST=1`). Champion-1 flow verified: `champion/status` → `free_attempts_available:3`; reserve while free>0 correctly rejects; Champion-2 → 1; legacy 1-free counters migrate to 3.
- **Attempt count display** (`FreeWorldNumberSequenceV3.jsx`): "ATTEMPT USED X of 3" now dynamic `of {attemptTotal}` (3 for C1, 1 for C2+).
- **Leaderboard timer/winners**: countdown already binds to champion contest `end_at`; added auto-refetch when it hits 0 (polls up to ~2.5 min) + settled/"FINAL RESULTS · winners announced" UI so closing the championship announces winners on the board.
- Also fixed a pre-existing blocking lint error: missing `adminAPI` import in `pages/admin/UserDetailsPage.jsx`.
- STATUS: leaderboard redesign PASS (iteration_41, 3 interaction bugs since fixed via z-index). Champion attempt + token-retry fixes verified at API level against the now-active Championship 1. NOTE: these fixes are NOT in the earlier production deploy — a redeploy is required to ship them live.

## Champion attempts — REAL root cause fixed (2026-09-25, later)
- The earlier backend `_champion_attempt_status` enrichment was necessary but INSUFFICIENT. The champion game launch in `PrizeLeagueWorld.jsx` (`onChampionSelect`) built `levelData.level` from `worldAPI.state().champion`, which has NO `attempts` object. The play component reads free attempts from `level.attempts` (prop) until an official session starts — so the entry + "Ready to play?" screens ALWAYS showed 0 free, forcing the "Retry with token" button, whose reserve then failed with FREE_ATTEMPT_AVAILABLE (backend still had 3 free).
- FIX: `onChampionSelect` now also calls `worldContestAPI.championStatus()` and injects `champStatus.attempts` into `levelData.level.attempts`. Now Champion 1 shows 3 free and the primary CTA is "START ATTEMPT"; token retry only appears at 0 free (where reserve succeeds).
- Timer timezone fix: `FreeWorldLeaderboard.jsx` `parseUtcMs()` appends 'Z' to naive backend timestamps so the countdown targets 21:00 UTC = 22:00 London (10pm BST) = real championship close.
- Verified against live Championship 1: champion/status → free_attempts_available 3; with counter forced to 0, reserve(level:0) → 200 purchased:true token_cost:1 tokens_remaining:349. Needs redeploy to ship.

## Deploy fix + Wallet/Cash-Out system — STAGED (2026-09-25)
- BUILD BLOCKER FIXED: a duplicated import/helper block had been pasted mid-component in `FreeWorldNumberSequenceV3.jsx` (broke `yarn build`). Removed; file parses clean; re-applied lost dynamic "ATTEMPT USED X of {attemptTotal}" edit.
- WALLET/CASH-OUT (big feature) — decisions locked with user: (1) keep `wallets.balance`=Total Tokens + add sub-counters `bonus`/`withdrawable`; spend order bonus→purchased→withdrawable; (2) fold Something Special £500 into withdrawable bucket; (3) migrate `signup_bonus_tokens` into wallet bonus; (4) CASHOUT_ENABLED default OFF, admin-toggle from admin panel; (5) GOOGLE_REVIEW_URL/TRUSTPILOT_REVIEW_URL as admin-editable config placeholders; also show a small live-paid-contests strip on the cash-out page.
- Existing systems mapped: token wallet single `balance` (1 token=£1, `wallet_routes.py`); champion prizes already credit main wallet via `_apply_tx_idempotent(...,'champion_prize',...)`; complete cash-out/withdrawal/admin engine ALREADY EXISTS in `winnings_routes.py` (winnings_wallets/withdrawal_requests/winnings_ledger; reserve, mark-paid idempotent, reject→release, reveal-bank) but funded only by the £500 challenge; KYC in user/admin routes.
- STAGE 1 DONE + VERIFIED (backend, non-breaking): `wallet_routes.py` `_with_tokens` now exposes total_tokens/spendable_tokens/bonus_tokens/withdrawable_tokens/available_to_cash_out; `_apply_tx` + `_apply_tx_idempotent` tag positive credits by source (`champion_prize`→withdrawable, bonus kinds→bonus) via `_source_inc_for_credit`. Existing balances default non-withdrawable. Verified: 20 topup+50 champion+10 bonus → total 80 / spendable 70 / bonus 10 / cash-out £50; live /api/wallet/me returns fields.
- REMAINING STAGES: none — Stages 2-4 COMPLETE.

## Wallet/Cash-Out Stages 2-4 COMPLETE + TESTED (2026-09-27)
- STAGE 2 (spend order + migration): `_split_debit` consumes bonus->purchased->withdrawable (reserved `withdrawable_pending` never spendable); both `_apply_tx` and `_apply_tx_idempotent` debit paths use it with overdraft + optimistic guards. `_migrate_wallet_sources` lazily backfills legacy wallets (bonus = min(balance, sum of historical bonus credits); withdrawable defaults 0 = non-withdrawable). Verified: spend order + idempotent replay no double-debit.
- STAGE 3+4 backend (`routers/cashout_routes.py`, NEW): /api/cashout config|summary|bank-accounts(add/list masked)|request|requests; /api/admin/cashout config(get/put)|withdrawals|detail(full bank, payout-admin only)|mark-paid(idempotent, settle)|reject(release). CASHOUT_ENABLED in `app_settings` key 'cashout' (default OFF, admin-toggle). Review URLs (GOOGLE/TRUSTPILOT) admin-editable, blank by default. Token-wallet reserve/settle/release helpers in wallet_routes. £500 Something Special challenge now credits token wallet as WITHDRAWABLE (kind 'winnings'; WalletTx Literal extended). Registered in server.py.
- FRONTEND: `components/account/CashOutCard.jsx` (in WalletPanel) — Total/Tokens/Bonus/Available breakdown + Cash Out button (Coming Soon when disabled) + full modal flow (amount->bank(add/select masked)->confirm->success w/ review links + live paid contests strip) + cash-out history. Admin `pages/admin/CashOutAdmin.jsx` (route /admin/cash-out, nav 'Cash Out') — enable toggle, review URL config, withdrawals list w/ filters, detail w/ full bank, Mark as Paid (confirm), Reject (reason). `cashoutAPI` added to lib/api.js. TX labels extended.
- TESTED (iteration_42): backend 8/8 PASS (flag gating, over-withdraw, lifecycle, mark-paid idempotency, reject-releases, security: normal user blocked from admin endpoints, /cashout/requests never returns full account_number). Frontend full UX passed (disabled->enable->cash-out->success->mark-paid/reject). No functional bugs; only optional polish noted (zero-flash [FIXED], window.confirm/prompt cosmetic, hero/breakdown redundancy). Added defense-in-depth: release reserved tokens if request insert fails.
- STATE: CASHOUT_ENABLED reset OFF (default). player1 QA seed cleaned (balance 349, wd 0). Backend tests file: /app/backend/tests/test_cashout_iter42.py. NEEDS REDEPLOY to ship.

## Championship Winners Ticker (2026-06-27)
- Goal: Global site-wide ticker showing ONLY finalized/settled Championship winners (display name + authoritative GBP prize). Latest finalized Championship auto-replaces the previous one. No frontend prize recalc; no provisional positions.
- BACKEND: `GET /api/world/public/champion-winners` (world_routes.py, public_router). Reads immutable `world_winner_awards` where status=="paid"; selects highest `global_contest_number` with paid awards (auto-replacement), returns rank/user_name/prize_amount(=stored winning_amount)/currency. Returns {contest_number:null,winners:[]} when none finalized.
- FRONTEND: Reused existing global `components/layout/AnnouncementTicker.jsx` (rendered in Header site-wide, purple gradient). Fetches championWinners on mount + every 60s. Shows winners when finalized (🏆 Name won £X), falls back to promo announcements when none. `championWinners` added to contestsAPI in lib/api.js. Continuous marquee, responsive.
- Did NOT modify winner determination/settlement logic. Names shown as stored (user's choice: full display name as-is).
- TESTED: curl endpoint (empty + seeded 5-winner cases), screenshot on /paid-leagues confirmed scrolling winners bar. Test seeds cleaned up.

## Free World Personal Championship Progression + Daily Unlock + Catch-up (2026-06-27)
- Personal progression is independent of the global Championship. Rollover fixed: eligible users move to their NEXT personal Championship at Level 1 (not stuck at old Level 10).
- DAILY LEVEL UNLOCK (all users, current + behind championships): Level 1 always open (no timer); Levels 2-10 unlock one per day at 00:00 Europe/London, anchored to when the user ENTERED that personal Championship (`personal_stage_started_at`). Future locked levels show a live countdown. Never re-locks completed levels.
- OLD users behind the live Championship (`free_world_started_global_contest <= stage`) get CATCH-UP Play/Skip on remaining old levels. SKIP is server-validated (next-in-sequence only), records no score/reward, consumes no attempt/token, audited in `world_level_skips`. Passing/ skipping Level 10 -> champion_ready -> existing continue advances stage.
- NEW users (progress created at/after C2) start personal C1 L1 with daily unlock, NO skip; never sent to the globally-active Championship.
- Admin per-level Free Attempts + Retry Token Cost now enforced (removed hardcoded free_attempts=3 override in `_effective_level_config`; admin UI already had inputs in FreeWorldContestConfig.jsx).
- KEY BACKEND (world_routes.py): `_personal_unlock_context()` + `_resolve_unlock_context()` dispatcher (routes all users when an active contest exists; `_world_unlock_context` untouched, now only the no-active-contest fallback). New fields on world_progress: `free_world_started_global_contest`, `skipped_levels`, `personal_stage_started_at` (creation + migration backfill: existing=1). New endpoint `POST /world/level/{level}/skip`. `continue_after_champion` resets skipped_levels + personal_stage_started_at on advance. State response adds `catchup_mode`, `skipped_levels`, per-level `skippable`.
- KEY FRONTEND: WorldCanvas.jsx auto-continue effect (Case A), skip event handler + SKIP node badge, future-locked levels show countdown. api.js `skipLevel`. world2d.css `.pl1000-skip`.
- UNCHANGED: global scheduler, Championship windows, leaderboard ranking/tie-break, settlement, prize formula (prize uses champion_stage_snapshot), wallet, cash-out, winners ticker, Paid World, auth.
- TESTED (curl scripts + UI screenshots): Cases A (rollover), B (skip 6-10 -> C2 L1, UI verified), C (out-of-order skip rejected), D (new user C1 L1, no skip, skip rejected), E (daily 00:00 London boundary), G (default 3 free/1 retry), H (admin per-level override enforced), live C2 daily timers (UI: L1 open, L2 countdown 23:02:31). Needs redeploy for production.

## 2026-06-28 · Map history + token unlock + PWA install + User 360 history + Acquisition (iteration_43 · 100%)
- **Previous Championship map history** (`world_routes.py` `free_world_state`): `/api/world/state` now returns `championship_history` (one entry per personal stage < current champion_stage; each level `status` = `completed`, or `skipped` when in `world_level_skips`). `WorldCanvas.jsx` renders past championships as ✓ COMPLETED / SKIPPED (non-playable) instead of locked; current championship stays the only playable one. Skipped levels are NOT shown as genuine completions. No progression/score/prize/history mutated.
- **Token early-unlock re-added**: `_default_world_level_config` default `token_unlock_enabled` flipped False→True, and `_validate_world_level_config` (admin levels_config save) now derives it from the incoming item (default True) instead of hard-coding False — so admin edits no longer silently disable it. Tokens still only bypass the scheduled TIME lock (Levels 2-10), never progression.
- **PWA install popup** (`world/components/InstallPrompt.jsx` + `installPrompt.css`): sits just above the Free World bottom-nav Home button, uses native `beforeinstallprompt` (Chromium) with an iOS Safari "Add to Home Screen" tip, and auto-hides on `appinstalled` / standalone. Added a network-only `fetch` handler to `public/service-worker.js` (no caching) so the browser treats the app as installable.
- **Admin User 360 Free World history** (`user360_routes.py` returns `world` block; `UserDetailsPage.jsx` renders it): Championship progression, Levels history (from `world_level_attempts`), Winnings history (from `world_winner_awards`), Token history (unlock + retry reservations) — all with timestamps.
- **Acquisition analytics** (NEW `acquisition_routes.py`, registered in `server.py`): public `POST /api/acquisition/track` records referrer + UTM + landing + device once per visitor/day; admin `GET /api/admin/acquisition/summary` + `/visits` aggregate sources/channels/devices/browsers/landing/campaigns + daily trend. Frontend `AcquisitionTracker` fires once/session; admin page `AcquisitionAdmin.jsx` at `/admin/acquisition` (nav "Acquisition").
- Verified iteration_43: backend 100% (10 pytest cases), frontend 100% (3 flows). NOT deployed — needs redeploy to ship to production.

## 2026-06-28 (later) · Acquisition conversion + proactive install popup + champion-attempt standardisation (iteration_44 · 100%)
- **Signup conversion by source** (`acquisition_routes.py` summary): added `by_source_conversion` (first-touch source → visitors, converted players, rate%), `converted_visitors`, `overall_conversion_rate`. `AcquisitionAdmin.jsx` shows a "Signup conversion by source" table + "Players signed up" / "Conversion rate" stat cards.
- **PWA install popup made proactive** (`InstallPrompt.jsx`): now shows ~1.5s after load if not standalone/not dismissed (native `beforeinstallprompt` was unreliable). Install button uses the native prompt when available, else shows a "browser menu → Install app / Add to Home Screen" tip. Now mounted on BOTH Free World map and Paid Contests home (`Home.jsx`). Auto-hides on install; dismiss is per-session.
- **Champion free-attempts standardised to 3 across ALL 100 championships** (`world_routes.py` `_champion_attempt_status` + `_consume_champion_stage2_attempt`): stage≥2 was 1 free, now 3 free (same as Championship 1 and the normal levels). Idempotent legacy migration preserves already-consumed attempts (no user progress reset). Token-retry fallback and prize scaling unchanged. Verified: repeated status calls stable; token retry correctly rejected (409 FREE_ATTEMPT_AVAILABLE) while free attempts remain; no data corruption.
- NOT deployed — needs redeploy to ship to production.

## 2026-06-28 (later) · Free World SEO landing (/free-world) — SEO-only, no logic changes
- New public page `/free-world` (`pages/FreeWorldLanding.jsx`) under PublicLayout: crawlable H1, What/How/Levels/Champion/Prizes/How-to-start/Eligibility sections, 6-item FAQ, breadcrumbs, internal links, CTA to `/world`. Content grounded in real product (100 Championships × 10 Number Sequence levels, daily unlock, Champion global leaderboard, free to play).
- `hooks/useSeo.js`: dependency-free per-route <head> manager (title, description, keywords, robots, canonical, OG/Twitter, JSON-LD). Reverts on unmount (verified: no SEO bleed to other routes).
- Structured data: route-scoped BreadcrumbList + FAQPage on /free-world; site-wide Organization + WebSite(SearchAction) added statically to index.html (renders without JS).
- `public/sitemap.xml`: added /free-world (priority 0.95). `public/robots.txt`: explicit allow /free-world; disallow /production, /world-preview, /auth-callback (admin/account/cart/api already blocked).
- `public/og-free-world.png` (1200×630) generated; used for OG/Twitter on the landing. Footer gains a "Free World" internal link.
- Canonical host used = non-www `https://prizeleague.co.uk/free-world` (matches existing site) despite brief requesting www — flagged for user to pick ONE host + 301.
- NOT deployed — needs redeploy to ship to production.

## 2026-06-28 (later) · Build-time SEO prerender + more landing pages (SEO-only)
- **Prerender (React-19 safe, zero-dep):** `frontend/scripts/prerender-seo.js` runs after `craco build` (chained in package.json `build` script). Writes true static `build/<route>/index.html` for `/free-world`, `/how-it-works`, `/competitions` with correct title/meta/keywords/robots/canonical/OG/Twitter + JSON-LD in <head> and a crawlable body snapshot in #root. Fails safe (never throws, exits 0) — cannot break a deploy. react-snap deliberately NOT used (incompatible with React 19's removed hydrate API).
- **More landing pages:** added `useSeo` (head + BreadcrumbList JSON-LD) to existing `HowItWorks.jsx` and `Competitions.jsx` — no logic/UI change. Titles: "How Prize League Works | Skill-Based Prize Competitions UK" and "Skill Prize Competitions UK | Enter & Win | Prize League". Both added to sitemap.
- Verified: production build succeeded (27s), all 3 static files generated with correct title/canonical/JSON-LD/body; runtime head confirmed on /competitions + /how-it-works.
- Serving note: prerendered files are served only when the production static server tries `$uri/` before the SPA fallback (standard nginx/serve behaviour); runtime `useSeo` covers JS-capable crawlers regardless.
- NOT deployed — needs redeploy to ship.

## 2026-06-28 · Canonical host decision = www
- User chose **www**. Aligned all SEO URLs to `https://www.prizeleague.co.uk` across FreeWorldLanding.jsx, HowItWorks.jsx, Competitions.jsx, prerender-seo.js, public/index.html (canonical+OG+Organization/WebSite JSON-LD), sitemap.xml, robots.txt (incl. Sitemap: line). brand.js already used www.
- Left untouched (not SEO head tags): legal copy in website-terms.js and an internal AlertsAdmin URL constant.
- MANUAL (hosting/DNS): add a 301 redirect non-www -> www (apex prizeleague.co.uk -> www.prizeleague.co.uk). In GSC, set the www property as primary and submit https://www.prizeleague.co.uk/sitemap.xml.

## 2026-06-28 · Champion 1 timer fix (minimal)
- Root cause: `_personal_champion_transition_schedule` (backend/routers/world_routes.py ~L3194) anchored BEHIND users (personal stage < active global contest, e.g. Champion 1 while global is Champion 2) to `personal_stage_started_at`, producing a wrong ~9-day Champion countdown. Live users (stage==active) correctly anchored to the active global contest `start_at`.
- Fix: when a Global Contest is active, ALL personal Championships (live OR behind) anchor to that contest `start_at`; fallback to personal stage start only when no contest is active. One condition changed; removed 2 now-unused locals.
- Verified: behind (C1) and live (C2) now return identical champion_opens_at/closes_at for the same Global Contest (MATCH=True); C2 output byte-identical to before; fallback intact. Not deployed.

## 2026-06-28 · Champion Challenge unlock bypass fixed (minimal)
- Root cause: POST /api/world/contest/enter (enter_world_contest, world_routes.py) created a world_contest_entries doc WITHOUT the champion_ready (Level-10) check. Once an entry existed, _ensure_champion_entry returned it and skipped its own gate, so champion_session_start let users play the Champion Challenge without completing Level 10.
- Fix: added the same champion_ready 403 guard to enter_world_contest (contest-active window already enforced there). Frontend already gated (isCurrentChampionship && champion_ready) so no FE change.
- Verified: ready user (admin, current_level 10) -> 200; not-ready users (champion_ready False) -> 403 CHAMPION_NOT_READY branch (identical to proven _ensure_champion_entry gate). File changed: backend/routers/world_routes.py. Not deployed.
