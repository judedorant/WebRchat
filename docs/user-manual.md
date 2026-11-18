# WebRchat user manual

[Download the illustrated PDF edition](WebRchat-User-Manual.pdf) for screenshots and a linked contents page.

For the features implemented through Phase 8. This guide covers desktop setup and everyday use. Screens and buttons may move on smaller windows, but the account and privacy rules stay the same.

## Contents

1. [Set up on Windows](#1-set-up-on-windows)
2. [Start and stop the app](#2-start-and-stop-the-app)
3. [Create and verify your account](#3-create-and-verify-your-account)
4. [Find your way around](#4-find-your-way-around)
5. [Send and manage messages](#5-send-and-manage-messages)
6. [Share attachments and voice messages](#6-share-attachments-and-voice-messages)
7. [Create and manage groups](#7-create-and-manage-groups)
8. [Search and notifications](#8-search-and-notifications)
9. [Block and report members](#9-block-and-report-members)
10. [Manage your account](#10-manage-your-account)
11. [Troubleshooting](#11-troubleshooting)
12. [Try a complete conversation](#12-try-a-complete-conversation)

## 1. Set up on Windows

### What you need

- Git installed.
- Docker Desktop installed and running with Linux containers enabled.
- PowerShell and a current browser, such as Chrome, Edge or Firefox.
- Approximately 4 GB of available memory and several GB of disk space for Docker.

Docker supplies PHP, Node, MySQL and the other application services. You do not need to install PHP, Composer or Node separately for this setup.

### Download the project

For a new checkout, run:

```powershell
git clone https://github.com/judedorant/WebRchat.git
cd WebRchat
```

If you already downloaded it, open PowerShell in your existing `WebRchat` folder and run:

```powershell
git pull origin main
```

If Git reports conflicting local changes, resolve those before continuing; do not discard your work just to update.

### First-time installation

Run each step separately. If a command fails, stop and check the troubleshooting section before continuing.

**Step 1 — Check Docker.**

```powershell
docker version
docker compose version
```

The first command should show both Client and Server information.

**Step 2 — Create local configuration files.** These commands preserve files you already have.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

The example settings work together for local testing. If you change database passwords, `.env`'s `MYSQL_PASSWORD` must match `backend/.env`'s `DB_PASSWORD`. Use `localhost` consistently when opening the app and verification links.

**Step 3 — Build the application images.**

```powershell
docker compose build backend frontend
```

The first build can take several minutes. Wait until both images finish building.

**Step 4 — Start the database and cache.**

```powershell
docker compose up -d --wait mysql redis
```

**Step 5 — Install backend dependencies.**

```powershell
docker compose run --rm --no-deps -e COMPOSER_HOME=/tmp/composer backend composer install --no-interaction --prefer-dist
```

**Step 6 — Generate an application key only if missing.**

```powershell
if (!(Select-String -Path backend/.env -Pattern '^APP_KEY=.+$' -Quiet)) {
    docker compose run --rm --no-deps backend php artisan key:generate
}
```

**Step 7 — Create or update the database tables.**

```powershell
docker compose run --rm --no-deps backend php artisan migrate --no-interaction
```

**Step 8 — Set up the standard account roles.**

```powershell
docker compose run --rm --no-deps backend php artisan db:seed --class=RoleSeeder --no-interaction
```

This creates role definitions; it does not create a login account or sample conversations.

**Step 9 — Start all services.**

```powershell
docker compose up -d --wait
```

**Step 10 — Check startup and open the app.**

```powershell
docker compose ps
```

All eight services should be running and healthy.

| Address | Use |
| --- | --- |
| http://localhost:5173 | WebRchat application |
| http://localhost:8026 | Local verification and password-reset email inbox |
| http://localhost:8080/api/v1/health | Database/cache readiness check |

The frontend already runs in development mode with live reload. A separate `npm run dev` command is not required.

For macOS/Linux, the alternative setup is `bash scripts/setup.sh` from the project folder after installing Docker and Git. The PowerShell steps above avoid Windows Bash/line-ending problems.

## 2. Start and stop the app

Run these commands from the `WebRchat` folder, with Docker Desktop running.

Start an existing installation:

```powershell
docker compose up -d --wait
```

Stop it while keeping your saved data:

```powershell
docker compose stop
```

Check its services:

```powershell
docker compose ps
```

Avoid `docker compose down -v`: it removes the named volumes containing your local database and other saved service data.

### Update an existing installation

Stop the app, pull the code, rebuild, refresh dependencies, apply migrations, then start it again:

```powershell
docker compose stop
git pull origin main
docker compose build backend frontend
docker compose up -d --wait mysql redis
docker compose run --rm --no-deps -e COMPOSER_HOME=/tmp/composer backend composer install --no-interaction --prefer-dist
docker compose run --rm --no-deps frontend npm ci
docker compose run --rm --no-deps backend php artisan migrate --no-interaction
docker compose up -d --wait
```

Keep your existing `.env` files and application key. Review release instructions for any newly required configuration.

## 3. Create and verify your account

1. Open http://localhost:5173.
2. Choose **Get started** or **Create account**.
3. Enter your full name, email address, password and password confirmation.
4. Use a password with at least 12 characters, upper- and lowercase letters, and a number.
5. Select **Create account**.
6. Open http://localhost:8026 in the same browser.
7. Find the verification email addressed to your new account.
8. Follow its link and select **Verify email address**.
9. Select **Continue to your account**.

The local inbox captures development email instead of sending it to your normal mailbox. Keep it private because it contains account verification and recovery links.

You must verify your account before using chats and the member directory. If a verification link expires, request a new verification email from the verification screen.

To sign in later, use your registered email and password. There is no default user or administrator password.

## 4. Find your way around

| Area or control | What it does |
| --- | --- |
| Conversation list | Opens your saved conversations |
| Search conversations | Filters the conversations already loaded in the sidebar |
| New message / plus icon | Finds a verified member and opens a conversation draft |
| New group | Creates a group with selected members |
| All, Unread, Groups | Filters the conversation list |
| Notifications | Shows your private message and membership updates |
| Group updates | Shows group membership/settings notices |
| Search messages | Searches saved message text and conversation names on the server |
| Blocked members | Shows accounts you blocked and lets you unblock them |
| Conversation details / information icon | Opens contact information, shared media or group members/settings |
| Account settings / gear icon | Opens your profile, password and session settings |
| Theme button | Switches between light and dark appearance |
| Sign out | Ends your current account session |

On a narrow window, selecting a conversation hides the sidebar. Use **Back to conversations** to return. The information button opens the details panel; close it with its close button or Escape.

Dialogs support Tab and Shift+Tab navigation. Escape closes a dismissible dialog; a busy operation may need to finish first.

### Design preview

**Explore design preview** or **Design preview** opens fictional sample conversations. Their messages, profiles and availability are examples. Sending and media actions are disabled in this mode. Choose **Exit preview** to return to real conversations.

A new real account normally starts with an empty conversation list.

## 5. Send and manage messages

### Start a direct conversation

1. Select **New message**.
2. Search for another verified member by name.
3. Select that member.
4. Write in **Message draft**.
5. Select **Send**.

The first saved message creates or reuses your private conversation. An unsent draft is not a saved message. Drafts stay in the current tab's memory and are lost on reload or sign-out.

Messages can contain up to 4,000 characters. Use **Load older messages** to retrieve earlier history.

### Understand message status

| Status | Meaning |
| --- | --- |
| Saved | The server stored your message; delivery/read has not yet been acknowledged |
| Delivered | The recipient's client acknowledged receiving the message |
| Read | The recipient viewed the message while the document was visible |
| Delivered to N / Read by N | Number of group recipients who acknowledged delivery or reading |
| Live | The real-time connection is active |
| Reconnecting | The app is trying to restore live updates |

Typing indicators and online presence depend on an active connection. Presence can take time to update after an abrupt disconnect. **Read** does not mean the recipient has replied.

If saving is not confirmed, use **Retry send**. It retries the same message identifier to avoid duplicates. Keep the page open while retrying.

### Reply, edit, delete and react

- **Reply:** Select **Reply** under a message, enter your response, then send. Select **Cancel reply** to discard the reply selection.
- **Edit:** Select **Edit** under your own text message, change its text, then select **Save edit**. Edited messages show an edited indicator.
- **Delete:** Select **Delete** under your own message and confirm. The conversation shows **Message deleted**, and its attachments are no longer downloadable through the app. A previously submitted report retains its selected evidence.
- **React:** Select **React** and choose an emoji. Selecting your existing reaction removes it; other members' reactions remain.
- **Insert emoji:** Select the smile icon beside the draft, then choose an emoji. You can also type or paste Unicode emoji.

You cannot edit or delete another member's messages. Group ownership and the platform administrator role do not automatically grant those powers.

## 6. Share attachments and voice messages

### Send an image or file

1. Open a real conversation.
2. Optionally enter a caption in the draft.
3. Select the paperclip icon, **Attach a file**.
4. Choose a supported file.
5. Select **Send attachment** and wait for confirmation.

| Item | Supported limits |
| --- | --- |
| Message image | PNG, JPEG or WebP; up to 10 MB and 4096 × 4096 pixels |
| Document | PDF or plain text; up to 10 MB |
| Audio file | Supported WebM, Ogg, MP3, MP4/M4A or WAV audio containers; up to 10 MB |
| Group image | PNG, JPEG or WebP; up to 2 MB and 2048 × 2048 pixels |

SVG, HTML and executable uploads are not supported. A file's contents must match its supported type; renaming its extension does not convert it.

If an upload is unconfirmed, use **Retry attachment** to resend the same attempt. If you choose **Discard attachment retry**, check the conversation before sending again: the original request may already have saved.

Select an image to open it, a file link to download it, or the audio player to listen. Only current conversation members can retrieve attachments. The details panel shows shared items from the history currently loaded; loading older messages can reveal older items.

### Record a voice message

1. Select the microphone icon, **Voice message**.
2. Allow microphone access if your browser asks.
3. Speak, then select **Stop recording**. Recording stops automatically after 60 seconds.
4. Listen using the review player.
5. Select **Send attachment** to send it.

Closing the dialog cancels recording and releases the microphone. Recording requires browser support and a secure context, such as localhost or HTTPS. If recording is unavailable, choose a supported audio file instead.

## 7. Create and manage groups

### Create a group

1. Select **New group**.
2. Enter a **Group name**.
3. Select **Choose members**, search for a member and select them. Repeat as needed.
4. Select **Create group**.

You become the owner. A group starts with at least one other member and supports up to 100 active members.

### Group permissions

| Action | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read history, send messages and react | Yes | Yes | Yes |
| Change group name/image | Yes | Yes | No |
| Add members | Yes | Yes | No |
| Remove ordinary members | Yes | Yes | No |
| Remove other admins | Yes | No | No |
| Change roles or transfer ownership | Yes | No | No |
| Leave | Transfer ownership first if others remain | Yes | Yes |

No one can remove the current owner. There is exactly one owner.

### Manage a group

Open the conversation, then **Conversation details** → **Group settings**.

- **Rename:** Change **Group name**, then select **Save group name**.
- **Change image:** Choose a supported file under **Group image**. Use **Remove group image** to remove it.
- **Add someone:** Select **Add member**, search for a member and select them.
- **Remove someone:** Select the removal control beside an eligible member and confirm.
- **Change a role:** As owner, use the role selector beside a member and confirm when prompted.
- **Transfer ownership:** Assign the owner role to another member and confirm. You become an admin.
- **Leave:** Select **Leave group** and confirm. An owner with other members must transfer ownership first. A sole remaining owner can leave and close the group.

New and rejoining members can read the group's existing history. Rejoining does not restore an old admin role. Removed or departed members lose access to group messages, images and attachments. Existing saved copies of files are outside the app's control.

Members who are unavailable or blocked in the admission checks cannot be added. Blocking someone does not automatically remove either of you from an existing shared group.

## 8. Search and notifications

### Search history

1. Select **Search messages**.
2. Enter at least two characters in **Message search**.
3. Select **Search history**.
4. Review matching messages and conversations.
5. Use **More results** when available, or **Open conversation** to open a matching thread.

Message search matches saved text; conversation search matches group names and other participants' names. Results include only conversations you currently belong to. Deleted messages are excluded. Opening a conversation opens its thread; it does not guarantee scrolling directly to an older matching message.

### Read notifications

Select **Notifications** to view message and group notices. Use **Mark read** to clear an unread notice or **More notifications** to load earlier notices. **Group updates** provides the group-specific view.

Notification read state is separate from message read receipts. Marking a notice read does not mean you viewed its message. These are in-app notifications, not operating-system push notifications.

## 9. Block and report members

### Block someone

1. Open their direct conversation.
2. Select **Block member**.
3. Review the explanation and select **Confirm block**.

A block in either direction stops new direct messages, uploads, reactions, typing and new presence authorization. It also prevents new shared-group invitations involving the blocked pair. Existing direct history and downloads remain accessible to current members, and existing shared groups remain visible.

To undo your block, select **Blocked members**, then **Unblock** beside the member. You cannot remove a block that another account placed on you.

### Report a member or message

- For a specific message, select **Report** under that message.
- For a member, select **Report member** in their direct conversation.

Enter a reason of 10–1,000 characters and select **Submit report**. A message report identifies that message and its author and preserves the selected evidence. It does not grant general access to the whole conversation.

Reports are stored for review. The administration/moderation workflow is scheduled for Phase 9, so submitting a report does not imply an immediate moderator response or automatic account suspension.

## 10. Manage your account

Open **Account settings** using the gear icon.

- **Profile:** Edit your name, email or **About you**, then select **Save profile**. Changing your email requires your current password, requires verification again and signs out other sessions.
- **Password:** Enter your current and new passwords, confirm the new password, then select **Update password**. Other sessions are signed out.
- **Active sessions:** Review your devices. Select **Sign out** beside another session, or **Sign out all other sessions**.
- **Sign out:** Use the account sign-out control to end your current session. Unsent drafts are cleared.

If you forget your password, choose **Forgot your password?** on the sign-in screen. Submit your email, open the reset message in the local inbox, follow its link and choose a new password. Reset links expire after 60 minutes and are single-use. A successful password reset invalidates existing sessions.

## 11. Troubleshooting

| Problem | What to do |
| --- | --- |
| `set: pipefail` / invalid option when running Bash | Use the PowerShell setup in section 1. Windows line endings can break the Bash script. |
| `MYSQL_PASSWORD` or `MYSQL_ROOT_PASSWORD` missing | Create the root `.env` using section 1, step 2. Run Compose from the `WebRchat` folder. |
| Docker cannot connect to its engine | Start Docker Desktop and wait for its Linux engine to be ready. |
| A port is already allocated | Stop the other application/container using that port. The default app needs ports 5173, 8080, 8081 and 8026 available. |
| App does not open | Run `docker compose ps`; check that frontend, backend, Nginx, MySQL and Redis are healthy. |
| `vendor/autoload.php` is missing | Complete the Composer installation in section 1, step 5. |
| Database tables are missing | Run the migration command in section 1, step 7. |
| Frontend dependencies are missing after an update | Run `docker compose run --rm --no-deps frontend npm ci`, then `docker compose restart frontend`. |
| No verification/reset email appears | Check the local inbox at port 8026 and verify that `queue` and `mailpit` are running. Check the recipient address and request a fresh email if needed. |
| Session expired / CSRF error | Reload the page and sign in again if needed. Use `localhost` consistently rather than switching to `127.0.0.1`. |
| Too many attempts | Wait before retrying. Repeated clicks can extend the time until another attempt is allowed. |
| Cannot find a member | They must have a verified, available account. Search by name; a new installation has no sample user accounts. |
| Send is disabled | Exit design preview, verify your account, and check whether the conversation is blocked/unavailable or a previous send is awaiting retry. |
| Messages stop arriving live | Check the connection indicator. Restore your connection, wait for recovery, or use refresh controls. |
| Microphone does not work | Allow microphone access in browser/site settings; use localhost/HTTPS and a supported browser, or attach an audio file. |
| File upload is rejected | Check its actual format, size and image dimensions against section 6. |
| Group history disappears | Confirm you are still a member. Leaving or removal revokes access. |

For a startup error, collect recent service logs from PowerShell:

```powershell
docker compose logs --tail=100 backend frontend nginx queue reverb
```

Do not post your `.env` files, passwords, application keys, session cookies or private email links when requesting help.

## 12. Try a complete conversation

1. Start the app and register account A in your normal browser window.
2. Verify A using the local email inbox.
3. Open a different browser or private window, register account B, and verify B there.
4. From A, find B using **New message** and send a text message.
5. From B, open the conversation and reply. Watch delivery/read status on A.
6. Send an image, react to a message, record a short voice message and play it from the other account.
7. Create a group containing A and B. Check its settings from each account to compare owner/member permissions.
8. Search for a distinctive word from your conversation.
9. Block A from B, confirm sending is unavailable, then unblock A from **Blocked members**.
10. Reload the browsers to confirm saved conversations and messages persist.

For technical setup and validation, see [README](../README.md), [dashboard behavior](dashboard.md) and [validation results](validation.md).
