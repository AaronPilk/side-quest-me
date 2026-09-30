import { useState } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import type { PreferenceKey, Profile } from "../../shared/domain";
import {
  COPY_PROFILE_PROMPT,
  SURVEY_QUESTIONS,
  INTEREST_OPTIONS,
} from "../../shared/profile";
import { api } from "../lib/api";
import { Button, Notice } from "./ui";
import { PreferenceControl } from "./PreferenceControl";

const REVIEW_GROUPS: {
  title: string;
  description: string;
  keys: PreferenceKey[];
}[] = [
  {
    title: "Interests & useful skills",
    description:
      "Choose things you personally enjoy and skills you would like to use. Requests to design a product are not evidence of a personal interest.",
    keys: ["interests", "skills", "categories", "humor"],
  },
  {
    title: "Willingness & participation style",
    description:
      "Choose what you would actually do. Enjoying prank videos does not mean you want to perform a prank.",
    keys: [
      "premises",
      "role",
      "approach",
      "preparation",
      "usualIntensity",
      "sharing",
    ],
  },
  {
    title: "Firm boundaries",
    description:
      "Choose activities to exclude. These remain hard limits when quests are matched.",
    keys: ["exclusions"],
  },
];

export default function SummaryReview({
  profile,
  onSaved,
  onContinue,
}: {
  profile: Profile;
  onSaved: (patch: Partial<Profile>) => void;
  onContinue?: () => void;
}) {
  const [summary, setSummary] = useState(profile.summary);
  const [preferences, setPreferences] = useState(profile.preferences);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const summaryChanged = summary !== profile.summary;
  const preferencesChanged =
    JSON.stringify(preferences) !== JSON.stringify(profile.preferences);

  async function saveSummary(remove = false) {
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
          : "Summary saved. Confirm preferences below to use them in matching.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="summary-review">
      <p className="support">
        Review your text, then choose the preferences that are true for you.
        This is a manual review: nothing is automatically extracted or inferred
        from your summary.
      </p>
      <details className="prompt-details">
        <summary>Get a summary from ChatGPT</summary>
        <Button
          secondary
          type="button"
          onClick={async () => {
            setError("");
            setCopied(false);
            try {
              await navigator.clipboard.writeText(COPY_PROFILE_PROMPT);
              setCopied(true);
            } catch {
              setError(
                "Copy is unavailable here. Select and copy the prompt below.",
              );
            }
          }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? "Prompt copied" : "Copy prompt"}
        </Button>
        <pre>{COPY_PROFILE_PROMPT}</pre>
      </details>
      {profile.preferences.legacyUnconfirmed.length > 0 && (
        <Notice>
          Some older answers may have been defaults. They are unknown until you
          choose them again; existing firm boundaries are preserved.
        </Notice>
      )}
      <div className="summary-review-layout">
        <section className="summary-text-panel">
          <h2>Your imported summary</h2>
          <label>
            Review what you’re sharing
            <textarea
              rows={10}
              maxLength={3000}
              placeholder="Paste your reviewed summary here. Leave out anything you do not want to share."
              value={summary}
              disabled={busy}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <p className="support">
            Only you decide what becomes a confirmed preference. Saving this
            text does not change your answers.
          </p>
          <div className="summary-actions">
            <Button
              secondary
              type="button"
              busy={busy}
              disabled={!summaryChanged}
              onClick={() => saveSummary()}
            >
              Save summary
            </Button>
            <button
              className="text-button danger"
              type="button"
              disabled={busy || !profile.summary}
              onClick={() => saveSummary(true)}
            >
              Remove saved summary
            </button>
          </div>
        </section>
        <section className="summary-preferences-panel">
          <h2>Confirm what fits</h2>
          <p className="support">
            Your saved answers are shown below. Changes remain a draft until you
            save confirmed preferences.
          </p>
          <fieldset className="preference-fieldset" disabled={busy}>
            {REVIEW_GROUPS.map((group) => (
              <details className="preference-review-group" key={group.title}>
                <summary>{group.title}</summary>
                <p className="support">{group.description}</p>
                {group.keys.map((key) => {
                  const question = SURVEY_QUESTIONS.find(
                    (item) => item.key === key,
                  );
                  return (
                    <PreferenceControl
                      key={key}
                      preferenceKey={key}
                      title={
                        key === "interests"
                          ? "Interests to explore"
                          : key === "skills"
                            ? "Skills I am willing to use"
                            : question!.title
                      }
                      type={question?.type ?? "multi"}
                      options={question?.options ?? INTEREST_OPTIONS}
                      otherKey={question?.otherKey}
                      otherLabel={question?.otherLabel}
                      preferences={preferences}
                      onChange={setPreferences}
                      source="summary_review"
                      showTitle
                    />
                  );
                })}
              </details>
            ))}
          </fieldset>
          <div className="summary-unknown-note">
            <h3>Tentative impressions & unknowns</h3>
            <p className="support">
              Guesses, missing information, and statements such as “I don’t
              enjoy performing” never become positive preferences here. Leave a
              control unanswered unless you can confirm it. Today’s budget,
              time, setting, and group always come from your outing.
            </p>
          </div>
          <Button
            type="button"
            busy={busy}
            disabled={!preferencesChanged}
            onClick={async () => {
              setBusy(true);
              setError("");
              setMessage("");
              try {
                await api.updateProfile({ preferences });
                onSaved({ preferences });
                setMessage(
                  "Confirmed preferences saved. They will guide your next quest matches.",
                );
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save confirmed preferences
          </Button>
        </section>
      </div>
      {message && <Notice>{message}</Notice>}
      {error && <Notice error>{error}</Notice>}
      {(summaryChanged || preferencesChanged) && (
        <div className="summary-draft-actions">
          <p className="support">You have unsaved changes.</p>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setSummary(profile.summary);
              setPreferences(profile.preferences);
              setError("");
              setMessage("Unsaved edits discarded.");
            }}
          >
            Discard unsaved edits
          </button>
        </div>
      )}
      {onContinue && (
        <div className="survey-footer">
          <Button
            type="button"
            disabled={busy || summaryChanged || preferencesChanged}
            onClick={onContinue}
          >
            {profile.summary ? "Continue to questions" : "Skip for now"}{" "}
            <ArrowRight size={18} />
          </Button>
          <p className="support">
            The summary is optional. Unanswered preferences stay unknown.
          </p>
        </div>
      )}
    </div>
  );
}
