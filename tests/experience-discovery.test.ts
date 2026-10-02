import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  questVariantSchema,
  type QuestVariant,
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
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  cache = null;
  inProgress = false;
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
      (candidate) => ({
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
    expect(generated.quest.beats.map(({ label }) => label)).toEqual([
      "Preparation",
      "The challenge",
      "The result",
    ]);
    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls[1][2].proposal.cost.maxMinor).toBe(0);
    expect(model.mock.calls[1][2].selectedConcept.id).toBe("A");
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
      60000, 30000,
    ]);
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
  it.each(["category", "intensity", "duration", "blank_text"])(
    "rejects %s metadata drift before independent review",
    async (field) => {
      const comparison = comparisonFixture();
      const response = structuredClone(comparison) as unknown as {
        proposal: Record<string, unknown>;
      };
      if (field === "category") response.proposal.category = "date_night";
      if (field === "intensity") response.proposal.intensity = "chill";
      if (field === "duration") response.proposal.durationMinutes = 721;
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
    "weak",
    "over_budget",
    "over_time",
    "duplicate_id",
    "missing_selection",
  ])("rejects %s selected concepts without retrying", async (failure) => {
    const comparison = comparisonFixture();
    if (failure === "weak")
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
  it("retains every independent quality gate and rejects renamed prior activities", async () => {
    const comparison = comparisonFixture();
    const rejected = {
      ...approvedQuestQualityFixture(),
      decision: "reject",
      findings: [
        {
          code: "weak_twist",
          severity: "blocking",
          evidence: "Same activity under a new name.",
          reason: "The previous proposal already suggested this experience.",
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
    await expect(
      generateDiscoveredExperience(
        { OPENAI_API_KEY: "fixture" },
        DEFAULT_PREFERENCES,
        base,
        fetch,
        () => {},
        history,
      ),
    ).rejects.toMatchObject({
      kind: "review_rejected",
      detailCodes: ["weak_twist"],
    });
    expect(model.mock.calls[1][2].previousExperiences).toEqual(history);
    expect(model).toHaveBeenCalledTimes(2);
  });
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
  });
});
