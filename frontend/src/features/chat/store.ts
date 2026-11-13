import { create } from "zustand";
import { useAuth } from "../../store/auth";
import type { Contact, ConversationFilter } from "./types";
interface ChatState {
  preview: boolean;
  search: string;
  filter: ConversationFilter;
  drafts: Record<string, string>;
  contacts: Record<string, Contact>;
  read: string[];
  details: boolean | null;
}
interface ChatActions {
  setPreview: (enabled: boolean) => void;
  setSearch: (search: string) => void;
  setFilter: (filter: ConversationFilter) => void;
  setDraft: (id: string, text: string) => void;
  addContact: (contact: Contact) => void;
  markRead: (id: string) => void;
  setDetails: (open: boolean | null) => void;
  reset: () => void;
}
const initial = (): ChatState => ({
  preview: false,
  search: "",
  filter: "all",
  drafts: {},
  contacts: {},
  read: [],
  details: null,
});
export const useChat = create<ChatState & ChatActions>((set) => ({
  ...initial(),
  setPreview: (preview) => set({ preview, search: "", filter: "all" }),
  setSearch: (search) => set({ search }),
  setFilter: (filter) => set({ filter }),
  setDraft: (id, text) =>
    set((state) => ({
      drafts: { ...state.drafts, [id]: text.slice(0, 4000) },
    })),
  addContact: (contact) =>
    set((state) => ({
      preview: false,
      search: "",
      filter: "all",
      contacts: { ...state.contacts, [`contact-${contact.id}`]: contact },
    })),
  markRead: (id) =>
    set((state) =>
      state.read.includes(id) ? state : { read: [...state.read, id] },
    ),
  setDetails: (details) => set({ details }),
  reset: () => set(initial()),
}));
// No persistence. In particular, drafts and selected contact data must not survive account changes.
const unsubscribe = useAuth.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) useChat.getState().reset();
});
if (import.meta.hot) import.meta.hot.dispose(unsubscribe);
