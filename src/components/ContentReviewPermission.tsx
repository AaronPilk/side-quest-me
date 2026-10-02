import { Link } from "react-router-dom";

export function ContentReviewPermission({
  scope,
  checked,
  onChange,
  disabled = false,
}: {
  scope: "profile" | "series";
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="content-review-permission">
      <label className="check-row">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          {scope === "profile"
            ? "I allow my submitted public name, username, bio and profile photo to be sent to OpenAI for content review before sharing."
            : "I allow my submitted public series title, premise, published chapter text and quest instructions to be sent to OpenAI for content review before sharing."}
        </span>
      </label>
      <p className="support">
        Your private journal and preferences are excluded.{" "}
        <Link to="/privacy">Privacy policy</Link>
      </p>
    </div>
  );
}
