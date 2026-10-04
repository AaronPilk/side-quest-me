import { describe, expect, it } from "vitest";
import { catalog } from "../shared/catalog";
import {
  AWARDS,
  candidateSchema,
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  effectiveBudget,
  levelFromXp,
  outingSchema,
  preferencesSchema,
  profileSchema,
  questVariantSchema,
  type Outing,
  type Preferences,
} from "../shared/domain";
import {
  estimateCost,
  familyEligibility,
  ineligibilityReasons,
  nextUtcReset,
  recommend as recommendFromCatalog,
} from "../shared/recommend";
import { COPY_PROFILE_PROMPT, SURVEY_QUESTIONS } from "../shared/profile";

// These regressions compare specific original families and their original ranking.
// Keep the comparison set fixed; activity-catalog.test.ts exercises the expanded inventory.
const recommend = (...args: Parameters<typeof recommendFromCatalog>) =>
  recommendFromCatalog(
    args[0],
    args[1],
    args[2],
    args[3],
    args[4] ?? catalog.slice(0, 33),
  );

const outing = (patch: Partial<Outing> = {}): Outing => ({
  ...DEFAULT_OUTING,
  ...patch,
});
const prefs = (patch: Partial<Preferences> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...patch,
});

describe("complete authored catalog", () => {
  it("preserves original families while expanding the authored catalog", () => {
    expect(catalog).toHaveLength(753);
    const original = catalog.slice(0, 30);
    expect(new Set(catalog.map((q) => q.id)).size).toBe(753);
    const families = [...new Set(original.map((q) => q.familyId))];
    expect(families).toHaveLength(10);
    for (const family of families)
      expect(
        original
          .filter((q) => q.familyId === family)
          .map((q) => q.intensity)
          .sort(),
      ).toEqual(["bold", "chill", "full_send"]);
    for (const category of [
      "date_night",
      "daytime",
      "late_night",
      "street_challenges",
      "demon",
    ])
      expect(
        new Set(
          original
            .filter((q) => q.category === category)
            .map((q) => q.familyId),
        ).size,
      ).toBe(2);
    for (const quest of catalog) {
      expect(() => questVariantSchema.parse(quest), quest.id).not.toThrow();
      expect(quest.beats).toHaveLength(3);
      expect(
        quest.beats.every(
          (beat) => beat.action.length > 30 && beat.filming.length > 20,
        ),
      ).toBe(true);
      expect(quest.award).toEqual(AWARDS[quest.intensity]);
    }
  });
  it("has the exact ten-question survey and a bounded, honest import prompt", () => {
    expect(SURVEY_QUESTIONS).toHaveLength(10);
    expect(new Set(SURVEY_QUESTIONS.map((q) => q.id)).size).toBe(10);
    expect(COPY_PROFILE_PROMPT).toContain("no more than 250 words");
    expect(COPY_PROFILE_PROMPT).toContain("Do not invent facts");
    expect(COPY_PROFILE_PROMPT).toContain("TENTATIVE IMPRESSIONS");
  });
});

describe("budgets, strict schemas, and progression", () => {
  it("multiplies per-person amounts exactly once and adds mandatory travel and venue costs", () => {
    expect(
      effectiveBudget(outing({ budgetMinor: 1500, budgetScope: "per_person" })),
    ).toBe(3000);
    expect(
      effectiveBudget(outing({ budgetMinor: 1500, budgetScope: "total" })),
    ).toBe(1500);
    const quest = catalog[0];
    expect(
      estimateCost(
        quest,
        outing({
          setting: "venue",
          confirmedVenueCostMinor: 2200,
          travelCostMinor: 500,
        }),
      ),
    ).toEqual({ minMinor: 2700, maxMinor: 2700, known: true });
    expect(estimateCost(quest, outing({ setting: "venue" })).known).toBe(false);
    expect(() => effectiveBudget(outing({ budgetMinor: 0.5 }))).toThrow();
    expect(() =>
      effectiveBudget(
        outing({
          budgetMinor: Number.MAX_SAFE_INTEGER,
          budgetScope: "per_person",
        }),
      ),
    ).toThrow();
  });
  it("rejects forged mutation fields, fractional money, invalid group size, and contradictory age claims", () => {
    expect(
      outingSchema.safeParse({ ...DEFAULT_OUTING, award: 500 }).success,
    ).toBe(false);
    expect(outingSchema.safeParse(outing({ budgetMinor: 0.5 })).success).toBe(
      false,
    );
    expect(
      outingSchema.safeParse(outing({ group: "couple", participants: 4 }))
        .success,
    ).toBe(false);
    expect(
      outingSchema.safeParse(
        outing({ setting: "venue", adultContext: true, adultEligible: false }),
      ).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, role: "operator" })
        .success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        displayName: "A",
        timezone: "UTC",
        locale: "en",
        summary: "",
        preferences: DEFAULT_PREFERENCES,
        onboardingCompleted: true,
        accountStatus: "operator",
      }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse(
        prefs({ exclusions: ["strangers", "strangers"] }),
      ).success,
    ).toBe(false);
  });
  it("derives recognition from permanent XP without using points", () => {
    expect(levelFromXp(0)).toEqual({
      level: 1,
      progress: 0,
      nextLevelXp: 1000,
    });
    expect(levelFromXp(1250)).toEqual({
      level: 2,
      progress: 250,
      nextLevelXp: 1000,
    });
    expect(() => levelFromXp(-1)).toThrow();
    expect(() => levelFromXp(1.5)).toThrow();
  });
});

describe("deterministic hard filters and preference precedence", () => {
  it("works without an imported summary or paid AI and returns genuinely free home choices", () => {
    const result = recommend(outing(), prefs());
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(new Set(result.map((q) => q.familyId)).size).toBe(result.length);
    expect(result.every((q) => q.estimatedCostMaxMinor === 0)).toBe(true);
    expect(result.every((q) => q.whyFits.includes("No purchase needed"))).toBe(
      true,
    );
    expect(result.every((q) => candidateSchema.safeParse(q).success)).toBe(
      true,
    );
    expect(recommend(outing(), prefs())).toEqual(result);
  });
  it("never relaxes time, group, budget, venue permission, or preparation to fill a row", () => {
    expect(recommend(outing({ durationMinutes: 15 }), prefs())).toEqual([]);
    expect(
      recommend(outing({ group: "solo", participants: 1 }), prefs()),
    ).toEqual([]);
    expect(
      recommend(outing({ setting: "venue", budgetMinor: 5000 }), prefs()),
    ).toEqual([]);
    expect(
      recommend(
        outing({ setting: "venue", budgetMinor: 5000, venuePermission: true }),
        prefs(),
      ),
    ).toEqual([]);
    expect(
      recommend(
        outing({
          intensity: "full_send",
          group: "friends",
          participants: 5,
          durationMinutes: 120,
        }),
        prefs(),
      ),
    ).toEqual([]);
    expect(
      recommend(
        outing({
          category: "street_challenges",
          group: "friends",
          participants: 3,
          adultEligible: true,
          durationMinutes: 60,
        }),
        prefs(),
      ).some((q) => q.familyId === "street_meal_choice"),
    ).toBe(false);
  });
  it("explicit no-public-performance excludes a real open mic despite an open-mic interest", () => {
    const settings = outing({
      category: "demon",
      intensity: "full_send",
      setting: "venue",
      group: "friends",
      participants: 4,
      durationMinutes: 180,
      budgetMinor: 6000,
      venuePermission: true,
      arrangementConfirmed: true,
      confirmedVenueCostMinor: 1500,
    });
    const noPerformance = prefs({
      premises: ["open_mic"],
      exclusions: ["public_performance"],
    });
    expect(
      recommend(settings, noPerformance).some(
        (q) => q.familyId === "demon_friends_write_set",
      ),
    ).toBe(false);
    expect(
      recommend(settings, prefs({ premises: ["open_mic"] })).some(
        (q) => q.familyId === "demon_friends_write_set",
      ),
    ).toBe(true);
    const previous = recommend(settings, prefs())[0];
    recommend(settings, noPerformance);
    expect(previous.award).toEqual({ xp: 500, points: 50 });
  });
  it("allows private Full Send performance with the public-performance exclusion", () => {
    const result = recommend(
      outing({
        category: "late_night",
        intensity: "full_send",
        group: "friends",
        participants: 4,
        durationMinutes: 180,
        arrangementConfirmed: true,
      }),
      prefs({ exclusions: ["public_performance"] }),
    );
    expect(result.some((q) => q.familyId === "night_karaoke_bench")).toBe(true);
  });
  it("requires explicit eligibility for adult volunteers and optional adult venues", () => {
    const settings = outing({
      category: "street_challenges",
      group: "friends",
      participants: 3,
      budgetMinor: 3000,
    });
    expect(
      recommend(settings, prefs()).some(
        (q) => q.familyId === "street_meal_choice",
      ),
    ).toBe(false);
    expect(
      recommend(
        { ...settings, adultEligible: true },
        prefs({ ageBand: "21_plus", sources: { ageBand: "survey" } }),
      ).some((q) => q.familyId === "street_meal_choice"),
    ).toBe(true);
    const adult = outing({
      category: "late_night",
      setting: "venue",
      adultContext: true,
      adultEligible: true,
      venuePermission: true,
      confirmedVenueCostMinor: 0,
      durationMinutes: 120,
    });
    expect(
      recommend(
        adult,
        prefs({ ageBand: "21_plus", sources: { ageBand: "survey" } }),
      ).every((q) => q.supportsAdultContext),
    ).toBe(true);
    expect(recommend(adult, prefs({ exclusions: ["adult_venues"] }))).toEqual(
      [],
    );
  });
  it("does not silently interpret arbitrary exclusions or imported guesses", () => {
    expect(
      recommend(
        outing(),
        prefs({ otherExclusion: "Do not include loud music" }),
      ),
    ).toEqual([]);
    const quest = catalog.find(
      (q) => q.familyId === "demon_surprise_fanclub" && q.intensity === "chill",
    )!;
    const settings = outing({
      category: "demon",
      group: "friends",
      participants: 4,
      arrangementConfirmed: true,
    });
    expect(
      ineligibilityReasons(
        quest,
        settings,
        prefs({ exclusions: ["being_surprised"], role: "main_character" }),
      ),
    ).not.toEqual([]);
    expect(
      ineligibilityReasons(
        quest,
        settings,
        prefs({ exclusions: ["being_surprised"], role: "camera_person" }),
      ),
    ).toEqual([]);
  });
  it("ranks declared interests, then deprioritizes tried families without manufacturing new ones", () => {
    const settings = outing({
      category: "daytime",
      group: "friends",
      participants: 4,
      durationMinutes: 90,
    });
    const preferences = prefs({ skills: ["games"] });
    expect(recommend(settings, preferences)[0].familyId).toBe(
      "day_secret_expert",
    );
    expect(
      recommend(settings, preferences, ["day_secret_expert"])[0].familyId,
    ).toBe("day_absurd_commercial");
  });
  it("lets directing and performing preferences change ranking while preserving the chosen role", () => {
    const settings = outing();
    expect(recommend(settings, prefs({ role: "mastermind" }))[0].familyId).toBe(
      "date_pit_crew",
    );
    expect(
      recommend(settings, prefs({ role: "main_character" }))[0].familyId,
    ).toBe("date_menu_draft");
    expect(
      recommend(settings, prefs({ role: "camera_person" }))[0].selectedRole,
    ).toBe("camera_person");
  });
});

describe("award eligibility preview boundaries", () => {
  const now = new Date("2026-09-27T00:00:00.000Z");
  it("cools down by stable family and uses the exact thirty-day boundary", () => {
    expect(
      familyEligibility(
        "f",
        [{ familyId: "f", awardedAt: "2026-08-28T00:00:00.001Z" }],
        now,
      ).eligible,
    ).toBe(false);
    expect(
      familyEligibility(
        "f",
        [{ familyId: "f", awardedAt: "2026-08-28T00:00:00.000Z" }],
        now,
      ).eligible,
    ).toBe(true);
    expect(familyEligibility("f", ["f"], now).eligible).toBe(true); // an attempt alone is not an award
  });
  it("shows repeat attempts without another award and advances UTC midnight independently of locale", () => {
    const result = recommend(
      outing(),
      prefs(),
      [{ familyId: "date_menu_draft", awardedAt: "2026-09-26T23:59:59Z" }],
      now,
    );
    expect(
      result.find((q) => q.familyId === "date_menu_draft")?.rewardEligibility,
    ).toEqual({ eligible: false, reason: "family_cooldown" });
    expect(
      nextUtcReset(new Date("2026-09-27T23:59:59.999Z")).toISOString(),
    ).toBe("2026-09-28T00:00:00.000Z");
  });
});

describe("confirmed, explainable profile matching", () => {
  const daytime = outing({
    category: "daytime",
    group: "friends",
    participants: 4,
    durationMinutes: 90,
  });

  it("keeps unknown answers neutral and never assigns a role or invents fit claims", () => {
    const candidates = recommend(daytime, prefs());
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.selectedRole).toBeNull();
      expect(candidate.whyFits).toEqual([
        "Works at home",
        "No purchase needed",
      ]);
    }
    expect(
      recommend(
        daytime,
        prefs({
          premises: ["not_sure"],
          skills: ["none"],
          approach: "depends",
          preparation: "varies",
        }),
      ),
    ).toEqual(candidates);
  });

  it("normalizes old preselected defaults without claiming that they were confirmed", () => {
    const legacy = {
      categories: [],
      premises: [],
      humor: [],
      humorExamples: "",
      usualIntensity: "depends",
      role: "rotate",
      approach: "depends",
      preparation: "varies",
      skills: [],
      otherSkill: "",
      sharing: "decide_later",
      exclusions: [],
      otherExclusion: "",
    };
    expect(recommend(daytime, legacy as unknown as Preferences)).toEqual(
      recommend(daytime, prefs()),
    );
  });

  it("ranks confirmed interests separately from skills and willingness", () => {
    const interest = recommend(daytime, prefs({ interests: ["games"] }));
    const skill = recommend(daytime, prefs({ skills: ["games"] }));
    expect(interest[0].familyId).toBe("day_secret_expert");
    expect(skill[0].familyId).toBe("day_secret_expert");
    expect(interest[0].whyFits[0]).toBe("Matches your interest in games");
    expect(skill[0].whyFits[0]).toBe("Can use your games skills");
    expect(interest[0].whyFits.join(" ")).not.toContain("you'd try");
    expect(interest[0].whyFits.join(" ")).not.toContain("skills");
    expect(
      recommend(daytime, prefs({ interests: ["making"] }))[0].familyId,
    ).toBe("day_absurd_commercial");
    const willingness = recommend(
      daytime,
      prefs({
        interests: ["making"],
        premises: ["secret_expert"],
      }),
    );
    expect(willingness[0].familyId).toBe("day_secret_expert");
    expect(willingness[0].whyFits[0]).toBe(
      "Matches a premise you'd try: a secret-expert game",
    );
  });

  it("uses confirmed humor without promoting entertainment enjoyment to willingness", () => {
    const candidates = recommend(daytime, prefs({ humor: ["skill_reveals"] }));
    expect(candidates[0].familyId).toBe("day_secret_expert");
    expect(candidates[0].whyFits[0]).toBe(
      "Matches your taste for skill reveals",
    );
    expect(candidates[0].whyFits.join(" ")).not.toContain("you'd try");
  });

  it("does not interpret negation, guesses, viewing habits or design requests as structured answers", () => {
    const neutral = recommend(daytime, prefs());
    for (const prose of [
      "I do not like games or sports.",
      "Perhaps they like games; actual skills and willingness are unknown.",
      "I watch prank videos, but do not want to perform pranks.",
      "Design an app about games and add a camera-person selector.",
    ]) {
      const profile = {
        displayName: "",
        timezone: "UTC",
        locale: "en",
        summary: prose,
        preferences: prefs({ humorExamples: prose, otherSkill: prose }),
        onboardingCompleted: true,
      };
      expect(recommend(daytime, profile.preferences)).toEqual(neutral);
    }
  });

  it("explains only a supported confirmed role", () => {
    const candidates = recommend(outing(), prefs({ role: "mastermind" }));
    const supported = candidates.find((q) => q.familyId === "date_pit_crew")!;
    const unsupported = candidates.find(
      (q) => q.familyId === "date_menu_draft",
    )!;
    expect(supported.selectedRole).toBe("mastermind");
    expect(supported.whyFits[0]).toBe("Supports your preference to organize");
    expect(unsupported.selectedRole).toBeNull();
    expect(unsupported.whyFits).not.toContain(
      "Supports your preference to organize",
    );
  });

  it("ranks preparation while keeping no-preparation willingness precise", () => {
    const demon = outing({
      category: "demon",
      group: "friends",
      participants: 4,
      durationMinutes: 90,
      arrangementConfirmed: true,
    });
    expect(recommend(demon, prefs())[0].familyId).toBe(
      "demon_friends_write_set",
    );
    const setup = recommend(demon, prefs({ preparation: "proper_setup" }));
    expect(setup[0].familyId).toBe("demon_surprise_fanclub");
    expect(setup[0].whyFits[0]).toBe(
      "Matches your preference for a proper setup",
    );
    const bold = recommend(
      { ...daytime, intensity: "bold" },
      prefs({ premises: ["spontaneous"] }),
    );
    expect(bold.flatMap((q) => q.whyFits).join(" ")).not.toContain(
      "spontaneous",
    );
  });

  it("uses confirmed participation style and keeps firm stranger exclusions authoritative", () => {
    const adultPrefs = (patch: Partial<Preferences> = {}) =>
      prefs({ ageBand: "21_plus", sources: { ageBand: "survey" }, ...patch });
    const street = outing({
      category: "street_challenges",
      group: "friends",
      participants: 3,
      setting: "venue",
      adultEligible: true,
      venuePermission: true,
      confirmedVenueCostMinor: 0,
      budgetMinor: 3000,
    });
    expect(recommend(street, adultPrefs())[0].familyId).toBe(
      "street_make_us_break",
    );
    const invitation = recommend(
      street,
      adultPrefs({ approach: "invitation" }),
    );
    expect(invitation[0].familyId).toBe("street_meal_choice");
    expect(invitation[0].whyFits[0]).toBe(
      "Uses a clear invitation, as you prefer",
    );
    const conversation = recommend(
      street,
      adultPrefs({ approach: "conversation" }),
    );
    expect(conversation[0].familyId).toBe("street_meal_choice");
    expect(conversation[0].whyFits[0]).toBe(
      "Fits your willingness to start a conversation",
    );
    expect(
      recommend(
        street,
        adultPrefs({
          approach: "conversation",
          premises: ["meal_challenge"],
          exclusions: ["strangers"],
        }),
      ).some((q) => q.familyId === "street_meal_choice"),
    ).toBe(false);
    expect(
      recommend(street, adultPrefs({ approach: "group_only" })).map(
        (q) => q.familyId,
      ),
    ).toEqual(["street_make_us_break"]);
  });

  it("does not use unknown or unsupported roles to bypass a surprise boundary", () => {
    const quest = catalog.find((q) => q.familyId === "demon_surprise_fanclub")!;
    const settings = outing({
      category: "demon",
      group: "friends",
      participants: 4,
      arrangementConfirmed: true,
    });
    expect(
      ineligibilityReasons(
        quest,
        settings,
        prefs({
          exclusions: ["being_surprised"],
        }),
      ),
    ).toContain("This quest conflicts with a boundary in your profile.");
    expect(
      ineligibilityReasons(
        { ...quest, roles: ["main_character"] },
        settings,
        prefs({
          role: "camera_person",
          exclusions: ["being_surprised"],
        }),
      ),
    ).toContain("This quest conflicts with a boundary in your profile.");
  });

  it("never lets profile preferences override today's category, intensity, time, budget, setting or group", () => {
    const settings = outing({ durationMinutes: 30 });
    const original = structuredClone(settings);
    const candidates = recommend(
      settings,
      prefs({
        categories: ["demon"],
        usualIntensity: "full_send",
        preparation: "proper_setup",
        interests: ["sports"],
        premises: ["fan_club"],
      }),
    );
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.category).toBe("date_night");
      expect(candidate.intensity).toBe("chill");
      expect(candidate.durationMinutes).toBeLessThanOrEqual(30);
      expect(candidate.estimatedCostMaxMinor).toBe(0);
      expect(candidate.settings).toContain("home");
      expect(candidate.minParticipants).toBeLessThanOrEqual(2);
      expect(candidate.maxParticipants).toBeGreaterThanOrEqual(2);
    }
    expect(settings).toEqual(original);
  });

  it("distinguishes private performance practice from a real open-mic match", () => {
    const candidates = recommend(
      outing({
        category: "demon",
        group: "friends",
        participants: 4,
        arrangementConfirmed: true,
      }),
      prefs({ premises: ["open_mic"] }),
    );
    const practice = candidates.find(
      (q) => q.familyId === "demon_friends_write_set",
    )!;
    expect(practice.whyFits[0]).toBe(
      "Private practice for the open mic you'd try",
    );
  });
});
