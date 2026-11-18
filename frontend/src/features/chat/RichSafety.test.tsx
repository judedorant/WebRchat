import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { RichComposer } from "./RichComposer";
import { MessageExtras } from "./MessageExtras";
import { ChatTools, ReportDialog, BlockButton } from "./ChatTools";
import { api } from "../../lib/api";
import * as auth from "../../lib/auth";
import { useAuth } from "../../store/auth";
import type { SavedConversation, SavedMessage } from "./useDirectMessaging";
const user = {
  id: 1,
  name: "Alice",
  email: "alice@example.test",
  bio: null,
  avatar_url: null,
  roles: ["user"],
  email_verified_at: "2026-11-18",
};
const bob = { id: 2, name: "Bob", bio: null, avatar_url: null };
const thread: SavedConversation = {
  id: 10,
  type: "direct",
  participants: [user, bob],
  latest_message: null,
  can_send: true,
  last_message_at: null,
  created_at: "2026-11-18",
};
const message: SavedMessage = {
  id: 50,
  conversation_id: 10,
  sender: bob,
  client_uuid: "uuid",
  body: "Private search result",
  created_at: "2026-11-18",
  attachments: [],
  reactions: [],
};
const get = vi.spyOn(api, "get"),
  post = vi.spyOn(api, "post"),
  mutate = vi.spyOn(auth, "mutate");
vi.spyOn(auth, "csrf").mockResolvedValue(undefined);
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function (this: HTMLDialogElement) {
    this.open = true;
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function (this: HTMLDialogElement) {
    this.open = false;
  },
});
beforeEach(() => {
  useAuth.setState({ user, status: "ready" });
  get.mockReset().mockResolvedValue({
    data: { data: [], meta: { next_cursor: null, unread_count: 0 } },
  });
  post.mockReset();
  mutate.mockReset().mockResolvedValue({ data: message });
});
function composer(onSent = vi.fn()) {
  return render(
    <RichComposer
      userId={1}
      conversation={thread}
      disabled={false}
      draft="caption"
      onEmoji={vi.fn()}
      onSent={onSent}
    />,
  );
}
it("retries an unconfirmed attachment with the same UUID, file and caption", async () => {
  post
    .mockRejectedValueOnce(new Error("connection lost"))
    .mockResolvedValueOnce({ data: { data: message } });
  const onSent = vi.fn();
  composer(onSent);
  fireEvent.click(screen.getByRole("button", { name: "Attach a file" }));
  const file = new File(["private"], "notes.txt", { type: "text/plain" });
  fireEvent.change(screen.getByLabelText("Attachment"), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send attachment" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Attachment")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry attachment" }));
  await waitFor(() => expect(onSent).toHaveBeenCalledWith(thread, message));
  expect(post).toHaveBeenCalledTimes(2);
  const first = post.mock.calls[0][1] as FormData,
    second = post.mock.calls[1][1] as FormData;
  expect(first.get("client_uuid")).toBe(second.get("client_uuid"));
  expect(second.get("body")).toBe("caption");
  expect(second.get("file")).toBe(file);
});
it("does not apply an upload response after the account changes", async () => {
  let resolve: (value: unknown) => void = () => {};
  post.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }) as never,
  );
  const onSent = vi.fn();
  composer(onSent);
  fireEvent.click(screen.getByRole("button", { name: "Attach a file" }));
  fireEvent.change(screen.getByLabelText("Attachment"), {
    target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send attachment" }));
  await waitFor(() => expect(post).toHaveBeenCalled());
  useAuth.setState({ user: { ...user, id: 99 } });
  await act(async () => resolve({ data: { data: message } }));
  expect(onSent).not.toHaveBeenCalled();
});
it("shows a usable error if microphone recording is unavailable", async () => {
  composer();
  fireEvent.click(screen.getByRole("button", { name: "Voice message" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose an audio file",
  );
});
it("removes only the signed-in member's existing reaction and renders safe private media", async () => {
  const onUpdate = vi.fn();
  render(
    <MessageExtras
      message={{
        ...message,
        reactions: [
          { user_id: 1, emoji: "❤️" },
          { user_id: 2, emoji: "❤️" },
        ],
        attachments: [
          {
            id: 5,
            name: "photo.png",
            mime_type: "image/png",
            size: 120,
            kind: "image",
            url: "/api/v1/attachments/5",
          },
        ],
      }}
      userId={1}
      canSend={true}
      onUpdate={onUpdate}
      onReport={vi.fn()}
    />,
  );
  expect(screen.getByRole("img", { name: "photo.png" })).toHaveAttribute(
    "src",
    "/api/v1/attachments/5",
  );
  fireEvent.click(screen.getByRole("button", { name: "❤️ reaction, 2" }));
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(message));
  expect(mutate).toHaveBeenCalledWith(
    "delete",
    "/messages/50/reactions",
    { emoji: "❤️" },
    { "X-Chat-Account": "1" },
  );
});
it("searches server history and clears previous results on a new query", async () => {
  get.mockImplementation(async (url) =>
    url === "/search/messages"
      ? { data: { data: [message], meta: { next_cursor: null } } }
      : { data: { data: [], meta: { next_cursor: null, unread_count: 0 } } },
  );
  render(
    <MemoryRouter>
      <ChatTools userId={1} version={0} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Search messages" }));
  fireEvent.change(screen.getByLabelText("Message search"), {
    target: { value: "Private" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search history" }));
  expect(await screen.findByText("Private search result")).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith("/search/messages", {
    params: { q: "Private", cursor: undefined },
  });
  fireEvent.change(screen.getByLabelText("Message search"), {
    target: { value: "Another" },
  });
  expect(screen.queryByText("Private search result")).not.toBeInTheDocument();
});
it("keeps removed membership notices private and marks an own notification read", async () => {
  get.mockResolvedValue({
    data: {
      data: [
        {
          id: "notice",
          data: {
            action: "removed",
            conversation_id: 10,
            group_name: "Studio",
          },
          read_at: null,
          created_at: "2026-11-18",
        },
      ],
      meta: { next_cursor: null, unread_count: 1 },
    },
  });
  render(
    <MemoryRouter>
      <ChatTools userId={1} version={0} />
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: "Notifications (1)" });
  fireEvent.click(screen.getByRole("button", { name: "Notifications (1)" }));
  const dialog = screen.getByRole("dialog", { name: "Notifications" });
  await within(dialog).findByText("Studio · removed");
  expect(
    within(dialog).queryByRole("button", { name: "Open conversation" }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Mark read" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /^Notifications$/ }),
    ).toBeInTheDocument(),
  );
  expect(mutate).toHaveBeenCalledWith(
    "patch",
    "/notifications/notice",
    undefined,
    { "X-Chat-Account": "1" },
  );
});
it("submits a report with the selected author and message without privilege fields", async () => {
  render(
    <ReportDialog userId={1} target={bob} messageId={50} onClose={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "Unwanted abusive content" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Report submitted",
  );
  expect(mutate).toHaveBeenCalledWith(
    "post",
    "/reports",
    { reported_user_id: 2, message_id: 50, reason: "Unwanted abusive content" },
    { "X-Chat-Account": "1" },
  );
});
it("requires an explicit block confirmation and refreshes conversation permissions", async () => {
  const changed = vi.fn();
  render(<BlockButton userId={1} target={bob} onChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "Block member" }));
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm block" }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(mutate).toHaveBeenCalledWith("put", "/blocks/2", undefined, {
    "X-Chat-Account": "1",
  });
});
it("edits only after confirmation and renders a deleted message without its media", async () => {
  const onUpdate = vi.fn();
  const view = render(
    <MessageExtras
      message={{ ...message, sender: user, type: "text" }}
      userId={1}
      canSend={true}
      onUpdate={onUpdate}
      onReport={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit message 50" }));
  fireEvent.change(screen.getByLabelText("Edited message"), {
    target: { value: "Updated content" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save edit" }));
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith(
      "patch",
      "/messages/50",
      { body: "Updated content" },
      { "X-Chat-Account": "1" },
    ),
  );
  await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Delete message 50" }));
  expect(screen.getByText(/Reports already submitted/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith("delete", "/messages/50", undefined, {
      "X-Chat-Account": "1",
    }),
  );
  view.rerender(
    <MessageExtras
      message={{
        ...message,
        body: null,
        deleted_at: "2026-11-18",
        attachments: [
          {
            id: 5,
            name: "secret.png",
            kind: "image",
            mime_type: "image/png",
            size: 100,
            url: "/api/v1/attachments/5",
          },
        ],
      }}
      userId={1}
      canSend={true}
      onUpdate={onUpdate}
      onReport={vi.fn()}
    />,
  );
  expect(screen.getByText("Message deleted")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /React to message/ }),
  ).not.toBeInTheDocument();
});
it("stops a microphone stream that resolves after the recording dialog was closed", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  let resolve: (value: unknown) => void = () => {};
  const stop = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    },
  });
  vi.stubGlobal("MediaRecorder", class {});
  try {
    composer();
    fireEvent.click(screen.getByRole("button", { name: "Voice message" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for microphone",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await act(async () => resolve({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    if (descriptor)
      Object.defineProperty(navigator, "mediaDevices", descriptor);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  }
});
