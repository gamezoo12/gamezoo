# Prize League — PRD

## Original problem statement
Skill-based sweepstakes web app (rebranded **GameZoo → Prize League** on 2026-07-09). Requirements:
- JWT + Emergent Google auth
- Ticket purchasing via **wallet** (min £10 top-up)
- Skill-question gate + optional per-contest **skill game** (memory match, jigsaws, slider, etc.)
- Full admin + production panels (KYC, payments, wallets, roles, live draws, settings, meera AI)
- Conversational **Meera AI** — admin/production panels ONLY (not on public site)
- Admin and player interfaces completely separate
- Highly colorful player UI (orange/rose/fuchsia palette, no light green)
- **Referral programme** — invite friends, both get free ticket (or £5 wallet credit fallback)
- **Live winners ticker + leaderboard per contest**

## Personas
- Player – buys tickets from wallet, plays skill game, tracks entries + winnings, invites friends
- Admin / Super-admin – full control incl. wallet adjustments
- Operator – production-panel access only (live draw / inventory)
- Support – read-only admin

## Core requirements (status — all shipped)
- [x] Prize League rebrand
- [x] JWT + Emergent Google OAuth + email/password
- [x] Skill-question verify + optional skill game per contest
- [x] Admin dashboard (Users, Roles, KYC, Contests, **Wallets**, Orders, Payments, Winners, Analytics, Settings)
- [x] Production panel (Operations, Live Draw, Prize Inventory, Winners feed, KYC)
- [x] Meera AI — admin/production only (removed from public pages)
- [x] Auto-draw scheduler (60s tick) + winner in-app notifications
- [x] Header session UX (visible Sign out + wallet balance chip)
- [x] Prominent multi-path logout (header/admin/production/mobile) — all 4 verified working
- [x] **Wallet system** with £10 min top-up (mock), atomic per-user balance, transaction log
- [x] Ticket checkout charges wallet ONLY (returns 402 with helpful message if insufficient)
- [x] Admin wallet panel — view all, search, credit/debit, per-user tx history
- [x] **Referral programme** — unique code per user, invite link, both parties get 1 free ticket (or £5 wallet fallback)
- [x] Expanded My Account — 11 tabs: Profile · Wallet · Tickets · Orders · Referrals · Notifications · KYC · Security · Support · Policies · Preferences
- [x] **16 skill games** — Memory Match, Number Sequence, Target Tap, Word Unscramble, Emoji Riddle, Image Jigsaw 3×3/4×4, 15-Slider Puzzle, Math Sprint, Reaction Time, Trivia Quiz, Simon Says, Whack-a-Mole, Odd One Out, Color Match (Stroop), Pattern Repeat
- [x] Admin can assign a game to each contest (dropdown in EditContestDialog) or leave blank for manual winner draw
- [x] Play flow — `/play/:contestId/:ticketId`, 3 attempts, score = speed × accuracy
- [x] Real-time per-contest leaderboard — `/leaderboard/:contestId`
- [x] **Global live leaderboard** — `/leaderboard` (public nav link) with podium, per-contest tab switcher, 15s auto-refresh
- [x] **Per-contest live leaderboard embedded on `/competition/:slug`** — full card (top 10, medals, view-full link) shown whenever contest has a skill game assigned
- [x] **Dual entry modes (Feb 2026)** — `entry_mode` field: `skill_game` or `random_tickets`. Contest detail page branches automatically; skill-question card only for skill games; ticket-availability card for random contests.
- [x] **Configurable game attempts** — `max_attempts` (default 3, 1–10). Server-side enforced in `/api/games/submit`. Contest closing time also enforced (no attempts after end_date).
- [x] **Leaderboard visibility control** — 4 modes: live / after_playing / after_close / hidden. Public contest detail respects the setting.
- [x] **Winner Selection admin (random-ticket contests)** — new `/admin/winner-selection` page with router `winners_routes.py`: view paid tickets → cryptographically-secure random draw (secrets.randbelow) → OR manual pick with reason → preview state → publish + lock → post-publish correction requires 20+ char reason. Every action written to `winner_audit` collection with actor, timestamp, method, reason.
- [x] **Mobile fixes on contest detail** — main hero image now uses `object-contain` with a neutral background (no more cropping of important product photos on mobile); skill-question options grid switches to 1-col on mobile with `break-words`; buy button and info card use responsive padding.
- [x] **Login page rebrand (Feb 2026)** — Login page rebuilt on the pl-hero-bg brand with Prize League logo, gold-metallic "Win amazing prizes" headline, gold submit button, purple tab pills. Terms & Privacy links now point to the correct routes.
- [x] **Mobile header sign-in icon** — mobile viewport now shows a user icon (data-testid=mobile-signin-icon) when logged out, and a compact avatar chip (data-testid=mobile-profile-icon) linking to /my-account when logged in — mirroring the desktop cluster.
- [x] **Unified brand across Admin + Production panels (Feb 2026)** — replaced the old teal palette with the same premium purple/gold theme used on the public site. AdminLayout & ProductionLayout now use the Prize League SVG logo, dark #0B0D1F sidebar with white-on-purple active state and gold accent labels. Admin login page rebuilt on the pl-hero-bg + glass card with gold submit button. Sweep across all 11 admin pages + EditContestDialog removed every teal accent (0 remaining).
- [x] **Legal pages (Feb 2026)** — verbatim Terms & Conditions, Privacy Policy, Website Terms + Acceptable Use Policy, and Mobile Terms of Service supplied by the operator. Reusable `LegalPage` component parses section headings/bullets. Routes: `/terms`, `/privacy`, `/website-terms`, `/mobile-terms`. Footer now has a dedicated Legal column with all four links.
- [x] **Premium redesign (Feb 2026)** — deep purple/gold palette (#6C2BFF · #FFD54A · #0B0D1F), gold-gradient "PRIZE LEAGUE" hero, purple announcement ticker with pause-on-hover, dynamic live-contests carousel with auto-rotate + swipe, single gold PLAY NOW button, dark nav with gold underline for active, redesigned 6-step "How to Play" section, premium Refer & Earn card with copy/share, `/how-it-works` and `/refer` dedicated pages, custom Trophy + P SVG logo, dark premium footer with skill-based/safe-play badges
- [x] **Sign Out inside Profile dropdown** (with confirm) — desktop dropdown + mobile drawer; no more separate sign-out button on nav
- [x] **Fake activity purged** — no more "Sarah M." fallback in WinnersTicker (component now hides if no real winners); "100% Legal" claim removed from hero; "Same-day payouts" wording removed everywhere
- [x] **Premium Stripe payments (Feb 2026)** — Flow A claimable sandbox (GB, SMP), 4 wallet top-up packages (£10/£20/£50/£100), full end-to-end flow validated, idempotent wallet crediting
- [x] **Mobile responsiveness pass** — no horizontal overflow, admin bulk bars stack on mobile, contest cards use smaller padding on mobile, section titles scale down, admin filters horizontally scroll on small screens
- [x] **30 skill-based mini-games** — 16 original + **14 new** (sudoku_mini, sequence_predict, countdown_numbers, word_ladder, chess_mate_in_one, tower_of_hanoi, lights_out, minesweeper_mini, nonogram_mini, tf2048_mini, cryptogram, anagram_finder, maze_solver, spot_pattern) — all mount + interactive, backend types endpoint returns 30
- [x] **Admin bulk launch/hold** — `POST /api/admin/contests/bulk/{launch,pause}` with filters (only_games, category, status_from) surfaced in Games Admin + Contests Admin
- [x] Rebrand sweep — killed all teal/emerald on public site
- [x] Renamed "free spins" → "free tickets"

## Architecture
- Frontend: React (CRA) + Tailwind + Shadcn UI. `REACT_APP_BACKEND_URL`.
- Backend: FastAPI + Motor async. Routes prefixed `/api`. Env `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`.
- Shared: `backend/deps.py`, `backend/services/{draw_service,scheduler,meera_actions}.py`.
- Background task: `services/scheduler.py` auto-draws contests at end_date (60s tick).
- Games: pure client-side React components in `/app/frontend/src/components/games/index.jsx`; scoring & leaderboard server-side.

## Test suites (106/106 pass — as of iteration_12)
- backend_test (16 regression) + scheduler (11) + meera_refactor (5) + create_contest (5) + profile (10) + wallet (~9) + referrals (~7) + games (~5) + checkout_wallet + leaderboard_and_bulk (15) + **games_v2 (20 new — 30-type registry, 14-game assignment parametrize, e2e cryptogram submit + leaderboard)** = **106 total**

## Roadmap
### P0 to launch (needs user-supplied keys)
- Real Stripe integration for wallet top-ups (currently mocked → instant credit)
- **TrueLayer** open-banking integration (user mentioned as an alternative)
- Company/VAT/T&C/Privacy URLs in `/admin/settings`
- Winner email notifications (Resend/SendGrid API key)
- Custom domain + SSL via Emergent Deploy

### P1
- Twilio SMS OTP login
- Real KYC provider (SumSub/Onfido)
- httpOnly cookies migration (CSP mitigates for now)

### P2 (code review action items — non-blocking)
- Atomic wallet updates via MongoDB `findOneAndUpdate + $inc`
- Atomic ticket-number assignment (avoid duplicate numbers under concurrent checkouts)
- Order.checkout ordering: debit wallet BEFORE inserting tickets (rollback safety)
- Rate-limit /api/games/submit

### Nice-to-have
- More games (word ladder, sudoku mini, spot-the-difference, reaction time, etc. — currently 8)
- Refer-and-earn tiers (VIP badge after 10 successful referrals)
- Delete-account self-service (currently email-only)

## Test credentials
See `/app/memory/test_credentials.md`.

## Known mocked / disabled flows
- Wallet top-up → **mock** (instant credit, no card charge)
- SMS OTP → disabled
- Winner emails → in-app only
- Auth stored in localStorage (CSP + strict referrer mitigation active)
