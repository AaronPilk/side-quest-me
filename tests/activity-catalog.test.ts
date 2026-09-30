import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  activityCatalog,
  activityRecipes,
  historicalActivityCatalog,
} from "../shared/activity-recipes";
import { catalog } from "../shared/catalog";
import {
  CATEGORIES,
  INTENSITIES,
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  candidateSchema,
  type Outing,
  type Preferences,
} from "../shared/domain";
import { ineligibilityReasons, recommend } from "../shared/recommend";
import { assessViability } from "../shared/viability";

const now = new Date("2026-09-30T12:00:00Z");
const plan = (patch: Partial<Outing> = {}): Outing => ({
  ...DEFAULT_OUTING,
  ...patch,
});
const profile = (patch: Partial<Preferences> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...patch,
});
const rows = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => line.startsWith("('"))
    .map((line) => line.replace(/,$/, ""));

describe("authored activity expansion", () => {
  it("contains 60 recipes, 360 distinct briefs, and 1080 complete intensity variants", () => {
    expect(activityRecipes).toHaveLength(60);
    expect(new Set(activityRecipes.map((recipe) => recipe.id)).size).toBe(60);
    expect(activityCatalog).toHaveLength(1080);
    expect(new Set(activityCatalog.map((quest) => quest.title)).size).toBe(360);
    for (const recipe of activityRecipes) {
      const variants = activityCatalog.filter(
        (quest) => quest.familyId === `activity_${recipe.id}`,
      );
      expect(variants).toHaveLength(18);
      expect(new Set(variants.map((quest) => quest.hook)).size).toBe(6);
      for (const quest of variants) {
        expect(quest.arrangementRequired).toBe(false);
        expect(quest.title.length).toBeLessThanOrEqual(96);
        expect(quest.cost.maxMinor).toBe(0);
        expect(quest.title).toMatch(new RegExp(`^${recipe.title}`));
        expect(quest.beats[1].action).toContain(recipe.action);
        expect(quest.hook).not.toContain(
          "make the ordinary worth a second look",
        );
        expect(quest.beats.every((beat) => beat.filming.length > 40)).toBe(
          true,
        );
      }
    }
  });

  it("preserves all historical published rows and uses an additive, repeatable migration", () => {
    const seed = readFileSync(
      new URL("../supabase/seed.sql", import.meta.url),
      "utf8",
    );
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20260930160717_expanded_activity_catalog.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const revision = readFileSync(
      new URL(
        "../supabase/migrations/20260930203052_activity_instructions_v2.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(rows(seed)).toHaveLength(2193);
    expect(
      createHash("sha256")
        .update(rows(seed).slice(0, 33).join("\n"))
        .digest("hex"),
    ).toBe("cb0c72d793d313f7915e3f49367372c1ef59fdcdd3d1aab1bb8257f7c86e726b");
    expect(rows(migration)).toEqual(rows(seed).slice(33, 1113));
    expect(rows(revision)).toEqual(rows(seed).slice(1113));
    expect(revision).toContain("set published=false");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).not.toMatch(
      /\b(?:update|delete)\s+(?:public\.)?quest_templates/i,
    );
  });

  it("keeps accepted v1 content frozen while the current date has a real three-stop route", () => {
    const old = historicalActivityCatalog.find(
      (quest) => quest.id === "activity_date_memory_map_alpha_full_send_v1",
    )!;
    const current = activityCatalog.find(
      (quest) => quest.id === "activity_date_memory_map_alpha_full_send_v2",
    )!;
    expect(old.title).toBe("The first time you laughed together");
    expect(current.familyId).toBe(old.familyId);
    expect(current.title).toContain("The Three-Stop Date");
    expect(current.settings).toEqual(["outside"]);
    expect(current.beats[1].action).toContain("Each partner picks one stop");
    expect(current.beats[1].action).toContain("first partner leads stop one");
    expect(current.beats[1].filming).toContain("At each stop");
    expect(current.beats[2].filming).toContain("favorite stop");
    expect(current.beats.map((beat) => beat.action).join(" ")).not.toContain(
      "shared memories",
    );
    expect(old.version).toBe(1);
    expect(old.beats[1].action).not.toContain("first partner leads stop one");
  });

  it("satisfies the reported Full Send, couple, outdoors plan without changing a single choice", () => {
    for (const budgetMinor of [0, 10000]) {
      for (const durationMinutes of [60, 180, 300, null]) {
        const outing = plan({
          intensity: "full_send",
          setting: "outside",
          budgetMinor,
          durationMinutes,
        });
        const before = structuredClone(outing);
        const choices = recommend(outing, profile(), [], now);
        expect(choices).toHaveLength(3);
        expect(outing).toEqual(before);
        for (const quest of choices) {
          expect(candidateSchema.safeParse(quest).success).toBe(true);
          expect(quest.category).toBe("date_night");
          expect(quest.intensity).toBe("full_send");
          expect(quest.minParticipants).toBeLessThanOrEqual(2);
          expect(quest.maxParticipants).toBeGreaterThanOrEqual(2);
          expect(quest.settings).toContain("outside");
          expect(quest.arrangementRequired).toBe(false);
          expect(quest.estimatedCostMaxMinor).toBe(0);
          expect(quest.selectedRole).toBeNull();
          expect(quest.whyFits.join(" ")).not.toMatch(
            /your (?:interest|skills|preference)|rotate roles/i,
          );
          expect(ineligibilityReasons(quest, outing, profile())).toEqual([]);
        }
        expect(
          assessViability(
            outing,
            profile(),
            Object.keys(outing) as (keyof Outing)[],
          ).recoveries,
        ).toEqual([]);
      }
    }
  });

  it("covers every scene and intensity outdoors for a couple at zero cost within an hour", () => {
    for (const { id: category } of CATEGORIES) {
      for (const { id: intensity } of INTENSITIES) {
        for (const participants of [2, 4, 6, 8]) {
          const outing = plan({
            category,
            intensity,
            setting: "outside",
            group: participants === 2 ? "couple" : "friends",
            participants,
          });
          const choices = recommend(outing, profile(), [], now);
          expect(
            choices.length,
            `${category}/${intensity}/${participants}`,
          ).toBe(3);
          expect(
            choices.every(
              (quest) =>
                ineligibilityReasons(quest, outing, profile()).length === 0,
            ),
          ).toBe(true);
        }
      }
    }
    for (const category of ["daytime", "late_night", "demon"] as const) {
      for (const { id: intensity } of INTENSITIES) {
        const choices = recommend(
          plan({ category, intensity, group: "solo", participants: 1 }),
          profile(),
          [],
          now,
        );
        expect(choices, `${category}/${intensity}/solo/home`).toHaveLength(3);
      }
    }
  });

  it("still enforces incompatible time, group, venue charges, and every firm exclusion", () => {
    expect(
      recommend(
        plan({ intensity: "full_send", durationMinutes: 15 }),
        profile(),
        [],
        now,
      ),
    ).toEqual([]);
    expect(
      recommend(plan({ group: "solo", participants: 1 }), profile(), [], now),
    ).toEqual([]);
    const freeVenue = plan({
      setting: "venue",
      confirmedVenueCostMinor: 1000,
      budgetMinor: 0,
    });
    expect(recommend(freeVenue, profile(), [], now)).toEqual([]);
    const outing = plan({
      category: "demon",
      intensity: "full_send",
      setting: "outside",
    });
    const prefs = profile({
      exclusions: [
        "public_performance",
        "physical_challenges",
        "food_challenges",
        "strangers",
        "being_surprised",
        "alcohol",
        "adult_venues",
        "travel_outside_area",
      ],
    });
    const choices = recommend(outing, prefs, [], now);
    expect(choices).toHaveLength(3);
    expect(choices.every((quest) => quest.conflicts.length === 0)).toBe(true);
    expect(choices.every((quest) => !quest.requiresVolunteer)).toBe(true);
    const performance = activityCatalog.find(
      (quest) =>
        quest.familyId === "activity_demon_object_debate" &&
        quest.intensity === "full_send",
    )!;
    expect(ineligibilityReasons(performance, outing, prefs)).toContain(
      "This quest conflicts with a boundary in your profile.",
    );
  });

  it("uses confirmed interests and skills to change actual matches with truthful explanations", () => {
    const outing = plan({ category: "late_night", intensity: "full_send" });
    const music = recommend(outing, profile({ interests: ["music"] }), [], now);
    const games = recommend(outing, profile({ skills: ["games"] }), [], now);
    expect(music[0].interests).toContain("music");
    expect(music[0].whyFits[0]).toBe("Matches your interest in music");
    expect(games[0].interests).toContain("games");
    expect(games[0].whyFits[0]).toBe("Can use your games skills");
    expect(music[0].familyId).not.toBe(games[0].familyId);
  });

  it("rotates task briefs deterministically while retaining one cooldown family", () => {
    const outing = plan({ intensity: "full_send", setting: "outside" });
    const family = activityCatalog.filter(
      (quest) => quest.familyId === "activity_date_photo_duet",
    );
    const first = recommend(outing, profile(), [], now, family);
    expect(recommend(outing, profile(), [], now, family)).toEqual(first);
    const ids = new Set(
      Array.from(
        { length: 14 },
        (_, offset) =>
          recommend(
            outing,
            profile(),
            [],
            new Date(now.getTime() + offset * 86400000),
            family,
          )[0].id,
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
    const attempted = recommend(
      outing,
      profile(),
      [{ familyId: first[0].familyId, awardedAt: now.toISOString() }],
      now,
      family,
    );
    expect(attempted[0].rewardEligibility).toEqual({
      eligible: false,
      reason: "family_cooldown",
    });
    expect(
      catalog
        .slice(0, 33)
        .some((quest) => quest.familyId.startsWith("activity_")),
    ).toBe(false);
  });
});
