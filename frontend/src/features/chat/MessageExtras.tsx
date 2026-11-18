import { useRef, useState } from "react";
import { mutate, errorMessage } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import type { SavedMessage } from "./useDirectMessaging";
import { Modal } from "./Modal";
import { emoji } from "./emoji";
export function MessageExtras({
  message,
  userId,
  canSend,
  onUpdate,
  onReport,
  onReply,
}: {
  message: SavedMessage;
  userId: number;
  canSend: boolean;
  onUpdate: (message: SavedMessage) => void;
  onReport: () => void;
  onReply?: () => void;
}) {
  const [picker, setPicker] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function react(value: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const exists = message.reactions?.some(
        (item) => item.user_id === userId && item.emoji === value,
      );
      const response = await mutate<{ data: SavedMessage }>(
        exists ? "delete" : "put",
        `/messages/${message.id}/reactions`,
        { emoji: value },
        { "X-Chat-Account": String(userId) },
      );
      if (useAuth.getState().user?.id === userId) onUpdate(response.data);
      setPicker(false);
    } catch (error) {
      if (useAuth.getState().user?.id === userId) setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const [action, setAction] = useState<"edit" | "delete" | null>(null);
  const [body, setBody] = useState("");
  const actionLock = useRef(false);
  async function change() {
    if (actionLock.current || !action) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await mutate<{ data: SavedMessage }>(
        action === "delete" ? "delete" : "patch",
        `/messages/${message.id}`,
        action === "edit" ? { body } : undefined,
        { "X-Chat-Account": String(userId) },
      );
      if (useAuth.getState().user?.id === userId) {
        onUpdate(response.data);
        setAction(null);
      }
    } catch (error) {
      if (useAuth.getState().user?.id === userId) setError(errorMessage(error));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  if (message.deleted_at)
    return <p className="chat-deleted-message">Message deleted</p>;
  const counts = new Map<string, number>();
  message.reactions?.forEach((item) =>
    counts.set(item.emoji, (counts.get(item.emoji) ?? 0) + 1),
  );
  return (
    <div className="chat-message-extras">
      {message.attachments?.map((file) => (
        <div key={file.id} className="chat-attachment">
          {file.kind === "image" && (
            <a href={file.url} target="_blank" rel="noreferrer">
              <img src={file.url} alt={file.name} loading="lazy" />
            </a>
          )}
          {file.kind === "voice" && (
            <audio
              controls
              preload="none"
              src={file.url}
              aria-label={`Voice message: ${file.name}`}
            />
          )}
          <a href={file.url} target="_blank" rel="noreferrer">
            {file.name} · {Math.ceil(file.size / 1024)} KB
          </a>
        </div>
      ))}
      <div className="chat-reaction-actions">
        {canSend && onReply && (
          <button
            type="button"
            aria-label={`Reply to message ${message.id}`}
            onClick={onReply}
          >
            Reply
          </button>
        )}
        {message.sender?.id === userId && (
          <>
            {canSend && (message.type === "text" || !message.type) && (
              <button
                type="button"
                aria-label={`Edit message ${message.id}`}
                onClick={() => {
                  setBody(message.body || "");
                  setAction("edit");
                  setError("");
                }}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              aria-label={`Delete message ${message.id}`}
              onClick={() => {
                setAction("delete");
                setError("");
              }}
            >
              Delete
            </button>
          </>
        )}
        {[...counts].map(([value, count]) => (
          <button
            type="button"
            key={value}
            disabled={!canSend || busy}
            aria-label={`${value} reaction, ${count}`}
            aria-pressed={message.reactions?.some(
              (item) => item.emoji === value && item.user_id === userId,
            )}
            onClick={() => void react(value)}
          >
            {value} {count}
          </button>
        ))}
        <button
          type="button"
          disabled={!canSend || busy}
          aria-label={`React to message ${message.id}`}
          onClick={() => setPicker(!picker)}
        >
          React
        </button>
        {message.sender && message.sender.id !== userId && (
          <button
            type="button"
            aria-label={`Report message ${message.id}`}
            onClick={onReport}
          >
            Report
          </button>
        )}
      </div>
      {picker && (
        <div role="group" aria-label="Reaction choices">
          {emoji.map((value) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              aria-label={`React ${value}`}
              onClick={() => void react(value)}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      {action && (
        <Modal
          title={action === "edit" ? "Edit message" : "Delete message?"}
          onClose={() => {
            if (!actionLock.current) setAction(null);
          }}
        >
          {action === "edit" ? (
            <label>
              Edited message
              <textarea
                value={body}
                maxLength={4000}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
          ) : (
            <p>
              This removes the message and its attachments from the
              conversation. Reports already submitted retain their selected
              evidence.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            className="chat-primary"
            disabled={busy || (action === "edit" && !body.trim())}
            onClick={() => void change()}
          >
            {busy
              ? "Saving…"
              : action === "edit"
                ? "Save edit"
                : "Confirm delete"}
          </button>
        </Modal>
      )}
      {!action && error && <p role="alert">{error}</p>}
    </div>
  );
}
