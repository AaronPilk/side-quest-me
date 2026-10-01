import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, Sparkles } from "lucide-react";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  profileSchema,
  type Profile,
} from "../../shared/domain";
import {
  SURVEY_QUESTIONS,
  preferenceChips,
  resetPreferenceAnswer,
  INTEREST_OPTIONS,
  type SurveyQuestion,
} from "../../shared/profile";
import { api } from "../lib/api";
import { Button, Notice, PageTitle, Loading } from "../components/ui";
import SummaryReview from "../components/SummaryReview";
import { AccountTypeChoice } from "../components/AccountTypeChoice";
import { PreferenceControl } from "../components/PreferenceControl";
import {
  consumeReturnTo,
  rememberReturnTo,
  validateReturnTo,
} from "../lib/internal-return";
import "../consumer-audit.css";
import "./preferences-wizard.css";
import {
  currentProfileDraftOwner,
  PROFILE_DRAFT_KEYS,
  readProfileDraft,
  type ProfileDraft,
} from "../lib/profile-drafts";

// Keep older ten-question drafts intact. The direct editor separates interests
// from skills so each screen asks one clear question.
const PREFERENCE_QUESTIONS: SurveyQuestion[] = SURVEY_QUESTIONS.flatMap(
  (question) =>
    question.key === "skills"
      ? [
          {
            id: "interests",
            key: "interests",
            title: "What would you like to explore?",
            description:
              "Choose what you enjoy. You do not need to be good at it.",
            type: "multi",
            optional: true,
            options: INTEREST_OPTIONS,
          } as SurveyQuestion,
          {
            ...question,
            title: "Which skills would you enjoy using?",
            description: "Choose skills you are happy to bring to a quest.",
          },
        ]
      : [question],
);

export default function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const importStep = params.get("step") === "import";
  const preferencesOnly = params.get("preferences") === "1";
  const requestedReturn = params.get("returnTo");
  const questions = preferencesOnly ? PREFERENCE_QUESTIONS : SURVEY_QUESTIONS;
  const total = questions.length;
  const draftKey = preferencesOnly
    ? "sq-preference-wizard-draft"
    : "sq-profile-draft";
  const [profile, setProfile] = useState<Profile>();
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const [step, setStep] = useState(-2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [reviewingAnswer, setReviewingAnswer] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const questionPanel = useRef<HTMLDivElement>(null);
  // The last preferences the server confirmed, so a skip can restore them
  // without writing. The draft (profile state) may run ahead of this.
  const savedPreferences = useRef<Profile["preferences"] | undefined>(
    undefined,
  );
  // A late save from a previous account/mount must not navigate or clear the
  // draft of whatever is on screen now.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const target = validateReturnTo(requestedReturn);
    if (preferencesOnly && target) rememberReturnTo(target);
  }, [preferencesOnly, requestedReturn]);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([api.me(), currentProfileDraftOwner()])
      .then(([data, ownerId]) => {
        if (!active) return;
        if (importStep && data.profile.onboardingCompleted) {
          navigate("/profile/import", { replace: true });
          return;
        }
        let draft: ProfileDraft | null = null;
        setDraftOwner(ownerId);
        setDraftNotice("");
        try {
          const result = readProfileDraft(draftKey, ownerId);
          draft = result.draft;
          if (result.discarded)
            setDraftNotice(
              "An older draft could not be matched to this account. We loaded your saved preferences instead.",
            );
        } catch {
          /* Invalid drafts can be replaced by the saved profile. */
        }
        for (const key of PROFILE_DRAFT_KEYS) {
          if (key === draftKey) continue;
          try {
            readProfileDraft(key, ownerId);
          } catch {
            /* A malformed parallel draft does not block the current form. */
          }
        }
        const draftProfile =
          draft?.profile &&
          profileSchema.safeParse({
            ...draft.profile,
            accountType:
              draft.profile.accountType === undefined
                ? data.profile.accountType
                : draft.profile.accountType,
            preferences: normalizePreferences(draft.profile.preferences),
          });
        const selected = draftProfile?.success
          ? draftProfile.data
          : data.profile;
        savedPreferences.current = normalizePreferences(
          data.profile.preferences,
        );
        setProfile({
          ...selected,
          preferences: normalizePreferences(selected.preferences),
        });
        const savedStep =
          draftProfile?.success && Number.isInteger(draft?.step)
            ? Math.max(preferencesOnly ? 0 : -2, Math.min(total, draft!.step!))
            : null;
        const firstUnknown = questions.findIndex(
          (question) =>
            selected.preferences[question.key] === null ||
            selected.preferences[question.key] === "",
        );
        setStep(
          preferencesOnly
            ? (savedStep ?? (firstUnknown < 0 ? 0 : firstUnknown))
            : importStep
              ? selected.accountType
                ? -1
                : -2
              : (savedStep ??
                (data.profile.onboardingCompleted
                  ? 0
                  : selected.accountType
                    ? -1
                    : -2)),
        );
        setReviewingAnswer(
          Boolean(
            draftProfile?.success && draft?.reviewingAnswer && !importStep,
          ),
        );
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [
    draftKey,
    importStep,
    navigate,
    preferencesOnly,
    questions,
    retry,
    total,
  ]);
  useEffect(() => {
    if (!profile || !draftOwner) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ ownerId: draftOwner, profile, step, reviewingAnswer }),
      );
    } catch {
      setError(
        "Draft storage is unavailable. Keep this page open until you save your profile.",
      );
    }
  }, [draftKey, draftOwner, profile, step, reviewingAnswer]);
  useEffect(() => {
    if (step < 0 || step >= total) return;
    questionPanel.current?.focus({ preventScroll: true });
  }, [step, total]);

  async function nextStep(preferences = profile?.preferences) {
    if (busy || !profile || !preferences) return;
    if (preferencesOnly) {
      setBusy(true);
      setError("");
      try {
        await api.updateProfile({ preferences });
      } catch (cause) {
        if (mounted.current) {
          setError((cause as Error).message);
          setBusy(false);
        }
        return;
      }
      if (!mounted.current) return;
      savedPreferences.current = preferences;
      setBusy(false);
    }
    setDirection("forward");
    setStep((current) => (reviewingAnswer ? total : current + 1));
    setReviewingAnswer(false);
    window.scrollTo(0, 0);
  }
  /** Direct editor only: an explicit reset is saved at once, like a chosen
   * answer, so a following skip cannot resurrect the old value. */
  async function saveNow(preferences: Profile["preferences"]) {
    if (!preferencesOnly || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.updateProfile({ preferences });
      if (!mounted.current) return;
      savedPreferences.current = preferences;
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  /** Direct editor only: a skip restores whatever the server last confirmed for
   * this question and advances without writing. Unknown stays unknown and a
   * previously confirmed answer survives an accidental tap. */
  function skipQuestion() {
    if (busy || !profile) return;
    if (!preferencesOnly) {
      void nextStep();
      return;
    }
    const saved = savedPreferences.current ?? profile.preferences;
    const preferences = {
      ...profile.preferences,
      [q.key]: saved[q.key],
      ...(q.otherKey ? { [q.otherKey]: saved[q.otherKey] } : {}),
    };
    setProfile({ ...profile, preferences });
    setDirection("forward");
    setStep((current) => current + 1);
    window.scrollTo(0, 0);
  }
  function changeAnswer(preferences: Profile["preferences"]) {
    if (!profile || busy) return;
    setProfile({ ...profile, preferences });
    if (preferencesOnly && q.type === "single" && preferences[q.key] !== null)
      void nextStep(preferences);
  }
  async function saveAndLeave() {
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.updateProfile({ preferences: profile.preferences });
      if (!mounted.current) return;
      savedPreferences.current = profile.preferences;
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Saved remotely. */
      }
      navigate(consumeReturnTo("/profile"));
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function editAnswer(index: number) {
    setDirection("back");
    setReviewingAnswer(true);
    setStep(index);
    window.scrollTo(0, 0);
  }
  function cancel() {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* The unsaved in-memory draft is discarded on navigation. */
    }
    navigate(
      consumeReturnTo(
        preferencesOnly
          ? "/profile"
          : profile?.onboardingCompleted
            ? "/account"
            : "/create",
      ),
    );
  }
  async function saveAccountChoice() {
    if (!profile?.accountType) return;
    setBusy(true);
    setError("");
    try {
      const openBusiness = profile.accountType === "brand" && !reviewingAnswer;
      await api.updateProfile({
        accountType: profile.accountType,
        ...(openBusiness ? { onboardingCompleted: true } : {}),
      });
      if (!mounted.current) return;
      if (openBusiness) {
        sessionStorage.removeItem(draftKey);
        navigate("/business");
      } else {
        setStep(reviewingAnswer ? total : -1);
        setReviewingAnswer(false);
        window.scrollTo(0, 0);
      }
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function finish() {
    if (!profile) return;
    if (!profile.accountType && !preferencesOnly) {
      setReviewingAnswer(true);
      setStep(-2);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.updateProfile(
        preferencesOnly
          ? { preferences: profile.preferences }
          : {
              preferences: profile.preferences,
              ...(profile.accountType
                ? { accountType: profile.accountType }
                : {}),
              onboardingCompleted: true,
            },
      );
      if (!mounted.current) return;
      savedPreferences.current = profile.preferences;
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* The durable profile was saved successfully. */
      }
      navigate(consumeReturnTo(preferencesOnly ? "/profile" : "/create"));
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  if (!profile)
    return error ? (
      <>
        <Notice error>{error}</Notice>
        <Button secondary onClick={() => setRetry((value) => value + 1)}>
          Retry profile
        </Button>
      </>
    ) : (
      <Loading />
    );
  const q = questions[step];
  const chips = preferenceChips(profile.preferences);
  const answers = questions.map((question, index) => {
    const keys = [
      question.key,
      ...(question.otherKey ? [question.otherKey] : []),
      ...(!preferencesOnly && question.key === "skills"
        ? ["interests" as const]
        : []),
    ];
    const answerPreferences = {
      ...DEFAULT_PREFERENCES,
      ...Object.fromEntries(keys.map((key) => [key, profile.preferences[key]])),
    };
    return {
      index,
      title: question.title,
      chips: preferenceChips(answerPreferences),
      answered: keys.some((key) => {
        const answer = profile.preferences[key];
        return answer !== null && answer !== "";
      }),
    };
  });
  return (
    <div
      className={`onboarding preferences-journey ${preferencesOnly ? "preferences-direct" : ""} ${step === -1 ? "onboarding-import" : ""}`}
    >
      <div className="onboard-top">
        <button
          className="back"
          disabled={busy}
          onClick={() => {
            if (reviewingAnswer) {
              setDirection("back");
              setStep(total);
              setReviewingAnswer(false);
            } else if (step <= -1) cancel();
            else {
              setDirection("back");
              if (preferencesOnly && step === 0) cancel();
              else setStep(step - 1);
            }
          }}
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <span className="support">
          {step >= 0 && step < total
            ? `${step + 1} of ${total}`
            : step === total
              ? "Your profile"
              : step === -2
                ? "Your account"
                : "Optional context"}
        </span>
        {step >= 0 && (
          <button
            className="text-button"
            type="button"
            onClick={preferencesOnly ? () => void saveAndLeave() : cancel}
            disabled={busy}
          >
            {preferencesOnly ? "Save & leave" : "Cancel"}
          </button>
        )}
      </div>
      {step === -2 ? (
        <>
          <PageTitle title="Make Sidequest yours.">
            Are you here for your own adventures, or on behalf of a brand?
          </PageTitle>
          <AccountTypeChoice
            value={profile.accountType}
            disabled={busy}
            onChange={(accountType) => setProfile({ ...profile, accountType })}
          />
          <Button
            busy={busy}
            disabled={!profile.accountType}
            onClick={saveAccountChoice}
          >
            {profile.accountType === "brand" && !reviewingAnswer
              ? "Continue to brand setup"
              : reviewingAnswer
                ? "Return to review"
                : "Continue"}{" "}
            <ArrowRight size={18} />
          </Button>
          <p className="support">
            You can change your account type in Account settings.
          </p>
        </>
      ) : step === -1 ? (
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
      ) : step < total ? (
        <>
          <div
            className="survey-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={step + 1}
            aria-label={`${step + 1} of ${total} questions`}
          >
            {questions.map((_, index) => (
              <i key={index} className={index <= step ? "filled" : ""} />
            ))}
          </div>
          <div
            key={step}
            ref={questionPanel}
            tabIndex={-1}
            className={`preference-question-panel slide-${direction}`}
            aria-label={q.title}
          >
            <PageTitle
              eyebrow={
                preferencesOnly ? "MAKE EVERY QUEST MORE YOU" : undefined
              }
              title={q.title}
            >
              {q.description ||
                "Choose only what you can confirm. Leave it unanswered if you’re unsure."}
            </PageTitle>
            {profile.preferences.legacyUnconfirmed.includes(q.key) && (
              <Notice>
                Your old profile may have filled this answer by default. Choose
                again to confirm it, or leave it unknown.
              </Notice>
            )}
            {!preferencesOnly && q.key === "skills" && (
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
              title={
                q.key === "skills" ? "Skills I am willing to use" : q.title
              }
              type={q.type}
              options={q.options}
              otherKey={q.otherKey}
              otherLabel={q.otherLabel}
              preferences={profile.preferences}
              onChange={changeAnswer}
              disabled={busy}
              compact
              collapseOther={preferencesOnly}
              allowEmptyAnswer={preferencesOnly}
              source="survey"
              showTitle={!preferencesOnly && q.key === "skills"}
              showReset={false}
            />
            {(!preferencesOnly ||
              profile.preferences[q.key] !== null ||
              (q.otherKey && profile.preferences[q.otherKey])) && (
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  let preferences = resetPreferenceAnswer(
                    profile.preferences,
                    q.key,
                  );
                  if (q.otherKey)
                    preferences = resetPreferenceAnswer(
                      preferences,
                      q.otherKey,
                    );
                  if (!preferencesOnly && q.key === "skills")
                    preferences = resetPreferenceAnswer(
                      preferences,
                      "interests",
                    );
                  setProfile({ ...profile, preferences });
                  void saveNow(preferences);
                }}
              >
                Reset answer to unknown
              </button>
            )}
          </div>
          <div className="survey-footer">
            <Button busy={busy} onClick={() => void nextStep()}>
              {reviewingAnswer ? "Return to review" : "Continue"}{" "}
              <ArrowRight size={18} />
            </Button>
            {!reviewingAnswer && (
              <button
                className="text-button"
                disabled={busy}
                onClick={skipQuestion}
              >
                Skip this question
              </button>
            )}
            <p className="support">
              {preferencesOnly
                ? "Answers save as you go. Skips stay unknown."
                : "Moving on keeps any answer you chose. Unanswered questions stay unknown."}
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
          {!preferencesOnly && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setStep(-2);
                setReviewingAnswer(true);
              }}
            >
              {profile.accountType === "brand"
                ? "Brand account"
                : profile.accountType === "personal"
                  ? "Personal account"
                  : "Choose account type"}{" "}
              · Edit
            </button>
          )}
          <div className="review-chips">
            {answers.flatMap((answer) =>
              answer.chips.map((chip) => (
                <button
                  className="chip selected"
                  key={chip}
                  onClick={() => editAnswer(answer.index)}
                  disabled={busy}
                >
                  {chip}
                </button>
              )),
            )}
          </div>
          <details className="profile-answer-review">
            <summary>Edit any answer</summary>
            {answers.map((answer) => (
              <button
                key={answer.index}
                type="button"
                disabled={busy}
                onClick={() => editAnswer(answer.index)}
              >
                <span>
                  {answer.title}
                  <small>
                    {answer.answered
                      ? "Confirmed · tap to edit"
                      : "Not answered · still unknown"}
                  </small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          </details>
          {!chips.length && (
            <p>
              We’ll start with your outing. You can add preferences whenever
              you’re ready.
            </p>
          )}
          <p className="support">
            Your budget, group, location and available time always come from
            your current outing. Nothing here authorizes a public post.
          </p>
          <Button onClick={finish} busy={busy}>
            Looks right <ArrowRight size={18} />
          </Button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setStep(0)}
          >
            Edit answers
          </button>
        </>
      )}
      {draftNotice && <Notice>{draftNotice}</Notice>}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
