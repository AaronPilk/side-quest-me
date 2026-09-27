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
import {
  Button,
  PageTitle,
  Notice,
  useResource,
  Loading,
} from "../components/ui";
export default function Profile() {
  const { data, error, refresh } = useResource(api.me);
  const navigate = useNavigate();
  const [name, setName] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!data) return error ? <Notice error>{error}</Notice> : <Loading />;
  const level = levelFromXp(data.wallet.xp);
  return (
    <>
      <PageTitle
        eyebrow="THIS IS YOUR KIND OF ADVENTURE"
        title="A little more you."
      />
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
            try {
              await api.saveProfile({
                ...data.profile,
                displayName: name ?? data.profile.displayName,
              });
              setMessage("Profile saved.");
              refresh();
            } catch (e) {
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
          <Button secondary type="submit" busy={busy}>
            Save name
          </Button>
        </form>
      </section>
      <div className="settings-list">
        <Link to="/onboarding">
          <SlidersHorizontal size={20} />
          <span>
            <strong>Preferences & boundaries</strong>
            <small>Your interests, role, and things to leave out</small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/onboarding?step=import">
          <FileText size={20} />
          <span>
            <strong>Bring your ChatGPT context</strong>
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
      {!DEMO && (
        <Button
          secondary
          onClick={async () => {
            await supabase?.auth.signOut();
            navigate("/");
          }}
        >
          <LogOut size={18} />
          Sign out
        </Button>
      )}
      <button
        className="text-button danger"
        onClick={async () => {
          if (
            !confirm(
              DEMO
                ? "Delete your demo profile, progress and local media? This cannot be undone."
                : "Delete your account and revoke access to your media? Media cleanup is queued. Minimal reward accounting records are retained. This cannot be undone.",
            )
          )
            return;
          setBusy(true);
          try {
            await api.deleteAccount();
            sessionStorage.clear();
            location.assign("/");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {DEMO ? "Delete local demo data" : "Delete my account"}
      </button>
      {message && <Notice>{message}</Notice>}
    </>
  );
}
