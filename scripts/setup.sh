#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] || cp .env.example .env
[[ -f backend/.env ]] || cp backend/.env.example backend/.env
export LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)"
compose=(docker compose)
if [[ "${CLOUD_PROXY_TRUST:-0}" == 1 ]]; then
  compose+=(-f compose.yaml -f compose.cloud.yaml)
fi
"${compose[@]}" build backend frontend
"${compose[@]}" up -d --wait mysql redis
# Container writes to the bind mount as the current developer, not root.
run=("${compose[@]}" run --rm --no-deps --user "$(id -u):$(id -g)" -e COMPOSER_HOME=/tmp/composer)
if [[ "${CLOUD_PROXY_TRUST:-0}" == 1 ]]; then
  run+=(-v /etc/ssl/certs/ca-certificates.crt:/run/ca.pem:ro -e COMPOSER_CAFILE=/run/ca.pem -e GIT_SSL_CAINFO=/run/ca.pem)
fi
run+=(backend)
# composer.lock uses GitHub's official codeload archives at the exact locked commits.
"${run[@]}" composer install --no-interaction --prefer-dist
if ! grep -Eq '^APP_KEY=.+$' backend/.env; then
  "${run[@]}" php artisan key:generate --no-interaction
fi
"${run[@]}" php artisan migrate --no-interaction
"${run[@]}" php artisan db:seed --class=RoleSeeder --no-interaction
"${compose[@]}" up -d --wait
http_address="$(docker compose port nginx 80)"
curl --fail --silent --show-error "http://${http_address}/api/v1/health"
printf '\nDevelopment stack is running. See README.md for verification and shutdown.\n'
