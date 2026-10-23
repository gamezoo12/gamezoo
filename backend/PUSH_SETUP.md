# Push Setup

## Web Push

Web Push uses the existing `/service-worker.js`, VAPID, and the browser Push API. It is disabled until these server environment variables are configured:

- `VAPID_PUBLIC_KEY`: uncompressed P-256 public point, base64url encoded without padding.
- `VAPID_PRIVATE_KEY`: path to a PEM private key generated for this site, or the supported encoded private key value.
- `VAPID_SUBJECT`: VAPID contact, for example `mailto:security@prizeleague.co.uk`.

Generate and protect a dedicated keypair outside the repository. One compatible Python approach is `py_vapid.Vapid.generate_keys()`, `save_key(private_path)`, and `save_public_key(public_path)`. Convert the saved public point to base64url for `VAPID_PUBLIC_KEY`. Never commit or print the private key. Do not reuse keys between environments.

Subscriptions are accepted only from the supported HTTPS push-service hosts, belong to the authenticated account, and are removed when the provider returns 404 or 410. The account preference `web_push_enabled` gates service alerts; promotional campaigns additionally require `web_push_marketing_consent`.

## Native Push Preparation

Native device tokens can be registered for `android` and `ios`, but delivery is intentionally unavailable until a native app and a provider integration (FCM or APNs) exist. Configure `PUSH_TOKEN_ENCRYPTION_KEY` with a Fernet-compatible key before accepting native device tokens. Tokens are encrypted at rest; only token hashes are used for stable device IDs. The Admin Alerts channel reports native sends as skipped until delivery is implemented and credentials are configured.

## Preview and Production

Do not configure production VAPID keys or native provider credentials through source control. Set environment variables in the deployment secret manager. The local preview remains Push-disabled unless separately configured with test keys; in-app notifications and PWA installation do not depend on these settings.
