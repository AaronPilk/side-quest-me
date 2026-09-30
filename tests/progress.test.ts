import { describe, expect, it } from "vitest";
import { countsAsCompleted, questProgress } from "../shared/progress";

describe("personal quest milestones", () => {
  it("does not invent a title or crown before an earned milestone", () => {
    expect(questProgress(0).earned).toBeNull();
    expect(questProgress(0).remaining).toBe(1);
    expect(questProgress(1).earned).toMatchObject({
      name: "First Detour",
      crown: false,
    });
    expect(questProgress(4).earned?.crown).toBe(false);
    expect(questProgress(5).earned).toMatchObject({
      name: "Detour Regular",
      crown: true,
    });
    expect(questProgress(5).remaining).toBe(20);
    expect(questProgress(25).earned?.name).toBe("Quest Collector");
    expect(questProgress(101).next).toBeNull();
  });
  it("counts honest completions with capped rewards but excludes pending, closed and rejected reviews", () => {
    for (const reason of ["eligible", "daily_cap", "family_cooldown"])
      expect(
        countsAsCompleted({ status: "finalized", rewardDecision: { reason } }),
      ).toBe(true);
    for (const reason of ["review_rejected", "review_closed", "unknown"])
      expect(
        countsAsCompleted({ status: "finalized", rewardDecision: { reason } }),
      ).toBe(false);
    expect(countsAsCompleted({ status: "review_needed" })).toBe(false);
    expect(countsAsCompleted({ status: "abandoned" })).toBe(false);
    expect(countsAsCompleted({ status: "finalized" })).toBe(false);
  });
});
