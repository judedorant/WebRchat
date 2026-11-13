# Validation results · Phases 1–2

Executed in the current managed cloud instance on 2026-11-13. Results describe the development workflow and image builds, not a deployed production service or a restored fresh-task snapshot.

| Check | Result |
| --- | --- |
| PHP / framework | PHP 8.4 Docker toolchain; Laravel 13.42.0; locked Composer dependencies |
| Compose development | Eight services: backend, frontend, MySQL 8.4, Redis, Reverb, queue, Nginx and development Mailpit |
| Reusable setup | `CLOUD_PROXY_TRUST=1 bash scripts/setup.sh` passed, preserving the application key, existing environment files and data |
| PHPUnit | 34 backend tests; authentication/authorization and existing health/schema checks |
| Vitest / React Testing Library | 8 tests: health success/failure, guest and verification guards, admin denial, login transport/errors and unsafe verification URL rejection |
| Playwright / Chromium | 4 tests: foundation/navigation/theme/mobile; real Reverb handshake; complete account lifecycle; real CSRF denial |
| Account lifecycle | Real cookies, MySQL, Redis queue and SMTP/Mailpit used for signup, signed verification, profile edit, login/logout, password change, second-browser revocation and email-based recovery |
| MySQL constraints | Duplicate/reversed direct pairs, duplicate sender UUID, cross-conversation replies and self-blocks rejected; valid reply accepted; diagnostic rows rolled back |
| Queue | A real queued job processed and its cache result checked; verification/reset notifications delivered through the worker |
| Frontend | TypeScript/Vite production build passed; Oxlint passed |
| PHP style | Laravel Pint check passed |
| Production artifacts | Backend and compiled frontend/Nginx images built; production Compose configuration parsed successfully |

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

## Limits and remaining work

The chat dashboard starts in Phase 3. Message APIs, real-time application channels, groups, private uploads, search/notifications, admin moderation and the full security/load/deployment phase remain future work. Avatar upload is not part of Phase 2.

No real production SMTP, TLS ingress, production runtime, backups/restore, load testing or fresh-task snapshot restoration has been validated. The production template requires genuine secrets, SMTP and correctly trusted ingress/IP/HTTPS forwarding. Mailpit and synthetic `e2e-<uuid>@example.test` account/mail fixtures are development-only. No privileged account or complete demo dataset is seeded.

Phase 1 was pushed to the GitHub main branch as a separate initial commit. Phase 2 is kept in a subsequent commit so both milestones remain reviewable. Local .env files, installed dependencies, databases and runtime outputs are excluded from Git. Reusable environment settings are a draft; review/save/publish through the environment UI to update future task snapshots.
