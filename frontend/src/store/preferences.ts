import { create } from "zustand";
interface Preferences {
  dark: boolean;
  toggleTheme: () => void;
}
export const usePreferences = create<Preferences>((set) => ({
  dark: false,
  toggleTheme: () => set((state) => ({ dark: !state.dark })),
}));
