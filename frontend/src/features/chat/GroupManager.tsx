import { useRef, useState } from "react";
import { UserPlus, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { mutate, errorMessage } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import { Modal } from "./Modal";
import { PeopleDialog } from "./PeopleDialog";
import { Avatar } from "./Avatar";
import type { SavedConversation } from "./useDirectMessaging";

export function GroupManager({
  group,
  onClose,
  onChanged,
  onLeft,
}: {
  group: SavedConversation;
  onClose: () => void;
  onChanged: (group: SavedConversation) => void;
  onLeft: () => void;
}) {
  const ownId = useAuth((state) => state.user?.id);
  const [name, setName] = useState(group.name || "");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    text: string;
    action: () => Promise<void>;
  } | null>(null);
  const working = useRef(false);
  async function perform(
    method: "post" | "patch" | "delete",
    path: string,
    data?: unknown,
    leave = false,
  ) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await mutate<{ data?: SavedConversation } | undefined>(
        method,
        path,
        data,
        { "X-Chat-Account": String(ownId) },
      );
      if (useAuth.getState().user?.id !== ownId) return;
      if (leave) {
        onLeft();
        return;
      }
      const updated =
        response?.data ||
        (await api.get<{ data: SavedConversation }>(`/groups/${group.id}`)).data
          .data;
      if (useAuth.getState().user?.id === ownId) onChanged(updated);
      setConfirmation(null);
    } catch (error) {
      if (useAuth.getState().user?.id === ownId) setError(errorMessage(error));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  if (picking)
    return (
      <PeopleDialog
        title="Add group member"
        description="New members can see the group’s existing history."
        excludeIds={group.participants.map((member) => member.id)}
        onClose={() => setPicking(false)}
        onSelect={(member) => {
          setPicking(false);
          void perform("post", `/groups/${group.id}/members`, {
            member_ids: [member.id],
          });
        }}
      />
    );
  return (
    <Modal title="Group settings" onClose={onClose} className="group-manager">
      <div className="group-summary">
        <Avatar name={group.name || "Group"} group imageUrl={group.image_url} />
        <div>
          <h3>{group.name}</h3>
          <p>
            Your role: {group.my_role || "member"} · {group.participants.length}{" "}
            members
          </p>
        </div>
      </div>
      {group.can_manage && (
        <>
          <form
            className="group-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("patch", `/groups/${group.id}`, {
                name: name.trim(),
              });
            }}
          >
            <label>
              Group name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
                disabled={busy}
              />
            </label>
            <button
              className="chat-secondary"
              type="submit"
              disabled={busy || !name.trim() || name.trim() === group.name}
            >
              Save group name
            </button>
          </form>
          <div className="group-form">
            <label>
              Group image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    setError("Choose an image no larger than 2 MB.");
                    return;
                  }
                  const data = new FormData();
                  data.append("image", file);
                  void perform("post", `/groups/${group.id}/image`, data);
                  event.target.value = "";
                }}
              />
            </label>
            <small>PNG, JPEG or WebP · up to 2 MB and 2048 × 2048 pixels</small>
            {group.image_url && (
              <button
                className="chat-secondary"
                disabled={busy}
                onClick={() =>
                  void perform("delete", `/groups/${group.id}/image`)
                }
              >
                Remove group image
              </button>
            )}
          </div>
        </>
      )}
      <div className="group-member-heading">
        <h3>Members</h3>
        {group.can_manage && (
          <button
            className="chat-secondary"
            disabled={busy || group.participants.length >= 100}
            onClick={() => setPicking(true)}
          >
            <UserPlus size={15} />
            Add member
          </button>
        )}
      </div>
      <ul className="group-member-list" aria-label="Group members">
        {group.participants.map((member) => (
          <li key={member.id}>
            <Avatar name={member.name} size="small" />
            <div className="group-member-copy">
              <strong>
                {member.name}
                {member.id === ownId ? " (you)" : ""}
              </strong>
              <small>
                <ShieldCheck size={11} />
                {member.role || "member"}
              </small>
            </div>
            {group.can_manage_roles &&
              member.id !== ownId &&
              member.role !== "owner" && (
                <select
                  aria-label={`Role for ${member.name}`}
                  value={member.role || "member"}
                  disabled={busy}
                  onChange={(event) => {
                    const role = event.target.value;
                    if (role === "owner")
                      setConfirmation({
                        text: `Transfer ownership to ${member.name}? You will become an admin.`,
                        action: () =>
                          perform(
                            "patch",
                            `/groups/${group.id}/members/${member.id}`,
                            { role },
                          ),
                      });
                    else
                      void perform(
                        "patch",
                        `/groups/${group.id}/members/${member.id}`,
                        { role },
                      );
                  }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Make owner</option>
                </select>
              )}
            {group.can_manage &&
              member.id !== ownId &&
              member.role !== "owner" &&
              (group.my_role === "owner" || member.role === "member") && (
                <button
                  className="chat-icon-button"
                  aria-label={`Remove ${member.name} from group`}
                  disabled={busy}
                  onClick={() =>
                    setConfirmation({
                      text: `Remove ${member.name}? They will lose access to this group.`,
                      action: () =>
                        perform(
                          "delete",
                          `/groups/${group.id}/members/${member.id}`,
                        ),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="group-error" role="alert">
          {error}
        </p>
      )}
      {confirmation && (
        <div
          className="group-confirmation"
          role="group"
          aria-label="Confirm group change"
        >
          <p>{confirmation.text}</p>
          <button
            className="chat-secondary"
            disabled={busy}
            onClick={() => setConfirmation(null)}
          >
            Cancel change
          </button>
          <button
            className="chat-primary"
            disabled={busy}
            onClick={() => void confirmation.action()}
          >
            Confirm change
          </button>
        </div>
      )}
      <div className="group-leave">
        <p>
          {group.my_role === "owner" && group.participants.length > 1
            ? "Transfer ownership to another member before leaving."
            : group.my_role === "owner"
              ? "As the last member, leaving closes this group."
              : "Leaving removes your access. A group manager can add you again."}
        </p>
        <button
          className="chat-secondary"
          disabled={
            busy || (group.my_role === "owner" && group.participants.length > 1)
          }
          onClick={() =>
            setConfirmation({
              text:
                group.my_role === "owner"
                  ? "Leave and close this group? You will lose access to its messages."
                  : "Leave this group? You will lose access to its messages.",
              action: () =>
                perform("post", `/groups/${group.id}/leave`, undefined, true),
            })
          }
        >
          <LogOut size={15} />
          Leave group
        </button>
      </div>
    </Modal>
  );
}
