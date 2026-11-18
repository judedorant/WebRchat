import { useSyncExternalStore } from "react";
const query = "(min-width: 1280px)";
function subscribe(change: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", change);
  return () => media?.removeEventListener("change", change);
}
const snapshot = () => window.matchMedia?.(query).matches ?? false;
export function useWideScreen() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
