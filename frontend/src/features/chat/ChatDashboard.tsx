import { useEffect, useRef, useState } from "react";
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
  Mic,
  Moon,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Sun,
  X,
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
import "./chat.css";
function useWideScreen() {
  const [wide, setWide] = useState(
    () => window.matchMedia?.("(min-width: 1280px)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(min-width: 1280px)");
    if (!query) return;
    const change = () => setWide(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return wide;
}
export function ChatDashboard() {
  const user = useAuth((s) => s.user),
    setUser = useAuth((s) => s.setUser);
  const { dark, toggleTheme } = usePreferences(),
    chat = useChat(),
    navigate = useNavigate(),
    { conversationId } = useParams();
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
  const active = sample || contact;
  const location = useLocation();
  const lookupKey = `${location.key}:${contactId || ""}`;
  const contactLoading = Boolean(
    contactId && !contact && lookup?.key !== lookupKey,
  );
  const contactError = lookup?.key === lookupKey ? lookup.error : "";
  const displayError = contactError || error;
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
    : 0;
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
  useEffect(() => {
    if (sample) useChat.getState().markRead(sample.id);
    end.current?.scrollIntoView?.({ behavior: "auto" });
  }, [conversationId, sample]);
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
    setNotice("Draft opened. Nothing has been sent.");
    chat.addContact(person);
    setPeopleOpen(false);
    navigate(`/app/conversations/contact-${person.id}`);
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
            </span>
          </div>
          <button
            className="chat-new-button"
            aria-label="New message"
            onClick={() => setPeopleOpen(true)}
          >
            <Plus size={20} />
          </button>
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
          {chat.preview && <span className="chat-preview-chip">Preview</span>}
        </div>
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
          {contactRows.map(([id, person]) => (
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
          {!sampleRows.length && !contactRows.length && (
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
                group={sample?.kind === "group"}
              />
              <div className="chat-header-name">
                <h2>{active.name}</h2>
                <span>
                  {sample ? (
                    sample.subtitle
                  ) : (
                    <>
                      <ShieldCheck size={12} /> Verified member
                    </>
                  )}
                </span>
              </div>
              {sample && <span className="chat-preview-chip">Sample</span>}
              <div className="chat-header-actions">
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
              role="region"
              aria-label="Message history"
            >
              <div className="chat-history-inner">
                {sample ? (
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
                      You can prepare a draft here. No conversation or message
                      has been saved.
                    </p>
                    <span>
                      <ShieldCheck size={13} /> Verified member
                    </span>
                  </div>
                )}
                <div ref={end} />
              </div>
            </div>
            <form
              className="chat-composer"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="chat-compose-box">
                <label className="chat-visually-hidden" htmlFor="message-draft">
                  Message draft
                </label>
                <textarea
                  id="message-draft"
                  value={chat.drafts[conversationId!] || ""}
                  onChange={(e) =>
                    chat.setDraft(conversationId!, e.target.value)
                  }
                  placeholder={`Write a draft for ${active.name.split(" ")[0]}…`}
                  maxLength={4000}
                  rows={2}
                />
                <div className="chat-compose-toolbar">
                  <div>
                    <button
                      type="button"
                      className="chat-icon-button"
                      aria-label="Attach a file — not available yet"
                      disabled
                    >
                      <Paperclip size={19} />
                    </button>
                    <button
                      type="button"
                      className="chat-icon-button"
                      aria-label="Emoji picker — not available yet"
                      disabled
                    >
                      <Smile size={19} />
                    </button>
                    <button
                      type="button"
                      className="chat-icon-button"
                      aria-label="Voice message — not available yet"
                      disabled
                    >
                      <Mic size={19} />
                    </button>
                  </div>
                  <button
                    className="chat-send"
                    type="submit"
                    aria-label="Send message"
                    disabled
                  >
                    <span>Send</span>
                    <Send size={15} />
                  </button>
                </div>
              </div>
              <p className="chat-compose-hint">
                <ShieldCheck size={12} /> Drafts stay in this tab. Sending isn’t
                available yet.
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
                {contactLoading
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
              {sample?.kind === "group" ? "Group details" : "Contact details"}
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
              group={sample?.kind === "group"}
              size="large"
            />
            <h3>{active.name}</h3>
            <span>{sample ? "Sample profile" : "Verified member"}</span>
            <p>{active.bio || "This member hasn’t added a bio yet."}</p>
          </div>
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
              Shared media <span>{sample ? "3 samples" : "0"}</span>
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
            ) : (
              <p className="chat-detail-empty">
                <ImageIcon size={18} /> Shared images will appear here.
              </p>
            )}
          </div>
          <div className="chat-detail-section">
            <h3>
              Shared files <span>{sample ? "2 samples" : "0"}</span>
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
                : "Only the member’s public profile is shown. No private conversation has been created."}
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
            members and prepare temporary drafts. Sending messages and saving
            conversations aren’t available yet.
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
