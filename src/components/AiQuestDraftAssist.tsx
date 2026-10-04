import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import {
  AI_PROVIDER_LABELS,
  type AiQuestDraftResult,
} from "../../shared/ai-quest";
import {
  CATEGORIES,
  DEFAULT_OUTING,
  INTENSITIES,
  outingSchema,
  questVariantSchema,
  type Outing,
} from "../../shared/domain";
import { originalQuestIdentity } from "../../shared/community";
import { isAdultAgeConfirmed } from "../../shared/age-eligibility";
import { api } from "../lib/api";
import { aiQuestApi } from "../lib/ai-quest-api";
import { Button, Chips, Loading, Notice, money, useResource } from "./ui";
import "./ai-quest-assist.css";

export function AiQuestDraftAssist({
  initialOuting,
  onUse,
  onManual,
}: {
  initialOuting?: Outing;
  onUse: (proposal: AiQuestDraftResult) => void;
  onManual: () => void;
}) {
  const config = useResource(aiQuestApi.config);
  const account = useResource(api.me);
  const accountAdult = Boolean(
    account.data && isAdultAgeConfirmed(account.data.profile.preferences),
  );
  const [draftId] = useState(() => crypto.randomUUID());
  const [outing, setOuting] = useState<Outing>(() =>
    outingSchema.safeParse(initialOuting).success
      ? initialOuting!
      : { ...DEFAULT_OUTING },
  );
  const [idea, setIdea] = useState("");
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<AiQuestDraftResult>();
  const heading = useRef<HTMLHeadingElement>(null);
  const generating = useRef(false);
  useEffect(() => {
    heading.current?.focus();
  }, [step, config.data?.configured]);
  const update = (patch: Partial<Outing>) =>
    setOuting((current) => {
      const settingChanged =
        patch.setting !== undefined && patch.setting !== current.setting;
      const groupChanged =
        (patch.group !== undefined && patch.group !== current.group) ||
        (patch.participants !== undefined &&
          patch.participants !== current.participants);
      return {
        ...current,
        ...patch,
        ...(settingChanged || groupChanged
          ? {
              adultEligible: false,
              adultContext: false,
              venuePermission: false,
              arrangementConfirmed: false,
              confirmedVenueCostMinor: null,
            }
          : {}),
        ...(settingChanged
          ? {
              applePlaceId: null,
              ...(patch.setting === "home"
                ? {
                    travelMinutes: 0,
                    travelCostMinor: 0,
                    transport: "none" as const,
                  }
                : {}),
            }
          : {}),
      };
    });
  async function generate() {
    if (!consent || !config.data?.configured || generating.current) return;
    generating.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await aiQuestApi.draft({
        draftId,
        idea,
        outing,
        provider: config.data.provider ?? "openai",
        providerConsent: true,
      });
      const quest = questVariantSchema.parse(next.quest);
      const identity = originalQuestIdentity(draftId, 1);
      if (
        next.draftId !== draftId ||
        quest.id !== identity.id ||
        quest.familyId !== identity.familyId
      )
        throw new Error("The proposal did not match your draft. Try again.");
      setProposal({ ...next, quest });
      setStep(2);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== "ZodError"
          ? cause.message
          : "The AI proposal could not be validated. Your draft is unchanged.",
      );
    } finally {
      generating.current = false;
      setBusy(false);
    }
  }
  if (!config.data && !config.error) return <Loading />;
  if (!config.data?.configured)
    return (
      <section className="ai-draft-helper">
        <Notice>
          {config.error ||
            "AI quest drafting isn’t connected yet. You can still write and save your own idea."}
        </Notice>
        <Button onClick={onManual}>Write my own quest</Button>
      </section>
    );
  return (
    <section className="ai-draft-helper" aria-label="Draft a quest with AI">
      <div className="ai-draft-progress" aria-label={`Step ${step + 1} of 3`}>
        {["Your idea", "Your plan", "Your proposal"].map((label, index) => (
          <span key={label} className={index <= step ? "complete" : ""}>
            {label}
          </span>
        ))}
      </div>
      {step === 0 && (
        <>
          <h2 ref={heading} tabIndex={-1}>
            What would make a good story?
          </h2>
          <p>
            A place type, a creative twist, or something you’ve always wanted to
            try.
          </p>
          <label>
            Your idea
            <textarea
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              maxLength={600}
              rows={3}
              placeholder="A creative date outdoors with a surprising reveal"
            />
          </label>
          <p className="fine-print">
            The AI will use this brief and your confirmed preferences. Keep
            private details out of the brief.
          </p>
          <Button disabled={idea.trim().length < 3} onClick={() => setStep(1)}>
            Shape the plan <ArrowRight size={18} />
          </Button>
        </>
      )}
      {step === 1 && (
        <>
          <h2 ref={heading} tabIndex={-1}>
            Make it fit your day.
          </h2>
          <fieldset className="ai-draft-plan" disabled={busy}>
            <label>
              Scene
              <Chips
                label="AI quest scene"
                options={CATEGORIES}
                value={outing.category}
                onChange={(value) =>
                  update({ category: value as Outing["category"] })
                }
              />
            </label>
            <label>
              Energy
              <Chips
                label="AI quest energy"
                options={INTENSITIES}
                value={outing.intensity}
                onChange={(value) =>
                  update({ intensity: value as Outing["intensity"] })
                }
              />
            </label>
            <label>
              Who’s coming?
              <Chips
                label="AI quest group"
                options={[
                  { id: "solo", label: "Just me" },
                  { id: "couple", label: "A couple" },
                  { id: "friends", label: "Friends" },
                ]}
                value={outing.group}
                onChange={(value) =>
                  update({
                    group: value as Outing["group"],
                    participants:
                      value === "solo"
                        ? 1
                        : value === "couple"
                          ? 2
                          : Math.max(3, outing.participants),
                  })
                }
              />
            </label>
            {outing.group === "friends" && (
              <label>
                Number of people
                <input
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={12}
                  value={outing.participants}
                  onChange={(event) =>
                    update({
                      participants: Math.max(
                        3,
                        Math.min(12, Number(event.target.value) || 3),
                      ),
                    })
                  }
                />
              </label>
            )}
            <label>
              Budget for{" "}
              {outing.budgetScope === "total"
                ? "the whole group"
                : "each person"}{" "}
              · {money(outing.budgetMinor)}
              <input
                aria-label="AI quest budget"
                type="range"
                min={0}
                max={Math.max(50000, outing.budgetMinor)}
                step={500}
                value={outing.budgetMinor}
                onChange={(event) =>
                  update({ budgetMinor: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Time
              <Chips
                label="AI quest time"
                options={[
                  { id: "60", label: "1 hour" },
                  { id: "180", label: "3 hours" },
                  { id: "300", label: "5 hours" },
                  { id: "unlimited", label: "Unlimited" },
                ]}
                value={
                  outing.durationMinutes === null
                    ? "unlimited"
                    : String(outing.durationMinutes)
                }
                onChange={(value) =>
                  update({
                    durationMinutes:
                      value === "unlimited" ? null : Number(value),
                  })
                }
              />
            </label>
            <label>
              Setting
              <Chips
                label="AI quest setting"
                options={[
                  { id: "home", label: "At home" },
                  { id: "outside", label: "Outside" },
                  { id: "venue", label: "At a venue" },
                ]}
                value={outing.setting}
                onChange={(value) =>
                  update({ setting: value as Outing["setting"] })
                }
              />
            </label>
            {outing.setting === "venue" && (
              <>
                {!accountAdult && (
                  <Link
                    className="button secondary"
                    to="/preferences?step=account&returnTo=%2Fcreate"
                  >
                    Set your age group for adult experiences
                  </Link>
                )}
                <div className="ai-draft-plan" style={{ gap: 10 }}>
                  <span>Age eligibility at this venue</span>
                  {!accountAdult &&
                    (outing.adultContext || outing.adultEligible) && (
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
                  <Chips
                    label="AI quest age eligibility"
                    options={[
                      { id: "unknown", label: "Not confirmed" },
                      ...(accountAdult
                        ? [{ id: "eligible", label: "Adults and eligible" }]
                        : []),
                    ]}
                    value={outing.adultEligible ? "eligible" : "unknown"}
                    onChange={(value) =>
                      update({
                        adultEligible: value === "eligible",
                        ...(value !== "eligible"
                          ? { adultContext: false }
                          : {}),
                      })
                    }
                  />
                  <span className="fine-print">
                    Choosing “Adults and eligible” confirms everyone in this
                    group is an adult and meets this venue’s age requirement.
                  </span>
                </div>
                {accountAdult && outing.adultEligible && (
                  <div className="ai-draft-plan" style={{ gap: 10 }}>
                    <span>Venue permission</span>
                    <Chips
                      label="AI quest venue permission"
                      options={[
                        { id: "unknown", label: "Not confirmed" },
                        { id: "permitted", label: "We have permission" },
                      ]}
                      value={outing.venuePermission ? "permitted" : "unknown"}
                      onChange={(value) =>
                        update({
                          venuePermission: value === "permitted",
                          ...(value !== "permitted"
                            ? { adultContext: false }
                            : {}),
                        })
                      }
                    />
                    <span className="fine-print">
                      The venue permits your planned activity and any filming.
                    </span>
                  </div>
                )}
                {accountAdult &&
                outing.adultEligible &&
                outing.venuePermission ? (
                  <div className="ai-draft-plan" style={{ gap: 10 }}>
                    <span>Adult nightlife · optional</span>
                    <Chips
                      label="AI quest adult nightlife"
                      options={[
                        { id: "skip", label: "Skip it" },
                        { id: "include", label: "Include it" },
                      ]}
                      value={outing.adultContext ? "include" : "skip"}
                      onChange={(value) =>
                        update({ adultContext: value === "include" })
                      }
                    />
                    <span className="fine-print">
                      Include adult nightlife only if everyone agrees. Alcohol
                      is optional, and your saved boundaries still apply.
                    </span>
                  </div>
                ) : (
                  <p className="fine-print">
                    Confirm age eligibility and venue permission to opt into
                    adult nightlife.
                  </p>
                )}
              </>
            )}
            <label className="ai-provider-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                Send my brief, this plan, confirmed preferences and optional age
                group to {AI_PROVIDER_LABELS[config.data.provider ?? "openai"]}.
                My imported summary, account identity and device location aren’t
                included. Anything I write in the brief will be shared.
              </span>
            </label>
          </fieldset>
          {busy && (
            <div
              className="ai-draft-busy"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="spinner" aria-hidden="true" />
              <p>
                Comparing ideas and checking the plan. This can take up to 90
                seconds.
              </p>
            </div>
          )}
          <div className="ai-draft-actions">
            <Button secondary disabled={busy} onClick={() => setStep(0)}>
              <ArrowLeft size={18} /> Back
            </Button>
            <Button
              disabled={!consent}
              busy={busy}
              onClick={() => void generate()}
            >
              <Sparkles size={18} /> Create a proposal
            </Button>
          </div>
        </>
      )}
      {step === 2 && proposal && (
        <>
          <span className="eyebrow">AI PROPOSAL · REVIEW AND EDIT</span>
          <h2 ref={heading} tabIndex={-1}>
            {proposal.quest.title}
          </h2>
          <p>{proposal.quest.hook}</p>
          <p className="support">
            {proposal.quest.durationMinutes} min ·{" "}
            {proposal.quest.minParticipants === proposal.quest.maxParticipants
              ? proposal.quest.minParticipants
              : `${proposal.quest.minParticipants}–${proposal.quest.maxParticipants}`}{" "}
            people ·{" "}
            {
              INTENSITIES.find((item) => item.id === proposal.quest.intensity)
                ?.label
            }
          </p>
          <ol className="ai-draft-beats">
            {proposal.quest.beats.map((beat, index) => (
              <li key={index}>
                <strong>{beat.label}</strong>
                <p>{beat.action}</p>
                <small>Film: {beat.filming}</small>
              </li>
            ))}
          </ol>
          <Notice>
            This is an idea for review. Check every instruction and requirement.
            No location or event has been verified; it won’t be available as a
            quest until operator review.
          </Notice>
          <Button onClick={() => onUse(proposal)}>
            Use editable draft <ArrowRight size={18} />
          </Button>
          <Button
            secondary
            disabled={busy}
            onClick={() => {
              setProposal(undefined);
              setStep(1);
            }}
          >
            Change the plan
          </Button>
        </>
      )}
      {error && <Notice error>{error}</Notice>}
      <button className="text-button" disabled={busy} onClick={onManual}>
        Write without AI
      </button>
    </section>
  );
}
