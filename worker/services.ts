import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Context } from "hono";
import {
  normalizePreferences,
  type Profile,
  type QuestVariant,
} from "../shared/domain";
import type { Clip, Run, Reel } from "../src/lib/types";
import type { MediaEnv } from "./media";

export type AppEnv = Env &
  MediaEnv & {
    SUPABASE_URL: string;
    SUPABASE_PUBLISHABLE_KEY: string;
    SUPABASE_SECRET_KEY: string;
    REDEMPTION_SIGNING_KEY: string;
    SHARE_SIGNING_KEY: string;
    APPLE_MAPS_TOKEN?: string;
    TICKETMASTER_API_KEY?: string;
  };
export type AppBindings = {
  Bindings: AppEnv;
  Variables: {
    actor: string;
    token: string;
    userDb: SupabaseClient;
    serviceDb: SupabaseClient;
    requestId: string;
  };
};
export type AppContext = Context<AppBindings>;
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503 = 422,
  ) {
    super(message);
  }
}
export function serviceDb(env: AppEnv) {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SECRET_KEY ||
    !env.SUPABASE_PUBLISHABLE_KEY
  )
    throw new ApiError(
      "setup_required",
      "Sign-in and storage are not configured yet. Follow the project setup guide or use the isolated local demo.",
      503,
    );
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function authenticate(c: AppContext) {
  const db = serviceDb(c.env);
  const token = c.req.header("Authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token)
    throw new ApiError("sign_in_required", "Sign in to continue.", 401);
  const userDb = createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_PUBLISHABLE_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const result = await userDb.auth.getClaims(token);
  const claims = result.data?.claims;
  if (
    result.error ||
    !claims ||
    claims.iss !== `${c.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1` ||
    claims.aud !== "authenticated" ||
    claims.exp <= Date.now() / 1000 ||
    !z.uuid().safeParse(claims.sub).success ||
    !z.uuid().safeParse(claims.session_id).success
  )
    throw new ApiError(
      "session_expired",
      "Your session expired. Sign in again.",
      401,
    );
  const { data, error } = await userDb.auth.getUser(token);
  if (
    error ||
    !data.user ||
    data.user.id !== claims.sub ||
    data.user.is_anonymous
  )
    throw new ApiError(
      "permanent_account_required",
      "Use your email account to continue.",
      401,
    );
  const check = await db.rpc("sq_check_session", {
    p_actor: claims.sub,
    p_session: claims.session_id,
  });
  if (check.error || check.data !== true)
    throw new ApiError(
      "session_revoked",
      "This account or session is no longer active. Sign in again.",
      401,
    );
  c.set("actor", claims.sub);
  c.set("token", token);
  c.set("userDb", userDb);
  c.set("serviceDb", db);
}
export async function json<T>(
  c: AppContext,
  schema: z.ZodType<T>,
  maxBytes = 16000,
): Promise<T> {
  const length = Number(c.req.header("Content-Length") || 0);
  if (length > maxBytes)
    throw new ApiError("too_large", "This request is too large.", 413);
  const reader = c.req.raw.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError("too_large", "This request is too large.", 413);
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    return schema.parse(JSON.parse(text || "{}"));
  } catch {
    throw new ApiError(
      "invalid_input",
      "Check the highlighted values and try again. Unrecognized fields are not accepted.",
      422,
    );
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function hash(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      typeof value === "string" ? value : canonical(value),
    ),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function dbError(message: string): never {
  const errors: Record<string, [ApiError["status"], string]> = {
    retry_cooldown: [
      429,
      "Wait one minute after the failed render, then try again. Your clips are saved.",
    ],
    manual_retry_limit: [
      409,
      "This render has reached its retry limit. Replace a clip or ask an operator for help.",
    ],
    replace_render_input: [
      422,
      "A clip could not be processed. Replace the affected source before building a new reel.",
    ],
    forbidden: [403, "You do not have access to this operation."],
    not_found: [404, "This item is unavailable."],
    active_run_exists: [
      409,
      "You have a quest in progress. Continue or abandon it first.",
    ],
    idempotency_conflict: [
      409,
      "This request was already used for a different action. Refresh and try again.",
    ],
    offer_unavailable: [
      409,
      "This reward just sold out or expired. Your points weren’t spent.",
    ],
    insufficient_points: [
      409,
      "You do not have enough points for this reward.",
    ],
    offer_changed: [
      409,
      "This reward changed. Review its current terms before redeeming.",
    ],
    campaign_changed: [
      409,
      "This quest’s sponsorship changed. Go back and find your quests again to review the current disclosure.",
    ],
    redemption_unavailable: [
      409,
      "This reservation is expired, already used, or unavailable to this merchant.",
    ],
    invalid_media: [
      422,
      "The video could not be validated. Replace the clip and try again.",
    ],
    invalid_selection: [422, "Select 5–15 seconds within each validated clip."],
    account_unavailable: [401, "This account is no longer active."],
    evidence_required: [
      422,
      "Three validated clips and the required confirmations are needed.",
    ],
    no_data_found: [404, "This item is unavailable."],
    three_clips_required: [
      422,
      "Save all three clips before completing this quest.",
    ],
  };
  const code = Object.keys(errors).find((k) => message.includes(k));
  if (code) throw new ApiError(code, errors[code][1], errors[code][0]);
  if (message.includes("one_active_run"))
    throw new ApiError(
      "active_run_exists",
      "You have a quest in progress. Continue it first.",
      409,
    );
  throw new ApiError(
    "operation_failed",
    "This change could not be saved. Refresh its current state before retrying.",
    409,
  );
}
export async function rpc(
  c: AppContext,
  name: string,
  input: unknown,
  onError: (message: string) => never = dbError,
) {
  const key = c.req.header("Idempotency-Key") || crypto.randomUUID();
  if (key.length < 8 || key.length > 100)
    throw new ApiError(
      "invalid_idempotency_key",
      "Refresh and try this action again.",
    );
  const { data, error } = await c.get("serviceDb").rpc(name, {
    p_actor: c.get("actor"),
    p_input: input,
    p_key: key,
    p_hash: await hash(input),
  });
  if (error) onError(error.message);
  return data;
}
export async function owned(
  c: AppContext,
  table: "quest_runs" | "media_assets" | "redemptions" | "render_jobs",
  id: string,
) {
  if (!z.uuid().safeParse(id).success)
    throw new ApiError("not_found", "This item is unavailable.", 404);
  const query = c.get("userDb").from(table);
  const selected =
    table === "media_assets"
      ? query.select(
          "id,owner_id,run_id,kind,slot,generation,state,bytes,mime,duration_ms,metadata,is_current,created_at,sealed_at,deleted_at",
        )
      : query.select("*");
  const { data, error } = await selected
    .eq("id", id)
    .eq("owner_id", c.get("actor"))
    .single();
  if (error || !data)
    throw new ApiError("not_found", "This item is unavailable.", 404);
  return data;
}
export function profileDto(row: Record<string, unknown>): Profile {
  return {
    displayName: String(row.display_name || ""),
    timezone: String(row.timezone || "UTC"),
    locale: String(row.locale || "en-US"),
    summary: String(row.imported_summary || ""),
    onboardingCompleted: Boolean(row.onboarding_complete),
    preferences: normalizePreferences(row.preferences),
  };
}
export interface AssetRow {
  id: string;
  generation: number;
  slot: number;
  duration_ms: number;
  mime: string;
  metadata: {
    selection?: {
      start_ms: number;
      end_ms: number;
      fit: string;
      crop: number;
      mute: boolean;
      label: string;
    };
  };
}
export function clipDto(a: AssetRow): Clip {
  const s = a.metadata?.selection;
  return {
    id: a.id,
    generation: a.generation,
    slot: a.slot - 1,
    duration: a.duration_ms / 1000,
    start: s ? s.start_ms / 1000 : 0,
    end: s ? s.end_ms / 1000 : Math.min(a.duration_ms / 1000, 10),
    mime: a.mime,
    previewUrl: `/api/media/${a.id}/playback`,
    fit: s?.fit === "cover" ? "fill" : "fit",
    crop: s?.crop ?? 0.5,
    mute: s?.mute ?? false,
    caption: s?.label || "",
  };
}
export function reelDto(j: {
  id: string;
  status: Reel["status"];
  output_asset_id?: string;
  error_code?: string;
}): Reel {
  return {
    id: j.id,
    status: j.status,
    ...(j.output_asset_id
      ? {
          url: `/api/media/${j.output_asset_id}/playback`,
          thumbnailUrl: `/api/media/${j.output_asset_id}/playback?thumbnail=1`,
        }
      : {}),
    ...(j.error_code
      ? {
          error:
            "The reel could not be built. Your completion is saved. Retry rendering or replace a clip.",
        }
      : {}),
  };
}
export async function runDto(
  c: AppContext,
  row: Record<string, unknown>,
): Promise<Run> {
  const db = c.get("userDb");
  const [{ data: media, error: e1 }, { data: jobs, error: e2 }] =
    await Promise.all([
      db
        .from("media_assets")
        .select("id,generation,slot,duration_ms,mime,metadata")
        .eq("run_id", row.id)
        .eq("kind", "source")
        .eq("state", "sealed")
        .eq("is_current", true)
        .order("slot"),
      db
        .from("render_jobs")
        .select("id,status,output_asset_id,error_code")
        .eq("run_id", row.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
  if (e1 || e2)
    throw new ApiError(
      "load_failed",
      "Your saved quest could not be loaded. Try again.",
      503,
    );
  const snapshot = row.snapshot as {
    template: QuestVariant;
    role: string;
    sponsorDisclosure?: string;
    series?: Run["series"];
  };
  const latest = jobs?.[0];
  const previousReady = jobs?.find((j) => j.status === "ready");
  // Preserve a usable previous reel until a replacement is ready.
  const displayJob =
    latest?.status === "ready" ? latest : previousReady || latest;
  return {
    id: String(row.id),
    quest: {
      ...snapshot.template,
      ...(snapshot.sponsorDisclosure
        ? { sponsorDisclosure: snapshot.sponsorDisclosure }
        : {}),
    },
    outing: row.outing as Run["outing"],
    role: snapshot.role ?? null,
    ...(snapshot.series ? { series: snapshot.series } : {}),
    status: row.status as Run["status"],
    clips: (media || []).map(clipDto),
    createdAt: String(row.created_at),
    completedAt: row.finalized_at ? String(row.finalized_at) : undefined,
    rewardDecision: row.reward_decision as Run["rewardDecision"],
    render: displayJob ? reelDto(displayJob) : undefined,
  };
}
export function selection(clip: Clip) {
  return {
    asset_id: clip.id,
    start_ms: Math.round(clip.start * 1000),
    end_ms: Math.round(clip.end * 1000),
    fit: clip.fit === "fill" ? "cover" : "contain",
    crop: clip.crop,
    mute: clip.mute,
    label: clip.caption,
  };
}
export async function roles(c: AppContext) {
  const { data, error } = await c
    .get("serviceDb")
    .rpc("sq_memberships", { p_actor: c.get("actor") });
  if (error) dbError(error.message);
  return (data as { role: string; merchant_id: string }[]) || [];
}
