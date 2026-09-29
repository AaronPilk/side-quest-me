import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  originalQuestIdentity,
  type OriginalDraft,
} from "../../shared/community";
import {
  AWARDS,
  CATEGORIES,
  INTENSITIES,
  questVariantSchema,
  type QuestVariant,
} from "../../shared/domain";
import { INTEREST_OPTIONS } from "../../shared/profile";
import { Back, Button, Loading, Notice, PageTitle } from "../components/ui";
import {
  StateTag,
  TryQuest,
  useCommunity,
  useCommunityAction,
  words,
} from "../components/Community";

const BOUNDARIES = [
  "alcohol",
  "adult_venues",
  "public_performance",
  "physical_challenges",
  "food_challenges",
  "travel_outside_area",
  "strangers",
  "being_surprised",
];
const FLAGS = [
  ["venuePermissionRequired", "Needs venue permission"],
  ["arrangementRequired", "Needs advance arrangements"],
  ["requiresVolunteer", "Needs a willing volunteer"],
  ["adultOnly", "Adults only"],
  ["supportsAdultContext", "Permits an approved adult venue context"],
] as const;
function DraftForm({
  draft,
  onSaved,
}: {
  draft?: OriginalDraft;
  onSaved: (draft: OriginalDraft) => void;
}) {
  const [draftId] = useState(draft?.id ?? crypto.randomUUID());
  const [error, setError] = useState("");
  const action = useCommunityAction();
  const q = draft?.quest;
  const frozen = draft?.state === "submitted" || draft?.state === "approved";
  return (
    <form
      className="community-form original-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        const lines = (name: string) =>
          String(form.get(name) || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        const intensity = String(
          form.get("intensity"),
        ) as QuestVariant["intensity"];
        const beats = [0, 1, 2].map((index) => ({
          label: String(form.get(`label${index}`)),
          action: String(form.get(`action${index}`)),
          filming: String(form.get(`filming${index}`)),
          caption: String(form.get(`label${index}`)),
        }));
        const parsed = questVariantSchema.safeParse({
          ...originalQuestIdentity(draftId, q?.version ?? 1),
          title: String(form.get("title")),
          hook: String(form.get("hook")),
          category: form.get("category"),
          intensity,
          durationMinutes: Number(form.get("duration")),
          minParticipants: Number(form.get("minParticipants")),
          maxParticipants: Number(form.get("maxParticipants")),
          cost: {
            minMinor: Math.round(Number(form.get("costMin")) * 100),
            maxMinor: Math.round(Number(form.get("costMax")) * 100),
            currency: "USD",
            scope: form.get("costScope"),
            venueCostUnknown: form.get("venueCostUnknown") === "on",
            note: String(form.get("costNote")),
          },
          settings: form.getAll("settings"),
          interests: form.getAll("interests"),
          roles: ["main_character", "mastermind", "camera_person", "rotate"],
          preparation: form.get("preparation"),
          conflicts: form.getAll("conflicts"),
          ...Object.fromEntries(
            FLAGS.map(([key]) => [key, form.get(key) === "on"]),
          ),
          beats,
          materials: lines("materials"),
          requirements: lines("instructions"),
          completionQuestions: [String(form.get("completion"))],
          fallback: String(form.get("fallback")),
          award: AWARDS[intensity],
          cooldownDays: 30,
        });
        if (!parsed.success)
          return setError(
            `${parsed.error.issues[0]?.path.join(" ")}: ${parsed.error.issues[0]?.message}`,
          );
        const result = await action.run<OriginalDraft>(
          "draft_save",
          {
            id: draftId,
            expectedVersion: draft?.version ?? 0,
            quest: parsed.data,
          },
          "Draft saved. Submit when you are ready for review.",
        );
        if (result) onSaved(result);
      }}
    >
      <fieldset
        disabled={frozen || action.busy}
        className="preference-fieldset"
      >
        <label>
          Quest title
          <input
            name="title"
            required
            minLength={3}
            maxLength={100}
            defaultValue={q?.title}
          />
        </label>
        <label>
          The premise in one sentence
          <textarea
            name="hook"
            required
            rows={2}
            maxLength={260}
            defaultValue={q?.hook}
          />
        </label>
        <div className="form-grid">
          <label>
            Category
            <select name="category" defaultValue={q?.category ?? "daytime"}>
              {CATEGORIES.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Intensity
            <select name="intensity" defaultValue={q?.intensity ?? "chill"}>
              {INTENSITIES.map((intensity) => (
                <option value={intensity.id} key={intensity.id}>
                  {intensity.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Duration before travel (minutes)
            <input
              name="duration"
              type="number"
              required
              min="15"
              max="720"
              defaultValue={q?.durationMinutes ?? 30}
            />
          </label>
          <label>
            Preparation
            <select
              name="preparation"
              defaultValue={q?.preparation ?? "start_now"}
            >
              <option value="start_now">Start now</option>
              <option value="a_few_things">Collect a few things</option>
              <option value="proper_setup">A proper setup</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Minimum participants
            <input
              name="minParticipants"
              type="number"
              required
              min="1"
              max="12"
              defaultValue={q?.minParticipants ?? 1}
            />
          </label>
          <label>
            Maximum participants
            <input
              name="maxParticipants"
              type="number"
              required
              min="1"
              max="12"
              defaultValue={q?.maxParticipants ?? 4}
            />
          </label>
        </div>
        <fieldset className="community-options">
          <legend>Suitable settings</legend>
          {["home", "outside", "venue"].map((setting) => (
            <label className="check-row" key={setting}>
              <input
                type="checkbox"
                name="settings"
                value={setting}
                defaultChecked={
                  q ? q.settings.includes(setting as never) : setting === "home"
                }
              />
              {words(setting)}
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <label>
            Minimum expected cost (USD)
            <input
              name="costMin"
              type="number"
              required
              min="0"
              step="0.01"
              defaultValue={(q?.cost.minMinor ?? 0) / 100}
            />
          </label>
          <label>
            Maximum expected cost (USD)
            <input
              name="costMax"
              type="number"
              required
              min="0"
              step="0.01"
              defaultValue={(q?.cost.maxMinor ?? 0) / 100}
            />
          </label>
        </div>
        <label>
          Cost applies to
          <select name="costScope" defaultValue={q?.cost.scope ?? "total"}>
            <option value="total">The whole group</option>
            <option value="per_person">Each person</option>
          </select>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            name="venueCostUnknown"
            defaultChecked={q?.cost.venueCostUnknown}
          />
          Additional venue cost needs confirmation
        </label>
        <label>
          What does the estimate include?
          <input
            name="costNote"
            required
            maxLength={400}
            defaultValue={q?.cost.note}
          />
        </label>
        <label>
          Instructions & participation requirements · one per line
          <textarea
            name="instructions"
            rows={5}
            required
            maxLength={4000}
            defaultValue={q?.requirements.join("\n")}
          />
        </label>
        <label>
          Materials · one per line
          <textarea
            name="materials"
            rows={3}
            maxLength={2000}
            defaultValue={q?.materials.join("\n")}
          />
        </label>
        <h2>Three filming moments</h2>
        <p className="support">
          Each moment needs an action and a way to film it. Participants still
          choose their own 5–15 second clips.
        </p>
        {[0, 1, 2].map((index) => (
          <section className="original-beat" key={index}>
            <h3>Moment {index + 1}</h3>
            <label>
              Short label
              <input
                name={`label${index}`}
                required
                maxLength={40}
                defaultValue={q?.beats[index].label}
              />
            </label>
            <label>
              What happens
              <textarea
                name={`action${index}`}
                rows={2}
                required
                maxLength={700}
                defaultValue={q?.beats[index].action}
              />
            </label>
            <label>
              What to film
              <textarea
                name={`filming${index}`}
                rows={2}
                required
                maxLength={400}
                defaultValue={q?.beats[index].filming}
              />
            </label>
          </section>
        ))}
        <details className="community-panel">
          <summary>Participation requirements & matching</summary>
          <p className="support">
            Mark everything this quest involves. These selections enforce the
            viewer’s own boundaries and eligibility.
          </p>
          {FLAGS.map(([key, label]) => (
            <label className="check-row" key={key}>
              <input name={key} type="checkbox" defaultChecked={q?.[key]} />
              {label}
            </label>
          ))}
          <fieldset className="community-options">
            <legend>This quest involves</legend>
            {BOUNDARIES.map((boundary) => (
              <label className="check-row" key={boundary}>
                <input
                  type="checkbox"
                  name="conflicts"
                  value={boundary}
                  defaultChecked={q?.conflicts.includes(boundary as never)}
                />
                {words(boundary)}
              </label>
            ))}
          </fieldset>
          <fieldset className="community-options">
            <legend>Relevant interests</legend>
            {INTEREST_OPTIONS.map((interest) => (
              <label className="check-row" key={interest.value}>
                <input
                  type="checkbox"
                  name="interests"
                  value={interest.value}
                  defaultChecked={q?.interests.includes(interest.value)}
                />
                {interest.label}
              </label>
            ))}
          </fieldset>
        </details>
        <label>
          Completion check
          <textarea
            name="completion"
            rows={2}
            required
            maxLength={300}
            placeholder="What should someone confirm after completing this quest?"
            defaultValue={q?.completionQuestions[0]}
          />
        </label>
        <label>
          Fallback if the plan cannot go ahead
          <textarea
            name="fallback"
            rows={2}
            required
            maxLength={600}
            defaultValue={q?.fallback}
          />
        </label>
        {!frozen && (
          <Button type="submit" busy={action.busy}>
            Save original quest
          </Button>
        )}
      </fieldset>
      {error && <Notice error>{error}</Notice>}
      {action.feedback}
    </form>
  );
}
export default function OriginalQuest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const current = useCommunity("draft", { id }, Boolean(id));
  const action = useCommunityAction(current.refresh);
  const draft = current.data;
  if (current.error)
    return (
      <>
        <Back to="/profile" />
        <Notice error>{current.error}</Notice>
      </>
    );
  if (id && !draft) return <Loading />;
  return (
    <>
      <Back to="/create">Create</Back>
      <PageTitle
        title={draft ? draft.quest.title : "A quest only you would invent."}
      >
        Give someone else enough detail to make their own version. Original
        quests need operator review before they become available.
      </PageTitle>
      {draft && (
        <>
          <StateTag state={draft.state} />
          {draft.reviewNotes && <Notice>{draft.reviewNotes}</Notice>}
          {draft.state === "submitted" && (
            <Notice>
              Your quest is waiting for review. Nothing has been published yet.
            </Notice>
          )}
          {draft.state === "approved" && (
            <div className="section">
              <TryQuest id={draft.templateId || draft.quest.id} />
              <Link
                className="text-button"
                to={`/quests/${draft.templateId || draft.quest.id}`}
              >
                View approved instructions
              </Link>
            </div>
          )}
        </>
      )}
      <DraftForm
        key={draft ? `${draft.id}-${draft.version}` : "new"}
        draft={draft}
        onSaved={(saved) => {
          if (id) current.refresh();
          else navigate(`/originals/${saved.id}`, { replace: true });
        }}
      />
      {draft && ["draft", "rejected"].includes(draft.state) && (
        <section className="section">
          <Button
            busy={action.busy}
            onClick={() =>
              action.run(
                "draft_submit",
                { id: draft.id, expectedVersion: draft.version },
                "Quest submitted for operator review.",
              )
            }
          >
            Submit saved quest for review
          </Button>
          <p className="support">
            Only the last saved version is submitted. Reviewers check
            instructions, requirements and eligibility before approval.
          </p>
        </section>
      )}
      {action.feedback}
    </>
  );
}
