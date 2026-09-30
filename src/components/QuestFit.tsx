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
  }, [signature, attempt]);
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
  return (
    <section className="quest-recovery" aria-label="Quest matching help">
      <h3>
        <SlidersHorizontal size={17} />
        Let’s adjust the plan
      </h3>
      <p className="support">
        {final
          ? "These details are keeping the closest quests from fitting."
          : "Based on your answers so far, no quest can fit this combination."}
      </p>
      <ul>
        {fit.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {fit.recoveries.length > 0 && (
        <p className="support">Only change a plan if it works for you.</p>
      )}
      {fit.recoveries.map((recovery) => (
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
        {fit.reasons.some((reason) => /boundary|boundaries/.test(reason)) && (
          <Link to="/account">Review my boundaries</Link>
        )}
      </div>
      <p className="fine-print">
        Your boundaries stay in place. Nothing changes until you choose it.
      </p>
    </section>
  );
}
