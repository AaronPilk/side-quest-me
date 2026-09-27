import { lazy, Suspense, useEffect, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  Flag,
  BookOpen,
  Gift,
  UserRound,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { supabase, DEMO } from "./lib/auth";
import { APP_CONFIG } from "../shared/domain";
import { Button, Loading, Notice, QuestArt } from "./components/ui";
import Quest from "./pages/Quest";
import Profile from "./pages/Profile";
import Onboarding from "./pages/Onboarding";
import Journal from "./pages/Journal";
import Rewards from "./pages/Rewards";
import PublicQuest from "./pages/PublicQuest";
const ActiveQuest = lazy(() => import("./pages/ActiveQuest"));
const Operator = lazy(() => import("./pages/Operator"));
export default function App() {
  const [signedIn, setSignedIn] = useState(DEMO);
  const [loading, setLoading] = useState(!DEMO && !!supabase);
  const location = useLocation();
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const started =
    sessionStorage.getItem("sq-demo-started") ||
    localStorage.getItem("sidequest-demo-v1");
  const [welcome, setWelcome] = useState(DEMO && !started);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="brandbar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Flag size={19} />
          </span>
          {APP_CONFIG.name}
          <span className="beta">PILOT</span>
        </Link>
        <span className="private-note">
          <ShieldCheck size={15} />
          Your story, your call
        </span>
      </header>
      {DEMO && (
        <div
          className="demo-strip"
          role="region"
          aria-label="Local demo status"
        >
          <span className="demo-dot" />
          Local demo <span>· Simulated progress. Real video rendering.</span>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {loading ? (
          <Loading />
        ) : location.pathname.startsWith("/quests/") ? (
          <Routes>
            <Route path="/quests/:templateId" element={<PublicQuest />} />
          </Routes>
        ) : !signedIn || welcome ? (
          <Welcome
            onStart={() => {
              sessionStorage.setItem("sq-demo-started", "1");
              setWelcome(false);
            }}
          />
        ) : (
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Quest />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/runs/:id" element={<ActiveQuest />} />
              <Route path="/operator" element={<Operator />} />
              <Route path="/auth/callback" element={<Quest />} />
              <Route
                path="*"
                element={
                  <div className="empty">
                    <h1>That page wandered off.</h1>
                    <Link to="/" className="button">
                      Find a quest
                    </Link>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        )}
      </main>
      {signedIn && !welcome && !location.pathname.startsWith("/onboarding") && (
        <nav className="bottom-nav" aria-label="Primary">
          {[
            { to: "/", label: "Quest", icon: Flag },
            { to: "/journal", label: "Journal", icon: BookOpen },
            { to: "/rewards", label: "Rewards", icon: Gift },
            { to: "/profile", label: "Profile", icon: UserRound },
          ].map((item) => (
            <NavLink key={item.to} to={item.to} end>
              <item.icon size={22} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
function Welcome({ onStart }: { onStart: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error)
      setError(
        "Could not send your sign-in link. Check your email and try again.",
      );
    else
      setMessage("Check your email. Your private sign-in link is on its way.");
  }
  return (
    <section className="welcome">
      <div className="eyebrow">GOOD STORIES START WITH A YES</div>
      <h1>
        Make tonight
        <br />a story.
      </h1>
      <p className="welcome-copy">
        Find a quest worth doing. Make it happen.
        <br className="desktop-break" /> Leave with a reel and a little more
        you.
      </p>
      <QuestArt />
      <div className="example-label">
        An illustrated preview. Your actual story comes next.
      </div>
      <div className="three-steps">
        <span>
          <b>01</b> Pick a quest
        </span>
        <span>
          <b>02</b> Commit to the bit
        </span>
        <span>
          <b>03</b> Keep the story
        </span>
      </div>
      {DEMO ? (
        <>
          <Button
            onClick={() => {
              onStart();
              navigate("/onboarding");
            }}
          >
            Find my first quest <ArrowUpRight size={20} />
          </Button>
          <button
            className="text-button"
            onClick={() => {
              onStart();
              navigate("/");
            }}
          >
            Explore the demo first
          </button>
        </>
      ) : supabase ? (
        <form onSubmit={signIn} className="stack">
          <label>
            Your email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <Button type="submit" busy={busy}>
            Find my first quest <ArrowUpRight size={20} />
          </Button>
          <p className="fine-print">
            We’ll send a secure sign-in link. No password to remember.
          </p>
        </form>
      ) : (
        <Notice>
          Email sign-in needs a Supabase project. For the isolated local demo,
          run <code>npm run dev:demo</code>. Setup details are in the README.
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      <p className="fine-print">Private by default. No pressure to post.</p>
    </section>
  );
}
