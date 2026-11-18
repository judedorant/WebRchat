import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import * as auth from "../../lib/auth";
import { useAuth } from "../../store/auth";
import { useDirectMessaging } from "./useDirectMessaging";
const live = vi.hoisted(() => ({
  signal: null as
    | null
    | ((signal: {
        conversation_id: number;
        kind: string;
        user_id: number;
      }) => void),
}));
vi.mock("./useRealtime", () => ({
  useRealtime: (
    _user: unknown,
    _enabled: unknown,
    _ids: unknown,
    handler: typeof live.signal,
  ) => {
    live.signal = handler;
    return {
      status: "Manual refresh",
      online: {},
      typing: {},
      indicateTyping: vi.fn(),
    };
  },
}));
const user = {
  id: 1,
  name: "Alice",
  email: "alice@example.test",
  bio: null,
  avatar_url: null,
  email_verified_at: "2026-11-17T00:00:00Z",
  roles: ["user"],
};
const bob = { id: 2, name: "Bob", bio: null, avatar_url: null };
const conversation = {
  id: 10,
  type: "direct",
  participants: [user, bob],
  latest_message: null,
  can_send: true,
  last_message_at: null,
  created_at: "2026-11-17T00:00:00Z",
};
const message = (id: number) => ({
  id,
  conversation_id: 10,
  sender: user,
  client_uuid: "17a42fcb-3532-4a29-b26d-901901d2ec81",
  body: `Message ${id}`,
  created_at: "2026-11-17T00:00:00Z",
});
const response = (data: unknown) => ({ data }) as never;
const get = vi.spyOn(api, "get");
const mutate = vi.spyOn(auth, "mutate");
beforeEach(() => {
  useAuth.setState({ user, status: "ready" });
  mutate.mockReset();
  get.mockReset().mockImplementation(async (url) => {
    if (url === "/conversations")
      return response({ data: [conversation], meta: { next_cursor: null } });
    if (url.endsWith("/messages"))
      return response({
        data: [message(3), message(2)],
        meta: { next_cursor: "older" },
      });
    return response({ data: conversation });
  });
});
it("loads saved history and merges older cursor pages without duplicates", async () => {
  const { result } = renderHook(() => useDirectMessaging(1, "10", false));
  await waitFor(() =>
    expect(result.current.messages.map((item) => item.id)).toEqual([2, 3]),
  );
  get.mockImplementationOnce(async () =>
    response({ data: [message(2), message(1)], meta: { next_cursor: null } }),
  );
  await act(() => result.current.loadHistory(true));
  expect(result.current.messages.map((item) => item.id)).toEqual([1, 2, 3]);
  expect(get).toHaveBeenCalledWith("/conversations/10/messages", {
    params: { cursor: "older" },
  });
  expect(result.current.historyCursor).toBeNull();
});
it("reuses the exact UUID and body after an ambiguous failure and creates the pair only once", async () => {
  const { result } = renderHook(() =>
    useDirectMessaging(1, "contact-2", false),
  );
  await waitFor(() => expect(result.current.listLoading).toBe(false));
  mutate
    .mockResolvedValueOnce({ data: conversation })
    .mockRejectedValueOnce(new Error("network lost"));
  await act(() => result.current.send("Hello", bob));
  expect(result.current.retry).toBe(true);
  const first = mutate.mock.calls[1];
  mutate.mockResolvedValueOnce({ data: { ...message(4), body: "Hello" } });
  await act(() =>
    result.current.send("Edited text must not replace the retry", bob),
  );
  expect(mutate.mock.calls[2]).toEqual(first);
  expect(
    mutate.mock.calls.filter((call) => call[1] === "/conversations"),
  ).toHaveLength(1);
  expect(result.current.retry).toBe(false);
  expect(
    result.current.conversations.find((item) => item.id === 10)?.latest_message
      ?.body,
  ).toBe("Hello");
});
it("prevents double submission while a request is pending", async () => {
  const { result } = renderHook(() => useDirectMessaging(1, "10", false));
  await waitFor(() => expect(result.current.active?.id).toBe(10));
  let resolve: (value: unknown) => void = () => {};
  mutate.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let pending: Promise<number | null>;
  act(() => {
    pending = result.current.send("Hello", undefined);
  });
  await act(() => result.current.send("Hello", undefined));
  expect(mutate).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({ data: message(4) });
    await pending;
  });
});
it("rejects late history from a route that is no longer selected", async () => {
  let resolve: (value: unknown) => void = () => {};
  get.mockImplementation(async (url) =>
    url === "/conversations/10/messages"
      ? new Promise((done) => {
          resolve = done;
        })
      : response(
          url === "/conversations"
            ? { data: [], meta: { next_cursor: null } }
            : { data: { ...conversation, id: 20 } },
        ),
  );
  const { result, rerender } = renderHook(
    ({ route }) => useDirectMessaging(1, route, false),
    { initialProps: { route: "10" } },
  );
  rerender({ route: "contact-2" });
  await act(async () =>
    resolve(response({ data: [message(99)], meta: { next_cursor: null } })),
  );
  expect(result.current.messages).toEqual([]);
  expect(result.current.active).toBeNull();
});
it("ignores an old account's send response after identity changes", async () => {
  const { result } = renderHook(() => useDirectMessaging(1, "10", false));
  await waitFor(() => expect(result.current.active?.id).toBe(10));
  let resolve: (value: unknown) => void = () => {};
  mutate.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let pending: Promise<number | null>;
  act(() => {
    pending = result.current.send("Private", undefined);
  });
  act(() => useAuth.getState().setUser({ ...user, id: 9 }));
  let id: number | null = 10;
  await act(async () => {
    resolve({ data: message(4) });
    id = await pending;
  });
  expect(id).toBeNull();
  expect(result.current.messages.some((item) => item.id === 4)).toBe(false);
});
it("shows list failures and retries with bounded cursor parameters", async () => {
  get.mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(() => useDirectMessaging(1, undefined, false));
  await waitFor(() => expect(result.current.listError).toBeTruthy());
  await act(() => result.current.loadList());
  expect(result.current.listError).toBe("");
  expect(result.current.conversations).toHaveLength(1);
  expect(get).toHaveBeenCalledWith("/conversations", {
    params: { cursor: undefined, per_page: 30 },
  });
});

it("retains the retry UUID when a rate limit follows an unconfirmed send", async () => {
  const { result } = renderHook(() =>
    useDirectMessaging(1, "contact-2", false),
  );
  await waitFor(() => expect(result.current.listLoading).toBe(false));
  mutate
    .mockResolvedValueOnce({ data: conversation })
    .mockRejectedValueOnce(new Error("connection lost"));
  await act(() => result.current.send("Hello", bob));
  const original = mutate.mock.calls[1];
  mutate.mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 429, data: {} },
  });
  await act(() => result.current.send("Hello", bob));
  expect(result.current.retry).toBe(true);
  mutate.mockResolvedValueOnce({ data: message(4) });
  await act(() => result.current.send("Hello", bob));
  expect(mutate.mock.calls[2]).toEqual(original);
  expect(mutate.mock.calls[3]).toEqual(original);
});

it("does not start the message write if the account changes during pair creation", async () => {
  const { result } = renderHook(() =>
    useDirectMessaging(1, "contact-2", false),
  );
  await waitFor(() => expect(result.current.listLoading).toBe(false));
  let resolve: (value: unknown) => void = () => {};
  mutate.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let pending: Promise<number | null>;
  act(() => {
    pending = result.current.send("Private draft", bob);
  });
  act(() => useAuth.getState().setUser({ ...user, id: 2 }));
  await act(async () => {
    resolve({ data: conversation });
    await pending;
  });
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate.mock.calls[0][3]).toEqual({ "X-Chat-Account": "1" });
});

it("catches up every missed cursor page and refreshes existing receipts after reconnect", async () => {
  const { result } = renderHook(() => useDirectMessaging(1, "10", false));
  await waitFor(() =>
    expect(result.current.messages.map((item) => item.id)).toEqual([2, 3]),
  );
  get.mockImplementation(async (url, options) => {
    if (url === "/conversations")
      return response({ data: [conversation], meta: { next_cursor: null } });
    if (!url.endsWith("/messages")) return response({ data: conversation });
    const params = options?.params as
      { ids?: number[]; cursor?: string; after_id?: number } | undefined;
    if (params?.ids)
      return response({
        data: [2, 3].map((id) => ({
          ...message(id),
          receipts: [
            { user_id: 2, delivered_at: "2026-11-17", read_at: "2026-11-17" },
          ],
        })),
      });
    if (params?.cursor)
      return response({ data: [message(6)], meta: { next_cursor: null } });
    return response({
      data: [message(4), message(5)],
      meta: { next_cursor: "next" },
    });
  });
  await act(async () =>
    live.signal?.({ kind: "reconnect", conversation_id: 0, user_id: 1 }),
  );
  await waitFor(() =>
    expect(result.current.messages.map((item) => item.id)).toEqual([
      2, 3, 4, 5, 6,
    ]),
  );
  expect(result.current.messages[0].receipts?.[0].read_at).toBe("2026-11-17");
  expect(get).toHaveBeenCalledWith("/conversations/10/messages", {
    params: { after_id: 3, cursor: "next", per_page: 100 },
  });
});
