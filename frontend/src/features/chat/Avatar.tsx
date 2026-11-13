import { Users } from "lucide-react";
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] || "")
    .join("")
    .toUpperCase();
}
export function Avatar({
  name,
  color = "sage",
  size = "",
  group = false,
}: {
  name: string;
  color?: string;
  size?: string;
  group?: boolean;
}) {
  return (
    <span aria-hidden="true" className={`chat-avatar ${color} ${size}`}>
      {group ? <Users size={size === "large" ? 29 : 19} /> : initials(name)}
    </span>
  );
}
