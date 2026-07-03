# GameZoo — PRD

## Original problem statement
Production-ready skill-based sweepstakes web app (rebranded from "Prize Paradise" to **GameZoo**). Requirements:
- User auth (JWT + Emergent Google), ticket purchasing (mock Stripe today)
- Skill-based questions (trivia / puzzles) gating each contest entry (UK legal)
- Extensive admin/production panel (KYC, payments, settings, roles, live draws)
- Conversational AI assistant "Meera" that can control the platform (multilingual)
- **Admin and player interfaces must be completely separate**
- **Highly colorful player UI with live videos and images**

## Personas
- Player – buys tickets, answers a skill question, tracks entries & winnings.
- Admin / Super-admin – full platform control, KYC/payments.
- Operator – production-panel access only (live draw / prize inventory).
- Support – read-only admin.

## Core requirements (status)
- [x] Rebrand to GameZoo
- [x] MongoDB models, JWT + Emergent Google OAuth
- [x] Skill-question verify before purchase (`/api/contests/{id}/verify-skill`)
- [x] Admin dashboard: Users, Roles, KYC, Contests, Orders, Payments, Winners, Analytics, Settings
- [x] Production panel: Operations, Live Draw, Prize Inventory, Winners Feed, KYC
- [x] Meera AI assistant (uses Emergent LLM Key + emergentintegrations)
- [x] Seeded 52 live contests
- [x] Admin/Player UX split – separate `/admin/login` staff portal (2026-02)
- [x] Colorful animated hero – animated gradient + background video + floating badges (2026-02)
- [x] Live-draw scheduler – 60s asyncio loop + manual "Draw now" (2026-02)
- [x] Winner in-app notifications – header bell + panel with unread badge (2026-02)
- [x] Header session UX – user avatar+dropdown when logged in (2026-02)
- [x] **Code-quality pass** (2026-02):
  - Broke circular import via `deps.py`
  - `secrets.choice` for cryptographically fair draws
  - Refactored Meera's 217-line `_execute_actions` → `services/meera_actions.py` dispatch table (per-action handlers, each <25 LoC)
  - `meera_routes.py`: 434 → 164 lines
  - Hook-deps fixed, empty catches replaced with logging, `useMemo`+`useCallback` on `AuthContext`
  - Stable list keys (HeroBanner, MeeraChat, MyAccount stats)
  - CSP + strict referrer meta tags on `index.html`
  - Test admin creds via env vars with fallback

## Architecture
- Frontend: React (CRA) + Tailwind + Shadcn UI. Backend URL from `REACT_APP_BACKEND_URL`.
- Backend: FastAPI, Motor async. All routes under `/api`. Env from `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`.
- Shared: `backend/deps.py` (motor client, `get_db()`), `backend/services/draw_service.py`, `backend/services/scheduler.py`, `backend/services/meera_actions.py`.
- AI: `emergentintegrations` (GPT-4o-mini via Emergent LLM Key).
- Background: `services/scheduler.py` asyncio task started at FastAPI startup event, 60s tick.

## Roadmap
### P1 (needs user-supplied keys)
- Real Stripe checkout (currently mock; writes orders directly)
- Twilio SMS OTP login (currently disabled tab)

### P2
- Winner **email** notifications (Resend / SendGrid — needs API key)
- Cinematic live-draw reveal page (animated wheel)
- Payout reconciliation dashboard

### Nice-to-have
- localStorage → httpOnly cookie migration for auth (currently mitigated with CSP)
- Extract heavy components (CompetitionDetail, EditContestDialog) into smaller sub-components
- Reduce complexity of `auth.get_current_user`, `order_routes.checkout`, `admin_routes.update_contest_full`

## Test credentials
See `/app/memory/test_credentials.md`.

## Test suites
- `/app/backend/tests/backend_test.py` – 16 regression
- `/app/backend/tests/test_scheduler_notifications.py` – 11 (P2)
- `/app/backend/tests/test_meera_refactor.py` – 5 (refactor safety)
- Total: **32/32 pass** as of 2026-02

## Known mocked flows
- Stripe checkout → mock (no real charge)
- SMS OTP → disabled
- Winner emails → not sent (in-app notification only)
