# Validation results · Phases 1–3

Executed in the current managed cloud instance on 2026-11-13. Results describe the development workflow and image builds, not a deployed production service or a restored fresh-task snapshot.

| Check | Result |
| --- | --- |
| PHP / framework | PHP 8.4 Docker toolchain; Laravel 13.42.0; locked Composer dependencies |
| Compose development | Eight services healthy: backend, frontend, MySQL 8.4, Redis, Reverb, queue, Nginx and development Mailpit |
| Reusable setup | `CLOUD_PROXY_TRUST=1 bash scripts/setup.sh` passed, preserving the application key, existing environment files and data |
| PHPUnit | 34 backend tests; authentication/authorization and existing health/schema checks |
| Vitest / React Testing Library | 20 tests: existing authentication/health checks plus opt-in dashboard preview, filters/unread state, unsent drafts, group/image details, directory paging/retry/stale responses, invalid routes, admin navigation and identity isolation |
| Playwright / Chromium | 8 tests: existing foundation, Reverb, complete authentication lifecycle and CSRF checks, plus four desktop/mobile dashboard, real directory, modal keyboard/focus and account-switch privacy checks |
| Account lifecycle | Real cookies, MySQL, Redis queue and SMTP/Mailpit used for signup, signed verification, profile edit, login/logout, password change, second-browser revocation and email-based recovery |
| MySQL constraints | Duplicate/reversed direct pairs, duplicate sender UUID, cross-conversation replies and self-blocks rejected; valid reply accepted; diagnostic rows rolled back |
| Queue | A real queued job processed and its cache result checked; verification/reset notifications delivered through the worker |
| Frontend | TypeScript/Vite production build passed; Oxlint passed |
| PHP style | Laravel Pint check passed |
| Production artifacts | Backend image retained from Phase 2; updated frontend/Nginx image built; production Compose parsed successfully |
| Production frontend component smoke | Temporary image container on the development network: real SPA deep links, all three SVG assets, API health proxy, protected-route sign-in rendering and `/ws/app/{key}` WebSocket handshake passed; temporary container removed |

Phase 1 also validated SQLite migrate/rollback/reapply and Redis outage HTTP 503/recovery. The Phase 2 session migration ran on MySQL and is exercised by the isolated SQLite feature suite. No message delivery, typing, read receipts, moderation or application-channel authorization is claimed by a Reverb transport handshake.

## Security checks

The backend suite covers registration role injection, bcrypt byte limits, hash-shaped input being hashed as plaintext, password hashing, session ID regeneration, guest access, origin/CSRF rejection, login throttling, suspended accounts, session invalidation, signed/expired/mismatched verification, generic recovery responses, invalid/expired/single-use reset tokens, email changes, password changes, private profile fields, self-only policies, admin role enforcement, session ownership and CLI grants.

An inherited Compose `APP_ENV=local` was still visible through PHP server variables despite the previous env-only PHPUnit overrides. Phase 2 forces both environment and server variables and adds a base-test startup guard before RefreshDatabase traits run: tests must use testing + SQLite + :memory:. This corrects the earlier isolation assumption and prevents accidental persistent-database refreshes. The dedicated CSRF test switches only the application environment after the guarded isolated test application has bootstrapped so it can exercise the real CSRF middleware.

JSON handling is forced for API middleware as well as exception rendering. This avoids missing-login/verification HTML redirects when a caller omits Accept. Reset/verification notifications implement ShouldBeEncrypted and are queued after commit. Cookie attributes and absence of localStorage authentication data were checked in a real browser.

## Diagnosed setup issues

- Host PHP/Composer are unavailable; the Docker image supplies them.
- `api.github.com` archive downloads were denied. The lockfile uses the official codeload endpoint at the same commits, preserving checksums and TLS verification.
- SQLite rollback required explicit index removal before dropping user columns.
- Nginx needed refreshed Docker DNS upstream addresses after backend recreation.
- Container-local BusyBox health probes needed explicit local proxy bypass, only for loopback requests.
- Reverb needs its restart policy to recover from cache-backed restart-marker changes after Redis restart.
- The Laravel 13 cookie name uses a hyphen; the browser assertion now checks the actual configured default name rather than an obsolete underscore convention.

## Phase 3 findings resolved

- The old production `/app/` WebSocket location collided with dashboard deep links. Public gateway WebSocket traffic now uses `/ws/`, rewritten to Reverb's `/app/{key}` endpoint; UI routes retain `/app/conversations/*`. Server-side event publishing remains on the private Reverb service.
- Restrictive checkout permissions propagated to public SVG files. The production frontend image grants read/traverse access only to the intended public artifact directory, so Nginx can serve images and bundles.
- Modal close needed explicit restoration to its trigger, and Escape must not also close the details panel behind an open modal. An explicit Tab/Shift+Tab wrap complements native dialog behavior. These were checked in real Chromium, including repeated Tab traversal on mobile.
- A stale user-search response could overwrite a newer query without a post-response cancellation check. Cancellation is now checked before applying either initial or paginated directory results; a deferred-response regression test verifies this.

## Limits and remaining work

The Phase 3 dashboard is implemented with an empty default inbox, an opt-in fictional design preview and unsent real-contact drafts. See dashboard.md. Persistent message APIs, real-time application channels, group actions, private uploads, server-side message search/notifications, admin moderation and the full security/load/deployment phase remain future work. Avatar upload is not part of Phase 2.

No real production SMTP, TLS ingress, complete production-stack runtime, backups/restore, load testing or fresh-task snapshot restoration has been validated. The production frontend smoke used development API/Reverb dependencies and does not establish a full production deployment. The production template requires genuine secrets, SMTP and correctly trusted ingress/IP/HTTPS forwarding. Mailpit and synthetic `e2e-<uuid>@example.test` account/mail fixtures are development-only. No privileged account or complete demo dataset is seeded.

Phase 1 was pushed to the GitHub main branch as a separate initial commit. Phases 2 and 3 are kept in subsequent commits so each milestone remains reviewable. Local .env files, installed dependencies, databases and runtime outputs are excluded from Git. Reusable environment settings are a draft; review/save/publish through the environment UI to update future task snapshots.
