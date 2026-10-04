import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type Preferences,
} from "../shared/domain";
import type {
  ExperienceDiscoveryRequest,
  ExperienceDiscoveryResult,
} from "../shared/experience-discovery";
import {
  curatedDiscoveryFallback,
  registerExperienceDiscovery,
} from "../worker/experience-discovery";
import {
  ApiError,
  type AppBindings,
  type AppContext,
} from "../worker/services";

vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
const request: ExperienceDiscoveryRequest = {
  provider: "openai",
  consent: true,
  nearbyPlaces: [],
  outing: {
    ...DEFAULT_OUTING,
    category: "demon",
    intensity: "full_send",
    setting: "venue",
    group: "friends",
    participants: 4,
    budgetMinor: 40000,
    durationMinutes: 300,
    adultEligible: true,
    adultContext: true,
  },
};
let preferences: Preferences;
let replay: ExperienceDiscoveryResult;
const invoke = vi.fn(async () => ({ data: { response: replay }, error: null }));
const app = new Hono<AppBindings>();
app.use("*", async (c, next) => {
  c.set("actor", "11111111-1111-4111-8111-111111111111");
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: { preferences }, error: null }),
  };
  c.set("userDb", {
    from: () => query,
  } as unknown as AppContext["var"]["userDb"]);
  c.set("serviceDb", {
    rpc: invoke,
  } as unknown as AppContext["var"]["serviceDb"]);
  await next();
});
app.onError((error, c) =>
  c.json(
    { error: error instanceof ApiError ? error.code : "internal" },
    error instanceof ApiError ? error.status : 500,
  ),
);
registerExperienceDiscovery(app);
const send = () =>
  app.request("/api/quests/discover", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "cached-adult-quest",
    },
    body: JSON.stringify(request),
  });

beforeEach(() => {
  invoke.mockClear();
  preferences = {
    ...DEFAULT_PREFERENCES,
    ageBand: "21_plus",
    sources: { ageBand: "survey" },
  };
  const ordinary = curatedDiscoveryFallback(DEFAULT_PREFERENCES, {
    ...request,
    outing: { ...request.outing, adultContext: false },
  })!.quest;
  const quest = {
    ...ordinary,
    minimumAge: 21 as const,
    adultOnly: true,
    supportsAdultContext: true,
    conflicts: ["adult_venues" as const],
  };
  replay = {
    candidates: [
      {
        ...quest,
        effectiveBudgetMinor: 40000,
        estimatedCostMinMinor: 0,
        estimatedCostMaxMinor: 0,
        whyFits: [],
        ready: false,
        selectedRole: null,
        rewardEligibility: { eligible: false, reason: "private_generated" },
      },
    ],
    proposals: [],
    source: "ai",
    provider: "openai",
    model: "fixture",
    generatedAt: new Date().toISOString(),
  };
});

it("replays without generation when current profile still qualifies", async () => {
  const result = await send();
  expect(result.status).toBe(200);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it.each([null, "under_18"] as const)(
  "blocks a stale adult request for current age %s before reserving or spending",
  async (ageBand) => {
    preferences.ageBand = ageBand;
    const result = await send();
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: "age_preferences_required" });
    expect(invoke).not.toHaveBeenCalled();
  },
);

it("does not replay a 21+ plan after age is changed to 18–20", async () => {
  preferences.ageBand = "18_20";
  const result = await send();
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({
    error: "discovery_preferences_changed",
  });
});

it("does not replay a plan after the user excludes its adult venue", async () => {
  preferences.exclusions = ["adult_venues"];
  const result = await send();
  expect(result.status).toBe(409);
  expect(await result.json()).toEqual({
    error: "discovery_preferences_changed",
  });
});
