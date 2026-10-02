import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { DEMO, supabase } from "../lib/auth";
import { rememberReturnTo, validateReturnTo } from "../lib/internal-return";
import { isPublicInformationPath } from "../lib/public-information";
import { Button, Loading, Notice } from "./ui";

const SETUP_PATHS = new Set([
  "/onboarding",
  "/preferences",
  "/settings",
  "/account/security",
]);

/** Account safety controls stay reachable even when setup cannot be checked. */
export function isOnboardingSetupPath(pathname: string): boolean {
  return (
    SETUP_PATHS.has(pathname.replace(/\/+$/, "") || "/") ||
    isPublicInformationPath(pathname)
  );
}

type SetupStatus =
  | { identity: string; completed: boolean; error?: never }
  | { identity: string; error: string; completed?: never };

/** Cache only this mount's current account. Visiting setup invalidates it so
 * successful completion or a saved skip is re-read when returning to the app. */
export function OnboardingGate({
  children,
  signedIn,
  identity,
  demo = DEMO,
}: {
  children: ReactNode;
  signedIn: boolean;
  identity: string | null;
  demo?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const setupPath = isOnboardingSetupPath(location.pathname);
  const enabled = signedIn && Boolean(identity) && !demo;
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus(null);
    if (!enabled || !identity || setupPath) return;
    const checkedIdentity = identity;
    async function checkSetup() {
      try {
        // api.me reads the current bearer token. Verify its account before and
        // after the read so an auth transition cannot label another profile.
        const before = (await supabase?.auth.getSession())?.data.session;
        if (!active) return;
        if (before?.user.id !== checkedIdentity)
          throw new Error("Your sign-in changed. Try checking setup again.");
        const me = await api.me();
        const after = (await supabase?.auth.getSession())?.data.session;
        if (!active) return;
        if (after?.user.id !== checkedIdentity)
          throw new Error("Your sign-in changed. Try checking setup again.");
        setStatus({
          identity: checkedIdentity,
          completed: me.profile.onboardingCompleted === true,
        });
      } catch (cause) {
        if (active)
          setStatus({
            identity: checkedIdentity,
            error:
              cause instanceof Error && cause.message
                ? cause.message
                : "Could not check your account setup. Try again.",
          });
      }
    }
    void checkSetup();
    return () => {
      active = false;
    };
  }, [enabled, identity, setupPath, revision]);

  useEffect(() => {
    if (
      !enabled ||
      setupPath ||
      !status ||
      status.identity !== identity ||
      status.error ||
      status.completed !== false
    )
      return;
    const returnTo =
      validateReturnTo(location.pathname + location.search + location.hash) ||
      "/create";
    try {
      rememberReturnTo(returnTo);
    } catch {
      // The validated URL also carries the destination when storage is blocked.
    }
    void navigate(`/onboarding?returnTo=${encodeURIComponent(returnTo)}`, {
      replace: true,
    });
  }, [
    enabled,
    setupPath,
    status,
    identity,
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ]);

  if (!enabled || setupPath) return children;
  if (!status || status.identity !== identity) return <Loading />;
  if (status.error)
    return (
      <section aria-label="Account setup check">
        <Notice error>{status.error}</Notice>
        <Button
          secondary
          onClick={() => {
            setStatus(null);
            setRevision((value) => value + 1);
          }}
        >
          Retry setup check
        </Button>
        <Link className="button secondary" to="/settings">
          Account settings
        </Link>
      </section>
    );
  return status.completed ? children : <Loading />;
}
