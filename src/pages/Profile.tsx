import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  ArrowUpRight,
  SlidersHorizontal,
  FileText,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { api } from "../lib/api";
import { DEMO, supabase } from "../lib/auth";
import { levelFromXp } from "../../shared/domain";
import { preferenceChips } from "../../shared/profile";
import { preferenceProgress } from "../../shared/preference-progress";
import "./preferences-wizard.css";
import { rememberReturnTo } from "../lib/internal-return";
import { QuestProgress } from "../components/QuestProgress";
import { AccountTypeChoice } from "../components/AccountTypeChoice";
import type { AccountType } from "../../shared/account";
import {
  Button,
  PageTitle,
  Notice,
  useResource,
  Loading,
  Back,
} from "../components/ui";
export default function Profile() {
  const { data, error, refresh } = useResource(api.me);
  const navigate = useNavigate();
  const [name, setName] = useState<string>();
  const [accountType, setAccountType] = useState<AccountType | null>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<"name" | "account" | "type">(
    "name",
  );
  // Sign-out and deletion never depend on a successful profile read.
  const accountControls = (
    <>
      {!DEMO && (
        <Button
          secondary
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            setSaveError(false);
            setFeedbackFor("account");
            try {
              if (!supabase)
                throw new Error(
                  "Sign out is unavailable. Please reload and try again.",
                );
              const result = await supabase.auth.signOut();
              if (result.error) throw result.error;
              navigate("/");
            } catch (cause) {
              setSaveError(true);
              setMessage((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={18} />
          Sign out
        </Button>
      )}
      <button
        className="text-button danger"
        disabled={busy}
        onClick={async () => {
          if (
            !confirm(
              DEMO
                ? "Reset the entire local demo? This clears all four demo views in this browser, including profiles, posts, drafts, offers and progress, and deletes every uploaded clip and rendered reel from the local renderer. The labeled starter fixtures will return. This cannot be undone."
                : "Delete your account and revoke access to your media? Media cleanup is queued. Minimal reward accounting records are retained. This cannot be undone.",
            )
          )
            return;
          setBusy(true);
          setMessage("");
          setSaveError(false);
          setFeedbackFor("account");
          try {
            await api.deleteAccount();
            if (!DEMO) sessionStorage.clear();
            location.assign("/");
          } catch (e) {
            setSaveError(true);
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {DEMO ? "Reset entire local demo" : "Delete my account"}
      </button>
      {message && feedbackFor === "account" && (
        <Notice error={saveError}>{message}</Notice>
      )}
    </>
  );
  if (!data)
    return error ? (
      <>
        <Back to="/settings">Settings</Back>
        <Notice error>{error}</Notice>
        <Button secondary onClick={refresh}>
          Retry profile
        </Button>
        {accountControls}
      </>
    ) : (
      <Loading />
    );
  const level = levelFromXp(data.wallet.xp);
  const chips = preferenceChips(data.profile.preferences);
  const progress = preferenceProgress(data.profile.preferences);
  return (
    <>
      <Back to="/settings">Settings</Back>
      <PageTitle
        eyebrow="YOUR PRIVATE PREFERENCES"
        title="Account & preferences"
      />
      <section
        className="account-preference-entry"
        aria-labelledby="preferences-entry-title"
      >
        <div className="account-preference-entry-heading">
          <SlidersHorizontal size={22} aria-hidden="true" />
          <span className="eyebrow">YOUR QUEST PREFERENCES</span>
          <span className="support">
            {progress.answered} / {progress.total}
          </span>
        </div>
        <h2 id="preferences-entry-title">Make each quest more you.</h2>
        <p>
          A few quick answers, one at a time. Your interests and boundaries help
          us find a better fit.
        </p>
        <progress
          max={progress.total}
          value={progress.answered}
          aria-label="Confirmed preference answers"
        />
        <Link
          className="button"
          to="/onboarding?preferences=1&returnTo=%2Faccount"
          onClick={() => rememberReturnTo("/account")}
        >
          {progress.complete
            ? "Edit preferences"
            : progress.answered
              ? "Finish preferences"
              : "Set your preferences"}
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
        <Link className="account-summary-link" to="/profile/import">
          <FileText size={17} aria-hidden="true" />
          {data.profile.summary
            ? "Edit or review your imported summary"
            : "Use an optional ChatGPT summary"}
        </Link>
      </section>
      <div className="profile-identity">
        <div className="avatar">
          <UserRound size={32} />
        </div>
        <div>
          <h2>{data.profile.displayName || "Your next main character"}</h2>
          <p>
            {DEMO ? "Local demo profile" : "Your private Sidequest account"}
          </p>
        </div>
        <span className="level-badge">Level {level.level}</span>
      </div>
      {data.completedQuestCount !== undefined && (
        <QuestProgress
          completedQuestCount={data.completedQuestCount}
          xp={data.wallet.xp}
          demo={DEMO}
        />
      )}
      <div className="level-card">
        <div className="section-heading">
          <h2>{data.wallet.xp.toLocaleString()} lifetime XP</h2>
          <span className="support">Level {level.level}</span>
        </div>
        <progress
          max="1000"
          value={level.progress}
          aria-label="Progress to next level"
        />
        <p>
          {level.progress} / 1,000 XP to level {level.level + 1}
        </p>
        <small>
          {DEMO ? "Simulated recognition. " : ""}Levels celebrate your progress;
          they don’t change reward prices.
        </small>
      </div>
      <section className="section">
        <h2>Your profile</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            setSaveError(false);
            setFeedbackFor("name");
            try {
              await api.updateProfile({
                displayName: name ?? data.profile.displayName,
              });
              setMessage("Profile saved.");
              refresh();
            } catch (e) {
              setSaveError(true);
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            What should we call you?
            <input
              maxLength={60}
              value={name ?? data.profile.displayName}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name or nickname"
            />
          </label>
          <p className="support">
            This is your private nickname.{" "}
            <Link to="/profile">Edit your public profile</Link> to change what
            other people see.
          </p>
          <Button secondary type="submit" busy={busy}>
            Save name
          </Button>
          {message && feedbackFor === "name" && (
            <Notice error={saveError}>{message}</Notice>
          )}
        </form>
      </section>
      <section className="section">
        <h2>Account type</h2>
        <AccountTypeChoice
          value={
            accountType === undefined ? data.profile.accountType : accountType
          }
          disabled={busy}
          onChange={setAccountType}
        />
        <Button
          secondary
          busy={busy}
          // Saving an unchanged value is harmless and makes an inferred choice
          // explicit, so only an empty selection disables Save.
          disabled={!accountType}
          onClick={async () => {
            if (!accountType) return;
            setBusy(true);
            setMessage("");
            setSaveError(false);
            setFeedbackFor("type");
            try {
              await api.updateProfile({ accountType });
              setMessage("Account type saved.");
              refresh();
            } catch (cause) {
              setSaveError(true);
              setMessage((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save account type
        </Button>
        <p className="support">
          Brand accounts have a Business workspace. Business approval and video
          permissions are reviewed separately.
        </p>
        {data.profile.accountType === "brand" && (
          <Link className="button secondary" to="/business">
            Open Business workspace
          </Link>
        )}
        {message && feedbackFor === "type" && (
          <Notice error={saveError}>{message}</Notice>
        )}
      </section>
      <section className="section confirmed-preferences">
        <h2>Confirmed preferences</h2>
        {chips.length ? (
          <div className="review-chips">
            {chips.map((chip) => (
              <span className="chip selected" key={chip}>
                {chip}
              </span>
            ))}
          </div>
        ) : (
          <p className="support">
            No preferences confirmed yet. We’ll use the outing you choose.
          </p>
        )}
        {data.profile.preferences.legacyUnconfirmed.length > 0 && (
          <Notice>
            Some older answers may have been defaults. They remain unknown until
            you confirm them; firm boundaries are preserved.
          </Notice>
        )}
      </section>
      <div className="settings-list">
        <Link to="/profile/import">
          <FileText size={20} />
          <span>
            <strong>Summary & confirmed preferences</strong>
            <small>
              {data.profile.summary
                ? "Review, edit, or remove your saved summary"
                : "Optional. Reviewed and shared by you."}
            </small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
        {data.roles.includes("operator") && (
          <Link to="/operator">
            <ShieldCheck size={20} />
            <span>
              <strong>Operator tools</strong>
              <small>Quests, reviews and funded offers</small>
            </span>
            <ArrowUpRight size={18} />
          </Link>
        )}
      </div>
      <section className="section">
        <h2>Private by default.</h2>
        <p className="support">
          Your journal and source clips belong to you. Export or create a public
          link only when you decide. Downloaded copies cannot be recalled.
        </p>
        <p className="support">
          Source clips are retained for 30 days; unresolved reviews close after
          14 days. Up to 50 saved reels stay until you delete them. Deleting
          media does not erase settled reward accounting.
        </p>
        {DEMO && (
          <p className="support">
            Demo profile and progress are stored in this browser. Uploaded clips
            and rendered MP4s are saved by the local renderer on this computer.
          </p>
        )}
      </section>
      {accountControls}
    </>
  );
}
