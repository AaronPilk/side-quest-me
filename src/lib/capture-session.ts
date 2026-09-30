import type { QuestVariant } from "../../shared/domain";

/** A recording clock counts filmed time, never the gaps between takes. */
export class TakeClock {
  private activeSince: number | null = null;
  readonly takes: number[] = [];

  resume(now: number) {
    if (this.activeSince === null) this.activeSince = now;
  }

  pause(now: number) {
    if (this.activeSince === null) return;
    this.takes.push(Math.max(0, now - this.activeSince) / 1000);
    this.activeSince = null;
  }

  seconds(now: number) {
    return (
      this.takes.reduce((total, take) => total + take, 0) +
      (this.activeSince === null
        ? 0
        : Math.max(0, now - this.activeSince) / 1000)
    );
  }
}

export function filmingGuide(quest: QuestVariant, slot: number) {
  const beat = quest.beats[slot];
  if (slot === 0)
    return {
      title: "Open with the hook",
      prompt: quest.hook,
      tip: "Show the setup right away. Keep your opening frame in mind for the ending; leave the outcome for the final part.",
      shot: beat.filming,
    };
  if (slot === 1)
    return {
      title: "Show the attempt",
      prompt: beat.action,
      tip: "Capture the action that makes this quest different. Stop between takes to leave out waiting time.",
      shot: beat.filming,
    };
  return {
    title: "Pay it off, then loop",
    prompt: beat.action,
    tip: `Show what actually happened. If it fits, finish on the same object, framing or movement as “${quest.beats[0].label}” so the replay returns naturally to your opening. Keep reactions real.`,
    shot: beat.filming,
  };
}
