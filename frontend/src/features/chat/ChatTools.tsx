import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { errorMessage, mutate } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import { Modal } from "./Modal";
import type { Contact } from "./types";
import type { SavedConversation, SavedMessage } from "./useDirectMessaging";
interface Notice {
  id: string;
  data: {
    action: string;
    conversation_id: number;
    group_name?: string;
    message_id?: number;
  };
  read_at: string | null;
  created_at: string;
}
interface Page<T> {
  data: T[];
  meta: { next_cursor: string | null; unread_count?: number };
}
export function ChatTools({
  userId,
  version,
}: {
  userId: number;
  version: number;
}) {
  const [mode, setMode] = useState<
    "notifications" | "search" | "blocks" | null
  >(null);
  const [notices, setNotices] = useState<Notice[]>([]),
    [count, setCount] = useState(0),
    [cursor, setCursor] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<{ user_id: number; name: string }[]>([]);
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<SavedMessage[]>([]),
    [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [conversationResults, setConversationResults] = useState<
    SavedConversation[]
  >([]);
  const [conversationCursor, setConversationCursor] = useState<string | null>(
    null,
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate(),
    generation = useRef(0),
    lock = useRef(false);
  const valid = () => useAuth.getState().user?.id === userId;
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<Page<Notice>>("/notifications", { signal: controller.signal })
      .then(({ data }) => {
        if (
          !controller.signal.aborted &&
          useAuth.getState().user?.id === userId
        ) {
          setNotices(data.data);
          setCursor(data.meta.next_cursor);
          setCount(data.meta.unread_count ?? 0);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [userId, version]);
  async function open(next: "notifications" | "search" | "blocks") {
    const request = ++generation.current;
    setMode(next);
    setError("");
    if (next === "search") return;
    setBusy(true);
    try {
      if (next === "blocks") {
        const response = await api.get<{
          data: { user_id: number; name: string }[];
        }>("/blocks");
        if (valid() && request === generation.current)
          setBlocks(response.data.data);
      } else {
        const { data } = await api.get<Page<Notice>>("/notifications");
        if (valid() && request === generation.current) {
          setNotices(data.data);
          setCursor(data.meta.next_cursor);
          setCount(data.meta.unread_count ?? 0);
        }
      }
    } catch (error) {
      if (valid() && request === generation.current)
        setError(errorMessage(error));
    } finally {
      if (valid() && request === generation.current) setBusy(false);
    }
  }
  async function moreNotices() {
    if (lock.current || !cursor) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get<Page<Notice>>("/notifications", {
        params: { cursor },
      });
      if (valid()) {
        setNotices((old) => [
          ...new Map(
            [...old, ...data.data].map((item) => [item.id, item]),
          ).values(),
        ]);
        setCursor(data.meta.next_cursor);
      }
    } catch (error) {
      if (valid()) setError(errorMessage(error));
    } finally {
      lock.current = false;
      if (valid()) setBusy(false);
    }
  }
  async function mark(notice: Notice) {
    if (lock.current || notice.read_at) return;
    lock.current = true;
    setError("");
    try {
      await mutate("patch", `/notifications/${notice.id}`, undefined, {
        "X-Chat-Account": String(userId),
      });
      if (valid()) {
        setNotices((old) =>
          old.map((item) =>
            item.id === notice.id
              ? { ...item, read_at: new Date().toISOString() }
              : item,
          ),
        );
        setCount((value) => Math.max(0, value - 1));
      }
    } catch (error) {
      if (valid()) setError(errorMessage(error));
    } finally {
      lock.current = false;
    }
  }
  async function search(event?: FormEvent, older = false) {
    event?.preventDefault();
    if (lock.current || query.trim().length < 2) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const request = ++generation.current;
    try {
      const [{ data }, conversations] = await Promise.all([
        older && !searchCursor
          ? Promise.resolve({
              data: { data: [] as SavedMessage[], meta: { next_cursor: null } },
            })
          : api.get<Page<SavedMessage>>("/search/messages", {
              params: {
                q: query.trim(),
                cursor: older ? searchCursor : undefined,
              },
            }),
        older && !conversationCursor
          ? Promise.resolve({
              data: {
                data: [] as SavedConversation[],
                meta: { next_cursor: null },
              },
            })
          : api.get<Page<SavedConversation>>("/search/conversations", {
              params: {
                q: query.trim(),
                cursor: older ? conversationCursor : undefined,
              },
            }),
      ]);
      if (valid() && request === generation.current) {
        setResults((old) => (older ? [...old, ...data.data] : data.data));
        setSearchCursor(data.meta.next_cursor);
        setConversationResults((old) =>
          older
            ? [...old, ...conversations.data.data]
            : conversations.data.data,
        );
        setConversationCursor(conversations.data.meta.next_cursor);
      }
    } catch (error) {
      if (valid() && request === generation.current)
        setError(errorMessage(error));
    } finally {
      lock.current = false;
      if (valid() && request === generation.current) setBusy(false);
    }
  }
  async function unblock(id: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate("delete", `/blocks/${id}`, undefined, {
        "X-Chat-Account": String(userId),
      });
      if (valid())
        setBlocks((old) => old.filter((item) => item.user_id !== id));
    } catch (error) {
      if (valid()) setError(errorMessage(error));
    } finally {
      lock.current = false;
      if (valid()) setBusy(false);
    }
  }
  return (
    <>
      <div className="chat-tools">
        <button
          type="button"
          className="chat-secondary"
          onClick={() => void open("notifications")}
        >
          Notifications{count > 0 ? ` (${count})` : ""}
        </button>
        <button
          type="button"
          className="chat-secondary"
          onClick={() => void open("search")}
        >
          Search messages
        </button>
        <button
          type="button"
          className="chat-secondary"
          onClick={() => void open("blocks")}
        >
          Blocked members
        </button>
      </div>
      {mode && (
        <Modal
          title={
            mode === "notifications"
              ? "Notifications"
              : mode === "search"
                ? "Search messages"
                : "Blocked members"
          }
          onClose={() => {
            ++generation.current;
            setMode(null);
            setBusy(false);
          }}
        >
          {error && <p role="alert">{error}</p>}
          {busy && <p role="status">Loading…</p>}
          {mode === "notifications" && (
            <>
              <p>
                Private message and group updates. Message contents stay in the
                conversation.
              </p>
              {!busy && !notices.length && <p>No notifications yet.</p>}
              <ul className="chat-tool-results">
                {notices.map((notice) => (
                  <li key={notice.id}>
                    <strong>
                      {notice.data.action === "message"
                        ? "New message"
                        : `${notice.data.group_name ?? "Group"} · ${notice.data.action.replaceAll("_", " ")}`}
                    </strong>
                    <time>{new Date(notice.created_at).toLocaleString()}</time>
                    {!["removed", "left"].includes(notice.data.action) && (
                      <button
                        type="button"
                        className="chat-secondary"
                        onClick={() => {
                          setMode(null);
                          navigate(
                            `/app/conversations/${notice.data.conversation_id}`,
                          );
                        }}
                      >
                        Open conversation
                      </button>
                    )}
                    {!notice.read_at && (
                      <button
                        type="button"
                        className="chat-secondary"
                        onClick={() => void mark(notice)}
                      >
                        Mark read
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {cursor && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void moreNotices()}
                >
                  More notifications
                </button>
              )}
              {error && (
                <button
                  type="button"
                  onClick={() => void open("notifications")}
                >
                  Retry notifications
                </button>
              )}
            </>
          )}
          {mode === "search" && (
            <>
              <form onSubmit={(event) => void search(event)}>
                <label>
                  Message search
                  <input
                    value={query}
                    minLength={2}
                    maxLength={100}
                    required
                    onChange={(event) => {
                      ++generation.current;
                      setBusy(false);
                      setQuery(event.target.value);
                      setResults([]);
                      setConversationResults([]);
                      setConversationCursor(null);
                      setSearchCursor(null);
                    }}
                  />
                </label>
                <button type="submit" className="chat-primary" disabled={busy}>
                  Search history
                </button>
              </form>
              <p>
                Search messages in your current conversations. Use at least two
                characters.
              </p>
              {conversationResults.length > 0 && (
                <>
                  <h3>Conversations</h3>
                  <ul className="chat-tool-results">
                    {conversationResults.map((thread) => (
                      <li key={thread.id}>
                        <strong>
                          {thread.name ||
                            thread.participants
                              .filter((person) => person.id !== userId)
                              .map((person) => person.name)
                              .join(", ")}
                        </strong>
                        <button
                          type="button"
                          className="chat-secondary"
                          onClick={() => {
                            setMode(null);
                            navigate(`/app/conversations/${thread.id}`);
                          }}
                        >
                          Open conversation
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {results.length > 0 && <h3>Messages</h3>}
              <ul className="chat-tool-results">
                {results.map((message) => (
                  <li key={message.id}>
                    <strong>{message.sender?.name ?? "Former member"}</strong>
                    <p>{message.body}</p>
                    <time>{new Date(message.created_at).toLocaleString()}</time>
                    <button
                      type="button"
                      className="chat-secondary"
                      onClick={() => {
                        setMode(null);
                        navigate(
                          `/app/conversations/${message.conversation_id}`,
                        );
                      }}
                    >
                      Open conversation
                    </button>
                  </li>
                ))}
              </ul>
              {!busy && query.length >= 2 && !results.length && (
                <p>No matching messages. Try another search.</p>
              )}
              {(searchCursor || conversationCursor) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void search(undefined, true)}
                >
                  More results
                </button>
              )}
            </>
          )}
          {mode === "blocks" && (
            <>
              <p>
                Blocking stops direct messages, typing and new shared-group
                invitations. Existing shared groups and history remain visible.
              </p>
              {!busy && !blocks.length && <p>No blocked members.</p>}
              {blocks.map((member) => (
                <div key={member.user_id} className="chat-block-row">
                  <span>{member.name}</span>
                  <button
                    type="button"
                    className="chat-secondary"
                    disabled={busy}
                    onClick={() => void unblock(member.user_id)}
                  >
                    Unblock {member.name}
                  </button>
                </div>
              ))}
              {error && (
                <button type="button" onClick={() => void open("blocks")}>
                  Retry blocked members
                </button>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
export function ReportDialog({
  userId,
  target,
  messageId,
  onClose,
}: {
  userId: number;
  target: Contact;
  messageId?: number;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate(
        "post",
        "/reports",
        { reported_user_id: target.id, message_id: messageId, reason },
        { "X-Chat-Account": String(userId) },
      );
      if (useAuth.getState().user?.id === userId) setDone(true);
    } catch (error) {
      if (useAuth.getState().user?.id === userId) setError(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title={`Report ${target.name}`} onClose={onClose}>
      {done ? (
        <p role="status">Report submitted for review.</p>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <p>
            {messageId
              ? "This report identifies the selected message for a scoped moderation review."
              : "Describe the member’s behavior. This does not grant access to your private conversations."}
          </p>
          <label>
            Reason
            <textarea
              required
              minLength={10}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" className="chat-primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </form>
      )}
    </Modal>
  );
}
export function BlockButton({
  userId,
  target,
  onChanged,
}: {
  userId: number;
  target: Contact;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function block() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate("put", `/blocks/${target.id}`, undefined, {
        "X-Chat-Account": String(userId),
      });
      if (useAuth.getState().user?.id === userId) {
        setConfirm(false);
        onChanged();
      }
    } catch (error) {
      if (useAuth.getState().user?.id === userId) setError(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="chat-secondary"
        onClick={() => setConfirm(true)}
      >
        Block member
      </button>
      {confirm && (
        <Modal
          title={`Block ${target.name}?`}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            Direct messages and typing will stop. Existing history and shared
            groups remain. You can unblock this member from Blocked members.
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            className="chat-primary"
            disabled={busy}
            onClick={() => void block()}
          >
            Confirm block
          </button>
        </Modal>
      )}
    </>
  );
}
