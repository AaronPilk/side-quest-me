import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, Sparkles } from "lucide-react";
import { normalizePreferences, type Profile } from "../../shared/domain";
import {
  SURVEY_QUESTIONS,
  preferenceChips,
  resetPreferenceAnswer,
  INTEREST_OPTIONS,
} from "../../shared/profile";
import { api } from "../lib/api";
import { Button, Notice, PageTitle, Loading } from "../components/ui";
import SummaryReview from "../components/SummaryReview";
import { PreferenceControl } from "../components/PreferenceControl";
import { consumeReturnTo } from "../lib/internal-return";

export default function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const importStep = params.get("step") === "import";
  const [profile, setProfile] = useState<Profile>();
  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .me()
      .then((data) => {
        if (!active) return;
        if (importStep && data.profile.onboardingCompleted) {
          navigate("/profile/import", { replace: true });
          return;
        }
        let draft: { profile?: Profile; step?: number } | null = null;
        try {
          draft = JSON.parse(
            sessionStorage.getItem("sq-profile-draft") || "null",
          );
        } catch {
          /* Invalid drafts can be replaced by the saved profile. */
        }
        const selected = draft?.profile || data.profile;
        setProfile({
          ...selected,
          preferences: normalizePreferences(selected.preferences),
        });
        setStep(
          importStep
            ? -1
            : Math.max(
                -1,
                Math.min(
                  10,
                  draft?.step ?? (data.profile.onboardingCompleted ? 0 : -1),
                ),
              ),
        );
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [importStep, navigate]);
  useEffect(() => {
    if (profile)
      sessionStorage.setItem(
        "sq-profile-draft",
        JSON.stringify({ profile, step }),
      );
  }, [profile, step]);

  function nextStep() {
    setStep((current) => current + 1);
    window.scrollTo(0, 0);
  }
  function cancel() {
    sessionStorage.removeItem("sq-profile-draft");
    navigate(
      consumeReturnTo(profile?.onboardingCompleted ? "/account" : "/create"),
    );
  }
  async function finish() {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      await api.updateProfile({
        preferences: profile.preferences,
        onboardingCompleted: true,
      });
      sessionStorage.removeItem("sq-profile-draft");
      navigate(consumeReturnTo());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile) return error ? <Notice error>{error}</Notice> : <Loading />;
  const q = SURVEY_QUESTIONS[step];
  const chips = preferenceChips(profile.preferences);
  return (
    <div className={`onboarding ${step === -1 ? "onboarding-import" : ""}`}>
      <div className="onboard-top">
        <button
          className="back"
          onClick={() => (step <= -1 ? cancel() : setStep(step - 1))}
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
        {step >= 0 && (
          <button
            className="text-button"
            type="button"
            onClick={cancel}
            disabled={busy}
          >
            Cancel
          </button>
        )}
      </div>
      {step === -1 ? (
        <>
          <div className="onboard-icon">
            <Sparkles size={30} />
          </div>
          <PageTitle title="Bring your ChatGPT context">
            Turn a reviewed summary into preferences you choose.
          </PageTitle>
          <SummaryReview
            profile={profile}
            onSaved={(patch) =>
              setProfile((current) =>
                current ? { ...current, ...patch } : current,
              )
            }
            onContinue={() => setStep(0)}
          />
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
            {SURVEY_QUESTIONS.map((_, index) => (
              <i key={index} className={index <= step ? "filled" : ""} />
            ))}
          </div>
          <PageTitle title={q.title}>
            {q.description ||
              "Choose only what you can confirm. Leave it unanswered if you’re unsure."}
          </PageTitle>
          {profile.preferences.legacyUnconfirmed.includes(q.key) && (
            <Notice>
              Your old profile may have filled this answer by default. Choose
              again to confirm it, or leave it unknown.
            </Notice>
          )}
          {q.key === "skills" && (
            <PreferenceControl
              preferenceKey="interests"
              title="Interests to explore"
              type="multi"
              options={INTEREST_OPTIONS}
              preferences={profile.preferences}
              onChange={(preferences) =>
                setProfile({ ...profile, preferences })
              }
              source="survey"
              showTitle
              showReset={false}
            />
          )}
          <PreferenceControl
            preferenceKey={q.key}
            title={q.key === "skills" ? "Skills I am willing to use" : q.title}
            type={q.type}
            options={q.options}
            otherKey={q.otherKey}
            otherLabel={q.otherLabel}
            preferences={profile.preferences}
            onChange={(preferences) => setProfile({ ...profile, preferences })}
            source="survey"
            showTitle={q.key === "skills"}
            showReset={false}
          />
          <button
            className="text-button"
            type="button"
            onClick={() => {
              let preferences = resetPreferenceAnswer(
                profile.preferences,
                q.key,
              );
              if (q.otherKey)
                preferences = resetPreferenceAnswer(preferences, q.otherKey);
              if (q.key === "skills")
                preferences = resetPreferenceAnswer(preferences, "interests");
              setProfile({ ...profile, preferences });
            }}
          >
            Reset answer to unknown
          </button>
          <div className="survey-footer">
            <Button onClick={nextStep}>
              Continue <ArrowRight size={18} />
            </Button>
            <button className="text-button" onClick={nextStep}>
              Skip this question
            </button>
            <p className="support">
              Moving on keeps any answer you chose. Unanswered questions stay
              unknown.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="onboard-icon">
            <Check size={30} />
          </div>
          <PageTitle title="Your kind of side quest.">
            Based only on preferences you confirmed. Today’s plans are always
            yours to choose.
          </PageTitle>
          {profile.preferences.legacyUnconfirmed.length > 0 && (
            <Notice>
              Unconfirmed answers from your older profile remain unknown. You
              can confirm them whenever you like.
            </Notice>
          )}
          <div className="review-chips">
            {chips.map((chip) => (
              <button
                className="chip selected"
                key={chip}
                onClick={() => setStep(0)}
              >
                {chip}
              </button>
            ))}
          </div>
          {!chips.length && (
            <p>
              We’ll start with your outing. You can add preferences whenever
              you’re ready.
            </p>
          )}
          <p className="support">
            Your budget, group, location and available time come next. Nothing
            here authorizes a public post.
          </p>
          <Button onClick={finish} busy={busy}>
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
