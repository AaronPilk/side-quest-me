/** Paid opt-in, synthetic normal-Create discovery evaluation. Never loads user data. */
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
import { discoveryEligibility } from "../shared/experience-discovery";
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
import { generateDiscoveredExperience } from "../worker/experience-discovery";
if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const key = process.env.OPENAI_API_KEY?.trim();
if (!key)
  throw new Error(
    "OPENAI_API_KEY is required for this opt-in synthetic paid evaluation.",
  );
const scenarioId = process.env.SIDEQUEST_AI_EVAL_CASE;
const cases: {
  id: string;
  ageBand: Preferences["ageBand"];
  adultContext: boolean;
  duration: number | null;
  budget: number;
  setting?: Outing["setting"];
  exclusions: Preferences["exclusions"];
  interests?: Preferences["interests"];
  places: { name: string; category: string }[];
}[] = [
  {
    id: "five-friends-full-send-discovery",
    ageBand: "21_plus",
    adultContext: false,
    duration: 120,
    budget: 30000,
    exclusions: ["strangers", "alcohol"],
    places: [
      { name: "Synthetic Karting Circuit", category: "Go kart track" },
      { name: "Synthetic Escape Rooms", category: "Escape room" },
    ],
  },
  {
    id: "adult-demon-nightlife",
    ageBand: "21_plus",
    adultContext: true,
    duration: 180,
    budget: 40000,
    exclusions: ["strangers"],
    places: [
      { name: "Synthetic Downtown Bar", category: "Bar with darts and pool" },
      { name: "Synthetic Late Lounge", category: "Lounge" },
      { name: "Synthetic Music Room", category: "Live music venue" },
    ],
  },
  {
    id: "adult-cocktail-outing",
    ageBand: "21_plus",
    adultContext: true,
    duration: 180,
    budget: 50000,
    exclusions: ["strangers"],
    interests: ["music", "comedy"],
    places: [
      { name: "Synthetic Cocktail House", category: "Cocktail bar" },
      { name: "Synthetic Tasting Cellar", category: "Wine bar" },
      { name: "Synthetic Rooftop Lounge", category: "Rooftop bar" },
    ],
  },
  {
    id: "young-adult-demon",
    ageBand: "18_20",
    adultContext: true,
    duration: 180,
    budget: 30000,
    exclusions: ["strangers", "alcohol"],
    places: [
      { name: "Synthetic Comedy Club", category: "Comedy club" },
      { name: "Synthetic Game Hall", category: "Arcade" },
      { name: "Synthetic Music Room", category: "Live music venue" },
    ],
  },
  {
    id: "unlimited-staycation",
    ageBand: "21_plus",
    adultContext: true,
    duration: null,
    budget: 120000,
    exclusions: ["strangers", "physical_challenges"],
    places: [
      { name: "Synthetic Skyline Hotel", category: "Hotel" },
      { name: "Synthetic Harbor Hotel", category: "Hotel" },
      { name: "Synthetic Music Room", category: "Live music venue" },
    ],
  },
];
for (const scenario of cases.filter(
  (value) => !scenarioId || value.id === scenarioId,
))
  it(`normal Create ${scenario.id} with pending venue setup`, async () => {
    const outing = {
      ...DEFAULT_OUTING,
      category: "demon" as const,
      intensity: "full_send" as const,
      group: "friends" as const,
      participants: 5,
      setting: scenario.setting ?? ("venue" as const),
      budgetMinor: scenario.budget,
      durationMinutes: scenario.duration,
      travelMinutes: 15,
      travelCostMinor: 1000,
      adultEligible: true,
      adultContext: scenario.adultContext,
      venuePermission: false,
      arrangementConfirmed: false,
      confirmedVenueCostMinor: null,
    };
    const fields = {
      ageBand: scenario.ageBand,
      humor: ["competitive", "absurd", "surprises"],
      interests: scenario.interests ?? ["sports", "games"],
      approach: "group_only",
      preparation: "proper_setup",
      role: "rotate",
      exclusions: scenario.exclusions,
    };
    const preferences = preferencesSchema.parse({
      ...DEFAULT_PREFERENCES,
      ...fields,
      sources: Object.fromEntries(
        Object.keys(fields).map((name) => [name, "survey"]),
      ),
    });
    const nearbyPlaces = scenario.places.map((place, index) => ({
      ...place,
      id: `I1234${index}`,
      address: "Synthetic address",
      latitude: 27 + index / 100,
      longitude: -82,
    }));
    const outputs: unknown[] = [];
    const started = Date.now();
    const send: typeof fetch = async (input, init) => {
      const result = await fetch(input, init);
      const envelope = (await result.clone().json()) as {
        output?: { content?: { type?: string; text?: string }[] }[];
      };
      outputs.push({
        status: result.status,
        output: envelope.output?.flatMap(
          (item) =>
            item.content
              ?.filter((c) => c.type === "output_text")
              .map((c) => c.text) ?? [],
        ),
      });
      return result;
    };
    const dir = resolve(
      process.env.SIDEQUEST_AI_EVAL_OUTPUT_DIR || ".local/ai-eval/discovery",
    );
    mkdirSync(dir, { recursive: true });
    try {
      const result = await generateDiscoveredExperience(
        {
          OPENAI_API_KEY: key,
          AI_QUEST_PROVIDER: "openai",
          OPENAI_QUEST_MODEL: "gpt-6-astra",
        },
        preferences,
        { outing, provider: "openai", consent: true, nearbyPlaces },
        send,
      );
      writeFileSync(
        resolve(dir, `${scenario.id}.json`),
        JSON.stringify(
          { scenario, elapsedMs: Date.now() - started, result, outputs },
          null,
          2,
        ),
      );
      expect(result.quest.intensity).toBe("full_send");
      expect(
        discoveryEligibility(result.quest, outing, preferences).blocking,
      ).toEqual([]);
      expect(result.quest.award).toEqual({ xp: 0, points: 0 });
      console.info(
        JSON.stringify({
          title: result.quest.title,
          mechanic: result.mechanic,
          minutes: result.quest.durationMinutes,
          location: result.location?.id,
          elapsedMs: Date.now() - started,
        }),
      );
    } catch (error) {
      writeFileSync(
        resolve(dir, `${scenario.id}-failure.json`),
        JSON.stringify(
          {
            elapsedMs: Date.now() - started,
            error: error instanceof Error ? error.message : "error",
            outputs,
          },
          null,
          2,
        ),
      );
      throw error;
    }
  }, 100_000);
