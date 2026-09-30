import { cleanupMedia } from "./media";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";
import {
  DEFAULT_PREFERENCES,
  outingSchema,
  profilePatchSchema,
  questVariantSchema,
  categorySchema,
} from "../shared/domain";
import { assessViability } from "../shared/viability";
import { nearbyQuerySchema } from "../shared/events";
import { searchNearbyEvents } from "./events";
import { publishedQuests } from "./catalog";
import { recommend, ineligibilityReasons } from "../shared/recommend";
import {
  ApiError,
  authenticate,
  canonical,
  clipDto,
  dbError,
  hash,
  json,
  owned,
  profileDto,
  reelDto,
  roles,
  rpc,
  runDto,
  selection,
  serviceDb,
  type AppBindings,
  type AppContext,
  type AppEnv,
} from "./services";
import {
  reserveUpload,
  uploadAndSeal,
  downloadAsset,
  servePrivateObject,
  MediaRouteError,
} from "./media";
import { consumeRenderQueue, dispatchPendingRenders } from "./render-queue";
import {
  registerCommunityPublic,
  registerCommunityPrivate,
  COMMUNITY_PRIVATE_ROUTE,
} from "./community";
import {
  registerSocialPublic,
  registerSocialPrivate,
  SOCIAL_PRIVATE_ROUTE,
  cleanupSocialPhotos,
} from "./social";
import {
  registerSeriesPublic,
  registerSeriesPrivate,
  SERIES_PRIVATE_ROUTE,
  seriesError,
} from "./series";
export { SidequestRenderer } from "./media";

const app = new Hono<AppBindings>();
const id = z.uuid();
const empty = z.object({}).strict();
app.use(
  "*",
  secureHeaders({
    crossOriginResourcePolicy: "same-origin",
    referrerPolicy: "no-referrer",
    xFrameOptions: "DENY",
  }),
);
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.header("Cache-Control", "private, no-store");
  c.header("X-Request-ID", c.get("requestId"));
  await next();
});
app.onError((e, c) => {
  const known = e instanceof ApiError || e instanceof MediaRouteError;
  const status =
    e instanceof ApiError
      ? e.status
      : e instanceof MediaRouteError
        ? [400, 401, 403, 404, 409, 413, 422, 429, 503].includes(e.status)
          ? e.status
          : 422
        : e instanceof z.ZodError
          ? 422
          : 503;
  const message =
    e instanceof ApiError
      ? e.message
      : e instanceof MediaRouteError
        ? "This clip could not be processed. Check its format and size, then retry. Your other clips are saved."
        : e instanceof z.ZodError
          ? "Check your input and try again."
          : "This service is temporarily unavailable. Your saved work is unchanged; try again.";
  console.warn(
    JSON.stringify({
      event: "request_failed",
      requestId: c.get("requestId"),
      code:
        e instanceof ApiError
          ? e.code
          : known
            ? "media_failed"
            : "dependency_failed",
    }),
  );
  return c.json(
    {
      error: {
        code: e instanceof ApiError ? e.code : "request_failed",
        message,
        requestId: c.get("requestId"),
      },
    },
    status as 422,
  );
});
app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    environment: c.env.APP_ENV,
    services: {
      databaseConfigured: Boolean(
        c.env.SUPABASE_URL && c.env.SUPABASE_SECRET_KEY,
      ),
      rendererConfigured: Boolean(c.env.RENDERER_INTERNAL_TOKEN),
    },
    demo: false,
  }),
);
app.get("/api/maps/config", (c) =>
  c.json({ token: c.env.APPLE_MAPS_TOKEN || null }),
);
app.get("/api/events/config", (c) =>
  c.json({ configured: Boolean(c.env.TICKETMASTER_API_KEY) }),
);
app.post("/api/events/nearby", async (c) => {
  if (c.env.API_RATE_LIMITER) {
    const limit = await c.env.API_RATE_LIMITER.limit({
      key: `events:${c.req.header("CF-Connecting-IP") || "unknown"}`,
    });
    if (!limit.success)
      throw new ApiError(
        "rate_limited",
        "Please wait a moment before searching again.",
        429,
      );
  }
  const query = await json(c, nearbyQuerySchema, 1024);
  try {
    return c.json(await searchNearbyEvents(query, c.env.TICKETMASTER_API_KEY));
  } catch {
    throw new ApiError(
      "events_unavailable",
      "Nearby events couldn’t load. Try again shortly or browse the event sites below.",
      503,
    );
  }
});
app.get("/api/quests/:templateId", async (c) => {
  const db = serviceDb(c.env);
  const { data, error } = await db
    .from("quest_templates")
    .select("content")
    .eq("id", c.req.param("templateId"))
    .eq("published", true)
    .single();
  if (error || !data)
    throw new ApiError(
      "not_found",
      "This quest is not currently published.",
      404,
    );
  return c.json(data.content);
});
registerCommunityPublic(app);
registerSocialPublic(app);
registerSeriesPublic(app);
app.use("/api/*", async (c, next) => {
  const knownRoutes = [
    COMMUNITY_PRIVATE_ROUTE,
    SOCIAL_PRIVATE_ROUTE,
    SERIES_PRIVATE_ROUTE,
    /^\/api\/(me|wallet|quests|quests\/recommend|quests\/viability|quest-runs|quest-runs\/active|rewards|redemptions|operator)$/,
    /^\/api\/quest-runs\/[^/]+(?:\/(abandon|uploads|clips|complete|renders|share|share-links|media))?$/,
    /^\/api\/media\/[^/]+(?:\/(upload|finalize|playback))?$/,
    /^\/api\/render-jobs\/[^/]+$/,
    /^\/api\/redemptions\/[^/]+\/(cancel|token)$/,
    /^\/api\/share-links\/[^/]+$/,
    /^\/api\/merchant\/consume$/,
    /^\/api\/operator\/(quests|reviews|sponsors|offers|offers\/pause|campaigns|campaigns\/pause|flag)$/,
    /^\/api\/operator\/reviews\/[^/]+(?:\/media\/[^/]+)?$/,
  ];
  if (!knownRoutes.some((pattern) => pattern.test(c.req.path)))
    return c.json(
      {
        error: {
          code: "not_found",
          message: "That API route does not exist.",
          requestId: c.get("requestId"),
        },
      },
      404,
    );
  if (c.env.API_RATE_LIMITER) {
    const net = await c.env.API_RATE_LIMITER.limit({
      key: `network:${c.req.header("CF-Connecting-IP") || "local"}`,
    });
    if (!net.success)
      throw new ApiError(
        "rate_limited",
        "Wait a minute before trying again.",
        429,
      );
  }
  await authenticate(c);
  if (c.env.API_RATE_LIMITER) {
    const key = `${c.get("actor")}:${c.req.method === "GET" ? "read" : "write"}`;
    const { success } = await c.env.API_RATE_LIMITER.limit({ key });
    if (!success)
      throw new ApiError(
        "rate_limited",
        "A few too many requests. Wait a minute, then try again.",
        429,
      );
  }
  if (!["GET", "HEAD"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (
      origin &&
      origin !== new URL(c.req.url).origin &&
      origin !== c.env.APP_ORIGIN
    )
      throw new ApiError(
        "origin_rejected",
        "Use the app to make this request.",
        403,
      );
  }
  await next();
});
registerCommunityPrivate(app);
registerSocialPrivate(app);
registerSeriesPrivate(app);
async function me(c: AppContext) {
  const db = c.get("serviceDb");
  const init = await db.rpc("sq_upsert_profile", {
    p_actor: c.get("actor"),
    p_input: {},
  });
  if (init.error) dbError(init.error.message);
  const [
    { data: profile, error: pError },
    { data: wallet, error: wError },
    memberships,
  ] = await Promise.all([
    c
      .get("userDb")
      .from("profiles")
      .select(
        "display_name,timezone,locale,preferences,imported_summary,onboarding_complete",
      )
      .eq("id", c.get("actor"))
      .single(),
    c
      .get("userDb")
      .from("wallets")
      .select("xp,points,version")
      .eq("owner_id", c.get("actor"))
      .single(),
    roles(c),
  ]);
  if (pError || wError)
    throw new ApiError(
      "load_failed",
      "Your profile could not be loaded. Try again.",
      503,
    );
  return {
    profile: profileDto(profile),
    wallet,
    roles: memberships.map((r) => r.role),
  };
}
app.get("/api/me", async (c) => c.json(await me(c)));
app.patch("/api/me", async (c) => {
  const p = await json(c, profilePatchSchema);
  const { error } = await c
    .get("userDb")
    .from("profiles")
    .update({
      ...(p.displayName !== undefined ? { display_name: p.displayName } : {}),
      ...(p.timezone !== undefined ? { timezone: p.timezone } : {}),
      ...(p.locale !== undefined ? { locale: p.locale } : {}),
      ...(p.summary !== undefined ? { imported_summary: p.summary } : {}),
      ...(p.preferences !== undefined ? { preferences: p.preferences } : {}),
      ...(p.onboardingCompleted !== undefined
        ? { onboarding_complete: p.onboardingCompleted }
        : {}),
    })
    .eq("id", c.get("actor"))
    .select("id")
    .single();
  if (error) dbError(error.message);
  return c.json(await me(c));
});
app.get("/api/wallet", async (c) => c.json((await me(c)).wallet));
app.delete("/api/me", async (c) => {
  const result = await rpc(c, "sq_delete_account", {});
  await c.get("serviceDb").auth.admin.signOut(c.get("token"), "global");
  return c.json(result);
});
app.post("/api/quests/viability", async (c) => {
  const { outing, confirmed, templateId } = await json(
    c,
    z
      .object({
        outing: outingSchema,
        confirmed: z.array(outingSchema.keyof()).max(30),
        templateId: z.string().max(120).optional(),
      })
      .strict(),
  );
  const [current, published] = await Promise.all([
    me(c),
    publishedQuests(c.get("userDb"), {
      templateId,
      ...(confirmed.includes("category") ? { category: outing.category } : {}),
      ...(confirmed.includes("intensity")
        ? { intensity: outing.intensity }
        : {}),
    }),
  ]);
  return c.json(
    assessViability(outing, current.profile.preferences, confirmed, published),
  );
});
app.post("/api/quests/recommend", async (c) => {
  const { outing, templateId, offset } = await json(
    c,
    z
      .object({
        outing: outingSchema,
        templateId: z.string().max(120).optional(),
        offset: z.number().int().min(0).max(30_000).default(0),
      })
      .strict(),
  );
  const profile = (await me(c)).profile;
  const published = await publishedQuests(c.get("userDb"), {
    templateId,
    category: outing.category,
    intensity: outing.intensity,
  });
  const { data: history } = await c
    .get("userDb")
    .from("quest_runs")
    .select("family_id,created_at,finalized_at,reward_decision")
    .eq("owner_id", c.get("actor"))
    .order("created_at", { ascending: false })
    .limit(100);
  const candidates = recommend(
    outing,
    profile.preferences,
    (history || []).map((r) => ({
      familyId: r.family_id,
      attemptedAt: r.created_at,
      awardedAt: r.reward_decision?.xp > 0 ? r.finalized_at : null,
    })),
    new Date(),
    published,
    offset,
  );
  for (const q of candidates) {
    const { data: campaigns, error: campaignError } = await c
      .get("userDb")
      .from("campaigns")
      .select("id,version,disclosure")
      .eq("area", outing.area)
      .eq("state", "active")
      .eq("funded", true)
      .contains("categories", [q.category])
      .contains("family_ids", [q.familyId])
      .lte("starts_at", new Date().toISOString())
      .gt("ends_at", new Date().toISOString())
      .order("created_at")
      .order("id")
      .limit(1);
    if (campaignError) dbError(campaignError.message);
    const campaign = campaigns?.[0];
    if (campaign) {
      q.sponsorDisclosure = campaign.disclosure;
      q.sponsorCampaign = { id: campaign.id, version: campaign.version };
    }
    const { data, error: eligibilityError } = await c
      .get("serviceDb")
      .rpc("sq_eligibility", { p_actor: c.get("actor"), p_family: q.familyId });
    if (eligibilityError) dbError(eligibilityError.message);
    if (data) q.rewardEligibility = data;
  }
  return c.json(candidates);
});
app.get("/api/quests", (c) =>
  c.json({
    message:
      "Use POST /api/quests/recommend with the bounded outing schema for personalized candidates.",
  }),
);
app.post("/api/quest-runs", async (c) => {
  const input = await json(
    c,
    z
      .object({
        templateId: z.string().max(120),
        outing: outingSchema,
        inspiredByPostId: z.uuid().optional(),
        seriesPartId: z.uuid().optional(),
        expectedCampaign: z
          .object({ id: z.uuid(), version: z.number().int().positive() })
          .strict()
          .nullable(),
      })
      .strict(),
  );
  const current = await me(c);
  const { data: t, error } = await c
    .get("userDb")
    .from("quest_templates")
    .select("id,content")
    .eq("id", input.templateId)
    .eq("published", true)
    .single();
  if (error || !t)
    throw new ApiError(
      "unavailable",
      "This quest is no longer published. Find another quest.",
      409,
    );
  const quest = questVariantSchema.parse(t.content);
  if (
    ineligibilityReasons(
      quest,
      input.outing,
      current.profile.preferences || DEFAULT_PREFERENCES,
    ).length
  )
    throw new ApiError(
      "no_longer_fits",
      "This quest no longer fits your settings or boundaries. Find your quests again.",
      409,
    );
  const result = await rpc(
    c,
    input.seriesPartId ? "sq_accept_series_run" : "sq_accept_run",
    {
      template_id: input.templateId,
      outing: {
        ...input.outing,
        role:
          current.profile.preferences.role &&
          quest.roles.includes(current.profile.preferences.role)
            ? current.profile.preferences.role
            : null,
      },
      expected_campaign: input.expectedCampaign,
      ...(input.inspiredByPostId
        ? { inspired_by_post: input.inspiredByPostId }
        : {}),
      ...(input.seriesPartId ? { series_part_id: input.seriesPartId } : {}),
    },
    input.seriesPartId ? seriesError : dbError,
  );
  return c.json(await runDto(c, result.run));
});
app.get("/api/quest-runs", async (c) => {
  const cursor = c.req.query("before");
  let query = c
    .get("userDb")
    .from("quest_runs")
    .select("*")
    .eq("owner_id", c.get("actor"))
    .order("created_at", { ascending: false })
    .limit(50);
  if (cursor) query = query.lt("created_at", z.iso.datetime().parse(cursor));
  const { data, error } = await query;
  if (error) dbError(error.message);
  return c.json(await Promise.all((data || []).map((r) => runDto(c, r))));
});
app.get("/api/quest-runs/active", async (c) => {
  const { data, error } = await c
    .get("userDb")
    .from("quest_runs")
    .select("*")
    .eq("owner_id", c.get("actor"))
    .in("status", ["accepted", "in_progress"])
    .maybeSingle();
  if (error) dbError(error.message);
  return c.json(data ? await runDto(c, data) : null);
});
app.get("/api/quest-runs/:id", async (c) =>
  c.json(await runDto(c, await owned(c, "quest_runs", c.req.param("id")))),
);
app.post("/api/quest-runs/:id/abandon", async (c) => {
  await json(c, empty);
  return c.json(
    await rpc(c, "sq_abandon_run", { run_id: id.parse(c.req.param("id")) }),
  );
});
app.post("/api/quest-runs/:id/uploads", async (c) => {
  const input = await json(
    c,
    z
      .object({
        slot: z.number().int().min(0).max(2),
        bytes: z
          .number()
          .int()
          .positive()
          .max(40 * 1024 * 1024),
        mime: z.string().max(100),
        source: z.enum(["camera", "gallery"]),
      })
      .strict(),
  );
  const payload = {
    run_id: id.parse(c.req.param("id")),
    slot: input.slot + 1,
    expected_bytes: input.bytes,
    mime: input.mime.split(";")[0],
    capture_source: input.source,
  };
  const result = await reserveUpload(
    c.get("serviceDb"),
    c.get("actor"),
    payload,
    c.req.header("Idempotency-Key") || crypto.randomUUID(),
    await hash(payload),
  );
  return c.json({ id: result.id, uploadUrl: result.upload_url });
});
app.put("/api/media/:id/upload", async (c) =>
  c.json(
    await uploadAndSeal(
      c.req.raw,
      c.env,
      c.get("serviceDb"),
      c.get("actor"),
      c.req.param("id"),
    ),
  ),
);
const clipEditSchema = z
  .object({
    start: z.number().min(0).max(60),
    end: z.number().min(5).max(60),
    fit: z.enum(["fit", "fill"]),
    crop: z.number().min(0).max(1),
    mute: z.boolean(),
    caption: z.string().max(64),
  })
  .strict();
app.post("/api/media/:id/finalize", async (c) => {
  const edit = await json(c, clipEditSchema);
  const a = await owned(c, "media_assets", c.req.param("id"));
  if (a.state !== "sealed")
    throw new ApiError(
      "not_validated",
      "This clip has not finished uploading and validating.",
      409,
    );
  const result = await rpc(c, "sq_update_clip", {
    run_id: a.run_id,
    asset_id: a.id,
    start_ms: Math.round(edit.start * 1000),
    end_ms: Math.round(edit.end * 1000),
    fit: edit.fit === "fill" ? "cover" : "contain",
    crop: edit.crop,
    mute: edit.mute,
    label: edit.caption,
  });
  return c.json(clipDto(result));
});
const clipSchema = clipEditSchema
  .extend({
    id,
    generation: z.number().int().positive(),
    slot: z.number().int().min(0).max(2),
    duration: z.number().positive().max(60),
    mime: z.string().max(100),
    previewUrl: z.string().max(200),
  })
  .strict();
app.post("/api/quest-runs/:id/clips", async (c) => {
  const { clip } = await json(c, z.object({ clip: clipSchema }).strict());
  const runId = id.parse(c.req.param("id"));
  await rpc(c, "sq_update_clip", { run_id: runId, ...selection(clip) });
  return c.json(await runDto(c, await owned(c, "quest_runs", runId)));
});
app.get("/api/media/:id/playback", async (c) =>
  downloadAsset(
    c.req.raw,
    c.env,
    c.get("serviceDb"),
    c.get("actor"),
    c.req.param("id"),
  ),
);
app.delete("/api/media/:id", async (c) =>
  c.json(
    await rpc(c, "sq_delete_media", { asset_id: id.parse(c.req.param("id")) }),
  ),
);
app.delete("/api/quest-runs/:id/media", async (c) =>
  c.json(
    await rpc(c, "sq_delete_run_media", {
      run_id: id.parse(c.req.param("id")),
    }),
  ),
);
app.post("/api/quest-runs/:id/complete", async (c) => {
  const input = await json(
    c,
    z
      .object({
        declaration: z.string().min(1).max(400),
        confirmed: z.literal(true),
      })
      .strict(),
  );
  const row = await owned(c, "quest_runs", c.req.param("id"));
  const run = await runDto(c, row);
  const result = await rpc(c, "sq_submit_run", {
    run_id: run.id,
    clips: run.clips.map(selection),
    declaration: {
      attempted: true,
      consent: true,
      statement: input.declaration,
    },
    needs_review: false,
  });
  c.executionCtx.waitUntil(
    dispatchPendingRenders(c.env, c.get("serviceDb")).catch(() => {
      console.warn(
        JSON.stringify({
          event: "dispatch_pending",
          requestId: c.get("requestId"),
        }),
      );
    }),
  );
  return c.json(await runDto(c, result.run));
});
app.post("/api/quest-runs/:id/renders", async (c) => {
  await json(c, empty);
  const row = await owned(c, "quest_runs", c.req.param("id"));
  const run = await runDto(c, row);
  const job = await rpc(c, "sq_request_render", {
    run_id: run.id,
    clips: run.clips.map(selection),
    settings: { title: run.quest.title },
  });
  c.executionCtx.waitUntil(
    dispatchPendingRenders(c.env, c.get("serviceDb")).catch(() => {}),
  );
  return c.json(reelDto(job));
});
app.get("/api/render-jobs/:id", async (c) =>
  c.json(reelDto(await owned(c, "render_jobs", c.req.param("id")))),
);
app.get("/api/rewards", async (c) => {
  if (!c.env.LAUNCH_AREA) return c.json([]);
  const { data, error } = await c
    .get("userDb")
    .from("reward_offers")
    .select(
      "id,version,title,terms,area,point_cost,stock_available,ends_at,merchant_id",
    )
    .eq("area", c.env.LAUNCH_AREA)
    .eq("is_demo", false)
    .eq("active", true)
    .eq("funded", true)
    .gt("stock_available", 0)
    .lte("starts_at", new Date().toISOString())
    .gt("ends_at", new Date().toISOString())
    .limit(30);
  if (error) dbError(error.message);
  const { data: sponsors } = await c
    .get("userDb")
    .from("sponsors")
    .select("id,name")
    .eq("approved", true);
  return c.json(
    (data || []).map((o) => ({
      id: o.id,
      version: o.version,
      title: o.title,
      terms: o.terms,
      location: o.area,
      merchant:
        sponsors?.find((s) => s.id === o.merchant_id)?.name ||
        "Participating provider",
      points: o.point_cost,
      available: o.stock_available,
      expiresAt: o.ends_at,
      demo: false,
    })),
  );
});
function redemptionDto(r: {
  id: string;
  point_cost: number;
  terms: string;
  state: string;
  expires_at: string;
}) {
  return {
    id: r.id,
    title: r.terms,
    points: r.point_cost,
    state: r.state,
    expiresAt: r.expires_at,
  };
}
app.get("/api/redemptions", async (c) => {
  const { data, error } = await c
    .get("userDb")
    .from("redemptions")
    .select("id,point_cost,terms,state,expires_at")
    .eq("owner_id", c.get("actor"))
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) dbError(error.message);
  return c.json((data || []).map(redemptionDto));
});
app.post("/api/redemptions", async (c) => {
  const { offerId, offerVersion } = await json(
    c,
    z
      .object({ offerId: id, offerVersion: z.number().int().positive() })
      .strict(),
  );
  const result = await rpc(c, "sq_reserve_reward", {
    offer_id: offerId,
    offer_version: offerVersion,
    area: c.env.LAUNCH_AREA,
  });
  return c.json(redemptionDto(result.redemption));
});
app.post("/api/redemptions/:id/cancel", async (c) => {
  await json(c, empty);
  const result = await rpc(c, "sq_cancel_redemption", {
    redemption_id: id.parse(c.req.param("id")),
  });
  return c.json(redemptionDto(result.redemption));
});
function signingKey(c: AppContext) {
  if (!c.env.REDEMPTION_SIGNING_KEY || c.env.REDEMPTION_SIGNING_KEY.length < 32)
    throw new ApiError(
      "setup_required",
      "Redemption token signing is not configured. Your reservation is saved.",
      503,
    );
  return new TextEncoder().encode(c.env.REDEMPTION_SIGNING_KEY);
}
app.get("/api/redemptions/:id/token", async (c) => {
  const rid = id.parse(c.req.param("id"));
  const { data, error } = await c
    .get("serviceDb")
    .rpc("sq_redemption_material", {
      p_actor: c.get("actor"),
      p_redemption: rid,
    });
  if (error) dbError(error.message);
  const token = await new SignJWT({
    redemption: rid,
    merchant: data.redemption.merchant_id,
    nonce: data.nonce,
    version: data.key_version,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
      kid: String(data.key_version),
    })
    .setIssuer("sidequest-redemption")
    .setAudience("sidequest-merchant")
    .setExpirationTime(
      Math.floor(Date.parse(data.redemption.expires_at) / 1000),
    )
    .sign(signingKey(c));
  const bind = await c.get("serviceDb").rpc("sq_redemption_material", {
    p_actor: c.get("actor"),
    p_redemption: rid,
    p_token_hash: await hash(token),
  });
  if (bind.error) dbError(bind.error.message);
  return c.json({ token });
});
app.post("/api/merchant/consume", async (c) => {
  const { token } = await json(
    c,
    z.object({ token: z.string().max(4096) }).strict(),
  );
  let payload;
  try {
    payload = (
      await jwtVerify(token, signingKey(c), {
        algorithms: ["HS256"],
        issuer: "sidequest-redemption",
        audience: "sidequest-merchant",
      })
    ).payload;
  } catch {
    throw new ApiError(
      "invalid_token",
      "This token is invalid or expired.",
      422,
    );
  }
  return c.json(
    await rpc(c, "sq_consume_redemption", {
      redemption_id: id.parse(payload.redemption),
      token_hash: await hash(token),
    }),
  );
});
app.get("/api/quest-runs/:id/share-links", async (c) => {
  const run = await owned(c, "quest_runs", c.req.param("id"));
  const { data, error } = await c
    .get("userDb")
    .from("share_links")
    .select("id,caption,created_at,expires_at")
    .eq("run_id", run.id)
    .eq("owner_id", c.get("actor"))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) dbError(error.message);
  // Only a token hash is stored. Existing links remain revocable after refresh,
  // but returning a fabricated or reconstructed URL would be incorrect.
  return c.json(
    (data || []).map((link) => ({
      id: link.id,
      caption: link.caption,
      createdAt: link.created_at,
      expiresAt: link.expires_at,
    })),
  );
});
app.post("/api/quest-runs/:id/share", async (c) => {
  await json(c, empty);
  const run = await owned(c, "quest_runs", c.req.param("id"));
  const { data: job } = await c
    .get("userDb")
    .from("render_jobs")
    .select("output_asset_id")
    .eq("run_id", run.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!job?.output_asset_id)
    throw new ApiError(
      "not_ready",
      "Build your reel before creating a public link.",
      409,
    );
  const requestKey = c.req.header("Idempotency-Key");
  if (!requestKey || requestKey.length < 8 || requestKey.length > 100)
    throw new ApiError(
      "idempotency_required",
      "Refresh and try creating this link again.",
    );
  if (!c.env.SHARE_SIGNING_KEY || c.env.SHARE_SIGNING_KEY.length < 32)
    throw new ApiError(
      "setup_required",
      "Public links are not configured yet. You can still save your video.",
      503,
    );
  const signing = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(c.env.SHARE_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    signing,
    new TextEncoder().encode(
      canonical({
        purpose: "reel-share-v1",
        actor: c.get("actor"),
        key: requestKey,
      }),
    ),
  );
  const token = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const link = await rpc(c, "sq_create_share", {
    run_id: run.id,
    asset_id: job.output_asset_id,
    token_hash: await hash(token),
    caption: run.snapshot.title,
  });
  return c.json({
    id: link.id,
    url: `${new URL(c.req.url).origin}/s/${token}`,
  });
});
app.delete("/api/share-links/:id", async (c) =>
  c.json(
    await rpc(c, "sq_revoke_share", { share_id: id.parse(c.req.param("id")) }),
  ),
);
app.get("/api/operator", async (c) => {
  const { data, error } = await c
    .get("serviceDb")
    .rpc("sq_operator_state", { p_actor: c.get("actor") });
  if (error) dbError(error.message);
  return c.json({
    quests: data.templates.map(
      (q: { id: string; title: string; published: boolean }) => ({
        id: q.id,
        title: q.title,
        published: q.published,
      }),
    ),
    reviews: data.reviews.map(
      (r: { id: string; snapshot: { title: string } }) => ({
        id: r.id,
        title: r.snapshot.title,
      }),
    ),
    offers: data.offers,
    sponsors: data.sponsors,
    campaigns: data.campaigns,
    redemptions: data.redemptions,
  });
});
app.post("/api/operator/quests", async (c) => {
  const p = await json(
    c,
    z.object({ id: z.string().max(120), published: z.boolean() }).strict(),
  );
  return c.json(
    await rpc(c, "sq_set_template_publication", {
      template_id: p.id,
      published: p.published,
    }),
  );
});
app.post("/api/operator/reviews", async (c) => {
  const p = await json(
    c,
    z.object({ runId: id, decision: z.enum(["approve", "reject"]) }).strict(),
  );
  return c.json(
    await rpc(c, "sq_review_run", { run_id: p.runId, decision: p.decision }),
  );
});
app.post("/api/operator/flag", async (c) => {
  const p = await json(
    c,
    z.object({ runId: id, reason: z.string().min(1).max(200) }).strict(),
  );
  return c.json(
    await rpc(c, "sq_flag_run", { run_id: p.runId, reason: p.reason }),
  );
});
app.get("/api/operator/reviews/:runId", async (c) => {
  const runId = id.parse(c.req.param("runId"));
  const { data, error } = await c
    .get("serviceDb")
    .rpc("sq_review_evidence", { p_actor: c.get("actor"), p_run: runId });
  if (error) dbError(error.message);
  return c.json(data);
});
app.get("/api/operator/reviews/:runId/media/:assetId", async (c) => {
  const runId = id.parse(c.req.param("runId"));
  const assetId = id.parse(c.req.param("assetId"));
  const { data, error } = await c
    .get("serviceDb")
    .rpc("sq_review_evidence", { p_actor: c.get("actor"), p_run: runId });
  if (error) dbError(error.message);
  const manifest = data.evidence_manifest || data.manifest;
  const clip = manifest?.clips?.find(
    (clip: { asset_id: string }) => clip.asset_id === assetId,
  );
  if (!clip)
    throw new ApiError("not_found", "This evidence clip is unavailable.", 404);
  const { data: asset } = await c
    .get("serviceDb")
    .from("media_assets")
    .select("object_key,mime")
    .eq("id", assetId)
    .eq("state", "sealed")
    .single();
  if (!asset)
    throw new ApiError("not_found", "This evidence clip is unavailable.", 404);
  return servePrivateObject(c.req.raw, c.env, asset.object_key, asset.mime);
});
const offerSchema = z
  .object({
    id: id.optional(),
    merchant_id: id,
    title: z.string().min(3).max(120),
    terms: z.string().min(20).max(3000),
    area: z.string().min(1).max(100),
    currency: z.literal("USD"),
    point_cost: z.number().int().min(1).max(1000000),
    stock_total: z.number().int().min(0).max(100000),
    funded: z.boolean(),
    active: z.boolean(),
    funding_reference: z.string().min(3).max(300),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    per_user_limit: z.number().int().min(1).max(100),
    reservation_minutes: z.number().int().min(5).max(1440),
    notes: z.string().max(3000).optional(),
  })
  .strict();
app.post("/api/operator/offers", async (c) =>
  c.json(await rpc(c, "sq_publish_offer", await json(c, offerSchema))),
);
app.post("/api/operator/sponsors", async (c) =>
  c.json(
    await rpc(
      c,
      "sq_upsert_sponsor",
      await json(
        c,
        z
          .object({
            id: id.optional(),
            name: z.string().min(2).max(120),
            area: z.string().min(1).max(100),
            approved: z.boolean(),
            contact_notes: z.string().max(3000),
            funding_reference: z.string().min(3).max(300),
          })
          .strict(),
      ),
    ),
  ),
);
app.post("/api/operator/offers/pause", async (c) => {
  const p = await json(c, z.object({ id }).strict());
  return c.json(await rpc(c, "sq_pause_offer", { offer_id: p.id }));
});
const campaignSchema = z
  .object({
    id: id.optional(),
    sponsor_id: id,
    title: z.string().min(3).max(120),
    disclosure: z.string().min(3).max(120),
    area: z.string().min(1).max(100),
    state: z.enum(["draft", "active", "paused", "ended"]),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    categories: z.array(categorySchema).min(1).max(5),
    family_ids: z
      .array(z.string().regex(/^[a-z_]+$/))
      .min(1)
      .max(10),
    funded: z.boolean(),
    funding_reference: z.string().min(3).max(300),
    notes: z.string().max(3000).optional(),
  })
  .strict();
app.post("/api/operator/campaigns", async (c) =>
  c.json(await rpc(c, "sq_upsert_campaign", await json(c, campaignSchema))),
);
app.post("/api/operator/campaigns/pause", async (c) => {
  const { id: campaignId } = await json(c, z.object({ id }).strict());
  return c.json(await rpc(c, "sq_pause_campaign", { campaign_id: campaignId }));
});
app.all("/api/*", (c) =>
  c.json(
    {
      error: {
        code: "not_found",
        message: "That API route does not exist.",
        requestId: c.get("requestId"),
      },
    },
    404,
  ),
);

function htmlEscape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
app.get("/s/:token", async (c) => {
  const token = c.req.param("token");
  if (!/^[a-f0-9]{64}$/.test(token))
    return c.text("This link is unavailable.", 404);
  const db = serviceDb(c.env);
  const { data: link, error } = await db
    .from("share_links")
    .select("id,asset_id,caption,run_id")
    .eq("token_hash", await hash(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();
  if (error || !link)
    return c.text("This link has expired or was revoked.", 404);
  const { data: asset } = await db
    .from("media_assets")
    .select("object_key,mime,state")
    .eq("id", link.asset_id)
    .eq("state", "sealed")
    .single();
  if (!asset) return c.text("This reel is unavailable.", 404);
  if (c.req.query("video") === "1")
    return servePrivateObject(c.req.raw, c.env, asset.object_key, asset.mime);
  const { data: template } = await db
    .from("quest_runs")
    .select("template_id,snapshot")
    .eq("id", link.run_id)
    .single();
  const templateHref = template
    ? `/quests/${encodeURIComponent(template.template_id)}`
    : "/";
  const caption = htmlEscape(link.caption);
  const disclosure = (
    template?.snapshot as { sponsorDisclosure?: string } | undefined
  )?.sponsorDisclosure;
  const sponsorLabel = disclosure
    ? `<p>Sponsored · ${htmlEscape(disclosure)}</p>`
    : "";
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.html(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#F7F6F2"><link rel="icon" type="image/svg+xml" href="/icon.svg"><meta property="og:title" content="${caption}"><meta property="og:description" content="A Sidequest story, shared by its owner."><title>${caption} · Sidequest</title><style>body{font:17px system-ui;max-width:600px;margin:40px auto;padding:20px;background:#F7F6F2;color:#171A22}video{width:100%;max-height:70vh}a{color:#7950E8}.brand{display:inline-flex;align-items:center;gap:10px;color:#171A22;text-decoration:none;font-size:24px;font-weight:800;letter-spacing:-1px}.brand img{width:36px;height:36px;object-fit:contain}</style><a class="brand" href="/discover"><img src="/brand/sidequest-mark.svg" alt="" width="36" height="36">Sidequest</a><h1>${caption}</h1>${sponsorLabel}<video controls playsinline src="?video=1"></video><p><a href="${templateHref}">Try this quest</a></p></html>`,
  );
});
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default {
  fetch: app.fetch,
  queue: async (batch: MessageBatch<{ jobId: string }>, env: AppEnv) =>
    consumeRenderQueue(batch, env, serviceDb(env)),
  scheduled: async (_event: ScheduledController, env: AppEnv) => {
    const db = serviceDb(env);
    const { error } = await db.rpc("sq_reconcile", { p_limit: 100 });
    if (error) throw new Error("Reconciliation failed");
    await dispatchPendingRenders(env, db);
    await cleanupMedia(env, db);
    await cleanupSocialPhotos(env, db);
    const { data: deleting } = await db
      .from("profiles")
      .select("id,auth_user_id")
      .eq("account_status", "deleting")
      .limit(25);
    for (const profile of deleting || []) {
      const { count, error } = await db
        .from("media_cleanup")
        .select("asset_id,media_assets!inner(owner_id)", {
          count: "exact",
          head: true,
        })
        .eq("media_assets.owner_id", profile.id)
        .is("completed_at", null);
      if (error || count !== 0) continue;
      const redaction = await db.rpc("sq_finalize_account_deletion", {
        p_actor: profile.id,
      });
      if (redaction.error) continue;
      if (profile.auth_user_id) {
        const { error: authError } = await db.auth.admin.deleteUser(
          profile.auth_user_id,
        );
        if (authError) continue;
      }
      await db
        .from("profiles")
        .update({ account_status: "deleted" })
        .eq("id", profile.id)
        .eq("account_status", "deleting");
    }
  },
};
export { app, canonical };
