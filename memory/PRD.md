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
