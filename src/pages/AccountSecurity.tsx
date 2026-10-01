import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { api } from "../lib/api";
import { DEMO, supabase } from "../lib/auth";
import { Back, Button, Notice, PageTitle } from "../components/ui";
export default function AccountSecurity() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState("account");
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
  return (
    <div className="settings-page">
      <Back to="/settings">Settings</Back>
      <PageTitle title="Account settings">
        Sign-in, privacy, and control of your account.
      </PageTitle>
      <section className="community-panel">
        <h2>Private by default</h2>
        <p>
          Your journal and source clips stay private until you choose to publish
          or share. Downloaded copies cannot be recalled.
        </p>
        <p className="support">
          Source clips are retained for 30 days; unresolved reviews close after
          14 days. Up to 50 saved reels stay until you delete them. Minimal
          settled reward accounting is retained when an account is deleted.
        </p>
      </section>
      <section className="section stack" aria-label="Account controls">
        {accountControls}
      </section>
    </div>
  );
}
