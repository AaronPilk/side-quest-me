import { useState } from "react";
import { licenseTermsSchema, type LicenseTerms } from "../../shared/community";
import { Button, Notice } from "./ui";
import { money, words } from "./Community";

const CHANNELS = [
  "brand_social",
  "paid_social",
  "website",
  "email",
  "broadcast",
] as const;
export function LicenseTermsForm({
  initial,
  busy,
  submitLabel = "Send proposal",
  onSubmit,
}: {
  initial?: LicenseTerms;
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (terms: LicenseTerms) => Promise<unknown>;
}) {
  const [channels, setChannels] = useState<string[]>(initial?.channels ?? []);
  const [error, setError] = useState("");
  return (
    <form
      className="community-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        const parsed = licenseTermsSchema.safeParse({
          paymentMinor: Math.round(Number(form.get("payment")) * 100),
          platformFeeMinor: Math.round(Number(form.get("fee")) * 100),
          currency: "USD",
          channels,
          startDate: form.get("startDate"),
          durationDays: Number(form.get("duration")),
          editingPermissions: form.get("editing"),
          message: form.get("message"),
        });
        if (!parsed.success)
          return setError(
            parsed.error.issues[0]?.message || "Review your proposed terms.",
          );
        await onSubmit(parsed.data);
      }}
    >
      <div className="form-grid">
        <label>
          Proposed payment (USD)
          <input
            name="payment"
            type="number"
            min="0.01"
            step="0.01"
            required
            defaultValue={initial ? initial.paymentMinor / 100 : ""}
          />
        </label>
        <label>
          Agreed Sidequest fee (USD)
          <input
            name="fee"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={initial ? initial.platformFeeMinor / 100 : ""}
          />
        </label>
      </div>
      <p className="support">
        Enter the fee agreed for this proposal, including zero only if agreed.
        No payment is collected here.
      </p>
      <fieldset className="community-options">
        <legend>Requested channels</legend>
        {CHANNELS.map((channel) => (
          <label className="check-row" key={channel}>
            <input
              type="checkbox"
              checked={channels.includes(channel)}
              onChange={(event) =>
                setChannels((current) =>
                  event.target.checked
                    ? [...current, channel]
                    : current.filter((item) => item !== channel),
                )
              }
            />
            {words(channel)}
          </label>
        ))}
      </fieldset>
      <div className="form-grid">
        <label>
          Proposed start date (UTC)
          <input
            name="startDate"
            type="date"
            required
            defaultValue={initial?.startDate}
          />
        </label>
        <label>
          Usage duration (days)
          <input
            name="duration"
            type="number"
            min="1"
            max="730"
            required
            defaultValue={initial?.durationDays}
          />
        </label>
      </div>
      <label>
        Editing permissions
        <select
          name="editing"
          defaultValue={initial?.editingPermissions ?? "none"}
        >
          <option value="none">Use the exact video</option>
          <option value="crop_captions">Cropping and captions only</option>
          <option value="agreed_edits">Edits described in the message</option>
        </select>
      </label>
      <label>
        Short message & any agreed edits
        <textarea
          name="message"
          rows={3}
          maxLength={1500}
          defaultValue={initial?.message}
        />
      </label>
      <p className="support">
        This concerns a brand’s use of this video. It never grants access to the
        creator’s social accounts or requires posting from their account.
      </p>
      <Button type="submit" busy={busy}>
        {submitLabel}
      </Button>
      {error && <Notice error>{error}</Notice>}
    </form>
  );
}
export function LicenseTermsView({ terms }: { terms: LicenseTerms }) {
  return (
    <dl className="license-terms">
      <div>
        <dt>Proposed payment</dt>
        <dd>{money(terms.paymentMinor)}</dd>
      </div>
      <div>
        <dt>Agreed platform fee</dt>
        <dd>{money(terms.platformFeeMinor)}</dd>
      </div>
      <div>
        <dt>Channels</dt>
        <dd>{terms.channels.map(words).join(", ")}</dd>
      </div>
      <div>
        <dt>Usage period</dt>
        <dd>
          {terms.durationDays} days from {terms.startDate} (UTC)
        </dd>
      </div>
      <div>
        <dt>Editing</dt>
        <dd>{words(terms.editingPermissions)}</dd>
      </div>
      <div>
        <dt>Message</dt>
        <dd>{terms.message || "No additional message."}</dd>
      </div>
    </dl>
  );
}
