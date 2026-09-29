import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, normalizePreferences } from "../shared/domain";
import {
  preferenceChips,
  resetPreferenceAnswer,
  setPreferenceAnswer,
} from "../shared/profile";

describe("confirmed profile answers", () => {
  it("starts unknown without any invented profile claims", () => {
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(preferenceChips(DEFAULT_PREFERENCES)).toEqual([]);
    expect(DEFAULT_PREFERENCES.role).toBeNull();
  });

  it("only claims role rotation when explicitly confirmed, and reset removes that claim", () => {
    const confirmed = setPreferenceAnswer(
      DEFAULT_PREFERENCES,
      "role",
      "rotate",
      "survey",
    );
    expect(preferenceChips(confirmed)).toEqual(["Happy to rotate roles"]);
    expect(confirmed.sources.role).toBe("survey");
    const reset = resetPreferenceAnswer(confirmed, "role");
    expect(reset.role).toBeNull();
    expect(reset.sources.role).toBeUndefined();
    expect(preferenceChips(reset)).toEqual([]);
  });

  it("keeps ambiguous legacy defaults unknown while retaining explicit answers and boundaries", () => {
    const normalized = normalizePreferences({
      role: "rotate",
      preparation: "varies",
      approach: "depends",
      usualIntensity: "depends",
      sharing: "decide_later",
      categories: [],
      skills: ["music"],
      exclusions: ["alcohol"],
      humor: ["elaborate_setups"],
    });
    expect(normalized.role).toBeNull();
    expect(normalized.categories).toBeNull();
    expect(normalized.legacyUnconfirmed).toEqual(
      expect.arrayContaining([
        "role",
        "preparation",
        "approach",
        "usualIntensity",
        "sharing",
      ]),
    );
    expect(normalized.skills).toEqual(["music"]);
    expect(normalized.exclusions).toEqual(["alcohol"]);
    expect(preferenceChips(normalized)).toEqual([
      "No alcohol",
      "Enjoys elaborate setups",
      "Skill: Music",
    ]);
    const reviewed = setPreferenceAnswer(
      normalized,
      "role",
      "rotate",
      "summary_review",
    );
    expect(reviewed.legacyUnconfirmed).not.toContain("role");
    expect(normalizePreferences(reviewed).role).toBe("rotate");
  });

  it("does not discard valid boundaries because another historical field is invalid", () => {
    const normalized = normalizePreferences({
      role: "unexpected",
      exclusions: ["strangers"],
    });
    expect(normalized.role).toBeNull();
    expect(normalized.exclusions).toEqual(["strangers"]);
  });

  it("keeps unknown and explicitly no listed boundaries distinct", () => {
    const confirmed = setPreferenceAnswer(
      DEFAULT_PREFERENCES,
      "exclusions",
      [],
      "survey",
    );
    expect(confirmed.exclusions).toEqual([]);
    expect(confirmed.sources.exclusions).toBe("survey");
    expect(
      resetPreferenceAnswer(confirmed, "exclusions").exclusions,
    ).toBeNull();
  });
});
