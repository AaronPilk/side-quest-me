import { Container, getContainer } from "@cloudflare/containers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  MEDIA_LIMITS,
  type LocalMediaAsset,
  type ProbeMetadata,
} from "../shared/media";

export interface MediaEnv {
  MEDIA: R2Bucket;
  RENDERER: DurableObjectNamespace<SidequestRenderer>;
  RENDERER_INTERNAL_TOKEN: string;
}

/** One bounded instance, no Internet access or database credentials in its process. */
export class SidequestRenderer extends Container<MediaEnv> {
  defaultPort = 8789;
  sleepAfter = "10m";
  enableInternet = false;
  envVars: Record<string, string> = {
    SIDEQUEST_RENDERER_MODE: "container",
    RENDERER_INTERNAL_TOKEN: this.env.RENDERER_INTERNAL_TOKEN,
  };
}

export class MediaRouteError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

export const reserveUploadSchema = z
  .object({
    run_id: z.uuid(),
    slot: z.number().int().min(1).max(3),
    expected_bytes: z
      .number()
      .int()
      .positive()
      .max(MEDIA_LIMITS.maxUploadBytes),
    mime: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
    capture_source: z.enum(["camera", "gallery"]).default("gallery"),
  })
  .strict();
export function opaqueGeneration() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function payloadHash(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function reserveUpload(
  db: SupabaseClient,
  actor: string,
  input: unknown,
  key: string,
  hash: string,
) {
  const checked = reserveUploadSchema.parse(input);
  const { data, error } = await db.rpc("sq_reserve_upload", {
    p_actor: actor,
    p_input: checked,
    p_key: key,
    p_hash: hash,
  });
  if (error) throw new MediaRouteError(error.message, 409);
  return {
    ...data,
    upload_url: `/api/media/${data.id}/upload`,
    upload_method: "PUT",
    limits: MEDIA_LIMITS,
  };
}

export async function rendererFetch(
  env: MediaEnv,
  route: string,
  init: RequestInit = {},
) {
  if (
    !env.RENDERER ||
    !env.RENDERER_INTERNAL_TOKEN ||
    env.RENDERER_INTERNAL_TOKEN.length < 32
  )
    throw new MediaRouteError(
      "Renderer infrastructure has not been configured.",
      503,
    );
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${env.RENDERER_INTERNAL_TOKEN}`);
  const instance = getContainer(env.RENDERER, "media-slot-0");
  return await instance.fetch(
    new Request(`http://renderer/internal${route}`, { ...init, headers }),
  );
}

export async function rendererJson<T>(response: Response): Promise<T> {
  const failure = new MediaRouteError(
    response.ok
      ? "Media service returned an invalid response."
      : "Media processing failed.",
    response.ok ? 502 : response.status,
  );
  // The Container SDK can return plain-text startup/capacity errors. Never let
  // parsing obscure their retryable HTTP status or expose infrastructure details.
  if (!response.ok && (response.status === 429 || response.status >= 500)) {
    await response.body?.cancel().catch(() => undefined);
    throw failure;
  }
  const reader = response.body?.getReader();
  if (!reader) throw failure;
  let body: unknown;
  try {
    const decoder = new TextDecoder();
    let text = "",
      bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64 * 1024) throw failure;
      text += decoder.decode(value, { stream: true });
    }
    body = JSON.parse(text + decoder.decode());
  } catch {
    await reader.cancel().catch(() => undefined);
    throw failure;
  } finally {
    reader.releaseLock();
  }
  if (!response.ok) {
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error.length > 0 &&
      body.error.length <= 240 &&
      !/[\u0000-\u001f\u007f]/u.test(body.error)
    )
      failure.message = body.error;
    throw failure;
  }
  return body as T;
}

export async function sendSealedSource(
  env: MediaEnv,
  asset: {
    id: string;
    run_id: string;
    slot: number;
    object_key: string;
    sha256?: string;
  },
) {
  const object = await env.MEDIA.get(asset.object_key);
  if (!object || object.size > MEDIA_LIMITS.maxUploadBytes || !object.size)
    throw new MediaRouteError("The sealed source is unavailable.", 404);
  const result = await rendererJson<LocalMediaAsset>(
    await rendererFetch(env, `/assets/${asset.id}`, {
      method: "PUT",
      headers: {
        "content-length": String(object.size),
        "content-type":
          object.httpMetadata?.contentType || "application/octet-stream",
        "x-run-id": asset.run_id,
        "x-clip-slot": String(asset.slot - 1),
      },
      body: object.body,
    }),
  );
  if (asset.sha256 && result.sha256 !== asset.sha256)
    throw new MediaRouteError("Source integrity check failed.", 409);
  return result;
}

export async function uploadAndSeal(
  request: Request,
  env: MediaEnv,
  db: SupabaseClient,
  actor: string,
  assetId: string,
) {
  z.uuid().parse(assetId);
  const { data: asset, error } = await db
    .from("media_assets")
    .select("*")
    .eq("id", assetId)
    .eq("owner_id", actor)
    .eq("kind", "source")
    .single();
  if (error || !asset) throw new MediaRouteError("Clip not found.", 404);
  if (asset.state === "sealed") return asset;
  if (
    asset.state !== "pending" ||
    new Date(asset.upload_expires_at).getTime() <= Date.now()
  )
    throw new MediaRouteError(
      "Upload expired. Choose the clip again to start a fresh upload.",
      410,
    );
  const length = Number(request.headers.get("content-length"));
  if (
    !request.body ||
    !Number.isSafeInteger(length) ||
    length !== asset.expected_bytes ||
    length > MEDIA_LIMITS.maxUploadBytes ||
    length <= 0
  )
    throw new MediaRouteError(
      "Upload size does not match the authorized clip. Maximum 40 MB.",
      413,
    );
  // Conditional create makes a reserved upload generation one-use, even under simultaneous PUTs.
  await env.MEDIA.put(asset.staging_key, request.body, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: asset.mime },
    customMetadata: { assetId, ownerId: actor },
  });
  const staged = await env.MEDIA.get(asset.staging_key);
  if (!staged || staged.size !== length)
    throw new MediaRouteError("Upload did not finish. Retry this clip.", 409);
  const sealedKey = `sealed/${actor}/${assetId}/${opaqueGeneration()}`;
  // Seal the exact retrieved generation before any validation. No client route can write this key.
  await env.MEDIA.put(sealedKey, staged.body, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: asset.mime },
    customMetadata: { assetId, ownerId: actor },
  });
  let keep = false,
    sealAttempted = false;
  try {
    // A unique transport id prevents a concurrent seal candidate reusing another candidate's probe.
    const candidateId = crypto.randomUUID();
    let checked: LocalMediaAsset;
    try {
      checked = await sendSealedSource(env, {
        id: candidateId,
        run_id: asset.run_id,
        slot: asset.slot,
        object_key: sealedKey,
      });
    } finally {
      await rendererFetch(env, `/assets/${candidateId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    const input = {
      asset_id: assetId,
      object_key: sealedKey,
      bytes: checked.bytes,
      mime: checked.mime,
      duration_ms: Math.floor(checked.probe.duration * 1000),
      sha256: checked.sha256,
      metadata: checked.probe,
    };
    sealAttempted = true;
    const { data, error: sealError } = await db.rpc("sq_seal_media", {
      p_actor: actor,
      p_input: input,
      p_key: `seal:${assetId}:${candidateId}`,
      p_hash: await payloadHash(input),
    });
    if (sealError) throw new MediaRouteError(sealError.message, 409);
    keep = data.object_key === sealedKey;
    sealAttempted = false; // A confirmed response identifies the one chosen candidate.
    await env.MEDIA.delete(asset.staging_key);
    return data;
  } finally {
    // A lost RPC reply may conceal a committed seal. Its durable DB reference must win;
    // the orphan sweeper rechecks after 24 hours instead of deleting it speculatively.
    if (!keep && !sealAttempted) await env.MEDIA.delete(sealedKey);
  }
}

export async function downloadAsset(
  request: Request,
  env: MediaEnv,
  db: SupabaseClient,
  actor: string,
  assetId: string,
) {
  z.uuid().parse(assetId);
  const { data: asset, error } = await db
    .from("media_assets")
    .select("id,object_key,mime,state,metadata")
    .eq("id", assetId)
    .eq("owner_id", actor)
    .eq("state", "sealed")
    .single();
  if (error || !asset) throw new MediaRouteError("Video not found.", 404);
  const thumbnail = new URL(request.url).searchParams.has("thumbnail");
  const key = thumbnail ? asset.metadata?.thumbnail_key : asset.object_key;
  if (!key) throw new MediaRouteError("Thumbnail not found.", 404);
  return servePrivateObject(
    request,
    env,
    key,
    thumbnail ? "image/jpeg" : asset.mime,
  );
}

/** Call only after authorization or checking an active opaque share token. Never cache. */
export async function servePrivateObject(
  request: Request,
  env: MediaEnv,
  key: string,
  mime = "video/mp4",
) {
  const object = await env.MEDIA.get(key, { range: request.headers });
  if (!object) throw new MediaRouteError("Video not found.", 404);
  const headers = new Headers({
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  const range = object.range;
  if (
    range &&
    "offset" in range &&
    range.offset !== undefined &&
    "length" in range &&
    range.length !== undefined
  ) {
    headers.set(
      "content-range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
    );
    headers.set("content-length", String(range.length));
  } else headers.set("content-length", String(object.size));
  if (new URL(request.url).searchParams.has("download"))
    headers.set("content-disposition", 'attachment; filename="sidequest.mp4"');
  return new Response(object.body, {
    status: headers.has("content-range") ? 206 : 200,
    headers,
  });
}

export function validateOutputMetadata(
  meta: ProbeMetadata,
  selectedMs: number,
) {
  if (
    meta.width !== MEDIA_LIMITS.width ||
    meta.height !== MEDIA_LIMITS.height ||
    meta.videoCodec !== "h264" ||
    meta.audioCodec !== "aac" ||
    !Number.isSafeInteger(meta.bytes) ||
    meta.bytes <= 0 ||
    meta.bytes > MEDIA_LIMITS.maxOutputBytes ||
    !/^[a-f0-9]{64}$/.test(meta.sha256) ||
    Math.abs(meta.duration * 1000 - selectedMs) > 300
  )
    throw new MediaRouteError("Invalid rendered output metadata.");
}

/** Transactional retirement, retryable deletion, and bounded orphan recovery. */
export async function cleanupMedia(env: MediaEnv, db: SupabaseClient) {
  const { error: retentionError } = await db.rpc("sq_schedule_retention", {
    p_limit: 100,
  });
  if (retentionError) throw new Error("Media retention scheduling failed.");
  const { data, error } = await db
    .from("media_cleanup")
    .select("asset_id,object_key,staging_key")
    .is("completed_at", null)
    .limit(100);
  if (error) throw new Error("Media cleanup could not be loaded.");
  for (const item of data || []) {
    const { data: asset, error: assetError } = await db
      .from("media_assets")
      .select("state,metadata")
      .eq("id", item.asset_id)
      .single();
    if (assetError || asset?.state !== "deleted") continue; // Never delete accessible data on incomplete authorization state.
    const keys = [
      item.object_key,
      item.staging_key,
      asset.metadata?.thumbnail_key,
    ].filter((key): key is string => typeof key === "string");
    if (keys.length) await env.MEDIA.delete(keys);
    const { error: completeError } = await db
      .from("media_cleanup")
      .update({ completed_at: new Date().toISOString() })
      .eq("asset_id", item.asset_id)
      .is("completed_at", null);
    if (completeError)
      throw new Error("Media cleanup will retry its completion record.");
  }

  // This tiny object is an operational pagination checkpoint, never a media ownership record.
  const checkpointKey = "_maintenance/orphan-cursors.json";
  const checkpoint = await env.MEDIA.get(checkpointKey);
  const cursors: Record<string, string | undefined> =
    checkpoint && checkpoint.size < 4096
      ? await checkpoint.json<Record<string, string>>()
      : {};
  for (const prefix of ["staging/", "sealed/", "renders/"]) {
    const page = await env.MEDIA.list({
      prefix,
      cursor: cursors[prefix],
      limit: 50,
    });
    const old = page.objects.filter(
      (object) => object.uploaded.getTime() < Date.now() - 24 * 60 * 60_000,
    );
    if (old.length) {
      const keys = old.map((object) => object.key);
      const references = await Promise.all([
        db
          .from("media_assets")
          .select("object_key,staging_key,metadata")
          .neq("state", "deleted")
          .in("object_key", keys),
        db
          .from("media_assets")
          .select("object_key,staging_key,metadata")
          .neq("state", "deleted")
          .in("staging_key", keys),
        db
          .from("media_assets")
          .select("object_key,staging_key,metadata")
          .neq("state", "deleted")
          .in("metadata->>thumbnail_key", keys),
      ]);
      if (references.some((result) => result.error))
        throw new Error(
          "Orphan references could not be verified; no candidates were deleted.",
        );
      const keep = new Set(
        references.flatMap((result) =>
          (result.data || [])
            .flatMap((asset) => [
              asset.object_key,
              asset.staging_key,
              asset.metadata?.thumbnail_key,
            ])
            .filter(Boolean),
        ),
      );
      const orphaned = keys.filter((key) => !keep.has(key));
      if (orphaned.length) await env.MEDIA.delete(orphaned);
    }
    cursors[prefix] = page.truncated ? page.cursor : undefined;
  }
  await env.MEDIA.put(checkpointKey, JSON.stringify(cursors), {
    httpMetadata: { contentType: "application/json" },
  });
}
