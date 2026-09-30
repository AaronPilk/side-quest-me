import type { Hono } from "hono";
import { z } from "zod";
import {
  communityMutationSchema,
  communityReadSchema,
  type CommunityView,
} from "../shared/community";
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
import { servePrivateObject } from "./media";

/** Include this in the main API allowlist; public routes are registered before its auth middleware. */
export const COMMUNITY_PRIVATE_ROUTE =
  /^\/api\/community\/(?:me|activity|offers(?:\/[^/]+(?:\/media)?)?|drafts\/[^/]+|brand|operator|mutate)$/;

const uuid = z.uuid();
const empty = z.object({}).strict();
const mediaQuerySchema = z
  .object({
    thumbnail: z.literal("1").optional(),
    download: z.literal("1").optional(),
  })
  .strict();
const mediaGrantSchema = z
  .object({
    object_key: z.string().min(1).max(1024),
    mime: z.literal("video/mp4"),
    bytes: z.number().int().positive(),
    thumbnail_key: z.string().min(1).max(1024).nullable().optional(),
  })
  .strict();

async function publicAccess(c: AppContext) {
  if (c.env.API_RATE_LIMITER) {
    const { success } = await c.env.API_RATE_LIMITER.limit({
      key: `network:${c.req.header("CF-Connecting-IP") || "local"}`,
    });
    if (!success)
      throw new ApiError(
        "rate_limited",
        "Wait a minute before trying again.",
        429,
      );
  }
  // An invalid supplied credential must never silently become an anonymous request.
  if (c.req.header("Authorization")) await authenticate(c);
  else c.set("serviceDb", serviceDb(c.env));
}

function communityError(message: string): never {
  const messages: Record<string, [ApiError["status"], string]> = {
    stale_version: [
      409,
      "This item changed. Refresh and review its latest version before trying again.",
    ],
    creator_profile_required: [
      422,
      "Save your public creator name before publishing or submitting a quest.",
    ],
    reel_unavailable: [
      409,
      "A completed quest and ready rendered reel are required before publishing.",
    ],
    post_removed: [
      403,
      "An operator removed this post. It cannot be republished here.",
    ],
    draft_locked: [
      409,
      "This quest is under review or already approved. Refresh its current state.",
    ],
    self_review_forbidden: [
      403,
      "Another operator must review your own submission or transaction.",
    ],
    brand_inquiries_unavailable: [
      409,
      "The creator is not accepting brand inquiries for this video.",
    ],
    active_offer_exists: [
      409,
      "An active offer already exists for this video. Continue that offer instead.",
    ],
    offer_closed: [
      409,
      "This offer is no longer open for a response. Review its current status.",
    ],
    offer_suspended: [
      403,
      "An operator suspended this licensing exchange. Negotiation, fulfillment, and commercial downloads are unavailable.",
    ],
    commercial_access_unavailable: [
      403,
      "Commercial download requires verified fulfillment, an approved business, and an active agreed usage period.",
    ],
    other_party_required: [
      403,
      "The other party must respond to the current proposal.",
    ],
    proposer_required: [
      403,
      "Only the current proposer can cancel this proposal.",
    ],
    offer_unavailable: [
      409,
      "This licensing offer is no longer available. Review its current status.",
    ],
    invalid_terms: [
      422,
      "Check the payment, usage period, channels, and agreed fee.",
    ],
    fulfillment_evidence_required: [
      422,
      "Record verified payment and permission evidence before completing fulfillment.",
    ],
    invalid_quest: [
      422,
      "Check the quest instructions and required planning details.",
    ],
    stale_offer: [
      409,
      "This offer changed. Review its current terms before responding.",
    ],
    stale_terms: [
      409,
      "These terms changed. Review the latest offer before responding.",
    ],
    brand_approval_required: [
      403,
      "An operator must approve this business before it can make offers.",
    ],
    licensing_unavailable: [
      409,
      "This video is not available for new brand inquiries.",
    ],
    fulfillment_required: [
      403,
      "Commercial download is available after verified manual fulfillment, during the agreed usage period.",
    ],
    usage_period_inactive: [
      403,
      "The agreed commercial usage period is not currently active.",
    ],
    draft_unavailable: [404, "This quest draft is unavailable."],
    post_unavailable: [404, "This post is unavailable."],
    blocked: [403, "This interaction is unavailable."],
  };
  const code = Object.keys(messages).find((value) => message.includes(value));
  if (code) throw new ApiError(code, messages[code][1], messages[code][0]);
  dbError(message);
}

async function read(c: AppContext, view: CommunityView, input: unknown = {}) {
  const { data, error } = await c.get("serviceDb").rpc("sq_community_read", {
    p_actor: c.get("actor") || null,
    p_view: view,
    p_input: communityReadSchema.parse(input),
  });
  if (error) communityError(error.message);
  // SQL constructs explicit view-specific DTOs. No table rows or storage keys are serialized here.
  return c.json(data);
}

async function media(
  c: AppContext,
  postId: string | null,
  offerId: string | null,
) {
  const query = mediaQuerySchema.parse(c.req.query());
  const { data, error } = await c.get("serviceDb").rpc("sq_community_media", {
    p_actor: c.get("actor") || null,
    p_post: postId,
    p_offer: offerId,
  });
  if (error) communityError(error.message);
  const parsed = mediaGrantSchema.safeParse(data);
  if (!parsed.success)
    throw new ApiError("not_found", "This video is unavailable.", 404);
  const grant = parsed.data;
  const key = query.thumbnail ? grant.thumbnail_key : grant.object_key;
  if (!key)
    throw new ApiError("not_found", "This thumbnail is unavailable.", 404);
  // Authorization is evaluated for every request, including range requests and downloads.
  // An offer's completed state and active license period are checked by the authorization RPC.
  return servePrivateObject(
    c.req.raw,
    c.env,
    key,
    query.thumbnail ? "image/jpeg" : grant.mime,
  );
}

/** Public metadata/media use optional authenticated identity so blocks apply to signed-in viewers. */
export function registerCommunityPublic(app: Hono<AppBindings>) {
  app.get("/api/community/feed", async (c) => {
    await publicAccess(c);
    const input = feedQuerySchema.parse(c.req.query());
    if (input.followingOnly && !c.get("actor"))
      throw new ApiError(
        "sign_in_required",
        "Sign in to see creators you follow.",
        401,
      );
    return read(c, "feed", input);
  });
  app.get("/api/community/posts/:id", async (c) => {
    const postId = uuid.parse(c.req.param("id"));
    empty.parse(c.req.query());
    await publicAccess(c);
    return read(c, "post", { id: postId });
  });
  app.get("/api/community/creators/:id", async (c) => {
    const creatorId = uuid.parse(c.req.param("id"));
    empty.parse(c.req.query());
    await publicAccess(c);
    return read(c, "creator", { id: creatorId });
  });
  app.get("/api/community/posts/:id/media", async (c) => {
    const postId = uuid.parse(c.req.param("id"));
    await publicAccess(c);
    return media(c, postId, null);
  });
}

const feedQuerySchema = communityReadSchema
  .omit({ id: true })
  .extend({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    followingOnly: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    brandOnly: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  })
  .strict();

/** These handlers must be registered after the main authenticated API middleware. */
export function registerCommunityPrivate(app: Hono<AppBindings>) {
  app.use("/api/community/*", async (c, next) => {
    if (!uuid.safeParse(c.get("actor")).success)
      throw new ApiError("sign_in_required", "Sign in to continue.", 401);
    await next();
  });
  for (const view of ["me", "activity", "offers", "brand", "operator"] as const)
    app.get(`/api/community/${view}`, (c) => {
      empty.parse(c.req.query());
      return read(c, view);
    });
  app.get("/api/community/offers/:id", (c) => {
    empty.parse(c.req.query());
    return read(c, "offer", { id: uuid.parse(c.req.param("id")) });
  });
  app.get("/api/community/drafts/:id", (c) => {
    empty.parse(c.req.query());
    return read(c, "draft", { id: uuid.parse(c.req.param("id")) });
  });
  app.get("/api/community/offers/:id/media", (c) =>
    media(c, null, uuid.parse(c.req.param("id"))),
  );
  app.post("/api/community/mutate", async (c) => {
    const mutation = await json(c, communityMutationSchema);
    const key = c.req.header("Idempotency-Key");
    if (!key || !/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new ApiError(
        "invalid_idempotency_key",
        "Refresh and try this action again.",
        422,
      );
    const { data, error } = await c
      .get("serviceDb")
      .rpc("sq_community_mutate", {
        p_actor: c.get("actor"),
        p_action: mutation.action,
        p_input: mutation.input,
        p_key: key,
        p_hash: await hash(mutation),
      });
    if (error) communityError(error.message);
    return c.json(data);
  });
}
