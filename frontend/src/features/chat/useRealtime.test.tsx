import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuth } from "../../store/auth";
import * as auth from "../../lib/auth";
import { useRealtime } from "./useRealtime";

const mock = vi.hoisted(() => ({
  options: {} as Record<string, unknown>,
  received: null as null | ((signal: unknown) => void),
  subscribed: null as null | (() => void),
  state: null as null | ((state: { current: string }) => void),
  presence: new Map<string, Record<string, (value: never) => void>>(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  rebuild: vi.fn(),
  leave: vi.fn(),
}));
vi.mock("laravel-echo", () => ({
  default: class {
    connector = {
      pusher: {
        connect: mock.connect,
        channel: () => ({ subscribed: true }),
        connection: {
          state: "connected",
          bind: (_event: string, callback: typeof mock.state) => {
            mock.state = callback;
          },
        },
      },
    };
    constructor(options: Record<string, unknown>) {
      mock.options = options;
    }
    private() {
      const channel = {
        subscribed(callback: () => void) {
          mock.subscribed = callback;
          return channel;
        },
        error() {
          return channel;
        },
        listen(_name: string, callback: (signal: unknown) => void) {
          mock.received = callback;
          return channel;
        },
      };
      return channel;
    }
    join(name: string) {
      const events: Record<string, (value: never) => void> = {};
      mock.presence.set(name, events);
      const channel = {
        here(callback: (value: never) => void) {
          events.here = callback;
          return channel;
        },
        joining(callback: (value: never) => void) {
          events.joining = callback;
          return channel;
        },
        leaving(callback: (value: never) => void) {
          events.leaving = callback;
          return channel;
        },
        error() {
          return channel;
        },
      };
      return channel;
    }
    connect = mock.rebuild;
    disconnect = mock.disconnect;
    leave = mock.leave;
  },
}));
const user = {
  id: 1,
  name: "Alice",
  email: "alice@example.test",
  bio: null,
  avatar_url: null,
  email_verified_at: "2026-11-17",
  roles: ["user"],
  realtime_enabled: true,
};
const mutate = vi.spyOn(auth, "mutate");
beforeEach(() => {
  useAuth.setState({ user, status: "ready" });
  mock.presence.clear();
  mock.disconnect.mockClear();
  mock.connect.mockClear();
  mock.rebuild.mockClear();
  mock.leave.mockClear();
  mock.received = null;
  mock.subscribed = null;
  mock.state = null;
  mutate.mockReset().mockResolvedValue({
    data: { key: "public-key", channel: "users.1.sessions.device" },
  });
});
afterEach(() => vi.useRealTimers());
it("authorizes Echo channels with SPA cookies and an account assertion", async () => {
  renderHook(() => useRealtime(1, true, [10], vi.fn()));
  await waitFor(() => expect(mock.subscribed).not.toBeNull());
  const authorize = mock.options.authorizer as (channel: { name: string }) => {
    authorize: (id: string, callback: ReturnType<typeof vi.fn>) => void;
  };
  const callback = vi.fn();
  mutate.mockResolvedValueOnce({ auth: "signed" });
  await act(async () =>
    authorize({ name: "presence-conversations.10" }).authorize(
      "123.456",
      callback,
    ),
  );
  expect(mutate).toHaveBeenLastCalledWith(
    "post",
    "/realtime/auth",
    { socket_id: "123.456", channel_name: "presence-conversations.10" },
    { "X-Chat-Account": "1" },
  );
  expect(callback).toHaveBeenCalledWith(null, { auth: "signed" });
});
it("catches up after subscription and reconnect, and disconnects on cleanup", async () => {
  const receive = vi.fn();
  const { result, unmount } = renderHook(() =>
    useRealtime(1, true, [10], receive),
  );
  await waitFor(() => expect(mock.subscribed).not.toBeNull());
  act(() => mock.subscribed?.());
  expect(result.current.status).toBe("Live");
  expect(receive).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "reconnect" }),
  );
  act(() => mock.state?.({ current: "unavailable" }));
  expect(result.current.status).toBe("Reconnecting");
  act(() => mock.subscribed?.());
  expect(receive).toHaveBeenCalledTimes(2);
  unmount();
  expect(mock.disconnect).toHaveBeenCalled();
  expect(mock.leave).toHaveBeenCalledWith("conversations.10");
});
it("expires typing signals and never accepts stale signals from another identity", async () => {
  const receive = vi.fn();
  const { result } = renderHook(() => useRealtime(1, true, [10], receive));
  await waitFor(() => expect(mock.subscribed).not.toBeNull());
  act(() => mock.subscribed?.());
  vi.useFakeTimers();
  act(() =>
    mock.received?.({
      kind: "typing",
      conversation_id: 10,
      user_id: 2,
      typing: true,
      expires_at: new Date(Date.now() + 6000).toISOString(),
    }),
  );
  expect(result.current.typing[10]?.[2]).toBeGreaterThan(Date.now());
  act(() => vi.advanceTimersByTime(7000));
  expect(result.current.typing[10]).toBeUndefined();
  receive.mockClear();
  act(() => useAuth.getState().setUser({ ...user, id: 3 }));
  act(() =>
    mock.received?.({ kind: "message", conversation_id: 10, user_id: 2 }),
  );
  act(() => vi.advanceTimersByTime(500));
  expect(receive).not.toHaveBeenCalled();
});
it("maintains presence across member joins, leaves and loaded conversations", async () => {
  const { result, rerender } = renderHook(
    ({ ids }) => useRealtime(1, true, ids, vi.fn()),
    { initialProps: { ids: [10] } },
  );
  await waitFor(() => expect(mock.presence.has("conversations.10")).toBe(true));
  act(() => mock.subscribed?.());
  const presence = mock.presence.get("conversations.10")!;
  act(() => presence.here([{ id: 1 }] as never));
  act(() => presence.joining({ id: 2 } as never));
  expect(result.current.online[10]).toEqual([1, 2]);
  act(() => presence.leaving({ id: 2 } as never));
  expect(result.current.online[10]).toEqual([1]);
  rerender({ ids: [10, 20] });
  expect(mock.leave).not.toHaveBeenCalledWith("conversations.10");
  expect(mock.presence.has("conversations.20")).toBe(true);
  rerender({ ids: [] });
  expect(mock.leave).toHaveBeenCalledWith("conversations.10");
});

it("keeps reconnecting after a transient heartbeat failure and responds to browser online events", async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRealtime(1, true, [10], vi.fn()));
  await act(async () => {
    await Promise.resolve();
  });
  act(() => mock.subscribed?.());
  mutate.mockRejectedValueOnce(new Error("network offline"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(25000);
  });
  expect(result.current.status).toBe("Reconnecting");
  expect(mock.disconnect).not.toHaveBeenCalled();
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
  });
  expect(result.current.status).toBe("Live");
  expect(mock.connect).toHaveBeenCalled();
  expect(mock.rebuild).not.toHaveBeenCalled();
  act(() => mock.subscribed?.());
  expect(result.current.status).toBe("Live");
});

it("keeps simultaneous group typers separate when one member stops", async () => {
  const { result } = renderHook(() => useRealtime(1, true, [10], vi.fn()));
  await waitFor(() => expect(mock.subscribed).not.toBeNull());
  act(() => mock.subscribed?.());
  const expires_at = new Date(Date.now() + 6000).toISOString();
  act(() => {
    mock.received?.({
      kind: "typing",
      conversation_id: 10,
      user_id: 2,
      typing: true,
      expires_at,
    });
    mock.received?.({
      kind: "typing",
      conversation_id: 10,
      user_id: 3,
      typing: true,
      expires_at,
    });
  });
  expect(Object.keys(result.current.typing[10])).toEqual(["2", "3"]);
  act(() =>
    mock.received?.({
      kind: "typing",
      conversation_id: 10,
      user_id: 2,
      typing: false,
      expires_at,
    }),
  );
  expect(Object.keys(result.current.typing[10])).toEqual(["3"]);
});
