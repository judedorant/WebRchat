# WebRchat backend

Laravel 13 API with Sanctum cookie authentication, account verification/recovery, profile policies, role middleware and revocable sessions. Setup and Docker commands are in the [project README](../README.md); account routes and security design are documented in [authentication.md](../docs/authentication.md).

Use `docker compose exec -T backend` for PHP commands in the managed cloud environment. Messaging starts in later phases. PHPUnit refuses to run against a persistent database; testing requires in-memory SQLite.
