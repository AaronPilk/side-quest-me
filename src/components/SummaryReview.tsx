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
  async function save(remove = false) {
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
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="summary-review summary-guided">
      <ChatGPTPrompt />
      <details className="summary-paste-panel" open={!!summary || undefined}>
        <summary>
          {profile.summary
            ? "Review your saved summary"
            : "I have a summary to paste"}
        </summary>
        <label>
          Review what you’re sharing
          <textarea
            rows={5}
            maxLength={3000}
            value={summary}
            disabled={busy}
            placeholder="Paste your summary. Leave out anything you don’t want to share."
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <p className="support">
          This is a manual review: text alone never becomes a preference. Only
          the answers you confirm guide your quests.
        </p>
        <div className="summary-actions">
          <Button
            secondary
            busy={busy}
            disabled={!changed}
            onClick={() => void save()}
          >
            Save summary
          </Button>
          <button
            className="text-button danger"
            disabled={busy || !profile.summary}
            onClick={() => void save(true)}
          >
            Remove saved summary
          </button>
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
      </details>
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {onContinue && (
        <div className="survey-footer">
          <Button disabled={busy || changed} onClick={onContinue}>
            Continue to preferences <ArrowRight size={18} />
          </Button>
          <p className="support">
            No ChatGPT account? Answer the questions yourself. The summary is
            optional.
          </p>
          {changed && (
            <p className="support">
              Save or discard your summary edits before continuing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
