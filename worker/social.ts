import type { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  PHOTO_BYTES,
  followInput,
  normalizedProfilePng,
  socialProfileInput,
} from "../shared/social";
import {
  ApiError,
  authenticate,
  json,
  serviceDb,
  type AppBindings,
  type AppContext,
  type AppEnv,
} from "./services";

export const SOCIAL_PRIVATE_ROUTE =
  /^\/api\/social\/(?:me|profile|follow|photo)$/;
function socialError(message: string): never {
  if (message.includes("username_taken"))
    throw new ApiError(
      "username_taken",
      "That username is already taken. Try another.",
      409,
    );
  if (message.includes("stale_version"))
    throw new ApiError(
      "stale_version",
      "Your profile changed. Refresh before saving again.",
      409,
    );
  if (message.includes("creator_profile_required"))
    throw new ApiError(
      "creator_profile_required",
      "Save your public profile before uploading a photo.",
    );
  if (message.includes("not_found") || message.includes("account_unavailable"))
    throw new ApiError("not_found", "This creator is unavailable.", 404);
  if (message.includes("self_follow"))
    throw new ApiError("self_follow", "You cannot follow your own profile.");
  throw new ApiError(
    "social_failed",
    "Your profile could not be updated. Check your details and try again.",
  );
}
async function call(
  c: AppContext,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await c.get("serviceDb").rpc(name, args);
  if (error) socialError(error.message);
  return data;
}
async function optionalIdentity(c: AppContext) {
  if (c.env.API_RATE_LIMITER) {
    const result = await c.env.API_RATE_LIMITER.limit({
      key: `network:${c.req.header("CF-Connecting-IP") || "local"}`,
    });
    if (!result.success)
      throw new ApiError(
        "rate_limited",
        "Wait a moment before trying again.",
        429,
      );
  }
  if (c.req.header("Authorization")) await authenticate(c);
  else c.set("serviceDb", serviceDb(c.env));
}
export function registerSocialPublic(app: Hono<AppBindings>) {
  app.get("/api/social/profile/:id", async (c) => {
    const target = z.uuid().parse(c.req.param("id"));
    await optionalIdentity(c);
    return c.json(
      await call(c, "sq_social_read", {
        p_actor: c.get("actor") || null,
        p_target: target,
      }),
    );
  });
  app.get("/api/social/photo/:id", async (c) => {
    const target = z.uuid().parse(c.req.param("id"));
    await optionalIdentity(c);
    const key = await call(c, "sq_social_photo_key", {
      p_actor: c.get("actor") || null,
      p_target: target,
    });
    if (typeof key !== "string" || !key.startsWith(`avatars/${target}/`))
      throw new ApiError("not_found", "This photo is unavailable.", 404);
    const object = await c.env.MEDIA.get(key);
    if (!object || object.size > PHOTO_BYTES)
      throw new ApiError("not_found", "This photo is unavailable.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  });
}
async function photoBody(c: AppContext) {
  if (c.req.header("Content-Type")?.split(";")[0] !== "image/png")
    throw new ApiError(
      "invalid_photo",
      "Upload a normalized PNG profile photo.",
      422,
    );
  if (Number(c.req.header("Content-Length")) > PHOTO_BYTES)
    throw new ApiError("too_large", "The profile photo is too large.", 413);
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new ApiError("invalid_photo", "Choose a photo first.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > PHOTO_BYTES)
        throw new ApiError("too_large", "The profile photo is too large.", 413);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  try {
    return normalizedProfilePng(bytes);
  } catch {
    throw new ApiError("invalid_photo", "Choose a valid photo and try again.");
  }
}
export function registerSocialPrivate(app: Hono<AppBindings>) {
  app.get("/api/social/me", async (c) =>
    c.json(
      await call(c, "sq_social_read", {
        p_actor: c.get("actor"),
        p_target: c.get("actor"),
      }),
    ),
  );
  app.post("/api/social/profile", async (c) =>
    c.json(
      await call(c, "sq_social_save", {
        p_actor: c.get("actor"),
        p_input: await json(c, socialProfileInput),
      }),
    ),
  );
  app.post("/api/social/follow", async (c) => {
    const input = await json(c, followInput);
    return c.json(
      await call(c, "sq_social_follow", {
        p_actor: c.get("actor"),
        p_target: input.targetId,
        p_following: input.following,
      }),
    );
  });
  app.put("/api/social/photo", async (c) => {
    const bytes = await photoBody(c);
    const key = `avatars/${c.get("actor")}/${crypto.randomUUID()}.png`;
    await c.env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType: "image/png" },
    });
    try {
      return c.json(
        await call(c, "sq_social_photo", {
          p_actor: c.get("actor"),
          p_key: key,
        }),
      );
    } catch (error) {
      await c.env.MEDIA.delete(key).catch(() => undefined);
      throw error;
    }
  });
  app.delete("/api/social/photo", async (c) =>
    c.json(
      await call(c, "sq_social_photo", {
        p_actor: c.get("actor"),
        p_key: null,
      }),
    ),
  );
}

export async function cleanupSocialPhotos(env: AppEnv, db: SupabaseClient) {
  const { data, error } = await db
    .from("social_photo_cleanup")
    .select("object_key")
    .is("completed_at", null)
    .limit(100);
  if (error) throw new Error("Profile photo cleanup could not load.");
  for (const row of data || []) {
    await env.MEDIA.delete(row.object_key);
    const result = await db
      .from("social_photo_cleanup")
      .update({ completed_at: new Date().toISOString() })
      .eq("object_key", row.object_key);
    if (result.error) throw new Error("Profile photo cleanup will retry.");
  }
  // Recover photos uploaded before a failed/crashed profile update. Keep one day's
  // grace so the upload and its DB transaction can finish before cleanup considers it.
  const checkpointKey = "_maintenance/avatar-cursor.json";
  const checkpoint = await env.MEDIA.get(checkpointKey);
  const cursor =
    checkpoint && checkpoint.size < 4096
      ? (await checkpoint.json<{ cursor?: string }>()).cursor
      : undefined;
  const page = await env.MEDIA.list({ prefix: "avatars/", limit: 50, cursor });
  const old = page.objects.filter(
    (object) => object.uploaded.getTime() < Date.now() - 86400000,
  );
  if (old.length) {
    const references = await db
      .from("social_profiles")
      .select("photo_key")
      .in(
        "photo_key",
        old.map((object) => object.key),
      );
    if (references.error)
      throw new Error("Profile photo references could not load.");
    const active = new Set((references.data || []).map((row) => row.photo_key));
    const keys = old
      .map((object) => object.key)
      .filter((key) => !active.has(key));
    if (keys.length) await env.MEDIA.delete(keys);
  }
  await env.MEDIA.put(
    checkpointKey,
    JSON.stringify({ cursor: page.truncated ? page.cursor : undefined }),
  );
}
