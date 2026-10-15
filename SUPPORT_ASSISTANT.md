# Prize League Support Assistant

The support assistant is mounted once below the application router. It reuses the existing support case collections and admin shell; it does not alter contest, wallet, payment, authentication, or progression behavior.

## Configuration

Set these backend environment variables before enabling AI responses:

- `EMERGENT_LLM_KEY`: server-only credential for the existing Emergent LLM integration. Never expose it to the browser.
- `SUPPORT_AI_PROVIDER`: optional provider name; defaults to `openai`.
- `SUPPORT_AI_MODEL`: optional model name; defaults to `gpt-4o-mini`.
- `SUPPORT_AI_REQUESTS_PER_HOUR`: per-user/IP AI request limit; defaults to `30`.
- `SUPPORT_TICKETS_PER_DAY`: ticket submissions per user/IP; defaults to `5`.
- `SUPPORT_RESPONSE_TARGET_HOURS`: WhatsApp response target text; defaults to `1` and is not an SLA.
- `SUPPORT_GUEST_RETENTION_DAYS`: optional PII-redaction period for resolved/closed guest tickets. `0` (default) disables automatic guest-ticket redaction until an operator chooses a policy-appropriate period.

The official support email is read from existing Company Settings. The WhatsApp Business number is managed in Company Settings and defaults to blank; the widget will not create a WhatsApp link until a number is entered there. Approved AI answers are managed in Admin → Customer Support → Knowledge.

## API

Public/user routes:

- `GET /api/support/config`
- `GET /api/support/knowledge`
- `POST /api/support/ai/chat`
- `POST /api/support` (authenticated ticket)
- `POST /api/support/guest` (guest ticket; name and valid email required)
- `GET /api/support/mine` and `POST /api/support/{case_id}/reply` (authenticated owner only)

Admin routes require an existing authorized admin/staff role:

- `GET /api/admin/support/cases`
- `POST /api/admin/support/cases/{case_id}/reply`
- `POST /api/admin/support/cases/{case_id}/status`
- `POST /api/admin/support/cases/{case_id}/priority`
- `POST /api/admin/support/cases/{case_id}/assign`
- `POST /api/admin/support/cases/{case_id}/notes`
- `GET|POST /api/admin/support/knowledge`
- `PUT|DELETE /api/admin/support/knowledge/{knowledge_id}`

AI chat is not persisted unless the visitor explicitly confirms a ticket. Ticket messages are redacted for common credential/payment-number patterns. Account erasure scrubs authenticated ticket transcripts. Guest-ticket redaction is disabled by default and can be configured after the applicable retention policy is approved.
