# WebRchat architecture · Phases 1–8

This release includes the runnable foundation, account system and responsive chat workspace, not a completed chat product. Membership-scoped direct/group messaging, private media uploads, replies/edit/delete, notifications, search, blocking and reporting are implemented. See authentication.md for the implemented Phase 2 design. No messages, identities, or contact lists shown by the UI are fabricated. The workspace reports actual API readiness.

## Boundaries

```mermaid
flowchart LR
    Browser[React SPA / TypeScript] -->|same-origin cookies, /api/v1| Web[Nginx]
    Web --> PHP[Laravel 13 / PHP 8.4]
    PHP --> DB[(MySQL 8.4)]
    PHP --> Cache[(Redis)]
    Worker[Laravel queue worker] --> Cache
    Worker --> DB
    PHP -->|after-commit queued signals| Reverb[Laravel Reverb]
    Browser <-->|authorized Echo subscriptions| Reverb
```

The Vite development server proxies `/api` and `/sanctum` to Nginx. Production serves compiled React assets and forwards those paths to PHP-FPM. This keeps the intended Sanctum SPA authentication same-origin. Axios sends cookies and the XSRF header; there are no bearer tokens or authentication values in browser storage. Session cookies are HTTP-only and use SameSite=Lax; HTTPS deployments must enable secure cookies. Phase 2 implements CSRF initialization, auth endpoints, verification, policies, protected routes and login throttles.

Backend structure uses Laravel's standard application, HTTP, model, policy, event and job boundaries. Add domain actions/services when a use case needs a transaction rather than introducing empty abstractions. Frontend transport is in `src/lib`, preferences in `src/store`, and routes in `src/App.tsx`. Move feature code into feature directories as those phases are implemented.

Sanctum, Reverb, Echo and Predis support authenticated REST and live updates. Phase 5 authorizes a private channel for each exact device session and presence channels for available direct-conversation members. Unregistered channels are denied. Events contain only IDs and ephemeral typing state; clients refetch message content through REST membership policies. Revoked/expired device sessions are excluded when queued events resolve their recipients. A Reverb port probe is only process liveness, not proof of messaging behavior. Queue health checks measure backlog connectivity; queue execution is verified separately during setup.

## Data model

| Tables | Purpose / constraints |
| --- | --- |
| users, roles, user_roles | Soft-deleted identities, suspension and verification fields; unique role membership |
| conversations | Direct or group; sorted direct-user pair unique at the database layer |
| conversation_participants | Unique membership and owner/admin/member role, notification preferences, joined/left times |
| messages | Sender-scoped unique client UUID for retries; `(conversation_id, id)` cursor index; same-conversation reply FK; soft deletion |
| message_attachments | Private storage paths, original names, detected MIME, byte sizes, image/file/voice kind |
| message_reactions | Unique message/user/emoji combination |
| message_reads | Unique message/user receipt, delivered and read timestamps |
| user_blocks | Unique directional block; cannot block self |
| user_reports | Reported user/message reference, reporter, review state and assigned moderator |
| notifications | Laravel database notification shape with explicit user FK |
| audit_logs | Actor, action, subject identifier, metadata, request ID; no default message content |
| user_sessions | Revocable device references, expiry, activity and user ownership; Redis session IDs are not exposed |
| platform_settings | Typed JSON values for future admin-managed settings |

Laravel's password reset, sessions, jobs, failed jobs and cache tables support infrastructure. Sanctum's token migration is supplied by the package but Phase 2 will use SPA cookies. No public attachment symlink is created. Database checks enforce ordered direct pairs and matching direct/group structure. Reply references use a composite FK so replies cannot cross conversations. MySQL migration tests are required because SQLite cannot represent every MySQL behavior.

Soft deletes preserve references. Hard-deletion/retention workflows must deliberately remove dependent data in a transaction. Participant membership, group ownership transitions, block enforcement, read permissions and private attachment access are enforced by policies and transactional actions; a foreign key alone is not authorization. Reads must use membership-scoped queries with eager loading. History uses a stable message ID cursor within a conversation; no offset pagination. Persist before dispatch, dispatch after transaction commit, and deduplicate on sender/client UUID. A retry with a UUID but different content or conversation should be a conflict rather than returning unrelated content.

## Privacy and moderation

Administrators must not receive implicit membership or arbitrary message-read privileges. Reports now preserve selected message evidence; Phase 9 will permit moderators to review only that evidence through an audited, report-scoped policy. Record moderator, report ID, action, reason and time; limit retention and avoid copying entire conversations to audit metadata. Resolve report state with an explicit action. Private channels, downloads, edits and deletions must authorize independently. Existing middleware denies suspended accounts; Phase 9 adds administrative suspension/reactivation controls.

## Subsequent phases

2. **Implemented:** authentication, profiles, roles, verification, recovery and session management.
3. **Implemented:** responsive chat dashboard, navigation and loading/empty/error states; opt-in fictional preview. See dashboard.md.
4. **Implemented:** authorized direct messaging, REST Resources/Form Requests, sender UUID idempotency, cursor history and dashboard persistence. Pair creation and sends acquire user locks in ascending ID order; database unique constraints provide a second guard against duplicates. Existing blocks in either direction prohibit sends and creation.
5. **Implemented:** session-scoped private channels, authorized presence, Echo/Reverb delivery, server-authorized expiring typing, visible-message read receipts, inbox delivery acknowledgements and reconnect catch-up.
6. **Implemented:** groups, owner/admin/member permissions, serialized ownership transfers, add/remove/leave/rejoin, private group images and persistent membership notices.
7. **Implemented:** private validated uploads, image/file/voice playback, emoji, live reactions, replies and author editing/deletion.
8. **Implemented:** authorized message/conversation search, private notifications, bidirectional direct-message blocking and reports with selected evidence snapshots.
9. Aggregate admin statistics, settings, scoped moderation and audit UI.
10. Full functional/E2E coverage, abuse controls, load tests, backups and deployment review.

The realistic 20-user/1,000-message demo dataset belongs with implemented messaging; it must be guarded to local/testing. Phase 1 seeds only the admin/user role vocabulary, without privileged users or passwords. Guest means an unauthenticated visitor and is not a database role.
