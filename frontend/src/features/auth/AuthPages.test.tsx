import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignIn, Protected, VerifyEmail } from "./AuthPages";
import { mutate } from "../../lib/auth";
import { useAuth } from "../../store/auth";
vi.mock("../../lib/auth", async (original) => ({
  ...(await original<typeof import("../../lib/auth")>()),
  mutate: vi.fn(),
}));
const user = {
  id: 1,
  name: "Alex",
  email: "alex@example.test",
  bio: null,
  avatar_url: null,
  roles: ["user"],
  email_verified_at: null,
};
beforeEach(() => {
  useAuth.setState({ user: null, status: "ready" });
  vi.clearAllMocks();
});
function loginForm() {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/verify-email" element={<p>Verification required</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
describe("authentication screens", () => {
  it("redirects guests from protected routes", async () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route element={<Protected />}>
            <Route path="/settings" element={<p>Secret</p>} />
          </Route>
          <Route path="/login" element={<p>Please sign in</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Please sign in")).toBeInTheDocument();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });
  it("requires verification before entering the account workspace", () => {
    useAuth.setState({ user });
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route element={<Protected verified />}>
            <Route path="/app" element={<p>Private workspace</p>} />
          </Route>
          <Route path="/verify-email" element={<p>Verify first</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Verify first")).toBeInTheDocument();
  });
  it("denies an ordinary user on admin routes", () => {
    useAuth.setState({
      user: { ...user, email_verified_at: "2026-11-13T00:00:00Z" },
    });
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Protected verified admin />}>
            <Route path="/" element={<p>Admin content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "do not have administrator access",
    );
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });
  it("signs in through cookie transport and keeps identity only in memory", async () => {
    vi.mocked(mutate).mockResolvedValue({ data: user });
    loginForm();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "StrongPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText("Verification required");
    expect(mutate).toHaveBeenCalledWith("post", "/login", {
      email: user.email,
      password: "StrongPassword123!",
    });
    expect(useAuth.getState().user?.id).toBe(1);
    expect(localStorage.length).toBe(0);
  });
  it("shows a server login error accessibly", async () => {
    vi.mocked(mutate).mockRejectedValue(new Error("Unavailable"));
    loginForm();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "incorrect" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(useAuth.getState().user).toBeNull();
  });
  it("rejects verification links pointing to another origin", async () => {
    useAuth.setState({ user });
    render(
      <MemoryRouter
        initialEntries={[
          "/verify-email?verification_url=https%3A%2F%2Fevil.example%2Fapi%2Fv1%2Femail%2Fverify%2F1%2F" +
            "a".repeat(40),
        ]}
      >
        <VerifyEmail />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Verify email address" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("invalid"),
    );
  });
});
