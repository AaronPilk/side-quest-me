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
  Compass,
  PlusCircle,
  Bell,
  MoreHorizontal,
  Settings2,
  BriefcaseBusiness,
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
import {
  DEMO_PEOPLE,
  demoPersona,
  switchDemoPersona,
  type DemoPersona,
} from "./lib/demo-identity";
const ActiveQuest = lazy(() => import("./pages/ActiveQuest"));
const Operator = lazy(() => import("./pages/Operator"));
const ImportProfile = lazy(() => import("./pages/ImportProfile"));
const Discover = lazy(() => import("./pages/Discover"));
const Activity = lazy(() => import("./pages/Activity"));
const Creator = lazy(() => import("./pages/Creator"));
const CommunityStudio = lazy(() => import("./pages/CommunityStudio"));
const OriginalQuest = lazy(() => import("./pages/OriginalQuest"));
const LicenseOffer = lazy(() => import("./pages/LicenseOffer"));
export default function App() {
  const [signedIn, setSignedIn] = useState(DEMO);
  const [loading, setLoading] = useState(!DEMO && !!supabase);
  const location = useLocation();
  const navigate = useNavigate();
  const publicPage = /^\/(?:discover|posts\/|creators\/|quests\/)/.test(
    location.pathname,
  );
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (_e === "SIGNED_OUT") {
        sessionStorage.removeItem("sq-quest-flow");
        sessionStorage.removeItem("sq-outing");
      }
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
  const navigationVisible =
    ((signedIn && !welcome) || publicPage) &&
    !location.pathname.startsWith("/onboarding");
  const isDiscover = location.pathname === "/discover";
  useEffect(() => {
    if ((!signedIn || welcome) && location.pathname === "/create")
      sessionStorage.setItem(
        "sq-return-to",
        location.pathname + location.search,
      );
    if (signedIn && location.pathname === "/auth/callback") {
      const target = sessionStorage.getItem("sq-return-to") || "/create";
      sessionStorage.removeItem("sq-return-to");
      navigate(target, { replace: true });
    }
  }, [signedIn, welcome, location.pathname, location.search, navigate]);
  return (
    <div
      className={`app-shell ${navigationVisible ? "has-navigation" : ""} ${isDiscover ? "discover-shell" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="brandbar">
        <Link to="/discover" className="brand">
          <span className="brand-mark">
            <Flag size={19} />
          </span>
          {APP_CONFIG.name}
          <span className="beta">PILOT</span>
        </Link>
        {navigationVisible ? (
          <details
            className="space-menu"
            onClick={(event) => {
              if ((event.target as Element).closest("a"))
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary aria-label="Your space">
              <MoreHorizontal size={24} />
            </summary>
            <SpaceLinks />
          </details>
        ) : (
          <span className="private-note">
            <ShieldCheck size={15} /> Your story, your call
          </span>
        )}
      </header>
      {DEMO && (
        <div
          className="demo-controls"
          role="region"
          aria-label="Local demo status"
        >
          <span className="demo-status">
            <span className="demo-dot" /> Local demo{" "}
            <span className="demo-context">· no real payments</span>
          </span>
          <label>
            <span className="sr-only">Demo view</span>
            <select
              value={demoPersona()}
              onChange={(event) =>
                switchDemoPersona(event.target.value as DemoPersona)
              }
            >
              {Object.entries(DEMO_PEOPLE).map(([key, person]) => (
                <option key={key} value={key}>
                  {person.role}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {navigationVisible && (
        <div className="desktop-space">
          <SpaceLinks />
          <p>
            Good stories start
            <br />
            with a little curiosity.
          </p>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {loading && !publicPage ? (
          <Loading />
        ) : (!signedIn || welcome) && !publicPage ? (
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
              <Route path="/create" element={<Quest />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/posts/:id" element={<Discover />} />
              <Route path="/creators/:id" element={<Creator />} />
              <Route path="/quests/:templateId" element={<PublicQuest />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/profile" element={<Creator />} />
              <Route path="/account" element={<Profile />} />
              <Route path="/studio" element={<CommunityStudio />} />
              <Route path="/originals/new" element={<OriginalQuest />} />
              <Route path="/originals/:id" element={<OriginalQuest />} />
              <Route path="/offers/:id" element={<LicenseOffer />} />
              <Route path="/profile/import" element={<ImportProfile />} />
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
      {navigationVisible && (
        <nav className="bottom-nav" aria-label="Primary">
          {[
            { to: "/create", label: "Create", icon: PlusCircle },
            { to: "/discover", label: "Discover", icon: Compass },
            { to: "/activity", label: "Activity", icon: Bell },
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
function SpaceLinks() {
  return (
    <nav className="secondary-nav" aria-label="Your space">
      <Link to="/journal">
        <BookOpen size={19} /> Private journal
      </Link>
      <Link to="/rewards">
        <Gift size={19} /> Rewards
      </Link>
      <Link to="/studio">
        <BriefcaseBusiness size={19} /> Creator studio
      </Link>
      <Link to="/account">
        <Settings2 size={19} /> Account settings
      </Link>
    </nav>
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
              navigate(sessionStorage.getItem("sq-return-to") || "/create");
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
