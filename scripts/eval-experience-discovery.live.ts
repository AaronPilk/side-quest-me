/** Paid opt-in, synthetic normal-Create discovery evaluation. Never loads user data. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  preferencesSchema,
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
it("normal Create five friends Full Send with pending venue setup", async () => {
  const outing = {
    ...DEFAULT_OUTING,
    category: "demon" as const,
    intensity: "full_send" as const,
    group: "friends" as const,
    participants: 5,
    setting: "venue" as const,
    budgetMinor: 30000,
    durationMinutes: 120,
    travelMinutes: 15,
    travelCostMinor: 1000,
    adultEligible: true,
    adultContext: false,
    venuePermission: false,
    arrangementConfirmed: false,
    confirmedVenueCostMinor: null,
  };
  const fields = {
    humor: ["competitive", "absurd", "surprises"],
    interests: ["sports", "games"],
    approach: "group_only",
    preparation: "proper_setup",
    role: "rotate",
    exclusions: ["strangers", "alcohol"],
  };
  const preferences = preferencesSchema.parse({
    ...DEFAULT_PREFERENCES,
    ...fields,
    sources: Object.fromEntries(
      Object.keys(fields).map((name) => [name, "survey"]),
    ),
  });
  const nearbyPlaces = [
    {
      id: "I1234A",
      name: "Synthetic Karting Circuit",
      address: "Synthetic address",
      category: "Go kart track",
      latitude: 27,
      longitude: -82,
    },
    {
      id: "I1234B",
      name: "Synthetic Escape Rooms",
      address: "Synthetic address",
      category: "Escape room",
      latitude: 27.01,
      longitude: -82.01,
    },
  ];
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
  const dir = resolve(".local/ai-eval/discovery");
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
      resolve(dir, "five-friends-full-send.json"),
      JSON.stringify(
        { elapsedMs: Date.now() - started, result, outputs },
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
      resolve(dir, "five-friends-full-send-failure.json"),
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
