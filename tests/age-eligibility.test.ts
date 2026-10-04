import { describe, expect, it } from "vitest";
import { catalog } from "../shared/catalog";
import {
  confirmedAgeBand,
  isAdultAgeConfirmed,
} from "../shared/age-eligibility";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  normalizePreferences,
  preferencesSchema,
  type Preferences,
} from "../shared/domain";
import { discoveryEligibility } from "../shared/experience-discovery";
import { ineligibilityIssues } from "../shared/recommend";
import { setPreferenceAnswer } from "../shared/profile";
import { assessViability } from "../shared/viability";

const adultQuest = {
  ...catalog.find((quest) => quest.id === "day_pitch_swap_bold_v1")!,
  adultOnly: true,
  minimumAge: 18 as const,
};
const outing = {
  ...DEFAULT_OUTING,
  category: "daytime" as const,
  intensity: "bold" as const,
  adultEligible: true,
  budgetMinor: 2500,
};
const prefs = (
  ageBand: Preferences["ageBand"],
  source: "survey" | "summary_review" = "survey",
): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ageBand,
  sources: { ageBand: source },
});

describe("private self-reported age routing", () => {
  it("keeps existing v2 profiles compatible and age unknown", () => {
    const { ageBand: _ageBand, ...old } = DEFAULT_PREFERENCES;
    expect(preferencesSchema.parse(old).ageBand).toBeNull();
    expect(normalizePreferences(old)).toEqual(DEFAULT_PREFERENCES);
  });

  it("accepts only direct age answers, never imported context or unconfirmed values", () => {
    expect(
      confirmedAgeBand(normalizePreferences({ ageBand: "21_plus" })),
    ).toBeNull();
    expect(
      confirmedAgeBand({ ...DEFAULT_PREFERENCES, ageBand: "21_plus" }),
    ).toBeNull();
    expect(confirmedAgeBand(prefs("21_plus", "summary_review"))).toBeNull();
    expect(
      confirmedAgeBand({ ...prefs("21_plus"), legacyUnconfirmed: ["ageBand"] }),
    ).toBeNull();
    expect(() =>
      setPreferenceAnswer(
        DEFAULT_PREFERENCES,
        "ageBand",
        "21_plus",
        "summary_review",
      ),
    ).toThrow(/directly/);
    expect(
      confirmedAgeBand(
        setPreferenceAnswer(DEFAULT_PREFERENCES, "ageBand", "18_20", "survey"),
      ),
    ).toBe("18_20");
    expect(isAdultAgeConfirmed(prefs("under_18"))).toBe(false);
  });

  it.each([null, "under_18"] as const)(
    "blocks adult discovery and acceptance for %s even when outing checkboxes are set",
    (ageBand) => {
      expect(
        ineligibilityIssues(adultQuest, outing, prefs(ageBand)),
      ).toContainEqual(expect.objectContaining({ code: "age" }));
      const discovery = discoveryEligibility(
        adultQuest,
        outing,
        prefs(ageBand),
      );
      expect(discovery.blocking).toContainEqual(
        expect.objectContaining({ code: "age" }),
      );
      expect(discovery.requirements.some(({ code }) => code === "age")).toBe(
        false,
      );
      expect(
        assessViability(outing, prefs(ageBand), [], [adultQuest]).recoveries,
      ).toEqual([]);
    },
  );

  it("does not let a saved age answer replace group eligibility or venue permission", () => {
    expect(ineligibilityIssues(adultQuest, outing, prefs("18_20"))).toEqual([]);
    expect(
      ineligibilityIssues(
        adultQuest,
        { ...outing, adultEligible: false },
        prefs("21_plus"),
      ),
    ).toContainEqual(expect.objectContaining({ code: "adults" }));
    const nightlife = {
      ...adultQuest,
      settings: ["venue" as const],
      supportsAdultContext: true,
      venuePermissionRequired: true,
      cost: { ...adultQuest.cost, venueCostUnknown: false },
    };
    expect(
      ineligibilityIssues(
        nightlife,
        { ...outing, setting: "venue", adultContext: true },
        prefs("21_plus"),
      ),
    ).toContainEqual(expect.objectContaining({ code: "venue_permission" }));
  });

  it("rechecking a saved profile after age removal invalidates an older eligible plan", () => {
    expect(
      discoveryEligibility(adultQuest, outing, prefs("21_plus")).blocking,
    ).toEqual([]);
    const updated = setPreferenceAnswer(
      prefs("21_plus"),
      "ageBand",
      null,
      "survey",
    );
    expect(ineligibilityIssues(adultQuest, outing, updated)).toContainEqual(
      expect.objectContaining({ code: "age" }),
    );
  });
  it("blocks a previously eligible 21+ experience after downgrading the saved age band", () => {
    const barQuest = { ...adultQuest, minimumAge: 21 as const };
    expect(ineligibilityIssues(barQuest, outing, prefs("21_plus"))).toEqual([]);
    for (const ageBand of ["18_20", "under_18", null] as const) {
      expect(
        ineligibilityIssues(barQuest, outing, prefs(ageBand)),
      ).toContainEqual(
        expect.objectContaining({
          code: "age",
          reason: expect.stringContaining("21+"),
        }),
      );
      expect(
        discoveryEligibility(barQuest, outing, prefs(ageBand)).blocking,
      ).toContainEqual(expect.objectContaining({ code: "age" }));
    }
  });
  it("requires fresh age labeling for an older adult experience, without reclassifying ordinary volunteer quests", () => {
    const legacyAdult = { ...adultQuest, minimumAge: undefined };
    expect(
      ineligibilityIssues(legacyAdult, outing, prefs("18_20")),
    ).toContainEqual(
      expect.objectContaining({
        code: "age",
        reason: expect.stringContaining("fresh age-matched"),
      }),
    );
    expect(ineligibilityIssues(legacyAdult, outing, prefs("21_plus"))).toEqual(
      [],
    );
    expect(
      ineligibilityIssues(
        { ...legacyAdult, adultOnly: false, requiresVolunteer: true },
        outing,
        prefs("18_20"),
      ),
    ).toEqual([]);
  });
});
