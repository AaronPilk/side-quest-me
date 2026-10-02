import { z } from "zod";
import { CONTENT_REVIEW_PERMISSION_MESSAGE } from "../shared/content-review";
import { ApiError, type AppEnv } from "./services";

const ENDPOINT = "https://api.openai.com/v1/moderations";
const MODEL = "omni-moderation-latest";
const MAX_RESPONSE_BYTES = 64 * 1024;
const resultSchema = z.object({
  results: z.array(z.object({ flagged: z.boolean() })).length(1),
});
type ReviewInput = string | { type: "image_url"; image_url: { url: string } }[];

export function requireContentReviewPermission(value?: string) {
  if (value !== "true")
    throw new ApiError(
      "content_review_permission_required",
      CONTENT_REVIEW_PERMISSION_MESSAGE,
      422,
    );
}

function unavailable() {
  return new ApiError(
    "content_review_unavailable",
    "Content review is temporarily unavailable. Your changes have not been shared. Please try again.",
    503,
  );
}

async function review(env: Pick<AppEnv, "OPENAI_API_KEY">, input: ReviewInput) {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw unavailable();
  let flagged: boolean;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input }),
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    // Do not expose or log provider bodies, credentials, or submitted content.
    if (!response.ok || !response.body) throw unavailable();
    if (Number(response.headers.get("Content-Length")) > MAX_RESPONSE_BYTES) {
      await response.body.cancel();
      throw unavailable();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw unavailable();
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const result = resultSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)),
    );
    flagged = result.results[0].flagged;
  } catch {
    throw unavailable();
  }
  if (flagged)
    throw new ApiError(
      "content_not_allowed",
      "This public content could not pass review. Please edit it or choose another photo, then try again. Your changes have not been shared.",
      422,
    );
}

/** Call only with validated public fields; never with account or journal DTOs. */
export async function assertPublicTextAllowed(
  env: Pick<AppEnv, "OPENAI_API_KEY">,
  fields: string[],
) {
  await review(env, fields.join("\n\n"));
}

/** Only the already normalized, metadata-free profile PNG reaches the provider. */
export async function assertPublicImageAllowed(
  env: Pick<AppEnv, "OPENAI_API_KEY">,
  png: Uint8Array,
) {
  let binary = "";
  for (let offset = 0; offset < png.length; offset += 8192)
    binary += String.fromCharCode(...png.subarray(offset, offset + 8192));
  await review(env, [
    {
      type: "image_url",
      image_url: { url: `data:image/png;base64,${btoa(binary)}` },
    },
  ]);
}
