import { useEffect, useRef, type RefObject } from "react";
import { mutate } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import type { SavedMessage, SavedConversation } from "./useDirectMessaging";

export function useMessageReceipts(
  userId: number | undefined,
  conversationId: number | null,
  enabled: boolean,
  connection: string,
  messages: SavedMessage[],
  root: RefObject<HTMLDivElement | null>,
) {
  const acknowledged = useRef(new Map<number, "delivered" | "read">());
  const inFlight = useRef(new Set<string>());
  const reads = useRef(new Set<number>());
  const incoming = messages.filter(
    (message) => !message.deleted_at && message.sender?.id !== userId,
  );
  const key = incoming
    .map(
      (message) =>
        `${message.id}:${message.receipts?.find((receipt) => receipt.user_id === userId)?.read_at || ""}`,
    )
    .join(",");
  useEffect(() => {
    if (!enabled || !conversationId || !userId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const valid = () => !stopped && useAuth.getState().user?.id === userId;
    const ids = key
      ? key.split(",").map((item) => Number(item.split(":")[0]))
      : [];
    async function record(selected: number[], status: "delivered" | "read") {
      const pending = selected.filter(
        (id) =>
          acknowledged.current.get(id) !== "read" &&
          !(status === "delivered" && acknowledged.current.has(id)) &&
          !inFlight.current.has(`${id}:${status}`),
      );
      for (let offset = 0; offset < pending.length; offset += 100) {
        const chunk = pending.slice(offset, offset + 100);
        chunk.forEach((id) => inFlight.current.add(`${id}:${status}`));
        try {
          await mutate(
            "post",
            `/conversations/${conversationId}/receipts`,
            { message_ids: chunk, status },
            { "X-Chat-Account": String(userId) },
          );
          if (valid())
            chunk.forEach((id) => {
              if (acknowledged.current.get(id) !== "read")
                acknowledged.current.set(id, status);
              if (status === "read") reads.current.delete(id);
            });
        } catch {
          /* Receipts retry on visibility, reconnect, or the next history update. */
        } finally {
          chunk.forEach((id) => inFlight.current.delete(`${id}:${status}`));
        }
      }
    }
    function flush() {
      if (!valid() || document.visibilityState !== "visible") return;
      void record(
        [...reads.current].filter((id) => ids.includes(id)),
        "read",
      );
    }
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (!valid() || document.visibilityState !== "visible") return;
              for (const entry of entries)
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                  const id = Number(
                    (entry.target as HTMLElement).dataset.messageId,
                  );
                  if (ids.includes(id)) reads.current.add(id);
                }
              clearTimeout(timer);
              timer = setTimeout(flush, 150);
            },
            { root: root.current, threshold: 0.5 },
          )
        : null;
    function observe() {
      observer?.disconnect();
      root.current
        ?.querySelectorAll<HTMLElement>("[data-message-id]")
        .forEach((element) => observer?.observe(element));
      if (document.visibilityState === "visible") flush();
    }
    void record(ids, "delivered");
    observe();
    document.addEventListener("visibilitychange", observe);
    window.addEventListener("online", observe);
    return () => {
      stopped = true;
      clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", observe);
      window.removeEventListener("online", observe);
    };
  }, [key, conversationId, userId, enabled, connection, root]);
}

export function useInboxDelivery(
  userId: number | undefined,
  enabled: boolean,
  connection: string,
  conversations: SavedConversation[],
) {
  const done = useRef(new Set<number>());
  const busy = useRef(new Set<number>());
  const key = conversations
    .flatMap((thread) =>
      thread.latest_message &&
      !thread.latest_message.deleted_at &&
      thread.latest_message.sender?.id !== userId &&
      !thread.latest_message.receipts?.some(
        (receipt) => receipt.user_id === userId && receipt.delivered_at,
      )
        ? [`${thread.id}:${thread.latest_message.id}`]
        : [],
    )
    .join(",");
  useEffect(() => {
    if (!enabled || !userId) return;
    for (const item of key ? key.split(",") : []) {
      const [conversation, message] = item.split(":").map(Number);
      if (done.current.has(message) || busy.current.has(message)) continue;
      busy.current.add(message);
      void mutate(
        "post",
        `/conversations/${conversation}/receipts`,
        { message_ids: [message], status: "delivered" },
        { "X-Chat-Account": String(userId) },
      )
        .then(() => {
          if (useAuth.getState().user?.id === userId) done.current.add(message);
        })
        .catch(() => {
          /* Retry after reconnect or an inbox update. */
        })
        .finally(() => busy.current.delete(message));
    }
  }, [key, userId, enabled, connection]);
}
