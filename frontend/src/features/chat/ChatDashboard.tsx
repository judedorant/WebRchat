import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  CheckCheck,
  CircleHelp,
  FileText,
  Image as ImageIcon,
  Info,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Moon,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  UsersRound,
  Settings2,
} from "lucide-react";
import { api } from "../../lib/api";
import { errorMessage, mutate } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import { usePreferences } from "../../store/preferences";
import { useChat } from "./store";
import { previewConversations, previewMedia } from "./preview";
import { Avatar } from "./Avatar";
import { PeopleDialog } from "./PeopleDialog";
import { Modal } from "./Modal";
import type { Contact } from "./types";
import { useWideScreen } from "./useWideScreen";
import { useDirectMessaging } from "./useDirectMessaging";
import { useMessageReceipts, useInboxDelivery } from "./useMessageReceipts";
const RichComposer = lazy(() =>
  import("./RichComposer").then((module) => ({ default: module.RichComposer })),
);
import { MessageExtras } from "./MessageExtras";
const ChatTools = lazy(() =>
  import("./ChatTools").then((module) => ({ default: module.ChatTools })),
);
const ReportDialog = lazy(() =>
  import("./ChatTools").then((module) => ({ default: module.ReportDialog })),
);
const BlockButton = lazy(() =>
  import("./ChatTools").then((module) => ({ default: module.BlockButton })),
);
import { GroupUpdates } from "./GroupUpdates";
import "./chat.css";
const GroupDialog = lazy(() =>
  import("./GroupDialog").then((module) => ({ default: module.GroupDialog })),
);
const GroupManager = lazy(() =>
  import("./GroupManager").then((module) => ({ default: module.GroupManager })),
);
export function ChatDashboard() {
  const userId = useAuth((s) => s.user?.id);
  return <ChatWorkspace key={userId ?? "guest"} />;
}
function ChatWorkspace() {
  const user = useAuth((s) => s.user),
    setUser = useAuth((s) => s.setUser);
  const { dark, toggleTheme } = usePreferences(),
    chat = useChat(),
    navigate = useNavigate(),
    { conversationId } = useParams();
  const [replyDraft, setReplyDraft] = useState<{
    key?: string;
    message: import("./useDirectMessaging").SavedMessage;
  } | null>(null);
  const [report, setReport] = useState<{
    target: Contact;
    messageId?: number;
  } | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupSettingsId, setGroupSettingsId] = useState<number | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [image, setImage] = useState<{ src: string; alt: string } | null>(null),
    [error, setError] = useState(""),
    [signingOut, setSigningOut] = useState(false),
    [lookup, setLookup] = useState<{ key: string; error: string } | null>(null),
    [notice, setNotice] = useState("");
  const end = useRef<HTMLDivElement>(null),
    searchRef = useRef<HTMLInputElement>(null),
    detailsButton = useRef<HTMLButtonElement>(null);
  const wide = useWideScreen(),
    detailsOpen = chat.details ?? wide;
  const sample = chat.preview
    ? previewConversations.find((thread) => thread.id === conversationId)
    : undefined;
  const contactId = conversationId?.match(/^contact-([1-9]\d*)$/)?.[1];
  const contact = conversationId ? chat.contacts[conversationId] : undefined;
  const direct = useDirectMessaging(user?.id, conversationId, chat.preview);
  const historyRoot = useRef<HTMLDivElement>(null);
  useMessageReceipts(
    user?.id,
    direct.savedId,
    Boolean(user?.realtime_enabled) && !chat.preview,
    direct.realtime.status,
    direct.messages,
    historyRoot,
  );
  useInboxDelivery(
    user?.id,
    Boolean(user?.realtime_enabled) && !chat.preview,
    direct.realtime.status,
    direct.conversations,
  );
  const typing = direct.realtime.indicateTyping;
  useEffect(() => {
    const id = direct.savedId;
    return () => {
      if (id) void typing(id, false);
    };
  }, [direct.savedId, typing]);
  const live = direct.active;
  const replyMessage =
    replyDraft && replyDraft.key === conversationId ? replyDraft.message : null;
  const liveGroup = live?.type === "group";
  const typingNames = live
    ? Object.keys(direct.realtime.typing[live.id] || {})
        .map(Number)
        .flatMap(
          (id) =>
            live.participants.find((member) => member.id === id)?.name || [],
        )
        .slice(0, 3)
    : [];
  const peer = live?.participants.find((person) => person.id !== user?.id);
  const safetyTarget = !sample && !liveGroup ? peer || contact : undefined;
  const active =
    sample ||
    (live
      ? liveGroup
        ? {
            name: live.name || "Group",
            bio: `${live.participants.length} members`,
          }
        : peer || { name: "Unavailable member", bio: null }
      : contact);
  const sharedAttachments = direct.messages.flatMap(
    (message) => message.attachments || [],
  );
  const sharedImages = sharedAttachments.filter(
    (file) => file.kind === "image",
  );
  const sharedFiles = sharedAttachments.filter((file) => file.kind !== "image");
  const routeRef = useRef(conversationId);
  useEffect(() => {
    routeRef.current = conversationId;
  }, [conversationId]);
  const savedRows = !chat.preview
    ? direct.conversations
        .filter(
          (thread) =>
            (chat.filter !== "unread" || (thread.unread_count || 0) > 0) &&
            (chat.filter !== "groups" || thread.type === "group"),
        )
        .filter((thread) =>
          `${thread.name || ""} ${thread.participants.map((person) => person.name).join(" ")} ${thread.latest_message?.body || ""}`
            .toLowerCase()
            .includes(chat.search.toLowerCase().trim()),
        )
        .toSorted(
          (a, b) =>
            (b.last_message_at || b.created_at).localeCompare(
              a.last_message_at || a.created_at,
            ) || b.id - a.id,
        )
    : [];
  const location = useLocation();
  const lookupKey = `${location.key}:${contactId || ""}`;
  const contactLoading = Boolean(
    contactId && !contact && lookup?.key !== lookupKey,
  );
  const contactError = lookup?.key === lookupKey ? lookup.error : "";
  const displayError =
    contactError || error || direct.sendError || direct.historyError;
  const hasActive = Boolean(active);
  const setDetails = chat.setDetails;
  const validPreviewId = previewConversations.some(
    (thread) => thread.id === conversationId,
  );
  const unread = chat.preview
    ? previewConversations.reduce(
        (count, thread) =>
          count + (chat.read.includes(thread.id) ? 0 : thread.unread),
        0,
      )
    : direct.conversations.reduce(
        (count, thread) => count + (thread.unread_count || 0),
        0,
      );
  const sampleRows = chat.preview
    ? previewConversations.filter(
        (thread) =>
          (chat.filter !== "groups" || thread.kind === "group") &&
          (chat.filter !== "unread" ||
            (!chat.read.includes(thread.id) && thread.unread > 0)) &&
          `${thread.name} ${thread.lastMessage}`
            .toLowerCase()
            .includes(chat.search.toLowerCase().trim()),
      )
    : [];
  const contactRows =
    !chat.preview && chat.filter === "all"
      ? Object.entries(chat.contacts).filter(([, person]) =>
          person.name.toLowerCase().includes(chat.search.toLowerCase().trim()),
        )
      : [];
  const stayAtBottom = useRef(true);
  const scrollRoute = useRef(conversationId);
  const newestMessageId = direct.messages.at(-1)?.id;
  useEffect(() => {
    if (sample) useChat.getState().markRead(sample.id);
    if (scrollRoute.current !== conversationId) stayAtBottom.current = true;
    scrollRoute.current = conversationId;
    if (stayAtBottom.current)
      end.current?.scrollIntoView?.({ behavior: "auto" });
  }, [conversationId, sample, newestMessageId]);
  useEffect(() => {
    if (!contactId || contact) return;
    const controller = new AbortController();
    api
      .get<{ data: Contact }>(`/users/${contactId}`, {
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted)
          useChat.getState().addContact(data.data);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLookup({ key: lookupKey, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [contactId, contact, lookupKey]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!hasActive || !detailsOpen) return;
    if (!wide)
      document
        .querySelector<HTMLButtonElement>("#conversation-details button")
        ?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setDetails(false);
        detailsButton.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [hasActive, detailsOpen, wide, setDetails]);
  function openPreview() {
    chat.setPreview(true);
    navigate(
      `/app/conversations/${validPreviewId ? conversationId : "demo-maya"}`,
    );
  }
  function selectContact(person: Contact) {
    setNotice("Conversation opened. Write your first message.");
    chat.addContact(person);
    setPeopleOpen(false);
    const existing = direct.conversations.find(
      (thread) =>
        thread.type === "direct" &&
        thread.participants.some((member) => member.id === person.id),
    );
    navigate(`/app/conversations/${existing?.id || `contact-${person.id}`}`);
  }
  function closeDetails() {
    chat.setDetails(false);
    detailsButton.current?.focus();
  }
  async function logout() {
    setError("");
    setSigningOut(true);
    try {
      await mutate("post", "/logout");
      setUser(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSigningOut(false);
    }
  }
  async function sendMessage() {
    const key = conversationId!;
    stayAtBottom.current = true;
    if (direct.savedId)
      void direct.realtime.indicateTyping(direct.savedId, false);
    const id = await direct.send(
      chat.drafts[key] || "",
      contact,
      replyMessage?.id,
    );
    if (id && useAuth.getState().user?.id === user?.id) {
      useChat.getState().setDraft(key, "");
      setReplyDraft(null);
      if (routeRef.current === key)
        navigate(`/app/conversations/${id}`, { replace: true });
    }
  }
  const selected = (id: string) => conversationId === id;
  return (
    <div className={`chat-workspace ${conversationId ? "has-selection" : ""}`}>
      <aside className="chat-sidebar" aria-label="Conversations">
        <div className="chat-sidebar-brand">
          <Link className="chat-brand" to="/" aria-label="WebRchat home">
            <span>
              <MessageCircle size={22} />
            </span>
            WebRchat<span className="chat-brand-dot">.</span>
          </Link>
          <span className="chat-personal-label">PERSONAL</span>
        </div>
        <div className="chat-list-heading">
          <div>
            <h1>Messages</h1>
            <span className="chat-message-count">
              {chat.preview
                ? "A little inspiration for your inbox"
                : "Your space for good conversations"}
              {!chat.preview && (
                <span
                  className="chat-live-status"
                  role="status"
                  aria-label="Live connection"
                >
                  {" "}
                  · {direct.realtime.status}
                </span>
              )}
            </span>
          </div>
          <div className="chat-list-actions">
            {!chat.preview && (
              <>
                <GroupUpdates version={direct.groupVersion} />
                <button
                  className="chat-new-button"
                  aria-label="New group"
                  onClick={() => setGroupOpen(true)}
                >
                  <UsersRound size={18} />
                </button>
              </>
            )}
            <button
              className="chat-new-button"
              aria-label="New message"
              onClick={() => setPeopleOpen(true)}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
        <div className="chat-search sidebar-search">
          <Search size={16} />
          <input
            ref={searchRef}
            aria-label="Search conversations"
            placeholder="Search conversations"
            maxLength={100}
            value={chat.search}
            onChange={(e) => chat.setSearch(e.target.value)}
          />
          {chat.search && (
            <button
              className="chat-icon-button"
              aria-label="Clear conversation search"
              onClick={() => {
                chat.setSearch("");
                searchRef.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div
          className="chat-filters"
          role="group"
          aria-label="Filter conversations"
        >
          {(["all", "unread", "groups"] as const).map((filter) => (
            <button
              aria-pressed={chat.filter === filter}
              key={filter}
              onClick={() => chat.setFilter(filter)}
            >
              {filter === "all"
                ? "All"
                : filter === "unread"
                  ? "Unread"
                  : "Groups"}
              {filter === "unread" && unread > 0 && <span>{unread}</span>}
            </button>
          ))}
        </div>
        <div className="chat-list-caption">
          <span>{chat.preview ? "SAMPLE CONVERSATIONS" : "CONVERSATIONS"}</span>
          {!chat.preview && (
            <button
              type="button"
              className="chat-icon-button"
              aria-label="Refresh conversations"
              disabled={direct.listLoading}
              onClick={() => void direct.loadList()}
            >
              ↻
            </button>
          )}
          {chat.preview && <span className="chat-preview-chip">Preview</span>}
        </div>
        {!chat.preview && user && (
          <Suspense fallback={null}>
            <ChatTools userId={user.id} version={direct.groupVersion} />
          </Suspense>
        )}
        <ul className="chat-thread-list" aria-label="Conversation list">
          {sampleRows.map((thread) => (
            <li key={thread.id}>
              <Link
                className={`chat-thread ${selected(thread.id) ? "selected" : ""}`}
                to={`/app/conversations/${thread.id}`}
                aria-current={selected(thread.id) ? "page" : undefined}
              >
                <Avatar
                  name={thread.name}
                  color={thread.color}
                  group={thread.kind === "group"}
                />
                <span className="chat-thread-copy">
                  <span className="chat-thread-top">
                    <strong>{thread.name}</strong>
                    <span className="chat-thread-time">{thread.time}</span>
                  </span>
                  <span className="chat-thread-bottom">
                    <span>
                      {chat.drafts[thread.id] ? (
                        <>
                          <b>Draft: </b>
                          {chat.drafts[thread.id]}
                        </>
                      ) : (
                        thread.lastMessage
                      )}
                    </span>
                    {!chat.read.includes(thread.id) && thread.unread > 0 && (
                      <span
                        className="chat-unread"
                        aria-label={`${thread.unread} sample unread messages`}
                      >
                        {thread.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {savedRows.map((thread) => {
            const person = thread.participants.find(
              (member) => member.id !== user?.id,
            );
            const id = String(thread.id);
            return (
              <li key={id}>
                <Link
                  className={`chat-thread ${selected(id) ? "selected" : ""}`}
                  to={`/app/conversations/${id}`}
                  aria-current={selected(id) ? "page" : undefined}
                >
                  <Avatar
                    name={
                      thread.type === "group"
                        ? thread.name || "Group"
                        : person?.name || "Unavailable member"
                    }
                    group={thread.type === "group"}
                    imageUrl={thread.image_url}
                  />
                  <span className="chat-thread-copy">
                    <span className="chat-thread-top">
                      <strong>
                        {thread.type === "group"
                          ? thread.name || "Group"
                          : person?.name || "Unavailable member"}
                      </strong>
                      <time className="chat-thread-time">
                        {thread.last_message_at
                          ? new Date(
                              thread.last_message_at,
                            ).toLocaleDateString()
                          : "New"}
                      </time>
                    </span>
                    <span className="chat-thread-bottom">
                      <span>
                        {chat.drafts[id]
                          ? `Draft: ${chat.drafts[id]}`
                          : thread.latest_message?.deleted_at
                            ? "Message deleted"
                            : thread.latest_message?.body ||
                              thread.latest_message?.attachments?.[0]?.name ||
                              "No messages yet"}
                      </span>
                      {(thread.unread_count || 0) > 0 && (
                        <span
                          className="chat-unread"
                          aria-label={`${thread.unread_count} unread messages`}
                        >
                          {thread.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {!chat.preview && direct.listLoading && (
            <li className="chat-list-empty" role="status">
              Loading conversations…
            </li>
          )}
          {!chat.preview && direct.listError && (
            <li className="chat-list-empty" role="alert">
              {direct.listError}
              <button
                className="chat-secondary"
                onClick={() => void direct.loadList()}
              >
                Retry conversations
              </button>
            </li>
          )}
          {!chat.preview && direct.listCursor && (
            <li>
              <button
                className="chat-secondary"
                disabled={direct.listLoading}
                onClick={() => void direct.loadList(direct.listCursor!)}
              >
                Load more conversations
              </button>
            </li>
          )}
          {contactRows
            .filter(
              ([, person]) =>
                !direct.conversations.some(
                  (thread) =>
                    thread.type === "direct" &&
                    thread.participants.some(
                      (member) => member.id === person.id,
                    ),
                ),
            )
            .map(([id, person]) => (
              <li key={id}>
                <Link
                  className={`chat-thread ${selected(id) ? "selected" : ""}`}
                  to={`/app/conversations/${id}`}
                  aria-current={selected(id) ? "page" : undefined}
                >
                  <Avatar name={person.name} />
                  <span className="chat-thread-copy">
                    <span className="chat-thread-top">
                      <strong>{person.name}</strong>
                      <span className="chat-draft-label">Draft</span>
                    </span>
                    <span className="chat-thread-bottom">
                      <span>
                        {chat.drafts[id] || "Not sent · stays in this tab"}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          {!sampleRows.length && !contactRows.length && !savedRows.length && (
            <li className="chat-list-empty">
              <MessagesSquare size={26} />
              <strong>
                {chat.search
                  ? "No conversations found"
                  : chat.filter === "unread"
                    ? "No unread conversations"
                    : chat.filter === "groups"
                      ? "No group conversations"
                      : "A fresh start"}
              </strong>
              <p>
                {chat.search
                  ? "Try another name or clear your search."
                  : "Your conversations will find a home here."}
              </p>
            </li>
          )}
        </ul>
        <div className="chat-sidebar-bottom">
          {user?.roles.includes("admin") && (
            <Link className="chat-admin-link" to="/admin">
              <ShieldCheck size={15} /> Administration{" "}
              <ChevronRight size={15} />
            </Link>
          )}
          <button
            className="chat-preview-toggle"
            onClick={() => {
              if (chat.preview) {
                chat.setPreview(false);
                navigate("/app");
              } else openPreview();
            }}
          >
            <Sparkles size={15} />
            {chat.preview ? "Exit design preview" : "Design preview"}
            <ChevronRight size={15} />
          </button>
          <div className="chat-self">
            <Link
              to="/settings"
              className="chat-self-link"
              aria-label="Open your profile settings"
            >
              <Avatar name={user?.name || "You"} size="small" />
              <span>
                <strong>{user?.name}</strong>
                <small>Personal account</small>
              </span>
            </Link>
            <Link
              className="chat-icon-button"
              to="/settings"
              aria-label="Account settings"
            >
              <Settings size={17} />
            </Link>
            <button
              className="chat-icon-button"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="chat-icon-button"
              aria-label="Sign out"
              disabled={signingOut}
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {displayError && (
        <div className="chat-error" role="alert">
          {displayError}
          <button
            className="chat-icon-button"
            aria-label="Dismiss error"
            onClick={() => {
              setError("");
              direct.dismissSendError();
              if (contactError) setLookup({ key: lookupKey, error: "" });
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section className="chat-center" aria-label="Chat window">
        {active ? (
          <>
            <div className="chat-conversation-header">
              <button
                className="chat-icon-button chat-mobile-back"
                aria-label="Back to conversations"
                onClick={() => navigate("/app")}
              >
                <ArrowLeft size={21} />
              </button>
              <Avatar
                name={active.name}
                color={sample?.color}
                group={sample?.kind === "group" || liveGroup}
                imageUrl={liveGroup ? live?.image_url : undefined}
              />
              <div className="chat-header-name">
                <h2>{active.name}</h2>
                <span role="status" aria-label="Contact presence">
                  {sample ? (
                    sample.subtitle
                  ) : (
                    <>
                      <ShieldCheck size={12} />{" "}
                      {liveGroup && live
                        ? `${live.participants.length} members${direct.realtime.online[live.id] ? ` · ${direct.realtime.online[live.id].length} online` : ""}`
                        : live
                          ? direct.realtime.online[live.id]?.includes(
                              peer?.id || 0,
                            )
                            ? "Online"
                            : direct.realtime.online[live.id]
                              ? peer?.last_seen_at
                                ? `Offline · Last active ${new Date(peer.last_seen_at).toLocaleString()}`
                                : "Offline"
                              : "Direct conversation"
                          : "Verified member"}
                    </>
                  )}
                </span>
              </div>
              {sample && <span className="chat-preview-chip">Sample</span>}
              <div className="chat-header-actions">
                {live && (
                  <button
                    className="chat-icon-button"
                    aria-label="Refresh messages"
                    disabled={direct.historyLoading || direct.sending}
                    onClick={() => void direct.loadHistory()}
                  >
                    ↻
                  </button>
                )}
                <button
                  ref={detailsButton}
                  className={`chat-icon-button ${detailsOpen ? "active" : ""}`}
                  aria-label="Conversation details"
                  aria-expanded={detailsOpen}
                  aria-controls="conversation-details"
                  onClick={() => chat.setDetails(!detailsOpen)}
                >
                  <Info size={20} />
                </button>
              </div>
            </div>
            {sample && (
              <div className="chat-preview-banner">
                <Sparkles size={14} />
                <p role="status">
                  <strong>Design preview</strong> · Fictional conversations.
                  Nothing is sent.
                </p>
                <button
                  onClick={() => {
                    chat.setPreview(false);
                    navigate("/app");
                  }}
                >
                  Exit preview
                </button>
              </div>
            )}
            <div
              className="chat-history"
              ref={historyRoot}
              role="region"
              aria-label="Message history"
              onScroll={(event) => {
                const history = event.currentTarget;
                stayAtBottom.current =
                  history.scrollHeight -
                    history.scrollTop -
                    history.clientHeight <
                  80;
              }}
            >
              <div className="chat-history-inner">
                {!sample && direct.historyLoading && (
                  <p role="status">Loading messages…</p>
                )}
                {!sample && direct.historyError && (
                  <div role="alert">
                    {direct.historyError}
                    <button
                      className="chat-secondary"
                      onClick={() => void direct.loadHistory()}
                    >
                      Retry messages
                    </button>
                  </div>
                )}
                {live && direct.historyCursor && (
                  <button
                    className="chat-secondary"
                    disabled={direct.historyLoading}
                    onClick={() => void direct.loadHistory(true)}
                  >
                    Load older messages
                  </button>
                )}
                {live ? (
                  <>
                    {!direct.messages.length &&
                      !direct.historyLoading &&
                      !direct.historyError && (
                        <div className="chat-pending-conversation">
                          <h2>Start the conversation.</h2>
                          <p>Your first message will be saved here.</p>
                        </div>
                      )}
                    {direct.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`chat-message ${message.sender?.id === user?.id ? "outgoing" : "incoming"}`}
                        data-message-id={
                          message.sender?.id !== user?.id
                            ? message.id
                            : undefined
                        }
                      >
                        <div className="chat-message-content">
                          {liveGroup && message.sender?.id !== user?.id && (
                            <span className="chat-message-author">
                              {message.sender?.name || "Former member"}
                            </span>
                          )}
                          {message.reply_to && (
                            <blockquote className="chat-reply-preview">
                              Reply to #{message.reply_to.id}:{" "}
                              {message.reply_to.deleted
                                ? "Message deleted"
                                : message.reply_to.body || "Attachment"}
                            </blockquote>
                          )}
                          {message.body && (
                            <div className="chat-bubble">{message.body}</div>
                          )}
                          <MessageExtras
                            message={message}
                            userId={user!.id}
                            canSend={live.can_send}
                            onUpdate={direct.updateMessage}
                            onReply={() => {
                              setReplyDraft({ key: conversationId, message });
                              document.getElementById("message-draft")?.focus();
                            }}
                            onReport={() => {
                              if (message.sender)
                                setReport({
                                  target: message.sender,
                                  messageId: message.id,
                                });
                            }}
                          />
                          <div className="chat-message-meta">
                            {message.edited_at && !message.deleted_at && (
                              <span>Edited</span>
                            )}
                            <time dateTime={message.created_at}>
                              {new Date(message.created_at).toLocaleString()}
                            </time>
                            {message.sender?.id === user?.id && (
                              <span aria-label="Message status">
                                {message.receipts?.some(
                                  (receipt) => receipt.read_at,
                                )
                                  ? liveGroup
                                    ? `Read by ${message.receipts.filter((receipt) => receipt.read_at).length}`
                                    : "Read"
                                  : message.receipts?.some(
                                        (receipt) => receipt.delivered_at,
                                      )
                                    ? liveGroup
                                      ? `Delivered to ${message.receipts.filter((receipt) => receipt.delivered_at).length}`
                                      : "Delivered"
                                    : "Saved"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : sample ? (
                  <>
                    <div className="chat-date-divider">
                      <span>SAMPLE CONVERSATION</span>
                    </div>
                    {sample.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`chat-message ${message.outgoing ? "outgoing" : "incoming"}`}
                      >
                        {!message.outgoing && (
                          <Avatar
                            name={message.author}
                            color={sample.color}
                            size="tiny"
                          />
                        )}
                        <div className="chat-message-content">
                          {sample.kind === "group" && !message.outgoing && (
                            <span className="chat-message-author">
                              {message.author}
                            </span>
                          )}
                          {message.body && (
                            <div className="chat-bubble">{message.body}</div>
                          )}
                          {message.image && (
                            <button
                              className="chat-message-image"
                              aria-label="Open sample image"
                              onClick={() => setImage(message.image!)}
                            >
                              <img
                                src={message.image.src}
                                alt={message.image.alt}
                              />
                            </button>
                          )}
                          {message.file && (
                            <div className="chat-file-preview">
                              <span>
                                <FileText size={23} />
                              </span>
                              <div>
                                <strong>{message.file.name}</strong>
                                <small>{message.file.size}</small>
                              </div>
                            </div>
                          )}
                          <div className="chat-message-meta">
                            {message.reaction && (
                              <span
                                className="chat-reaction"
                                aria-label="Sample reaction"
                              >
                                {message.reaction}
                              </span>
                            )}
                            <time>{message.time}</time>
                            {message.outgoing && (
                              <CheckCheck
                                size={13}
                                aria-label="Sample read status"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="chat-pending-conversation">
                    <Avatar name={active.name} size="large" />
                    <h2>A conversation with {active.name.split(" ")[0]}.</h2>
                    <p>
                      Write your first message to start a private conversation.
                      Messages are saved when you send.
                    </p>
                    <span>
                      <ShieldCheck size={13} /> Verified member
                    </span>
                  </div>
                )}
                <div ref={end} />
              </div>
            </div>
            {safetyTarget && user && (
              <div className="chat-safety-actions">
                <Suspense fallback={null}>
                  <BlockButton
                    userId={user.id}
                    target={safetyTarget}
                    onChanged={() => void direct.loadHistory()}
                  />
                </Suspense>
                <button
                  type="button"
                  className="chat-secondary"
                  onClick={() => setReport({ target: safetyTarget })}
                >
                  Report member
                </button>
              </div>
            )}
            {live && typingNames.length > 0 && (
              <p
                className="chat-typing"
                role="status"
                aria-label="Typing indicator"
              >
                {typingNames.join(", ")}{" "}
                {typingNames.length === 1 ? "is" : "are"} typing…
              </p>
            )}
            {replyMessage && (
              <div className="chat-reply-composer">
                <span>
                  Replying to {replyMessage.sender?.name || "member"}:{" "}
                  {replyMessage.body || "Attachment"}
                </span>
                <button
                  type="button"
                  className="chat-secondary"
                  disabled={direct.retry || direct.sending}
                  onClick={() => setReplyDraft(null)}
                >
                  Cancel reply
                </button>
              </div>
            )}
            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (!sample) void sendMessage();
              }}
            >
              <div className="chat-compose-box">
                <label className="chat-visually-hidden" htmlFor="message-draft">
                  Message draft
                </label>
                <textarea
                  id="message-draft"
                  disabled={
                    direct.sending ||
                    direct.retry ||
                    Boolean(live && !live.can_send)
                  }
                  value={chat.drafts[conversationId!] || ""}
                  onChange={(e) => {
                    chat.setDraft(conversationId!, e.target.value);
                    if (direct.savedId)
                      void direct.realtime.indicateTyping(
                        direct.savedId,
                        Boolean(e.target.value.trim()),
                      );
                  }}
                  onBlur={() => {
                    if (direct.savedId)
                      void direct.realtime.indicateTyping(
                        direct.savedId,
                        false,
                      );
                  }}
                  placeholder={`Write a draft for ${active.name.split(" ")[0]}…`}
                  maxLength={4000}
                  rows={2}
                />
                <div className="chat-compose-toolbar">
                  <div>
                    <Suspense fallback={null}>
                      <RichComposer
                        key={conversationId}
                        userId={user!.id}
                        conversation={live}
                        contact={contact}
                        disabled={
                          Boolean(sample) ||
                          direct.sending ||
                          direct.retry ||
                          Boolean(live && !live.can_send)
                        }
                        draft={chat.drafts[conversationId!] || ""}
                        replyToId={replyMessage?.id}
                        onEmoji={(value) =>
                          chat.setDraft(
                            conversationId!,
                            (
                              (chat.drafts[conversationId!] || "") + value
                            ).slice(0, 4000),
                          )
                        }
                        onSent={(thread, message) => {
                          direct.acceptAttachment(thread, message);
                          setReplyDraft(null);
                          chat.setDraft(conversationId!, "");
                          navigate(`/app/conversations/${thread.id}`, {
                            replace: true,
                          });
                        }}
                      />
                    </Suspense>
                  </div>
                  <button
                    className="chat-send"
                    type="submit"
                    aria-label={direct.retry ? "Retry send" : "Send message"}
                    disabled={
                      Boolean(sample) ||
                      direct.sending ||
                      direct.historyLoading ||
                      Boolean(live && !live.can_send) ||
                      !(chat.drafts[conversationId!] || "").trim()
                    }
                  >
                    <span>
                      {direct.sending
                        ? "Saving…"
                        : direct.retry
                          ? "Retry send"
                          : "Send"}
                    </span>
                    <Send size={15} />
                  </button>
                </div>
              </div>
              <p className="chat-compose-hint">
                <ShieldCheck size={12} />{" "}
                {sample
                  ? "Preview drafts stay in this tab. Nothing is sent."
                  : live && !live.can_send
                    ? "Sending is unavailable for this conversation."
                    : direct.retry
                      ? "Send not confirmed. Retry safely with the same message."
                      : direct.realtime.status === "Live"
                        ? "Live messages. Read status updates when a message is viewed."
                        : "Messages are saved securely. Reconnecting; you can still send or refresh."}
                {(chat.drafts[conversationId!]?.length || 0) > 3500 && (
                  <span>{chat.drafts[conversationId!].length}/4000</span>
                )}
              </p>
            </form>
          </>
        ) : (
          <div className="chat-empty-main">
            <div className="chat-empty-top">
              <span>
                <span className="chat-connected-dot" /> YOUR PERSONAL SPACE
              </span>
              <button
                className="chat-icon-button"
                aria-label="About this workspace"
                onClick={() => setHelpOpen(true)}
              >
                <CircleHelp size={19} />
              </button>
              {conversationId && (
                <button
                  className="chat-icon-button chat-mobile-back"
                  aria-label="Back to conversations"
                  onClick={() => navigate("/app")}
                >
                  <ArrowLeft size={20} />
                </button>
              )}
            </div>
            <div className="chat-welcome">
              <span className="chat-welcome-icon">
                <MessagesSquare size={42} />
              </span>
              <span className="chat-overline">
                GOOD TO SEE YOU, {user?.name.split(" ")[0]?.toUpperCase()}
              </span>
              <h2>
                {direct.historyLoading && !contactId
                  ? "Loading conversation…"
                  : contactLoading
                    ? "Finding this member…"
                    : conversationId && !validPreviewId
                      ? "This conversation isn’t available."
                      : `A little closer,
one conversation at a time.`}
              </h2>
              <p>
                {contactLoading
                  ? "Checking their public profile."
                  : conversationId && !validPreviewId
                    ? "The link may be invalid, or the member is no longer available to you."
                    : "A home for your people, your ideas, and the conversations that make a difference."}
              </p>
              {!contactLoading && (
                <>
                  {direct.historyError && (
                    <button
                      className="chat-secondary"
                      onClick={() => void direct.loadHistory()}
                    >
                      Retry messages
                    </button>
                  )}
                  <button
                    className="chat-primary"
                    onClick={() => setPeopleOpen(true)}
                  >
                    Find people <ArrowRight size={17} />
                  </button>
                  <button className="chat-empty-preview" onClick={openPreview}>
                    <Sparkles size={14} /> Explore design preview
                  </button>
                  {conversationId && (
                    <Link className="chat-return-link" to="/app">
                      Back to conversations
                    </Link>
                  )}
                </>
              )}
            </div>
            <div className="chat-empty-footer">
              <ShieldCheck size={14} />
              <p>Private by intention. Built for connection.</p>
              <Link to="/roadmap">
                See what’s next <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        )}
      </section>
      {active && detailsOpen && (
        <aside
          id="conversation-details"
          className="chat-details"
          aria-label="Conversation details"
          onKeyDown={(e) => {
            if (e.key === "Escape") closeDetails();
          }}
        >
          <div className="chat-details-title">
            <h2>
              {sample?.kind === "group" || liveGroup
                ? "Group details"
                : "Contact details"}
            </h2>
            <button
              className="chat-icon-button"
              aria-label="Close conversation details"
              onClick={closeDetails}
            >
              <X size={17} />
            </button>
          </div>
          <div className="chat-contact-card">
            <Avatar
              name={active.name}
              color={sample?.color}
              group={sample?.kind === "group" || liveGroup}
              imageUrl={liveGroup ? live?.image_url : undefined}
              size="large"
            />
            <h3>{active.name}</h3>
            <span>
              {sample
                ? "Sample profile"
                : live
                  ? "Conversation participant"
                  : "Verified member"}
            </span>
            <p>{active.bio || "This member hasn’t added a bio yet."}</p>
          </div>
          {liveGroup && live && (
            <div className="chat-detail-section">
              <h3>
                Members <span>{live.participants.length}</span>
              </h3>
              {live.participants.map((member) => (
                <div className="chat-member" key={member.id}>
                  <Avatar name={member.name} size="tiny" />
                  <span>
                    {member.name}
                    <small className="group-role-label">
                      {member.role || "member"}
                    </small>
                  </span>
                </div>
              ))}
              <button
                className="chat-secondary"
                onClick={() => setGroupSettingsId(live.id)}
              >
                <Settings2 size={15} />
                Group settings
              </button>
            </div>
          )}
          {sample?.kind === "group" && (
            <div className="chat-detail-section">
              <h3>
                Sample members <span>{sample.members.length}</span>
              </h3>
              {sample.members.map((name) => (
                <div className="chat-member" key={name}>
                  <Avatar name={name} size="tiny" color={sample.color} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          )}
          <div className="chat-detail-section">
            <h3>
              Shared media{" "}
              <span>
                {sample ? "3 samples" : `${sharedImages.length} loaded`}
              </span>
            </h3>
            {sample ? (
              <div className="chat-media-grid">
                {previewMedia.map((media) => (
                  <button
                    key={media.src}
                    aria-label={`View sample: ${media.alt}`}
                    onClick={() => setImage(media)}
                  >
                    <img src={media.src} alt={media.alt} />
                  </button>
                ))}
              </div>
            ) : sharedImages.length ? (
              <div className="chat-media-grid">
                {sharedImages.map((file) => (
                  <button
                    key={file.id}
                    aria-label={`View image: ${file.name}`}
                    onClick={() => setImage({ src: file.url, alt: file.name })}
                  >
                    <img src={file.url} alt={file.name} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="chat-detail-empty">
                <ImageIcon size={18} /> Shared images will appear here.
              </p>
            )}
          </div>
          <div className="chat-detail-section">
            <h3>
              Shared files{" "}
              <span>
                {sample ? "2 samples" : `${sharedFiles.length} loaded`}
              </span>
            </h3>
            {sample ? (
              ["A-few-thoughts.pdf", "Ideas-for-the-week.txt"].map(
                (name, index) => (
                  <div className="chat-shared-file" key={name}>
                    <span>
                      <FileText size={19} />
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <small>{index ? "12" : "84"} KB · Sample file</small>
                    </div>
                  </div>
                ),
              )
            ) : sharedFiles.length ? (
              sharedFiles.map((file) => (
                <a
                  className="chat-shared-file"
                  key={file.id}
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText size={19} />
                  <span>
                    {file.name} · {Math.ceil(file.size / 1024)} KB
                  </span>
                </a>
              ))
            ) : (
              <p className="chat-detail-empty">
                <FileText size={18} /> No shared files yet.
              </p>
            )}
          </div>
          <div className="chat-privacy-note">
            <ShieldCheck size={17} />
            <p>
              {sample
                ? "These profiles, messages and files are fictional design samples."
                : live
                  ? "Only participants can access this saved conversation."
                  : "Your first message starts a private conversation with this member."}
            </p>
          </div>
        </aside>
      )}
      {notice && (
        <div className="chat-notice" role="status">
          <ShieldCheck size={15} />
          <span>{notice}</span>
          <button
            className="chat-icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <Suspense
        fallback={
          <div className="chat-notice" role="status">
            Opening group…
          </div>
        }
      >
        {groupOpen && (
          <GroupDialog
            onClose={() => setGroupOpen(false)}
            onCreated={(group) => {
              direct.adoptConversation(group);
              chat.setPreview(false);
              setGroupOpen(false);
              navigate(`/app/conversations/${group.id}`);
            }}
          />
        )}
        {groupSettingsId === live?.id && liveGroup && live && (
          <GroupManager
            group={live}
            onClose={() => setGroupSettingsId(null)}
            onChanged={direct.adoptConversation}
            onLeft={() => {
              direct.dropConversation(live.id);
              setGroupSettingsId(null);
              navigate("/app");
            }}
          />
        )}
      </Suspense>
      {report && user && (
        <Suspense fallback={null}>
          <ReportDialog
            userId={user.id}
            target={report.target}
            messageId={report.messageId}
            onClose={() => setReport(null)}
          />
        </Suspense>
      )}
      {peopleOpen && (
        <PeopleDialog
          onClose={() => setPeopleOpen(false)}
          onSelect={selectContact}
        />
      )}
      {image && (
        <Modal
          title="Sample image"
          className="chat-image-modal"
          onClose={() => setImage(null)}
        >
          <img src={image.src} alt={image.alt} />
          <p className="chat-dialog-intro">
            Original illustration for the design preview. No user-uploaded
            attachment.
          </p>
        </Modal>
      )}
      {helpOpen && (
        <Modal
          title="A space for good conversations"
          onClose={() => setHelpOpen(false)}
        >
          <p className="chat-dialog-intro">
            Your account, profile and sessions are ready. You can find verified
            members and send direct text messages. Conversations and messages
            are saved to your account. New messages appear live, with typing,
            presence and read receipts. Reconnecting catches up from saved
            history.
          </p>
          <p className="chat-dialog-intro">
            The optional design preview uses fictional profiles, messages and
            shared files. Drafts stay in memory and clear when you sign out or
            refresh.
          </p>
          <Link className="chat-primary" to="/roadmap">
            View roadmap <ArrowRight size={16} />
          </Link>
        </Modal>
      )}
    </div>
  );
}
