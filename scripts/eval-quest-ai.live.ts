/** Opt-in synthetic evaluation of the exact Worker generator. No real user data. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  preferencesSchema,
  type Outing,
  type Preferences,
} from "../shared/domain";
import { ineligibilityReasons } from "../shared/recommend";
import { aiQuestDraftRequestSchema } from "../shared/ai-quest";

// Node cannot load Cloudflare's container base class. The generator never uses
// containers; provider transport and the full generation pipeline are real.
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
import { generateAiQuestDraft } from "../worker/ai-quest-draft";

if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const key = process.env.OPENAI_API_KEY?.trim();
if (!key)
  throw new Error(
    "Set OPENAI_API_KEY in the shell or ignored .dev.vars before running this paid, opt-in evaluation.",
  );
const model = process.env.SIDEQUEST_AI_EVAL_MODEL || "gpt-6-astra";
if (!["gpt-6-astra", "gpt-6.1-sol"].includes(model))
  throw new Error("Use a supported high-capability OpenAI evaluation model.");
const outputDirectory = resolve(".local/ai-eval", model);
mkdirSync(outputDirectory, { recursive: true });

const confirmed = (fields: Partial<Preferences>): Preferences =>
  preferencesSchema.parse({
    ...DEFAULT_PREFERENCES,
    ...fields,
    sources: Object.fromEntries(
      Object.keys(fields).map((name) => [name, "survey"]),
    ),
  });
const scenarios: {
  id: string;
  brief: string;
  outing: Outing;
  preferences: Preferences;
}[] = [
  {
    id: "adult-bartender-choice",
    brief:
      "Three 21+ friends want a bartender-picked cocktail night: we tell the bartender flavors we dislike, then let them choose a surprise drink for each willing drinker and compare guesses before learning the names. Keep it an adult drinking outing, not mocktails or karaoke. Nobody has to finish a drink, drink quickly or order extra rounds. We have a confirmed bar visit and public transit home; no filming staff or other patrons.",
    outing: {
      ...DEFAULT_OUTING,
      category: "demon",
      intensity: "bold",
      group: "friends",
      participants: 3,
      setting: "venue",
      budgetMinor: 18000,
      budgetScope: "total",
      durationMinutes: 180,
      travelMinutes: 30,
      travelCostMinor: 1800,
      transport: "transit",
      adultEligible: true,
      adultContext: true,
      venuePermission: true,
      arrangementConfirmed: true,
      confirmedVenueCostMinor: 0,
    },
    preferences: confirmed({
      ageBand: "21_plus",
      humor: ["surprises"],
      approach: "group_only",
      preparation: "proper_setup",
      role: "rotate",
      exclusions: ["strangers"],
    }),
  },
  {
    id: "five-friends-full-send",
    brief:
      "Five friends with a confirmed private venue booking want a rowdy Full Send experience: fierce team rivalry, absurd surprises and an outrageous finale worth talking about tomorrow. Everyone must have an active role. No cute date exercise, photo hunt, crafts or ordinary open mic. No drinking requirement.",
    outing: {
      ...DEFAULT_OUTING,
      category: "demon",
      intensity: "full_send",
      group: "friends",
      participants: 5,
      setting: "venue",
      budgetMinor: 50_000,
      budgetScope: "total",
      durationMinutes: 120,
      travelMinutes: 20,
      travelCostMinor: 2000,
      transport: "transit",
      adultEligible: true,
      adultContext: true,
      venuePermission: true,
      arrangementConfirmed: true,
      confirmedVenueCostMinor: 10_000,
    },
    preferences: confirmed({
      humor: ["competitive", "absurd", "surprises"],
      interests: ["sports", "games"],
      approach: "group_only",
      preparation: "proper_setup",
      role: "rotate",
      exclusions: ["strangers", "alcohol"],
    }),
  },
  {
    id: "outdoor-full-send-couple",
    brief:
      "Give us an adventurous creative date with a real challenge and a reveal worth showing our friends. We have our phones; don't make it a generic scavenger hunt.",
    outing: {
      ...DEFAULT_OUTING,
      intensity: "full_send",
      setting: "outside",
      budgetMinor: 10_000,
      durationMinutes: 180,
      travelMinutes: 20,
      transport: "walk",
    },
    preferences: confirmed({
      approach: "group_only",
      preparation: "start_now",
      skills: ["making"],
      exclusions: ["strangers", "public_performance"],
    }),
  },
  {
    id: "solo-home-free",
    brief:
      "A satisfying sidequest I can finish at home today with just my phone and ordinary things I already own. Something I can actually win or complete.",
    outing: {
      ...DEFAULT_OUTING,
      category: "daytime",
      group: "solo",
      participants: 1,
    },
    preferences: { ...DEFAULT_PREFERENCES },
  },
  {
    id: "friends-short-budget",
    brief:
      "A funny outdoor challenge for three friends, with a clear winner. No approaching or filming people outside our group.",
    outing: {
      ...DEFAULT_OUTING,
      category: "daytime",
      intensity: "bold",
      group: "friends",
      participants: 3,
      setting: "outside",
      budgetMinor: 1000,
      budgetScope: "per_person",
      travelCostMinor: 1200,
      travelMinutes: 15,
      transport: "transit",
    },
    preferences: confirmed({
      approach: "group_only",
      preparation: "start_now",
      exclusions: [
        "strangers",
        "public_performance",
        "physical_challenges",
        "food_challenges",
        "alcohol",
      ],
    }),
  },
  {
    id: "memory-premise-repaired",
    brief:
      "The first time you laughed together. Turn that into something we can actually DO right now, not an assumed shared memory.",
    outing: { ...DEFAULT_OUTING, intensity: "full_send", setting: "outside" },
    preferences: confirmed({
      approach: "group_only",
      preparation: "start_now",
      exclusions: ["strangers", "public_performance"],
    }),
  },
];
const selected = process.env.SIDEQUEST_AI_EVAL_CASE;
if (selected && !scenarios.some((item) => item.id === selected))
  throw new Error("Unknown SIDEQUEST_AI_EVAL_CASE.");

for (const scenario of scenarios.filter(
  (item) => !selected || item.id === selected,
)) {
  it(`live quest quality: ${scenario.id}`, async () => {
    const started = Date.now();
    const calls: {
      stage: string;
      milliseconds: number;
      status: number;
      inputTokens?: number;
      outputTokens?: number;
      cachedTokens?: number;
      result?: unknown;
    }[] = [];
    const send: typeof fetch = async (url, init) => {
      if (
        String(url) !== "https://api.openai.com/v1/responses" ||
        calls.length >= 3
      )
        throw new Error("Evaluation provider/call budget exceeded.");
      const request = JSON.parse(String(init?.body));
      const call = {
        stage: String(request.text?.format?.name),
        milliseconds: 0,
        status: 0,
      } as (typeof calls)[number];
      calls.push(call);
      const time = Date.now();
      try {
        const response = await fetch(url, init);
        call.status = response.status;
        // Only successful synthetic output and usage; never headers or upstream errors.
        if (response.ok) {
          const raw = (await response.clone().json()) as {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              input_tokens_details?: { cached_tokens?: number };
            };
            output?: {
              type: string;
              content?: { type: string; text?: string }[];
            }[];
          };
          call.inputTokens = raw.usage?.input_tokens;
          call.outputTokens = raw.usage?.output_tokens;
          call.cachedTokens = raw.usage?.input_tokens_details?.cached_tokens;
          const text = raw.output
            ?.filter((part) => part.type === "message")
            .flatMap((part) => part.content ?? [])
            .find((part) => part.type === "output_text")?.text;
          if (text) {
            try {
              call.result = JSON.parse(text);
            } catch {
              /* malformed output is checked by production generator */
            }
          }
        }
        return response;
      } finally {
        call.milliseconds = Date.now() - time;
        console.info(
          `${scenario.id}: ${call.stage}, HTTP ${call.status || "no response"}, ${call.milliseconds}ms`,
        );
      }
    };
    const report: Record<string, unknown> = {
      model,
      scenario,
      startedAt: new Date(started).toISOString(),
      calls,
    };
    try {
      const result = await generateAiQuestDraft(
        {
          OPENAI_API_KEY: key,
          AI_QUEST_PROVIDER: "openai",
          AI_QUEST_MODEL: model,
        },
        scenario.preferences,
        aiQuestDraftRequestSchema.parse({
          draftId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          idea: scenario.brief,
          outing: scenario.outing,
          provider: "openai",
          providerConsent: true,
        }),
        send,
      );
      report.quest = result.quest;
      expect(
        ineligibilityReasons(
          result.quest,
          scenario.outing,
          scenario.preferences,
        ),
      ).toEqual([]);
      expect(result.quest.category).toBe(scenario.outing.category);
      expect(result.quest.intensity).toBe(scenario.outing.intensity);
      expect(result.quest.settings).toContain(scenario.outing.setting);
      expect(calls).toHaveLength(3);
      if (scenario.id === "adult-bartender-choice") {
        expect(result.quest.minimumAge).toBe(21);
        expect(result.quest.conflicts).toContain("alcohol");
        expect(
          result.quest.beats.map(({ action }) => action).join(" "),
        ).toMatch(/cocktail/i);
      }
      report.passed = true;
    } catch (error) {
      report.passed = false;
      report.error =
        error instanceof Error ? error.message : "Evaluation failed";
      throw error;
    } finally {
      report.milliseconds = Date.now() - started;
      writeFileSync(
        resolve(outputDirectory, `${scenario.id}.json`),
        JSON.stringify(report, null, 2),
        { mode: 0o600 },
      );
      writeFileSync(
        resolve(outputDirectory, `${scenario.id}-${started}.json`),
        JSON.stringify(report, null, 2),
        { mode: 0o600 },
      );
      console.info(
        `${scenario.id}: ${report.passed ? "PASS" : "FAIL"}, ${calls.length} calls, ${report.milliseconds}ms; synthetic report in .local/ai-eval/${model}/${scenario.id}.json`,
      );
    }
  });
}
