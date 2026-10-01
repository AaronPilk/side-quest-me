import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, type Profile } from "../shared/domain";
import {
  PREFERENCE_PROGRESS_KEYS,
  preferenceProgress,
} from "../shared/preference-progress";
import { resetPreferenceAnswer, setPreferenceAnswer } from "../shared/profile";
import { PreferenceReminder } from "../src/components/PreferenceReminder";

const completePreferences = {
  ...DEFAULT_PREFERENCES,
  categories: [],
  premises: [],
  humor: [],
  usualIntensity: "depends" as const,
  role: "rotate" as const,
  approach: "depends" as const,
  preparation: "varies" as const,
  interests: [],
  skills: [],
  sharing: "decide_later" as const,
  exclusions: [],
};

describe("preference completion", () => {
  it("leaves all eleven answers unknown for an empty or skipped profile", () => {
    for (const input of [undefined, {}, DEFAULT_PREFERENCES]) {
      expect(preferenceProgress(input)).toEqual({
        answered: 0,
        total: 11,
        missingKeys: [...PREFERENCE_PROGRESS_KEYS],
        complete: false,
      });
    }
    expect(new Set(PREFERENCE_PROGRESS_KEYS).size).toBe(11);
  });

  it("counts explicit empty selections and undecided answers without requiring free text", () => {
    expect(preferenceProgress(completePreferences)).toEqual({
      answered: 11,
      total: 11,
      missingKeys: [],
      complete: true,
    });
    expect(
      preferenceProgress({
        ...DEFAULT_PREFERENCES,
        humorExamples: "A comedian I watch",
        otherSkill: "Another skill",
        otherExclusion: "A custom boundary",
      }).answered,
    ).toBe(0);
  });

  it("does not count ambiguous legacy defaults or empty arrays as confirmed", () => {
    const { version: _version, ...legacy } = completePreferences;
    const progress = preferenceProgress({
      ...legacy,
      interests: ["music"],
      exclusions: ["alcohol"],
    });
    expect(progress.answered).toBe(2);
    expect(progress.missingKeys).toContain("role");
    expect(progress.missingKeys).not.toContain("exclusions");
    expect(progress.complete).toBe(false);
  });

  it("tracks confirming and resetting a real answer", () => {
    const confirmed = setPreferenceAnswer(
      DEFAULT_PREFERENCES,
      "exclusions",
      [],
      "survey",
    );
    expect(preferenceProgress(confirmed).answered).toBe(1);
    expect(preferenceProgress(confirmed).missingKeys).not.toContain(
      "exclusions",
    );
    expect(
      preferenceProgress(resetPreferenceAnswer(confirmed, "exclusions"))
        .answered,
    ).toBe(0);
    expect(DEFAULT_PREFERENCES.exclusions).toBeNull();
  });

  it("preserves valid boundaries while ignoring malformed and blank answers", () => {
    const progress = preferenceProgress({
      version: 2,
      role: "",
      approach: " ",
      interests: ["invented"],
      exclusions: ["strangers"],
    });
    expect(progress.answered).toBe(1);
    expect(progress.missingKeys).toContain("role");
    expect(progress.missingKeys).toContain("interests");
    expect(progress.missingKeys).not.toContain("exclusions");
  });
});

const profile: Profile = {
  accountType: "personal",
  displayName: "Test",
  locale: "en-US",
  timezone: "America/New_York",
  summary: "",
  preferences: DEFAULT_PREFERENCES,
  onboardingCompleted: true,
};

function renderReminder(
  overrides: Partial<Profile> = {},
  returnTo?: string,
  compact = false,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(PreferenceReminder, {
        profile: { ...profile, ...overrides },
        returnTo,
        compact,
      }),
    ),
  );
}

describe("preference reminder", () => {
  it("continues reminding after onboarding is marked complete when answers are still unknown", () => {
    const markup = renderReminder();
    expect(markup).toContain("0 of 11 answered");
    expect(markup).toContain("Continue preferences");
    expect(markup).toContain("returnTo=%2Fprofile");
  });

  it("hides for brand accounts and for fully answered personal profiles", () => {
    expect(renderReminder({ accountType: "brand" })).toBe("");
    expect(renderReminder({ preferences: completePreferences })).toBe("");
    expect(renderReminder({ accountType: null })).toContain(
      "Continue preferences",
    );
  });

  it("preserves a valid app return path and safely falls back for an external one", () => {
    expect(renderReminder({}, "/create?step=scene", true)).toContain(
      "returnTo=%2Fcreate%3Fstep%3Dscene",
    );
    expect(renderReminder({}, "https://example.com")).toContain(
      "returnTo=%2Fprofile",
    );
  });
});
