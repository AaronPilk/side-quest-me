import type { QuestVariant } from "../../shared/domain";
import type { Clip } from "./types";
import { filmingGuide } from "./capture-session";

/** Editorial prompts from saved edit metadata; never an assessment of unseen footage. */
export function storyReview(quest: QuestVariant, clips: Clip[]) {
  const parts = quest.beats.map((_, slot) => {
    const clip = clips.find((item) => item.slot === slot);
    const seconds = clip ? Math.max(0, clip.end - clip.start) : 0;
    const guide = filmingGuide(quest, slot);
    const notes: string[] = [];
    if (!clip) {
      notes.push("This part has no saved clip yet.");
    } else {
      if (slot === 0 && seconds > 8)
        notes.push(
          `Your opening runs ${seconds.toFixed(1)} seconds. Watch for waiting or explanation you can trim before the action.`,
        );
      if (!clip.caption.trim())
        notes.push(
          "No story label is set. Add context if the moment needs it.",
        );
      if (clip.mute)
        notes.push(
          "This part is muted. Check that the action makes sense without recorded audio.",
        );
      if (clip.fit === "fill")
        notes.push(
          "Portrait crop is selected. Check that faces and the important action stay in frame.",
        );
      if (!notes.length)
        notes.push(
          slot === 0
            ? "Play the opening. Does the first moment make the challenge clear?"
            : slot === 1
              ? "Play the attempt. Keep the moment that shows what you actually did."
              : "Play the ending. Show the real outcome, then see whether its final frame connects to the opening.",
        );
    }
    return { slot, clip, seconds, guide, notes };
  });
  return {
    parts,
    saved: parts.filter((part) => part.clip).length,
    seconds: parts.reduce((total, part) => total + part.seconds, 0),
  };
}
