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
  const current = published.find(
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
