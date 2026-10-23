# Push Setup

## Web Push

Web Push uses the existing `/service-worker.js`, VAPID, and the browser Push API. It is disabled until these server environment variables are configured:

- `VAPID_PUBLIC_KEY`: uncompressed P-256 public point, base64url encoded without padding (87 characters).
- `VAPID_PRIVATE_KEY`: raw 32-byte P-256 private key, base64url encoded without padding (43 characters). Backend only.
- `VAPID_SUBJECT`: VAPID contact, `mailto:support@prizeleague.co.uk`.

The browser gets the public key from `GET /api/push/vapid-public-key`, so no frontend build variable is needed and the private key never reaches the frontend.

### Generate keys (once per environment)

Run on the server (or any trusted machine) from `backend/`, writing straight into the environment file so the private key is never printed:

```
python scripts/generate_vapid_keys.py --env-file /path/to/backend.env
```

The script writes the three variables above with file mode 600 and prints only the public key. It refuses to overwrite existing keys unless `--force` is passed. Replacing keys invalidates every existing browser subscription, so users would have to re-enable notifications.

### Production

1. Generate a separate production pair; do not copy the preview pair. Keep it out of git, logs, screenshots and chat.
2. Store `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in the deployment secret manager, then restart the backend.
3. Verify `GET /api/push/vapid-public-key` returns `{"available": true, ...}` and that the logs contain no key material.
4. Back up the private key in the secret manager. Losing it is equivalent to rotating it.
5. Rotate by generating a new pair with `--force`, restarting, and asking users to re-enable notifications.

Subscriptions are accepted only from the supported HTTPS push-service hosts, belong to the authenticated account, and are removed when the provider returns 404 or 410. The account preference `web_push_enabled` gates service alerts; promotional campaigns additionally require `web_push_marketing_consent`.

## Native Push Preparation

Native device tokens can be registered for `android` and `ios`, but delivery is intentionally unavailable until a native app and a provider integration (FCM or APNs) exist. Configure `PUSH_TOKEN_ENCRYPTION_KEY` with a Fernet-compatible key before accepting native device tokens. Tokens are encrypted at rest; only token hashes are used for stable device IDs. The Admin Alerts channel reports native sends as skipped until delivery is implemented and credentials are configured.

## Preview and Production

Do not configure production VAPID keys or native provider credentials through source control. Set environment variables in the deployment secret manager. The local preview remains Push-disabled unless separately configured with test keys; in-app notifications and PWA installation do not depend on these settings.
