import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Check,
  Infinity as InfinityIcon,
  ListOrdered,
  Layers,
  LockKeyhole,
  Plus,
  Trash2,
} from "lucide-react";
import {
  nextSeriesPartBlocker,
  seriesSaveSchema,
  seriesPartInputSchema,
  seriesCoverSchema,
  withNextSeriesPart,
  withPartPublished,
  type SeriesDetail,
  type SeriesSave,
  type SeriesSummary,
  type SeriesTemplate,
} from "../../shared/series";
import { seriesApi } from "../lib/series-api";
import { api } from "../lib/api";
import type { Run } from "../lib/types";
import { DEMO } from "../lib/auth";
import { currentProfileDraftOwner } from "../lib/profile-drafts";
import { rememberReturnTo } from "../lib/internal-return";
import { Button, Empty, Loading, Notice, useResource } from "../components/ui";
import { Planning, useCommunity, words } from "../components/Community";
import "../series-design.css";
import { DiscoverSections } from "../components/DiscoverSections";
import { ContentReviewPermission } from "../components/ContentReviewPermission";
import { CONTENT_REVIEW_PERMISSION_MESSAGE } from "../../shared/content-review";

function SeriesCard({ series }: { series: SeriesSummary }) {
  return (
    <Link
      className={`series-card series-cover-${series.cover}`}
      to={`/series/${series.id}`}
    >
      <span className="series-card-art">
        <Layers size={28} aria-hidden="true" />
        <span className="series-card-kind">
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
        <span className="series-card-footer">
          <span>
            <span className="series-card-author">By {series.authorName}</span>
            <span className="series-card-count">
              {series.publishedPartCount}{" "}
              {series.publishedPartCount === 1 ? "part" : "parts"} available
            </span>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
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
      <div className="section-heading profile-series-heading">
        <h2>{own ? "Your series" : "Series"}</h2>
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
            ? "A series starts from a quest you did. Open a saved quest in your journal and turn it into a series."
            : "No published series yet."}
        </p>
      )}
      <Link className="button secondary profile-series-browse" to="/series">
        <Layers size={17} aria-hidden="true" /> Browse all series
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </section>
  );
}

function SeriesLibrary({ signedIn }: { signedIn: boolean }) {
  const [mine, setMine] = useState(false);
  const list = useResource(() => seriesApi.list(undefined, mine), [mine]);
  return (
    <section className="series-library" aria-labelledby="series-library-title">
      <header className="series-library-heading">
        <div>
          <h1 id="series-library-title">Series</h1>
          <p>One adventure. More chapters.</p>
        </div>
      </header>
      <DiscoverSections current="series" />
      <div className="series-tabs" role="group" aria-label="Series collection">
        <button
          type="button"
          className={!mine ? "selected" : ""}
          aria-pressed={!mine}
          aria-controls="series-collection"
          onClick={() => setMine(false)}
        >
          Explore
        </button>
        {signedIn && (
          <button
            type="button"
            className={mine ? "selected" : ""}
            aria-pressed={mine}
            aria-controls="series-collection"
            onClick={() => setMine(true)}
          >
            Your series
          </button>
        )}
      </div>
      <div id="series-collection" className="series-collection">
        {list.error ? (
          <div className="series-library-error">
            <Notice error>{list.error}</Notice>
            <Button secondary onClick={list.refresh}>
              Retry
            </Button>
          </div>
        ) : !list.data ? (
          <div className="series-library-loading">
            <Loading />
          </div>
        ) : list.data.length ? (
          <div className="series-grid">
            {list.data.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        ) : (
          <div className="series-library-empty">
            <span className="series-empty-mark" aria-hidden="true">
              <Layers size={28} />
            </span>
            <span className="eyebrow">A STORY WORTH CONTINUING</span>
            <h2>
              {mine
                ? "Your next story starts with a quest."
                : "Be part of the first chapter."}
            </h2>
            <p>
              {mine
                ? "Do a quest, then turn it into a series from your journal. Part two is the same quest, filmed again."
                : "A series is one quest told in parts. Find your next adventure while new series take shape."}
            </p>
            <div className="series-empty-actions">
              <Link className="button" to="/create">
                Find a quest <ArrowRight size={17} aria-hidden="true" />
              </Link>
              {mine && (
                <Link className="button secondary" to="/journal">
                  Open your journal <ArrowRight size={17} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SeriesView({ id, signedIn }: { id: string; signedIn: boolean }) {
  const detail = useResource(() => seriesApi.detail(id), [id]);
  const navigate = useNavigate();
  const location = useLocation();
  const justSaved =
    (location.state as { seriesSaved?: string } | null)?.seriesSaved === id;
  const pendingPart = useRef<
    | (ReturnType<typeof withNextSeriesPart> & {
        key: ReturnType<typeof crypto.randomUUID>;
      })
    | undefined
  >(undefined);
  const publishKeys = useRef(
    new Map<string, ReturnType<typeof crypto.randomUUID>>(),
  );
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
  const [contentReviewConsent, setContentReviewConsent] = useState(false);
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
  const nextBlocker = series.isOwner ? nextSeriesPartBlocker(series) : null;
  const finished = (partId: string) =>
    Boolean(signedIn && completed.has(partId));
  /** Adds the next part of the same quest, then opens Create to accept it. */
  async function createNextPart() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // An ambiguous response must retry both the original part identity and
      // its exact payload, not merely reuse the same idempotency key.
      if (!pendingPart.current || pendingPart.current.save.id !== series.id)
        pendingPart.current = {
          ...withNextSeriesPart(series),
          key: crypto.randomUUID(),
        };
      const pending = pendingPart.current;
      const saved = await seriesApi.save(pending.save, pending.key);
      const part = saved.parts.find(
        (candidate) => candidate.id === pending.partId,
      );
      if (!part)
        throw new Error(
          "The saved part could not be found. Refresh your series before continuing.",
        );
      pendingPart.current = undefined;
      navigate(createUrl(part.id, part.templateId));
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  async function publishPart(partId: string) {
    if (busy) return;
    if (!contentReviewConsent) {
      setError(CONTENT_REVIEW_PERMISSION_MESSAGE);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const key = publishKeys.current.get(partId) ?? crypto.randomUUID();
      publishKeys.current.set(partId, key);
      await seriesApi.save(
        withPartPublished(series, partId),
        key,
        contentReviewConsent,
      );
      publishKeys.current.delete(partId);
      detail.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="series-detail">
      <Link className="back" to="/series">
        <ArrowLeft size={16} /> Series
      </Link>
      <header className={`series-hero series-cover-${series.cover}`}>
        <Layers size={32} aria-hidden="true" />
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
        ) : series.isOwner && signedIn ? (
          current && !finished(current.id) ? (
            <Link
              className="button"
              to={createUrl(current.id, current.templateId)}
            >
              Film Part {current.position} <ArrowRight size={17} />
            </Link>
          ) : (
            <Button
              busy={busy}
              disabled={Boolean(nextBlocker)}
              onClick={createNextPart}
            >
              <Plus size={17} aria-hidden="true" /> Create Part{" "}
              {series.parts.length + 1}
            </Button>
          )
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
          <Link className="button secondary" to={`/series/${id}/edit`}>
            Edit series
          </Link>
        )}
      </div>
      {series.isOwner && (
        <p className="support">
          {nextBlocker
            ? nextBlocker
            : series.state === "draft"
              ? "Your series is private. Each new part is the same quest, filmed again. Publish a part when its video is ready to be seen."
              : "Each new part is the same quest, filmed again. New parts stay private until you publish them."}
        </p>
      )}
      {justSaved && series.isOwner && (
        <Notice>
          Series saved privately. Your quest is Part 1. Create Part 2 whenever
          you’re ready to film it again.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      {series.isOwner &&
        signedIn &&
        series.parts.some((part) => !part.published && finished(part.id)) && (
          <ContentReviewPermission
            scope="series"
            checked={contentReviewConsent}
            onChange={setContentReviewConsent}
            disabled={busy}
          />
        )}
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
                      {series.isOwner
                        ? completed.has(part.id)
                          ? "Film this part again"
                          : `Film Part ${part.position}`
                        : completed.has(part.id)
                          ? "Try this part again"
                          : "Try your own version"}
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                  {series.isOwner &&
                    signedIn &&
                    !part.published &&
                    finished(part.id) && (
                      <Button
                        secondary
                        busy={busy}
                        disabled={!contentReviewConsent}
                        onClick={() => void publishPart(part.id)}
                      >
                        Publish Part {part.position}
                      </Button>
                    )}
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

const seriesEditorDraftSchema = z
  .object({
    ownerId: z.uuid(),
    step: z.number().int().min(0).max(3),
    furthestStep: z.number().int().min(0).max(3),
    draft: z
      .object({
        id: z.uuid().optional(),
        expectedVersion: z.number().int().min(0),
        title: z.string().max(100),
        premise: z.string().max(800),
        cover: seriesCoverSchema,
        kind: z.enum(["finite", "ongoing"]),
        state: z.enum(["draft", "published"]),
        parts: z
          .array(
            seriesPartInputSchema.extend({
              title: z.string().max(100),
              templateId: z.string().max(120),
            }),
          )
          .min(1)
          .max(40),
      })
      .strict(),
  })
  .strict();

function coverForCategory(
  category: Run["quest"]["category"],
): SeriesSave["cover"] {
  return category === "late_night"
    ? "night"
    : category === "street_challenges"
      ? "ocean"
      : category === "daytime"
        ? "forest"
        : "sunrise";
}
function initialSeriesDraft(
  existing?: SeriesDetail,
  sourceRun?: Run,
): SeriesSave {
  return existing
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
        // The quest names the series until the author changes it.
        title: sourceRun?.quest.title ?? "",
        premise: sourceRun?.quest.hook ?? "",
        cover: sourceRun
          ? coverForCategory(sourceRun.quest.category)
          : "sunrise",
        kind: "ongoing",
        state: "draft",
        parts: [
          {
            id: crypto.randomUUID(),
            title: sourceRun?.quest.title ?? "",
            templateId: sourceRun?.quest.id ?? "",
            prerequisitePartId: null,
            prerequisiteReason: "",
            published: true,
          },
        ],
      };
}

function SeriesEditorForm({
  existing,
  templates,
  ownerId,
  sourceRun,
}: {
  existing?: SeriesDetail;
  templates: SeriesTemplate[];
  ownerId: string;
  sourceRun?: Run;
}) {
  const navigate = useNavigate();
  const storageKey = `sq-series-editor:${ownerId}:${existing?.id ?? sourceRun?.id ?? "new"}`;
  // Turning a finished quest into a series is one screen: the quest already
  // supplies the story. Editing an existing series keeps the guided steps.
  const steps = sourceRun ? ["Story"] : ["Story", "Format", "Parts", "Review"];
  const [initial] = useState(() => {
    const fallback = {
      ownerId,
      draft: initialSeriesDraft(existing, sourceRun),
      step: 0,
      furthestStep: 0,
      restored: false,
    };
    try {
      const saved = seriesEditorDraftSchema.safeParse(
        JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      );
      if (
        saved.success &&
        saved.data.ownerId === ownerId &&
        saved.data.draft.id === existing?.id &&
        saved.data.draft.expectedVersion === (existing?.version ?? 0) &&
        (!sourceRun ||
          (saved.data.draft.parts.length === 1 &&
            saved.data.draft.parts[0].templateId === sourceRun.quest.id))
      ) {
        return {
          ...saved.data,
          step: Math.min(saved.data.step, steps.length - 1),
          furthestStep: Math.min(saved.data.furthestStep, steps.length - 1),
          restored: true,
        };
      }
    } catch {
      /* Invalid or unavailable local drafts never replace saved series. */
    }
    return fallback;
  });
  const [draft, setDraft] = useState<SeriesSave>(initial.draft);
  const [step, setStep] = useState(initial.step);
  const [furthestStep, setFurthestStep] = useState(initial.furthestStep);
  const [busy, setBusy] = useState(false);
  const [contentReviewConsent, setContentReviewConsent] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const mounted = useRef(true);
  const saved = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingSave = useRef(false);
  const saveKeys = useRef(
    new Map<string, ReturnType<typeof crypto.randomUUID>>(),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (saved.current) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ownerId, draft, step, furthestStep }),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [draft, step, furthestStep, storageKey, ownerId]);
  const locked = new Set(
    existing?.parts.filter((p) => p.locked).map((p) => p.id) ?? [],
  );
  // All saved attempts keep their original part, including canceled history.
  const attempted = new Set([
    ...(existing?.parts
      .filter((part) => part.attempted)
      .map((part) => part.id) ?? []),
    ...(existing?.progress?.completedPartIds ?? []),
    ...(existing?.progress?.activeRunId && existing.progress.currentPartId
      ? [existing.progress.currentPartId]
      : []),
  ]);
  const finiteLocked =
    draft.kind === "finite" && Boolean(existing?.formatLocked);
  function goTo(next: number) {
    setError("");
    setStep(next);
    setFurthestStep((previous) => Math.max(previous, next));
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
  }
  function advance() {
    if (step === 0 && (!draft.title.trim() || !draft.premise.trim())) {
      setError(
        "Give your series a title and a short premise before continuing.",
      );
      return;
    }
    if (steps[step] === "Parts") {
      const parsed = seriesSaveSchema.safeParse({ ...draft, state: "draft" });
      if (!parsed.success) {
        setError(
          parsed.error.issues[0]?.message ||
            "Choose a quest and title for each part.",
        );
        return;
      }
    }
    goTo(step + 1);
  }
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
    if (
      attempted.has(draft.parts[index].id) ||
      attempted.has(draft.parts[index + direction].id)
    )
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
    if (pendingSave.current) return;
    setError("");
    if (state === "published" && !sourceRun && !contentReviewConsent) {
      setError(CONTENT_REVIEW_PERMISSION_MESSAGE);
      return;
    }
    if (sourceRun && (!draft.title.trim() || !draft.premise.trim())) {
      setError("Give your series a title and a short premise.");
      return;
    }
    const parsed = seriesSaveSchema.safeParse({ ...draft, state });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Review the series details.");
      return;
    }
    pendingSave.current = true;
    setBusy(true);
    const expectedOwner = `${DEMO ? "demo" : "user"}:${ownerId}`;
    try {
      if (
        (await currentProfileDraftOwner()) !== expectedOwner ||
        !mounted.current
      )
        return;
      const input = sourceRun
        ? {
            runId: sourceRun.id,
            title: parsed.data.title,
            premise: parsed.data.premise,
            cover: parsed.data.cover,
            kind: parsed.data.kind,
          }
        : parsed.data;
      const fingerprint = JSON.stringify(input);
      const key = saveKeys.current.get(fingerprint) ?? crypto.randomUUID();
      saveKeys.current.set(fingerprint, key);
      const result = sourceRun
        ? await seriesApi.startFromRun(
            input as Parameters<typeof seriesApi.startFromRun>[0],
            key,
          )
        : await seriesApi.save(parsed.data, key, contentReviewConsent);
      if (
        !mounted.current ||
        (await currentProfileDraftOwner()) !== expectedOwner
      )
        return;
      saved.current = true;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* Durable save succeeded. */
      }
      // Land on the series so the next step, creating Part 2, is right there.
      navigate(`/series/${result.id}`, {
        replace: true,
        state: sourceRun ? { seriesSaved: result.id } : undefined,
      });
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      pendingSave.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const review = steps[step] === "Review";
  const stageCopy =
    steps[step] === "Story"
      ? [
          "What connects your quests?",
          "A simple title and one sentence are enough. You can change them later.",
        ]
      : steps[step] === "Format"
        ? [
            "Let the story take shape.",
            "Leave room for the next chapter, even if you haven’t planned it yet.",
          ]
        : steps[step] === "Parts"
          ? [
              "Choose your first chapters.",
              "Each part is a quest people can try. Start with one and add more later.",
            ]
          : [
              "Your story, ready when you are.",
              "Save privately first, or publish when you’re ready to share.",
            ];
  return (
    <section
      className="series-editor-wizard"
      aria-labelledby="series-editor-title"
    >
      <div className="series-editor-top">
        <Link
          className="back"
          to={
            sourceRun
              ? `/runs/${sourceRun.id}`
              : existing
                ? `/series/${existing.id}`
                : "/series"
          }
        >
          <ArrowLeft size={17} aria-hidden="true" />{" "}
          {sourceRun ? "Your quest" : "Series"}
        </Link>
        <span className="series-draft-status" role="status">
          {storageError ? "Draft storage unavailable" : "Saved on this device"}
        </span>
      </div>
      <header className="series-editor-heading">
        <h1 id="series-editor-title" ref={heading} tabIndex={-1}>
          {existing
            ? "Edit your series"
            : sourceRun
              ? "Turn this quest into a series"
              : "Start a series"}
        </h1>
        <p>
          {sourceRun && steps[step] === "Story"
            ? "This quest becomes Part 1. Your video and progress stay with it; Part 2 is the same quest, filmed again."
            : stageCopy[1]}
        </p>
      </header>
      {steps.length > 1 && (
        <div className="series-editor-progress">
          <progress
            aria-label="Series setup progress"
            value={step + 1}
            max={steps.length}
          />
          <nav aria-label="Series setup steps">
            {steps.map((name, index) => (
              <button
                key={name}
                type="button"
                disabled={busy || index > furthestStep}
                aria-current={index === step ? "step" : undefined}
                onClick={() => goTo(index)}
              >
                {name}
                <span className="sr-only">
                  {index === step
                    ? `, step ${index + 1} of ${steps.length}`
                    : ""}
                </span>
              </button>
            ))}
          </nav>
        </div>
      )}
      <form
        className="series-editor"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (review || sourceRun) void persist("draft");
          else advance();
        }}
      >
        <div className="series-editor-stage" key={step}>
          <h2 className="sr-only">{stageCopy[0]}</h2>
          {steps[step] === "Story" && (
            <div className="series-story-fields">
              <label>
                Series title
                <input
                  required
                  maxLength={100}
                  placeholder="e.g. Our Friday detours"
                  autoComplete="off"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, title: event.target.value }))
                  }
                />
              </label>
              <label>
                Premise
                <textarea
                  aria-label="Premise"
                  aria-describedby="series-premise-hint"
                  required
                  maxLength={800}
                  rows={3}
                  placeholder="e.g. One new place, one unexpected challenge, every Friday."
                  value={draft.premise}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, premise: event.target.value }))
                  }
                />
                <span id="series-premise-hint" className="series-field-hint">
                  {sourceRun
                    ? "Prefilled from the quest. Change it if you like."
                    : "What ties these adventures together?"}
                </span>
              </label>
              {sourceRun && (
                <fieldset className="series-cover-options">
                  <legend>Cover</legend>
                  {(
                    [
                      ["sunrise", "Sunrise"],
                      ["forest", "Forest"],
                      ["ocean", "Ocean"],
                      ["night", "Night"],
                    ] as const
                  ).map(([cover, title]) => (
                    <label
                      key={cover}
                      className={`series-cover-option series-cover-${cover} ${draft.cover === cover ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="series-cover"
                        aria-label={title}
                        value={cover}
                        checked={draft.cover === cover}
                        onChange={() => setDraft((d) => ({ ...d, cover }))}
                      />
                      <span className="series-cover-swatch">
                        <Layers size={22} aria-hidden="true" />
                        {draft.cover === cover && (
                          <Check size={18} aria-hidden="true" />
                        )}
                      </span>
                      <span>{title}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}
          {steps[step] === "Format" && (
            <>
              <fieldset className="series-format-options">
                <legend>Story format</legend>
                {(
                  [
                    [
                      "ongoing",
                      "Growing story",
                      "Start with one quest. Add chapters whenever inspiration hits.",
                      InfinityIcon,
                    ],
                    [
                      "finite",
                      "Planned story",
                      "A complete set of quests. Publish all parts together.",
                      ListOrdered,
                    ],
                  ] as const
                ).map(([kind, title, copy, Icon]) => (
                  <label
                    key={kind}
                    className={`series-format-option ${draft.kind === kind ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="story-format"
                      aria-label={title}
                      value={kind}
                      checked={draft.kind === kind}
                      disabled={Boolean(existing?.formatLocked)}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          kind,
                          parts:
                            kind === "finite"
                              ? d.parts.map((part) => ({
                                  ...part,
                                  published: true,
                                }))
                              : d.parts,
                        }))
                      }
                    />
                    <Icon size={22} aria-hidden="true" />
                    <span>
                      <strong>{title}</strong>
                      <small className="sr-only">{copy}</small>
                    </span>
                    {draft.kind === kind && (
                      <Check size={19} aria-hidden="true" />
                    )}
                  </label>
                ))}
                <p className="series-field-hint">
                  {draft.kind === "ongoing"
                    ? "Start with one quest. Add chapters whenever inspiration hits."
                    : "A complete set of quests. Publish all parts together."}
                </p>
              </fieldset>
              {existing?.formatLocked && (
                <p className="support">
                  The format stays fixed after the series is first published.
                </p>
              )}
              <fieldset className="series-cover-options">
                <legend>Cover</legend>
                {(
                  [
                    ["sunrise", "Sunrise"],
                    ["forest", "Forest"],
                    ["ocean", "Ocean"],
                    ["night", "Night"],
                  ] as const
                ).map(([cover, title]) => (
                  <label
                    key={cover}
                    className={`series-cover-option series-cover-${cover} ${draft.cover === cover ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="series-cover"
                      aria-label={title}
                      value={cover}
                      checked={draft.cover === cover}
                      onChange={() => setDraft((d) => ({ ...d, cover }))}
                    />
                    <span className="series-cover-swatch">
                      <Layers size={22} aria-hidden="true" />
                      {draft.cover === cover && (
                        <Check size={18} aria-hidden="true" />
                      )}
                    </span>
                    <span>{title}</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {steps[step] === "Parts" && (
            <>
              <div className="series-editor-parts">
                {draft.parts.map((part, index) => {
                  const frozen = locked.has(part.id);
                  const hasDependents = draft.parts.some(
                    (other) => other.prerequisitePartId === part.id,
                  );
                  const savedPart = existing?.parts.find(
                    (p) => p.id === part.id,
                  );
                  const selected = templates.find(
                    (template) => template.id === part.templateId,
                  );
                  return (
                    <fieldset className="series-edit-part" key={part.id}>
                      <legend>
                        Part {index + 1}
                        {frozen ? " · Linked content locked" : ""}
                      </legend>
                      {attempted.has(part.id) && !frozen && (
                        <p className="series-field-hint">
                          This part has a saved attempt and stays in its
                          original place. You can edit its title and
                          requirements for future attempts.
                        </p>
                      )}
                      <label>
                        Part title
                        <input
                          required
                          disabled={frozen}
                          maxLength={100}
                          placeholder="Name this chapter"
                          value={part.title}
                          onChange={(event) =>
                            partChange(index, { title: event.target.value })
                          }
                        />
                      </label>
                      <div className="series-selected-quest">
                        <span className="series-field-label">
                          Reviewed quest
                        </span>
                        {part.templateId && (
                          <div className="series-quest-summary">
                            <Layers size={19} aria-hidden="true" />
                            <span>
                              <strong>
                                {savedPart?.quest.title ??
                                  selected?.title ??
                                  "Selected quest"}
                              </strong>
                              <small>
                                {words(
                                  savedPart?.quest.intensity ??
                                    selected?.intensity ??
                                    "",
                                )}{" "}
                                · Version{" "}
                                {savedPart?.templateVersion ??
                                  selected?.version}
                              </small>
                            </span>
                          </div>
                        )}
                      </div>
                      <details className="series-part-options">
                        <summary>Part options</summary>
                        <label>
                          Prerequisite
                          <select
                            aria-label="Prerequisite"
                            disabled={frozen}
                            value={part.prerequisitePartId ?? ""}
                            onChange={(event) =>
                              partChange(index, {
                                prerequisitePartId: event.target.value || null,
                                ...(!event.target.value
                                  ? { prerequisiteReason: "" }
                                  : {}),
                              })
                            }
                          >
                            <option value="">None · Start independently</option>
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
                              onChange={(event) =>
                                partChange(index, {
                                  prerequisiteReason: event.target.value,
                                })
                              }
                            />
                          </label>
                        )}
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={part.published}
                            onChange={(event) =>
                              partChange(index, {
                                published: event.target.checked,
                              })
                            }
                          />
                          <span>
                            Include this part when the series is published
                          </span>
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
                              attempted.has(part.id) ||
                              draft.parts
                                .slice(index + 1)
                                .some(
                                  (later) =>
                                    attempted.has(later.id) ||
                                    locked.has(later.id),
                                ) ||
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
                          <p className="series-field-hint">
                            Required parts stay before the parts that need them.
                            Clear the prerequisite before removing its required
                            part.
                          </p>
                        )}
                      </details>
                    </fieldset>
                  );
                })}
              </div>
              <p className="series-field-hint">
                New parts come from doing the quest again: open your series and
                choose Create Part {draft.parts.length + 1}. Here you can rename
                draft parts, choose which parts are public, and reorder parts
                that nobody has attempted yet.
              </p>
            </>
          )}
          {review && (
            <>
              <div
                className={`series-review-cover series-cover-${draft.cover}`}
              >
                <Layers size={25} aria-hidden="true" />
                <span>
                  {draft.kind === "ongoing" ? "GROWING STORY" : "PLANNED STORY"}
                </span>
                <h3>{draft.title}</h3>
                <p>{draft.premise}</p>
              </div>
              <div className="series-review-actions">
                <button type="button" onClick={() => goTo(0)}>
                  Edit story
                </button>
                <button type="button" onClick={() => goTo(1)}>
                  Edit format
                </button>
                {!sourceRun && (
                  <button type="button" onClick={() => goTo(2)}>
                    Edit parts
                  </button>
                )}
              </div>
              <ol className="series-review-parts">
                {draft.parts.map((part, index) => (
                  <li key={part.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{part.title}</strong>
                      <small>
                        {sourceRun
                          ? "Your existing quest · Video and progress kept"
                          : part.published
                            ? "Included when published"
                            : "Private future chapter"}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="series-field-hint">
                {sourceRun
                  ? "This saves a private series and connects this quest as chapter one. Add future parts from your series whenever you’re ready."
                  : "Saving a draft keeps the series private. Publishing a series shares its quest instructions; your videos stay private until you choose to publish them separately."}
              </p>
            </>
          )}
        </div>
        {error && <Notice error>{error}</Notice>}
        <div className="series-editor-footer">
          {step > 0 && (
            <Button
              type="button"
              secondary
              disabled={busy}
              onClick={() => goTo(step - 1)}
            >
              <ArrowLeft size={17} aria-hidden="true" /> Back
            </Button>
          )}
          {sourceRun ? (
            <Button type="submit" busy={busy}>
              Turn into a series <ArrowRight size={17} aria-hidden="true" />
            </Button>
          ) : !review ? (
            <Button type="submit">
              Continue <ArrowRight size={17} aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" busy={busy}>
              {existing?.state === "published"
                ? "Save as private draft"
                : "Save draft"}
              <LockKeyhole size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
        {review && !sourceRun && (
          <>
            <ContentReviewPermission
              scope="series"
              checked={contentReviewConsent}
              onChange={setContentReviewConsent}
              disabled={busy}
            />
            <Button
              className="series-publish-action"
              type="button"
              secondary
              busy={busy}
              disabled={!contentReviewConsent}
              onClick={() => persist("published")}
            >
              Publish series <ArrowRight size={17} aria-hidden="true" />
            </Button>
          </>
        )}
        <p className="series-editor-footnote">
          {initial.restored ? "Your draft was restored. " : ""}
          {storageError
            ? "Leave this screen open until you save."
            : "Leave and come back. Your draft stays on this device."}
        </p>
      </form>
    </section>
  );
}

function SeriesEditor({ id }: { id?: string }) {
  const location = useLocation();
  const sourceRunId = !id
    ? new URLSearchParams(location.search).get("run")
    : null;
  const me = useCommunity("me");
  const detail = useResource(
    () => (id ? seriesApi.detail(id) : Promise.resolve(undefined)),
    [id],
  );
  const source = useResource(
    () => (sourceRunId ? api.run(sourceRunId) : Promise.resolve(undefined)),
    [sourceRunId],
  );
  const templates = useResource(seriesApi.templates);
  if (me.error || detail.error || templates.error || source.error)
    return (
      <Notice error>
        {me.error || detail.error || templates.error || source.error}{" "}
        <button
          className="text-button"
          onClick={() => {
            me.refresh();
            detail.refresh();
            templates.refresh();
            source.refresh();
          }}
        >
          Retry series editor
        </button>
      </Notice>
    );
  if (
    !me.data ||
    !templates.data ||
    (id && !detail.data) ||
    (sourceRunId && !source.data)
  )
    return <Loading />;
  if (!id && !source.data)
    return (
      <Empty title="A series starts with a quest you did.">
        <p>
          Accept a quest, film it, then turn it into a series from the quest or
          your journal. Part 2 is the same quest, filmed again.
        </p>
        <Link className="button" to="/create">
          Find a quest
        </Link>
        <Link className="button secondary" to="/journal">
          Open your journal
        </Link>
      </Empty>
    );
  if (!me.data.creator)
    return (
      <Empty title="Give your series an author.">
        <p>Create your public profile before starting a series.</p>
        <Link
          className="button"
          to="/profile"
          state={{ seriesReturn: `${location.pathname}${location.search}` }}
        >
          Create public profile
        </Link>
        {source.data && (
          <Link className="button secondary" to={`/runs/${source.data.id}`}>
            Return to quest
          </Link>
        )}
      </Empty>
    );
  if (detail.data && !detail.data.isOwner)
    return <Notice error>Only the author can edit this series.</Notice>;
  if (source.data?.series)
    return (
      <Empty title="This quest is already part of a series.">
        <Link className="button" to={`/series/${source.data.series.id}`}>
          Open series
        </Link>
        <Link className="button secondary" to={`/runs/${source.data.id}`}>
          Return to quest
        </Link>
      </Empty>
    );
  if (source.data?.status === "abandoned")
    return (
      <Notice error>
        A canceled quest cannot become a series. Choose an active or completed
        quest from your journal.
      </Notice>
    );
  return (
    <SeriesEditorForm
      key={`${me.data.userId}:${detail.data?.id ?? source.data?.id ?? "new"}:${detail.data?.version ?? 0}`}
      existing={detail.data}
      templates={templates.data}
      ownerId={me.data.userId}
      sourceRun={source.data}
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
