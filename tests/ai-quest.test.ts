import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aiQuestRequestSchema,
  confirmedAiPreferences,
  type AiQuestRequest,
} from "../shared/ai-quest";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  pickOuting,
  type Outing,
  type Preferences,
} from "../shared/domain";
import { catalog } from "../shared/catalog";
import { ineligibilityReasons } from "../shared/recommend";
import { aiQuestConfig, generateAiQuestProposal } from "../worker/ai-quest";

const outing = { ...DEFAULT_OUTING, budgetMinor: 10_000, durationMinutes: 300 };
const quest = catalog.find(
  (candidate) =>
    !ineligibilityReasons(candidate, outing, DEFAULT_PREFERENCES).length,
)!;
const request: AiQuestRequest = {
  templateId: quest.id,
  outing,
  providerConsent: true,
};
const proposal = {
  title: "Show the challenge before the reveal",
  hook: "Who will guess correctly?",
  filming: [
    {
      beatIndex: 2,
      shot: "Match the opening frame for the reveal.",
      onScreenText: "The reveal",
    },
    {
      beatIndex: 0,
      shot: "Show both players before starting.",
      onScreenText: "Make your prediction",
    },
    {
      beatIndex: 1,
      shot: "Show the activity in progress.",
      onScreenText: "The attempt",
    },
  ],
  loopTip: "End on the same two-person frame you used at the beginning.",
};
const providerResponse = (value: unknown = proposal) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  });
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("confirmed AI inputs and structured filming proposals", () => {
  it("requires explicit provider consent and rejects imported text or extra fields", () => {
    expect(
      aiQuestRequestSchema.safeParse({ ...request, providerConsent: undefined })
        .success,
    ).toBe(false);
    expect(
      aiQuestRequestSchema.safeParse({
        ...request,
        summary: "I like watching pranks",
      }).success,
    ).toBe(false);
    expect(
      aiQuestRequestSchema.safeParse({ ...request, latitude: 47.5 }).success,
    ).toBe(false);
  });
  it("sends only confirmed structured answers, excluding legacy/defaults and free text", () => {
    const preferences: Preferences = {
      ...DEFAULT_PREFERENCES,
      role: "rotate",
      interests: ["music"],
      skills: ["comedy"],
      humorExamples: "Watching pranks does not mean I will do them",
      otherSkill: "Confidential employer name",
      sharing: "public",
      sources: {
        role: "survey",
        interests: "summary_review",
        humorExamples: "survey",
        otherSkill: "survey",
        sharing: "survey",
      },
      legacyUnconfirmed: ["role"],
    };
    expect(confirmedAiPreferences(preferences)).toEqual({
      interests: ["music"],
    });
    expect(confirmedAiPreferences(DEFAULT_PREFERENCES)).toEqual({});
  });
  it("never reports a model ready without its server secret and cost limiter", () => {
    expect(aiQuestConfig({} as Parameters<typeof aiQuestConfig>[0])).toEqual({
      configured: false,
      model: null,
      provider: null,
    });
    expect(
      aiQuestConfig({ OPENAI_API_KEY: "fixture-secret" } as Parameters<
        typeof aiQuestConfig
      >[0]),
    ).toEqual({ configured: false, model: null, provider: null });
  });
  it("uses Responses structured output, refuses provider storage and retains canonical mechanics", async () => {
    const original = structuredClone(quest);
    const send = vi.fn(async () => providerResponse());
    const preferences: Preferences = {
      ...DEFAULT_PREFERENCES,
      interests: ["music"],
      sources: { interests: "survey" },
    };
    const result = await generateAiQuestProposal(
      { OPENAI_API_KEY: "fixture-server-only" },
      quest,
      preferences,
      request,
      send,
    );
    expect(result).toMatchObject({
      templateId: quest.id,
      model: "gpt-6-astra",
      proposal: { title: proposal.title },
    });
    expect(result.proposal.filming.map((beat) => beat.beatIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(quest).toEqual(original);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.redirect).toBe("error");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "gpt-6-astra",
      store: false,
      max_output_tokens: 3000,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", strict: true } },
    });
    const context = JSON.parse(body.input[0].content[0].text);
    expect(context.canonical_quest.beats).toEqual(quest.beats);
    expect(context.confirmed_preferences).toEqual({ interests: ["music"] });
    expect(context.outing).not.toHaveProperty("area");
    expect(context.outing).not.toHaveProperty("applePlaceId");
    expect(JSON.stringify(context)).not.toContain("fixture-server-only");
    expect(context).not.toHaveProperty("summary");
  });
  it("sends a matching coarse place category but never a place ID or coordinates", async () => {
    const send = vi.fn(async () => providerResponse());
    await generateAiQuestProposal(
      { OPENAI_API_KEY: "fixture" },
      quest,
      DEFAULT_PREFERENCES,
      {
        ...request,
        outing: {
          ...outing,
          setting: "outside",
          applePlaceId: "I123456789ABCDEF0",
        },
        placeContext: { placeId: "I123456789ABCDEF0", category: "Park" },
      },
      send,
    );
    const body = JSON.parse(
      (send.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    const context = JSON.parse(body.input[0].content[0].text);
    expect(context.selected_place).toEqual({ category: "Park" });
    expect(JSON.stringify(context)).not.toContain("I123456789ABCDEF0");
  });
  it("ignores a mismatched place and an undefined outside place safely", async () => {
    for (const placeContext of [
      undefined,
      { placeId: "I123456789ABCDEF1", category: "Park" as const },
    ]) {
      const send = vi.fn(async () => providerResponse());
      await generateAiQuestProposal(
        { OPENAI_API_KEY: "fixture" },
        quest,
        DEFAULT_PREFERENCES,
        {
          ...request,
          outing: { ...outing, setting: "outside" },
          placeContext,
        },
        send,
      );
      const body = JSON.parse(
        (send.mock.calls[0] as unknown as [string, RequestInit])[1]
          .body as string,
      );
      expect(JSON.parse(body.input[0].content[0].text)).not.toHaveProperty(
        "selected_place",
      );
    }
  });
  it.each([
    { ...proposal, award: { xp: 9000 } },
    {
      ...proposal,
      filming: [
        { ...proposal.filming[0], beatIndex: 0 },
        { ...proposal.filming[1], beatIndex: 0 },
        proposal.filming[2],
      ],
    },
    { ...proposal, hook: "" },
    { ...proposal, hook: "x".repeat(261) },
  ])(
    "rejects invalid or mechanic-changing provider fields",
    async (invalid) => {
      await expect(
        generateAiQuestProposal(
          { OPENAI_API_KEY: "fixture" },
          quest,
          DEFAULT_PREFERENCES,
          request,
          async () => providerResponse(invalid),
        ),
      ).rejects.toMatchObject({ code: "ai_unavailable", status: 503 });
    },
  );
  it.each([
    Response.json({ status: "incomplete", output: [] }),
    Response.json({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    }),
    new Response("upstream private failure text", { status: 401 }),
    new Response("x".repeat(70_000)),
  ])(
    "turns incomplete, refused, failed and oversized output into a generic error",
    async (response) => {
      await expect(
        generateAiQuestProposal(
          { OPENAI_API_KEY: "fixture-server-only" },
          quest,
          DEFAULT_PREFERENCES,
          request,
          async () => response,
        ),
      ).rejects.toMatchObject({
        code: "ai_unavailable",
        message:
          "AI filming help couldn’t finish. Your quest is unchanged; try again shortly.",
      });
    },
  );
  it("aborts stalled provider requests and retains a safe error", async () => {
    vi.useFakeTimers();
    const send: typeof fetch = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("private timeout")),
            { once: true },
          );
        }),
    );
    const result = generateAiQuestProposal(
      { OPENAI_API_KEY: "fixture" },
      quest,
      DEFAULT_PREFERENCES,
      request,
      send,
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: "ai_unavailable",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});

describe("active-run outings reach the strict request contract", () => {
  it("rejects a stored run outing as-is and accepts it once projected", () => {
    // Accepted runs persist the assigned role beside the outing fields.
    const stored = { ...outing, role: "camera_person" } as Outing &
      Record<string, unknown>;
    expect(
      aiQuestRequestSchema.safeParse({ ...request, outing: stored }).success,
    ).toBe(false);
    const projected = pickOuting(stored);
    expect(projected).toEqual(outing);
    expect("role" in projected).toBe(false);
    expect(
      aiQuestRequestSchema.safeParse({ ...request, outing: projected }).success,
    ).toBe(true);
  });
  it("keeps an optional selected place and drops nothing the schema accepts", () => {
    const withPlace = {
      ...outing,
      applePlaceId: "I1234567890ABCDEF",
      role: null,
    };
    const projected = pickOuting(withPlace as Outing & Record<string, unknown>);
    expect(projected.applePlaceId).toBe("I1234567890ABCDEF");
    expect(Object.keys(projected).sort()).toEqual(
      [...Object.keys(outing), "applePlaceId"].sort(),
    );
  });
});
