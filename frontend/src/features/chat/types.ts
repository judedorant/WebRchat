export interface Contact {
  id: number;
  name: string;
  bio: string | null;
  avatar_url: string | null;
}
export interface PreviewMessage {
  id: string;
  author: string;
  time: string;
  outgoing?: boolean;
  body?: string;
  image?: { src: string; alt: string };
  file?: { name: string; size: string };
  reaction?: string;
}
export interface PreviewConversation {
  id: string;
  name: string;
  initials: string;
  color: string;
  kind: "direct" | "group";
  subtitle: string;
  bio: string;
  lastMessage: string;
  time: string;
  unread: number;
  members: string[];
  messages: PreviewMessage[];
}
export type ConversationFilter = "all" | "unread" | "groups";
