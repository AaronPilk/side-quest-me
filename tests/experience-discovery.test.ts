import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  questVariantSchema,
} from "../shared/domain";
import {
  discoveryEligibility,
  experienceDiscoveryRequestSchema,
  privatePlanMatches,
  type ExperienceDiscoveryRequest,
  type ExperienceDiscoveryResult,
} from "../shared/experience-discovery";
import {
  curatedDiscoveryFallback,
  generateDiscoveredExperience,
  registerExperienceDiscovery,
} from "../worker/experience-discovery";
import type { AppBindings, AppContext } from "../worker/services";
import { ApiError } from "../worker/services";
import {
  approvedQuestQualityFixture,
  questConceptsFixture,
} from "./ai-draft-fixtures";

const model = vi.hoisted(() => vi.fn());
vi.mock("../worker/ai-provider", async (load) => ({
  ...(await load<typeof import("../worker/ai-provider")>()),
  requestAiJson: model,
}));
const base: ExperienceDiscoveryRequest = {
  provider: "openai",
  consent: true,
  outing: {
    ...DEFAULT_OUTING,
    category: "demon",
    intensity: "full_send",
    group: "friends",
    participants: 5,
    setting: "venue",
    budgetMinor: 30_000,
    durationMinutes: null,
  },
  nearbyPlaces: [],
};
const kart = {
  id: "I1234ABCD",
  name: "Test Karting",
  address: "1 Test Way",
  category: "Go kart track",
  latitude: 27,
  longitude: -82,
};
let cache: Record<string, unknown> | null;
let saved: Record<string, unknown>;
let inProgress: boolean;
const calls = vi.fn(
  async (name: string, args: { p_input: Record<string, unknown> }) => {
    if (name === "sq_reserve_experience_discovery")
      return {
        data: cache ? { response: cache } : { acquired: !inProgress },
        error: null,
      };
    if (name === "sq_store_private_proposal") {
      saved = args.p_input;
      return {
        data: {
          quest: args.p_input.quest,
          proposal: {
            id: "fixture-proposal",
            expires_at: "2030-01-01T00:00:00Z",
          },
        },
        error: null,
      };
    }
    if (name === "sq_finish_experience_discovery") {
      cache = args.p_input.response as Record<string, unknown>;
      return { data: cache, error: null };
    }
    throw new Error(name);
  },
);
const app = new Hono<AppBindings>();
app.use("*", async (c, next) => {
  c.set("actor", "11111111-1111-4111-8111-111111111111");
  c.set("serviceDb", {
    rpc: calls,
  } as unknown as AppContext["var"]["serviceDb"]);
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({
      data: { preferences: DEFAULT_PREFERENCES },
      error: null,
    }),
  };
  c.set("userDb", {
    from: () => query,
  } as unknown as AppContext["var"]["userDb"]);
  await next();
});
app.onError((error, c) =>
  c.json(
    { error: error instanceof ApiError ? error.code : "internal" },
    error instanceof ApiError ? error.status : 500,
  ),
);
registerExperienceDiscovery(app);
const send = (
  body: unknown = base,
  key: string | null = "discovery-test-key",
) =>
  app.fetch(
    new Request("https://app.test/api/quests/discover", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    }),
    {
      OPENAI_API_KEY: "fixture",
      AI_RATE_LIMITER: { limit: async () => ({ success: true }) },
    } as unknown as AppBindings["Bindings"],
  );
beforeEach(() => {
  cache = null;
  inProgress = false;
  calls.mockClear();
  model
    .mockReset()
    .mockRejectedValue(new Error("synthetic provider unavailable"));
});
describe("private experience discovery", () => {
  it("creates a concrete zero-reward adventure and never binds it to an unrelated listing", () => {
    const result = curatedDiscoveryFallback(DEFAULT_PREFERENCES, {
      ...base,
      nearbyPlaces: [kart],
    })!;
    expect(result.quest.title).toContain("Karting");
    expect(result.location?.id).toBe(kart.id);
    expect(result.quest.beats[1].action).toContain("qualifying heat");
    expect(result.quest.award).toEqual({ xp: 0, points: 0 });
    expect(questVariantSchema.safeParse(result.quest).success).toBe(true);
    const unrelated = curatedDiscoveryFallback(DEFAULT_PREFERENCES, {
      ...base,
      outing: { ...base.outing, applePlaceId: kart.id },
      nearbyPlaces: [{ ...kart, name: "The Ordinary Bar", category: "Bar" }],
    })!;
    expect(unrelated.quest.title).toContain("Room");
    expect(unrelated.location).toBeNull();
  });
  it("keeps boundaries and realistic setup/time/budget limits in curated fallback", () => {
    const limited = curatedDiscoveryFallback(
      { ...DEFAULT_PREFERENCES, exclusions: ["physical_challenges"] },
      { ...base, nearbyPlaces: [kart] },
    )!;
    expect(limited.quest.title).toContain("Room");
    expect(
      curatedDiscoveryFallback(DEFAULT_PREFERENCES, {
        ...base,
        outing: { ...base.outing, durationMinutes: 15 },
      }),
    ).toBeNull();
    expect(
      curatedDiscoveryFallback(DEFAULT_PREFERENCES, {
        ...base,
        outing: { ...base.outing, budgetMinor: 0 },
      }),
    ).toBeNull();
  });
  it("allows specific pending setup at suggestion time but keeps it visible", () => {
    const result = curatedDiscoveryFallback(DEFAULT_PREFERENCES, base)!;
    const eligible = discoveryEligibility(
      result.quest,
      base.outing,
      DEFAULT_PREFERENCES,
    );
    expect(eligible.blocking).toEqual([]);
    expect(eligible.requirements.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["venue_cost", "arrangements"]),
    );
    expect(
      privatePlanMatches(base.outing, { ...base.outing, participants: 4 }),
    ).toBe(false);
    expect(
      privatePlanMatches(base.outing, {
        ...base.outing,
        applePlaceId: kart.id,
      }),
    ).toBe(false);
  });
  it("rejects forged private metadata and missing consent before model calls", async () => {
    const quest = curatedDiscoveryFallback(DEFAULT_PREFERENCES, base)!.quest;
    expect(
      questVariantSchema.safeParse({
        ...quest,
        privateGenerated: undefined,
        award: { xp: 125, points: 25 },
      }).success,
    ).toBe(false);
    expect(
      questVariantSchema.safeParse({ ...quest, award: { xp: 1, points: 0 } })
        .success,
    ).toBe(false);
    expect(
      experienceDiscoveryRequestSchema.safeParse({ ...base, consent: false })
        .success,
    ).toBe(false);
    expect((await send(base, null)).status).toBe(422);
    expect(model).not.toHaveBeenCalled();
  });
  it("replays discovery without a second model call and clears old confirmations", async () => {
    const body = {
      ...base,
      outing: {
        ...base.outing,
        venuePermission: true,
        arrangementConfirmed: true,
        confirmedVenueCostMinor: 1,
      },
    };
    const response = await send(body);
    expect(response.status).toBe(200);
    const first = (await response.json()) as ExperienceDiscoveryResult;
    expect(model).toHaveBeenCalledTimes(1);
    expect(saved.outing).toMatchObject({
      venuePermission: false,
      arrangementConfirmed: false,
      confirmedVenueCostMinor: null,
    });
    expect(first.candidates[0].ready).toBe(false);
    expect(first.source).toBe("curated_fallback");
    const repeat = await send(body);
    expect(await repeat.json()).toEqual(first);
    expect(model).toHaveBeenCalledTimes(1);
  });
  it("reviews a private AI proposal with one pending all-in charge rather than double-counting admission", async () => {
    const {
      id: _id,
      familyId: _family,
      version: _version,
      award: _award,
      cooldownDays: _cooldown,
      privateGenerated: _private,
      ...content
    } = curatedDiscoveryFallback(DEFAULT_PREFERENCES, base)!.quest;
    const concepts = questConceptsFixture(content, 5);
    model
      .mockReset()
      .mockResolvedValueOnce({
        candidates: concepts.candidates.map((candidate) => ({
          ...candidate,
          mechanic: "competition",
          placeId: null,
        })),
      })
      .mockResolvedValueOnce({
        ...content,
        cost: { ...content.cost, maxMinor: 29000 },
      })
      .mockResolvedValueOnce(approvedQuestQualityFixture());
    const generated = await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      DEFAULT_PREFERENCES,
      { ...base, nearbyPlaces: [kart] },
    );
    expect(model.mock.calls[0][2].nearbyPlaces[0]).not.toHaveProperty(
      "latitude",
    );
    expect(model.mock.calls[0][2].nearbyPlaces[0]).not.toHaveProperty(
      "longitude",
    );
    expect(generated.quest.cost).toMatchObject({
      minMinor: 0,
      maxMinor: 0,
      venueCostUnknown: true,
      scope: "total",
    });
    expect(generated.quest.cost.note).toContain("complete group charge");
    expect(generated.quest.beats.map(({ label }) => label)).toEqual([
      "Preparation",
      "The challenge",
      "The result",
    ]);
    expect(model).toHaveBeenCalledTimes(3);
    expect(model.mock.calls[2][2].proposal.cost.maxMinor).toBe(0);
  });
  it("does not spend on a concurrent replay", async () => {
    inProgress = true;
    expect((await send()).status).toBe(409);
    expect(model).not.toHaveBeenCalled();
  });
});
