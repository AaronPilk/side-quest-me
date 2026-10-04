import { AGE_BAND_OPTIONS } from "../../shared/age-eligibility";
import type { Preferences } from "../../shared/domain";
import "./age-band-choice.css";

export function AgeBandChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: Preferences["ageBand"];
  onChange: (value: Preferences["ageBand"]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="age-band-choice" disabled={disabled}>
      <legend>What’s your age group?</legend>
      <div className="age-band-options">
        {AGE_BAND_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={value === option.value ? "selected" : ""}
          >
            <input
              type="radio"
              name="age-band"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <p className="support">
        Not shown on your public profile. Helps match adult experiences. Venue
        and drink age rules still apply.
      </p>
      {value && (
        <button
          className="text-button"
          type="button"
          onClick={() => onChange(null)}
        >
          Prefer not to say
        </button>
      )}
    </fieldset>
  );
}
