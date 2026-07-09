# Prize League — PRD

## Original problem statement
Production-ready skill-based sweepstakes web app (rebranded **GameZoo → Prize League** on 2026-07-09). Requirements:
- User auth (JWT + Emergent Google), ticket purchasing (mock Stripe today)
- Skill-based questions (trivia / puzzles) gating each contest entry (UK legal)
- Extensive admin/production panel (KYC, payments, settings, roles, live draws)
- Conversational AI assistant "Meera" that can control the platform (multilingual)
- Admin and player interfaces completely separate
- Highly colorful player UI with live videos, images, and spin wheel

## Personas
- Player – buys tickets, answers a skill question, tracks entries & winnings.
- Admin / Super-admin – full platform control, KYC/payments, contest CRUD via UI.
- Operator – production-panel access only (live draw / prize inventory).
- Support – read-only admin.

## Core requirements (status)
- [x] Rebrand to **Prize League** (2026-07-09)
- [x] MongoDB models, JWT + Emergent Google OAuth
- [x] Skill-question verify before purchase (`/api/contests/{id}/verify-skill`)
- [x] Admin dashboard: Users, Roles, KYC, Contests, Orders, Payments, Winners, Analytics, Settings
- [x] Production panel: Operations, Live Draw, Prize Inventory, Winners Feed, KYC
- [x] Meera AI assistant (Emergent LLM Key + emergentintegrations)
- [x] Admin/Player UX split — separate `/admin/login` staff portal
- [x] Colorful animated hero — animated gradient + background video + floating badges
- [x] Live-draw scheduler — 60s asyncio loop + manual "Draw now"
- [x] Winner in-app notifications — header bell + panel
- [x] Header session UX — user avatar+dropdown when logged in
- [x] **Rebrand: PrizeLeague across UI, DB settings, title, footer, admin/production** (2026-07-09)
- [x] **Robust logout** — 3 buttons (header/admin/production), each purges localStorage + sessionStorage + hard-nav (2026-07-09)
- [x] **UI-first contest CRUD** — New Contest / Edit Contest modal with 6-image gallery + publish selector (2026-07-09)
- [x] **Prize Wheel** on Home — SVG-based, spins to reveal (2026-07-09)
- [x] **Winners Ticker** on Home — mixes real + fallback for lively marquee (2026-07-09)
- [x] Code-quality: `secrets.choice` for draws, dispatch-table Meera actions, deps.py, hook deps + useMemo

## Architecture
- Frontend: React (CRA) + Tailwind + Shadcn UI. Backend URL from `REACT_APP_BACKEND_URL`.
- Backend: FastAPI, Motor async. All routes under `/api`. Env from `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`.
- Shared: `backend/deps.py`, `backend/services/{draw_service,scheduler,meera_actions}.py`.
- AI: `emergentintegrations` (GPT-4o-mini via Emergent LLM Key).
- Background: `services/scheduler.py` asyncio task, 60s tick.

## Roadmap
### P0 to launch (needs user-supplied keys)
- **Real Stripe payments** (currently mocked)
- **Legal URLs + Company/VAT numbers** in Settings
- **Winner email notifications** (Resend/SendGrid — API key needed)

### P1
- Twilio SMS OTP login
- Custom domain + SSL (via Emergent Deploy)
- httpOnly cookie auth migration
- Real KYC provider (SumSub/Onfido)

### Nice-to-have
- Cinematic live-draw reveal (animated wheel on `/production/live-draw`)
- Payout reconciliation dashboard
- Migrate `gamezoo_cart` → `prizeleague_cart` localStorage key

## Test credentials
See `/app/memory/test_credentials.md`.

## Test suites (all pass — 37/37 as of 2026-07-09)
- `/app/backend/tests/backend_test.py` — 16 regression
- `/app/backend/tests/test_scheduler_notifications.py` — 11 (P2 scheduler + notifications)
- `/app/backend/tests/test_meera_refactor.py` — 5 (Meera dispatch table safety)
- `/app/backend/tests/test_create_contest.py` — 5 (UI create-contest endpoint)

## Known mocked / disabled flows
- Stripe checkout → mock
- SMS OTP → disabled
- Winner emails → in-app only
- Auth in localStorage (with CSP + strict referrer mitigation)
