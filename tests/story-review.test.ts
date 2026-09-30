import { describe, expect, it } from "vitest";
import { catalog } from "../shared/catalog";
import { storyReview } from "../src/lib/story-review";
import type { Clip } from "../src/lib/types";

const clip = (slot: number, changes: Partial<Clip> = {}): Clip => ({
  id: `clip-${slot}`,
  generation: 1,
  slot,
  duration: 30,
  start: 0,
  end: 7,
  mime: "video/mp4",
  previewUrl: "/private.mp4",
  fit: "fit",
  crop: 0.5,
  mute: false,
  caption: "A chosen story label",
  ...changes,
});

describe("honest story review", () => {
  it("uses the actual quest hook, action and ending without claiming to inspect footage", () => {
    for (const quest of catalog) {
      const review = storyReview(quest, []);
      expect(review.saved).toBe(0);
      expect(review.seconds).toBe(0);
      expect(review.parts.map((part) => part.guide.prompt)).toEqual([
        quest.hook,
        quest.beats[1].action,
        quest.beats[2].action,
      ]);
      expect(
        review.parts.every(
          (part) => !part.clip && part.notes[0].includes("no saved clip"),
        ),
      ).toBe(true);
      expect(review.parts[2].guide.tip).toContain(quest.beats[0].label);
    }
  });

  it("calculates selected edit length, not full source duration or the number of duplicate slots", () => {
    const review = storyReview(catalog[0], [
      clip(0, { start: 12, end: 19 }),
      clip(2),
      clip(2),
    ]);
    expect(review.saved).toBe(2);
    expect(review.seconds).toBe(14);
    expect(review.parts[1].clip).toBeUndefined();
  });

  it("bases actionable review notes only on actual duration, mute, framing and caption metadata", () => {
    const review = storyReview(catalog[0], [
      clip(0, { end: 12, caption: "  ", mute: true, fit: "fill" }),
    ]);
    expect(review.parts[0].notes.join(" ")).toContain("12.0 seconds");
    expect(review.parts[0].notes.join(" ")).toContain("No story label");
    expect(review.parts[0].notes.join(" ")).toContain("muted");
    expect(review.parts[0].notes.join(" ")).toContain("Portrait crop");
    const short = storyReview(catalog[0], [clip(0)]);
    expect(short.parts[0].notes).toEqual([
      "Play the opening. Does the first moment make the challenge clear?",
    ]);
  });
});
