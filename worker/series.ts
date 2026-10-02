import type { Hono } from "hono";
import { z } from "zod";
import {
  seriesSaveSchema,
  seriesStartFromRunSchema,
  type SeriesSave,
} from "../shared/series";
import { CONTENT_REVIEW_CONSENT_HEADER } from "../shared/content-review";
import { questVariantSchema, type QuestVariant } from "../shared/domain";
import {
  assertPublicTextAllowed,
  requireContentReviewPermission,
} from "./content-moderation";
import {
  ApiError,
  authenticate,
  dbError,
  hash,
  json,
  serviceDb,
  type AppBindings,
  type AppContext,
} from "./services";
export const SERIES_PRIVATE_ROUTE =
  /^\/api\/series\/(?:mine|templates|mutate)$/;
const uuid = z.uuid();
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), input: seriesSaveSchema }).strict(),
  z
    .object({
      action: z.literal("start_from_run"),
      input: seriesStartFromRunSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("follow"),
      input: z.object({ id: uuid, following: z.boolean() }).strict(),
    })
    .strict(),
]);
const publicReviewSchema = z.object({
  title: z.string(),
  premise: z.string(),
  parts: z.array(
    z.object({
      title: z.string(),
      prerequisiteReason: z.string(),
      quest: questVariantSchema,
    }),
  ),
});
const reviewPreflightSchema = z.union([
  z.object({ replay: z.record(z.string(), z.unknown()) }),
  z.object({ requiresReview: z.literal(false) }),
  z.object({
    requiresReview: z.literal(true),
    publicContent: publicReviewSchema,
  }),
]);
function questText(quest: QuestVariant) {
  return [
    quest.title,
    quest.hook,
    quest.sponsorDisclosure ?? "",
    quest.cost.note,
    ...quest.interests,
    ...quest.beats.flatMap((beat) => [
      beat.label,
      beat.action,
      beat.filming,
      beat.caption,
    ]),
    ...quest.materials,
    ...quest.requirements,
    ...quest.completionQuestions,
    quest.fallback,
  ];
}
function publicText(input: z.infer<typeof publicReviewSchema>) {
  return [
    input.title,
    input.premise,
    ...input.parts.flatMap((part) => [
      part.title,
      part.prerequisiteReason,
      ...questText(part.quest),
    ]),
  ];
}
async function reviewPublicSeries(
  c: AppContext,
  input: SeriesSave,
  key: string,
  requestHash: string,
) {
  if (input.state !== "published") return;
  // This service-only RPC checks completed replay before versions, then derives
  // the exact canonical quest snapshots that the mutation will make public.
  // Client-selected private/foreign snapshots never enter the provider request.
  const { data, error } = await c
    .get("serviceDb")
    .rpc("sq_series_review_preflight", {
      p_actor: c.get("actor"),
      p_input: input,
      p_key: key,
      p_hash: requestHash,
    });
  if (error) seriesError(error.message);
  const preflight = reviewPreflightSchema.safeParse(data);
  if (!preflight.success)
    throw new ApiError(
      "series_unavailable",
      "This series is not available.",
      404,
    );
  if ("replay" in preflight.data) return preflight.data.replay;
  if (!preflight.data.requiresReview) return;
  requireContentReviewPermission(c.req.header(CONTENT_REVIEW_CONSENT_HEADER));
  await assertPublicTextAllowed(
    c.env,
    publicText(preflight.data.publicContent),
  );
}
export function seriesError(message: string): never {
  const mapping: Record<string, string> = {
    series_unavailable: "This series or part is not available.",
    series_inspiration_mismatch:
      "This video belongs to a different series part. Open its own series link to try that episode.",
    series_prerequisite:
      "Complete the required earlier part before starting this one.",
    series_template_mismatch:
      "This part belongs to a different quest version. Open the series again.",
    invalid_prerequisite:
      "A prerequisite must be an earlier part with a reason, published before this part.",
    published_part_immutable:
      "Started parts keep their order and quest version. Published parts also keep their titles and requirements. Add a new part to continue the story.",
    published_series_immutable:
      "A published finite series keeps its planned parts and type.",
    invalid_series: "Review the series title, parts, and publication choices.",
    creator_profile_required:
      "Save your public creator profile before creating a series.",
    stale_version: "This series changed. Refresh it before saving again.",
    series_run_unavailable:
      "Choose one of your active or completed quests to start a series.",
    series_run_linked:
      "This quest already belongs to a series. Open that series to continue it.",
  };
  const code = Object.keys(mapping).find((key) => message.includes(key));
  if (code)
    throw new ApiError(
      code,
      mapping[code],
      code === "series_unavailable" ? 404 : 409,
    );
  return dbError(message);
}
async function read(
  c: AppContext,
  view: string,
  input: Record<string, unknown> = {},
) {
  const { data, error } = await c.get("serviceDb").rpc("sq_series_read", {
    p_actor: c.get("actor") ?? null,
    p_view: view,
    p_input: input,
  });
  if (error) seriesError(error.message);
  return c.json(data);
}
async function publicAccess(c: AppContext) {
  if (c.env.API_RATE_LIMITER) {
    const r = await c.env.API_RATE_LIMITER.limit({
      key: `network:${c.req.header("CF-Connecting-IP") || "local"}`,
    });
    if (!r.success)
      throw new ApiError(
        "rate_limited",
        "Wait a moment before trying again.",
        429,
      );
  }
  if (c.req.header("Authorization")) await authenticate(c);
  else c.set("serviceDb", serviceDb(c.env));
}
export function registerSeriesPublic(app: Hono<AppBindings>) {
  app.get("/api/series", async (c) => {
    const query = z
      .object({ creatorId: uuid.optional() })
      .strict()
      .parse(c.req.query());
    await publicAccess(c);
    return read(c, "list", query);
  });
  app.get("/api/series/parts/:id", async (c) => {
    const id = uuid.parse(c.req.param("id"));
    z.object({}).strict().parse(c.req.query());
    await publicAccess(c);
    return read(c, "part", { id });
  });
  // Fixed private routes must pass through the root authenticated middleware.
  app.get("/api/series/:id", async (c, next) => {
    if (["mine", "templates", "mutate"].includes(c.req.param("id")))
      return next();
    const id = uuid.parse(c.req.param("id"));
    z.object({}).strict().parse(c.req.query());
    await publicAccess(c);
    return read(c, "detail", { id });
  });
}
export function registerSeriesPrivate(app: Hono<AppBindings>) {
  app.get("/api/series/mine", (c) => read(c, "list", { mine: true }));
  app.get("/api/series/templates", (c) => read(c, "templates"));
  app.post("/api/series/mutate", async (c) => {
    const operation = await json(c, mutationSchema, 128 * 1024);
    const key = c.req.header("Idempotency-Key");
    if (!key || !/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new ApiError(
        "invalid_idempotency_key",
        "Refresh and try again.",
        422,
      );
    const requestHash = await hash(operation);
    if (operation.action === "save") {
      const replay = await reviewPublicSeries(
        c,
        operation.input,
        key,
        requestHash,
      );
      if (replay) return c.json(replay);
    }
    const { data, error } = await c.get("serviceDb").rpc("sq_series_mutate", {
      p_actor: c.get("actor"),
      p_action: operation.action,
      p_input: operation.input,
      p_key: key,
      p_hash: requestHash,
    });
    if (error) seriesError(error.message);
    return c.json(data);
  });
}
