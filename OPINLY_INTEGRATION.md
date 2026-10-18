# Opinly blog integration

This branch adds public blog pages and a FastAPI server-only proxy. Existing game, wallet, contest and payment routes are unchanged.

## Configure
Set the following **backend-only** environment variables in Emergent's backend secrets:

- `OPINLY_API_KEY` (required; never use `REACT_APP_` prefix)
- `OPINLY_WEBHOOK_SIGNING_SECRET` (required only for webhooks; get from Opinly Svix portal)
- `PUBLIC_SITE_URL=https://prizeleague.co.uk` (optional)

Install backend dependencies from `backend/requirements.txt` and restart backend/frontend. Do not commit secrets.

## Routes
- `/blog`, `/blog/:slug`, `/blog/category/:slug`, `/blog/author/:slug`
- `/api/opinly/posts`, `/api/opinly/post?slug=...`, `/api/opinly/categories`, `/api/opinly/authors`, `/api/opinly/authors/:slug`
- `/sitemap.xml`, `/rss.xml`, `POST /api/opinly-webhook`

The backend uses a 120-second in-memory cache; valid Svix webhooks invalidate it. Register `https://prizeleague.co.uk/api/opinly-webhook` in Opinly.

## Before production release
- Verify the live Opinly API response fields against the OpenAPI spec. Documentation was not accessible during implementation, so the UI uses common field names as fallbacks.
- The existing React app is a **client-side SPA**. The SEO tags currently update after hydration; **search bots may not index them reliably**. Add edge/server prerendering of blog routes before treating this as production SEO. Also ensure ingress forwards `/sitemap.xml` and `/rss.xml` to FastAPI rather than SPA fallback.
- Merge any existing sitemap routes instead of replacing them: the added sitemap currently lists Opinly content only.
- Implement consent-aware analytics identity and verified purchase tracking after reviewing Opinly analytics docs and existing consent/payment code. The public pixel is included, but user identity/purchase instrumentation is deliberately not guessed.
- Run frontend build and backend integration tests in your deployment environment. No live API key was available for end-to-end testing.
