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
  disabled?: boolean;
  compact?: boolean;
  collapseOther?: boolean;
  allowEmptyAnswer?: boolean;
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
  disabled = false,
  compact = false,
  collapseOther = false,
  allowEmptyAnswer = false,
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
  const otherInput = otherKey ? (
    <label>
      {otherLabel}
      <input
        disabled={disabled}
        maxLength={otherKey === "otherSkill" ? 120 : 240}
        value={String(preferences[otherKey] ?? "")}
        onChange={(event) => {
          // Schema parsing trims strings. Keep each keystroke intact until
          // blur/save so typing the next word does not remove its space.
          const text = event.target.value;
          const sources = { ...preferences.sources };
          if (text.trim()) sources[otherKey] = source;
          else delete sources[otherKey];
          onChange({
            ...preferences,
            [otherKey]: text,
            sources,
            legacyUnconfirmed: preferences.legacyUnconfirmed.filter(
              (key) => key !== otherKey,
            ),
          });
        }}
        onBlur={(event) => change(otherKey, event.currentTarget.value.trim())}
      />
    </label>
  ) : null;
  return (
    <div
      className={`preference-control ${compact ? "preference-control-compact" : ""}`}
    >
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
              disabled={disabled}
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
          disabled={disabled}
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
      {allowEmptyAnswer &&
        type === "multi" &&
        preferenceKey !== "exclusions" && (
          <button
            className="text-button"
            type="button"
            disabled={disabled}
            aria-pressed={Array.isArray(value) && value.length === 0}
            aria-label="No preference for this question"
            onClick={() => change(preferenceKey, [])}
          >
            No preference
          </button>
        )}
      {preferenceKey === "exclusions" && (
        <button
          className="text-button"
          type="button"
          disabled={disabled}
          onClick={() => change("exclusions", [])}
        >
          No listed boundaries
        </button>
      )}
      {otherKey &&
        (collapseOther ? (
          <details
            className="preference-other-detail"
            open={preferences[otherKey] ? true : undefined}
          >
            <summary>Optional details</summary>
            {otherInput}
          </details>
        ) : (
          otherInput
        ))}
      {showReset && (
        <button
          className="text-button"
          type="button"
          disabled={disabled}
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
