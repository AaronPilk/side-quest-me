import { describe, expect, it } from "vitest";
import { catalog } from "../shared/catalog";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type Outing,
  type Preferences,
  type QuestVariant,
} from "../shared/domain";
import { ineligibilityReasons, recommend } from "../shared/recommend";
import { assessViability } from "../shared/viability";

const outing = (patch: Partial<Outing> = {}): Outing => ({
  ...DEFAULT_OUTING,
  ...patch,
});
const prefs = (patch: Partial<Preferences> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...patch,
});
const all = Object.keys(DEFAULT_OUTING) as (keyof Outing)[];
const target = (patch: Partial<QuestVariant> = {}): QuestVariant => ({
  ...catalog.find((q) => q.id === "day_pitch_swap_bold_v1")!,
  ...patch,
});

describe("guided creation viability and explicit recovery", () => {
  it("covers the actual Daytime/Bold/couple/$25/one-hour/home/no-arrangements plan", () => {
    const plan = outing({
      category: "daytime",
      intensity: "bold",
      budgetMinor: 2500,
      durationMinutes: 60,
      arrangementConfirmed: false,
    });
    const choices = recommend(plan, prefs());
    expect(choices).toHaveLength(3);
    expect(ineligibilityReasons(target(), plan, prefs())).toEqual([]);
    expect(
      choices.every((q) => !q.arrangementRequired && q.minParticipants <= 2),
    ).toBe(true);
    expect(assessViability(plan, prefs(), all).viableCount).toBeGreaterThan(0);
  });

  it("ignores unconfirmed defaults, including group, time, budget, setting, and permissions", () => {
    const demanding = target({
      minParticipants: 5,
      maxParticipants: 5,
      durationMinutes: 120,
      settings: ["venue"],
      arrangementRequired: true,
      adultOnly: true,
      cost: { ...target().cost, minMinor: 7000, maxMinor: 7000 },
    });
    const untouched = outing({ category: "daytime", intensity: "bold" });
    expect(
      ineligibilityReasons(demanding, untouched, prefs()).length,
    ).toBeGreaterThan(3);
    expect(
      assessViability(
        untouched,
        prefs(),
        ["category", "intensity"],
        [demanding],
      ),
    ).toEqual({ viableCount: 1, reasons: [], recoveries: [] });
    expect(
      assessViability(
        untouched,
        prefs(),
        ["category", "intensity", "participants", "group"],
        [demanding],
      ).viableCount,
    ).toBe(0);
  });

  it("finds possible per-person budgets when the group has not been answered", () => {
    const paid = target({
      minParticipants: 2,
      maxParticipants: 6,
      cost: { ...target().cost, minMinor: 6000, maxMinor: 6000 },
    });
    const partial = outing({
      category: "daytime",
      intensity: "bold",
      budgetMinor: 1000,
      budgetScope: "per_person",
    });
    expect(
      assessViability(
        partial,
        prefs(),
        ["category", "intensity", "budgetMinor", "budgetScope"],
        [paid],
      ).viableCount,
    ).toBe(1);
    expect(assessViability(partial, prefs(), all, [paid]).viableCount).toBe(0);
  });

  it("uses the actual eligibility explanation and offers only a changed, explicit patch", () => {
    const plan = outing({
      category: "daytime",
      intensity: "bold",
      durationMinutes: 30,
      budgetMinor: 2500,
      area: "My neighborhood",
    });
    const before = structuredClone(plan);
    const result = assessViability(plan, prefs(), all, [target()]);
    expect(result.reasons).toEqual(
      ineligibilityReasons(target(), plan, prefs()),
    );
    expect(result.reasons.join(" ")).toContain("45 minutes");
    expect(result.reasons.join(" ")).not.toContain("private");
    expect(result.recoveries).toHaveLength(1);
    expect(result.recoveries[0].patch).toEqual({ durationMinutes: 45 });
    expect(result.recoveries[0].requiresConfirmation).toBe(false);
    expect(plan).toEqual(before);
    const applied = { ...plan, ...result.recoveries[0].patch };
    expect(applied.area).toBe(plan.area);
    expect(ineligibilityReasons(target(), applied, prefs())).toEqual([]);
    expect(
      assessViability(applied, prefs(), all, [target()]).recoveries,
    ).toEqual([]);
  });

  it("never automatically raises budget, changes people, or lowers energy", () => {
    const quest = target({
      minParticipants: 3,
      maxParticipants: 4,
      intensity: "chill",
      cost: { ...target().cost, minMinor: 1000, maxMinor: 1000 },
    });
    const plan = outing({
      category: "daytime",
      intensity: "bold",
      budgetMinor: 500,
    });
    const before = structuredClone(plan);
    const result = assessViability(plan, prefs(), all, [quest]);
    expect(plan).toEqual(before);
    expect(result.recoveries[0].patch).toEqual({
      intensity: "chill",
      group: "friends",
      participants: 3,
      budgetMinor: 1000,
    });
    expect(result.recoveries[0].label).toContain("Chill");
    expect(result.recoveries[0].label).toContain("3 people");
    expect(result.recoveries[0].label).toContain("$10 total");
    expect(
      ineligibilityReasons(
        quest,
        { ...plan, ...result.recoveries[0].patch },
        prefs(),
      ),
    ).toEqual([]);
  });

  it("never turns missing arrangements, eligibility, permission, or venue charges into facts", () => {
    const quest = target({
      settings: ["venue"],
      arrangementRequired: true,
      adultOnly: true,
    });
    const plan = outing({
      category: "daytime",
      intensity: "bold",
      setting: "venue",
      budgetMinor: 5000,
    });
    const result = assessViability(plan, prefs(), all, [quest]);
    expect(result.viableCount).toBe(0);
    expect(result.recoveries).toHaveLength(1);
    expect(result.recoveries[0].requiresConfirmation).toBe(true);
    expect(result.recoveries[0].patch).toEqual({});
    expect(result.recoveries[0].fields).toEqual(
      expect.arrayContaining([
        "arrangementConfirmed",
        "adultEligible",
        "venuePermission",
        "confirmedVenueCostMinor",
      ]),
    );
  });

  it("keeps firm and unknown custom boundaries enforced even before other answers", () => {
    const quest = target({ conflicts: ["being_surprised"] });
    for (const preferences of [
      prefs({ exclusions: ["being_surprised"] }),
      prefs({ otherExclusion: "No loud sound" }),
    ]) {
      const result = assessViability(outing(), preferences, [], [quest]);
      expect(result.viableCount).toBe(0);
      expect(result.recoveries).toEqual([]);
      expect(result.reasons.join(" ")).toMatch(/boundary/);
    }
    const plan = outing({
      category: "daytime",
      intensity: "bold",
      durationMinutes: 30,
    });
    const safe = target();
    const result = assessViability(
      plan,
      prefs({ exclusions: ["being_surprised"] }),
      all,
      [quest, safe],
    );
    for (const action of result.recoveries) {
      expect(action.questId).toBe(safe.id);
      expect(
        ineligibilityReasons(
          safe,
          { ...plan, ...action.patch },
          prefs({ exclusions: ["being_surprised"] }),
        ),
      ).toEqual([]);
    }
  });

  it("evaluates context-sensitive boundaries across unknown settings without assuming home", () => {
    const quest = target({
      conflicts: ["public_performance"],
      settings: ["home", "venue"],
    });
    expect(
      assessViability(
        outing(),
        prefs({ exclusions: ["public_performance"] }),
        [],
        [quest],
      ).viableCount,
    ).toBe(1);
    expect(
      assessViability(
        outing({ setting: "venue" }),
        prefs({ exclusions: ["public_performance"] }),
        ["setting"],
        [quest],
      ).viableCount,
    ).toBe(0);
  });

  it("preserves sufficient budget and time when a setting recovery removes venue and travel costs", () => {
    const quest = catalog.find((q) => q.id === "night_pocket_radio_bold_v1")!;
    const plan = outing({
      category: "late_night",
      intensity: "bold",
      setting: "venue",
      durationMinutes: 60,
      travelMinutes: 60,
      travelCostMinor: 500,
      transport: "car",
      budgetMinor: 1000,
      confirmedVenueCostMinor: 2000,
      venuePermission: true,
      adultEligible: true,
      applePlaceId: "I123",
    });
    const original = structuredClone(plan);
    const result = assessViability(
      plan,
      prefs(),
      Object.keys(plan) as (keyof Outing)[],
      [quest],
    );
    expect(result.recoveries).toHaveLength(1);
    expect(result.recoveries[0].requiresConfirmation).toBe(false);
    const patch = result.recoveries[0].patch;
    expect(patch).toMatchObject({
      setting: "home",
      applePlaceId: null,
      adultEligible: false,
      venuePermission: false,
      confirmedVenueCostMinor: null,
      transport: "none",
      travelMinutes: 0,
      travelCostMinor: 0,
    });
    expect(patch).not.toHaveProperty("budgetMinor");
    expect(patch).not.toHaveProperty("durationMinutes");
    expect(result.recoveries[0].label).toBe("Try at home");
    const applied = { ...plan, ...patch };
    expect(applied.budgetMinor).toBe(1000);
    expect(applied.durationMinutes).toBe(60);
    expect(ineligibilityReasons(quest, applied, prefs())).toEqual([]);
    expect(plan).toEqual(original);
  });

  it("agrees exactly with final hard filters when every input is confirmed", () => {
    for (const category of [
      "daytime",
      "date_night",
      "late_night",
      "demon",
      "street_challenges",
    ] as const)
      for (const intensity of ["chill", "bold", "full_send"] as const)
        for (const setting of ["home", "outside", "venue"] as const) {
          const plan = outing({
            category,
            intensity,
            setting,
            budgetMinor: 2500,
            durationMinutes: 60,
          });
          const result = assessViability(plan, prefs(), all);
          expect(result.viableCount).toBe(
            catalog.filter(
              (q) => ineligibilityReasons(q, plan, prefs()).length === 0,
            ).length,
          );
          expect(result.recoveries.length).toBeLessThanOrEqual(3);
          for (const recovery of result.recoveries) {
            if (recovery.requiresConfirmation)
              expect(recovery.patch).toEqual({});
            else {
              const quest = catalog.find((q) => q.id === recovery.questId)!;
              expect(
                ineligibilityReasons(
                  quest,
                  { ...plan, ...recovery.patch },
                  prefs(),
                ),
              ).toEqual([]);
              for (const field of Object.keys(
                recovery.patch,
              ) as (keyof Outing)[])
                expect(recovery.patch[field]).not.toEqual(plan[field]);
            }
          }
        }
  });
});
