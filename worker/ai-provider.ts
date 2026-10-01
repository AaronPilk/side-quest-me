import { z } from "zod";
import {
  aiQuestProviderSchema,
  QUEST_AI_MODELS,
  type AiQuestProvider,
} from "../shared/ai-quest";
import type { AppEnv } from "./services";

export type QuestAiEnv = Pick<
  AppEnv,
  | "OPENAI_API_KEY"
  | "OPENAI_QUEST_MODEL"
  | "XAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "AI_QUEST_PROVIDER"
  | "AI_QUEST_MODEL"
>;

export function questAiProvider(env: QuestAiEnv) {
  const parsed = aiQuestProviderSchema.safeParse(
    env.AI_QUEST_PROVIDER || "openai",
  );
  if (!parsed.success) return null;
  const provider = parsed.data;
  const model =
    env.AI_QUEST_MODEL ||
    (provider === "openai" ? env.OPENAI_QUEST_MODEL : undefined) ||
    QUEST_AI_MODELS[provider];
  const key = {
    openai: env.OPENAI_API_KEY,
    xai: env.XAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
  }[provider]?.trim();
  if (!key || !/^[a-zA-Z0-9._-]{1,80}$/.test(model)) return null;
  return { provider, model, key };
}

/** Safe diagnostic fields only. Never retain provider bodies, request context,
 * credentials, or a nested error that could contain them. */
export class AiProviderError extends Error {
  constructor(
    readonly kind:
      | "http"
      | "network"
      | "timeout"
      | "response_too_large"
      | "invalid_response"
      | "refusal"
      | "incomplete",
    readonly httpStatus?: number,
  ) {
    super(
      {
        http: "Provider unavailable.",
        network: "Provider connection failed.",
        timeout: "Provider timed out.",
        response_too_large: "Provider response exceeded its limit.",
        invalid_response: "Provider response was invalid.",
        refusal: "Provider refused.",
        incomplete: "Provider output is incomplete.",
      }[kind],
    );
    this.name = "AiProviderError";
  }
}

const MAX_PROVIDER_BYTES = 64 * 1024;
const AI_TIMEOUT_MS = 30_000;
export type AiRequestOptions = {
  reasoningEffort?: "low" | "medium" | "high";
  /** The caller can shorten this to respect a multi-stage request deadline. */
  timeoutMs?: number;
};
async function boundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("Content-Length") || 0);
  if (length > MAX_PROVIDER_BYTES || !response.body) {
    await response.body?.cancel();
    throw new AiProviderError("response_too_large");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PROVIDER_BYTES) {
      await reader.cancel();
      throw new AiProviderError("response_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

const responsesEnvelope = z.object({
  status: z.literal("completed"),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
});
const chatEnvelope = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string(),
          refusal: z.null().optional(),
        }),
      }),
    )
    .length(1),
});
const messagesEnvelope = z.object({
  type: z.literal("message"),
  stop_reason: z.literal("end_turn"),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

/** Claude's constrained decoder supports fewer numeric/string/array keywords.
 * Keep them in descriptions, then validate the original schema server-side. */
function anthropicSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(anthropicSchema);
  if (!value || typeof value !== "object") return value;
  const unsupported = new Set([
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "$schema",
  ]);
  const entries = Object.entries(value);
  const constraints = entries.filter(
    ([key]) => unsupported.has(key) && key !== "$schema",
  );
  return Object.fromEntries([
    ...entries
      .filter(([key]) => !unsupported.has(key))
      .map(([key, item]) => [key, anthropicSchema(item)]),
    ...(constraints.length
      ? [
          [
            "description",
            `${"description" in value ? String(value.description) + ". " : ""}Required constraints: ${constraints.map(([key, item]) => `${key}=${item}`).join(", ")}.`,
          ],
        ]
      : []),
  ]);
}

export async function requestAiJson(
  config: { provider: AiQuestProvider; model: string; key: string },
  instructions: string,
  context: unknown,
  schema: Record<string, unknown>,
  name: string,
  send: typeof fetch = fetch,
  maxOutputTokens = 3000,
  options: AiRequestOptions = {},
) {
  const { provider, model, key } = config;
  const effort = options.reasoningEffort ?? "low";
  const requestedTimeout = options.timeoutMs ?? AI_TIMEOUT_MS;
  if (!Number.isFinite(requestedTimeout) || requestedTimeout <= 0)
    throw new AiProviderError("timeout");
  const timeoutMs = Math.min(60_000, requestedTimeout);
  const input = JSON.stringify(context);
  const target =
    provider === "openai"
      ? "https://api.openai.com/v1/responses"
      : provider === "xai"
        ? "https://api.x.ai/v1/chat/completions"
        : "https://api.anthropic.com/v1/messages";
  const body =
    provider === "anthropic"
      ? {
          model,
          max_tokens: maxOutputTokens,
          system: instructions,
          messages: [{ role: "user", content: input }],
          output_config: {
            effort,
            format: { type: "json_schema", schema: anthropicSchema(schema) },
          },
        }
      : provider === "xai"
        ? {
            model,
            max_tokens: maxOutputTokens,
            reasoning_effort: effort,
            stream: false,
            messages: [
              { role: "system", content: instructions },
              { role: "user", content: input },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name, strict: true, schema },
            },
          }
        : {
            model,
            store: false,
            reasoning: { effort },
            max_output_tokens: maxOutputTokens,
            instructions,
            input: [
              { role: "user", content: [{ type: "input_text", text: input }] },
            ],
            text: {
              format: { type: "json_schema", name, strict: true, schema },
            },
          };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let receivedResponse = false;
  try {
    const response = await send(target, {
      method: "POST",
      // workerd rejects redirect:"error" before sending. Manual mode keeps
      // credentials on the fixed provider URL; every 3xx fails the !ok gate.
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(provider === "anthropic"
          ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
          : { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify(body),
    });
    receivedResponse = true;
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new AiProviderError("http", response.status);
    }
    const raw = await boundedJson(response);
    let text: string;
    if (provider === "xai") {
      text = chatEnvelope.parse(raw).choices[0].message.content;
    } else {
      const parts =
        provider === "anthropic"
          ? messagesEnvelope.parse(raw).content
          : responsesEnvelope
              .parse(raw)
              .output.filter((item) => item.type === "message")
              .flatMap((item) => item.content || []);
      const outputType = provider === "anthropic" ? "text" : "output_text";
      if (parts.some((part) => part.type === "refusal"))
        throw new AiProviderError("refusal");
      const texts = parts.filter(
        (part) => part.type === outputType && part.text,
      );
      if (texts.length !== 1) throw new AiProviderError("incomplete");
      text = texts[0].text!;
    }
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError(
      controller.signal.aborted
        ? "timeout"
        : receivedResponse
          ? "invalid_response"
          : "network",
    );
  } finally {
    clearTimeout(timer);
  }
}
