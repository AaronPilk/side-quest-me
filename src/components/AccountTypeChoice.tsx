import { BriefcaseBusiness, UserRound, Check } from "lucide-react";
import type { AccountType } from "../../shared/account";
import "./account-type-choice.css";

export function AccountTypeChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: AccountType | null;
  onChange: (value: "personal" | "brand") => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="account-type-choice" disabled={disabled}>
      <legend>How will you use Sidequest?</legend>
      {[
        {
          value: "personal" as const,
          title: "Personal account",
          description: "Find adventures, make videos, and build your story.",
          icon: UserRound,
        },
        {
          value: "brand" as const,
          title: "Brand account",
          description: "Represent a business and work with creators.",
          icon: BriefcaseBusiness,
        },
      ].map((option) => (
        <label
          key={option.value}
          className={value === option.value ? "selected" : ""}
        >
          <input
            type="radio"
            name="account-type"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <option.icon size={23} aria-hidden="true" />
          <span>
            <strong>{option.title}</strong>
            <small>{option.description}</small>
          </span>
          {value === option.value && <Check size={20} aria-hidden="true" />}
        </label>
      ))}
    </fieldset>
  );
}
