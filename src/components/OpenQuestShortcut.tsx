import { Link } from "react-router-dom";
import { ArrowRight, Flag } from "lucide-react";
import type { Run } from "../lib/types";
import { api } from "../lib/api";
import { hasReadyVideo } from "../lib/recording-session";
import { useResource } from "./ui";
import "./open-quest-shortcut.css";

export function OpenQuestCard({ run }: { run: Run }) {
  return (
    <section className="open-quest-card" aria-label="Your open quest">
      <span className="open-quest-icon" aria-hidden="true">
        <Flag size={20} />
      </span>
      <div className="open-quest-copy">
        <span className="eyebrow">YOUR OPEN QUEST</span>
        <h2>{run.quest.title}</h2>
        <p>
          {hasReadyVideo(run.clips)
            ? "Your video is saved. Review it and finish your quest."
            : "Pick up where you left off. Your quest is waiting."}
        </p>
      </div>
      <Link className="button" to={`/runs/${run.id}`}>
        Resume quest <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </section>
  );
}

export function OpenQuestShortcut() {
  const { data, error, refresh } = useResource(api.runs);
  const run = data?.find((item) =>
    ["accepted", "in_progress"].includes(item.status),
  );
  if (run) return <OpenQuestCard run={run} />;
  if (!error) return null;
  return (
    <section className="open-quest-recovery" aria-label="Your open quests">
      <p role="alert">Could not check your open quest.</p>
      <div>
        <button className="button secondary" type="button" onClick={refresh}>
          Retry open quest
        </button>
        <Link className="button secondary" to="/journal?filter=progress">
          My open quests
        </Link>
      </div>
    </section>
  );
}
