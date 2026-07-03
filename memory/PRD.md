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
- [x] **Admin/Player UX split** – separate `/admin/login` staff portal, no admin links on public header/footer (2026-02)
- [x] **Colorful animated hero** – animated purple→magenta→orange gradient + background video + floating badges (2026-02)
- [x] **Real live-draw scheduler** – 60s async loop auto-draws contests when `end_date` passes; manual "Draw now" from Operations page (2026-02)
- [x] **Winner in-app notifications** – bell + panel in public header, unread badge, auto mark-read on open (2026-02)
- [x] **Header session UX** – shows user avatar+dropdown when logged in, Sign in/Play Now when anonymous (2026-02)

## Architecture
- Frontend: React (CRA) + Tailwind + Shadcn UI. Backend URL from `REACT_APP_BACKEND_URL`.
- Backend: FastAPI, Motor async. All routes under `/api`. Env from `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`.
- AI: `emergentintegrations` (GPT-4o-mini via Emergent LLM Key).
- Background: `services/scheduler.py` asyncio task started at FastAPI startup event, 60s tick.
- Shared draw logic: `services/draw_service.py::draw_contest(db, contest_id)` (used by both scheduler and manual endpoints).

## Roadmap
### P1 (needs user-supplied keys)
- Real Stripe checkout (currently mock; writes orders directly)
- Twilio SMS OTP login (currently disabled tab)

### P2
- Winner **email** notifications (Resend / SendGrid — needs API key)
- Cinematic live-draw reveal page (animated wheel)
- Payout reconciliation dashboard

### Nice-to-have
- `secrets.choice` for cryptographically fair draws (currently `random.choice`)
- Pydantic `Notification` model for type-safety

## Test credentials
See `/app/memory/test_credentials.md`.

## Known mocked flows
- Stripe checkout → mock (no real charge)
- SMS OTP → disabled
- Winner emails → not sent (in-app notification only)
