import { ChatDashboard } from "./features/chat/ChatDashboard";
import {
  AuthBootstrap,
  AccountNav,
  GuestOnly,
  Protected,
  SignIn,
  ForgotPassword,
  ResetPassword,
  VerifyEmail,
  Settings,
  AdminAccess,
} from "./features/auth/AuthPages";
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  Database,
  Layers3,
  MessageCircle,
  Moon,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { fetchHealth, type Health } from "./lib/api";
import { usePreferences } from "./store/preferences";
import "./App.css";
const year = new Date().getFullYear();

function Foundation() {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((data) => {
        setHealth(data);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <>
      <div className="eyebrow">
        <span /> THE START OF SOMETHING CONNECTED
      </div>
      <section className="hero">
        <div>
          <h1>
            Good conversations.
            <br />
            <em>Great foundations.</em>
          </h1>
          <p>
            A thoughtful space for real-time connection. Your WebRchat workspace
            starts here.
          </p>
          <a className="primary" href="#workspace">
            Explore the workspace <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="illustration" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="bubble bubble-one">
            <MessageCircle size={38} />
            <span>Made for connection.</span>
            <i>WebRchat</i>
          </div>
          <div className="bubble bubble-two">
            <span className="mini-avatar">W</span>
            <div>
              <b>A little closer, in real time.</b>
              <div className="dots">● ● ●</div>
            </div>
          </div>
          <div className="spark">✦</div>
        </div>
      </section>
      <section className="workspace" id="workspace">
        <div className="section-heading">
          <div>
            <span className="overline">DEVELOPER WORKSPACE</span>
            <h2>A solid place to build.</h2>
          </div>
          <span className="phase-badge">
            <Layers3 size={14} /> Phase 03 · Workspace
          </span>
        </div>
        <div className="cards">
          <article className="card status-card">
            <div className="card-top">
              <span className="icon-tile">
                <Server size={21} />
              </span>
              <span className={"status " + state} role="status">
                {state === "loading"
                  ? "Checking API…"
                  : state === "ready"
                    ? "API connected"
                    : "API unavailable"}
              </span>
            </div>
            <h3>Application health</h3>
            <p>
              A live readiness check of the API and its required dependencies.
            </p>
            <div className="health-row">
              <span>Laravel API</span>
              <span>
                {state === "ready"
                  ? "Ready"
                  : state === "loading"
                    ? "Checking"
                    : "Unavailable"}
              </span>
            </div>
            <div className="health-row">
              <span>MySQL database</span>
              <span>{health?.checks.database ?? "Unverified"}</span>
            </div>
            <div className="health-row">
              <span>Redis cache</span>
              <span>{health?.checks.cache ?? "Unverified"}</span>
            </div>
            <button
              className="text-button"
              disabled={state === "loading"}
              onClick={() => {
                setState("loading");
                setHealth(null);
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw size={14} /> Check connection
            </button>
          </article>
          <article className="card">
            <div className="card-top">
              <span className="icon-tile violet">
                <Database size={21} />
              </span>
              <span className="small-label">BUILT TO GROW</span>
            </div>
            <h3>Designed around people</h3>
            <p>
              A normalized data model for private conversations, groups,
              messages, and moderation.
            </p>
            <div className="feature">
              <Check size={15} /> Unique direct conversation pairs
            </div>
            <div className="feature">
              <Check size={15} /> Indexed message history
            </div>
            <div className="feature">
              <Check size={15} /> Retry-safe message identifiers
            </div>
            <Link className="card-link" to="/roadmap">
              See what comes next <ChevronRight size={15} />
            </Link>
          </article>
          <article className="card dark-card">
            <span className="icon-tile">
              <Radio size={21} />
            </span>
            <span className="overline">NEXT UP · PHASE 04</span>
            <h3>
              Messages that
              <br />
              stay connected.
            </h3>
            <p>
              Secure accounts, profiles, and role-based access are the next
              milestone.
            </p>
            <span className="coming-soon">Planned · Next milestone</span>
          </article>
        </div>
      </section>
      <div className="principles">
        <span>
          <ShieldCheck size={16} /> Privacy by design
        </span>
        <span>
          <Code2 size={16} /> Laravel + React + TypeScript
        </span>
        <span>
          <Layers3 size={16} /> One phase at a time
        </span>
      </div>
    </>
  );
}
function Roadmap() {
  return (
    <section className="roadmap">
      <span className="overline">THE ROAD AHEAD</span>
      <h1>Built with intention.</h1>
      <p>Phases 1–3 are implemented. Later phases require approval.</p>
      <ol>
        {[
          "Foundation, architecture, Docker & schema",
          "Authentication, profiles & authorization",
          "Chat dashboard & navigation",
          "Persistent direct messaging API",
          "WebSockets, presence & read receipts",
          "Groups & membership",
          "Attachments, reactions & voice",
          "Notifications, search & safety",
          "Administration & moderation",
          "Security review, testing & deployment",
        ].map((phase, index) => (
          <li key={phase}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {phase}
            <small>{index < 3 ? "Implemented" : "Planned"}</small>
          </li>
        ))}
      </ol>
      <Link className="card-link" to="/">
        Back to workspace <ChevronRight size={16} />
      </Link>
    </section>
  );
}
function AppFrame() {
  const { dark, toggleTheme } = usePreferences();
  const { pathname } = useLocation();
  const dashboard = pathname === "/app" || pathname.startsWith("/app/");
  return (
    <div
      className={`app ${dark ? "theme-dark" : ""} ${dashboard ? "is-dashboard" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {!dashboard && (
        <header>
          <Link className="brand" to="/">
            <span className="brand-icon">
              <MessageCircle size={22} />
            </span>
            WebRchat<span className="brand-dot">.</span>
          </Link>
          <AccountNav />
          <nav aria-label="Main navigation">
            <Link to="/">Workspace</Link>
            <Link to="/roadmap">Roadmap</Link>
          </nav>
          <button
            className="theme-button"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </header>
      )}
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Foundation />} />
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<SignIn key="login" />} />
            <Route
              path="/register"
              element={<SignIn key="register" register />}
            />
          </Route>
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<Protected />}>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route element={<Protected verified />}>
            <Route path="/app" element={<ChatDashboard />} />
            <Route
              path="/app/conversations/:conversationId"
              element={<ChatDashboard />}
            />
          </Route>
          <Route element={<Protected verified admin />}>
            <Route path="/admin" element={<AdminAccess />} />
          </Route>
          <Route path="/roadmap" element={<Roadmap />} />
          <Route
            path="*"
            element={
              <section className="roadmap">
                <h1>Page not found</h1>
                <Link to="/">Return to workspace</Link>
              </section>
            }
          />
        </Routes>
      </main>
      {!dashboard && (
        <footer>
          <span>WebRchat © {year}</span>
          <span>Less distance. More conversation.</span>
          <span className="footer-note">WORKSPACE RELEASE</span>
        </footer>
      )}
    </div>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap>
        <AppFrame />
      </AuthBootstrap>
    </BrowserRouter>
  );
}
