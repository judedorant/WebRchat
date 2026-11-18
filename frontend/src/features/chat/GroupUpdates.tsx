import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { mutate, errorMessage } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import { Modal } from "./Modal";
interface Notice {
  id: string;
  data: {
    conversation_id: number;
    group_name: string;
    action: string;
    actor_name: string;
    role?: string;
  };
  read_at: string | null;
  created_at: string;
}
interface NoticePage {
  data: Notice[];
  meta: { next_cursor: string | null; unread_count: number };
}
const actions: Record<string, string> = {
  added: "You were added",
  removed: "You were removed",
  left: "You left",
  renamed: "Group renamed",
  image_changed: "Group image updated",
  role_changed: "Your role changed",
  ownership_transferred: "You are now the owner",
};
export function GroupUpdates({ version }: { version: number }) {
  const user = useAuth((state) => state.user);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Notice[]>([]);
  const [count, setCount] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const ownId = user?.id;
  const marking = useRef(new Set<string>());
  const load = useCallback(
    async (next?: string, signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      try {
        const response = await api.get<NoticePage>("/group-notifications", {
          params: { cursor: next },
          signal,
        });
        if (signal?.aborted || useAuth.getState().user?.id !== ownId) return;
        setRows((current) =>
          next
            ? [
                ...new Map(
                  [...current, ...response.data.data].map((row) => [
                    row.id,
                    row,
                  ]),
                ).values(),
              ]
            : response.data.data,
        );
        setCount(response.data.meta.unread_count);
        setCursor(response.data.meta.next_cursor);
      } catch (error) {
        if (!signal?.aborted && useAuth.getState().user?.id === ownId)
          setError(errorMessage(error));
      } finally {
        if (!signal?.aborted && useAuth.getState().user?.id === ownId)
          setBusy(false);
      }
    },
    [ownId],
  );
  useEffect(() => {
    if (!user?.realtime_enabled && !open) return;
    const controller = new AbortController();
    api
      .get<NoticePage>("/group-notifications", { signal: controller.signal })
      .then((response) => {
        if (
          !controller.signal.aborted &&
          useAuth.getState().user?.id === ownId
        ) {
          setRows(response.data.data);
          setCount(response.data.meta.unread_count);
          setCursor(response.data.meta.next_cursor);
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && useAuth.getState().user?.id === ownId)
          setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted && useAuth.getState().user?.id === ownId)
          setBusy(false);
      });
    return () => controller.abort();
  }, [ownId, version, open, user?.realtime_enabled]);
  async function read(row: Notice, visit = false) {
    if (marking.current.has(row.id)) return;
    marking.current.add(row.id);
    try {
      await mutate("patch", `/group-notifications/${row.id}`, undefined, {
        "X-Chat-Account": String(ownId),
      });
      if (useAuth.getState().user?.id !== ownId) return;
      setRows((current) =>
        current.map((notice) =>
          notice.id === row.id
            ? { ...notice, read_at: new Date().toISOString() }
            : notice,
        ),
      );
      if (!row.read_at) setCount((value) => Math.max(0, value - 1));
      if (visit) {
        setOpen(false);
        navigate(`/app/conversations/${row.data.conversation_id}`);
      }
    } catch (error) {
      if (useAuth.getState().user?.id === ownId) setError(errorMessage(error));
    } finally {
      marking.current.delete(row.id);
    }
  }
  return (
    <>
      <button
        className="chat-new-button"
        aria-label="Group updates"
        onClick={() => {
          setBusy(true);
          setOpen(true);
        }}
      >
        <Bell size={17} />
        {count > 0 && <span className="group-notice-count">{count}</span>}
      </button>
      {open && (
        <Modal title="Group updates" onClose={() => setOpen(false)}>
          {error && (
            <div role="alert" className="group-error">
              {error}
              <button className="chat-secondary" onClick={() => void load()}>
                Retry updates
              </button>
            </div>
          )}
          {busy && <p role="status">Loading group updates…</p>}
          {!busy && !rows.length && !error && (
            <p className="chat-dialog-intro">
              Your group membership updates will appear here.
            </p>
          )}
          <ul className="group-notices">
            {rows.map((row) => (
              <li key={row.id} className={row.read_at ? "" : "unread"}>
                <h3>{row.data.group_name}</h3>
                <p>
                  {actions[row.data.action] || "Group updated"}
                  {row.data.role ? ` · ${row.data.role}` : ""}
                </p>
                <small>
                  By {row.data.actor_name} ·{" "}
                  {new Date(row.created_at).toLocaleString()}
                </small>
                <div>
                  {!["removed", "left"].includes(row.data.action) && (
                    <button
                      className="chat-secondary"
                      onClick={() => void read(row, true)}
                    >
                      Open group
                    </button>
                  )}
                  {!row.read_at && (
                    <button
                      className="chat-secondary"
                      onClick={() => void read(row)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {cursor && (
            <button
              className="chat-secondary"
              disabled={busy}
              onClick={() => void load(cursor)}
            >
              Load more updates
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
