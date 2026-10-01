import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext, AppEnv } from "../worker/services";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type Preferences,
  type QuestVariant,
} from "../shared/domain";
import { catalog } from "../shared/catalog";
import { ineligibilityReasons } from "../shared/recommend";
import { originalQuestIdentity } from "../shared/community";
import {
  approvedQuestQualityFixture,
  questConceptsFixture,
} from "./ai-draft-fixtures";

const state = vi.hoisted(() => ({
  preferences: {} as Preferences,
  quests: [] as QuestVariant[],
}));
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
vi.mock("../worker/catalog", () => ({
  publishedQuests: async () => state.quests,
}));
vi.mock("../worker/services", async (load) => {
  const actual = await load<typeof import("../worker/services")>();
  return {
    ...actual,
    authenticate: async (c: AppContext) => {
      if (!c.req.header("Authorization"))
        throw new actual.ApiError(
          "sign_in_required",
          "Sign in to continue.",
          401,
        );
      c.set("actor", "11111111-1111-4111-8111-111111111111");
      c.set("userDb", {
        from: () => {
          const query = {
            select: () => query,
            eq: () => query,
            single: async () => ({
              data: { preferences: state.preferences },
              error: null,
            }),
          };
          return query;
        },
      } as unknown as AppContext["var"]["userDb"]);
    },
  };
});
import worker from "../worker/index";
const outing = { ...DEFAULT_OUTING, budgetMinor: 10_000, durationMinutes: 300 };
const quest = catalog.find(
  (candidate) =>
    !ineligibilityReasons(candidate, outing, DEFAULT_PREFERENCES).length,
)!;
const input = { templateId: quest.id, outing, providerConsent: true };
const proposal = {
  title: quest.title,
  hook: quest.hook,
  filming: [0, 1, 2].map((beatIndex) => ({
    beatIndex,
    shot: "Show your own activity.",
    onScreenText: "The challenge",
  })),
  loopTip: "Match your opening frame.",
};
const request = (
  body: unknown = input,
  env: Partial<AppEnv> = {},
  signedIn = true,
  path = "ai-assist",
) =>
  worker.fetch(
    new Request(`https://app.test/api/quests/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signedIn ? { Authorization: "Bearer fixture" } : {}),
      },
      body: JSON.stringify(body),
    }),
    {
      APP_ORIGIN: "https://app.test",
      OPENAI_API_KEY: "fixture-server-secret",
      AI_RATE_LIMITER: { limit: async () => ({ success: true }) },
      ...env,
    } as unknown as AppEnv,
    {} as ExecutionContext,
  );
beforeEach(() => {
  vi.restoreAllMocks();
  state.preferences = { ...DEFAULT_PREFERENCES };
  state.quests = [quest];
});

describe("authenticated AI original-draft boundary", () => {
  const draftId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const draftInput = {
    draftId,
    idea: "A creative two-person challenge",
    outing,
    provider: "openai",
    providerConsent: true,
  };
  const draftRequest = (
    body: unknown = draftInput,
    env: Partial<AppEnv> = {},
    signedIn = true,
  ) => request(body, env, signedIn, "ai-draft");
  it("requires authentication, explicit named-provider consent and a configured cost limiter", async () => {
    const send = vi.spyOn(globalThis, "fetch");
    expect((await draftRequest(draftInput, {}, false)).status).toBe(401);
    expect(
      (await draftRequest({ ...draftInput, providerConsent: false })).status,
    ).toBe(422);
    expect(
      (await draftRequest({ ...draftInput, summary: "private" })).status,
    ).toBe(422);
    expect(
      (await draftRequest(draftInput, { AI_RATE_LIMITER: undefined })).status,
    ).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });
  it("does not switch a user's consent to another provider or consume quota for stale consent", async () => {
    const send = vi.spyOn(globalThis, "fetch");
    const limit = vi.fn(async () => ({ success: true }));
    expect(
      (
        await draftRequest(draftInput, {
          AI_QUEST_PROVIDER: "xai",
          XAI_API_KEY: "fixture-xai-secret",
          AI_RATE_LIMITER: { limit },
        } as unknown as Partial<AppEnv>)
      ).status,
    ).toBe(409);
    expect(limit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("shares the same per-user AI quota with filming instead of creating a second spending lane", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const send = vi.spyOn(globalThis, "fetch");
    expect(
      (
        await draftRequest(draftInput, {
          AI_RATE_LIMITER: { limit },
        } as unknown as Partial<AppEnv>)
      ).status,
    ).toBe(429);
    expect(limit).toHaveBeenCalledWith({
      key: "quest-ai:11111111-1111-4111-8111-111111111111",
    });
    expect(send).not.toHaveBeenCalled();
  });
  it("returns a validated unsaved draft with server-assigned identity and awards", async () => {
    const {
      id: _id,
      familyId: _familyId,
      version: _version,
      award: _award,
      cooldownDays: _cooldown,
      variantKey: _variant,
      sponsorDisclosure: _sponsor,
      ...content
    } = quest;
    const draftContent = { ...content, allowedGroups: [outing.group] };
    const stages = [
      questConceptsFixture(draftContent),
      draftContent,
      approvedQuestQualityFixture(),
    ];
    const send = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(stages.shift()),
              },
            ],
          },
        ],
      }),
    );
    const response = await draftRequest();
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(3);
    expect(await response.json()).toMatchObject({
      draftId,
      provider: "openai",
      quest: {
        ...originalQuestIdentity(draftId, 1),
        award: quest.award,
        cooldownDays: 30,
      },
    });
  });
  it("blocks an unresolved custom boundary before sending the brief to a provider", async () => {
    state.preferences = {
      ...DEFAULT_PREFERENCES,
      otherExclusion: "Private medical boundary",
    };
    const send = vi.spyOn(globalThis, "fetch");
    expect((await draftRequest()).status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("authenticated AI assistance boundary", () => {
  it("reports public config honestly and without secrets before dynamic quest lookup", async () => {
    const response = await worker.fetch(
      new Request("https://app.test/api/quests/ai-config"),
      {} as AppEnv,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: false,
      model: null,
      provider: null,
    });
    const configured = await worker.fetch(
      new Request("https://app.test/api/quests/ai-config"),
      {
        OPENAI_API_KEY: "fixture-server-secret",
        AI_RATE_LIMITER: { limit: vi.fn() },
      } as unknown as AppEnv,
      {} as ExecutionContext,
    );
    expect(await configured.json()).toEqual({
      configured: true,
      model: "gpt-6-astra",
      provider: "openai",
    });
  });
  it("requires authentication before provider requests", async () => {
    const send = vi.spyOn(globalThis, "fetch");
    expect((await request(input, {}, false)).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
  it("requires consent and accepts no imported summary in provider input", async () => {
    const send = vi.spyOn(globalThis, "fetch");
    for (const body of [
      { ...input, providerConsent: false },
      { ...input, summary: "I like watching pranks" },
    ])
      expect((await request(body)).status).toBe(422);
    expect(send).not.toHaveBeenCalled();
  });
  it("fails closed without configured key or cost limiter", async () => {
    const send = vi.spyOn(globalThis, "fetch");
    for (const env of [
      { OPENAI_API_KEY: undefined },
      { AI_RATE_LIMITER: undefined },
    ])
      expect((await request(input, env)).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });
  it("enforces the per-user AI quota before upstream generation", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const send = vi.spyOn(globalThis, "fetch");
    const response = await request(input, {
      AI_RATE_LIMITER: { limit },
    } as unknown as Partial<AppEnv>);
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({
      key: "quest-ai:11111111-1111-4111-8111-111111111111",
    });
    expect(send).not.toHaveBeenCalled();
  });
  it("cannot use AI to bypass current group, time, intensity, budget, or a custom boundary", async () => {
    const send = vi.spyOn(globalThis, "fetch");
    for (const patch of [
      { participants: 1, group: "solo" },
      { durationMinutes: 15 },
      { intensity: "full_send" },
      { budgetMinor: 0, travelCostMinor: 100 },
      { setting: "outside" },
    ]) {
      const response = await request({
        ...input,
        outing: { ...outing, ...patch },
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    state.preferences = {
      ...DEFAULT_PREFERENCES,
      otherExclusion: "Keep this custom boundary in place",
    };
    expect((await request()).status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
  it("does not assist an unpublished or withdrawn template", async () => {
    state.quests = [];
    const send = vi.spyOn(globalThis, "fetch");
    expect((await request()).status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
  it("returns an isolated proposal for a still-eligible published quest", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(proposal) }],
          },
        ],
      }),
    );
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      templateId: quest.id,
      proposal,
      model: "gpt-6-astra",
    });
  });
});
