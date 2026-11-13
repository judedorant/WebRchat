import { create } from "zustand";
import { api } from "../lib/api";
import type { User } from "../lib/auth";
interface Auth {
  user: User | null;
  status: "loading" | "ready" | "error";
  setUser: (user: User | null) => void;
  load: () => Promise<void>;
}
export const useAuth = create<Auth>((set) => ({
  user: null,
  status: "loading",
  setUser: (user) => set({ user, status: "ready" }),
  load: async () => {
    try {
      const { data } = await api.get<{ data: User }>("/me");
      set({ user: data.data, status: "ready" });
    } catch (error) {
      const status = (error as { response?: { status: number } }).response
        ?.status;
      set({
        user: null,
        status:
          status === 401 || status === 403 || status === 419
            ? "ready"
            : "error",
      });
    }
  },
}));
// Memory only: no passwords, tokens, user records or roles are stored in localStorage.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 419)
      useAuth.getState().setUser(null);
    return Promise.reject(error);
  },
);
