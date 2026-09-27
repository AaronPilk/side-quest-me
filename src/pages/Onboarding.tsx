import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Copy, Check, Sparkles } from "lucide-react";
import {
  DEFAULT_PREFERENCES,
  type Profile,
  type Preferences,
} from "../../shared/domain";
import {
  SURVEY_QUESTIONS,
  COPY_PROFILE_PROMPT,
  preferenceChips,
} from "../../shared/profile";
import { api } from "../lib/api";
import { Button, Notice, PageTitle, Loading } from "../components/ui";
export default function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [profile, setProfile] = useState<Profile>();
  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api
      .me()
      .then((d) => {
        try {
          const draft = JSON.parse(
            sessionStorage.getItem("sq-profile-draft") || "null",
          );
          setProfile(draft?.profile || d.profile);
          setStep(
            params.get("step") === "import"
              ? -1
              : (draft?.step ?? (d.profile.onboardingCompleted ? 0 : -1)),
          );
        } catch {
          setProfile(d.profile);
        }
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (profile)
      sessionStorage.setItem(
        "sq-profile-draft",
        JSON.stringify({ profile, step }),
      );
  }, [profile, step]);
  function setPreference(key: keyof Preferences, value: unknown) {
    setProfile((p) =>
      p ? { ...p, preferences: { ...p.preferences, [key]: value } } : p,
    );
  }
  async function save(finish: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.saveProfile({
        ...profile!,
        onboardingCompleted: finish || profile!.onboardingCompleted,
      });
      if (finish) {
        sessionStorage.removeItem("sq-profile-draft");
        navigate("/");
      } else setStep(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile) return error ? <Notice error>{error}</Notice> : <Loading />;
  const q = SURVEY_QUESTIONS[step];
  return (
    <div className="onboarding">
      <div className="onboard-top">
        <button
          className="back"
          onClick={() => (step <= -1 ? navigate("/") : setStep(step - 1))}
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <span className="support">
          {step >= 0 && step < 10
            ? `${step + 1} of 10`
            : step === 10
              ? "Your profile"
              : "Optional context"}
        </span>
      </div>
      {step === -1 ? (
        <>
          <div className="onboard-icon">
            <Sparkles size={30} />
          </div>
          <PageTitle title="Bring your ChatGPT context">
            Get a short summary from a conversation that knows your preferences.
            Review it before sharing.
          </PageTitle>
          <Button
            secondary
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(COPY_PROFILE_PROMPT);
                setCopied(true);
              } catch {
                setError(
                  "Copy is unavailable here. Expand the prompt below and select its text.",
                );
              }
            }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}{" "}
            {copied ? "Prompt copied" : "Copy prompt"}
          </Button>
          <details className="prompt-details">
            <summary>Read the copyable prompt</summary>
            <pre>{COPY_PROFILE_PROMPT}</pre>
          </details>
          <label>
            Review what you’re sharing
            <textarea
              rows={8}
              maxLength={3000}
              placeholder="Paste your reviewed summary here. Remove anything you don’t want to share."
              value={profile.summary}
              onChange={(e) =>
                setProfile({ ...profile, summary: e.target.value })
              }
            />
          </label>
          <p className="support">
            You control what gets shared. There is no automatic ChatGPT
            connection. Your explicit answers guide recommendations; this text
            is not automatically analyzed.
          </p>
          {profile.summary ? (
            <>
              <Button busy={busy} onClick={() => save(false)}>
                Save summary <ArrowRight size={18} />
              </Button>
              <button
                className="text-button"
                onClick={() => setProfile({ ...profile, summary: "" })}
              >
                Remove summary
              </button>
            </>
          ) : (
            <Button onClick={() => setStep(0)}>
              Skip for now <ArrowRight size={18} />
            </Button>
          )}
        </>
      ) : step < 10 ? (
        <>
          <div
            className="survey-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={step + 1}
            aria-label={`${step + 1} of 10 questions`}
          >
            {SURVEY_QUESTIONS.map((_, i) => (
              <i key={i} className={i <= step ? "filled" : ""} />
            ))}
          </div>
          <PageTitle title={q.title}>
            {q.description ||
              (q.type === "multi"
                ? "Choose what sounds like you. You can change this later."
                : "Go with what feels right. Nothing is set in stone.")}
          </PageTitle>
          <div className="survey-options" role="group" aria-label={q.title}>
            {q.options.map((o) => {
              const value = profile.preferences[q.key];
              const selected = Array.isArray(value)
                ? value.includes(o.value as never)
                : value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  className={`survey-option ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() =>
                    setPreference(
                      q.key,
                      q.type === "multi"
                        ? selected
                          ? (value as string[]).filter((v) => v !== o.value)
                          : [...(value as string[]), o.value]
                        : o.value,
                    )
                  }
                >
                  <span>{o.label}</span>
                  <span
                    className={`selection-mark ${q.type === "single" ? "radio" : ""}`}
                  >
                    {selected && <Check size={15} />}
                  </span>
                </button>
              );
            })}
          </div>
          {q.key === "categories" && (
            <button
              className="text-button"
              onClick={() =>
                setPreference(
                  q.key,
                  q.options.map((o) => o.value),
                )
              }
            >
              Select all
            </button>
          )}
          {q.key === "exclusions" && (
            <button
              className="text-button"
              onClick={() => {
                setPreference("exclusions", []);
                setPreference("otherExclusion", "");
              }}
            >
              No preferences yet
            </button>
          )}
          {q.otherKey && (
            <label>
              {q.otherLabel}
              <input
                maxLength={q.otherKey === "otherSkill" ? 120 : 240}
                value={profile.preferences[q.otherKey] as string}
                onChange={(e) => setPreference(q.otherKey!, e.target.value)}
              />
            </label>
          )}
          <div className="survey-footer">
            <Button
              onClick={() => {
                setStep(step + 1);
                window.scrollTo(0, 0);
              }}
            >
              Continue <ArrowRight size={18} />
            </Button>
            <button
              className="text-button"
              onClick={() => {
                setPreference(q.key, DEFAULT_PREFERENCES[q.key]);
                setStep(step + 1);
              }}
            >
              Skip this question
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="onboard-icon">
            <Check size={30} />
          </div>
          <PageTitle title="Your kind of side quest.">
            A starting point, based on what you told us. Today’s plans are
            always yours to choose.
          </PageTitle>
          <div className="review-chips">
            {preferenceChips(profile.preferences).map((c) => (
              <button
                className="chip selected"
                key={c}
                onClick={() => setStep(0)}
              >
                {c}
              </button>
            ))}
          </div>
          {!preferenceChips(profile.preferences).length && (
            <p>
              We’ll start with your outing and learn from the preferences you
              choose.
            </p>
          )}
          <p className="support">
            Your budget, group, location and available time come next. Nothing
            here authorizes a public post.
          </p>
          <Button onClick={() => save(true)} busy={busy}>
            Looks right <ArrowRight size={18} />
          </Button>
          <button className="text-button" onClick={() => setStep(0)}>
            Edit answers
          </button>
        </>
      )}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
