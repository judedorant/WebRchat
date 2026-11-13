import axios from "axios";
import { api } from "./api";
export interface User {
  id: number;
  name: string;
  email: string;
  bio: string | null;
  email_verified_at: string | null;
  roles: string[];
  avatar_url: string | null;
}
export interface DeviceSession {
  id: string;
  ip_address: string | null;
  user_agent: string;
  last_active_at: string;
  current: boolean;
}
export async function csrf() {
  await axios.get("/sanctum/csrf-cookie", {
    withCredentials: true,
    headers: { Accept: "application/json" },
  });
}
export async function mutate<T>(
  method: "post" | "patch" | "put" | "delete",
  path: string,
  data?: unknown,
): Promise<T> {
  await csrf();
  return (await api.request<T>({ method, url: path, data })).data;
}
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const errors = error.response?.data?.errors as
      Record<string, string[]> | undefined;
    if (errors) return Object.values(errors).flat().join(" ");
    if (error.response?.status === 429)
      return "Too many attempts. Please wait a minute and try again.";
    if (error.response?.status === 419)
      return "Your secure session expired. Refresh the page and try again.";
    return (
      error.response?.data?.message || "Unable to connect. Please try again."
    );
  }
  return "Something went wrong. Please try again.";
}
