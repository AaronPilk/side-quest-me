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
} from "../../shared/domain";
import { rememberReturnTo } from "../lib/internal-return";
import { ApplePlacePicker, ApplePlaceCard } from "./ApplePlaces";
import { QuestFit, useQuestFit } from "./QuestFit";
import type { QuestRecovery } from "../../shared/viability";
import { Button, Chips, Notice, money } from "./ui";

type Step =
  | "scene"
  | "intensity"
  | "group"
  | "budget"
  | "time"
  | "setting"
  | "travel"
  | "arrangements"
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
    description: "This includes getting there and back.",
    fields: ["durationMinutes"],
  },
  setting: {
    title: "Where are we doing this?",
    description: "Stay in, step outside, or make a night of it.",
    fields: ["setting"],
  },
  travel: {
    title: "How are you getting there?",
    description: "We’ll leave room for the journey in your time and budget.",
    fields: ["area", "transport", "travelMinutes", "travelCostMinor"],
  },
  arrangements: {
    title: "Anything already arranged?",
    description: "Only confirm what’s ready. Leave the rest unchecked.",
    fields: [
      "arrangementConfirmed",
      "venuePermission",
      "confirmedVenueCostMinor",
      "adultEligible",
      "adultContext",
    ],
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
    "arrangements",
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
      [1, 2].includes(draft?.version) &&
      draft.targetId === (targetId || null) &&
      steps.includes(draft.step)
    )
      return {
        step: draft.step,
        editing: draft.editing === true,
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
      version: 2,
      targetId: targetId || null,
      step,
      editing: step !== "review",
      requiredFields: fields,
    }),
  );
}

export function QuestWizard({
  outing,
  update: updateOuting,
  onFind,
  targetId,
  target,
  busy,
  error,
  needsProfile,
}: {
  outing: Outing;
  update: (patch: Partial<Outing>) => void;
  onFind: () => Promise<void>;
  targetId?: string;
  target?: QuestVariant | null;
  busy: boolean;
  error: string;
  needsProfile: boolean;
}) {
  const [progress, setProgress] = useState(() =>
    restoreProgress(outing, targetId),
  );
  const location = useLocation();
  const [mapsOpen, setMapsOpen] = useState(Boolean(outing.applePlaceId));
  const [validation, setValidation] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = stepsFor(outing, targetId);
  const step = progress.step;
  const index = steps.indexOf(step);
  const question = questions[step];
  const review = step === "review";
  const knownFields = review
    ? (Object.keys(outingSchema.shape) as (keyof Outing)[])
    : [
        ...new Set([
          ...progress.confirmed,
          ...(targetId ? (["category", "intensity"] as (keyof Outing)[]) : []),
        ]),
      ];
  const matching = useQuestFit(outing, knownFields, targetId);
  const adultConfirmationNeeded = Boolean(
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
  function chooseRecovery(recovery: QuestRecovery) {
    if (recovery.requiresConfirmation) {
      const destination =
        steps.find((id) =>
          questions[id].fields.some((field) => recovery.fields.includes(field)),
        ) || "arrangements";
      setProgress((current) => ({
        ...current,
        step: destination,
        editing: review || current.editing,
        requiredFields: recovery.fields,
      }));
    } else {
      updateOuting(recovery.patch);
      setProgress((current) => ({
        ...current,
        step: stepsFor({ ...outing, ...recovery.patch }, targetId).includes(
          current.step,
        )
          ? current.step
          : "arrangements",
        confirmed: [
          ...new Set([
            ...current.confirmed,
            ...(Object.keys(recovery.patch) as (keyof Outing)[]),
          ]),
        ],
      }));
    }
  }
  useEffect(() => {
    sessionStorage.setItem(
      "sq-quest-flow",
      JSON.stringify({ version: 2, targetId: targetId || null, ...progress }),
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
    else if (progress.editing && !["setting", "travel"].includes(step))
      go("review", false);
    else go(steps[index + 1]);
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
  const confirmations = [
    outing.arrangementConfirmed
      ? "People / equipment ready"
      : "No arrangements confirmed",
    ...(outing.setting === "venue"
      ? [
          outing.venuePermission
            ? "Filming permission confirmed"
            : "Filming permission unconfirmed",
          outing.confirmedVenueCostMinor === null
            ? "Venue cost unknown"
            : `${money(outing.confirmedVenueCostMinor)} venue cost`,
          outing.adultEligible
            ? "Venue age requirement met"
            : "Venue age requirement unconfirmed",
          outing.adultContext
            ? "Adult nightlife included"
            : "Adult nightlife excluded",
        ]
      : adultConfirmationNeeded
        ? [
            outing.adultEligible
              ? "Adult volunteers confirmed"
              : "Adult volunteers unconfirmed",
          ]
        : []),
  ];
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
          ? "Flexible"
          : `${outing.durationMinutes} minutes, including travel`,
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
            label: "Travel",
            value: `${outing.area ? `${outing.area} · ` : ""}${outing.transport === "none" ? "No transport needed" : outing.transport} · ${outing.travelMinutes} min round trip · ${money(outing.travelCostMinor)}`,
          },
        ]),
    {
      step: "arrangements",
      label: "Arrangements",
      value: confirmations.join(" · "),
    },
  ];
  return (
    <div className="quest-wizard">
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
              <label>
                Budget (USD)
                <div className="money-input quest-budget">
                  <span>$</span>
                  <input
                    aria-label="Budget in dollars"
                    type="number"
                    required
                    min="0"
                    max="10000"
                    step="0.01"
                    value={outing.budgetMinor / 100}
                    onChange={(e) =>
                      update({
                        budgetMinor: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </div>
              </label>
              <label>
                Budget is for
                <select
                  value={outing.budgetScope}
                  onChange={(e) =>
                    update({
                      budgetScope: e.target.value as Outing["budgetScope"],
                    })
                  }
                >
                  <option value="total">The whole group</option>
                  <option value="per_person">Each person</option>
                </select>
              </label>
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
                  { id: "30", label: "30 min" },
                  { id: "60", label: "1 hour" },
                  { id: "120", label: "2 hours" },
                  { id: "flexible", label: "Flexible" },
                ]}
                value={String(outing.durationMinutes ?? "flexible")}
                onChange={(v) =>
                  update({
                    durationMinutes: v === "flexible" ? null : Number(v),
                  })
                }
              />
              <label className="space-top">
                Custom available time (minutes)
                <input
                  type="number"
                  min="15"
                  max="720"
                  value={outing.durationMinutes ?? ""}
                  placeholder="Flexible"
                  onChange={(e) =>
                    update({
                      durationMinutes:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
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
              <label>
                Getting there
                <select
                  value={outing.transport}
                  onChange={(e) =>
                    update({ transport: e.target.value as Outing["transport"] })
                  }
                >
                  {[
                    { id: "none", label: "No transport needed" },
                    { id: "walk", label: "Walking" },
                    { id: "bike", label: "Cycling" },
                    { id: "transit", label: "Public transit" },
                    { id: "car", label: "Car" },
                  ].map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Round-trip travel (min)
                  <input
                    type="number"
                    required
                    min="0"
                    max="240"
                    value={outing.travelMinutes}
                    onChange={(e) =>
                      update({ travelMinutes: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Travel estimate (USD)
                  <input
                    type="number"
                    required
                    min="0"
                    max="1000"
                    step="0.01"
                    value={outing.travelCostMinor / 100}
                    onChange={(e) =>
                      update({
                        travelCostMinor: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <details
                className="quest-location"
                open={mapsOpen}
                onToggle={(e) => setMapsOpen(e.currentTarget.open)}
              >
                <summary>
                  Choose an area or place <span>Optional</span>
                </summary>
                <label>
                  Area
                  <input
                    value={outing.area}
                    maxLength={100}
                    placeholder="A neighborhood or town is enough"
                    onChange={(e) => update({ area: e.target.value })}
                  />
                </label>
                {mapsOpen && outing.setting !== "home" && (
                  <ApplePlacePicker
                    area={outing.area}
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
                )}
              </details>
            </>
          )}
          {step === "arrangements" && (
            <div className="quest-arrangements">
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
              {outing.setting === "venue" && (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.venuePermission}
                      onChange={(e) =>
                        update({ venuePermission: e.target.checked })
                      }
                    />
                    <span>
                      We have permission for the activity and filming.
                    </span>
                  </label>
                  <label>
                    Confirmed total admission / room cost (USD)
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
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.adultEligible}
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
                      disabled={!outing.adultEligible}
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
                Quests that need unconfirmed arrangements won’t be included.
              </p>
            </div>
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
        </div>
        {review && outing.applePlaceId && outing.setting !== "home" && (
          <ApplePlaceCard
            placeId={outing.applePlaceId}
            transport={outing.transport}
          />
        )}
        {matching.fit && (
          <QuestFit
            fit={matching.fit}
            final={review}
            busy={busy}
            onChoose={chooseRecovery}
            onEdit={() => go(steps[0], false)}
          />
        )}
        {matching.error && (
          <p className="support" role="status">
            {matching.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={matching.retry}
            >
              Retry match check
            </button>
          </p>
        )}
        {(validation || error) && <Notice error>{validation || error}</Notice>}
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
      </form>
      {index === 0 && !progress.editing && (
        <div className="quest-flow-extras">
          {needsProfile && (
            <Link
              className="profile-nudge"
              to="/onboarding"
              onClick={() =>
                rememberReturnTo(location.pathname + location.search)
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
            <Link to="/originals/new">Draft an original quest</Link>
            <Link to="/series/new">Start a series</Link>
            <Link to="/discover">Find inspiration</Link>
          </div>
        </div>
      )}
    </div>
  );
}
