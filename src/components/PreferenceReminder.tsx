import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { isBrandAccount } from "../../shared/account";
import type { Profile } from "../../shared/domain";
import { preferenceProgress } from "../../shared/preference-progress";
import { rememberReturnTo, validateReturnTo } from "../lib/internal-return";
import "./preference-reminder.css";

export function PreferenceReminder({
  profile,
  returnTo = "/profile",
  compact = false,
}: {
  profile: Profile;
  returnTo?: string;
  compact?: boolean;
}) {
  const progress = preferenceProgress(profile.preferences);
  if (isBrandAccount(profile) || progress.complete) return null;
  const target = validateReturnTo(returnTo) ?? "/profile";
  // An account that never chose a type and never onboarded starts with the
  // full first onboarding so the account choice is its first step.
  const firstRun = profile.accountType === null && !profile.onboardingCompleted;
  const search = new URLSearchParams(
    firstRun ? { returnTo: target } : { preferences: "1", returnTo: target },
  );

  return (
    <aside
      className={`preference-reminder${compact ? " preference-reminder--compact" : ""}`}
      aria-label="Quest preferences reminder"
    >
      <div className="preference-reminder-heading">
        <span className="preference-reminder-icon" aria-hidden="true">
          <SlidersHorizontal size={19} />
        </span>
        <div>
          <strong>Make quests more your style</strong>
          <span className="preference-reminder-count">
            {progress.answered} of {progress.total} answered
          </span>
        </div>
      </div>
      {!compact && (
        <p>
          Tell us what you enjoy, how you like to join in, and what to leave
          out.
        </p>
      )}
      <Link
        className="preference-reminder-link"
        to={`/onboarding?${search}`}
        onClick={() => rememberReturnTo(target)}
      >
        Continue preferences <ArrowUpRight size={17} aria-hidden="true" />
      </Link>
    </aside>
  );
}
