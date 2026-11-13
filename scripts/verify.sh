#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose config --quiet
docker compose exec -T backend php artisan test
docker compose exec -T backend php artisan migrate:status
docker compose exec -T backend php artisan app:schema-smoke
docker compose exec -T backend php artisan app:health
# queue:work --once must consume this job, not just hold a PID.
docker compose exec -T backend php artisan app:queue-smoke
http_address="$(docker compose port nginx 80)"
curl --fail --silent --show-error "http://${http_address}/api/v1/health"
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm test
docker compose exec -T frontend npm run lint
