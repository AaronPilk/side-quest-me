import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Check,
  Layers,
  LockKeyhole,
  Plus,
  Trash2,
} from "lucide-react";
import {
  seriesSaveSchema,
  type SeriesDetail,
  type SeriesSave,
  type SeriesSummary,
  type SeriesTemplate,
} from "../../shared/series";
import { seriesApi } from "../lib/series-api";
import { rememberReturnTo } from "../lib/internal-return";
import {
  Button,
  Empty,
  Loading,
  Notice,
  PageTitle,
  useResource,
} from "../components/ui";
import { Planning, useCommunity, words } from "../components/Community";
import "../series-design.css";

function SeriesCard({ series }: { series: SeriesSummary }) {
  return (
    <Link
      className={`series-card series-cover-${series.cover}`}
      to={`/series/${series.id}`}
    >
      <span className="series-card-art">
        <Layers size={34} />
        <span>
          {series.state === "draft"
            ? "Draft"
            : series.kind === "ongoing"
              ? "Ongoing"
              : `${series.publishedPartCount} parts`}
        </span>
      </span>
      <span className="series-card-body">
        <strong>{series.title}</strong>
        <small>{series.premise}</small>
        <span>
          {series.authorName} · {series.publishedPartCount}{" "}
          {series.publishedPartCount === 1 ? "part" : "parts"} available{" "}
          <ArrowRight size={15} />
        </span>
      </span>
    </Link>
  );
}
export function SeriesProfileList({
  creatorId,
  own = false,
}: {
  creatorId: string;
  own?: boolean;
}) {
  const list = useResource(
    () => seriesApi.list(creatorId, own),
    [creatorId, own],
  );
  return (
    <section className="profile-series">
      <div className="section-heading">
        <h2>{own ? "Your series" : "Series"}</h2>
        {own && (
          <Link className="text-button" to="/series/new">
            <Plus size={16} /> New series
          </Link>
        )}
      </div>
      {list.error ? (
        <Notice error>
          {list.error}{" "}
          <button className="text-button" onClick={list.refresh}>
            Retry
          </button>
        </Notice>
      ) : !list.data ? (
        <Loading />
      ) : list.data.length ? (
        <div className="series-grid">
          {list.data.map((s) => (
            <SeriesCard key={s.id} series={s} />
          ))}
        </div>
      ) : (
        <p className="support">
          {own
            ? "One story, more than one quest. Start a series from reviewed quests."
            : "No published series yet."}
        </p>
      )}
    </section>
  );
}

function SeriesLibrary({ signedIn }: { signedIn: boolean }) {
  const [mine, setMine] = useState(false);
  const list = useResource(() => seriesApi.list(undefined, mine), [mine]);
  return (
    <>
      <PageTitle eyebrow="ONE STORY. MORE TO COME." title="Series">
        A real-world adventure, one quest at a time.
      </PageTitle>
      <div className="series-toolbar">
        <Link
          className="button"
          to={signedIn ? "/series/new" : "/account"}
          onClick={() => {
            if (!signedIn) rememberReturnTo("/series/new");
          }}
        >
          <Plus size={18} /> Create a series
        </Link>
        <div
          className="series-tabs"
          role="group"
          aria-label="Series collection"
        >
          <button
            className={!mine ? "selected" : ""}
            onClick={() => setMine(false)}
          >
            Explore
          </button>
          {signedIn && (
            <button
              className={mine ? "selected" : ""}
              onClick={() => setMine(true)}
            >
              Your series
            </button>
          )}
        </div>
      </div>
      {list.error ? (
        <Notice error>
          {list.error}{" "}
          <button className="text-button" onClick={list.refresh}>
            Retry
          </button>
        </Notice>
      ) : !list.data ? (
        <Loading />
      ) : list.data.length ? (
        <div className="series-grid">
          {list.data.map((s) => (
            <SeriesCard key={s.id} series={s} />
          ))}
        </div>
      ) : (
        <Empty
          title={
            mine
              ? "Your next story starts here."
              : "The first stories are still being written."
          }
        >
          Create a series or explore a single quest while creators prepare their
          next parts.
        </Empty>
      )}
    </>
  );
}

function SeriesView({ id, signedIn }: { id: string; signedIn: boolean }) {
  const detail = useResource(() => seriesApi.detail(id), [id]);
  useEffect(() => {
    if (!detail.data || !location.hash.startsWith("#part-")) return;
    const partId = location.hash.slice(6);
    if (detail.data.parts.some((part) => part.id === partId))
      document
        .getElementById(`part-${partId}`)
        ?.scrollIntoView({ block: "start" });
  }, [detail.data]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (detail.error)
    return (
      <Notice error>
        {detail.error}{" "}
        <button className="text-button" onClick={detail.refresh}>
          Retry
        </button>
      </Notice>
    );
  if (!detail.data) return <Loading />;
  const series = detail.data,
    progress = signedIn ? series.progress : null,
    completed = new Set(progress?.completedPartIds ?? []);
  const current = progress
    ? series.parts.find((p) => p.id === progress.currentPartId)
    : series.parts.find((p) => p.available);
  const createUrl = (partId: string, templateId: string) =>
    `/create?${new URLSearchParams({ template: templateId, seriesPart: partId })}`;
  return (
    <div className="series-detail">
      <Link className="back" to="/series">
        <ArrowLeft size={16} /> Series
      </Link>
      <header className={`series-hero series-cover-${series.cover}`}>
        <Layers size={40} />
        <span className="eyebrow">
          {series.state === "draft"
            ? "PRIVATE DRAFT"
            : series.kind === "finite"
              ? `${series.publishedPartCount} PART STORY`
              : `${series.publishedPartCount} PARTS AVAILABLE · ONGOING`}
        </span>
        <h1>{series.title}</h1>
        <p>{series.premise}</p>
        <Link to={`/creators/${series.authorId}`}>By {series.authorName}</Link>
      </header>
      <div className="series-toolbar">
        {progress?.activeRunId ? (
          <Link className="button" to={`/runs/${progress.activeRunId}`}>
            Continue your attempt <ArrowRight size={17} />
          </Link>
        ) : current && series.state === "published" ? (
          <Link
            className="button"
            to={createUrl(current.id, current.templateId)}
          >
            {completed.size ? "Continue series" : "Start series"}
            <ArrowRight size={17} />
          </Link>
        ) : null}
        {series.state === "published" &&
          (progress ? (
            <Button
              secondary
              busy={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await seriesApi.follow(id, !series.following);
                  detail.refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Bell size={17} />
              {series.following ? "Following · Unfollow" : "Follow series"}
            </Button>
          ) : (
            <Link
              className="button secondary"
              to="/account"
              onClick={() => rememberReturnTo(`/series/${id}`)}
            >
              Sign in to follow
            </Link>
          ))}
        {signedIn && series.isOwner && (
          <Link className="text-button" to={`/series/${id}/edit`}>
            Edit series
          </Link>
        )}
      </div>
      {error && <Notice error>{error}</Notice>}
      {progress && (completed.size > 0 || progress.activeRunId) && (
        <div className="series-progress" role="status">
          <Check size={18} />
          <span>
            {progress.complete
              ? "Series complete."
              : progress.caughtUp
                ? "Caught up with the available parts."
                : `${completed.size} ${completed.size === 1 ? "part" : "parts"} completed.`}{" "}
            Your progress is private.
          </span>
        </div>
      )}
      <p className="support">
        Follow for new published parts in Activity. Each part uses your own
        plans, clips, and existing quest rewards. Watching never marks a part
        complete.
      </p>
      <ol className="series-parts">
        {series.parts.map((part) => {
          const isActive =
            progress?.currentPartId === part.id && progress.activeRunId;
          return (
            <li id={`part-${part.id}`} key={part.id} className="series-part">
              <div className="series-part-number">
                {completed.has(part.id) ? (
                  <Check size={18} />
                ) : (
                  String(part.position).padStart(2, "0")
                )}
              </div>
              <div className="series-part-content">
                <div className="eyebrow">
                  Part {part.position}
                  {series.kind === "finite" ? ` of ${series.partCount}` : ""}
                  {!part.published
                    ? " · Draft"
                    : completed.has(part.id)
                      ? " · Completed"
                      : ""}
                </div>
                <h2>{part.title}</h2>
                <p>{part.quest.hook}</p>
                <p className="support">
                  {part.quest.title} · {words(part.quest.intensity)} ·{" "}
                  {part.quest.durationMinutes} min ·{" "}
                  {part.quest.minParticipants}–{part.quest.maxParticipants}{" "}
                  people
                </p>
                <p className="support">
                  {part.prerequisitePartId
                    ? `Requires an earlier part: ${part.prerequisiteReason}`
                    : "Independent part · Start on its own."}
                </p>
                {part.unavailableReason && (
                  <p className="series-part-lock">
                    <LockKeyhole size={15} />
                    {part.unavailableReason}
                  </p>
                )}
                <div className="series-part-actions">
                  {isActive ? (
                    <Link
                      className="button secondary"
                      to={`/runs/${progress.activeRunId}`}
                    >
                      Resume this part
                    </Link>
                  ) : part.available ? (
                    <Link
                      className="button secondary"
                      to={createUrl(part.id, part.templateId)}
                    >
                      {completed.has(part.id)
                        ? "Try this part again"
                        : "Try your own version"}
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
                <details className="series-part-preview">
                  <summary>Preview this part</summary>
                  <div>
                    <p>
                      <strong>
                        {part.quest.title} · Version {part.templateVersion}
                      </strong>
                    </p>
                    <p>{part.quest.hook}</p>
                    <Planning quest={part.quest} />
                    <p className="support">{part.quest.cost.note}</p>
                    <ol>
                      {part.quest.beats.map((beat) => (
                        <li key={beat.label}>
                          <strong>{beat.label}</strong>
                          <p>{beat.action}</p>
                          <p className="support">Film: {beat.filming}</p>
                        </li>
                      ))}
                    </ol>
                    <p>
                      <strong>What you’ll need</strong>
                    </p>
                    <ul>
                      {[
                        ...part.quest.requirements,
                        ...part.quest.materials,
                      ].map((requirement, i) => (
                        <li key={i}>{requirement}</li>
                      ))}
                    </ul>
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="fine-print">
        Publishing each video is your choice. A video license covers only its
        agreed video and usage period; it never includes other or future parts.
        Series completion has no extra reward bonus.
      </p>
    </div>
  );
}

function SeriesEditorForm({
  existing,
  templates,
}: {
  existing?: SeriesDetail;
  templates: SeriesTemplate[];
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<SeriesSave>(() =>
    existing
      ? {
          id: existing.id,
          expectedVersion: existing.version,
          title: existing.title,
          premise: existing.premise,
          cover: existing.cover,
          kind: existing.kind,
          state: existing.state,
          parts: existing.parts.map(
            ({
              id,
              title,
              templateId,
              prerequisitePartId,
              prerequisiteReason,
              published,
            }) => ({
              id,
              title,
              templateId,
              prerequisitePartId,
              prerequisiteReason,
              published,
            }),
          ),
        }
      : {
          expectedVersion: 0,
          title: "",
          premise: "",
          cover: "sunrise",
          kind: "finite",
          state: "draft",
          parts: [
            {
              id: crypto.randomUUID(),
              title: "",
              templateId: "",
              prerequisitePartId: null,
              prerequisiteReason: "",
              published: true,
            },
          ],
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = new Set(
    existing?.parts.filter((p) => p.locked).map((p) => p.id) ?? [],
  );
  const [questSearch, setQuestSearch] = useState("");
  const [questIntensity, setQuestIntensity] = useState("");
  const matchingTemplates = templates.filter(
    (template) =>
      (!questIntensity || template.intensity === questIntensity) &&
      `${template.title} ${words(template.category)} ${words(template.intensity)}`
        .toLowerCase()
        .includes(questSearch.trim().toLowerCase()),
  );
  const matchingTemplateIds = new Set(
    matchingTemplates.map((template) => template.id),
  );
  const finiteLocked = draft.kind === "finite" && locked.size > 0;
  function partChange(
    index: number,
    patch: Partial<SeriesSave["parts"][number]>,
  ) {
    setDraft((d) => ({
      ...d,
      parts: d.parts.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }
  function canMove(index: number, direction: number) {
    if (index + direction < 0 || index + direction >= draft.parts.length)
      return false;
    const parts = [...draft.parts];
    [parts[index], parts[index + direction]] = [
      parts[index + direction],
      parts[index],
    ];
    const earlier = new Set<string>();
    return parts.every((part) => {
      if (part.prerequisitePartId && !earlier.has(part.prerequisitePartId))
        return false;
      earlier.add(part.id);
      return true;
    });
  }
  function move(index: number, direction: number) {
    if (!canMove(index, direction)) return;
    setDraft((d) => {
      const parts = [...d.parts];
      [parts[index], parts[index + direction]] = [
        parts[index + direction],
        parts[index],
      ];
      return { ...d, parts };
    });
  }
  async function persist(state: SeriesSave["state"]) {
    setError("");
    const parsed = seriesSaveSchema.safeParse({ ...draft, state });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Review the series details.");
      return;
    }
    setBusy(true);
    try {
      const saved = await seriesApi.save(parsed.data);
      navigate(`/series/${saved.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        className="back"
        to={existing ? `/series/${existing.id}` : "/create"}
      >
        <ArrowLeft size={16} /> Back
      </Link>
      <PageTitle title={existing ? "Edit your series" : "Start a series"}>
        Give the story a premise. Each part is its own quest.
      </PageTitle>
      <form
        className="series-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void persist("published");
        }}
      >
        <label>
          Series title
          <input
            required
            maxLength={100}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </label>
        <label>
          Premise
          <textarea
            required
            maxLength={800}
            rows={3}
            placeholder="What connects these adventures?"
            value={draft.premise}
            onChange={(e) =>
              setDraft((d) => ({ ...d, premise: e.target.value }))
            }
          />
        </label>
        <div className="form-grid">
          <label>
            Story format
            <select
              aria-label="Story format"
              value={draft.kind}
              disabled={locked.size > 0}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  kind: e.target.value as SeriesSave["kind"],
                }))
              }
            >
              <option value="finite">Finite · A set number of parts</option>
              <option value="ongoing">Ongoing · More parts later</option>
            </select>
          </label>
          <label>
            Cover
            <select
              aria-label="Cover"
              value={draft.cover}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  cover: e.target.value as SeriesSave["cover"],
                }))
              }
            >
              <option value="sunrise">Sunrise</option>
              <option value="forest">Forest</option>
              <option value="ocean">Ocean</option>
              <option value="night">Night</option>
            </select>
          </label>
        </div>
        <p className="support">
          Choose reviewed quests below.{" "}
          <Link to="/originals/new">Write an original quest</Link> first if the
          story needs a new objective; publish it here after review.
        </p>
        <div className="form-grid">
          <label>
            Find a reviewed quest
            <input
              type="search"
              value={questSearch}
              placeholder="Search titles or categories"
              onChange={(event) => setQuestSearch(event.target.value)}
            />
          </label>
          <label>
            Filter quest intensity
            <select
              aria-label="Filter quest intensity"
              value={questIntensity}
              onChange={(event) => setQuestIntensity(event.target.value)}
            >
              <option value="">All intensities</option>
              <option value="chill">Chill</option>
              <option value="bold">Bold</option>
              <option value="full_send">Full Send</option>
            </select>
          </label>
        </div>
        <p className="support" role="status">
          {matchingTemplates.length} matching quests. Your selected quests stay
          available below.
        </p>
        <div className="series-editor-parts">
          {draft.parts.map((part, index) => {
            const frozen = locked.has(part.id);
            const hasDependents = draft.parts.some(
              (other) => other.prerequisitePartId === part.id,
            );
            const savedPart = frozen
              ? existing?.parts.find((p) => p.id === part.id)
              : undefined;
            return (
              <fieldset className="series-edit-part" key={part.id}>
                <legend>
                  Part {index + 1}
                  {frozen ? " · Published content locked" : ""}
                </legend>
                <label>
                  Part title
                  <input
                    required
                    disabled={frozen}
                    maxLength={100}
                    value={part.title}
                    onChange={(e) =>
                      partChange(index, { title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Reviewed quest
                  <select
                    aria-label="Reviewed quest"
                    required
                    disabled={frozen}
                    value={part.templateId}
                    onChange={(e) =>
                      partChange(index, { templateId: e.target.value })
                    }
                  >
                    <option value="">Choose a quest</option>
                    {savedPart && (
                      <option value={savedPart.templateId}>
                        {savedPart.quest.title} ·{" "}
                        {words(savedPart.quest.intensity)} · v
                        {savedPart.templateVersion}
                      </option>
                    )}
                    {templates
                      .filter(
                        (t) =>
                          t.id !== savedPart?.templateId &&
                          (matchingTemplateIds.has(t.id) ||
                            t.id === part.templateId),
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} · {words(t.intensity)} · v{t.version}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Prerequisite
                  <select
                    aria-label="Prerequisite"
                    disabled={frozen}
                    value={part.prerequisitePartId ?? ""}
                    onChange={(e) =>
                      partChange(index, {
                        prerequisitePartId: e.target.value || null,
                        ...(!e.target.value ? { prerequisiteReason: "" } : {}),
                      })
                    }
                  >
                    <option value="">
                      Independent · No earlier part needed
                    </option>
                    {draft.parts.slice(0, index).map((p, i) => (
                      <option value={p.id} key={p.id}>
                        Part {i + 1} · {p.title || "Untitled"}
                      </option>
                    ))}
                  </select>
                </label>
                {part.prerequisitePartId && (
                  <label>
                    Why is that part required?
                    <input
                      required
                      disabled={frozen}
                      maxLength={300}
                      value={part.prerequisiteReason}
                      onChange={(e) =>
                        partChange(index, {
                          prerequisiteReason: e.target.value,
                        })
                      }
                    />
                  </label>
                )}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={part.published}
                    onChange={(e) =>
                      partChange(index, { published: e.target.checked })
                    }
                  />
                  <span>Include this part when the series is published</span>
                </label>
                <div className="series-reorder">
                  <Button
                    type="button"
                    secondary
                    disabled={
                      frozen ||
                      !canMove(index, -1) ||
                      locked.has(draft.parts[index - 1]?.id)
                    }
                    aria-label={`Move part ${index + 1} up`}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </Button>
                  <Button
                    type="button"
                    secondary
                    disabled={
                      frozen ||
                      !canMove(index, 1) ||
                      locked.has(draft.parts[index + 1]?.id)
                    }
                    aria-label={`Move part ${index + 1} down`}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </Button>
                  <Button
                    type="button"
                    secondary
                    disabled={
                      frozen ||
                      draft.parts.length === 1 ||
                      finiteLocked ||
                      hasDependents
                    }
                    aria-label={`Remove part ${index + 1}`}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        parts: d.parts.filter((p) => p.id !== part.id),
                      }))
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
                {(part.prerequisitePartId || hasDependents) && (
                  <p className="support">
                    Required parts stay before the parts that need them. Clear a
                    part’s prerequisites before removing its required part.
                  </p>
                )}
              </fieldset>
            );
          })}
        </div>
        <Button
          type="button"
          secondary
          disabled={busy || finiteLocked || draft.parts.length >= 40}
          onClick={() =>
            setDraft((d) => ({
              ...d,
              parts: [
                ...d.parts,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  templateId: "",
                  prerequisitePartId: null,
                  prerequisiteReason: "",
                  published: false,
                },
              ],
            }))
          }
        >
          <Plus size={17} /> Add part
        </Button>
        <p className="support">
          {draft.kind === "finite"
            ? "Publish all planned parts together. Their identities and order stay fixed afterward."
            : "Publish at least one part. You can prepare later parts privately and publish them when ready."}
        </p>
        {error && <Notice error>{error}</Notice>}
        <div className="series-toolbar">
          <Button type="submit" busy={busy}>
            Publish series
          </Button>
          <Button
            type="button"
            secondary
            busy={busy}
            onClick={() => persist("draft")}
          >
            {existing?.state === "published"
              ? "Save as private draft"
              : "Save draft"}
          </Button>
        </div>
        <p className="fine-print">
          Following and viewing never award points. Each attempt uses the
          existing completion, reward, and video-publication rules.
        </p>
      </form>
    </>
  );
}
function SeriesEditor({ id }: { id?: string }) {
  const me = useCommunity("me");
  const detail = useResource(
    () => (id ? seriesApi.detail(id) : Promise.resolve(undefined)),
    [id],
  );
  const templates = useResource(seriesApi.templates);
  if (me.error || detail.error || templates.error)
    return (
      <Notice error>
        {me.error || detail.error || templates.error}{" "}
        <button
          className="text-button"
          onClick={() => {
            me.refresh();
            detail.refresh();
            templates.refresh();
          }}
        >
          Retry series editor
        </button>
      </Notice>
    );
  if (!me.data || !templates.data || (id && !detail.data)) return <Loading />;
  if (!me.data.creator)
    return (
      <Empty title="Give your series an author.">
        <p>Create your public profile before starting a series.</p>
        <Link className="button" to="/profile">
          Create public profile
        </Link>
      </Empty>
    );
  if (detail.data && !detail.data.isOwner)
    return <Notice error>Only the author can edit this series.</Notice>;
  return (
    <SeriesEditorForm
      key={detail.data?.version ?? "new"}
      existing={detail.data}
      templates={templates.data}
    />
  );
}
export default function Series({ signedIn = false }: { signedIn?: boolean }) {
  const { id } = useParams();
  const location = useLocation();
  if (
    location.pathname === "/series/new" ||
    location.pathname.endsWith("/edit")
  )
    return <SeriesEditor id={id} />;
  return id ? (
    <SeriesView id={id} signedIn={signedIn} />
  ) : (
    <SeriesLibrary signedIn={signedIn} />
  );
}
