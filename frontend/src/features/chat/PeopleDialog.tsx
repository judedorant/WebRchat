import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, LoaderCircle, UsersRound } from "lucide-react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/auth";
import { useAuth } from "../../store/auth";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";
import type { Contact } from "./types";
interface DirectoryPage {
  data: Contact[];
  meta?: { next_cursor?: string | null };
}
export function PeopleDialog({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (contact: Contact) => void;
}) {
  const ownId = useAuth((state) => state.user?.id);
  const [search, setSearch] = useState(""),
    [people, setPeople] = useState<Contact[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [cursor, setCursor] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      api
        .get<DirectoryPage>("/users", {
          params: { search: search.trim() },
          signal: controller.signal,
        })
        .then(({ data }) => {
          if (controller.signal.aborted) return;
          setPeople(data.data.filter((person) => person.id !== ownId));
          setCursor(data.meta?.next_cursor || null);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
      abort.current?.abort();
    };
  }, [search, ownId, retry]);
  async function more() {
    if (!cursor || loading) return;
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<DirectoryPage>("/users", {
        params: { search: search.trim(), cursor },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPeople((current) => [
        ...new Map(
          [...current, ...data.data.filter((p) => p.id !== ownId)].map((p) => [
            p.id,
            p,
          ]),
        ).values(),
      ]);
      setCursor(data.meta?.next_cursor || null);
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <Modal title="New message" onClose={onClose}>
      <p className="chat-dialog-intro">
        Find a verified member. You can prepare a draft; sending isn’t available
        yet.
      </p>
      <div className="chat-search">
        <Search size={17} />
        <input
          aria-label="Search people"
          placeholder="Search by name…"
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            setPeople([]);
            setCursor(null);
            setLoading(true);
          }}
        />
      </div>
      <div className="people-results" aria-busy={loading}>
        {error ? (
          <div className="chat-state" role="alert">
            <p>{error}</p>
            <button
              className="chat-secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {people.map((person) => (
              <button
                className="person-result"
                key={person.id}
                onClick={() => onSelect(person)}
              >
                <Avatar name={person.name} />
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.bio || "Verified member"}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
            {loading && (
              <>
                <div aria-hidden="true">
                  {[1, 2, 3].map((index) => (
                    <div className="people-skeleton" key={index}>
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
                <div className="people-loading" role="status">
                  <LoaderCircle size={18} className="spin" /> Finding people…
                </div>
              </>
            )}
            {!loading && !people.length && (
              <div className="chat-state">
                <UsersRound size={30} />
                <h3>{search.trim() ? "No people found" : "No contacts yet"}</h3>
                <p>
                  {search.trim()
                    ? "Try a different name."
                    : "Other verified accounts will appear here."}
                </p>
              </div>
            )}
            {!loading && cursor && (
              <button
                className="chat-secondary load-people"
                onClick={() => void more()}
              >
                Load more people
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
