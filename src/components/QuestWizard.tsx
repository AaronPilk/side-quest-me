import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  CATEGORIES,
  INTENSITIES,
  effectiveBudget,
  outingSchema,
  type Outing,
  type QuestVariant,
  type Preferences,
} from "../../shared/domain";
import {
  confirmedAgeBand,
  isAdultAgeConfirmed,
} from "../../shared/age-eligibility";
import { rememberReturnTo } from "../lib/internal-return";
import { ApplePlacePicker, ApplePlaceCard } from "./ApplePlaces";
import { QuestFit, useQuestFit } from "./QuestFit";
import { Button, Chips, Notice, money } from "./ui";
import { QuestLocationChooser } from "./QuestLocationChooser";
import type { ApplePlace } from "../lib/apple-maps";
import type { DiscoveryCenter } from "../lib/nearby-discovery";
import "./quest-flow-refinements.css";

type Step =
  | "scene"
  | "intensity"
  | "group"
  | "budget"
  | "time"
  | "setting"
  | "travel"
  | "review";
const questions: Record<
  Step,
  { title: string; description: string; fields: (keyof Outing)[] }
> = {
  scene: {
    title: "What’s the plan?",
    description: "Pick your scene. We’ll find the story together.",
    fields: ["category"],
  },
  intensity: {
    title: "How far are we taking this?",
    description: "Choose the energy that feels right today.",
    fields: ["intensity"],
  },
  group: {
    title: "Who’s coming?",
    description: "A solo adventure, just you two, or the whole crew.",
    fields: ["group", "participants"],
  },
  budget: {
    title: "What’s your budget?",
    description: "Set a comfortable limit. Free is a good plan, too.",
    fields: ["budgetMinor", "budgetScope"],
  },
  time: {
    title: "How much time do you have?",
    description: "Choose the time you want to leave for your adventure.",
    fields: ["durationMinutes"],
  },
  setting: {
    title: "Where are we doing this?",
    description: "Stay in, step outside, or make a night of it.",
    fields: ["setting"],
  },
  travel: {
    title: "Where should we go?",
    description:
      "Find somewhere nearby, or choose an area. You can decide later.",
    fields: ["area", "transport", "applePlaceId"],
  },
  review: {
    title: "Ready to find your quest?",
    description: "Here’s your plan. Tap any detail to change it.",
    fields: [],
  },
};
function stepsFor(outing: Outing, targetId?: string): Step[] {
  return [
    ...(targetId ? [] : (["scene", "intensity"] as Step[])),
    "group",
    "budget",
    "time",
    "setting",
    ...(outing.setting === "home" ? [] : (["travel"] as Step[])),
    "review",
  ];
}
type Progress = {
  step: Step;
  editing: boolean;
  confirmed: (keyof Outing)[];
  requiredFields: (keyof Outing)[];
};
function restoreProgress(outing: Outing, targetId?: string): Progress {
  const steps = stepsFor(outing, targetId);
  try {
    const draft = JSON.parse(sessionStorage.getItem("sq-quest-flow") || "null");
    if (
      [1, 2, 3].includes(draft?.version) &&
      draft.targetId === (targetId || null) &&
      (steps.includes(draft.step) || draft.step === "arrangements")
    )
      return {
        step: draft.step === "arrangements" ? "review" : draft.step,
        editing: draft.step !== "arrangements" && draft.editing === true,
        confirmed: Array.isArray(draft.confirmed)
          ? draft.confirmed.filter((key: string) => key in outingSchema.shape)
          : [],
        requiredFields: Array.isArray(draft.requiredFields)
          ? draft.requiredFields.filter(
              (key: string) => key in outingSchema.shape,
            )
          : [],
      };
  } catch {
    /* A missing or outdated draft starts at the first question. */
  }
  return { step: steps[0], editing: false, confirmed: [], requiredFields: [] };
}

export function editQuestPlans(
  outing: Outing,
  fields: (keyof Outing)[],
  targetId?: string,
) {
  const current = restoreProgress(outing, targetId);
  const step =
    stepsFor(outing, targetId).find((id) =>
      questions[id].fields.some((field) => fields.includes(field)),
    ) || "review";
  sessionStorage.setItem(
    "sq-quest-flow",
    JSON.stringify({
      ...current,
      version: 3,
      targetId: targetId || null,
      step,
      editing: step !== "review",
      requiredFields: fields,
    }),
  );
}

export function QuestWizard({
  outing,
  preferences,
  update: updateOuting,
  onFind,
  targetId,
  target,
  busy,
  error,
  needsProfile,
  firstRun = false,
  center,
  nearbyPlaces = [],
  onAreaReady,
  discoveryConsent,
}: {
  outing: Outing;
  preferences?: Preferences;
  update: (patch: Partial<Outing>) => void;
  onFind: () => Promise<void>;
  targetId?: string;
  target?: QuestVariant | null;
  busy: boolean;
  error: string;
  needsProfile: boolean;
  /** No account type and never onboarded: the nudge opens the full first
   * onboarding (account choice, optional context, questions) instead of the
   * direct preference editor. */
  firstRun?: boolean;
  center?: DiscoveryCenter;
  nearbyPlaces?: ApplePlace[];
  onAreaReady?: (
    center: DiscoveryCenter | undefined,
    places: ApplePlace[],
  ) => void;
  discoveryConsent?: React.ReactNode;
}) {
  const [progress, setProgress] = useState(() =>
    restoreProgress(outing, targetId),
  );
  const location = useLocation();
  const [validation, setValidation] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = stepsFor(outing, targetId);
  const step = progress.step;
  const index = steps.indexOf(step);
  const question = questions[step];
  const review = step === "review";
  const accountAdult = Boolean(preferences && isAdultAgeConfirmed(preferences));
  const targetAgeEligible =
    accountAdult &&
    (target?.minimumAge !== 21 ||
      (preferences && confirmedAgeBand(preferences) === "21_plus"));
  const agePreferencesUrl = `/preferences?step=account&returnTo=${encodeURIComponent(location.pathname + location.search)}`;
  const matching = useQuestFit(
    outing,
    Object.keys(outingSchema.shape) as (keyof Outing)[],
    targetId,
    review && Boolean(targetId),
  );
  const adultConfirmationNeeded = Boolean(
    target?.minimumAge ||
    target?.adultOnly ||
    target?.requiresVolunteer ||
    outing.category === "street_challenges" ||
    progress.requiredFields.includes("adultEligible"),
  );
  function update(patch: Partial<Outing>) {
    updateOuting(patch);
    setProgress((current) => ({
      ...current,
      confirmed: [
        ...new Set([
          ...current.confirmed,
          ...question.fields.filter((field) => field in patch),
        ]),
      ],
    }));
    setValidation("");
  }
  useEffect(() => {
    sessionStorage.setItem(
      "sq-quest-flow",
      JSON.stringify({ version: 3, targetId: targetId || null, ...progress }),
    );
  }, [progress, targetId]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [step]);
  function go(next: Step, editing = progress.editing) {
    setValidation("");
    setProgress((current) => ({ ...current, step: next, editing }));
  }
  async function advance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = outingSchema.safeParse(outing);
    if (!parsed.success) {
      const issue = parsed.error.issues.find(
        (issue) =>
          review || question.fields.includes(issue.path[0] as keyof Outing),
      );
      if (issue) {
        setValidation(`Check your answer: ${issue.message}`);
        return;
      }
    }
    setValidation("");
    setProgress((current) => ({
      ...current,
      confirmed: [...new Set([...current.confirmed, ...question.fields])],
    }));
    if (review) await onFind();
    else if (progress.editing) {
      if (step === "setting" && outing.setting !== "home") go("travel", true);
      else go("review", false);
    } else go(steps[index + 1], false);
  }
  // Numeric fields can be temporarily invalid while editing; never let a
  // display-only calculation crash the form before validation can explain it.
  const totalBudget =
    Number.isSafeInteger(outing.budgetMinor) &&
    outing.budgetMinor >= 0 &&
    outing.budgetMinor <= 1_000_000 &&
    Number.isSafeInteger(outing.participants) &&
    outing.participants >= 1 &&
    outing.participants <= 12
      ? money(effectiveBudget(outing))
      : null;
  const category =
    CATEGORIES.find((c) => c.id === outing.category)?.label || "";
  const intensity =
    INTENSITIES.find((i) => i.id === outing.intensity)?.label || "";
  const rows: { step: Step; label: string; value: string }[] = [
    ...(!targetId
      ? [
          { step: "scene" as const, label: "Scene", value: category },
          { step: "intensity" as const, label: "Energy", value: intensity },
        ]
      : []),
    {
      step: "group",
      label: "Who’s coming",
      value: `${outing.group === "solo" ? "Solo" : outing.group === "couple" ? "Couple" : "Friends"} · ${outing.participants} ${outing.participants === 1 ? "person" : "people"}`,
    },
    {
      step: "budget",
      label: "Budget",
      value: `${money(outing.budgetMinor)} ${outing.budgetScope === "per_person" ? "each" : "total"}${outing.budgetScope === "per_person" && totalBudget ? ` · ${totalBudget} for everyone` : ""}`,
    },
    {
      step: "time",
      label: "Time",
      value:
        outing.durationMinutes === null
          ? "Unlimited time"
          : outing.durationMinutes % 60 === 0
            ? `${outing.durationMinutes / 60} ${outing.durationMinutes === 60 ? "hour" : "hours"}`
            : `${outing.durationMinutes} minutes (saved plan)`,
    },
    {
      step: "setting",
      label: "Setting",
      value:
        outing.setting === "home"
          ? "At home"
          : outing.setting === "outside"
            ? "Outside"
            : "At a venue",
    },
    ...(outing.setting === "home"
      ? []
      : [
          {
            step: "travel" as const,
            label: "Place",
            value:
              outing.area ||
              (outing.applePlaceId ? "Place selected" : "Choose along the way"),
          },
        ]),
  ];
  return (
    <div
      className={`quest-wizard ${review ? "is-review" : "is-question"}`}
      data-step={step}
    >
      <div className="quest-flow-topline">
        <span className="eyebrow">
          {review ? "YOUR PLAN" : "CREATE YOUR QUEST"}
        </span>
        <span className="support">
          {review ? "Review" : `${index + 1} of ${steps.length - 1}`}
        </span>
      </div>
      <div
        className="quest-flow-progress"
        role="progressbar"
        aria-label="Quest setup progress"
        aria-valuemin={0}
        aria-valuemax={steps.length - 1}
        aria-valuenow={index}
        aria-valuetext={
          review
            ? "Ready to review"
            : `Question ${index + 1} of ${steps.length - 1}`
        }
      >
        {steps.slice(0, -1).map((id, i) => (
          <span key={id} className={i <= index ? "filled" : ""} />
        ))}
      </div>
      <form onSubmit={advance} aria-labelledby="quest-question">
        <header className="page-title quest-question">
          <h1 id="quest-question" tabIndex={-1} ref={heading}>
            {question.title}
          </h1>
          <p>{question.description}</p>
        </header>
        <div className="quest-answer" key={step}>
          {step === "scene" && (
            <div className="category-grid" role="group" aria-label="Scene">
              {CATEGORIES.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={`category ${outing.category === c.id ? "selected" : ""}`}
                  aria-pressed={outing.category === c.id}
                  onClick={() => update({ category: c.id })}
                >
                  <span className="category-symbol" aria-hidden="true">
                    {["♡", "☀", "☾", "↗", "♧"][i]}
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {step === "intensity" && (
            <div
              className="quest-choice-list"
              role="group"
              aria-label="Intensity"
            >
              {INTENSITIES.map((v, i) => (
                <button
                  type="button"
                  key={v.id}
                  aria-label={v.label}
                  aria-describedby={`quest-energy-${v.id}`}
                  aria-pressed={outing.intensity === v.id}
                  className={`quest-choice ${outing.intensity === v.id ? "selected" : ""}`}
                  onClick={() => update({ intensity: v.id })}
                >
                  <span className="intensity-bars" aria-hidden="true">
                    {[0, 1, 2].map((n) => (
                      <i key={n} className={n <= i ? "on" : ""} />
                    ))}
                  </span>
                  <span>
                    <strong>{v.label}</strong>
                    <small id={`quest-energy-${v.id}`}>{v.description}</small>
                  </span>
                  <span className="quest-choice-check" aria-hidden="true">
                    {outing.intensity === v.id && <Check size={16} />}
                  </span>
                </button>
              ))}
            </div>
          )}
          {step === "group" && (
            <>
              <Chips
                label="Group"
                options={[
                  { id: "solo", label: "Solo" },
                  { id: "couple", label: "Couple" },
                  { id: "friends", label: "Friends" },
                ]}
                value={outing.group}
                onChange={(v) =>
                  update({
                    group: v as Outing["group"],
                    participants: v === "solo" ? 1 : v === "couple" ? 2 : 4,
                  })
                }
              />
              {outing.group === "friends" && (
                <label className="space-top">
                  Group size
                  <input
                    type="number"
                    required
                    min="2"
                    max="12"
                    value={outing.participants}
                    onChange={(e) =>
                      update({ participants: Number(e.target.value) })
                    }
                  />
                </label>
              )}
            </>
          )}
          {step === "budget" && (
            <>
              <BudgetPicker
                value={outing.budgetMinor}
                onChange={(budgetMinor) => update({ budgetMinor })}
              />
              <fieldset className="quest-inline-choice">
                <legend>Budget is for</legend>
                <Chips
                  label="Budget is for"
                  options={[
                    { id: "total", label: "The whole group" },
                    { id: "per_person", label: "Each person" },
                  ]}
                  value={outing.budgetScope}
                  onChange={(value) =>
                    update({ budgetScope: value as Outing["budgetScope"] })
                  }
                />
              </fieldset>
              <p className="budget-total">
                {totalBudget ? (
                  <>
                    {totalBudget} total group ceiling{" "}
                    <span>· Including required costs</span>
                  </>
                ) : (
                  "Enter a valid budget to see your total."
                )}
              </p>
            </>
          )}
          {step === "time" && (
            <>
              <Chips
                label="Available time"
                options={[
                  { id: "60", label: "1 hour" },
                  { id: "180", label: "3 hours" },
                  { id: "300", label: "5 hours" },
                  { id: "unlimited", label: "Unlimited time" },
                ]}
                value={String(outing.durationMinutes ?? "unlimited")}
                onChange={(v) =>
                  update({
                    durationMinutes: v === "unlimited" ? null : Number(v),
                  })
                }
              />
              {outing.durationMinutes !== null &&
                ![60, 180, 300].includes(outing.durationMinutes) && (
                  <p className="support">
                    Your saved plan allows {outing.durationMinutes} minutes.
                    Choose a time above to change it.
                  </p>
                )}
            </>
          )}
          {step === "setting" && (
            <Chips
              label="Setting"
              options={[
                { id: "home", label: "At home" },
                { id: "outside", label: "Outside" },
                { id: "venue", label: "At a venue" },
              ]}
              value={outing.setting}
              onChange={(v) =>
                update({
                  setting: v as Outing["setting"],
                  ...(v === outing.setting
                    ? {}
                    : {
                        applePlaceId: null,
                        venuePermission: false,
                        confirmedVenueCostMinor: null,
                        adultEligible: false,
                        adultContext: false,
                      }),
                  ...(v === "home"
                    ? {
                        travelMinutes: 0,
                        travelCostMinor: 0,
                        transport: "none" as const,
                      }
                    : {}),
                })
              }
            />
          )}
          {step === "travel" && (
            <>
              <fieldset className="quest-inline-choice">
                <legend>Getting there</legend>
                <Chips
                  label="Getting there"
                  options={[
                    { id: "none", label: "Already there" },
                    { id: "walk", label: "Walking" },
                    { id: "bike", label: "Cycling" },
                    { id: "transit", label: "Public transit" },
                    { id: "car", label: "Car" },
                  ]}
                  value={outing.transport}
                  onChange={(value) =>
                    update({ transport: value as Outing["transport"] })
                  }
                />
              </fieldset>
              <div className="quest-location">
                {!targetId && onAreaReady ? (
                  <QuestLocationChooser
                    outing={outing}
                    update={update}
                    center={center}
                    places={nearbyPlaces}
                    onAreaReady={onAreaReady}
                  />
                ) : (
                  outing.setting !== "home" && (
                    <ApplePlacePicker
                      area={outing.area}
                      onAreaChange={(area) => update({ area })}
                      setting={outing.setting}
                      placeId={outing.applePlaceId}
                      onChange={(id) =>
                        update({
                          applePlaceId: id,
                          venuePermission: false,
                          confirmedVenueCostMinor: null,
                          arrangementConfirmed: false,
                          adultEligible: false,
                          adultContext: false,
                        })
                      }
                    />
                  )
                )}
              </div>
            </>
          )}
          {review && (
            <div className="quest-review">
              {rows.map((row) => (
                <button
                  type="button"
                  className="quest-review-row"
                  key={row.step}
                  aria-label={`Edit ${row.step}`}
                  aria-describedby={`quest-review-${row.step}`}
                  disabled={busy}
                  onClick={() => go(row.step, true)}
                >
                  <span>
                    <small>{row.label}</small>
                    <strong id={`quest-review-${row.step}`}>{row.value}</strong>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          {review &&
            !targetId &&
            (outing.travelMinutes > 0 || outing.travelCostMinor > 0) && (
              <div className="quest-saved-travel">
                <p className="support">
                  Your saved plan reserves {outing.travelMinutes} minutes and{" "}
                  {money(outing.travelCostMinor)} for travel.
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    update({ travelMinutes: 0, travelCostMinor: 0 })
                  }
                >
                  Clear saved travel estimates
                </button>
              </div>
            )}
          {review && targetId && (
            <details
              className="quest-arrangements"
              open={Boolean(
                outing.travelMinutes > 0 ||
                outing.travelCostMinor > 0 ||
                target?.arrangementRequired ||
                (target?.privateGenerated && target.cost.venueCostUnknown) ||
                target?.minimumAge ||
                target?.adultOnly ||
                target?.requiresVolunteer ||
                target?.venuePermissionRequired ||
                progress.requiredFields.some((field) =>
                  [
                    "arrangementConfirmed",
                    "venuePermission",
                    "confirmedVenueCostMinor",
                    "adultEligible",
                    "adultContext",
                  ].includes(field),
                ),
              )}
            >
              <summary>Before you start this quest</summary>
              {(outing.travelMinutes > 0 || outing.travelCostMinor > 0) && (
                <div className="quest-saved-travel">
                  <p className="support">
                    Your saved plan reserves {outing.travelMinutes} minutes and{" "}
                    {money(outing.travelCostMinor)} for travel.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update({ travelMinutes: 0, travelCostMinor: 0 })
                    }
                  >
                    Clear saved travel estimates
                  </button>
                </div>
              )}
              <p className="support">
                Only add details you already know. These help match quests that
                need a booking, equipment or permission.
              </p>
              {!targetAgeEligible &&
                (adultConfirmationNeeded || outing.setting === "venue") && (
                  <Link className="button secondary" to={agePreferencesUrl}>
                    Set your age group for adult experiences
                  </Link>
                )}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={outing.arrangementConfirmed}
                  onChange={(e) =>
                    update({ arrangementConfirmed: e.target.checked })
                  }
                />
                <span>
                  We’ve arranged the required people, equipment or performance
                  slot.
                </span>
              </label>
              {outing.setting !== "venue" && adultConfirmationNeeded && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={outing.adultEligible}
                    disabled={!targetAgeEligible}
                    onChange={(e) =>
                      update({ adultEligible: e.target.checked })
                    }
                  />
                  <span>
                    All participants and volunteers are adults who can freely
                    choose to participate.
                  </span>
                </label>
              )}
              {(outing.setting === "venue" ||
                target?.venuePermissionRequired) && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={outing.venuePermission}
                    onChange={(e) =>
                      update({ venuePermission: e.target.checked })
                    }
                  />
                  <span>We have permission for the activity and filming.</span>
                </label>
              )}
              {(outing.setting === "venue" ||
                (target?.privateGenerated && target.cost.venueCostUnknown)) && (
                <label>
                  {outing.setting === "venue"
                    ? "Confirmed total admission / room cost (USD)"
                    : "Total confirmed activity cost (USD)"}
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="0.01"
                    value={
                      outing.confirmedVenueCostMinor === null
                        ? ""
                        : outing.confirmedVenueCostMinor / 100
                    }
                    placeholder="Unknown until confirmed"
                    onChange={(e) =>
                      update({
                        confirmedVenueCostMinor:
                          e.target.value === ""
                            ? null
                            : Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
              )}
              {outing.setting === "venue" && (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.adultEligible}
                      disabled={!targetAgeEligible}
                      onChange={(e) =>
                        update({
                          adultEligible: e.target.checked,
                          ...(!e.target.checked ? { adultContext: false } : {}),
                        })
                      }
                    />
                    <span>
                      All participants are adults and meet the venue’s legal age
                      requirement.
                    </span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.adultContext}
                      disabled={!targetAgeEligible || !outing.adultEligible}
                      onChange={(e) =>
                        update({ adultContext: e.target.checked })
                      }
                    />
                    <span>
                      Include explicitly agreed adult nightlife contexts.
                    </span>
                  </label>
                </>
              )}
              <p className="support">
                Quests that require these details stay unavailable until you
                confirm them.
              </p>
            </details>
          )}
          {review && !targetId && outing.setting === "venue" && (
            <section
              className="quest-arrangements"
              aria-label="Adult nightlife preferences"
            >
              <h3>Make it a grown-up night?</h3>
              <p className="support">
                Optional nightlife, playful competition and a night worth
                talking about. Your boundaries still apply.
              </p>
              {!accountAdult ? (
                <>
                  <Link className="button secondary" to={agePreferencesUrl}>
                    Set your age group for adult experiences
                  </Link>
                  {(outing.adultContext || outing.adultEligible) && (
                    <Button
                      type="button"
                      secondary
                      onClick={() =>
                        update({ adultContext: false, adultEligible: false })
                      }
                    >
                      Find ideas without adult nightlife
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.adultEligible}
                      onChange={(event) =>
                        update({
                          adultEligible: event.target.checked,
                          ...(!event.target.checked
                            ? { adultContext: false }
                            : {}),
                        })
                      }
                    />
                    <span>
                      Everyone is an adult and can meet the age rules for the
                      venues we choose.
                    </span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.adultContext}
                      disabled={!outing.adultEligible}
                      onChange={(event) =>
                        update({ adultContext: event.target.checked })
                      }
                    />
                    <span>
                      Include adult nightlife. Everyone in our group is up for
                      it.
                    </span>
                  </label>
                  <p className="fine-print">
                    Check each venue’s age, activity and filming rules before
                    starting. Drinks are optional.
                  </p>
                </>
              )}
            </section>
          )}
        </div>
        {review && outing.applePlaceId && outing.setting !== "home" && (
          <ApplePlaceCard
            placeId={outing.applePlaceId}
            transport={outing.transport}
          />
        )}
        {review && discoveryConsent}
        {review && targetId && matching.fit && matching.fit.viableCount > 0 && (
          <QuestFit
            fit={matching.fit}
            final
            busy={busy}
            onChoose={() => {}}
            onEdit={() => go(steps[0], false)}
          />
        )}
        {index === 0 && !progress.editing && (
          <div className="quest-flow-extras">
            {needsProfile && (
              <Link
                className="profile-nudge"
                to={`${firstRun ? "/onboarding" : "/preferences"}?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
                onClick={() =>
                  rememberReturnTo(
                    location.pathname + location.search + location.hash,
                  )
                }
              >
                <Sparkles size={18} />
                <span>
                  Make it your kind of quest{" "}
                  <small>Add your interests for a closer fit</small>
                </span>
                <ChevronRight size={18} />
              </Link>
            )}
            <div className="create-links">
              <Link to="/originals/new?ai=1" state={{ outing }}>
                Draft with AI
              </Link>
              <Link to="/originals/new">Draft an original quest</Link>
              <Link to="/discover">Find inspiration</Link>
            </div>
          </div>
        )}
        <footer className="quest-flow-footer">
          {(validation || error) && (
            <Notice error>{validation || error}</Notice>
          )}
          <div className="quest-flow-actions">
            {(index > 0 || progress.editing) && (
              <Button
                type="button"
                secondary
                disabled={busy}
                onClick={() =>
                  go(progress.editing ? "review" : steps[index - 1], false)
                }
              >
                <ArrowLeft size={18} />
                Back
              </Button>
            )}
            <Button type="submit" busy={busy}>
              {review
                ? targetId
                  ? "Check this quest"
                  : "Find my quests"
                : "Continue"}
              <ArrowRight size={18} />
            </Button>
          </div>
          <p className="fine-print centered">
            {review
              ? "Made for your plans. Never a pressure to spend."
              : "You can change every answer before choosing a quest."}
          </p>
        </footer>
      </form>
    </div>
  );
}

function BudgetPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minor: number) => void;
}) {
  const [draft, setDraft] = useState(String(value / 100));
  const [exact, setExact] = useState(false);
  const valid = Number.isFinite(value) && value >= 0;
  const max = Math.max(500, valid ? Math.ceil(value / 5000) * 50 : 500);
  return (
    <div className="budget-picker">
      <div className="budget-amount" aria-live="polite">
        <output htmlFor="quest-budget-slider">
          {valid ? (value === 0 ? "Free" : money(value)) : "—"}
        </output>
      </div>
      <label className="sr-only" htmlFor="quest-budget-slider">
        Budget slider in dollars
      </label>
      <input
        id="quest-budget-slider"
        className="budget-slider"
        type="range"
        min="0"
        max={max}
        step="5"
        value={valid ? value / 100 : 0}
        aria-valuetext={
          valid
            ? value === 0
              ? "Free"
              : `${money(value)} US dollars`
            : "Choose a budget"
        }
        style={
          {
            "--budget-fill": `${(valid ? value / 100 / max : 0) * 100}%`,
          } as React.CSSProperties
        }
        onChange={(event) => {
          const amount = Number(event.target.value);
          setDraft(String(amount));
          onChange(amount * 100);
        }}
      />
      <div className="budget-scale" aria-hidden="true">
        <span>Free</span>
        <span>{money(max * 50)}</span>
        <span>{money(max * 100)}</span>
      </div>
      <button
        className="budget-exact button secondary"
        type="button"
        aria-expanded={exact}
        onClick={() => setExact((open) => !open)}
      >
        {exact ? "Done with exact amount" : "Enter exact amount"}
      </button>
      {exact && (
        <label>
          Exact budget (USD)
          <input
            aria-label="Budget in dollars"
            type="number"
            inputMode="decimal"
            required
            min="0"
            max="10000"
            step="0.01"
            value={draft}
            onFocus={(event) => {
              if (event.currentTarget.value === "0")
                event.currentTarget.select();
            }}
            onChange={(event) => {
              const next = event.currentTarget.value.replace(
                /^(-?)0+(?=\d)/,
                "$1",
              );
              setDraft(next);
              onChange(
                next === "" ? Number.NaN : Math.round(Number(next) * 100),
              );
            }}
            onBlur={() => {
              if (draft === "") {
                setDraft("0");
                onChange(0);
              }
            }}
          />
        </label>
      )}
    </div>
  );
}
