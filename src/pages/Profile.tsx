import { Link } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  Settings2,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { api } from "../lib/api";
import { preferenceProgress } from "../../shared/preference-progress";
import { preferenceChips } from "../../shared/profile";
import {
  AGE_BAND_OPTIONS,
  confirmedAgeBand,
} from "../../shared/age-eligibility";
import {
  Button,
  PageTitle,
  Notice,
  useResource,
  Loading,
  Back,
} from "../components/ui";
import "./preferences-wizard.css";

export default function Profile() {
  const { data, error, refresh } = useResource(api.me);
  if (!data)
    return (
      <>
        <Back to="/profile">Profile</Back>
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <Button onClick={refresh}>Retry profile</Button>
          </>
        ) : (
          <Loading />
        )}
        <Link className="button secondary" to="/account/security">
          Account settings
        </Link>
      </>
    );
  const { profile } = data;
  const progress = preferenceProgress(profile.preferences);
  const chips = preferenceChips(profile.preferences);
  return (
    <div className="preferences-hub">
      <Back to="/profile">Profile</Back>
      <PageTitle title="Account & quest preferences">
        Better quests start with knowing your style.
      </PageTitle>
      <section
        className="account-preference-entry"
        aria-labelledby="preferences-entry-title"
      >
        <div className="account-preference-entry-heading">
          <SlidersHorizontal size={22} />
          <span className="eyebrow">YOUR PERSONAL FIT</span>
          <span className="support">
            {progress.answered} / {progress.total}
          </span>
        </div>
        <h2 id="preferences-entry-title">Make each quest more you.</h2>
        <p>
          Your account type, interests and boundaries, together in one guided
          setup. Skip any question and return when you’re ready.
        </p>
        <progress
          max={progress.total}
          value={progress.answered}
          aria-label="Confirmed preference answers"
        />
        <Link className="button" to="/preferences?returnTo=%2Faccount">
          {progress.complete
            ? "Edit preferences"
            : progress.answered
              ? "Finish preferences"
              : "Set your preferences"}
          <ArrowRight size={18} />
        </Link>
      </section>
      <nav className="settings-list" aria-label="Preference shortcuts">
        <Link to="/preferences?step=account&returnTo=%2Faccount">
          <UserRound />
          <span>
            <strong>Account details</strong>
            <small>
              {profile.displayName || "Add a private nickname"} ·{" "}
              {profile.accountType === "brand"
                ? "Brand"
                : profile.accountType === "personal"
                  ? "Personal"
                  : "Choose account type"}
              {" · "}
              {AGE_BAND_OPTIONS.find(
                (option) =>
                  option.value === confirmedAgeBand(profile.preferences),
              )?.label ?? "Add age group for adult experiences"}
            </small>
          </span>
          <ArrowRight />
        </Link>
        <Link to="/preferences?step=summary&returnTo=%2Faccount">
          <FileText />
          <span>
            <strong>ChatGPT summary</strong>
            <small>
              {profile.summary
                ? "Review, edit or remove your summary"
                : "Copy the prompt, open ChatGPT and bring a summary"}
            </small>
          </span>
          <ArrowRight />
        </Link>
        <Link to="/settings">
          <Settings2 />
          <span>
            <strong>Settings</strong>
            <small>Sign-in, privacy and account controls</small>
          </span>
          <ArrowRight />
        </Link>
      </nav>
      {chips.length > 0 && (
        <details className="profile-answer-review">
          <summary>Your confirmed preferences</summary>
          <div className="review-chips">
            {chips.map((chip) => (
              <span className="chip selected" key={chip}>
                {chip}
              </span>
            ))}
          </div>
        </details>
      )}
      {!progress.complete && (
        <p className="support">
          Without these answers, we match mainly to today’s outing. Confirming
          your interests and boundaries gives us more to work with.
        </p>
      )}
    </div>
  );
}
