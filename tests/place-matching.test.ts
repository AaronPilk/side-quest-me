import { describe, expect, it } from "vitest";
import { catalog } from "../shared/catalog";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type Outing,
  type QuestVariant,
} from "../shared/domain";
import {
  placeContextSchema,
  placeFitReason,
  type PlaceContext,
} from "../shared/place-matching";
import { recommend, ineligibilityReasons } from "../shared/recommend";

const context: PlaceContext = { placeId: "MOCK_PARK", category: "Park" };
const outing: Outing = {
  ...DEFAULT_OUTING,
  setting: "outside",
  applePlaceId: context.placeId,
};
const base = catalog.find(
  (q) => q.familyId === "activity_date_photo_duet" && q.intensity === "chill",
)!;
const quest = (
  familyId: string,
  patch: Partial<QuestVariant> = {},
): QuestVariant => ({
  ...base,
  id: `${familyId}_chill_v1`,
  familyId,
  durationMinutes: 30,
  minParticipants: 1,
  maxParticipants: 6,
  settings: ["home", "outside", "venue"],
  interests: [],
  conflicts: [],
  cost: {
    minMinor: 0,
    maxMinor: 0,
    currency: "USD",
    scope: "total",
    venueCostUnknown: false,
    note: "No purchase",
  },
  venuePermissionRequired: false,
  arrangementRequired: false,
  adultOnly: false,
  requiresVolunteer: false,
  ...patch,
});
const today = new Date("2026-09-30T12:00:00Z");

describe("structured place category matching", () => {
  it("ranks a relevant family before pagination without adding or modifying a quest", () => {
    const variants = [
      quest("aaa"),
      quest("aab"),
      quest("aac"),
      quest("activity_date_photo_duet"),
    ];
    const original = structuredClone(variants);
    const ordinary = recommend(
      outing,
      DEFAULT_PREFERENCES,
      [],
      today,
      variants,
    );
    expect(ordinary.map((q) => q.familyId)).not.toContain(
      "activity_date_photo_duet",
    );
    const grounded = recommend(
      outing,
      DEFAULT_PREFERENCES,
      [],
      today,
      variants,
      0,
      context,
    );
    expect(grounded[0].familyId).toBe("activity_date_photo_duet");
    expect(grounded[0].whyFits).toContain("Suggested for a park setting");
    expect(variants).toEqual(original);
    const pageTwo = recommend(
      outing,
      DEFAULT_PREFERENCES,
      [],
      today,
      variants,
      3,
      context,
    );
    expect(new Set([...grounded, ...pageTwo].map((q) => q.id)).size).toBe(4);
  });
  it.each([
    { intensity: "full_send" },
    { category: "daytime" },
    { minParticipants: 4 },
    { durationMinutes: 90 },
    { settings: ["home"] },
    {
      cost: {
        ...base.cost,
        minMinor: 1000,
        maxMinor: 2000,
        venueCostUnknown: false,
      },
    },
    { arrangementRequired: true },
    { adultOnly: true },
    { conflicts: ["strangers"] },
  ] satisfies Partial<QuestVariant>[])(
    "never overrides a hard requirement: %j",
    (patch) => {
      const blocked = quest("activity_date_photo_duet", patch);
      const preferences = {
        ...DEFAULT_PREFERENCES,
        exclusions: ["strangers" as const],
      };
      expect(
        ineligibilityReasons(blocked, outing, preferences).length,
      ).toBeGreaterThan(0);
      expect(
        recommend(outing, preferences, [], today, [blocked], 0, context),
      ).toEqual([]);
    },
  );
  it("does not waive a selected venue’s permission requirement", () => {
    const blocked = quest("activity_date_photo_duet", {
      venuePermissionRequired: true,
    });
    expect(
      recommend(
        { ...outing, setting: "venue" },
        DEFAULT_PREFERENCES,
        [],
        today,
        [blocked],
        0,
        context,
      ),
    ).toEqual([]);
  });
  it("does not invent location fit for unknown, mismatched or removed places", () => {
    const q = quest("activity_date_photo_duet");
    expect(placeFitReason(q, outing)).toBeNull();
    expect(
      placeFitReason(q, { ...outing, applePlaceId: "other" }, context),
    ).toBeNull();
    expect(
      placeFitReason(q, { ...outing, applePlaceId: null }, context),
    ).toBeNull();
    expect(
      placeFitReason(q, { ...outing, setting: "home" }, context),
    ).toBeNull();
    expect(placeFitReason(quest("unrelated"), outing, context)).toBeNull();
    expect(
      placeContextSchema.safeParse({
        ...context,
        category: "Museum café in a park",
      }).success,
    ).toBe(false);
    expect(
      placeContextSchema.safeParse({ ...context, name: "Park" }).success,
    ).toBe(false);
  });
});
