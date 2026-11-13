# Phase 1 validation

Executed in the current managed cloud instance on 2026-11-13. These results do not establish fresh-task snapshot restoration or a public production deployment.

| Check | Result |
| --- | --- |
| PHP development image | Built successfully; PHP 8.4 with MySQL/SQLite PDO, mbstring, intl, zip, bcmath and pcntl |
| Laravel / Composer | Laravel 13.42.0 installed; Composer strict validation passed, no dependency advisories reported by Composer |
| Development Compose | Configuration valid; backend, frontend, MySQL, Redis, Reverb, queue and Nginx all healthy |
| Repeatable setup | `CLOUD_PROXY_TRUST=1 ./scripts/setup.sh` completed successfully on the prepared checkout; migrations were retained and role seeding repeated safely |
| PHPUnit | 9 tests passed, 31 assertions; in-memory SQLite, forced test environment, test-only app key |
| MySQL constraint smoke | Real MySQL 8.4 accepted a valid reply and rejected duplicate direct pairs, reversed pairs, duplicate sender/client UUID, cross-conversation replies and self-blocks; all diagnostic rows rolled back |
| SQLite migrations | Migrate, full rollback and reapply passed using a separate disposable SQLite file |
| Queue | Redis-dispatched job executed by the queue worker; cached result verified |
| API routing | Real direct Nginx and Vite-proxied `/api/v1/health` requests returned HTTP 200 and database/cache readiness |
| Dependency failure | Redis stopped: API returned HTTP 503 with safe dependency state; Redis restarted and a fresh API request returned HTTP 200 |
| Frontend build | TypeScript and Vite production build passed |
| Vitest / RTL | 2 tests passed: successful readiness and transport failure UI |
| Lint / formatting | Oxlint: zero warnings/errors; Laravel Pint check passed |
| Chromium / Playwright | 2 tests passed: real API readiness, roadmap navigation, theme switch, 390px layout overflow check; real Reverb WebSocket connection-established handshake |
| Production artifacts | PHP and compiled frontend/Nginx images built successfully; production Compose configuration valid |

## Diagnosed and corrected during implementation

- Host PHP/Composer are absent. The Docker PHP image provides the supported toolchain; no host terminal restart or PHP installer is required.
- Composer's default `api.github.com` archive endpoint was denied. The lockfile now uses the official GitHub `codeload.github.com` archive endpoint at the same commits and preserves checksums. TLS and package verification remain enabled. Initial Git source cloning was abandoned because it was slow; the final archive install succeeded.
- Compose runtime environment values initially overrode PHPUnit defaults. All PHPUnit environment settings now force the isolated test values. Do not remove this isolation or use development MySQL with `RefreshDatabase`.
- SQLite rollback initially failed on indexes for dropped user columns. The rollback removes indexes explicitly before removing columns.
- Nginx initially retained a recreated backend's address. Docker DNS resolution now refreshes upstream addresses; repeated setup and requests succeed.
- Reverb exited cleanly after Redis restart because its cache-backed restart marker changed. PHP services now have a restart policy so this planned process exit recovers automatically.
- Container-local BusyBox health requests initially used the inherited outbound proxy. Internal loopback health probes now explicitly disable proxy use for those local requests only.
- Automatic review rejected deleting the scaffold's nested Git metadata. It was preserved at `/workspace/setup-backups/webrchat-laravel-upstream.git` instead; no history was destroyed. The main project remains in the original checkout with its new files available for review.

## Limits and next work

No registration/login, private chat, delivery/read receipts, authorized application channels, group actions, attachment handling or administration is implemented. The Reverb handshake tests transport readiness, not messaging authorization or message delivery. Queue health reports backlog connectivity; the separate queue smoke command verifies actual job execution. The foundation schema's constraints do not replace application authorization policies.

Production runtime startup, TLS ingress, email delivery, backups/restore, load testing, all later feature suites and fresh-environment snapshot restoration have not been tested. The production Compose file is a template; replace all development placeholders and complete later security phases before public use. No full demo messaging dataset is seeded in Phase 1.

Reusable `install_script` and `start_skill` were saved in the environment configuration draft. Saving does not execute or publish the draft. Review/save the settings and publish through the environment UI when ready.
