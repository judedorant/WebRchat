# Phases 3–8: chat workspace and direct messaging

Sign in with a verified account and open `/app`. This release provides the responsive dashboard, navigation and saved direct text conversations. The normal workspace uses membership-scoped conversation and message APIs; the opt-in fictional design preview stays isolated from writes.

## What works

- A full-height sidebar, main chat panel and optional contact/group details panel. On wide screens the details panel opens by default; on tablet/phone it is an optional overlay. Mobile switches between the list and selected thread with a back button and browser navigation.
- Conversation search and All / Unread / Groups filters, selected-row highlighting, unread badge layouts, per-thread temporary drafts and deep-linked navigation.
- Sidebar profile/settings, sign out and light/dark switching use the existing account system. Dashboard routes are protected by the verified-user frontend guard; all directory requests also pass the existing backend session/verification/policy checks.
- A new-message dialog searches real verified profiles through `GET /api/v1/users`, excludes the current account, handles cursor pagination, cancels superseded requests, ignores stale responses, and shows loading skeletons, empty results and retryable errors.
- Selecting a real member opens an existing loaded direct conversation or a draft. The first Send opens/reuses the canonical direct pair and saves the message; navigation then uses the server conversation ID. A contact draft refresh still loads only the public profile until a message is sent.
- Native dialogs with explicit Tab/Shift+Tab wrapping provide a focus trap, Escape/backdrop/close-button dismissal and explicit focus restoration. Contact details support Escape and return focus to their toggle; an open modal takes precedence over the underlying details panel. Controls use visible focus styles and accessible names. Reduced-motion preferences disable transitions/animations.

## Honest preview behavior

The normal conversation list loads only saved conversations for the signed-in member and starts empty for new accounts. **Explore design preview** (or **Design preview** in the mobile sidebar) opts into seven clearly labeled fictional direct/group conversations. The preview includes sample bubbles, image/file cards, reaction/read-status decoration, shared media and group-member layouts. It never inserts records or contacts into MySQL. Presence and unread/read/reaction values in this mode are sample values, not live status.

The preview is marked in the sidebar, conversation header, message-history banner and contact/shared-file details. Its images are original local SVG illustrations; opening them shows a sample-image dialog. Sample files have no fake download links. Calls remain unavailable. Attachments, emoji picking, voice recording and reactions are enabled for real conversations and disabled in the fictional preview. Real delivered/read receipts exist only for saved conversations; preview receipts remain sample decoration.

Inside the fictional preview, **Send remains disabled**. In a real direct conversation, Send persists a text message and shows it only after the API confirms the save. Drafts are limited to 4,000 characters and remain only in the tab's memory. They survive thread navigation within that tab, but not reload or logout. A real selected member is labeled as a draft; no last-seen or online status is invented for real profiles.

## Routes and state

| Route | Meaning |
| --- | --- |
| /app | Conversation list / empty workspace |
| /app/conversations/demo-maya (and other explicit demo IDs) | Fictional conversation only while preview mode is enabled |
| /app/conversations/contact-{id} | Unsent draft addressed to an authorized public user profile |
| /app/conversations/{numeric-id} | Saved direct conversation; membership checked by the API |

Production Nginx serves `/app/conversations/*` through the SPA fallback. WebSocket connections through that gateway use `/ws/app/{key}`; `/ws` is stripped before forwarding to Reverb. The directly published development Reverb port retains `/app/{key}`. Echo uses the same-origin `/ws` gateway in development and production. Vite forwards it to Reverb; production Nginx strips the prefix.

Unrecognized routes display an unavailable state. A direct demo link after reload requires opting into preview again. A real contact deep link checks the existing server policy; unavailable/unauthorized profiles do not gain a fabricated conversation. The `demo-` and `contact-` route prefixes remain temporary UI identifiers. Numeric IDs resolve saved conversations through membership-scoped APIs; public profiles never grant access to a conversation.

`src/features/chat` owns the workspace components, types, original preview fixtures, CSS, modal, avatar and people picker. `store.ts` uses Zustand without persistence and clears drafts, public contact cache, filters, unread preview state and preview mode whenever the authenticated identity changes. No message draft or authentication value is written to browser storage. Theme preferences use the existing in-memory preference store.

The directory fetch owns AbortControllers and checks cancellation before applying results. Search input is debounced; late results cannot overwrite a newer query. IDs are passed only to the known user-profile API, not interpolated into arbitrary external URLs.

## Verification

```bash
bash scripts/verify.sh
cd frontend
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium E2E_BASE_URL=http://localhost:5173 npm run test:e2e
```

Omit the Chromium executable override if using the Playwright-installed browser. Real API, Redis/queue and Mailpit services must be running; keep APP_URL and FRONTEND_URL aligned with localhost. Browser account helpers are restricted to loopback and create synthetic local accounts. Do not recreate services or edit the live frontend while browser tests are in progress.

New unit checks cover opt-in preview, filters/search, per-thread unsent drafts, group/image details, verified user lookup/pagination, errors/retries, stale request suppression, invalid contact routes, logout/account-change clearing and protection of conversation deep links. Browser checks use real accounts and public directory data, exercise desktop/tablet/phone widths (320, 390, 980 and 1440 pixels), verify dialogs/focus/Escape, and confirm logout/account switching cannot reveal previous drafts. Existing authentication, foundation and Reverb transport checks remain in the suite.

## Phase 4 API and persistence

| Method | Route | Behavior |
| --- | --- | --- |
| GET | /api/v1/conversations | Active direct memberships only; cursor pagination by latest activity and descending conversation ID |
| POST | /api/v1/conversations | `{recipient_id}`; 201 for a new pair, 200 for the existing canonical pair |
| GET | /api/v1/conversations/{id} | Member-scoped detail and `can_send` state |
| GET | /api/v1/conversations/{id}/messages | Newest-first ID cursor history; default 30, maximum 100 per page |
| POST | /api/v1/conversations/{id}/messages | `{client_uuid, body}`; 201 on save, 200 for an identical retry, 409 for a conflicting UUID |

All routes require an active, verified cookie-backed account. Sender identity comes from the session. The dashboard also supplies an `X-Chat-Account` assertion; a mismatched assertion is rejected rather than sending a stale draft as a newly signed-in account. This header never authenticates or selects a sender. Public member resources contain only ID, name, bio and avatar placeholder. Administrators have no membership bypass. Left participants cannot read or send. Both direct members must remain available for writes; either direction of an existing block prevents creation/sending. Existing active members retain readable history when the other account is blocked or unavailable. Group APIs are implemented in Phase 6; replies and author editing/deletion are implemented in Phase 7.

Bodies preserve Unicode, whitespace and newlines, require non-whitespace content, and are limited to 4,000 characters. React renders text without HTML execution. Messages are limited to 60 requests per minute per account, pair creation to 30 per minute. Pair creation and writes use transactions with ordered user row locks, backed by unique pair and sender/UUID constraints. UUIDs are normalized to lowercase. Retries cannot reuse a UUID for a different body or conversation, including a soft-deleted original message.

Conversation pages are ordered by their last update (refreshed on message creation), with descending ID as a tie-breaker. The loaded rows are shown by latest activity. Inbox activity may move rows between pages; refreshing resets the list, and the client deduplicates loaded IDs. **Load more conversations** expands the loaded set; search filters those loaded rows. History is displayed chronologically with **Load older messages**. **Refresh conversations** and **Refresh messages** fetch changes explicitly. “Saved” means database persistence. “Delivered” requires a browser acknowledgement; “Read” requires a visible incoming bubble in the open conversation. Unread counts come from stored receipts. Presence uses actual authorized subscriptions rather than preview values.

The client keeps unconfirmed send UUIDs and their original payload in memory per route, disables repeated submission, and retries the same request after network/server/session/rate-limit errors. Unconfirmed text is locked during a retry. Confirmed validation/conflict failures allow correction. Refreshing the browser discards in-memory unsent drafts and pending retry identity; a successful but unconfirmed message may already be in the saved history, so inspect that history before composing a new send after reload. Account changes remount the workspace, clear drafts, and ignore late requests from the previous identity.

The list/detail/history read paths eager-load participants, senders and latest messages, and batch block checks. Automated query-count coverage checks that the inbox does not add queries for each conversation. No new schema migration is needed; Phase 1 already supplied the relevant indexes and constraints.

## Phase 5 live transport and receipts

- `POST /api/v1/realtime/auth` signs only the current device's `private-users.{userId}.sessions.{deviceSessionId}` channel and eligible `presence-conversations.{id}` channels. It uses the same Sanctum cookies, verification/session middleware, CSRF protection and optional `X-Chat-Account` assertion as chat writes. A guest, unverified/suspended account, revoked/expired device, other device, nonmember, departed member or unrelated admin is denied. A block or unavailable direct participant also prevents presence subscription and typing.
- `POST /api/v1/realtime/heartbeat` provides the public Reverb key and the current device's channel. It records last activity at most every 20 seconds. The browser validates its session every 25 seconds and tears down sockets when the workspace unmounts or identity changes. Last active is an activity timestamp, not a promise of an exact disconnect time.
- `ChatSignal` is queued after transaction commit. New pairs/messages and changed receipts produce signals; identical message/receipt retries do not. The worker resolves currently active memberships and non-revoked, unexpired verified device sessions at delivery time. Signals carry no message bodies or drafts. Reverb client events are disabled; typing is never accepted as an untrusted client whisper.
- `POST /api/v1/conversations/{id}/typing` accepts only `{typing: boolean}` from an authorized sender. Redis suppresses repeated start signals for three seconds, and clients discard typing state after six seconds. Empty drafts, blur, send and thread departure stop typing. Draft text never leaves the browser for this feature.
- `POST /api/v1/conversations/{id}/receipts` accepts `{message_ids: [...], status: "delivered" | "read"}`, up to 100 distinct received-message IDs. Sender IDs, receipt-user IDs and timestamps are never trusted from the client. Cross-thread, sent, missing/deleted or duplicate IDs are rejected. Receipts are inserted/updated transactionally; first delivered/read timestamps are preserved and statuses never regress. Reading also implies delivery.
- Inbox previews acknowledge delivery without marking conversations read. The selected history acknowledges downloaded messages, and an IntersectionObserver marks only incoming bubbles at least half visible while the document is visible as read. Incoming messages preserve the reader’s position when they have scrolled up; they do not force a jump to the newest bubble. Older, unviewed history stays unread. The opt-in fictional preview sends no receipts.
- Each loaded direct conversation uses an ID-only presence roster. Online means a peer has a socket subscribed to that conversation, including another tab. The dashboard subscribes to its loaded conversations and selected thread; off-page conversations may need loading before presence is available. Abrupt network failures may take Reverb's activity timeout to remove a peer. No presence roster exposes names, emails, sessions or message content.
- On subscription/reconnect, the client reloads the inbox, retrieves every missed ascending-ID message page using `after_id`, refreshes receipts for already-loaded messages through scoped `ids[]` requests, and merges by server ID. This preserves loaded older history and avoids duplicate bubbles even when signals are delayed, repeated or reordered. A persisted but unconfirmed send retains its original UUID for explicit **Retry send**, including across reconnection.
- Realtime auth, heartbeat, typing and receipt routes have separate named rate-limit budgets (240, 12, 120 and 120 requests/minute/account). Ordinary channel/receipt traffic cannot consume the heartbeat budget. WebSocket outages preserve REST sending, saved history, drafts and refresh controls.

The development frontend requires the two locked dependencies `laravel-echo` and `pusher-js`. After updating dependencies, run `docker compose exec frontend npm ci` and recreate the frontend if its environment changed. `REVERB_PROXY_TARGET=ws://127.0.0.1:8081` is the host-development default; Compose uses `ws://reverb:8080`. The server supplies the public app key at runtime, so it is not a bundled secret. The internal Reverb HTTP client bypasses the managed proxy only for local service hosts while preserving normal proxy settings for external destinations.

Channel authentication is checked when joining. Revoked sessions receive no newly queued private events and cannot refetch content; the heartbeat bounds client cleanup. Existing presence membership can persist until the client disconnects, reauthenticates or Reverb times it out. Immediate transport-level session termination is not claimed.

## Phase 6 groups

Use **New group** to choose a name and verified members. **Groups** filters saved groups. The details panel lists active members and their group roles; **Group settings** provides the actions allowed to the current member. Group creation/management dialogs load separately from the main bundle. The optional design preview remains fictional and cannot mutate real groups.

| Role | Permissions |
| --- | --- |
| Owner | Rename/change image, add/remove members, promote/demote admins and transfer ownership |
| Group admin | Rename/change image, add members and remove ordinary members; cannot change roles or remove another admin/owner |
| Member | Read/send group messages, use typing/presence/receipts, view the roster and leave |
| Platform admin without membership | No group access or management bypass |

Groups support up to 100 active members. Creation requires at least one other verified, available member. Adding an existing member is idempotent; rejoining resets their role to member. New additions are rejected when either side of a block involves the new member and someone in the group. Existing blocked pairs do not disable the whole group's messaging. Membership and ownership mutations lock the group row and recheck permissions inside the transaction. Simultaneous ownership transfers cannot create two owners. The current owner must transfer ownership before leaving while others remain; the last owner may explicitly leave and close access to the retained group.

**History policy:** new and rejoining members can read the group's existing history. The creation/add-member dialogs disclose that policy. Leaving or removal revokes all group history, image, message, typing and presence authorization. An ID-only membership signal also reaches the removed device so an already-open chat clears, its presence subscription is left, and stale settings do not open in another group. Retained message/receipt records are not deleted.

Group messages reuse persisted UUID-protected writes, cursor history, live signals, reconnect catch-up and visible-only receipts. Incoming bubbles show their author. Group receipt labels say **Read by N** or **Delivered to N**, so acknowledgement by one member is not presented as acknowledgement by everyone. Typing state is tracked per member and expires independently.

| Method | Route | Behavior |
| --- | --- | --- |
| POST | /api/v1/groups | Create `{name, member_ids}`; the session actor becomes owner |
| GET/PATCH | /api/v1/groups/{id} | Authorized detail / rename |
| POST | /api/v1/groups/{id}/members | Add `{member_ids}` as ordinary members |
| PATCH | /api/v1/groups/{id}/members/{userId} | Owner-only `{role: member, admin, owner}`; owner transfers atomically |
| DELETE | /api/v1/groups/{id}/members/{userId} | Remove an eligible member |
| POST | /api/v1/groups/{id}/leave | Leave, subject to the owner invariant |
| GET/POST/DELETE | /api/v1/groups/{id}/image | Authorized private image read/upload/removal |
| GET | /api/v1/group-notifications | Own membership notices with cursor pagination and unread count |
| PATCH | /api/v1/group-notifications/{uuid} | Mark only an owned notice read |

Group images accept PNG/JPEG/WebP, at most 2 MB and 2048 × 2048 pixels. SVG and non-image content are rejected. Files use generated names on the private local disk and are streamed only after active membership checks, with private/no-store caching and nosniff headers. No public storage link is created; removed members cannot retrieve the image. Replacements change the image URL version and remove the previous file after commit. General private message attachments are implemented in Phase 7 below.

**Group updates** stores addition, removal, role/ownership, rename, image and leave notices transactionally. Notices contain group metadata, not message bodies; removed members may still read their own removal notice without regaining history access. Notification timestamps include an explicit timezone. The group-update badge refreshes on membership signals. Create, management and image writes have independent per-account limits of 6, 30 and 12 requests per minute. No schema migration or dependency update was required.

## Phase 7 media and message actions

- `POST /api/v1/conversations/{id}/attachments` atomically persists one image, file or voice message with a client UUID, optional caption and optional same-conversation reply. Multipart retries retain the original UUID/file/caption/reply. Reusing a UUID with different bytes, kind, filename or content conflicts. Failed database writes remove the stored file.
- Uploads accept content-validated PNG/JPEG/WebP images (up to 4096 × 4096), PDF/plain text files, or WebM/Ogg/MP3/MP4/WAV audio containers. Each file is at most 10 MB; PHP, Nginx and API limits agree. SVG, HTML and executable formats are rejected. WebM can be identified as `video/webm` by fileinfo even for the browser's audio-only recording.
- `GET /api/v1/attachments/{id}` checks current active conversation membership on every request. Generated private paths are never serialized. PDF/text force download; images/audio allow inline viewing with private/no-store, nosniff and sandbox CSP headers. Leaving/removal revokes downloads; deleting a message returns 404 for its files.
- The attachment dialog shows progress, errors and safe retry controls. Browser recording requires microphone permission and a secure context such as localhost/HTTPS; it stops after 60 seconds, releases microphone tracks on cancel/unmount and offers playback before sending. An audio file can be selected when recording is unavailable.
- Emoji choices insert Unicode into the draft. `PUT/DELETE /api/v1/messages/{id}/reactions` idempotently adds/removes the actor's allowed reaction without affecting another member's reaction. Changes broadcast only IDs; recipients refresh authorized REST resources.
- Text and attachment messages may reply only to an existing message in the same conversation. Reply excerpts are escaped text, capped at 200 characters; deleted originals display a tombstone.
- `PATCH /api/v1/messages/{id}` edits an author's own text message with current send permission. `DELETE` removes an author's own message with current view permission; this remains available after a direct block. Platform and group administrators gain no implicit edit/delete powers. Removal is idempotent and reserves the UUID. History retains a body-free, attachment-free tombstone; search excludes deleted messages. Already submitted reports retain selected evidence.
- The inbox previews attachment filenames/deleted status. Details show images/files from the currently loaded history, labeled with loaded counts; older media appears when older history is loaded.

## Phase 8 discovery and safety

| Route | Behavior |
| --- | --- |
| `GET /api/v1/notifications` | Own message and membership updates, cursor pagination and unread count |
| `PATCH /api/v1/notifications/{uuid}` | Idempotently mark an own notification read |
| `GET /api/v1/search/messages?q=…` | Literal body search across current memberships; optional conversation scope and ID cursor |
| `GET /api/v1/search/conversations?q=…` | Group-name and other-participant-name search across current memberships |
| `GET /api/v1/blocks` | Own blocked member list |
| `PUT/DELETE /api/v1/blocks/{user}` | Idempotent block/unblock, deriving blocker from the session |
| `POST /api/v1/reports` | Report a member, optionally identifying a visible message by that author |

Search uses validated, bound parameters and literal `%`/`_` escaping. Results page in batches of 30 and never grant access to a departed group's history. Notifications are inserted in the same transaction as a new message, excluding its sender and blocked peers; retries create no duplicate notification. They carry IDs rather than message bodies and update the dashboard badge through private live signals. Marking a notification read is separate from message read receipts. These are in-app notifications; no operating-system permission prompt is required.

Blocking in either direction prevents new direct conversations, direct sends/uploads/reactions, typing, new presence authorization and new shared-group invitations. Queued direct signals recheck blocks at delivery, while block/unblock signals refresh both clients' send controls. Clients leave presence channels when sending becomes unavailable. Existing direct history/downloads and existing shared-group conversations remain visible; blocking does not remove a member from a shared group. Only the account that created a block can remove it. Self-blocks are rejected.

Reports require a 10–1000 character reason and may reference only a currently visible message whose author matches the reported member. Self-reports and injected reporter/status/reviewer fields are rejected. A report stores a snapshot of only the selected message, preserving evidence across subsequent edit/delete, and records an audit entry containing IDs. There is no general private-history access or report-reading endpoint for administrators in this phase. The nullable `user_reports.evidence` migration is additive. Phase 9 will add the audited, report-scoped moderation workflow.

Named per-account minute budgets isolate uploads (12), reactions (60), search (60), notification reads (120), block changes (30) and reports (6). All routes retain active verified SPA cookies, CSRF and account assertions. No new runtime dependencies or credentials are required. Stored private upload/report retention and production malware scanning belong to the Phase 10 operational review.

## Next phase

Phase 9: administration, statistics and scoped moderation.
