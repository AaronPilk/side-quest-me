import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Route,
  Routes,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  Gift,
  UserRound,
  ArrowUpRight,
  ShieldCheck,
  Compass,
  PlusCircle,
  Bell,
} from "lucide-react";
import { BrandMark } from "./components/BrandMark";
import "./navigation-design.css";
import { supabase, DEMO } from "./lib/auth";
import { emailSignInRedirect, startNativeApp } from "./lib/native-app";
import { isNativeApp } from "./lib/runtime";
import { clearCaptureDrafts } from "./lib/capture-drafts";
import {
  accountIdentityChanged,
  PROFILE_DRAFT_KEYS,
} from "./lib/profile-drafts";
import { APP_CONFIG } from "../shared/domain";
import {
  consumeReturnTo,
  rememberReturnTo,
  validateReturnTo,
} from "./lib/internal-return";
import { Button, Loading, Notice } from "./components/ui";
import { AdventureCarousel } from "./components/AdventureCarousel";
import { BrandAccountGate } from "./components/BrandAccountGate";
import Quest from "./pages/Quest";
import Profile from "./pages/Profile";
import Onboarding from "./pages/Onboarding";
import Journal from "./pages/Journal";
import Rewards from "./pages/Rewards";
import PublicQuest from "./pages/PublicQuest";

const ActiveQuest = lazy(() => import("./pages/ActiveQuest"));
const Operator = lazy(() => import("./pages/Operator"));
const ImportProfile = lazy(() => import("./pages/ImportProfile"));
const Discover = lazy(() => import("./pages/Discover"));
const Activity = lazy(() => import("./pages/Activity"));
const Creator = lazy(() => import("./pages/Creator"));
const Series = lazy(() => import("./pages/Series"));
const CommunityStudio = lazy(() => import("./pages/CommunityStudio"));
const BusinessWorkspace = lazy(() =>
  import("./pages/CommunityStudio").then((module) => ({
    default: module.BusinessWorkspace,
  })),
);
const CommunityAdmin = lazy(() =>
  import("./pages/CommunityStudio").then((module) => ({
    default: module.CommunityAdmin,
  })),
);
const Settings = lazy(() => import("./pages/Settings"));
const DemoTools = lazy(() =>
  import("./pages/Settings").then((module) => ({ default: module.DemoTools })),
);
const OriginalQuest = lazy(() => import("./pages/OriginalQuest"));
const LicenseOffer = lazy(() => import("./pages/LicenseOffer"));
export default function App() {
  const [signedIn, setSignedIn] = useState(DEMO);
  const [identity, setIdentity] = useState<string | null>(DEMO ? "demo" : null);
  const [authError, setAuthError] = useState("");
  const [nativeError, setNativeError] = useState("");
  const [authRevision, setAuthRevision] = useState(0);
  const [loading, setLoading] = useState(!DEMO && !!supabase);
  const authIdentity = useRef<string | null | undefined>(undefined);
  const location = useLocation();
  const navigate = useNavigate();
  const nativeNavigate = useRef(navigate);
  useEffect(() => {
    nativeNavigate.current = navigate;
  }, [navigate]);
  useEffect(
    () =>
      startNativeApp({
        auth: supabase?.auth ?? null,
        onNavigate: (route, replace) => {
          setNativeError("");
          if (replace) {
            try {
              sessionStorage.removeItem("sq-return-to");
            } catch {
              /* The native callback already has its validated destination. */
            }
          }
          void nativeNavigate.current(route, { replace });
        },
        onError: setNativeError,
      }),
    [],
  );
  const isReel = /^\/posts\/[^/]+$/.test(location.pathname);
  const publicPage =
    /^\/(?:discover|posts\/|creators\/|quests\/)/.test(location.pathname) ||
    /^\/series(?:\/[0-9a-f-]{36})?$/i.test(location.pathname);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authEventRevision = 0;
    function acceptIdentity(next: string | null, event?: string) {
      if (accountIdentityChanged(authIdentity.current, next, event)) {
        void clearCaptureDrafts().catch(() => {});
        try {
          for (const key of [
            "sq-quest-flow",
            "sq-outing",
            "sq-return-to",
            ...PROFILE_DRAFT_KEYS,
          ])
            sessionStorage.removeItem(key);
        } catch {
          /* Identity-bound draft reads also reject foreign/unowned storage. */
        }
        try {
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith("sq-series-editor:"))
              localStorage.removeItem(key);
          }
        } catch {
          /* Owner-scoped series drafts are also checked before loading/saving. */
        }
      }
      authIdentity.current = next;
      setSignedIn(!!next);
      setIdentity(next);
    }
    setLoading(true);
    setAuthError("");
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (!active || authEventRevision !== 0) return;
        acceptIdentity(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (active && authEventRevision === 0)
          setAuthError("Could not check your sign-in. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!active) return;
      authEventRevision++;
      setAuthError("");
      acceptIdentity(session?.user.id ?? null, _e);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [authRevision]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const started =
    sessionStorage.getItem("sq-demo-started") ||
    localStorage.getItem("sidequest-demo-v1");
  const [welcome, setWelcome] = useState(DEMO && !started);
  const navigationVisible =
    ((signedIn && !welcome) || publicPage) &&
    !location.pathname.startsWith("/onboarding") &&
    !isReel;
  const isDiscover = location.pathname === "/discover";
  const isSeriesBrowse = /^\/series(?:\/[0-9a-f-]{36})?$/i.test(
    location.pathname,
  );
  const isSeriesEditor =
    location.pathname === "/series/new" ||
    /^\/series\/[^/]+\/edit$/.test(location.pathname);
  useEffect(() => {
    if ((!signedIn || welcome) && !publicPage) {
      const target = validateReturnTo(location.pathname + location.search);
      if (
        target &&
        (location.pathname !== "/account" ||
          !sessionStorage.getItem("sq-return-to"))
      )
        rememberReturnTo(target);
    }
    if (signedIn && location.pathname === "/auth/callback") {
      navigate(consumeReturnTo(), { replace: true });
    }
  }, [
    signedIn,
    welcome,
    publicPage,
    location.pathname,
    location.search,
    navigate,
  ]);
  return (
    <div
      className={`app-shell ${navigationVisible ? "has-navigation" : ""} ${isDiscover ? "discover-shell" : ""} ${isReel ? "reel-shell" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="brandbar">
        <Link to="/discover" className="brand">
          <span className="brand-mark">
            <BrandMark size={34} />
          </span>
          <span className="brand-name">{APP_CONFIG.name}</span>
          <span
            className="beta"
            title={DEMO ? "Local demonstration. No real payments." : "Pilot"}
          >
            {DEMO ? "DEMO" : "PILOT"}
          </span>
        </Link>
        {!navigationVisible && (
          <span className="private-note">
            <ShieldCheck size={15} /> Your story, your call
          </span>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        {nativeError && (
          <Notice error>
            {nativeError}{" "}
            <button className="text-button" onClick={() => setNativeError("")}>
              Dismiss
            </button>
          </Notice>
        )}
        {loading && !publicPage ? (
          <Loading />
        ) : authError && !publicPage ? (
          <>
            <Notice error>{authError}</Notice>
            <Button onClick={() => setAuthRevision((value) => value + 1)}>
              Retry sign-in check
            </Button>
          </>
        ) : (!signedIn || welcome) && !publicPage ? (
          <Welcome
            onStart={() => {
              sessionStorage.setItem("sq-demo-started", "1");
              setWelcome(false);
            }}
          />
        ) : (
          <Suspense fallback={<Loading />}>
            <Routes key={identity ?? "guest"}>
              <Route path="/" element={<Quest />} />
              <Route path="/create" element={<Quest />} />
              <Route
                path="/discover"
                element={<Discover signedIn={signedIn} />}
              />
              <Route
                path="/posts/:id"
                element={<Discover signedIn={signedIn} />}
              />
              <Route
                path="/creators/:id"
                element={<Creator signedIn={signedIn} />}
              />
              <Route path="/quests/:templateId" element={<PublicQuest />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route
                path="/profile"
                element={<Creator signedIn={signedIn} />}
              />
              <Route path="/account" element={<Profile />} />
              <Route path="/studio" element={<CommunityStudio />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/demo-tools" element={<DemoTools />} />
              <Route
                path="/business"
                element={
                  <BrandAccountGate>
                    <BusinessWorkspace />
                  </BrandAccountGate>
                }
              />
              <Route path="/admin" element={<CommunityAdmin />} />
              <Route path="/originals/new" element={<OriginalQuest />} />
              <Route path="/originals/:id" element={<OriginalQuest />} />
              {[
                "/series",
                "/series/new",
                "/series/:id",
                "/series/:id/edit",
              ].map((path) => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <Series
                      key={`${signedIn}:${location.pathname}`}
                      signedIn={signedIn}
                    />
                  }
                />
              ))}
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
            { to: "/discover", label: "Discover", icon: Compass },
            { to: "/activity", label: "Activity", icon: Bell },
            { to: "/create", label: "Create", icon: PlusCircle },
            { to: "/rewards", label: "Rewards", icon: Gift },
            { to: "/profile", label: "Profile", icon: UserRound },
          ].map((item) => {
            const active =
              location.pathname === item.to ||
              (item.to === "/discover" && isSeriesBrowse) ||
              (item.to === "/create" && isSeriesEditor);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                <item.icon size={22} />
                <span>{item.label}</span>
              </Link>
            );
          })}
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
    setMessage("");
    try {
      const { error } = await supabase!.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: emailSignInRedirect() },
      });
      if (error) throw error;
      setMessage(
        isNativeApp()
          ? "Check your email on this phone. Tap the sign-in link to return to Sidequest."
          : "Check your email. Your private sign-in link is on its way.",
      );
    } catch {
      setError(
        "Could not send your sign-in link. Check your email and try again.",
      );
    } finally {
      setBusy(false);
    }
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
      <AdventureCarousel />
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
              navigate(consumeReturnTo());
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
