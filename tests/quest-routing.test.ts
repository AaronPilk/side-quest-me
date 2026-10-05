import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type Outing,
  type Preferences,
} from "../shared/domain";
import { buildQuestRoutingBrief } from "../shared/quest-routing";

function confirmed(patch: Partial<Preferences>): Preferences {
  return {
    ...DEFAULT_PREFERENCES,
    ageBand: "21_plus",
    ...patch,
    sources: Object.fromEntries(
      ["ageBand", ...Object.keys(patch)].map((key) => [key, "survey"]),
    ),
  };
}

const fullSendFriends: Outing = {
  ...DEFAULT_OUTING,
  category: "late_night",
  intensity: "full_send",
  group: "friends",
  participants: 5,
  setting: "venue",
  budgetMinor: 5_000,
  budgetScope: "per_person",
  durationMinutes: 240,
  adultEligible: true,
  adultContext: true,
  venuePermission: true,
  confirmedVenueCostMinor: 0,
};
const adultPreferences = confirmed({});

describe("quest audience and experience routing", () => {
  it.each([null, "under_18"] as const)(
    "keeps age %s out of adult discovery even when outing flags claim eligibility",
    (ageBand) => {
      const brief = buildQuestRoutingBrief(
        confirmed({ ageBand }),
        fullSendFriends,
      );
      expect(brief.adultContext.ageEligible).toBe(false);
      expect(brief.adultContext.nightlifeSuggestionAllowed).toBe(false);
      expect(brief.adultContext.alcoholSuggestionAllowed).toBe(false);
      expect(brief.boundaries.alcohol).not.toBe("permitted_for_21_plus_outing");
      expect(brief.adultContext.blockers).toContain(
        ageBand === "under_18" ? "under_adult_age" : "age_not_confirmed",
      );
    },
  );

  it("keeps an unsourced age private value from unlocking adult suggestions", () => {
    const brief = buildQuestRoutingBrief(
      { ...DEFAULT_PREFERENCES, ageBand: "21_plus" },
      fullSendFriends,
    );
    expect(brief.adultContext.participantAgeBand).toBeNull();
    expect(brief.adultContext.nightlifeSuggestionAllowed).toBe(false);
  });

  it("allows pending nightlife discovery for adults without presuming drinking eligibility", () => {
    const outing = { ...fullSendFriends, venuePermission: false };
    const youngerAdult = buildQuestRoutingBrief(
      confirmed({ ageBand: "18_20" }),
      outing,
    );
    expect(youngerAdult.adultContext.nightlifeSuggestionAllowed).toBe(true);
    expect(youngerAdult.adultContext.nightlifeRouteAllowed).toBe(false);
    expect(youngerAdult.adultContext.alcoholSuggestionAllowed).toBe(false);
    expect(youngerAdult.boundaries.alcohol).not.toBe(
      "permitted_for_21_plus_outing",
    );
    const adult = buildQuestRoutingBrief(adultPreferences, outing);
    expect(adult.adultContext.alcoholSuggestionAllowed).toBe(true);
    expect(adult.boundaries.alcohol).toBe("permitted_for_21_plus_outing");
    expect(adult.experience.preferredDomains[0]).toBe("adult_nightlife");
    expect(adult.adultContext.nightlifeRouteAllowed).toBe(false);
    const excludesAlcohol = buildQuestRoutingBrief(
      confirmed({ exclusions: ["alcohol"] }),
      outing,
    );
    expect(excludesAlcohol.adultContext.alcoholSuggestionAllowed).toBe(false);
    expect(excludesAlcohol.boundaries.alcohol).toBe("excluded");
  });

  it("keeps Down for Anything open-ended and distinct from the selected intensity", () => {
    const demon = buildQuestRoutingBrief(adultPreferences, {
      ...fullSendFriends,
      category: "demon",
    });
    const date = buildQuestRoutingBrief(adultPreferences, {
      ...fullSendFriends,
      category: "date_night",
      group: "couple",
      participants: 2,
    });
    expect(demon.experience.categoryDirection).toContain("open invitation");
    expect(demon.experience.challengeDesign.stakes).toContain("capped");
    expect(demon.experience.challengeDesign.stakes).toContain("optional");
    expect(demon.experience.direction).toContain("never a required formula");
    expect(demon.experience.challengeDesign.objective).toContain(
      "does not need to become a challenge or competition",
    );
    expect(date.experience.categoryDirection).toContain(
      "not automatically quiet",
    );
    expect(demon.experience.categoryDirection).not.toEqual(
      date.experience.categoryDirection,
    );
    expect(demon.boundaries.paidGambling).toBe(false);
    expect(demon.experience.intensity).toBe("full_send");
  });

  it("separates five-person Full Send adult nightlife from a Chill couple", () => {
    const preferences = confirmed({
      humor: ["competitive", "absurd"],
      interests: ["games", "sports"],
    });
    const friends = buildQuestRoutingBrief(preferences, fullSendFriends);
    const couple = buildQuestRoutingBrief(preferences, DEFAULT_OUTING);
    expect(friends.audience).toEqual({
      group: "friends",
      participants: 5,
      context: "adult_nightlife",
      energy: "rowdy",
    });
    expect(friends.experience.preferredDomains).toEqual(
      expect.arrayContaining([
        "competition",
        "adult_nightlife",
        "absurd_comedy",
      ]),
    );
    expect(friends.experience.domainsRequiringActivityOptIn).toEqual([
      "legitimate_adrenaline",
    ]);
    expect(couple.audience).toEqual({
      group: "couple",
      participants: 2,
      context: "general",
      energy: "easygoing",
    });
    expect(couple.experience.preferredDomains).not.toContain("adult_nightlife");
    expect(couple.experience.domainsRequiringActivityOptIn).toEqual([]);
    expect(friends.boundaries.requiredIntoxication).toBe(false);
    expect(friends.boundaries.drinkingBeforeHazardousActivities).toBe(false);
  });

  it("makes the current outing authoritative over usual profile answers", () => {
    const brief = buildQuestRoutingBrief(
      confirmed({ usualIntensity: "chill", categories: ["late_night"] }),
      { ...DEFAULT_OUTING, intensity: "full_send" },
    );
    expect(brief.confirmedPreferences.usualIntensity).toBe("chill");
    expect(brief.currentOuting.category).toBe("date_night");
    expect(brief.experience.intensity).toBe("full_send");
    expect(brief.audience.energy).toBe("adventurous");
    expect(brief.experience.direction).toContain("go all in");
    expect(brief.direction.join(" ")).toContain(
      "A couple or date can be adventurous",
    );
  });

  it("prioritizes an eligible nightlife outing over usual interests without a genre allowlist", () => {
    const brief = buildQuestRoutingBrief(
      confirmed({
        interests: ["sports", "games"],
        usualIntensity: "chill",
        categories: ["daytime"],
      }),
      { ...fullSendFriends, category: "demon", venuePermission: false },
    );
    expect(brief.experience.preferredDomains[0]).toBe("adult_nightlife");
    expect(brief.experience.preferredDomains).toContain("competition");
    expect(brief.experience.intensity).toBe("full_send");
    expect(brief.direction.join(" ")).toContain("not an allowlist");
    expect(brief.adultContext.nightlifeSuggestionAllowed).toBe(true);
    expect(brief.adultContext.nightlifeRouteAllowed).toBe(false);
    expect(brief.adultContext.alcoholSuggestionAllowed).toBe(true);
    expect(brief.boundaries.alcohol).toBe("permitted_for_21_plus_outing");
    expect(brief.adultContext.blockers).toEqual([
      "venue_permission_not_confirmed",
    ]);
  });

  it("uses confirmed creative signals without treating skills as a tame default", () => {
    const preferences = confirmed({
      premises: ["spontaneous", "secret_expert", "open_mic"],
      humor: ["elaborate_setups", "surprises"],
      interests: ["local_knowledge"],
      skills: ["music"],
      role: "mastermind",
      preparation: "start_now",
      approach: "invitation",
    });
    const brief = buildQuestRoutingBrief(preferences, fullSendFriends);
    expect(brief.experience.preferredDomains).toEqual(
      expect.arrayContaining([
        "spontaneous_adventure",
        "skill_reveal",
        "public_performance",
        "elaborate_setup",
        "surprise",
        "local_exploration",
        "music",
      ]),
    );
    expect(brief.confirmedPreferences).toMatchObject({
      role: "mastermind",
      preparation: "start_now",
      approach: "invitation",
    });
    expect(brief.boundaries.participation).toBe("invitation");
    expect(brief.direction.join(" ")).toContain("Skills are resources");
  });

  it("gives exclusions priority over conflicting interests and adult opt-in", () => {
    const brief = buildQuestRoutingBrief(
      confirmed({
        interests: ["sports", "cooking", "games"],
        premises: ["open_mic", "meal_challenge"],
        humor: ["surprises"],
        approach: "invitation",
        exclusions: [
          "physical_challenges",
          "food_challenges",
          "public_performance",
          "being_surprised",
          "adult_venues",
          "strangers",
          "alcohol",
        ],
      }),
      fullSendFriends,
    );
    expect(brief.experience.preferredDomains).toEqual(["competition", "food"]);
    expect(brief.experience.domainsRequiringActivityOptIn).toEqual([]);
    expect(brief.adultContext.nightlifeRouteAllowed).toBe(false);
    expect(brief.resources.blockers).toContain("adult_venues_excluded");
    expect(brief.boundaries.participation).toBe("within_group");
    expect(brief.boundaries.alcohol).toBe("excluded");
    expect(brief.experience.intensity).toBe("full_send");
  });

  it("preserves ordinary cooking while excluding food challenge mechanics", () => {
    const brief = buildQuestRoutingBrief(
      confirmed({
        interests: ["cooking"],
        premises: ["meal_challenge"],
        exclusions: ["food_challenges"],
      }),
      fullSendFriends,
    );
    expect(brief.experience.preferredDomains).toContain("food");
    expect(brief.experience.preferredDomains).not.toContain("food_challenge");
    expect(brief.experience.excludedDomains).toContain("food_challenge");
    expect(brief.experience.excludedDomains).not.toContain("food");
    expect(brief.boundaries.exclusions).toContain("food_challenges");
  });

  it.each(["mastermind", "camera_person"] as const)(
    "lets a confirmed %s participate without being the surprise target",
    (role) => {
      const brief = buildQuestRoutingBrief(
        confirmed({
          humor: ["surprises"],
          role,
          exclusions: ["being_surprised"],
        }),
        fullSendFriends,
      );
      expect(brief.experience.preferredDomains).toContain("surprise");
      expect(brief.experience.excludedDomains).toEqual(["surprise_target"]);
      expect(brief.boundaries.surpriseTargetExcluded).toBe(true);
      expect(brief.boundaries.confirmedNonTargetSurpriseRole).toBe(role);
      expect(brief.boundaries.exclusions).toContain("being_surprised");
    },
  );

  it.each(["unconfirmed", "legacy", "main_character", "rotate"] as const)(
    "does not invent a non-target surprise role from %s preferences",
    (source) => {
      const preferences = confirmed({
        humor: ["surprises"],
        role:
          source === "main_character" || source === "rotate"
            ? source
            : "mastermind",
        exclusions: ["being_surprised"],
      });
      if (source === "unconfirmed") delete preferences.sources.role;
      if (source === "legacy") preferences.legacyUnconfirmed = ["role"];
      const brief = buildQuestRoutingBrief(preferences, fullSendFriends);
      expect(brief.experience.preferredDomains).not.toContain("surprise");
      expect(brief.experience.excludedDomains).toEqual(["surprise_target"]);
      expect(brief.boundaries.surpriseTargetExcluded).toBe(true);
      expect(brief.boundaries.confirmedNonTargetSurpriseRole).toBeNull();
    },
  );

  it("does not turn legacy, unconfirmed or unknown positive answers into permissions", () => {
    const brief = buildQuestRoutingBrief(
      {
        ...DEFAULT_PREFERENCES,
        premises: ["open_mic"],
        interests: ["sports"],
        approach: "invitation",
        role: "main_character",
        exclusions: ["physical_challenges"],
        sources: { interests: "survey", approach: "survey" },
        legacyUnconfirmed: ["interests", "approach"],
      },
      { ...fullSendFriends, adultContext: false, adultEligible: false },
    );
    expect(brief.confirmedPreferences).toEqual({});
    expect(brief.experience.preferredDomains).toEqual([]);
    expect(brief.experience.domainsRequiringActivityOptIn).toEqual([]);
    expect(brief.boundaries.participation).toBe(
      "no_assumed_stranger_participation",
    );
    expect(brief.boundaries.exclusions).toEqual(["physical_challenges"]);
    expect(brief.adultContext.nightlifeRouteAllowed).toBe(false);
  });

  it.each([
    ["no explicit opt-in", { adultContext: false }],
    ["no self-confirmation", { adultEligible: false }],
    ["not a venue", { setting: "outside" as const }],
    ["an at-home setting", { setting: "home" as const }],
  ])("keeps adult nightlife gated with %s", (_label, patch) => {
    const brief = buildQuestRoutingBrief(adultPreferences, {
      ...fullSendFriends,
      ...patch,
    });
    expect(brief.adultContext.nightlifeRouteAllowed).toBe(false);
    expect(brief.adultContext.alcoholSuggestionAllowed).toBe(false);
    expect(brief.boundaries.alcohol).not.toBe("permitted_for_21_plus_outing");
    expect(brief.audience.context).toBe("general");
    expect(brief.experience.preferredDomains).not.toContain("adult_nightlife");
    expect(brief.adultContext.ageVerified).toBe(false);
    expect(brief.adultContext.legalDrinkingAgeVerified).toBe(false);
  });

  it("records eligible adult context as self-confirmation, never age or drinking verification", () => {
    const brief = buildQuestRoutingBrief(adultPreferences, fullSendFriends);
    expect(brief.adultContext).toMatchObject({
      requested: true,
      venueMinimumSelfConfirmed: true,
      nightlifeRouteAllowed: true,
      ageVerified: false,
      legalDrinkingAgeVerified: false,
    });
    expect(brief.adultContext.alcoholSuggestionAllowed).toBe(true);
    expect(brief.boundaries.alcohol).toBe("permitted_for_21_plus_outing");
    expect(brief.boundaries.requiredIntoxication).toBe(false);
    expect(brief.boundaries.drinkingBeforeHazardousActivities).toBe(false);
  });

  it("reserves group travel and confirmed venue costs and subtracts travel time", () => {
    const brief = buildQuestRoutingBrief(adultPreferences, {
      ...fullSendFriends,
      budgetMinor: 2_000,
      travelCostMinor: 1_500,
      confirmedVenueCostMinor: 2_500,
      durationMinutes: 180,
      travelMinutes: 40,
    });
    expect(brief.resources).toMatchObject({
      totalBudgetMinor: 10_000,
      travelCostMinor: 1_500,
      confirmedVenueCostMinor: 2_500,
      remainingActivityBudgetMinor: 6_000,
      remainingActivityMinutes: 140,
      venueCostStatus: "confirmed",
      blockers: [],
    });
  });

  it("keeps unlimited time null and unconfirmed venue charges unknown", () => {
    const brief = buildQuestRoutingBrief(adultPreferences, {
      ...fullSendFriends,
      durationMinutes: null,
      travelMinutes: 240,
      confirmedVenueCostMinor: null,
    });
    expect(brief.resources.remainingActivityMinutes).toBeNull();
    expect(brief.resources.totalAvailableMinutes).toBeNull();
    expect(brief.resources.venueCostStatus).toBe("unconfirmed");
    expect(brief.resources.confirmedVenueCostMinor).toBeNull();
    expect(brief.resources.remainingBudgetExcludesUnknownVenueCharges).toBe(
      true,
    );
    expect(brief.direction.join(" ")).toContain("unknown, not free");
  });

  it("keeps a free short Full Send outing ambitious without inventing a resource blocker", () => {
    const brief = buildQuestRoutingBrief(
      confirmed({ approach: "group_only", skills: ["making"] }),
      { ...DEFAULT_OUTING, intensity: "full_send", durationMinutes: 15 },
    );
    expect(brief.currentOuting.intensity).toBe("full_send");
    expect(brief.experience.direction).toContain("go all in");
    expect(brief.resources.remainingActivityBudgetMinor).toBe(0);
    expect(brief.resources.remainingActivityMinutes).toBe(15);
    expect(brief.resources.blockers).toEqual([]);
    expect(brief.boundaries.participation).toBe("within_group");
    expect(brief.experience.preferredDomains).toEqual(["shared_discovery"]);
  });

  it("keeps Full Send under low resources and reports impossible reservations", () => {
    const brief = buildQuestRoutingBrief(adultPreferences, {
      ...fullSendFriends,
      budgetMinor: 0,
      travelCostMinor: 500,
      durationMinutes: 15,
      travelMinutes: 20,
    });
    expect(brief.experience.intensity).toBe("full_send");
    expect(brief.experience.preserveIntensityUnderConstraints).toBe(true);
    expect(brief.experience.noFeasibleMatch).toBe(
      "return_no_fit_for_constraints_or_unmet_experience_quality",
    );
    expect(brief.resources).toMatchObject({
      remainingActivityBudgetMinor: 0,
      budgetOverrunMinor: 500,
      remainingActivityMinutes: 0,
    });
    expect(brief.resources.blockers).toEqual([
      "reserved_costs_exceed_budget",
      "no_activity_time_after_travel",
    ]);
  });

  it("preserves custom and travel boundaries without leaking private free text or location", () => {
    const preferences = confirmed({
      otherExclusion: "Private explanation of a boundary",
      humorExamples: "Private example",
      otherSkill: "Private employer",
      exclusions: ["travel_outside_area"],
    });
    const outing = {
      ...fullSendFriends,
      area: "Private neighborhood",
      applePlaceId: "I123456789ABCDEF0",
      travelMinutes: 10,
    };
    const before = structuredClone({ preferences, outing });
    const brief = buildQuestRoutingBrief(preferences, outing);
    expect(brief.resources.blockers).toEqual([
      "custom_boundary_needs_review",
      "travel_conflicts_with_area_boundary",
    ]);
    expect(JSON.stringify(brief)).not.toContain("Private");
    expect(JSON.stringify(brief)).not.toContain(outing.applePlaceId);
    expect({ preferences, outing }).toEqual(before);
    expect(buildQuestRoutingBrief(preferences, outing)).toEqual(brief);
  });
});
