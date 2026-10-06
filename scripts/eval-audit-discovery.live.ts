/** Paid, opt-in regression evaluation using Claude's synthetic audit scenarios. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import cases from "./fixtures/quest-audit-cases.json";
import {
  DEFAULT_PREFERENCES,
  preferencesSchema,
  effectiveBudget,
} from "../shared/domain";
import { confirmedAiPreferences } from "../shared/ai-quest";
import { experienceDiscoveryRequestSchema } from "../shared/experience-discovery";
import { buildQuestRoutingBrief } from "../shared/quest-routing";
import { questAiProvider, requestAiJson } from "../worker/ai-provider";
import {
  acceptsQuestQuality,
  questQualityReviewSchema,
  REVIEW_INSTRUCTIONS,
} from "../worker/quest-idea-quality";
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
import { generateDiscoveredExperience } from "../worker/experience-discovery";
if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const key = process.env.OPENAI_API_KEY?.trim();
if (!key)
  throw new Error(
    "OPENAI_API_KEY is required for this paid synthetic evaluation.",
  );
const selection = process.env.SIDEQUEST_AI_EVAL_CASE;
if (selection && !cases.some(({ id }) => id === selection))
  throw new Error("Unknown audit case.");
const reviewOnly = process.env.SIDEQUEST_AI_EVAL_MODE === "review";
const outputDirectory = resolve(
  process.env.SIDEQUEST_AI_EVAL_OUTPUT_DIR ||
    ".local/ai-eval/audit-repair-2026-10-05",
);
mkdirSync(outputDirectory, { recursive: true });
for (const scenario of cases.filter(
  ({ id, reviewRegression }) =>
    (!selection || selection === id) && (!reviewOnly || reviewRegression),
)) {
  it(`${reviewOnly ? "reject ordinary Full Send" : "generate"}: ${scenario.id}`, async () => {
    const request = experienceDiscoveryRequestSchema.parse(scenario.request);
    const preferences = preferencesSchema.parse({
      ...DEFAULT_PREFERENCES,
      ...scenario.preferencesFields,
      sources: Object.fromEntries(
        Object.keys(scenario.preferencesFields).map((name) => [name, "survey"]),
      ),
    });
    const env = {
      OPENAI_API_KEY: key,
      AI_QUEST_PROVIDER: "openai",
      OPENAI_QUEST_MODEL: "gpt-6-astra",
    };
    const outputs: unknown[] = [];
    let callCount = 0;
    const send: typeof fetch = async (input, init) => {
      if (
        String(input) !== "https://api.openai.com/v1/responses" ||
        ++callCount > (reviewOnly ? 1 : 2)
      )
        throw new Error("Evaluation call budget exceeded.");
      const callStarted = Date.now();
      let response: Response;
      try {
        response = await fetch(input, init);
      } catch (error) {
        outputs.push({
          elapsedMs: Date.now() - callStarted,
          status: "transport_failed",
        });
        throw error;
      }
      if (response.ok) {
        const raw = (await response.clone().json()) as {
          output?: { content?: { type?: string; text?: string }[] }[];
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            output_tokens_details?: { reasoning_tokens?: number };
          };
        };
        outputs.push({
          status: response.status,
          elapsedMs: Date.now() - callStarted,
          usage: {
            inputTokens: raw.usage?.input_tokens,
            outputTokens: raw.usage?.output_tokens,
            reasoningTokens: raw.usage?.output_tokens_details?.reasoning_tokens,
          },
          output: raw.output?.flatMap(
            (item) =>
              item.content
                ?.filter((c) => c.type === "output_text")
                .map((c) => c.text) || [],
          ),
        });
      }
      return response;
    };
    const started = Date.now();
    const report: Record<string, unknown> = {
      id: scenario.id,
      mode: reviewOnly ? "review" : "generate",
      outputs,
    };
    try {
      if (reviewOnly) {
        const routing = buildQuestRoutingBrief(preferences, request.outing);
        const review = questQualityReviewSchema.parse(
          await requestAiJson(
            questAiProvider(env)!,
            `${REVIEW_INSTRUCTIONS}\nThis is discovery: booking, price and access may be pending if clearly stated. Assess the actual activity's intensity independently of pending setup.`,
            {
              outing: request.outing,
              confirmed_preferences: confirmedAiPreferences(preferences),
              experience_routing: routing,
              nearbyPlaces: request.nearbyPlaces.map(
                ({ latitude: _lat, longitude: _lon, ...p }) => p,
              ),
              totalGroupBudgetMinor: effectiveBudget(request.outing),
              pending_setup_allowed: true,
              proposal: scenario.reviewRegression,
            },
            z.toJSONSchema(questQualityReviewSchema) as Record<string, unknown>,
            "audit_review_regression",
            send,
            2500,
            { reasoningEffort: "low", timeoutMs: 30000 },
          ),
        );
        report.review = review;
        expect(acceptsQuestQuality(review, "full_send")).toBe(false);
        expect(review.fullSendAssessment).not.toBeNull();
        expect(
          !review.fullSendAssessment!.changesExperience ||
            review.fullSendAssessment!.paddingOnly,
        ).toBe(true);
      } else {
        const result = await generateDiscoveredExperience(
          env,
          preferences,
          request,
          send,
          () => {},
          scenario.previous,
        );
        report.result = result;
        expect(result.quest.intensity).toBe(request.outing.intensity);
        expect(result.quest.award).toEqual({ xp: 0, points: 0 });
      }
      report.passed = true;
    } catch (error) {
      report.passed = false;
      report.error =
        error instanceof Error
          ? { ...error, message: error.message }
          : String(error);
      throw error;
    } finally {
      report.elapsedMs = Date.now() - started;
      report.callCount = callCount;
      writeFileSync(
        resolve(
          outputDirectory,
          `${scenario.id}-${reviewOnly ? "review" : "generate"}.json`,
        ),
        JSON.stringify(report, null, 2),
        { mode: 0o600 },
      );
    }
  }, 100000);
}
