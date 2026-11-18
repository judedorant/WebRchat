import { useRef, useState } from "react";
import { UsersRound, UserPlus, X } from "lucide-react";
import { mutate, errorMessage } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import { Modal } from "./Modal";
import { PeopleDialog } from "./PeopleDialog";
import { Avatar } from "./Avatar";
import type { Contact } from "./types";
import type { SavedConversation } from "./useDirectMessaging";

export function GroupDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (group: SavedConversation) => void;
}) {
  const ownId = useAuth((state) => state.user?.id);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<Contact[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  async function create() {
    if (submitting.current || !name.trim() || !members.length) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await mutate<{ data: SavedConversation }>(
        "post",
        "/groups",
        { name: name.trim(), member_ids: members.map((member) => member.id) },
        { "X-Chat-Account": String(ownId) },
      );
      if (useAuth.getState().user?.id === ownId) onCreated(response.data);
    } catch (error) {
      if (useAuth.getState().user?.id === ownId) setError(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (picking)
    return (
      <PeopleDialog
        title="Choose group members"
        description="Choose a verified member to add to the group selection."
        excludeIds={members.map((member) => member.id)}
        onClose={() => setPicking(false)}
        onSelect={(person) => {
          setMembers((current) => [
            ...new Map(
              [...current, person].map((member) => [member.id, member]),
            ).values(),
          ]);
          setPicking(false);
        }}
      />
    );
  return (
    <Modal title="Create a group" onClose={onClose}>
      <p className="chat-dialog-intro">
        Bring your people together. Members can see the group’s existing
        history. You’ll be its first owner.
      </p>
      <form
        className="group-form"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label>
          Group name
          <input
            autoComplete="off"
            maxLength={120}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            placeholder="e.g. Weekend plans"
          />
        </label>
        <h3>
          Members <small>{members.length + 1}/100 including you</small>
        </h3>
        <ul className="group-selected" aria-label="Selected group members">
          {members.map((member) => (
            <li key={member.id}>
              <Avatar name={member.name} size="tiny" />
              <span>{member.name}</span>
              <button
                type="button"
                className="chat-icon-button"
                aria-label={`Remove ${member.name} from selection`}
                disabled={busy}
                onClick={() =>
                  setMembers((current) =>
                    current.filter((person) => person.id !== member.id),
                  )
                }
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="chat-secondary"
          disabled={busy || members.length >= 99}
          onClick={() => setPicking(true)}
        >
          <UserPlus size={16} />
          Choose members
        </button>
        {error && (
          <p role="alert" className="group-error">
            {error}
          </p>
        )}
        <button
          className="chat-primary"
          type="submit"
          disabled={busy || !name.trim() || !members.length}
        >
          <UsersRound size={17} />
          {busy ? "Creating…" : "Create group"}
        </button>
      </form>
    </Modal>
  );
}
