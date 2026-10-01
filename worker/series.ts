import type { Hono } from "hono";
import { z } from "zod";
import { seriesSaveSchema, seriesStartFromRunSchema } from "../shared/series";
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
    const { data, error } = await c.get("serviceDb").rpc("sq_series_mutate", {
      p_actor: c.get("actor"),
      p_action: operation.action,
      p_input: operation.input,
      p_key: key,
      p_hash: await hash(operation),
    });
    if (error) seriesError(error.message);
    return c.json(data);
  });
}
