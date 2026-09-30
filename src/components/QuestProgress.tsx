import { Crown, Flag } from "lucide-react";
import { questProgress } from "../../shared/progress";
import "./quest-progress.css";

export function QuestProgress({
  completedQuestCount,
  xp,
  demo = false,
}: {
  completedQuestCount: number;
  xp: number;
  demo?: boolean;
}) {
  const rank = questProgress(completedQuestCount);
  return (
    <section className="quest-progress" aria-label="Your quest milestones">
      <div className="quest-progress-title">
        <span
          className={
            rank.earned?.crown
              ? "quest-progress-icon earned"
              : "quest-progress-icon"
          }
        >
          {rank.earned?.crown ? (
            <Crown size={25} aria-label="Earned milestone crown" />
          ) : (
            <Flag size={25} aria-hidden="true" />
          )}
        </span>
        <div>
          <span className="eyebrow">YOUR PERSONAL MILESTONE</span>
          <h2>{rank.earned?.name ?? "Your first detour awaits"}</h2>
        </div>
      </div>
      <div className="quest-progress-stats">
        <strong>
          {rank.completed.toLocaleString()} <small>quests completed</small>
        </strong>
        <strong>
          {xp.toLocaleString()} <small>lifetime XP</small>
        </strong>
      </div>
      {rank.next ? (
        <>
          <progress
            max={1}
            value={rank.progress}
            aria-label={`Progress to ${rank.next.name}`}
          />
          <p>
            {rank.remaining} more {rank.remaining === 1 ? "quest" : "quests"} to{" "}
            {rank.next.name}
            {rank.next.crown ? " and your next crown" : ""}.
          </p>
        </>
      ) : (
        <p>
          You’ve earned every current quest milestone. Your completed count
          keeps growing.
        </p>
      )}
      <small>
        {demo ? "Simulated demo progress. " : ""}Personal milestones celebrate
        completed quests. They aren’t a global ranking or extra reward currency.
      </small>
    </section>
  );
}
