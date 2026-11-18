# Validation results · Phases 1–8

## Phase 6 completion and Phases 7–8 · 2026-11-18

| Check | Result |
| --- | --- |
| Backend regression | 84 PHPUnit tests passed, 1,059 assertions; includes group role/history/image boundaries, uploads/download authorization, UUID conflicts, reactions, reply scope, author editing/deletion, tombstone privacy, report evidence, notification ownership, search pagination and bidirectional blocks |
| Frontend regression | 56 Vitest / React Testing Library tests passed, including the viewport subscription race, upload retry identity, account changes, media display, reactions, report/block confirmations and microphone permission cancellation |
| Browser regression | All 12 Chromium scenarios passed in the final run (2.8 minutes), covering account lifecycle, dashboard/mobile navigation, group permissions, persistent direct messages, live delivery/recovery and rich media/safety |
| Browser integration | Combined media/safety scenario passed with real MySQL, Redis, Reverb and Chromium: private text/image uploads, image decode, live reactions, browser-encoded microphone recording and recipient playback, notifications, message/conversation search, reply/edit/delete, reporting, blocking and unblocking |
| Schema and infrastructure | Additive nullable report-evidence migration applied to MySQL; existing schema/constraint smoke, real queue job and API health checks passed; eight services healthy |
| Build | TypeScript and production Vite build passed; WebSocket clients load on demand; main bundle approximately 412 kB with no bundle-size warning |
| Quality | Oxlint zero warnings/errors; Laravel Pint and Git whitespace checks passed |

The Phase 6 group browser scenario verifies desktop/mobile layouts, concurrent ownership transfer, exactly one owner, admin/member differences, private group images, admission/history, leaving/removal and live removal of an open settings dialog. The group backend suite includes 12 tests. The earlier mobile-heading assertion now scopes to the chat region. Authentication recovery passed on rerun; its storage assertion permits only Pusher's public transport cache keys and continues to reject any account/token/draft storage.

The final browser regression also exposed a viewport subscription race: a resize between initial render and listener attachment could leave the desktop details panel over a mobile chat. The viewport hook now uses React's external-store subscription so it rechecks the current width after subscribing, with a dedicated regression test.

Private media stays on the local private disk. Download routes reauthorize current membership, and deleted messages return body-free/media-free tombstones. Reports retain only the selected message snapshot after author edit/delete; administrators still have no general private-content access. Browser microphone tests use Chromium's synthetic audio input, the real MediaRecorder encoder and actual authorized audio playback. This verifies the browser path, not physical microphone hardware. Operating-system push/email notifications, malware scanning, storage retention and production deployment review are outside Phases 7–8; in-app notifications are implemented.

All work is local development validation. No runtime dependency or credential change was required. Detailed endpoints and behavior are in [dashboard](dashboard.md).

## Phase 5 · 2026-11-17

| Check | Result |
| --- | --- |
| Backend regression | 56 PHPUnit tests passed, including 11 realtime tests covering channel/session scope, admin denial, blocks, validation, monotonic receipts, commit/rollback timing, current recipient resolution, catch-up scopes and independent throttles |
| Frontend regression | 38 Vitest / React Testing Library tests passed, including authorization payloads, session cleanup, presence changes, typing expiry, heartbeat recovery, multi-page catch-up, visible-only reads, inbox delivery and preserving scroll position when reading older messages |
| Browser regression | The nine existing Chromium cases passed. The new full realtime scenario also passed after its final presence locator correction |
| Real live flow | Two verified accounts exchanged messages without refresh; typing appeared then expired; actual presence joined/left; inbox/history delivery and read acknowledgements persisted through MySQL |
| Visibility boundary | The browser scenario simulated hidden/visible document state while using real APIs/WebSockets; a hidden message stayed Delivered and became Read only after visibility returned |
| Reconnection | Chromium offline/online transitions retained REST drafts/history and fetched every missed message on recovery; an API response deliberately dropped after persistence was retried with the same UUID and produced one message/bubble |
| Transport privacy | Captured Reverb frames contained ID-only chat signals and no message text; content continued through authorized REST reads |
| Build and quality | TypeScript/Vite production build passed; Oxlint reported zero warnings/errors; Laravel Pint passed; Git whitespace check passed |
| Infrastructure | Eight development services healthy; existing MySQL schema/constraint and real queue-job smoke checks passed |

The initial live test exposed internal Reverb publication being sent through the managed HTTP proxy. The broadcasting client now preserves inherited external proxies while exempting Docker/loopback service hosts. A second finding was Laravel's generic authenticated throttle sharing a request bucket across routes; realtime routes now have named independent budgets. Recovery also uses the existing Pusher transport's `connect()` rather than Echo's `connect()`, which constructs a new connector and loses the old channel registrations. Regression tests cover these recovery and budget boundaries. Test-generated failures from the initial proxy diagnosis may remain in historical logs; the final live scenario's signal jobs completed successfully.

The new runtime dependencies are locked `laravel-echo` and `pusher-js`. No database migration or credential changes were needed. Reverb's public key is provided by the authenticated heartbeat endpoint; its secret is never returned to the browser. Authentication tokens and drafts remain out of browser storage.

The full browser suite can exceed the signup throttle; its account helper honors the real `Retry-After` header. Run it with one worker using the command below. This is development validation, not a production deployment. Group conversations remain Phase 6. Presence is scoped to loaded/selected conversations, and abrupt network loss may require Reverb's activity timeout before a peer disappears. Existing presence subscriptions are not claimed to terminate instantly after server-side session revocation; private queued recipients and all content reads recheck current authorization.

## Phase 4 · 2026-11-17

Phase 3 was reviewed before implementation: 34 backend tests, 20 frontend tests, the production build and all 8 existing Chromium tests passed. The default PHPUnit command initially failed because it referenced an absent, empty `tests/Unit` directory; the stale suite entry was removed. No test files were deleted.

Phase 4 validation used the running development stack, with feature tests isolated in in-memory SQLite and browser requests backed by real MySQL/Redis/Mailpit:

| Check | Result |
| --- | --- |
| Backend regression | 45 tests passed; the 11 messaging tests also passed independently after final inbox-order/cursor changes |
| Frontend regression | 28 Vitest / React Testing Library tests passed |
| Browser regression | All 9 Chromium tests passed; the expanded messaging scenario passed again after account-switch guards were added |
| Direct message flow | Two verified accounts sent/replied, reloaded persisted history and loaded older messages; a verified outsider could neither read nor send |
| MySQL concurrency | Opposite-direction concurrent creation of a new pair returned one 201 and one 200 with the same ID; five simultaneous same-UUID sends returned exactly one 201 and one shared message ID |
| Idempotency | Identical retries returned 200; changed content or conversation returned 409; soft-deleted originals cannot be reused; network/rate-limit retries retain their UUID |
| Security | Session-derived sender, protected membership, no admin bypass, revoked/left/unavailable participants, both block directions, forged sender fields, CSRF rejection, Unicode/text validation, safe text rendering and stale-account request assertions covered |
| Pagination and queries | Cursor histories remained gap-free while new messages arrived; malformed cursors rejected; inbox query-count test remained bounded as rows increased; older conversations moved to the top after new activity |
| Build and style | TypeScript/Vite production build passed; Oxlint reported zero warnings/errors; Laravel Pint passed |
| Infrastructure | Eight services healthy; MySQL schema smoke and real queue-job processing passed |

`bash scripts/verify.sh` runs the backend suite, MySQL migration/schema and queue checks, API readiness, frontend build/tests/lint. Run browser tests with:

```bash
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium E2E_BASE_URL=http://localhost:5173 npm run test:e2e -- --workers=1
```

The browser helper respects the registration endpoint's real `Retry-After` header when the full suite exceeds five signups per minute. No production throttles were relaxed. Frontend browser-test packages were installed separately under `/tmp` in this environment because the Docker dependency mount owns the checkout's `node_modules` directory; the same committed test sources/config were used.

Laravel Boost is already installed. Its guideline installer ran, but the hosted documentation search endpoint was denied by the environment proxy. The matching installed framework APIs were inspected locally. Generated assistant-guideline changes were restored; no dependency versions changed.

This is a verified development environment, not a production deployment. No Phase 5 application WebSocket channels, live delivery, typing, presence or read receipts were added. Read history explicitly through refresh controls. The UI's “Saved” label means persistence, not delivery/read acknowledgement.

---

## Historical validation · Phases 1–3

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
