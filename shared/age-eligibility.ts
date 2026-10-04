import { normalizePreferences, type Preferences } from "./domain";

export const AGE_BAND_OPTIONS = [
  { value: "under_18", label: "Under 18" },
  { value: "18_20", label: "18–20" },
  { value: "21_plus", label: "21+" },
] as const;

/** Only an explicit private account answer qualifies. Imported prose, legacy
 * defaults and a per-outing checkbox never establish the account holder's age. */
export function confirmedAgeBand(input: Preferences) {
  const preferences = normalizePreferences(input);
  return preferences.sources.ageBand === "survey" &&
    !preferences.legacyUnconfirmed.includes("ageBand")
    ? preferences.ageBand
    : null;
}

/** Self-reported adulthood does not establish alcohol or venue eligibility. */
export function isAdultAgeConfirmed(input: Preferences) {
  const ageBand = confirmedAgeBand(input);
  return ageBand === "18_20" || ageBand === "21_plus";
}
