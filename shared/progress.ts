/** Accepted completion outcomes; closed/rejected reviews are not achievements. */
export const COMPLETION_REASONS = ["eligible", "family_cooldown", "daily_cap"];
export const QUEST_MILESTONES = [
  { count: 1, name: "First Detour", crown: false },
  { count: 5, name: "Detour Regular", crown: true },
  { count: 25, name: "Quest Collector", crown: true },
  { count: 100, name: "Adventure Maker", crown: true },
] as const;

export function countsAsCompleted(run: {
  status: string;
  rewardDecision?: { reason: string };
}) {
  return (
    run.status === "finalized" &&
    COMPLETION_REASONS.includes(run.rewardDecision?.reason ?? "")
  );
}

export function questProgress(value: number) {
  const completed = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const earned =
    [...QUEST_MILESTONES].reverse().find((item) => completed >= item.count) ??
    null;
  const next = QUEST_MILESTONES.find((item) => completed < item.count) ?? null;
  return {
    completed,
    earned,
    next,
    remaining: next ? next.count - completed : 0,
    progress: next
      ? (completed - (earned?.count ?? 0)) / (next.count - (earned?.count ?? 0))
      : 1,
  };
}
