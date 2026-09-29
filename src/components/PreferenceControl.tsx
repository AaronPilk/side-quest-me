import { Check } from "lucide-react";
import { type PreferenceKey, type Preferences } from "../../shared/domain";

import {
  resetPreferenceAnswer,
  setPreferenceAnswer,
} from "../../shared/profile";

type Props = {
  preferenceKey: PreferenceKey;
  title: string;
  type: "single" | "multi";
  options: { value: string; label: string }[];
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
  source: "survey" | "summary_review";
  otherKey?: PreferenceKey;
  otherLabel?: string;
  showReset?: boolean;
  showTitle?: boolean;
};

export function PreferenceControl({
  preferenceKey,
  title,
  type,
  options,
  preferences,
  onChange,
  source,
  otherKey,
  otherLabel,
  showReset = true,
  showTitle = false,
}: Props) {
  const value = preferences[preferenceKey];
  const origin = preferences.sources[preferenceKey];
  const answered = value !== null && value !== "";
  function change(key: PreferenceKey, next: unknown) {
    onChange(
      setPreferenceAnswer(
        preferences,
        key,
        next as Preferences[PreferenceKey],
        source,
      ),
    );
  }
  return (
    <div className="preference-control">
      {showTitle && <h3>{title}</h3>}
      <p className="support preference-origin">
        {answered
          ? origin === "summary_review"
            ? "Answer from summary review"
            : origin === "survey"
              ? "Answer from survey"
              : "Confirmed answer"
          : "Not answered — still unknown"}
      </p>
      <div className="survey-options" role="group" aria-label={title}>
        {options.map((option) => {
          const selected = Array.isArray(value)
            ? value.includes(option.value as never)
            : value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`survey-option ${selected ? "selected" : ""}`}
              aria-pressed={selected}
              onClick={() => {
                if (type === "single") {
                  change(preferenceKey, selected ? null : option.value);
                  return;
                }
                const previous = Array.isArray(value) ? value : [];
                let next = selected
                  ? previous.filter((item) => item !== option.value)
                  : [...previous, option.value];
                if (preferenceKey === "skills" && !selected) {
                  next =
                    option.value === "none"
                      ? ["none"]
                      : next.filter((item) => item !== "none");
                }
                change(preferenceKey, next.length ? next : null);
              }}
            >
              <span>{option.label}</span>
              <span
                className={`selection-mark ${type === "single" ? "radio" : ""}`}
              >
                {selected && <Check size={15} />}
              </span>
            </button>
          );
        })}
      </div>
      {preferenceKey === "categories" && (
        <button
          className="text-button"
          type="button"
          onClick={() =>
            change(
              preferenceKey,
              options.map((option) => option.value),
            )
          }
        >
          Select all
        </button>
      )}
      {preferenceKey === "exclusions" && (
        <button
          className="text-button"
          type="button"
          onClick={() => change("exclusions", [])}
        >
          No listed boundaries
        </button>
      )}
      {otherKey && (
        <label>
          {otherLabel}
          <input
            maxLength={otherKey === "otherSkill" ? 120 : 240}
            value={String(preferences[otherKey] ?? "")}
            onChange={(event) => change(otherKey, event.target.value)}
          />
        </label>
      )}
      {showReset && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            let next = resetPreferenceAnswer(preferences, preferenceKey);
            if (otherKey) next = resetPreferenceAnswer(next, otherKey);
            onChange(next);
          }}
        >
          Reset answer to unknown
        </button>
      )}
    </div>
  );
}
