import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, FileText } from "lucide-react";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
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
  resolveProfileDraft,
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
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // A shortcut selects the entry screen once; refreshing later resumes the draft.
  const [entryStep] = useState(() => params.get("step"));
  const importStep = ["import", "summary"].includes(entryStep ?? "");
  const legacyDirect = params.get("preferences") === "1";
  const fullOnboarding = location.pathname === "/onboarding" && !legacyDirect;
  const preferencesOnly = true; // One save-as-you-go journey for onboarding and editing.
  const requestedReturn = params.get("returnTo");
  const questions = PREFERENCE_QUESTIONS;
  const total = questions.length;
  const draftKey = fullOnboarding
    ? "sq-profile-draft"
    : "sq-preference-wizard-draft";
  const [profile, setProfile] = useState<Profile>();
  const [baselineProfile, setBaselineProfile] = useState<Profile>();
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const [step, setStep] = useState(-2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [reviewingAnswer, setReviewingAnswer] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [summaryReturn, setSummaryReturn] = useState<number | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryPending, setSummaryPending] = useState({
    dirty: false,
    busy: false,
  });
  const navigationLocked =
    busy || (step === -1 && (summaryPending.dirty || summaryPending.busy));
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
  const leaving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const target = validateReturnTo(requestedReturn);
    try {
      if (target) rememberReturnTo(target);
    } catch {
      /* The validated query also carries the return path. */
    }
  }, [preferencesOnly, requestedReturn]);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([api.me(), currentProfileDraftOwner()])
      .then(([data, ownerId]) => {
        if (!active) return;
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
            const parallel = readProfileDraft(key, ownerId);
            if (resolveProfileDraft(data.profile, parallel.draft).discarded)
              sessionStorage.removeItem(key);
          } catch {
            /* A malformed parallel draft does not block the current form. */
          }
        }
        const resolved = resolveProfileDraft(data.profile, draft);
        if (resolved.discarded) {
          draft = null;
          setDraftNotice(
            "Your saved profile changed since this draft. We loaded your latest answers so older edits can’t replace them.",
          );
        }
        const selected = resolved.profile;
        setBaselineProfile(data.profile);
        setSummaryDraft(
          typeof draft?.summaryDraft === "string"
            ? draft.summaryDraft.slice(0, 3000)
            : selected.summary,
        );
        setSummaryReturn(
          typeof draft?.summaryReturn === "number" &&
            Number.isInteger(draft.summaryReturn) &&
            draft.summaryReturn >= 0 &&
            draft.summaryReturn < total
            ? draft.summaryReturn
            : null,
        );
        savedPreferences.current = normalizePreferences(
          data.profile.preferences,
        );
        setProfile({
          ...selected,
          preferences: normalizePreferences(selected.preferences),
        });
        let savedStep =
          draft?.profile && Number.isInteger(draft?.step)
            ? Math.max(-3, Math.min(total, draft!.step!))
            : null;
        // Older full-onboarding drafts combined interests and skills on page 8.
        if (
          draftKey === "sq-profile-draft" &&
          draft?.version !== 2 &&
          savedStep !== null &&
          savedStep >= 8
        )
          savedStep++;
        const firstUnknown = questions.findIndex(
          (question) =>
            selected.preferences[question.key] === null ||
            selected.preferences[question.key] === "",
        );
        setStep(
          importStep
            ? -1
            : entryStep === "account"
              ? -2
              : (savedStep ??
                (fullOnboarding
                  ? -2
                  : legacyDirect
                    ? Math.max(0, firstUnknown)
                    : -3)),
        );
        setReviewingAnswer(
          Boolean(draft?.profile && draft?.reviewingAnswer && !importStep),
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
    fullOnboarding,
    legacyDirect,
    entryStep,
    retry,
    total,
  ]);
  useEffect(() => {
    if (!profile || !draftOwner || leaving.current) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          version: 2,
          baselineProfile,
          ownerId: draftOwner,
          profile,
          step,
          reviewingAnswer,
          summaryDraft,
          summaryReturn,
        }),
      );
    } catch {
      setError(
        "Draft storage is unavailable. Keep this page open until you save your profile.",
      );
    }
  }, [
    draftKey,
    draftOwner,
    profile,
    step,
    reviewingAnswer,
    summaryDraft,
    summaryReturn,
    baselineProfile,
  ]);
  useEffect(() => {
    if (!profile || !params.has("step")) return;
    const next = new URLSearchParams(params);
    next.delete("step");
    setParams(next, { replace: true });
  }, [params, profile, setParams]);
  useEffect(() => {
    if (step < 0 || step >= total) return;
    questionPanel.current?.focus({ preventScroll: true });
  }, [step, total]);

  function recordSaved(patch: Partial<Profile>) {
    setBaselineProfile((current) =>
      current ? { ...current, ...patch } : current,
    );
    if (patch.preferences) savedPreferences.current = patch.preferences;
  }
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
      recordSaved({ preferences });
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
      recordSaved({ preferences });
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
    const keys = [q.key, ...(q.otherKey ? [q.otherKey] : [])];
    preferences.sources = { ...profile.preferences.sources };
    for (const key of keys) {
      if (saved.sources[key]) preferences.sources[key] = saved.sources[key];
      else delete preferences.sources[key];
    }
    preferences.legacyUnconfirmed = [
      ...profile.preferences.legacyUnconfirmed.filter(
        (key) => !keys.includes(key),
      ),
      ...saved.legacyUnconfirmed.filter((key) => keys.includes(key)),
    ];
    setProfile({ ...profile, preferences });
    setDirection("forward");
    setStep((current) => (reviewingAnswer ? total : current + 1));
    setReviewingAnswer(false);
    window.scrollTo(0, 0);
  }
  function changeAnswer(preferences: Profile["preferences"]) {
    if (!profile || busy) return;
    setProfile({ ...profile, preferences });
    if (preferencesOnly && q.type === "single" && preferences[q.key] !== null)
      void nextStep(preferences);
  }
  function destination() {
    const fallback = fullOnboarding
      ? profile?.accountType === "brand"
        ? "/business"
        : "/create"
      : legacyDirect
        ? "/profile"
        : "/account";
    const target = validateReturnTo(requestedReturn);
    try {
      const remembered = consumeReturnTo(fallback);
      return target ?? remembered;
    } catch {
      return target ?? fallback;
    }
  }
  async function saveAndLeave() {
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.updateProfile({
        preferences: profile.preferences,
        displayName: profile.displayName.trim(),
        accountType: profile.accountType,
        onboardingCompleted: true,
      });
      if (!mounted.current) return;
      leaving.current = true;
      recordSaved({ preferences: profile.preferences });
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Saved remotely. */
      }
      setShowSkip(false);
      navigate(destination());
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
    if (!profile?.onboardingCompleted) {
      setShowSkip(true);
      return;
    }
    leaving.current = true;
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* Optional storage. */
    }
    navigate(destination());
  }
  async function saveAccountChoice(skip = false) {
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!skip)
        await api.updateProfile({
          displayName: profile.displayName.trim(),
          ...(profile.accountType ? { accountType: profile.accountType } : {}),
        });
      if (!mounted.current) return;
      if (!skip)
        recordSaved({
          displayName: profile.displayName.trim(),
          ...(profile.accountType ? { accountType: profile.accountType } : {}),
        });
      if (skip) {
        const saved = await api.me();
        if (!mounted.current) return;
        setProfile((current) =>
          current
            ? {
                ...current,
                displayName: saved.profile.displayName,
                accountType: saved.profile.accountType,
              }
            : current,
        );
      }
      setStep(reviewingAnswer ? total : -1);
      setReviewingAnswer(false);
      window.scrollTo(0, 0);
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function openSummary() {
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.updateProfile({ preferences: profile.preferences });
      if (!mounted.current) return;
      recordSaved({ preferences: profile.preferences });
      setSummaryReturn(step);
      setStep(-1);
      window.scrollTo(0, 0);
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function finish() {
    await saveAndLeave();
  }
  if (!profile)
    return error ? (
      <>
        <Notice error>{error}</Notice>
        <Button secondary onClick={() => setRetry((value) => value + 1)}>
          Retry profile
        </Button>
        <Link className="button secondary" to="/settings">
          Account settings
        </Link>
      </>
    ) : (
      <Loading />
    );
  const firstUnanswered = Math.max(
    0,
    questions.findIndex(
      (question) =>
        profile.preferences[question.key] === null ||
        profile.preferences[question.key] === "",
    ),
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
          disabled={navigationLocked}
          onClick={() => {
            if (reviewingAnswer) {
              setDirection("back");
              setStep(total);
              setReviewingAnswer(false);
            } else if (step === -1 && summaryReturn !== null) {
              setStep(summaryReturn);
              setSummaryReturn(null);
            } else if (step === -1) setStep(-2);
            else if (step <= -2) cancel();
            else {
              setDirection("back");
              setStep(step - 1);
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
                : step === -3
                  ? "Your setup"
                  : "Optional context"}
        </span>
        {step !== -3 && (
          <button
            className="text-button"
            type="button"
            onClick={() =>
              profile.onboardingCompleted
                ? void saveAndLeave()
                : setShowSkip(true)
            }
            disabled={navigationLocked}
          >
            {profile.onboardingCompleted ? "Save & leave" : "Finish later"}
          </button>
        )}
      </div>
      {showSkip && (
        <section
          className="preference-skip-card"
          aria-label="Finish preferences later"
        >
          <h2>Give your next quest a better fit.</h2>
          <p>
            Without your interests, participation style and boundaries, we can
            only use today’s outing. A few answers help us suggest something
            you’ll actually want to do.
          </p>
          <Button disabled={busy} onClick={() => setShowSkip(false)}>
            Keep personalizing
          </Button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void saveAndLeave()}
          >
            Save and explore for now
          </button>
          <p className="support">
            You can return from Profile. We’ll remind you while preferences are
            incomplete.
          </p>
        </section>
      )}
      {!showSkip &&
        (step === -3 ? (
          <>
            <PageTitle
              eyebrow="MAKE SIDEQUEST YOURS"
              title="Account & quest preferences"
            >
              A few minutes now. Quests that feel more like you.
            </PageTitle>
            <ol className="preference-intro-steps">
              <li>
                <b>Account</b>
                <span>Choose personal or brand and a private nickname.</span>
              </li>
              <li>
                <b>ChatGPT, if you like</b>
                <span>Copy a prompt and bring back a summary.</span>
              </li>
              <li>
                <b>Your quest style</b>
                <span>Confirm interests, participation and boundaries.</span>
              </li>
            </ol>
            <Button onClick={() => setStep(-2)}>
              {profile.accountType || chips.length
                ? "Continue setup"
                : "Start setup"}
              <ArrowRight size={18} />
            </Button>
            <button className="text-button" onClick={() => setShowSkip(true)}>
              Finish later
            </button>
            <p className="support">
              Without preferences, we use today’s outing. Your answers help us
              make a more personal match.
            </p>
          </>
        ) : step === -2 ? (
          <>
            <PageTitle title="Make Sidequest yours.">
              Are you here for your own adventures, or on behalf of a brand?
            </PageTitle>
            <AccountTypeChoice
              value={profile.accountType}
              disabled={busy}
              onChange={(accountType) =>
                setProfile({ ...profile, accountType })
              }
            />
            <label className="preference-nickname">
              What should we call you?{" "}
              <span className="support">Optional · private nickname</span>
              <input
                maxLength={60}
                autoComplete="given-name"
                placeholder="First name or nickname"
                value={profile.displayName}
                disabled={busy}
                onChange={(event) =>
                  setProfile({ ...profile, displayName: event.target.value })
                }
              />
            </label>
            <Button
              busy={busy}
              disabled={!profile.accountType}
              onClick={() => void saveAccountChoice()}
            >
              {reviewingAnswer ? "Return to review" : "Continue"}{" "}
              <ArrowRight size={18} />
            </Button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void saveAccountChoice(true)}
            >
              Skip this step
            </button>
            <p className="support">
              Account type sets up the right experience. Brand approval stays
              separate. You can change it later.
            </p>
          </>
        ) : step === -1 ? (
          <>
            <PageTitle title="Your ChatGPT head start">
              Optional context. You choose what becomes a preference.
            </PageTitle>
            <SummaryReview
              profile={profile}
              draft={summaryDraft}
              onDraftChange={setSummaryDraft}
              onPendingChange={setSummaryPending}
              onSaved={(patch) => {
                recordSaved(patch);
                setProfile((current) =>
                  current ? { ...current, ...patch } : current,
                );
              }}
              onContinue={() => {
                setStep(
                  summaryReturn ?? (fullOnboarding ? 0 : firstUnanswered),
                );
                setSummaryReturn(null);
                setSummaryPending({ dirty: false, busy: false });
                window.scrollTo(0, 0);
              }}
            />
          </>
        ) : step < total ? (
          <>
            <div className="preference-tools">
              <span>Account & quest preferences</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void openSummary()}
              >
                <FileText size={16} /> ChatGPT summary
              </button>
            </div>
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
              {profile.summary && (
                <details className="question-summary-reference">
                  <summary>Use my summary as a reference</summary>
                  <p>{profile.summary}</p>
                  <small>
                    Confirm only what is true. Guesses and watching an activity
                    do not mean you would participate.
                  </small>
                </details>
              )}
              {profile.preferences.legacyUnconfirmed.includes(q.key) && (
                <Notice>
                  Your old profile may have filled this answer by default.
                  Choose again to confirm it, or leave it unknown.
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
            {
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
            }
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
        ))}
      {draftNotice && <Notice>{draftNotice}</Notice>}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
