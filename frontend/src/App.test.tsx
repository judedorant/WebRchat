import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
import { useAuth } from "./store/auth";
import { fetchHealth } from "./lib/api";
vi.mock("./lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/api")>()),
  fetchHealth: vi.fn(),
}));
beforeEach(() => {
  window.history.replaceState({}, "", "/");
  useAuth.setState({
    user: null,
    status: "ready",
    load: vi.fn().mockResolvedValue(undefined),
  });
});
describe("foundation", () => {
  it("shows verified backend readiness", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      status: "ok",
      service: "WebRchat API",
      checks: { database: "ready", cache: "ready" },
    });
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /good conversations/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("API connected"),
    );
    expect(
      screen.getAllByText("ready", { exact: false }).length,
    ).toBeGreaterThan(0);
  });
  it("reports failure without claiming infrastructure is ready", async () => {
    vi.mocked(fetchHealth).mockRejectedValue(new Error("Unavailable"));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("API unavailable"),
    );
    expect(screen.getAllByText("Unverified")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /check connection/i }),
    ).toBeEnabled();
  });
});
