import { normalizePreferences, type PreferenceKey } from "./domain";
import { SURVEY_QUESTIONS } from "./profile";

// Optional examples and custom text add detail, but are not extra questions.
export const PREFERENCE_PROGRESS_KEYS: readonly PreferenceKey[] = [
  ...SURVEY_QUESTIONS.map((question) => question.key),
  "interests",
];

export function preferenceProgress(input: unknown) {
  const preferences = normalizePreferences(input);
  const missingKeys = PREFERENCE_PROGRESS_KEYS.filter((key) => {
    const answer = preferences[key];
    // A reviewed empty selection is an answer; an unanswered field is null.
    return answer === null || (typeof answer === "string" && !answer.trim());
  });
  const total = PREFERENCE_PROGRESS_KEYS.length;
  return {
    answered: total - missingKeys.length,
    total,
    missingKeys,
    complete: missingKeys.length === 0,
  };
}
