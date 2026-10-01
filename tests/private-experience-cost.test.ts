import { describe, expect, it } from "vitest";
import { catalog } from "../shared/catalog";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type Outing,
  type QuestVariant,
} from "../shared/domain";
import { estimateCost, ineligibilityIssues } from "../shared/recommend";
import { discoveryEligibility } from "../shared/experience-discovery";
const quest: QuestVariant = {
  ...catalog[0],
  id: "private_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  familyId: "private_date_night_adrenaline",
  privateGenerated: true,
  award: { xp: 0, points: 0 },
  settings: ["outside"],
  allowedGroups: ["friends"],
  minParticipants: 5,
  maxParticipants: 5,
  arrangementRequired: true,
  venuePermissionRequired: false,
  adultOnly: false,
  requiresVolunteer: false,
  conflicts: [],
  cost: {
    minMinor: 0,
    maxMinor: 0,
    scope: "per_person",
    currency: "USD",
    venueCostUnknown: true,
    note: "Confirm the whole group's rental and equipment charge.",
  },
};
const plan: Outing = {
  ...DEFAULT_OUTING,
  category: quest.category,
  intensity: quest.intensity,
  group: "friends",
  participants: 5,
  setting: "outside",
  budgetMinor: 2000,
  budgetScope: "per_person",
  durationMinutes: null,
  travelCostMinor: 500,
  arrangementConfirmed: true,
};
describe("confirmed generated experience charges in the actual setting", () => {
  it("keeps an outdoor operator's price pending at discovery and blocks acceptance without a quote", () => {
    expect(estimateCost(quest, plan)).toEqual({
      minMinor: 500,
      maxMinor: 500,
      known: false,
    });
    expect(
      discoveryEligibility(quest, plan, DEFAULT_PREFERENCES),
    ).toMatchObject({ blocking: [], requirements: [{ code: "venue_cost" }] });
    expect(
      ineligibilityIssues(quest, plan, DEFAULT_PREFERENCES).map(
        ({ code }) => code,
      ),
    ).toContain("venue_cost");
  });
  it("counts the complete group charge once plus travel against a per-person budget", () => {
    const confirmed = { ...plan, confirmedVenueCostMinor: 9500 };
    expect(estimateCost(quest, confirmed)).toEqual({
      minMinor: 10000,
      maxMinor: 10000,
      known: true,
    });
    expect(ineligibilityIssues(quest, confirmed, DEFAULT_PREFERENCES)).toEqual(
      [],
    );
    expect(
      ineligibilityIssues(
        quest,
        { ...confirmed, confirmedVenueCostMinor: 9501 },
        DEFAULT_PREFERENCES,
      ).map(({ code }) => code),
    ).toContain("budget");
  });
  it("accepts an explicitly confirmed free charge, but never treats missing confirmation as zero", () => {
    expect(
      estimateCost(quest, { ...plan, confirmedVenueCostMinor: 0 }),
    ).toEqual({ minMinor: 500, maxMinor: 500, known: true });
    expect(estimateCost(quest, plan).known).toBe(false);
  });
  it("enforces explicit operator permission for generated outdoor quests without changing public catalog rules", () => {
    const needsPermission = { ...quest, venuePermissionRequired: true };
    const confirmedCost = { ...plan, confirmedVenueCostMinor: 9500 };
    expect(
      discoveryEligibility(needsPermission, confirmedCost, DEFAULT_PREFERENCES),
    ).toMatchObject({
      blocking: [],
      requirements: [{ code: "venue_permission" }],
    });
    expect(
      ineligibilityIssues(
        needsPermission,
        confirmedCost,
        DEFAULT_PREFERENCES,
      ).map(({ code }) => code),
    ).toContain("venue_permission");
    expect(
      ineligibilityIssues(
        needsPermission,
        { ...confirmedCost, venuePermission: true },
        DEFAULT_PREFERENCES,
      ),
    ).toEqual([]);
    expect(
      ineligibilityIssues(
        { ...needsPermission, privateGenerated: undefined },
        confirmedCost,
        DEFAULT_PREFERENCES,
      ),
    ).toEqual([]);
  });
  it("preserves free outdoor and existing public catalog cost behavior", () => {
    const free = { ...quest, cost: { ...quest.cost, venueCostUnknown: false } };
    expect(
      estimateCost(free, { ...plan, confirmedVenueCostMinor: 10000 }),
    ).toEqual({ minMinor: 500, maxMinor: 500, known: true });
    const publicQuest = {
      ...quest,
      id: "public_fixture_v1",
      privateGenerated: undefined,
    };
    expect(estimateCost(publicQuest, plan)).toEqual({
      minMinor: 500,
      maxMinor: 500,
      known: true,
    });
    expect(estimateCost(publicQuest, { ...plan, setting: "venue" })).toEqual({
      minMinor: 500,
      maxMinor: 500,
      known: false,
    });
  });
});
