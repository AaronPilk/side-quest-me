import { z } from "zod";
import type { QuestVariant } from "./domain";
const uuid = z.uuid();
export const seriesCoverSchema = z.enum([
  "sunrise",
  "forest",
  "ocean",
  "night",
]);
export type SeriesContext = {
  id: string;
  title: string;
  partId: string;
  partTitle: string;
  position: number;
};
/** An existing personal attempt becomes the first episode without being replayed. */
export const seriesStartFromRunSchema = z
  .object({
    runId: uuid,
    title: z.string().trim().min(1).max(100),
    premise: z.string().trim().min(1).max(800),
    cover: seriesCoverSchema,
    kind: z.enum(["finite", "ongoing"]),
  })
  .strict();
export type SeriesStartFromRun = z.infer<typeof seriesStartFromRunSchema>;
export const seriesPartInputSchema = z
  .object({
    id: uuid,
    title: z.string().trim().min(1).max(100),
    templateId: z.string().min(1).max(120),
    prerequisitePartId: uuid.nullable(),
    prerequisiteReason: z.string().trim().max(300),
    published: z.boolean(),
  })
  .strict();
export const seriesSaveSchema = z
  .object({
    id: uuid.optional(),
    expectedVersion: z.number().int().min(0),
    title: z.string().trim().min(1).max(100),
    premise: z.string().trim().min(1).max(800),
    cover: seriesCoverSchema,
    kind: z.enum(["finite", "ongoing"]),
    state: z.enum(["draft", "published"]),
    parts: z.array(seriesPartInputSchema).min(1).max(40),
  })
  .strict()
  .superRefine((series, ctx) => {
    const ids = new Set<string>();
    for (const [index, part] of series.parts.entries()) {
      if (ids.has(part.id))
        ctx.addIssue({
          code: "custom",
          path: ["parts", index, "id"],
          message: "Each part needs its own identity.",
        });
      if (
        part.prerequisitePartId &&
        (!ids.has(part.prerequisitePartId) || !part.prerequisiteReason)
      )
        ctx.addIssue({
          code: "custom",
          path: ["parts", index, "prerequisitePartId"],
          message: "Choose an earlier part and explain why it is required.",
        });
      if (!part.prerequisitePartId && part.prerequisiteReason)
        ctx.addIssue({
          code: "custom",
          path: ["parts", index, "prerequisiteReason"],
          message: "Independent parts do not need a prerequisite reason.",
        });
      if (
        part.published &&
        part.prerequisitePartId &&
        !series.parts.find((p) => p.id === part.prerequisitePartId)?.published
      )
        ctx.addIssue({
          code: "custom",
          path: ["parts", index, "published"],
          message: "Publish the prerequisite before its dependent part.",
        });
      ids.add(part.id);
    }
    if (
      series.state === "published" &&
      (!series.parts.some((p) => p.published) ||
        (series.kind === "finite" && !series.parts.every((p) => p.published)))
    )
      ctx.addIssue({
        code: "custom",
        path: ["parts"],
        message:
          "Publish every planned part of a finite series, or at least one part of an ongoing series.",
      });
  });
export type SeriesSave = z.infer<typeof seriesSaveSchema>;
export type SeriesPart = z.infer<typeof seriesPartInputSchema> & {
  position: number;
  locked: boolean;
  /** Owner-only history flag; older saved DTOs may omit it. */
  attempted?: boolean;
  templateVersion: number;
  quest: QuestVariant;
  available: boolean;
  unavailableReason: string | null;
};
export type SeriesSummary = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  premise: string;
  cover: z.infer<typeof seriesCoverSchema>;
  kind: "finite" | "ongoing";
  state: "draft" | "published";
  version: number;
  partCount: number;
  publishedPartCount: number;
  following: boolean;
  followerCount: number;
  createdAt: string;
};
export type SeriesProgress = {
  completedPartIds: string[];
  currentPartId: string | null;
  activeRunId: string | null;
  complete: boolean;
  caughtUp: boolean;
};
export type SeriesDetail = SeriesSummary & {
  parts: SeriesPart[];
  progress: SeriesProgress | null;
  isOwner: boolean;
  formatLocked: boolean;
};
export type SeriesTemplate = {
  id: string;
  title: string;
  version: number;
  category: string;
  intensity: string;
};

/** Finalization, not viewing, publishing, or following, advances a personal attempt. */
export function deriveSeriesProgress(
  series: Pick<SeriesDetail, "id" | "kind" | "parts">,
  runs: { id: string; status: string; series?: SeriesContext }[],
): SeriesProgress {
  const linked = runs.filter((run) => run.series?.id === series.id);
  const completedPartIds = [
    ...new Set(
      linked
        .filter((run) => run.status === "finalized")
        .map((run) => run.series!.partId),
    ),
  ];
  const completed = new Set(completedPartIds);
  const active = linked.find((run) =>
    ["accepted", "in_progress", "review_needed"].includes(run.status),
  );
  const published = series.parts.filter((part) => part.published);
  // Availability already encodes publication for other viewers; the author
  // can be pointed at their own unpublished next part.
  const current = series.parts.find(
    (part) =>
      !completed.has(part.id) &&
      part.available &&
      (!part.prerequisitePartId || completed.has(part.prerequisitePartId)),
  );
  const caughtUp =
    published.length > 0 && published.every((part) => completed.has(part.id));
  return {
    completedPartIds,
    currentPartId: active?.series?.partId ?? current?.id ?? null,
    activeRunId: active?.id ?? null,
    complete: series.kind === "finite" && caughtUp,
    caughtUp: series.kind === "ongoing" && caughtUp,
  };
}

/** The editable save payload for an existing series, exactly as stored. */
export function seriesSaveFromDetail(series: SeriesDetail): SeriesSave {
  return {
    id: series.id,
    expectedVersion: series.version,
    title: series.title,
    premise: series.premise,
    cover: series.cover,
    kind: series.kind,
    state: series.state,
    parts: series.parts.map(
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
  };
}

export const SERIES_MAX_PARTS = 40;

/** Why the author cannot add the next part right now, or null when they can. */
export function nextSeriesPartBlocker(
  series: Pick<SeriesDetail, "kind" | "formatLocked" | "parts" | "isOwner">,
): string | null {
  if (!series.isOwner) return "Only the author can add a part.";
  if (!series.parts.length) return "This series has no first part yet.";
  if (!series.parts[0].available)
    return (
      series.parts[0].unavailableReason ||
      "This series’s original quest is no longer available for a new part."
    );
  if (series.kind === "finite" && series.formatLocked)
    return "A published planned story keeps its part count. Growing stories can add parts.";
  if (series.parts.length >= SERIES_MAX_PARTS)
    return `A series holds up to ${SERIES_MAX_PARTS} parts.`;
  return null;
}

/** A series grows by doing the same quest again: the next part repeats the
 * quest the series started from, as a new private part the author attempts
 * with their own outing. Nothing already saved is changed. */
export function withNextSeriesPart(series: SeriesDetail): {
  save: SeriesSave;
  partId: string;
  templateId: string;
  position: number;
} {
  const blocker = nextSeriesPartBlocker(series);
  if (blocker) throw new Error(blocker);
  const save = seriesSaveFromDetail(series);
  const source = series.parts[0];
  const partId = crypto.randomUUID();
  const position = save.parts.length + 1;
  save.parts.push({
    id: partId,
    title: `Part ${position}`,
    templateId: source.templateId,
    prerequisitePartId: null,
    prerequisiteReason: "",
    published: false,
  });
  return { save, partId, templateId: source.templateId, position };
}

/** Publishing a part the author has finished. A growing story becomes public
 * with its first published part; a planned (finite) story only goes public once
 * every part is published, so earlier parts keep their draft state until then. */
export function withPartPublished(
  series: SeriesDetail,
  partId: string,
): SeriesSave {
  const save = seriesSaveFromDetail(series);
  const part = save.parts.find((candidate) => candidate.id === partId);
  if (!part) throw new Error("This part is not in the series.");
  part.published = true;
  if (
    series.kind === "ongoing" ||
    save.parts.every((candidate) => candidate.published)
  )
    save.state = "published";
  return save;
}
