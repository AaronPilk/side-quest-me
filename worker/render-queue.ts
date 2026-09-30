import type { SupabaseClient } from "@supabase/supabase-js";
import { storeRendererObject } from "./renderer-storage";
import {
  MEDIA_LIMITS,
  renderManifestSchema,
  type LocalRenderResult,
} from "../shared/media";
import {
  rendererFetch,
  rendererJson,
  sendSealedSource,
  validateOutputMetadata,
  MediaRouteError,
  type MediaEnv,
} from "./media";

export interface RenderQueueEnv extends MediaEnv {
  RENDER_QUEUE: Queue<{ jobId: string }>;
}
interface StoredClip {
  asset_id: string;
  slot: number;
  object_key: string;
  sha256: string;
  start_ms: number;
  end_ms: number;
  mute: boolean;
  fit: string;
  crop?: number;
  label: string;
}
interface RenderJob {
  id: string;
  owner_id: string;
  run_id: string;
  fence: number;
  revision?: number;
  status: string;
  attempts: number;
  manifest: {
    version: number;
    title: string;
    sponsorDisclosure?: string;
    clips: StoredClip[];
  };
}

export async function dispatchPendingRenders(
  env: RenderQueueEnv,
  db: SupabaseClient,
) {
  const { data, error } = await db
    .from("render_outbox")
    .select("job_id,dispatch_attempts")
    .is("dispatched_at", null)
    .order("created_at")
    .limit(25);
  if (error) throw error;
  for (const item of data || []) {
    await env.RENDER_QUEUE.send({ jobId: item.job_id });
    const { error: updateError } = await db
      .from("render_outbox")
      .update({
        dispatched_at: new Date().toISOString(),
        dispatch_attempts: item.dispatch_attempts + 1,
      })
      .eq("job_id", item.job_id)
      .is("dispatched_at", null);
    if (updateError) throw updateError; // Re-send is harmless if marking dispatch failed after enqueue.
  }
  // A crashed consumer leaves a durable expired lease; recover through the same one queue.
  const { data: expired, error: expiredError } = await db
    .from("render_jobs")
    .select("id")
    .eq("status", "processing")
    .lt("lease_expires_at", new Date().toISOString())
    .limit(25);
  if (expiredError) throw expiredError;
  for (const item of expired || [])
    await env.RENDER_QUEUE.send({ jobId: item.id });
  const { data: stalled, error: stalledError } = await db
    .from("render_jobs")
    .select("id")
    .eq("status", "queued")
    .lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(25);
  if (stalledError) throw stalledError;
  for (const item of stalled || [])
    await env.RENDER_QUEUE.send({ jobId: item.id });
}

async function encodeJob(
  env: RenderQueueEnv,
  db: SupabaseClient,
  job: RenderJob,
) {
  const outputId = crypto.randomUUID(),
    touched: string[] = [];
  // Container transport aliases are unique per attempt, so stale cleanup cannot remove
  // another attempt's inputs. The immutable DB manifest remains the ownership authority.
  const inputs = job.manifest.clips.map((clip) => ({
    ...clip,
    transportId: crypto.randomUUID(),
  }));
  const manifest = renderManifestSchema.parse({
    version: 1,
    runId: job.run_id,
    revision: job.revision || 1,
    outputId,
    title: job.manifest.title,
    sponsorDisclosure: job.manifest.sponsorDisclosure,
    clips: inputs.map((c) => ({
      assetId: c.transportId,
      start: c.start_ms / 1000,
      end: c.end_ms / 1000,
      mute: c.mute,
      fit: ["fill", "cover"].includes(c.fit) ? "fill" : "fit",
      crop: c.crop ?? 0.5,
      label: c.label,
    })),
  });
  let outputKey: string | undefined,
    thumbnailKey: string | undefined,
    committed = false,
    commitAttempted = false;
  try {
    for (const clip of inputs) {
      touched.push(clip.transportId);
      await sendSealedSource(env, {
        id: clip.transportId,
        run_id: job.run_id,
        slot: clip.slot,
        object_key: clip.object_key,
        sha256: clip.sha256,
      });
    }
    // Await a bounded active request; do not return 202 or rely on an idle process surviving.
    const result = await rendererJson<LocalRenderResult>(
      await rendererFetch(env, "/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manifest),
        signal: AbortSignal.timeout(MEDIA_LIMITS.maxJobMs + 60_000),
      }),
    );
    validateOutputMetadata(
      result.metadata,
      job.manifest.clips.reduce((sum, c) => sum + c.end_ms - c.start_ms, 0),
    );
    outputKey = `renders/${job.id}/${job.fence}/${result.metadata.sha256}.mp4`;
    thumbnailKey = `renders/${job.id}/${job.fence}/${result.metadata.sha256}.jpg`;
    const output = await rendererFetch(env, `/outputs/${outputId}`);
    // R2 verifies the supplied SHA-256 while consuming this stream. This is the object we promote.
    await storeRendererObject(
      env.MEDIA,
      outputKey,
      output,
      result.metadata.bytes,
      MEDIA_LIMITS.maxOutputBytes,
      {
        sha256: result.metadata.sha256,
        httpMetadata: {
          contentType: "video/mp4",
          cacheControl: "private, no-store",
        },
        customMetadata: { jobId: job.id, fence: String(job.fence) },
      },
    );
    const thumbnail = await rendererFetch(
      env,
      `/outputs/${outputId}/thumbnail`,
    );
    await storeRendererObject(
      env.MEDIA,
      thumbnailKey,
      thumbnail,
      Number(thumbnail.headers.get("content-length")),
      2 * 1024 * 1024,
      {
        httpMetadata: {
          contentType: "image/jpeg",
          cacheControl: "private, no-store",
        },
      },
    );
    commitAttempted = true;
    const { error } = await db.rpc("sq_finish_render", {
      p_job: job.id,
      p_fence: job.fence,
      p_output: {
        object_key: outputKey,
        bytes: result.metadata.bytes,
        mime: "video/mp4",
        duration_ms: Math.round(result.metadata.duration * 1000),
        sha256: result.metadata.sha256,
        metadata: { ...result.metadata, thumbnail_key: thumbnailKey },
      },
    });
    if (error) throw error;
    committed = true;
    console.log(
      JSON.stringify({
        event: "render_ready",
        jobId: job.id,
        renderMs: result.metadata.renderMs,
        bytes: result.metadata.bytes,
        attempts: job.attempts,
      }),
    );
  } finally {
    // A stale lease can leave candidate output but cannot promote it. Delete uncommitted objects.
    // Once commit has been attempted, a lost RPC response is ambiguous. Retain the candidate;
    // scheduled orphan cleanup may remove it only after checking DB references and a grace period.
    if (!committed && !commitAttempted)
      for (const key of [outputKey, thumbnailKey])
        if (key) await env.MEDIA.delete(key);
    await rendererFetch(env, `/outputs/${outputId}`, {
      method: "DELETE",
    }).catch(() => undefined);
    for (const id of touched)
      await rendererFetch(env, `/assets/${id}`, { method: "DELETE" }).catch(
        () => undefined,
      );
  }
}

export async function consumeRenderQueue(
  batch: MessageBatch<{ jobId: string }>,
  env: RenderQueueEnv,
  db: SupabaseClient,
) {
  for (const message of batch.messages) {
    let job: RenderJob | null = null;
    try {
      const { data, error } = await db.rpc("sq_claim_render", {
        p_job: message.body.jobId,
      });
      if (error) throw error;
      job = data as RenderJob | null;
      if (!job) {
        message.ack();
        continue;
      }
      await encodeJob(env, db, job);
      message.ack();
    } catch (error) {
      const code =
        error instanceof MediaRouteError
          ? error.status === 429
            ? "capacity"
            : error.status >= 500
              ? "network"
              : "invalid_media"
          : error instanceof TypeError
            ? "network"
            : error instanceof DOMException
              ? "interrupted"
              : "encode_failed";
      console.error(
        JSON.stringify({
          event: "render_failed",
          jobId: message.body.jobId,
          code,
        }),
      );
      if (job) {
        const { data, error: failed } = await db.rpc("sq_fail_render", {
          p_job: job.id,
          p_fence: job.fence,
          p_error: code,
        });
        if (failed) message.retry({ delaySeconds: 60 });
        else if (data?.status === "queued") message.retry({ delaySeconds: 30 });
        else message.ack();
      } else message.retry({ delaySeconds: 60 });
    }
  }
}
