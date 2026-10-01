import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Profile } from "../../shared/domain";
import { api } from "../lib/api";
import { Button, Notice } from "./ui";
import { ChatGPTPrompt } from "./ChatGPTPrompt";

export default function SummaryReview({
  profile,
  onSaved,
  onContinue,
  draft,
  onDraftChange,
  onPendingChange,
}: {
  profile: Profile;
  onSaved: (patch: Partial<Profile>) => void;
  onContinue?: () => void;
  draft?: string;
  onDraftChange?: (value: string) => void;
  onPendingChange?: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const [localSummary, setLocalSummary] = useState(profile.summary);
  const summary = draft ?? localSummary;
  const setSummary = onDraftChange ?? setLocalSummary;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const changed = summary !== profile.summary;
  useEffect(() => {
    onPendingChange?.({ dirty: changed, busy });
  }, [changed, busy, onPendingChange]);
  async function save(remove = false): Promise<boolean> {
    setBusy(true);
    setError("");
    setMessage("");
    const next = remove ? "" : summary.trim();
    try {
      await api.updateProfile({ summary: next });
      setSummary(next);
      onSaved({ summary: next });
      setMessage(
        remove
          ? "Summary removed. Your confirmed answers are unchanged."
          : "Summary saved. Confirm what fits in the questions next.",
      );
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="summary-review summary-guided">
      <ChatGPTPrompt />
      <div className="summary-paste-panel">
        <label>
          Paste your ChatGPT summary
          <textarea
            rows={4}
            maxLength={3000}
            value={summary}
            disabled={busy}
            placeholder="Paste your summary. Leave out anything you don’t want to share."
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <p className="support">
          Optional. Only the answers you confirm next guide your quests.
        </p>
        <div className="summary-actions">
          {!onContinue && (
            <Button
              secondary
              busy={busy}
              disabled={!changed}
              onClick={() => void save()}
            >
              Save summary
            </Button>
          )}
          {profile.summary && (
            <button
              className="text-button danger"
              disabled={busy || !profile.summary}
              onClick={() => void save(true)}
            >
              Remove saved summary
            </button>
          )}
        </div>
        {changed && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setSummary(profile.summary);
              setError("");
              setMessage("Unsaved edits discarded.");
            }}
          >
            Discard unsaved edits
          </button>
        )}
      </div>
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {onContinue && (
        <div className="survey-footer">
          <Button
            busy={busy}
            onClick={async () => {
              if (!changed || (await save())) onContinue();
            }}
          >
            Continue to preferences <ArrowRight size={18} />
          </Button>
          <p className="support">You can continue without a summary.</p>
        </div>
      )}
    </div>
  );
}
