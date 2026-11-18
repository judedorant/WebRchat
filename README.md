# WebRchat

A Laravel 13 + React/TypeScript real-time chat project. **Phases 1–8**: Docker infrastructure, normalized schema, responsive foundation UI, cookie-based authentication, email verification/recovery, profiles, revocable sessions, role-based access and a responsive chat workspace. Direct and group text conversations, live delivery, typing, scoped presence, unread counts and delivered/read receipts are implemented. Groups include owner/admin/member permissions, member management, private images and membership updates. Private image/file/voice uploads, emoji, live reactions, replies, author editing/deletion, persistent notifications, server history/conversation search, blocking and reporting are implemented.

For desktop installation and everyday use, see the [User manual](docs/user-manual.md).

## Quick start

For a new local checkout:

```bash
git clone https://github.com/judedorant/WebRchat.git
cd WebRchat
```

Prerequisites: Docker Engine / Docker Desktop with Compose v2, curl, Bash and Git. Allow approximately 4 GB RAM and several GB of disk for images/builds. No host PHP or Node installation is required with Docker.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
# Edit both files; keep the database credentials consistent.
./scripts/setup.sh
```

The script builds images, installs locked PHP dependencies, generates a missing local app key, migrates MySQL, seeds the role vocabulary and starts all eight development services. It does not reset data or regenerate an existing key. Subsequent starts:

```bash
docker compose up -d --wait
```

Open the frontend on port **5173**, API/Nginx on port **8080**, Reverb on port **8081**. Ports bind to loopback for local development. These are local development ports, not cloud preview links. The UI checks `/api/v1/health` through Vite's proxy; the response is `503` when MySQL or Redis is unavailable, otherwise `200` with `{ "data": { "status": "ok", "service": "WebRchat API", "checks": { "database": "ready", "cache": "ready" } } }`. `/up` is Laravel's lighter framework liveness route. Authentication/profile APIs and membership-scoped direct conversation/message APIs are implemented. Verified accounts enter the dashboard at `/app`; use **Explore design preview** to view fictional sample chats, or **New message** to send a saved direct text message to a verified member. Replies appear live through Reverb; refresh controls remain as a fallback. See [dashboard behavior](docs/dashboard.md) for the preview boundary. Use **Get started** to register and the local Mailpit inbox on port **8026** to verify your email. See [authentication](docs/authentication.md) for the complete account workflow.

```bash
./scripts/verify.sh
# Browser tests, with frontend/API already running:
cd frontend
npm ci
npx playwright install chromium
E2E_BASE_URL=http://localhost:5173 npm run test:e2e
```

On a machine with system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` instead of downloading a browser. For custom Reverb keys/ports, set `E2E_REVERB_URL` to the WebSocket URL containing your public app key. Playwright verifies a real Reverb handshake as well as the frontend. Playwright assertions require a real healthy API; they do not mock the network. Backend PHPUnit uses isolated in-memory SQLite for fast schema tests; also run the MySQL integration check below. Never point destructive test operations at the development or production database.

## Commands

```bash
docker compose exec backend php artisan migrate:status
docker compose exec backend php artisan db:seed --class=RoleSeeder
# Real MySQL constraint smoke check: isolated transaction, rolled back.
docker compose exec backend php artisan app:schema-smoke
docker compose exec backend php artisan app:queue-smoke
docker compose exec backend php artisan test
docker compose exec backend vendor/bin/pint --test
docker compose logs --tail=100 backend queue reverb nginx
docker compose stop                 # retain data and containers
docker compose down                 # retain named data volumes
# docker compose down -v destroys local DB/Redis data; use only deliberately.
```

On Linux with a UID other than 1000, export `LOCAL_UID=$(id -u)` and `LOCAL_GID=$(id -g)` before running Compose directly; `setup.sh` does this automatically.

After a PHP dependency change, run Composer in the backend container. After a frontend lockfile change, run `docker compose exec frontend npm ci`; the named Node dependency volume survives image rebuilds. If you run host npm instead, use Node 24 LTS and `npm ci` in `frontend`. The API proxy defaults to port 8000 for host development; use `API_PROXY_TARGET=http://127.0.0.1:8080 npm run dev` to connect to Docker Nginx. Do not run Laravel's starter Composer frontend scripts; React is a separate project.

## Managed cloud setup

The HTTPS proxy CA can be passed as a BuildKit secret, never baked into an image. Use:

```bash
CLOUD_PROXY_TRUST=1 ./scripts/setup.sh
```

This selects `compose.cloud.yaml`, mounts the system trust bundle only for Composer network operations, and downloads the lockfile's official GitHub codeload archives. Package registries, Debian repositories, Docker registry/CDN domains and GitHub HTTPS Git access are required. No extra credentials are needed for this public project. Do not disable TLS, checksum or package-signature verification. The lockfile uses `codeload.github.com` at the exact original commits rather than the API redirect. After a dependency update, use `php scripts/normalize-composer-archives.php` from the repository root before installing if `api.github.com` remains blocked. It preserves locked refs and checksums; it is not required on networks permitting the API host.

Each cloud task is already isolated. Use the existing `/workspace/WebRchat` checkout; do not create a Git worktree unless explicitly requested. Running containers/processes must be restarted after a snapshot restore. See environment startup instructions and verify health rather than assuming a previous process survived.

## Repository layout

```text
backend/                  Laravel API, schema, PHPUnit tests, infrastructure config
frontend/                 React + Vite + TypeScript, Tailwind, Zustand, Axios, Router
  src/lib/                Cookie-aware API transport
  src/store/              UI preferences (no authentication persistence)
  e2e/                    Playwright smoke test
compose.yaml              Development services and health checks
compose.cloud.yaml        Optional build CA secret for managed cloud
compose.production.yaml   Production deployment template
docker/php/              PHP-FPM development / production image
docker/nginx/            API, static SPA, WebSocket and gateway configs
scripts/                  Repeatable setup and validation
docs/architecture.md     Boundaries, data model, privacy and phased roadmap
docs/deployment.md       Release procedure and remaining launch requirements
```

Sanctum cookie authentication and queued verification/recovery mail are implemented. Session-scoped private update channels and membership-authorized presence channels are enabled. Roles are seeded without passwords or admin accounts; use the documented CLI grant for an existing verified account. The full demo dataset remains scheduled for the final development/testing validation phase.

See [architecture](docs/architecture.md), [deployment](docs/deployment.md) and [validation results](docs/validation.md). Phases 1–8 are implemented. Phase 9 adds administration, statistics and scoped moderation.
