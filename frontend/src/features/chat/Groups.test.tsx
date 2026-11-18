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
import { GroupDialog } from "./GroupDialog";
import { GroupManager } from "./GroupManager";
import { GroupUpdates } from "./GroupUpdates";
import { useAuth } from "../../store/auth";
import { api } from "../../lib/api";
import * as auth from "../../lib/auth";
import type { SavedConversation } from "./useDirectMessaging";
const user = {
  id: 1,
  name: "Alice",
  email: "alice@example.test",
  bio: null,
  avatar_url: null,
  roles: ["user"],
  email_verified_at: "2026-11-17",
};
const bob = {
  id: 2,
  name: "Bob",
  bio: null,
  avatar_url: null,
  role: "member" as const,
};
const group: SavedConversation = {
  id: 10,
  type: "group",
  name: "Design circle",
  my_role: "owner",
  can_manage: true,
  can_manage_roles: true,
  can_send: true,
  participants: [{ ...user, role: "owner" }, bob],
  latest_message: null,
  last_message_at: null,
  created_at: "2026-11-17",
};
const get = vi.spyOn(api, "get");
const mutate = vi.spyOn(auth, "mutate");
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
  get
    .mockReset()
    .mockResolvedValue({
      data: { data: [user, bob], meta: { next_cursor: null } },
    });
  mutate.mockReset().mockResolvedValue({ data: group });
});
it("requires a name and selected member, then creates the group with a session-bound actor", async () => {
  const onCreated = vi.fn();
  render(<GroupDialog onClose={vi.fn()} onCreated={onCreated} />);
  expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Design circle" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose members" }));
  await screen.findByRole("dialog", { name: "Choose group members" });
  fireEvent.click(await screen.findByRole("button", { name: /Bob/ }));
  expect(
    screen.getByRole("list", { name: "Selected group members" }),
  ).toHaveTextContent("Bob");
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(group));
  expect(mutate).toHaveBeenCalledWith(
    "post",
    "/groups",
    { name: "Design circle", member_ids: [2] },
    { "X-Chat-Account": "1" },
  );
});
it("shows creation failures without losing the selected members or name", async () => {
  mutate.mockRejectedValueOnce(new Error("offline"));
  render(<GroupDialog onClose={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Team" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose members" }));
  fireEvent.click(await screen.findByRole("button", { name: /Bob/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Group name")).toHaveValue("Team");
  expect(
    screen.getByRole("list", { name: "Selected group members" }),
  ).toHaveTextContent("Bob");
});
it("requires explicit confirmation for ownership transfer and prevents owner abandonment", async () => {
  const onChanged = vi.fn();
  render(
    <GroupManager
      group={group}
      onClose={vi.fn()}
      onChanged={onChanged}
      onLeft={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Leave group" })).toBeDisabled();
  fireEvent.change(screen.getByRole("combobox", { name: "Role for Bob" }), {
    target: { value: "owner" },
  });
  expect(mutate).not.toHaveBeenCalled();
  expect(
    screen.getByRole("group", { name: "Confirm group change" }),
  ).toHaveTextContent("Transfer ownership to Bob");
  fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(mutate).toHaveBeenCalledWith(
    "patch",
    "/groups/10/members/2",
    { role: "owner" },
    { "X-Chat-Account": "1" },
  );
});
it("keeps ordinary members away from settings and role writes while allowing confirmed leave", async () => {
  const onLeft = vi.fn();
  render(
    <GroupManager
      group={{
        ...group,
        my_role: "member",
        can_manage: false,
        can_manage_roles: false,
      }}
      onClose={vi.fn()}
      onChanged={vi.fn()}
      onLeft={onLeft}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Add member" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Group name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Leave group" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
  await waitFor(() => expect(onLeft).toHaveBeenCalled());
  expect(mutate).toHaveBeenCalledWith("post", "/groups/10/leave", undefined, {
    "X-Chat-Account": "1",
  });
});
it("loads private removal notices without offering a link back into revoked group history", async () => {
  get.mockResolvedValue({
    data: {
      data: [
        {
          id: "notice",
          data: {
            conversation_id: 10,
            group_name: "Design circle",
            actor_name: "Owner",
            action: "removed",
          },
          read_at: null,
          created_at: "2026-11-17T00:00:00Z",
        },
      ],
      meta: { next_cursor: null, unread_count: 1 },
    },
  });
  render(
    <MemoryRouter>
      <GroupUpdates version={0} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Group updates" }));
  const dialog = await screen.findByRole("dialog", { name: "Group updates" });
  await within(dialog).findByText("You were removed");
  expect(
    within(dialog).queryByRole("button", { name: "Open group" }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Mark read" }));
  await waitFor(() =>
    expect(
      within(dialog).queryByRole("button", { name: "Mark read" }),
    ).not.toBeInTheDocument(),
  );
  expect(mutate).toHaveBeenCalledWith(
    "patch",
    "/group-notifications/notice",
    undefined,
    { "X-Chat-Account": "1" },
  );
});
it("ignores a completed creation from an account that has signed out", async () => {
  let resolve: (data: unknown) => void = () => {};
  mutate.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const onCreated = vi.fn();
  render(<GroupDialog onClose={vi.fn()} onCreated={onCreated} />);
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Team" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose members" }));
  fireEvent.click(await screen.findByRole("button", { name: /Bob/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
  act(() => useAuth.getState().setUser(null));
  await act(async () => resolve({ data: group }));
  expect(onCreated).not.toHaveBeenCalled();
});
