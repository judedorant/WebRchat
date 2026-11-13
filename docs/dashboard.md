# Phase 3: chat workspace and navigation

Sign in with a verified account and open `/app`. This release provides the responsive dashboard and its navigation. Persistent conversations and message sending belong to Phase 4; no conversation/message/group write API is called by this UI.

## What works

- A full-height sidebar, main chat panel and optional contact/group details panel. On wide screens the details panel opens by default; on tablet/phone it is an optional overlay. Mobile switches between the list and selected thread with a back button and browser navigation.
- Conversation search and All / Unread / Groups filters, selected-row highlighting, unread badge layouts, per-thread temporary drafts and deep-linked navigation.
- Sidebar profile/settings, sign out and light/dark switching use the existing account system. Dashboard routes are protected by the verified-user frontend guard; all directory requests also pass the existing backend session/verification/policy checks.
- A new-message dialog searches real verified profiles through `GET /api/v1/users`, excludes the current account, handles cursor pagination, cancels superseded requests, ignores stale responses, and shows loading skeletons, empty results and retryable errors.
- Selecting a real member opens an unsent draft. Refreshing that route reloads only the public member profile through `GET /api/v1/users/{id}`. No existing private conversation or message history is inferred from a public profile.
- Native dialogs with explicit Tab/Shift+Tab wrapping provide a focus trap, Escape/backdrop/close-button dismissal and explicit focus restoration. Contact details support Escape and return focus to their toggle; an open modal takes precedence over the underlying details panel. Controls use visible focus styles and accessible names. Reduced-motion preferences disable transitions/animations.

## Honest preview behavior

The normal conversation list starts empty because there is no conversation read/write API yet. **Explore design preview** (or **Design preview** in the mobile sidebar) opts into seven clearly labeled fictional direct/group conversations. The preview includes sample bubbles, image/file cards, reaction/read-status decoration, shared media and group-member layouts. It never inserts records or contacts into MySQL. Presence and unread/read/reaction values in this mode are sample values, not live status.

The preview is marked in the sidebar, conversation header, message-history banner and contact/shared-file details. Its images are original local SVG illustrations; opening them shows a sample-image dialog. Sample files have no fake download links. Calls, attachments, emoji picking, voice recording, reactions and real read receipts are not implemented by this phase.

The composer accepts a temporary draft, but **Send is disabled**. Submitting the form cannot send or append a message. Drafts are limited to 4,000 characters and remain only in the tab's memory. They survive thread navigation within that tab, but not reload or logout. A real selected member is labeled as a draft; no last-seen or online status is invented for real profiles.

## Routes and state

| Route | Meaning |
| --- | --- |
| /app | Conversation list / empty workspace |
| /app/conversations/demo-maya (and other explicit demo IDs) | Fictional conversation only while preview mode is enabled |
| /app/conversations/contact-{id} | Unsent draft addressed to an authorized public user profile |

Production Nginx serves `/app/conversations/*` through the SPA fallback. WebSocket connections through that gateway use `/ws/app/{key}`; `/ws` is stripped before forwarding to Reverb. The directly published development Reverb port retains `/app/{key}`. Phase 5 Echo configuration must use the correct public gateway path.

Unrecognized routes display an unavailable state. A direct demo link after reload requires opting into preview again. A real contact deep link checks the existing server policy; unavailable/unauthorized profiles do not gain a fabricated conversation. These temporary route prefixes are UI identifiers, not persistent conversation IDs. Phase 4 must introduce server-backed IDs and membership-scoped data deliberately.

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

## Next phase

Phase 4 needs authorized direct-conversation creation/list/detail APIs, stable server conversation IDs, persisted messages with sender-scoped UUID idempotency, membership policies, eager loading and cursor-based history. Remove/replace the draft-only UI boundary only once those APIs and tests exist. WebSocket delivery/presence remains Phase 5, group actions Phase 6, and real attachments/reactions/voice Phase 7. Phase 3 does not claim any of those behaviors.
