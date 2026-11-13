import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatDashboard } from "./ChatDashboard";
import { useChat } from "./store";
import { useAuth } from "../../store/auth";
import { api } from "../../lib/api";
import App from "../../App";

const user = {
  id: 1,
  name: "Alex Taylor",
  email: "alex@example.test",
  bio: null,
  avatar_url: null,
  email_verified_at: "2026-11-13T00:00:00Z",
  roles: ["user"],
};
const get = vi.spyOn(api, "get");
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
  get.mockReset();
  useAuth.setState({
    user,
    status: "ready",
    load: vi.fn().mockResolvedValue(undefined),
  });
  useChat.getState().reset();
  window.history.replaceState({}, "", "/");
});
function workspace(path = "/app") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app" element={<ChatDashboard />} />
        <Route
          path="/app/conversations/:conversationId"
          element={<ChatDashboard />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe("chat workspace", () => {
  it("starts empty and never presents fictional messages as real history", () => {
    workspace();
    expect(
      screen.getByRole("heading", { name: "Messages" }),
    ).toBeInTheDocument();
    expect(screen.getByText("A fresh start")).toBeInTheDocument();
    expect(screen.queryByText("Maya Chen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Message draft")).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
  it("opens an explicitly labeled preview, filters groups and searches conversations", () => {
    workspace();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore design preview" }),
    );
    expect(screen.getByText(/Fictional conversations/)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Message history" }),
    ).toHaveTextContent("The small details make the difference");
    const list = screen.getByRole("list", { name: "Conversation list" });
    fireEvent.click(screen.getByRole("button", { name: "Groups" }));
    expect(within(list).getByText("Design circle")).toBeInTheDocument();
    expect(within(list).getByText("Launch crew")).toBeInTheDocument();
    expect(within(list).queryByText("Maya Chen")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search conversations"), {
      target: { value: "launch" },
    });
    expect(within(list).queryByText("Design circle")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search conversations"), {
      target: { value: "no match" },
    });
    expect(
      within(list).getByText("No conversations found"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Clear conversation search" }),
    );
    expect(within(list).getByText("Design circle")).toBeInTheDocument();
  });
  it("filters sample unread conversations and marks only the opened preview as read", () => {
    workspace();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore design preview" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Unread/ }));
    const list = screen.getByRole("list", { name: "Conversation list" });
    expect(within(list).getAllByRole("link")).toHaveLength(1);
    fireEvent.click(within(list).getByRole("link", { name: /Design circle/ }));
    expect(
      within(list).getByText("No unread conversations"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Message history" }),
    ).toHaveTextContent("A few ideas for the next chapter");
  });
  it("keeps editable drafts separate by route and never sends or appends a message", () => {
    workspace();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore design preview" }),
    );
    const history = screen.getByRole("region", { name: "Message history" });
    fireEvent.change(screen.getByLabelText("Message draft"), {
      target: { value: "A temporary idea" },
    });
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(history).not.toHaveTextContent("A temporary idea");
    const list = screen.getByRole("list", { name: "Conversation list" });
    fireEvent.click(within(list).getByRole("link", { name: /Leo Martin/ }));
    expect(screen.getByLabelText("Message draft")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Message draft"), {
      target: { value: "Another idea" },
    });
    fireEvent.click(within(list).getByRole("link", { name: /Maya Chen/ }));
    expect(screen.getByLabelText("Message draft")).toHaveValue(
      "A temporary idea",
    );
    expect(get).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
  it("displays group details and closes the image modal", () => {
    useChat.getState().setPreview(true);
    workspace("/app/conversations/demo-design");
    fireEvent.click(
      screen.getByRole("button", { name: "Conversation details" }),
    );
    const panel = screen.getByRole("complementary", {
      name: "Conversation details",
    });
    expect(
      within(panel).getByRole("heading", { name: "Group details" }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Nina Patel")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "View sample: Mountain lake illustration",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Sample image" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("uses the verified user directory, excludes self and pages without duplicating contacts", async () => {
    get
      .mockResolvedValueOnce({
        data: {
          data: [
            { ...user },
            {
              id: 2,
              name: "Riley Morgan",
              bio: "A public bio",
              avatar_url: null,
            },
          ],
          meta: { next_cursor: "next" },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            { id: 2, name: "Riley Morgan", bio: null, avatar_url: null },
            { id: 3, name: "Sam Rivera", bio: null, avatar_url: null },
          ],
          meta: { next_cursor: null },
        },
      });
    workspace();
    fireEvent.click(screen.getByRole("button", { name: "New message" }));
    const dialog = screen.getByRole("dialog", { name: "New message" });
    await within(dialog).findByRole("button", { name: /Riley Morgan/ });
    expect(
      within(dialog).queryByRole("button", { name: /Alex Taylor/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Load more people" }),
    );
    await within(dialog).findByRole("button", { name: /Sam Rivera/ });
    expect(
      within(dialog).getAllByRole("button", { name: /Riley Morgan/ }),
    ).toHaveLength(1);
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Riley Morgan/ }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "You can prepare a draft here. No conversation or message has been saved.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(get.mock.calls[0][0]).toBe("/users");
    expect(get.mock.calls[1][1]?.params).toMatchObject({ cursor: "next" });
  });
  it("shows directory failures and retries the actual lookup", async () => {
    get.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      data: { data: [], meta: { next_cursor: null } },
    });
    workspace();
    fireEvent.click(screen.getByRole("button", { name: "New message" }));
    const dialog = screen.getByRole("dialog", { name: "New message" });
    await within(dialog).findByRole("alert");
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    await within(dialog).findByRole("heading", { name: "No contacts yet" });
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("ignores a directory response when a newer search supersedes it", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({
        data: {
          data: [{ id: 4, name: "New Result", bio: null, avatar_url: null }],
          meta: { next_cursor: null },
        },
      });
    workspace();
    fireEvent.click(screen.getByRole("button", { name: "New message" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Search people"), {
      target: { value: "New" },
    });
    await screen.findByRole("button", { name: /New Result/ });
    await act(async () =>
      resolveOld({
        data: {
          data: [{ id: 5, name: "Old Result", bio: null, avatar_url: null }],
        },
      }),
    );
    expect(
      screen.queryByRole("button", { name: /Old Result/ }),
    ).not.toBeInTheDocument();
  });
  it("handles unauthorized or unavailable contact deep links without invented messages", async () => {
    get.mockRejectedValue(new Error("unavailable"));
    workspace("/app/conversations/contact-99");
    await screen.findByRole("alert");
    expect(
      screen.getByText("This conversation isn’t available."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Message draft")).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/users/99",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it("clears all in-memory drafts and contact data when the authenticated identity changes", () => {
    useChat.getState().setPreview(true);
    useChat.getState().setDraft("demo-maya", "Private draft");
    useChat
      .getState()
      .addContact({ id: 2, name: "Riley", bio: null, avatar_url: null });
    useAuth.getState().setUser(null);
    expect(useChat.getState().drafts).toEqual({});
    expect(useChat.getState().contacts).toEqual({});
    expect(useChat.getState().preview).toBe(false);
  });
  it("preserves the administration shortcut only for an admin account", () => {
    workspace();
    expect(
      screen.queryByRole("link", { name: "Administration" }),
    ).not.toBeInTheDocument();
    act(() =>
      useAuth.getState().setUser({ ...user, roles: ["user", "admin"] }),
    );
    expect(
      screen.getByRole("link", { name: "Administration" }),
    ).toHaveAttribute("href", "/admin");
  });
  it("protects conversation deep links from unauthenticated visitors", async () => {
    useAuth.setState({ user: null, status: "ready" });
    window.history.replaceState({}, "", "/app/conversations/demo-maya");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Welcome back." }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Messages" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Message history" }),
    ).not.toBeInTheDocument();
  });
});
