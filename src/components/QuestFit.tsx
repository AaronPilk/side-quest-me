import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, SlidersHorizontal } from "lucide-react";
import { outingSchema, type Outing } from "../../shared/domain";
import type { QuestRecovery, QuestViability } from "../../shared/viability";
import { api } from "../lib/api";

export function useQuestFit(
  outing: Outing,
  confirmed: (keyof Outing)[],
  targetId?: string,
  enabled = true,
) {
  const signature = JSON.stringify({
    outing,
    confirmed: [...confirmed].sort(),
    targetId,
  });
  const [state, setState] = useState<{
    key: string;
    fit?: QuestViability;
    error?: string;
  }>({ key: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const input = JSON.parse(signature) as {
      outing: Outing;
      confirmed: (keyof Outing)[];
      targetId?: string;
    };
    if (!outingSchema.safeParse(input.outing).success) return;
    const timer = setTimeout(() => {
      api
        .viability(input.outing, input.confirmed, input.targetId)
        .then((fit) => {
          if (active) setState({ key: signature, fit });
        })
        .catch(() => {
          if (active)
            setState({
              key: signature,
              error: "Couldn’t check matches yet. Your answers are saved.",
            });
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [signature, attempt, enabled]);
  return {
    fit: state.key === signature ? state.fit : undefined,
    error: state.key === signature ? state.error : undefined,
    retry: () => setAttempt((n) => n + 1),
  };
}

export function QuestFit({
  fit,
  final = false,
  busy = false,
  onChoose,
  onEdit,
}: {
  fit: QuestViability;
  final?: boolean;
  busy?: boolean;
  onChoose: (recovery: QuestRecovery) => void;
  onEdit: () => void;
}) {
  if (fit.viableCount > 0)
    return (
      <p className="quest-fit-status" role="status">
        <Check size={16} />
        {fit.viableCount} {final ? "matching" : "possible"}{" "}
        {fit.viableCount === 1 ? "quest" : "quests"}
        {!final && <span>· We’ll check the remaining details as you go.</span>}
      </p>
    );
  // A partial draft is not a failed plan. Only explain an empty result after
  // the user has finished their answers; never offer to rewrite their choices.
  if (!final) return null;
  const requirementFields = new Set<keyof Outing>([
    "arrangementConfirmed",
    "venuePermission",
    "confirmedVenueCostMinor",
    "adultEligible",
    "adultContext",
  ]);
  const requirements = fit.recoveries.filter(
    (recovery) =>
      recovery.requiresConfirmation &&
      recovery.fields.every((field) => requirementFields.has(field)) &&
      Object.keys(recovery.patch).length === 0,
  );
  const boundaryReasons = fit.reasons.filter((reason) =>
    /boundary|boundaries/i.test(reason),
  );
  return (
    <section className="quest-recovery" aria-label="Quest matching help">
      <h3>
        <SlidersHorizontal size={17} />
        No matches for these answers yet
      </h3>
      <p className="support">
        Your choices are saved. We haven’t found a published quest that meets
        all of them.
      </p>
      {boundaryReasons.map((reason) => (
        <p className="support" key={reason}>
          {reason}
        </p>
      ))}
      {requirements.slice(0, 2).map((recovery) => (
        <div className="quest-recovery-option" key={recovery.id}>
          <p>{recovery.description}</p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => onChoose(recovery)}
          >
            {recovery.label}
          </button>
        </div>
      ))}
      <div className="place-links">
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={onEdit}
        >
          Review my answers
        </button>
        <Link to="/discover">Browse ideas</Link>
        {boundaryReasons.length > 0 && (
          <Link to="/account">Review my boundaries</Link>
        )}
      </div>
    </section>
  );
}
