# Phase 2: accounts and authorization

## Try the application

Run `bash scripts/setup.sh` from the project root. Open `http://localhost:5173`, choose **Get started**, and register. Development email is delivered by the Redis queue worker to the local **Mailpit inbox on port 8026**. Open `http://localhost:8026` in the same computer's browser, open the verification email, follow its link and press **Verify email address**. Use the same hostname throughout: the example configuration uses `localhost`, not a mixture of localhost and 127.0.0.1.

After verification, `/app` shows the account workspace; `/settings` supports name, email, bio, password and session management. Changing email requires the current password, clears verification, sends a new verification email and signs out other sessions. Password changes preserve the current session and revoke other sessions. Password reset invalidates all sessions for that account. Verify/sign-in links return to the original internal account route where applicable.

For an existing Phase 1 installation, `setup.sh` intentionally preserves your `.env` files. To use the local inbox, set these non-secret development options in `backend/.env` and recreate the services:

```dotenv
MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_SCHEME=null
```

```bash
docker compose up -d --wait
```

Mailpit is development-only and is not part of production Compose. Its UI is on 8026 to avoid colliding with a separate Mailpit instance on 8025. Inbox contents contain expiring authentication links; keep the inbox private. The log mailer remains an available alternative, but its logs also contain those links. A queue worker is required for delivery. Failed email jobs can be inspected with `php artisan queue:failed` inside the backend container, and retried after repairing SMTP with `queue:retry`; do not publish raw queue payloads or mail bodies.

## API contract

All routes use `/api/v1`. API responses remain JSON even when the caller omits `Accept`. Resource payloads use `data`; validation errors use Laravel's `message` and `errors`, with 401/403/419/422/429 status codes as appropriate. Account responses are not cacheable.

| Method | Route | Access / behavior |
| --- | --- | --- |
| POST | /register | Guest SPA; server assigns user role only; 201 |
| POST | /login | Guest SPA; generic invalid credentials; 200 |
| POST | /logout | Active session; revoke current session; 204 |
| GET | /me | Active session; own private account data |
| POST | /forgot-password | SPA; generic 202 regardless of account existence |
| POST | /reset-password | SPA; valid single-use reset token; 200 |
| PUT | /password | Active session + current password; revoke other sessions |
| POST | /email/verification-notification | Active session; throttled resend; 202 |
| GET | /email/verify/{id}/{hash} | Active matching user + valid expiring signature |
| PATCH | /profile | Active session; self-only policy; guarded fields |
| GET | /sessions | Active session; own unexpired device records |
| DELETE | /sessions/{uuid} | Revoke only an owned session; 204 |
| DELETE | /sessions/others | Revoke other sessions, retaining current session |
| GET | /users | Verified active session; cursor pagination and name search |
| GET | /users/{id} | Verified active session + view policy |
| GET | /admin/access | Verified active admin; access confirmation only |

No chat/conversation endpoints or moderation dashboard are included yet. Public user resources expose only ID, name, bio and an avatar placeholder; email and roles are included only for the requester themselves. Suspended/unverified/deleted users are excluded from the directory. Bio is plain text, rendered through React's normal escaping. Image/profile uploads belong to Phase 7.

## Cookie and session design

Sanctum uses Laravel's web session guard. Initialize CSRF with `GET /sanctum/csrf-cookie` and send the XSRF cookie header with state-changing requests. Axios does this centrally. Laravel 13 also recognizes valid same-origin Fetch Metadata as CSRF protection. Requests must come from a configured first-party Origin/Referer so Sanctum starts a session; the API does not issue bearer tokens or accept token-only sessions. No identity, password, token or role is persisted to localStorage/sessionStorage. Guest-only, authenticated, verified and admin frontend routes complement server middleware/policies; frontend role checks never authorize backend data.

Login regenerates the session ID. The HTTP-only, SameSite=Lax session cookie carries an opaque encrypted session identifier. Redis stores encrypted session content. Device session UUIDs in the database are revocation references, not authentication secrets; raw Redis session IDs are never exposed. Each authenticated request checks the device record, expiry, revocation, user auth version and suspension. Password reset/revoke-all increments the account version or revokes records, and Sanctum also checks the current password hash. Remember-me cookies are disabled so they cannot bypass device-record revocation. Session metadata expiry is refreshed at most once per minute. Expired device records may be pruned through an operational retention task; no scheduler or automatic retention task has been added yet.

Passwords require at least 12 characters, mixed case and a number. Bcrypt passwords are limited to 72 UTF-8 bytes to prevent truncation. Controllers explicitly hash plaintext input, including hash-shaped strings, and the model hashed cast provides an additional storage safeguard. Reset links expire after 60 minutes and are single-use; verification links expire after 60 minutes. Notifications are queued after commit and implement `ShouldBeEncrypted` so reset tokens are not stored as plaintext queue payloads. Protect APP_KEY, Redis, failed-job storage and mail delivery with appropriate production access controls.

Login is limited by normalized email/IP and IP, registration and recovery by IP, and verification/password/session actions by authenticated user. The password broker also throttles repeated reset emails. Responses never return reset tokens or verification URLs through the API. Audit records cover registration, login/logout, verification, password/profile/session changes and CLI role grants without recording passwords, tokens or private message contents.

## Administration

Register and verify an account normally. From the project directory, an operator with server access can grant the admin role:

```bash
docker compose exec backend php artisan app:grant-admin your-address@example.com
```

Reload the app to refresh the frontend role state, then visit `/admin`. Production requires `--force` as an explicit role-change flag. Grants are idempotent, audited, and require an active verified account. No admin is seeded and clients cannot submit role/verification/suspension fields. This role grants no conversation membership and no private message-read policy. Full administration/moderation arrives in Phase 9.

## Production configuration

Set APP_ENV=production, APP_DEBUG=false, stable APP_KEY, HTTPS APP_URL/FRONTEND_URL, SESSION_SECURE_COOKIE=true, the exact SANCTUM_STATEFUL_DOMAINS (host plus port where relevant), and a real SMTP provider. CORS permits only the configured FRONTEND_URL with credentials. Set TRUSTED_PROXIES only to known ingress/proxy IPs or CIDRs; leave it empty when there is no trusted reverse proxy. Confirm real client IP and HTTPS forwarding before relying on per-IP rate limits or signed links. Configure the gateway/ingress to preserve the trusted HTTPS scheme; the Phase 1 production template does not terminate TLS itself. Do not trust arbitrary forwarded headers or use '*' as a shortcut.

Mailpit, development credentials, local-only browser tests and the frontend development server are not production services. Production runtime deployment, real SMTP, TLS ingress and load testing remain unverified; follow deployment.md before a public launch. Admin suspension/reactivation actions and their all-session revocation belong to Phase 9; current middleware rejects suspended accounts and invalidates a session when it is used while suspended.

## Validation

Backend feature tests cover registration, role injection, hashing, authentication, session fixation, CSRF, origin restrictions, throttles, suspension, signed verification, invalid/expired reset tokens, reset reuse, private profile fields, self-only policies, email re-verification, password changes, owned-device revocation and CLI grants. The base test class refuses to bootstrap outside testing/in-memory SQLite; phpunit.xml forces both environment and server variables to override inherited Compose values.

Playwright uses the real API, Redis queue and Mailpit. The account lifecycle test creates unique `e2e-<uuid>@example.test` development accounts, verifies email, edits a profile, signs out a second browser session through a password change, logs out/in, resets the password from email and checks admin denial/cookie flags/browser storage. These test accounts and inbox messages remain local development fixtures. Never run this mutating test against a production instance; its host guard restricts it to localhost/127.0.0.1.

```bash
bash scripts/verify.sh
cd frontend
npm ci
npx playwright install chromium
E2E_BASE_URL=http://localhost:5173 npm run test:e2e
```

When system Chromium is available, also set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium. Auth tests default E2E_AUTH_BASE_URL to http://localhost:5173 and E2E_MAILPIT_URL to http://127.0.0.1:8026. These must match the development app/mail settings if ports are changed. E2E_SESSION_COOKIE may override the default cookie-name assertion. Browser test count includes the existing foundation and Reverb transport checks. No messaging functionality is claimed by these tests.
