import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { api } from "../../lib/api";
import { errorMessage, mutate } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import type { Contact } from "./types";
import { useRealtime, type ChatSignal } from "./useRealtime";

export interface SavedMessage {
  id: number;
  conversation_id: number;
  sender: Contact | null;
  client_uuid: string;
  body: string | null;
  deleted_at?: string | null;
  edited_at?: string | null;
  reply_to?: {
    id: number;
    sender_id: number;
    body: string | null;
    deleted: boolean;
  } | null;
  type?: "text" | "image" | "file" | "voice";
  attachments?: {
    id: number;
    name: string;
    mime_type: string;
    size: number;
    kind: "image" | "file" | "voice";
    url: string;
  }[];
  reactions?: { user_id: number; emoji: string }[];
  created_at: string;
  receipts?: {
    user_id: number;
    delivered_at: string | null;
    read_at: string | null;
  }[];
}
export interface SavedConversation {
  id: number;
  type: "direct" | "group";
  name?: string | null;
  image_url?: string | null;
  my_role?: "owner" | "admin" | "member";
  can_manage?: boolean;
  can_manage_roles?: boolean;
  participants: Contact[];
  latest_message: SavedMessage | null;
  can_send: boolean;
  unread_count?: number;
  last_message_at: string | null;
  created_at: string;
}
interface Page<T> {
  data: T[];
  meta: { next_cursor: string | null };
}
interface Attempt {
  reply_to_id?: number;
  route: string;
  body: string;
  client_uuid: string;
  conversation?: SavedConversation;
}
const merge = <T extends { id: number }>(previous: T[], next: T[]) => [
  ...new Map([...previous, ...next].map((item) => [item.id, item])).values(),
];

// The dashboard is keyed by account identity. Requests additionally check that the
// same identity is still signed in before applying any private data or navigation.
export function useDirectMessaging(
  userId: number | undefined,
  route: string | undefined,
  preview: boolean,
) {
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [groupVersion, setGroupVersion] = useState(0);
  const [history, setHistory] = useState<{
    key?: string;
    thread: SavedConversation | null;
    messages: SavedMessage[];
    cursor: string | null;
    loading: boolean;
    error: string;
  }>({ thread: null, messages: [], cursor: null, loading: false, error: "" });
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [sendFailure, setSendFailure] = useState<{
    key?: string;
    message: string;
  }>({ message: "" });
  const sendError = sendFailure.key === route ? sendFailure.message : "";
  const [sending, setSending] = useState(false);
  const [retryRoutes, setRetryRoutes] = useState<string[]>([]);
  const attempts = useRef(new Map<string, Attempt>());
  const busy = useRef(false);
  const current = useRef(route);
  const listVersion = useRef(0);
  useEffect(() => {
    current.current = route;
  }, [route]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const valid = useCallback(
    () => alive.current && useAuth.getState().user?.id === userId,
    [userId],
  );
  const savedId = !preview && /^\d+$/.test(route || "") ? Number(route) : null;
  const matchingHistory = history.key === route;
  const historyLoading = Boolean(
    savedId && (!matchingHistory || history.loading),
  );
  const historyError = matchingHistory ? history.error : "";
  const historyCursor = matchingHistory ? history.cursor : null;
  const active =
    (matchingHistory ? history.thread : null) ||
    conversations.find((item) => item.id === savedId) ||
    null;

  const loadList = useCallback(
    async (cursor?: string) => {
      const version = ++listVersion.current;
      setListLoading(true);
      setListError("");
      try {
        const response = await api.get<Page<SavedConversation>>(
          "/conversations",
          { params: { cursor, per_page: 30 } },
        );
        if (!valid() || version !== listVersion.current) return;
        setConversations((previous) =>
          cursor ? merge(previous, response.data.data) : response.data.data,
        );
        setListCursor(response.data.meta.next_cursor);
      } catch (error) {
        if (valid() && version === listVersion.current)
          setListError(errorMessage(error));
      } finally {
        if (valid() && version === listVersion.current) setListLoading(false);
      }
    },
    [valid],
  );
  useEffect(() => {
    const controller = new AbortController();
    const version = ++listVersion.current;
    api
      .get<Page<SavedConversation>>("/conversations", {
        params: { per_page: 30 },
        signal: controller.signal,
      })
      .then((response) => {
        if (
          !controller.signal.aborted &&
          valid() &&
          version === listVersion.current
        ) {
          setConversations(response.data.data);
          setListCursor(response.data.meta.next_cursor);
        }
      })
      .catch((error) => {
        if (
          !controller.signal.aborted &&
          valid() &&
          version === listVersion.current
        )
          setListError(errorMessage(error));
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          valid() &&
          version === listVersion.current
        )
          setListLoading(false);
      });
    return () => controller.abort();
  }, [valid]);

  useEffect(() => {
    if (!savedId) return;
    const controller = new AbortController();
    Promise.all([
      api.get<{ data: SavedConversation }>(`/conversations/${savedId}`, {
        signal: controller.signal,
      }),
      api.get<Page<SavedMessage>>(`/conversations/${savedId}/messages`, {
        signal: controller.signal,
      }),
    ])
      .then(([detail, page]) => {
        if (!controller.signal.aborted && valid())
          setHistory((previous) => ({
            key: route,
            thread: detail.data.data,
            messages: merge(
              page.data.data,
              previous.key === route ? previous.messages : [],
            ),
            cursor: page.data.meta.next_cursor,
            loading: false,
            error: "",
          }));
      })
      .catch((error) => {
        if (!controller.signal.aborted && valid())
          setHistory({
            key: route,
            thread: null,
            messages: [],
            cursor: null,
            loading: false,
            error: errorMessage(error),
          });
      });
    return () => controller.abort();
  }, [savedId, route, valid]);

  async function loadHistory(older = false) {
    if (!savedId || historyLoading || busy.current) return;
    const key = route;
    setHistory((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const [page, detail] = await Promise.all([
        api.get<Page<SavedMessage>>(`/conversations/${savedId}/messages`, {
          params: { cursor: older ? historyCursor : undefined },
        }),
        api.get<{ data: SavedConversation }>(`/conversations/${savedId}`),
      ]);
      if (!valid() || current.current !== key) return;
      setConversations((previous) => merge(previous, [detail.data.data]));
      setHistory((previous) => ({
        key,
        thread: detail.data.data,
        messages: older
          ? merge(previous.messages, page.data.data)
          : page.data.data,
        cursor: page.data.meta.next_cursor,
        loading: false,
        error: "",
      }));
    } catch (error) {
      if (valid() && current.current === key)
        setHistory((previous) => ({
          ...previous,
          loading: false,
          error: errorMessage(error),
        }));
    }
  }

  const syncBusy = useRef(new Set<number>());
  const syncAgain = useRef(new Set<number>());
  const receiptDirty = useRef(new Set<number>());
  async function receiveSignal(signal: ChatSignal) {
    if (!valid()) return;
    if (
      ["membership", "message", "reconnect", "conversation"].includes(
        signal.kind,
      )
    )
      setGroupVersion((value) => value + 1);
    const id = signal.conversation_id || savedId;
    if (signal.kind === "reconnect") void loadList();
    if (!id) return;
    if (
      signal.kind === "receipt" ||
      signal.kind === "reaction" ||
      signal.kind === "change" ||
      signal.kind === "reconnect"
    )
      receiptDirty.current.add(id);
    if (syncBusy.current.has(id)) {
      syncAgain.current.add(id);
      return;
    }
    syncBusy.current.add(id);
    try {
      do {
        syncAgain.current.delete(id);
        const refreshReceipts = receiptDirty.current.delete(id);
        const key = String(id);
        const detail = await api.get<{ data: SavedConversation }>(
          `/conversations/${id}`,
        );
        if (!valid()) return;
        setConversations((previous) => merge(previous, [detail.data.data]));
        if (current.current !== key) continue;
        const known = history.key === key ? history.messages : [];
        const highest = known.reduce((max, item) => Math.max(max, item.id), 0);
        let cursor: string | null = null;
        let updates: SavedMessage[] = [];
        let firstCursor: string | null = null;
        do {
          const page: { data: Page<SavedMessage> } = await api.get<
            Page<SavedMessage>
          >(`/conversations/${id}/messages`, {
            params: highest
              ? {
                  after_id: highest,
                  cursor: cursor || undefined,
                  per_page: 100,
                }
              : { per_page: 30 },
          });
          updates = merge(updates, page.data.data);
          if (!highest) firstCursor = page.data.meta.next_cursor;
          cursor = highest ? page.data.meta.next_cursor : null;
        } while (cursor && valid() && current.current === key);
        if (refreshReceipts) {
          for (let start = 0; start < known.length; start += 100) {
            if (!valid() || current.current !== key) return;
            const fresh = await api.get<{ data: SavedMessage[] }>(
              `/conversations/${id}/messages`,
              {
                params: {
                  ids: known.slice(start, start + 100).map((item) => item.id),
                },
              },
            );
            updates = merge(updates, fresh.data.data);
          }
        }
        if (!valid() || current.current !== key) return;
        setHistory((previous) => ({
          key,
          thread: detail.data.data,
          messages: merge(
            previous.key === key ? previous.messages : [],
            updates,
          ),
          cursor:
            highest && previous.key === key ? previous.cursor : firstCursor,
          loading: false,
          error: "",
        }));
      } while (syncAgain.current.has(id) && valid());
    } catch (error) {
      if (
        valid() &&
        axios.isAxiosError(error) &&
        [401, 403, 404].includes(error.response?.status || 0)
      ) {
        setConversations((previous) =>
          previous.filter((item) => item.id !== id),
        );
        if (current.current === String(id))
          setHistory({
            key: String(id),
            thread: null,
            messages: [],
            cursor: null,
            loading: false,
            error: errorMessage(error),
          });
      }
    } finally {
      syncBusy.current.delete(id);
      if (valid() && syncAgain.current.has(id))
        void receiveSignal({ ...signal, kind: "reconnect" });
    }
  }
  const liveEnabled = useAuth((state) => state.user?.realtime_enabled);
  const realtime = useRealtime(
    userId,
    Boolean(liveEnabled) && !preview,
    [
      ...conversations.filter((item) => item.can_send).map((item) => item.id),
      ...(savedId && active?.can_send ? [savedId] : []),
    ],
    receiveSignal,
  );

  async function send(
    body: string,
    contact: Contact | undefined,
    replyToId?: number,
  ): Promise<number | null> {
    if (
      busy.current ||
      !route ||
      !body.trim() ||
      preview ||
      (savedId && historyLoading)
    )
      return null;
    busy.current = true;
    setSending(true);
    setSendFailure({ key: route, message: "" });
    const key = route;
    const pending = attempts.current.get(key) || {
      route: key,
      reply_to_id: replyToId,
      body,
      client_uuid: crypto.randomUUID(),
      conversation: active || undefined,
    };
    attempts.current.set(key, pending);
    try {
      if (!pending.conversation) {
        if (!contact) throw new Error("No recipient selected");
        const response = await mutate<{ data: SavedConversation }>(
          "post",
          "/conversations",
          { recipient_id: contact.id },
          { "X-Chat-Account": String(userId) },
        );
        if (!valid()) return null;
        pending.conversation = response.data;
      }
      const id = pending.conversation.id;
      const response = await mutate<{ data: SavedMessage }>(
        "post",
        `/conversations/${id}/messages`,
        {
          body: pending.body,
          client_uuid: pending.client_uuid,
          ...(pending.reply_to_id ? { reply_to_id: pending.reply_to_id } : {}),
        },
        { "X-Chat-Account": String(userId) },
      );
      if (!valid()) return null;
      const updated = {
        ...pending.conversation,
        latest_message: response.data,
        last_message_at: response.data.created_at,
      };
      listVersion.current++;
      setListLoading(false);
      setConversations((previous) => merge(previous, [updated]));
      if (current.current === key)
        setHistory((previous) => ({
          key: String(id),
          thread: updated,
          messages: merge(
            previous.key === String(id) ? previous.messages : [],
            [response.data],
          ),
          cursor: previous.key === String(id) ? previous.cursor : null,
          loading: false,
          error: "",
        }));
      attempts.current.delete(key);
      setRetryRoutes((previous) => previous.filter((item) => item !== key));
      return id;
    } catch (error) {
      if (valid()) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        const ambiguous =
          !status || status >= 500 || [401, 403, 419, 429].includes(status);
        if (!ambiguous) attempts.current.delete(key);
        setRetryRoutes((previous) =>
          ambiguous
            ? [...new Set([...previous, key])]
            : previous.filter((item) => item !== key),
        );
        if (current.current === key)
          setSendFailure({ key, message: errorMessage(error) });
      }
      return null;
    } finally {
      busy.current = false;
      if (valid()) setSending(false);
    }
  }
  return {
    conversations,
    active,
    messages: history.messages
      .filter((message) => message.conversation_id === savedId)
      .toSorted((a, b) => a.id - b.id),
    listCursor,
    historyCursor,
    listLoading,
    historyLoading,
    listError,
    historyError,
    sendError,
    sending,
    retry: retryRoutes.includes(route || ""),
    loadList,
    loadHistory,
    send,
    realtime,
    savedId,
    groupVersion,
    adoptConversation: (group: SavedConversation) => {
      if (!valid()) return;
      setConversations((current) => merge(current, [group]));
      setHistory((current) =>
        current.key === String(group.id)
          ? { ...current, thread: group }
          : current,
      );
    },
    dropConversation: (id: number) => {
      if (!valid()) return;
      setConversations((current) =>
        current.filter((thread) => thread.id !== id),
      );
      setHistory((current) =>
        current.key === String(id)
          ? { ...current, thread: null, messages: [], cursor: null }
          : current,
      );
    },
    updateMessage: (message: SavedMessage) => {
      if (!valid()) return;
      setHistory((previous) =>
        previous.key === String(message.conversation_id)
          ? { ...previous, messages: merge(previous.messages, [message]) }
          : previous,
      );
    },
    acceptAttachment: (
      conversation: SavedConversation,
      message: SavedMessage,
    ) => {
      if (!valid()) return;
      const updated = {
        ...conversation,
        latest_message: message,
        last_message_at: message.created_at,
      };
      setConversations((previous) => merge(previous, [updated]));
      setHistory((previous) => ({
        key: String(conversation.id),
        thread: updated,
        messages: merge(
          previous.key === String(conversation.id) ? previous.messages : [],
          [message],
        ),
        cursor:
          previous.key === String(conversation.id) ? previous.cursor : null,
        loading: false,
        error: "",
      }));
    },
    dismissSendError: () => setSendFailure({ key: route, message: "" }),
  };
}
