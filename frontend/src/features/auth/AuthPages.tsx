import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../lib/api";
import {
  errorMessage,
  mutate,
  type DeviceSession,
  type User,
} from "../../lib/auth";
import { useAuth } from "../../store/auth";
import "./auth.css";

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const load = useAuth((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return children;
}
export function Protected({
  verified = false,
  admin = false,
}: {
  verified?: boolean;
  admin?: boolean;
}) {
  const { user, status, load } = useAuth();
  const location = useLocation();
  if (status === "loading")
    return (
      <div className="account-loading" role="status">
        <LoaderCircle size={20} /> Checking your session…
      </div>
    );
  if (status === "error")
    return (
      <div className="account-loading" role="alert">
        Unable to check your session.{" "}
        <button className="text-button" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  if (verified && !user.email_verified_at)
    return <Navigate to="/verify-email" replace />;
  if (admin && !user.roles.includes("admin"))
    return (
      <div className="account-loading" role="alert">
        You do not have administrator access.{" "}
        <Link to="/app">Return to your account</Link>
      </div>
    );
  return <Outlet />;
}
export function GuestOnly() {
  const { user, status } = useAuth();
  if (status === "loading")
    return (
      <div className="account-loading" role="status">
        Checking your session…
      </div>
    );
  return user ? (
    <Navigate to={user.email_verified_at ? "/app" : "/verify-email"} replace />
  ) : (
    <Outlet />
  );
}
function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section className="auth-layout">
      <aside className="auth-story">
        <span className="overline">YOUR SPACE TO CONNECT</span>
        <h1>
          A familiar face.
          <br />
          <em>A fresh conversation.</em>
        </h1>
        <p>
          Start with a secure account. Build meaningful connections from there.
        </p>
        <div>
          <ShieldCheck size={20} />
          <span>Private sessions. Thoughtful defaults.</span>
        </div>
      </aside>
      <div className="auth-card">
        <span className="overline">WEBRCHAT ACCOUNT</span>
        <h2>{title}</h2>
        <p>{intro}</p>
        {children}
      </div>
    </section>
  );
}
function Notice({ error, message }: { error: string; message?: string }) {
  return (
    <>
      {error && (
        <div className="form-notice error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="form-notice success" role="status">
          {message}
        </div>
      )}
    </>
  );
}
function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="primary auth-submit" disabled={busy} type="submit">
      {busy ? (
        <>
          <LoaderCircle size={16} className="spin" /> Please wait…
        </>
      ) : (
        <>
          {children}
          <ArrowRight size={16} />
        </>
      )}
    </button>
  );
}
const passwordHelp =
  "Use at least 12 characters, including uppercase and lowercase letters and a number.";
export function SignIn({ register = false }: { register?: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const setUser = useAuth((s) => s.setUser);
  const [params] = useSearchParams();
  const navigate = useNavigate(),
    location = useLocation();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await mutate<{ data: User }>(
        "post",
        register ? "/register" : "/login",
        data,
      );
      setUser(result.data);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(
        from && /^\/(verify-email|settings|app|admin)([/?#]|$)/.test(from)
          ? from
          : result.data.email_verified_at
            ? "/app"
            : "/verify-email",
        { replace: true },
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard
      title={register ? "Make yourself at home." : "Welcome back."}
      intro={
        register
          ? "Create your account to get started."
          : "Sign in to your WebRchat account."
      }
    >
      <form onSubmit={submit} key={register ? "register" : "login"}>
        <Notice
          error={error}
          message={
            params.has("password-reset")
              ? "Password reset. Sign in with your new password."
              : undefined
          }
        />
        {register && (
          <label>
            Full name
            <input name="name" autoComplete="name" maxLength={100} required />
          </label>
        )}
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            minLength={register ? 12 : undefined}
            maxLength={4096}
            required
            aria-describedby={register ? "password-help" : undefined}
          />
        </label>
        {register && (
          <>
            <small id="password-help" className="field-help">
              {passwordHelp}
            </small>
            <label>
              Confirm password
              <input
                name="password_confirmation"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
              />
            </label>
          </>
        )}
        {!register && (
          <Link className="subtle-link" to="/forgot-password">
            Forgot your password?
          </Link>
        )}
        <Submit busy={busy}>{register ? "Create account" : "Sign in"}</Submit>
      </form>
      <p className="auth-switch">
        {register ? "Already have an account?" : "New to WebRchat?"}{" "}
        <Link to={register ? "/login" : "/register"}>
          {register ? "Sign in" : "Create account"}
        </Link>
      </p>
    </AuthCard>
  );
}
export function ForgotPassword() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await mutate<{ message: string }>(
        "post",
        "/forgot-password",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      setMessage(result.message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard
      title="Let's get you back in."
      intro="Enter your email and we'll send you a secure reset link."
    >
      <form onSubmit={submit}>
        <Notice error={error} message={message} />
        <label>
          Email address
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <Submit busy={busy}>Send reset link</Submit>
      </form>
      <Link className="subtle-link" to="/login">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
export function ResetPassword() {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const token = params.get("token");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await mutate("post", "/reset-password", {
        ...Object.fromEntries(new FormData(event.currentTarget)),
        token,
      });
      await useAuth.getState().load();
      navigate("/login?password-reset=1", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard
      title="A fresh start."
      intro="Choose a strong password for your account."
    >
      {!token ? (
        <>
          <p role="alert">This reset link is missing or invalid.</p>
          <Link to="/forgot-password">Request a new link</Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <Notice error={error} />
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={params.get("email") || ""}
              required
            />
          </label>
          <label>
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <small className="field-help">{passwordHelp}</small>
          <label>
            Confirm password
            <input
              name="password_confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </label>
          <Submit busy={busy}>Reset password</Submit>
        </form>
      )}
    </AuthCard>
  );
}
export function VerifyEmail() {
  const { user, load } = useAuth(),
    [params] = useSearchParams();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function verify() {
    setError("");
    setBusy(true);
    try {
      const url = new URL(params.get("verification_url") || "");
      if (
        url.origin !== window.location.origin ||
        !/^\/api\/v1\/email\/verify\/\d+\/[a-f0-9]{40}$/.test(url.pathname)
      )
        throw new Error("Invalid verification URL");
      const result = await api.get<{ message: string }>(url.href);
      await load();
      setMessage(result.data.message);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "Invalid verification URL"
          ? "This verification link is invalid. Request a new email and use the same site address."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setError("");
    setBusy(true);
    try {
      const result = await mutate<{ message: string }>(
        "post",
        "/email/verification-notification",
      );
      setMessage(result.message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard
      title={user?.email_verified_at ? "You’re all set." : "Check your inbox."}
      intro={
        user?.email_verified_at
          ? "Your email address has been verified."
          : `We sent a verification link to ${user?.email || "your email address"}.`
      }
    >
      <Notice error={error} message={message} />
      {user?.email_verified_at ? (
        <Link className="primary" to="/app">
          Continue to your account <CheckCircle2 size={16} />
        </Link>
      ) : (
        <>
          {params.get("verification_url") && (
            <button
              className="primary auth-submit"
              onClick={() => void verify()}
              disabled={busy}
            >
              Verify email address
            </button>
          )}
          <button
            className="outline-button"
            onClick={() => void resend()}
            disabled={busy}
          >
            Resend verification email
          </button>
          <p className="field-help">
            You can update your email in{" "}
            <Link to="/settings">account settings</Link>.
          </p>
        </>
      )}
    </AuthCard>
  );
}
export function Account() {
  const user = useAuth((s) => s.user);
  return (
    <section className="account-page">
      <span className="overline">YOUR WEBRCHAT ACCOUNT</span>
      <h1>Welcome, {user?.name.split(" ")[0]}.</h1>
      <p>Your email is verified and your account is ready.</p>
      <div className="account-grid">
        <article className="card">
          <ShieldCheck size={24} />
          <h2>Make it yours.</h2>
          <p>
            Update your profile, secure your account, and review active
            sessions.
          </p>
          <Link className="card-link" to="/settings">
            Account settings <ArrowRight size={16} />
          </Link>
        </article>
        <article className="card">
          <h2>Conversations are next.</h2>
          <p>
            The chat dashboard and messaging arrive in later phases. Your secure
            account is the foundation.
          </p>
          <Link className="card-link" to="/roadmap">
            View the roadmap <ArrowRight size={16} />
          </Link>
        </article>
      </div>
      {user?.roles.includes("admin") && (
        <Link className="outline-button" to="/admin">
          Administration
        </Link>
      )}
    </section>
  );
}
export function AdminAccess() {
  const [state, setState] = useState("Checking server authorization…");
  useEffect(() => {
    let mounted = true;
    api
      .get("/admin/access")
      .then(() => {
        if (mounted)
          setState(
            "Administrator access verified. Moderation tools arrive in Phase 9.",
          );
      })
      .catch(() => {
        if (mounted) setState("Access denied by the server.");
      });
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <section className="account-page">
      <span className="overline">ADMINISTRATION</span>
      <h1>Platform access.</h1>
      <p role="status">{state}</p>
      <p>
        Administrator status does not grant access to private conversations.
      </p>
    </section>
  );
}
export function Settings() {
  const { user, setUser } = useAuth();
  const [sessions, setSessions] = useState<DeviceSession[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refreshSessions() {
    try {
      setSessions(
        (await api.get<{ data: DeviceSession[] }>("/sessions")).data.data,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    let active = true;
    api
      .get<{ data: DeviceSession[] }>("/sessions")
      .then(({ data }) => {
        if (active) setSessions(data.data);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(event: FormEvent<HTMLFormElement>, password = false) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (!password && values.email === user?.email) delete values.email;
    if (!values.current_password) delete values.current_password;
    try {
      if (password) {
        await mutate("put", "/password", values);
        form.reset();
        setMessage("Password updated. Other sessions were signed out.");
      } else {
        const data = await mutate<{ data: User }>("patch", "/profile", values);
        setUser(data.data);
        setMessage(
          data.data.email_verified_at
            ? "Profile updated."
            : "Profile updated. Check your inbox to verify your email.",
        );
      }
      await refreshSessions();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setError("");
    setBusy(true);
    try {
      await mutate(
        "delete",
        id === "others" ? "/sessions/others" : `/sessions/${id}`,
      );
      setMessage("Session access revoked.");
      await refreshSessions();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-page">
      <span className="overline">PERSONAL SETTINGS</span>
      <h1>Your account, your space.</h1>
      <Notice error={error} message={message} />
      <div className="settings-grid">
        <section className="card">
          <h2>Profile</h2>
          <form onSubmit={(e) => void save(e)}>
            <label>
              Full name
              <input
                name="name"
                defaultValue={user?.name}
                maxLength={100}
                required
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                defaultValue={user?.email}
                required
              />
            </label>
            <label>
              About you
              <textarea
                name="bio"
                defaultValue={user?.bio || ""}
                maxLength={500}
                rows={3}
              />
            </label>
            <label>
              Current password <small>(required to change email)</small>
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
              />
            </label>
            <Submit busy={busy}>Save profile</Submit>
          </form>
        </section>
        <section className="card">
          <h2>Password</h2>
          <form onSubmit={(e) => void save(e, true)}>
            <label>
              Current password
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <small className="field-help">{passwordHelp}</small>
            <label>
              Confirm password
              <input
                name="password_confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <Submit busy={busy}>Update password</Submit>
          </form>
        </section>
      </div>
      <section className="card sessions-card">
        <h2>Active sessions</h2>
        <p>Only you can view or revoke these sessions.</p>
        {sessions.map((session) => (
          <div className="session-row" key={session.id}>
            <div>
              <strong>
                {session.current ? "This session" : "Another session"}
              </strong>
              <p>
                {session.user_agent || "Unknown browser"} · {session.ip_address}
              </p>
              <small>
                Last active {new Date(session.last_active_at).toLocaleString()}
              </small>
            </div>
            {!session.current && (
              <button
                className="outline-button"
                disabled={busy}
                onClick={() => void revoke(session.id)}
              >
                Sign out
              </button>
            )}
          </div>
        ))}
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => void revoke("others")}
        >
          Sign out all other sessions
        </button>
      </section>
    </section>
  );
}
export function AccountNav() {
  const { user, status, setUser } = useAuth(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function logout() {
    setError("");
    setBusy(true);
    try {
      await mutate("post", "/logout");
      setUser(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (status === "loading") return null;
  return (
    <div className="account-nav">
      {user ? (
        <>
          <Link to={user.email_verified_at ? "/app" : "/verify-email"}>
            My account
          </Link>
          <Link to="/settings">Settings</Link>
          <button
            aria-label="Sign out"
            title="Sign out"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={17} />
          </button>
        </>
      ) : (
        <>
          <Link to="/login">Sign in</Link>
          <Link className="nav-register" to="/register">
            Get started
          </Link>
        </>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
