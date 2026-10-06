import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  MAX_QUEST_ACTIVITY_MINUTES,
  questVariantSchema,
  type QuestVariant,
  type Preferences,
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
import { AiProviderError } from "../worker/ai-provider";
import { QUEST_IDEA_RUBRIC } from "../worker/quest-idea-quality";
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
let persistenceFailure: "store" | "finish" | undefined;
let releaseFailure: boolean;
const leaseUntil = "2030-01-01T00:02:00.000Z";
let historyProposals: {
  id: string;
  owner_id: string;
  template_id: string;
  location: unknown;
}[];
let historyTemplates: {
  id: string;
  published: boolean;
  content: QuestVariant;
}[];
const historyQuery = vi.fn((table: string) => {
  const filters: Record<string, unknown> = {};
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      filters[key] = value;
      return query;
    },
    in: async (key: string, values: string[]) => {
      const rows =
        table === "private_quest_proposals"
          ? historyProposals
          : historyTemplates;
      return {
        data: rows.filter((row) => {
          const item = row as unknown as Record<string, unknown>;
          return (
            values.includes(String(item[key])) &&
            Object.entries(filters).every(
              ([name, value]) => item[name] === value,
            )
          );
        }),
        error: null,
      };
    },
  };
  return query;
});
const calls = vi.fn(
  async (name: string, args: { p_input: Record<string, unknown> }) => {
    if (name === "sq_reserve_experience_discovery") {
      const acquired = !inProgress;
      if (!cache && acquired) inProgress = true;
      return {
        data: cache
          ? { response: cache }
          : acquired
            ? { acquired: true, leaseUntil }
            : { acquired: false },
        error: null,
      };
    }
    if (name === "sq_release_experience_discovery") {
      if (releaseFailure) throw new Error("synthetic private release error");
      const released = !cache && args.p_input.leaseUntil === leaseUntil;
      if (released) inProgress = false;
      return { data: { released }, error: null };
    }
    if (name === "sq_store_private_proposal") {
      if (persistenceFailure === "store")
        throw new Error("synthetic unknown storage outcome");
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
      if (persistenceFailure === "finish")
        throw new Error("synthetic unknown completion outcome");
      cache = args.p_input.response as Record<string, unknown>;
      inProgress = false;
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
    from: historyQuery,
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
  environment: Partial<AppBindings["Bindings"]> = {},
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
      ...environment,
    } as unknown as AppBindings["Bindings"],
  );
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  cache = null;
  inProgress = false;
  persistenceFailure = undefined;
  releaseFailure = false;
  calls.mockClear();
  historyQuery.mockClear();
  historyProposals = [];
  historyTemplates = [];
  model
    .mockReset()
    .mockRejectedValue(new Error("synthetic provider unavailable"));
});
function comparisonFixture() {
  const {
    id: _id,
    familyId: _family,
    version: _version,
    award: _award,
    cooldownDays: _cooldown,
    privateGenerated: _private,
    ...proposal
  } = curatedDiscoveryFallback(DEFAULT_PREFERENCES, base)!.quest;
  return {
    candidates: questConceptsFixture(proposal, 5).candidates.map(
      ({
        mission: _mission,
        goal: _goal,
        intensityMechanic: _mechanic,
        ...candidate
      }) => ({
        ...candidate,
        mechanic: "competition",
        placeId: null as string | null,
      }),
    ),
    selectedConceptId: "A",
    proposal,
  };
}
const historyId = "99999999-9999-4999-8999-999999999999";
function storeHistory(
  owner = "11111111-1111-4111-8111-111111111111",
  published = false,
) {
  const quest = curatedDiscoveryFallback(DEFAULT_PREFERENCES, base)!.quest;
  historyProposals.push({
    id: historyId,
    owner_id: owner,
    template_id: quest.id,
    location: null,
  });
  historyTemplates.push({ id: quest.id, content: quest, published });
  return quest;
}
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
    expect(unrelated.mechanic).toBe("immersive_horror");
    expect(unrelated.location).toBeNull();
  });
  it("keeps boundaries and realistic setup/time/budget limits in curated fallback", () => {
    const limited = curatedDiscoveryFallback(
      { ...DEFAULT_PREFERENCES, exclusions: ["physical_challenges"] },
      { ...base, nearbyPlaces: [kart] },
    )!;
    expect(limited.quest.conflicts).not.toContain("physical_challenges");
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
    const comparison = comparisonFixture();
    comparison.proposal.cost.maxMinor = 29000;
    model
      .mockReset()
      .mockResolvedValueOnce(comparison)
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
    expect(generated.quest.cost.note).toContain("not a free estimate");
    expect(generated.quest.cost.note).toContain("rooms, meals, tickets");
    expect(generated.quest.cost.note).not.toContain(
      "no separate activity purchase",
    );
    expect(generated.quest.beats.map(({ label }) => label)).toEqual([
      "Preparation",
      "The challenge",
      "The result",
    ]);
    expect(model).toHaveBeenCalledTimes(2);
    // Discovery's combined writer must receive the same intensity calibration
    // as its critic, not merely the shorter creative-direction introduction.
    expect(model.mock.calls[0][1]).toContain(QUEST_IDEA_RUBRIC);
    expect(model.mock.calls[1][1]).toContain(QUEST_IDEA_RUBRIC);
    expect(model.mock.calls[1][2].proposal.cost.maxMinor).toBe(0);
    expect(model.mock.calls[1][2]).not.toHaveProperty("selectedConcept");
  });
  it("logs bounded failure stage and status without request data or exception text", async () => {
    model.mockRejectedValueOnce(new AiProviderError("http", 401));
    expect((await send()).status).toBe(200);
    expect(console.warn).toHaveBeenLastCalledWith({
      event: "experience_generation_failed",
      stage: "proposal",
      provider: "openai",
      elapsedMs: expect.any(Number),
      stageDurationsMs: {
        prepare: expect.any(Number),
        proposal: expect.any(Number),
      },
      failureKind: "http",
      httpStatus: 401,
    });
    cache = null;
    model.mockRejectedValueOnce(
      new Error("private provider body or outing details"),
    );
    expect((await send()).status).toBe(200);
    expect(console.warn).toHaveBeenLastCalledWith({
      event: "experience_generation_failed",
      stage: "proposal",
      provider: "openai",
      elapsedMs: expect.any(Number),
      stageDurationsMs: {
        prepare: expect.any(Number),
        proposal: expect.any(Number),
      },
      failureKind: "generation_failed",
    });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "private provider body",
    );
  });
  it("gives independent review its full budget after a slow combined response without a third paid call", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    model
      .mockReset()
      .mockImplementationOnce(async () => {
        now = 59000;
        return comparisonFixture();
      })
      .mockImplementationOnce(async () => {
        now = 88000;
        return approvedQuestQualityFixture();
      });
    await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      DEFAULT_PREFERENCES,
      base,
    );
    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls.map((call) => call[7].timeoutMs)).toEqual([
      70000, 30000,
    ]);
  });
  it("keeps a late proposal and its independent review within the same 90-second budget", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    model
      .mockReset()
      .mockImplementationOnce(async () => {
        now = 69000;
        return comparisonFixture();
      })
      .mockImplementationOnce(async () => {
        now = 89500;
        return approvedQuestQualityFixture();
      });
    await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      DEFAULT_PREFERENCES,
      base,
    );
    expect(model.mock.calls.map((call) => call[7].timeoutMs)).toEqual([
      70000, 21000,
    ]);
    const concepts =
      model.mock.calls[0][3].properties.candidates.items.properties;
    expect(concepts).not.toHaveProperty("mission");
    expect(concepts).not.toHaveProperty("goal");
    expect(concepts).not.toHaveProperty("intensityMechanic");
    expect(concepts).toHaveProperty("ordinaryVersion");
    expect(concepts).toHaveProperty("experienceUpgrade");
  });
  it("never starts a review after the total deadline or retries rejected generation automatically", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    model.mockReset().mockImplementationOnce(async () => {
      now = 90001;
      return comparisonFixture();
    });
    await expect(
      generateDiscoveredExperience(
        { OPENAI_API_KEY: "fixture" },
        DEFAULT_PREFERENCES,
        base,
      ),
    ).rejects.toMatchObject({ kind: "deadline" });
    expect(model).toHaveBeenCalledTimes(1);
  });
  it("constrains the output schema to the exact group, setting, intensity and time after travel", async () => {
    const comparison = comparisonFixture();
    comparison.proposal.durationMinutes = 75;
    comparison.candidates[0].durationMinutes = 75;
    model
      .mockReset()
      .mockResolvedValueOnce(comparison)
      .mockResolvedValueOnce(approvedQuestQualityFixture());
    await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      DEFAULT_PREFERENCES,
      {
        ...base,
        outing: { ...base.outing, durationMinutes: 90, travelMinutes: 15 },
      },
    );
    const properties = model.mock.calls[0][3].properties.proposal.properties;
    expect(properties.category).toMatchObject({ const: "demon" });
    expect(properties.intensity).toMatchObject({ const: "full_send" });
    expect(properties.minParticipants).toMatchObject({ const: 5 });
    expect(properties.maxParticipants).toMatchObject({ const: 5 });
    expect(properties.requiresVolunteer).toMatchObject({ const: false });
    expect(properties.settings).toMatchObject({
      minItems: 1,
      maxItems: 1,
      items: { const: "venue" },
    });
    expect(properties.allowedGroups).toMatchObject({
      minItems: 1,
      maxItems: 1,
      items: { const: "friends" },
    });
    expect(properties.durationMinutes).toMatchObject({
      minimum: 15,
      maximum: 75,
    });
    expect(properties.beats).toMatchObject({
      minItems: 3,
      maxItems: 3,
      items: { properties: { action: { minLength: 1 } } },
    });
  });
  it("allows adult nightlife to explore any mechanic without fixed concept lanes", async () => {
    const preferences: Preferences = {
      ...DEFAULT_PREFERENCES,
      ageBand: "21_plus",
      interests: ["sports", "games"],
      sources: { ageBand: "survey", interests: "survey" },
    };
    const comparison = comparisonFixture();
    const response = {
      ...comparison,
      candidates: comparison.candidates.map((candidate) => ({
        ...candidate,
        mechanic: "competition",
      })),
      proposal: {
        ...comparison.proposal,
        adultOnly: true,
        supportsAdultContext: true,
        minimumAge: 21,
      },
    };
    model
      .mockReset()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(approvedQuestQualityFixture());
    const result = await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      preferences,
      {
        ...base,
        outing: {
          ...base.outing,
          adultEligible: true,
          adultContext: true,
          durationMinutes: 180,
        },
      },
    );
    expect(result.mechanic).toBe("competition");
    expect(model.mock.calls[0][2]).not.toHaveProperty("conceptLanes");
    const candidateSchema = model.mock.calls[0][3].properties.candidates.items;
    expect(candidateSchema).not.toHaveProperty("anyOf");
    expect(candidateSchema.properties.mechanic.enum).toContain("competition");
    expect(candidateSchema.properties.mechanic.enum).toContain("live_show");
    expect(model).toHaveBeenCalledTimes(2);
  });

  it.each(["18_20", "21_plus"] as const)(
    "does not classify an unrestricted outing as adult-only for opted-in %s users",
    async (ageBand) => {
      const comparison = comparisonFixture();
      const response = {
        ...comparison,
        proposal: {
          ...comparison.proposal,
          title: "An unrestricted group experience",
          adultOnly: false,
          supportsAdultContext: false,
          minimumAge: null,
          venuePermissionRequired: false,
          conflicts: [],
        },
      };
      model
        .mockReset()
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(approvedQuestQualityFixture());
      const preferences: Preferences = {
        ...DEFAULT_PREFERENCES,
        ageBand,
        sources: { ageBand: "survey" },
      };
      const request = {
        ...base,
        outing: { ...base.outing, adultEligible: true, adultContext: true },
      };
      const { quest } = await generateDiscoveredExperience(
        { OPENAI_API_KEY: "fixture" },
        preferences,
        request,
      );
      expect(quest.adultOnly).toBe(false);
      expect(quest.minimumAge).toBeUndefined();
      const eligibility = discoveryEligibility(
        quest,
        request.outing,
        preferences,
      );
      expect(eligibility.blocking).toEqual([]);
      expect(eligibility.requirements.map(({ code }) => code)).not.toContain(
        "venue_permission",
      );
      expect(eligibility.requirements.map(({ code }) => code)).not.toContain(
        "adults",
      );
      const properties = model.mock.calls[0][3].properties.proposal.properties;
      expect(properties.minimumAge).not.toHaveProperty("const");
      expect(properties.adultOnly).not.toHaveProperty("const");
      expect(properties.supportsAdultContext).not.toHaveProperty("const");
      expect(model.mock.calls[1][2]).not.toHaveProperty("selectedConcept");
    },
  );

  it("keeps an actual 18+ non-alcohol experience at 18 even for an opted-in 21+ user", async () => {
    const comparison = comparisonFixture();
    const response = {
      ...comparison,
      proposal: {
        ...comparison.proposal,
        adultOnly: true,
        supportsAdultContext: true,
        minimumAge: 18,
        conflicts: ["adult_venues"],
      },
    };
    model
      .mockReset()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(approvedQuestQualityFixture());
    const { quest } = await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      {
        ...DEFAULT_PREFERENCES,
        ageBand: "21_plus",
        sources: { ageBand: "survey" },
      },
      {
        ...base,
        outing: { ...base.outing, adultEligible: true, adultContext: true },
      },
    );
    expect(quest.minimumAge).toBe(18);
  });

  it.each(["age_floor", "adult_context", "paid_cast_as_volunteers"])(
    "rejects %s drift before reviewing an adult nightlife proposal",
    async (field) => {
      const comparison = comparisonFixture();
      const proposal = {
        ...comparison.proposal,
        adultOnly: true,
        supportsAdultContext: true,
        minimumAge: 21,
        conflicts: ["alcohol" as const, "adult_venues" as const],
      };
      const response = {
        ...comparison,
        candidates: comparison.candidates.map((candidate, index) => ({
          ...candidate,
          mechanic: ["discovery", "live_show", "competition"][index],
        })),
        proposal,
      };
      if (field === "age_floor") response.proposal.minimumAge = 18;
      if (field === "adult_context")
        response.proposal.supportsAdultContext = false;
      if (field === "paid_cast_as_volunteers")
        response.proposal.requiresVolunteer = true;
      model.mockReset().mockResolvedValueOnce(response);
      await expect(
        generateDiscoveredExperience(
          { OPENAI_API_KEY: "fixture" },
          {
            ...DEFAULT_PREFERENCES,
            ageBand: "21_plus",
            sources: { ageBand: "survey" },
          },
          {
            ...base,
            outing: {
              ...base.outing,
              adultEligible: true,
              adultContext: true,
              durationMinutes: 180,
            },
          },
        ),
      ).rejects.toThrow();
      expect(model).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    {
      ageBand: null,
      source: undefined,
      allowed: false,
      blocker: "age_not_confirmed",
    },
    {
      ageBand: "under_18" as const,
      source: "survey" as const,
      allowed: false,
      blocker: "under_adult_age",
    },
    {
      ageBand: "21_plus" as const,
      source: undefined,
      allowed: false,
      blocker: "age_not_confirmed",
    },
    {
      ageBand: "18_20" as const,
      source: "survey" as const,
      allowed: true,
      blocker: null,
    },
    {
      ageBand: "21_plus" as const,
      source: "survey" as const,
      allowed: true,
      blocker: null,
    },
  ])(
    "retains the saved $ageBand age gate when venue permission is pending ($source)",
    async ({ ageBand, source, allowed, blocker }) => {
      model
        .mockReset()
        .mockRejectedValueOnce(
          new Error("stop after reading synthetic context"),
        );
      await expect(
        generateDiscoveredExperience(
          { OPENAI_API_KEY: "fixture" },
          {
            ...DEFAULT_PREFERENCES,
            ageBand,
            sources: source ? { ageBand: source } : {},
          },
          {
            ...base,
            outing: {
              ...base.outing,
              adultEligible: true,
              adultContext: true,
              venuePermission: false,
            },
          },
        ),
      ).rejects.toThrow("stop after reading synthetic context");
      const routing = model.mock.calls[0][2].experience_routing;
      expect(routing.adultContext.nightlifeRouteAllowed).toBe(allowed);
      expect(routing.adultContext.venuePermissionPending).toBe(true);
      expect(routing.adultContext.blockers).not.toContain(
        "venue_permission_not_confirmed",
      );
      if (blocker) expect(routing.adultContext.blockers).toContain(blocker);
      expect(routing.audience.context).toBe(
        allowed ? "adult_nightlife" : "general",
      );
      expect(routing.adultContext.alcoholSuggestionAllowed).toBe(
        allowed && ageBand === "21_plus",
      );
    },
  );
  it("permits a genuine overnight stay only with enough available time", async () => {
    const comparison = comparisonFixture();
    comparison.proposal.durationMinutes = 1440;
    comparison.proposal.title = "The Mystery Staycation";
    comparison.candidates[0].durationMinutes = 1440;
    comparison.candidates[0].title = "The Mystery Staycation";
    const overnight = {
      ...base,
      outing: { ...base.outing, travelMinutes: 60 },
    };
    model
      .mockReset()
      .mockResolvedValueOnce(comparison)
      .mockResolvedValueOnce(approvedQuestQualityFixture());
    const result = await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      DEFAULT_PREFERENCES,
      overnight,
    );
    expect(result.quest.durationMinutes).toBe(1440);
    expect(
      model.mock.calls[0][3].properties.proposal.properties.durationMinutes
        .maximum,
    ).toBe(MAX_QUEST_ACTIVITY_MINUTES);
    expect(model).toHaveBeenCalledTimes(2);

    model.mockReset().mockResolvedValueOnce(comparison);
    await expect(
      generateDiscoveredExperience(
        { OPENAI_API_KEY: "fixture" },
        DEFAULT_PREFERENCES,
        { ...overnight, outing: { ...overnight.outing, durationMinutes: 120 } },
      ),
    ).rejects.toThrow();
    expect(model).toHaveBeenCalledTimes(1);
    expect(
      model.mock.calls[0][3].properties.proposal.properties.durationMinutes
        .maximum,
    ).toBe(60);
  });
  it.each(["category", "intensity", "duration", "blank_text"])(
    "rejects %s metadata drift before independent review",
    async (field) => {
      const comparison = comparisonFixture();
      const response = structuredClone(comparison) as unknown as {
        proposal: Record<string, unknown>;
      };
      if (field === "category") response.proposal.category = "date_night";
      if (field === "intensity") response.proposal.intensity = "chill";
      if (field === "duration")
        response.proposal.durationMinutes = MAX_QUEST_ACTIVITY_MINUTES + 1;
      if (field === "blank_text") response.proposal.hook = " ";
      model.mockReset().mockResolvedValueOnce(response);
      await expect(
        generateDiscoveredExperience(
          { OPENAI_API_KEY: "fixture" },
          DEFAULT_PREFERENCES,
          base,
        ),
      ).rejects.toThrow();
      expect(model).toHaveBeenCalledTimes(1);
    },
  );
  it("accepts a feasible strong selection without requiring its subjective score to beat every alternative", async () => {
    const comparison = comparisonFixture();
    comparison.candidates[0].scores.originality = 3;
    comparison.candidates[1].scores = {
      playability: 5,
      goal: 5,
      originality: 5,
      audienceIntensity: 5,
      filmability: 5,
    };
    model
      .mockReset()
      .mockResolvedValueOnce(comparison)
      .mockResolvedValueOnce(approvedQuestQualityFixture());
    await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      DEFAULT_PREFERENCES,
      base,
    );
    expect(model).toHaveBeenCalledTimes(2);
  });
  it.each([
    "weak_playability",
    "weak_goal",
    "weak_intensity",
    "over_budget",
    "over_time",
    "duplicate_id",
    "missing_selection",
  ])("rejects %s selected concepts without retrying", async (failure) => {
    const comparison = comparisonFixture();
    if (failure === "weak_playability")
      comparison.candidates[0].scores.playability = 3;
    if (failure === "weak_goal") comparison.candidates[0].scores.goal = 3;
    if (failure === "weak_intensity")
      comparison.candidates[0].scores.audienceIntensity = 3;
    if (failure === "over_budget")
      comparison.candidates[0].estimatedCostMinor = base.outing.budgetMinor + 1;
    if (failure === "over_time") comparison.candidates[0].durationMinutes = 720;
    if (failure === "duplicate_id") comparison.candidates[1].id = "A";
    if (failure === "missing_selection") comparison.selectedConceptId = "D";
    model.mockReset().mockResolvedValueOnce(comparison);
    await expect(
      generateDiscoveredExperience(
        { OPENAI_API_KEY: "fixture" },
        DEFAULT_PREFERENCES,
        { ...base, outing: { ...base.outing, durationMinutes: 180 } },
      ),
    ).rejects.toThrow();
    expect(model).toHaveBeenCalledTimes(1);
  });
  it("rejects ordinary Full Send padding despite high self-reported review scores", async () => {
    const review = approvedQuestQualityFixture();
    model
      .mockReset()
      .mockResolvedValueOnce(comparisonFixture())
      .mockResolvedValueOnce({
        ...review,
        fullSendAssessment: {
          ordinaryVersion: "Visit a bowling alley.",
          actualDifference: "Play more rounds of the same bowling game.",
          changesExperience: false,
          paddingOnly: true,
        },
      });
    await expect(
      generateDiscoveredExperience(
        { OPENAI_API_KEY: "fixture" },
        DEFAULT_PREFERENCES,
        base,
      ),
    ).rejects.toMatchObject({ kind: "review_rejected" });
    expect(model).toHaveBeenCalledTimes(2);
  });

  it("accepts low novelty and filmability scores when the actual experience is strong", async () => {
    const comparison = comparisonFixture();
    comparison.candidates[0].scores = {
      playability: 4,
      goal: 4,
      originality: 1,
      audienceIntensity: 4,
      filmability: 1,
    };
    const review = {
      ...approvedQuestQualityFixture(),
      scores: comparison.candidates[0].scores,
    };
    model
      .mockReset()
      .mockResolvedValueOnce(comparison)
      .mockResolvedValueOnce(review);
    const result = await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      DEFAULT_PREFERENCES,
      base,
    );
    expect(result.quest.title).toBe(comparison.proposal.title);
    expect(model).toHaveBeenCalledTimes(2);
  });

  it("treats a subjective similarity criticism as advice while supplying prior experience context", async () => {
    const comparison = comparisonFixture();
    const rejected = {
      ...approvedQuestQualityFixture(),
      decision: "reject",
      findings: [
        {
          code: "weak_twist",
          severity: "blocking",
          evidence: "This uses a familiar activity family.",
          reason: "A different mechanic would offer more variety.",
        },
      ],
    };
    model
      .mockReset()
      .mockResolvedValueOnce(comparison)
      .mockResolvedValueOnce(rejected);
    const history = [
      {
        title: "Another escape room title",
        activity: "Book and attempt an escape room.",
        mechanic: "competition",
      },
    ];
    const result = await generateDiscoveredExperience(
      { OPENAI_API_KEY: "fixture" },
      DEFAULT_PREFERENCES,
      base,
      fetch,
      () => {},
      history,
    );
    expect(result.quest.title).toBe(comparison.proposal.title);
    expect(model.mock.calls[1][2].previousExperiences).toEqual(history);
    expect(model).toHaveBeenCalledTimes(2);
  });

  it.each([
    "unsafe_mechanic",
    "boundary_mismatch",
    "unsupported_facts",
    "intensity_mismatch",
    "audience_mismatch",
  ] as const)(
    "still rejects a discovered experience with objective finding %s",
    async (code) => {
      model
        .mockReset()
        .mockResolvedValueOnce(comparisonFixture())
        .mockResolvedValueOnce({
          ...approvedQuestQualityFixture(),
          decision: "reject",
          findings: [
            {
              code,
              severity: "blocking",
              evidence: "A concrete prohibited condition is present.",
              reason: "The proposal breaks a required constraint.",
            },
          ],
        });
      await expect(
        generateDiscoveredExperience(
          { OPENAI_API_KEY: "fixture" },
          DEFAULT_PREFERENCES,
          base,
        ),
      ).rejects.toMatchObject({ kind: "review_rejected", detailCodes: [code] });
      expect(model).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["playability", "goal", "audienceIntensity"] as const)(
    "rejects a selected concept when the independent review finds weak %s",
    async (criterion) => {
      const review = approvedQuestQualityFixture();
      review.scores[criterion] = 3;
      model
        .mockReset()
        .mockResolvedValueOnce(comparisonFixture())
        .mockResolvedValueOnce(review);
      await expect(
        generateDiscoveredExperience(
          { OPENAI_API_KEY: "fixture" },
          DEFAULT_PREFERENCES,
          base,
        ),
      ).rejects.toMatchObject({ kind: "review_rejected" });
      expect(model).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects an exact prior AI title before paying for its review", async () => {
    const comparison = comparisonFixture();
    model.mockReset().mockResolvedValueOnce(comparison);
    const history = [
      {
        title: comparison.proposal.title,
        activity: comparison.proposal.beats[1].action,
        mechanic: "competition",
      },
    ];
    await expect(
      generateDiscoveredExperience(
        { OPENAI_API_KEY: "fixture" },
        DEFAULT_PREFERENCES,
        base,
        fetch,
        () => {},
        history,
      ),
    ).rejects.toMatchObject({ kind: "repeated_experience" });
    expect(model).toHaveBeenCalledTimes(1);
  });
  it("skips exact previous fallback titles while retaining genuine matching alternatives", () => {
    const first = curatedDiscoveryFallback(DEFAULT_PREFERENCES, base)!;
    const history = [
      {
        title: first.quest.title,
        activity: first.quest.beats[1].action,
        mechanic: first.mechanic,
      },
    ];
    const second = curatedDiscoveryFallback(
      DEFAULT_PREFERENCES,
      base,
      history,
    )!;
    expect(second.quest.title).not.toBe(first.quest.title);
    expect(second.quest.intensity).toBe("full_send");
    expect(second.location).toBeNull();
    expect(
      curatedDiscoveryFallback(
        { ...DEFAULT_PREFERENCES, exclusions: ["physical_challenges"] },
        base,
        history,
      ),
    ).toBeNull();
  });
  it.each(["wrong_owner", "missing", "published"])(
    "rejects %s history before reservation or model calls",
    async (failure) => {
      if (failure !== "missing")
        storeHistory(
          failure === "wrong_owner"
            ? "22222222-2222-4222-8222-222222222222"
            : undefined,
          failure === "published",
        );
      const response = await send({
        ...base,
        previousProposalIds: [historyId],
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "invalid_experience_history",
      });
      expect(calls).not.toHaveBeenCalled();
      expect(model).not.toHaveBeenCalled();
    },
  );
  it("resolves only owner history and strips prior identifiers and place details from AI context", async () => {
    const previous = storeHistory();
    previous.title = "A challenge at Private Place";
    previous.beats[1].action = `Do the challenge at Private Place, 7 Hidden Street, ${previous.id}, I1234ABCD and https://private.example/place.`;
    historyProposals[0].location = {
      id: "I1234ABCD",
      name: "Private Place",
      address: "7 Hidden Street",
      url: "https://private.example/place",
      latitude: 27,
      longitude: -82,
    };
    const response = await send({ ...base, previousProposalIds: [historyId] });
    expect(response.status).toBe(200);
    const context = model.mock.calls[0][2];
    expect(context.previousExperiences).toHaveLength(1);
    expect(Object.keys(context.previousExperiences[0]).sort()).toEqual([
      "activity",
      "mechanic",
      "title",
    ]);
    const sent = JSON.stringify(context.previousExperiences);
    for (const privateText of [
      historyId,
      previous.id,
      "I1234ABCD",
      "Private Place",
      "7 Hidden Street",
      "https://private.example/place",
      "latitude",
      "longitude",
    ])
      expect(sent).not.toContain(privateText);
  });
  it("does not spend on a concurrent replay", async () => {
    inProgress = true;
    expect((await send()).status).toBe(409);
    expect(model).not.toHaveBeenCalled();
    expect(calls).not.toHaveBeenCalledWith(
      "sq_release_experience_discovery",
      expect.anything(),
    );
  });
  it("releases a terminal no-fallback failure so the exact request can retry immediately", async () => {
    const unsupported = {
      ...base,
      outing: {
        ...base.outing,
        setting: "home" as const,
        budgetMinor: 0,
        durationMinutes: 60,
      },
    };
    expect(
      curatedDiscoveryFallback(DEFAULT_PREFERENCES, unsupported),
    ).toBeNull();
    const first = await send(unsupported);
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({ error: "discovery_unavailable" });
    expect(calls).toHaveBeenCalledWith(
      "sq_release_experience_discovery",
      expect.objectContaining({
        p_actor: "11111111-1111-4111-8111-111111111111",
        p_input: { leaseUntil },
        p_key: "discovery-test-key",
        p_hash: expect.any(String),
      }),
    );
    expect((await send(unsupported)).status).toBe(503);
    expect(model).toHaveBeenCalledTimes(2);
    const reserves = calls.mock.calls.filter(
      ([name]) => name === "sq_reserve_experience_discovery",
    );
    expect(reserves[1]).toEqual(reserves[0]);
  });
  it.each(["missing_config", "changed_provider", "rate_limited"])(
    "releases an acquired lease after %s without spending on generation",
    async (failure) => {
      const environment =
        failure === "missing_config"
          ? { OPENAI_API_KEY: "" }
          : failure === "changed_provider"
            ? { AI_QUEST_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "fixture" }
            : {
                AI_RATE_LIMITER: {
                  limit: async () => ({ success: false }),
                } as AppBindings["Bindings"]["AI_RATE_LIMITER"],
              };
      const response = await send(base, "discovery-test-key", environment);
      expect(response.status).toBe(
        failure === "missing_config"
          ? 503
          : failure === "changed_provider"
            ? 409
            : 429,
      );
      expect(model).not.toHaveBeenCalled();
      expect(inProgress).toBe(false);
      expect((await send()).status).toBe(200);
    },
  );
  it.each(["store", "finish"] as const)(
    "retains the lease when the %s outcome is uncertain",
    async (failure) => {
      persistenceFailure = failure;
      expect((await send()).status).toBe(500);
      expect(calls).not.toHaveBeenCalledWith(
        "sq_release_experience_discovery",
        expect.anything(),
      );
      expect((await send()).status).toBe(409);
      expect(model).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps the original failure and existing lease if release itself is uncertain", async () => {
    releaseFailure = true;
    const response = await send(base, "discovery-test-key", {
      OPENAI_API_KEY: "",
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ai_not_configured" });
    expect(inProgress).toBe(true);
    expect(console.warn).toHaveBeenCalledWith({
      event: "experience_discovery_release_failed",
    });
  });
  it("logs safe completion timings and source only after persisting the response", async () => {
    expect((await send()).status).toBe(200);
    expect(console.info).toHaveBeenCalledWith({
      event: "experience_discovery_completed",
      source: "curated_fallback",
      provider: "openai",
      elapsedMs: expect.any(Number),
      generationElapsedMs: expect.any(Number),
      stageDurationsMs: expect.any(Object),
    });
    const finished = calls.mock.invocationCallOrder.at(-1)!;
    expect(vi.mocked(console.info).mock.invocationCallOrder[0]).toBeGreaterThan(
      finished,
    );
  });
});
