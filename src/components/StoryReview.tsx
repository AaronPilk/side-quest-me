import { ArrowUpRight, Clapperboard } from "lucide-react";
import type { Run } from "../lib/types";
import { storyReview } from "../lib/story-review";
import "./story-review.css";

export default function StoryReview({
  run,
  onEdit,
}: {
  run: Run;
  onEdit: (slot: number) => void;
}) {
  const review = storyReview(run.quest, run.clips);
  return (
    <details className="story-review">
      <summary>
        <Clapperboard size={21} aria-hidden="true" />
        <span>
          <strong>Shape your story</strong>
          <small>
            {review.saved} of 3 parts saved · {review.seconds.toFixed(1)}s
            selected
          </small>
        </span>
      </summary>
      <p className="support">
        A guided edit check using your saved clips and quest plan. Watch the
        footage yourself; this does not analyze what’s in the video.
      </p>
      <ol className="story-review-parts">
        {review.parts.map(({ slot, clip, seconds, guide, notes }) => (
          <li key={slot}>
            <div className="section-heading">
              <h3>{guide.title}</h3>
              <span className="support">
                {clip ? `${seconds.toFixed(1)}s` : "Not saved"}
              </span>
            </div>
            <p>{guide.prompt}</p>
            <ul>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            {slot === 2 && <p className="support">{guide.tip}</p>}
            <button className="text-button" onClick={() => onEdit(slot)}>
              {clip ? "Review" : "Add"}{" "}
              {slot === 0 ? "opening" : slot === 1 ? "attempt" : "ending"}
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <p className="fine-print">
        Keep the experience honest. A loop is optional; a real ending matters
        more than forcing one. These checks do not predict views or affect
        rewards.
      </p>
    </details>
  );
}
