import axios from "axios";
// Same-origin SPA cookies. Authentication tokens must never be persisted in browser storage.
export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: "application/json" },
  timeout: 10000,
});
export type Health = {
  status: string;
  service: string;
  checks: { database: string; cache: string };
};
export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  return (await api.get<{ data: Health }>("/health", { signal })).data.data;
}
