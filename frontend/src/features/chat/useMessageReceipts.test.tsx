import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as auth from "../../lib/auth";
import { useAuth } from "../../store/auth";
import { useMessageReceipts, useInboxDelivery } from "./useMessageReceipts";
const user = {
  id: 1,
  name: "Alice",
  email: "alice@example.test",
  bio: null,
  avatar_url: null,
  email_verified_at: "2026-11-17",
  roles: ["user"],
};
const mutate = vi.spyOn(auth, "mutate");
let callback: IntersectionObserverCallback;
const original = Object.getOwnPropertyDescriptor(document, "visibilityState");
beforeEach(() => {
  useAuth.setState({ user, status: "ready" });
  mutate.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(fn: IntersectionObserverCallback) {
        callback = fn;
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (original) Object.defineProperty(document, "visibilityState", original);
  else Reflect.deleteProperty(document, "visibilityState");
});
const messages = [1, 2].map((id) => ({
  id,
  conversation_id: 10,
  sender: { id: id === 1 ? 2 : 1, name: "Member", bio: null, avatar_url: null },
  client_uuid: "uuid",
  body: "Message",
  created_at: "2026-11-17",
}));
it("records delivery for received messages, and reads only visible incoming bubbles", async () => {
  const element = document.createElement("div");
  element.dataset.messageId = "1";
  const root = { current: document.createElement("div") };
  root.current.append(element);
  renderHook(() => useMessageReceipts(1, 10, true, "Live", messages, root));
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith(
      "post",
      "/conversations/10/receipts",
      { message_ids: [1], status: "delivered" },
      { "X-Chat-Account": "1" },
    ),
  );
  vi.useFakeTimers();
  await act(async () => {
    callback(
      [
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 0.8,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(mutate).toHaveBeenLastCalledWith(
    "post",
    "/conversations/10/receipts",
    { message_ids: [1], status: "read" },
    { "X-Chat-Account": "1" },
  );
});
it("does not mark hidden documents or non-intersecting messages read", async () => {
  const element = document.createElement("div");
  element.dataset.messageId = "1";
  const root = { current: document.createElement("div") };
  root.current.append(element);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  renderHook(() => useMessageReceipts(1, 10, true, "Live", messages, root));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  vi.useFakeTimers();
  await act(async () => {
    callback(
      [
        {
          target: element,
          isIntersecting: true,
          intersectionRatio: 1,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(mutate).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  await act(async () => {
    callback(
      [
        {
          target: element,
          isIntersecting: false,
          intersectionRatio: 0,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(mutate).toHaveBeenCalledTimes(1);
});

it("acknowledges inbox delivery without marking unopened messages read", async () => {
  const conversations = [
    {
      id: 10,
      type: "direct" as const,
      participants: [],
      can_send: true,
      latest_message: messages[0],
      last_message_at: null,
      created_at: "2026-11-17",
    },
  ];
  const { rerender } = renderHook(() =>
    useInboxDelivery(1, true, "Live", conversations),
  );
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate).toHaveBeenCalledWith(
    "post",
    "/conversations/10/receipts",
    { message_ids: [1], status: "delivered" },
    { "X-Chat-Account": "1" },
  );
  rerender();
  expect(mutate).toHaveBeenCalledTimes(1);
});
