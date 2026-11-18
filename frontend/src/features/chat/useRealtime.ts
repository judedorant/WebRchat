import { useCallback, useEffect, useRef, useState } from "react";
import type Echo from "laravel-echo";
import axios from "axios";
import { mutate } from "../../lib/auth";
import { useAuth } from "../../store/auth";

export interface ChatSignal {
  conversation_id: number;
  kind:
    | "message"
    | "conversation"
    | "change"
    | "reaction"
    | "receipt"
    | "typing"
    | "reconnect"
    | "membership";
  user_id: number;
  typing?: boolean;
  expires_at?: string;
}
export function useRealtime(
  userId: number | undefined,
  enabled: boolean,
  ids: number[],
  onSignal: (signal: ChatSignal) => void,
) {
  const [client, setClient] = useState<Echo<"reverb"> | null>(null);
  const [status, setStatus] = useState("Connecting");
  const [online, setOnline] = useState<Record<number, number[]>>({});
  const [typing, setTyping] = useState<Record<number, Record<number, number>>>(
    {},
  );
  const handler = useRef(onSignal);
  const lastTyped = useRef(new Map<number, number>());
  const joined = useRef(
    new Map<number, { client: Echo<"reverb">; active: boolean }>(),
  );
  useEffect(() => {
    handler.current = onSignal;
  }, [onSignal]);
  const idsKey = [...new Set(ids)].sort((a, b) => a - b).join(",");
  const valid = useCallback(
    () => useAuth.getState().user?.id === userId,
    [userId],
  );
  useEffect(() => {
    if (!enabled || !userId) return;
    const accountId = userId;
    let stopped = false;
    let starting = false;
    let degraded = false;
    let recoverConnection = () => {};
    let echo: Echo<"reverb"> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let batch: ReturnType<typeof setTimeout> | undefined;
    let retryBootstrap: ReturnType<typeof setTimeout> | undefined;
    const signals = new Map<number, ChatSignal>();
    const headers = { "X-Chat-Account": String(userId) };
    function bootstrap() {
      if (starting || stopped || !valid()) return;
      starting = true;
      void mutate<{ data: { key: string; channel: string } }>(
        "post",
        "/realtime/heartbeat",
        undefined,
        headers,
      )
        .then(async ({ data }) => {
          const [{ default: EchoClient }, { default: Pusher }] =
            await Promise.all([import("laravel-echo"), import("pusher-js")]);
          if (stopped || !valid()) return;
          echo = new EchoClient({
            broadcaster: "reverb",
            Pusher,
            key: data.key,
            wsHost: window.location.hostname,
            wsPort: Number(window.location.port || 80),
            wssPort: Number(window.location.port || 443),
            wsPath: "/ws",
            forceTLS: window.location.protocol === "https:",
            enabledTransports: ["ws", "wss"],
            disableStats: true,
            withoutInterceptors: true,
            authorizer: (channel: { name: string }) => ({
              authorize(
                socketId: string,
                callback: (
                  error: Error | null,
                  data: { auth: string; channel_data?: string } | null,
                ) => void,
              ) {
                void mutate<{ auth: string; channel_data?: string }>(
                  "post",
                  "/realtime/auth",
                  { socket_id: socketId, channel_name: channel.name },
                  headers,
                )
                  .then((response) => {
                    if (!stopped && valid()) callback(null, response);
                  })
                  .catch((error: unknown) => {
                    if (!stopped)
                      callback(
                        error instanceof Error
                          ? error
                          : new Error("Channel authorization failed"),
                        null,
                      );
                  });
              },
            }),
          });
          const instance = echo;
          instance.connector.pusher.connection.bind(
            "state_change",
            ({ current }: { current: string }) => {
              if (!stopped && valid() && current !== "connected") {
                degraded = true;
                setStatus(
                  current === "connecting" ? "Connecting" : "Reconnecting",
                );
              }
            },
          );
          instance
            .private(data.channel)
            .subscribed(() => {
              if (!stopped && valid()) {
                degraded = false;
                setStatus("Live");
                handler.current({
                  conversation_id: 0,
                  kind: "reconnect",
                  user_id: accountId,
                });
              }
            })
            .error(() => {
              if (!stopped && valid()) setStatus("Live connection unavailable");
            })
            .listen(".chat.signal", (signal: ChatSignal) => {
              if (
                stopped ||
                !valid() ||
                !Number.isSafeInteger(signal.conversation_id)
              )
                return;
              if (signal.kind === "typing") {
                if (signal.user_id === userId) return;
                const expires = Date.parse(signal.expires_at || "");
                setTyping((previous) => {
                  const next = { ...previous };
                  const members = { ...next[signal.conversation_id] };
                  if (signal.typing && expires > Date.now())
                    members[signal.user_id] = expires;
                  else delete members[signal.user_id];
                  if (Object.keys(members).length)
                    next[signal.conversation_id] = members;
                  else delete next[signal.conversation_id];
                  return next;
                });
                return;
              }
              if (
                signal.kind === "membership" ||
                signal.kind === "reaction" ||
                signal.kind === "change"
              ) {
                handler.current(signal);
                return;
              }
              if (
                !["message", "conversation", "receipt", "reaction"].includes(
                  signal.kind,
                )
              )
                return;
              signals.set(signal.conversation_id, signal);
              if (!batch)
                batch = setTimeout(() => {
                  batch = undefined;
                  if (!stopped && valid())
                    signals.forEach((item) => handler.current(item));
                  signals.clear();
                }, 100);
            });
          setClient(instance);
          let heartbeatVersion = 0;
          async function checkHeartbeat() {
            const version = ++heartbeatVersion;
            try {
              const response = await mutate<{ data: { channel: string } }>(
                "post",
                "/realtime/heartbeat",
                undefined,
                headers,
              );
              if (stopped || !valid() || version !== heartbeatVersion) return;
              if (response.data.channel !== data.channel) {
                instance.disconnect();
                setStatus("Session changed. Reload to reconnect");
                return;
              }
              const subscribed = instance.connector.pusher.channel(
                `private-${data.channel}`,
              )?.subscribed;
              if (
                instance.connector.pusher.connection.state === "connected" &&
                subscribed
              ) {
                setStatus("Live");
                if (degraded)
                  handler.current({
                    conversation_id: 0,
                    kind: "reconnect",
                    user_id: accountId,
                  });
                degraded = false;
              }
            } catch (error) {
              if (stopped || !valid() || version !== heartbeatVersion) return;
              const status = axios.isAxiosError(error)
                ? error.response?.status
                : undefined;
              degraded = true;
              if (status && [401, 403, 419].includes(status)) {
                instance.disconnect();
                setStatus("Live connection unavailable");
              } else setStatus("Reconnecting");
            }
          }
          recoverConnection = () => {
            instance.connector.pusher.connect();
            void checkHeartbeat();
          };
          heartbeat = setInterval(() => {
            void checkHeartbeat();
          }, 25000);
        })
        .catch(() => {
          if (!stopped && valid()) {
            setStatus("Reconnecting");
            retryBootstrap = setTimeout(bootstrap, 5000);
          }
        })
        .finally(() => {
          starting = false;
        });
    }
    function recover() {
      if (!stopped && valid()) {
        if (echo) recoverConnection();
        else {
          clearTimeout(retryBootstrap);
          bootstrap();
        }
      }
    }
    function offline() {
      if (!stopped && valid()) {
        degraded = true;
        setStatus("Reconnecting");
      }
    }
    bootstrap();
    window.addEventListener("online", recover);
    window.addEventListener("offline", offline);
    return () => {
      stopped = true;
      clearInterval(heartbeat);
      clearTimeout(batch);
      clearTimeout(retryBootstrap);
      window.removeEventListener("online", recover);
      window.removeEventListener("offline", offline);
      echo?.disconnect();
    };
  }, [enabled, userId, valid]);
  useEffect(() => {
    if (!client || !enabled) return;
    const channels = idsKey ? idsKey.split(",").map(Number) : [];
    for (const [id, subscription] of joined.current) {
      if (subscription.client !== client || !channels.includes(id)) {
        subscription.active = false;
        subscription.client.leave(`conversations.${id}`);
        joined.current.delete(id);
      }
    }
    for (const id of channels) {
      if (joined.current.has(id)) continue;
      const subscription = { client, active: true };
      joined.current.set(id, subscription);
      client
        .join(`conversations.${id}`)
        .here((members: { id: number }[]) => {
          if (subscription.active && valid())
            setOnline((previous) => ({
              ...previous,
              [id]: members.map((member) => member.id),
            }));
        })
        .joining((member: { id: number }) => {
          if (subscription.active && valid())
            setOnline((previous) => ({
              ...previous,
              [id]: [...new Set([...(previous[id] || []), member.id])],
            }));
        })
        .leaving((member: { id: number }) => {
          if (subscription.active && valid()) {
            setOnline((previous) => ({
              ...previous,
              [id]: (previous[id] || []).filter(
                (person) => person !== member.id,
              ),
            }));
            handler.current({
              conversation_id: id,
              kind: "receipt",
              user_id: member.id,
            });
          }
        })
        .error(() => {
          if (subscription.active)
            setOnline((previous) => ({ ...previous, [id]: [] }));
        });
    }
  }, [client, enabled, idsKey, valid]);
  useEffect(
    () => () => {
      for (const [id, subscription] of joined.current) {
        if (subscription.client === client) {
          subscription.active = false;
          client?.leave(`conversations.${id}`);
          joined.current.delete(id);
        }
      }
    },
    [client, enabled],
  );
  const typingActive = Object.keys(typing).length > 0;
  useEffect(() => {
    if (!typingActive) return;
    const timer = setInterval(
      () =>
        setTyping((previous) =>
          Object.fromEntries(
            Object.entries(previous)
              .map(
                ([id, members]) =>
                  [
                    id,
                    Object.fromEntries(
                      Object.entries(members).filter(
                        ([, expires]) => expires > Date.now(),
                      ),
                    ),
                  ] as const,
              )
              .filter(([, members]) => Object.keys(members).length > 0),
          ),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [typingActive]);
  const indicateTyping = useCallback(
    async (id: number, value: boolean) => {
      if (!enabled || !valid() || status !== "Live") return;
      const now = Date.now();
      if (value && now - (lastTyped.current.get(id) || 0) < 3500) return;
      lastTyped.current.set(id, value ? now : 0);
      try {
        await mutate(
          "post",
          `/conversations/${id}/typing`,
          { typing: value },
          { "X-Chat-Account": String(userId) },
        );
      } catch {
        /* Typing is ephemeral; it must never block sending. */
      }
    },
    [enabled, valid, status, userId],
  );
  return {
    status: enabled ? status : "Manual refresh",
    online:
      enabled && status === "Live"
        ? Object.fromEntries(
            Object.entries(online).filter(([id]) => ids.includes(Number(id))),
          )
        : {},
    typing:
      enabled && status === "Live"
        ? Object.fromEntries(
            Object.entries(typing).filter(([id]) => ids.includes(Number(id))),
          )
        : {},
    indicateTyping,
  };
}
