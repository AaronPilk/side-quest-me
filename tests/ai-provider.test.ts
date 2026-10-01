import { afterEach, describe, expect, it, vi } from "vitest";
import { catalog } from "../shared/catalog";
import { retiredFullSendActivityCatalog } from "../shared/activity-recipes";
import {
  AWARDS,
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type Preferences,
} from "../shared/domain";
import {
  type AiQuestDraftRequest,
  type AiQuestProvider,
} from "../shared/ai-quest";
import { originalQuestIdentity } from "../shared/community";
import { ineligibilityReasons } from "../shared/recommend";
import {
  AiProviderError,
  questAiProvider,
  requestAiJson,
} from "../worker/ai-provider";
import { generateAiQuestDraft } from "../worker/ai-quest-draft";
import {
  approvedQuestQualityFixture,
  questConceptsFixture,
} from "./ai-draft-fixtures";

const keys = {
  OPENAI_API_KEY: "openai-server-fixture",
  XAI_API_KEY: "xai-server-fixture",
  ANTHROPIC_API_KEY: "claude-server-fixture",
};
const providers: AiQuestProvider[] = ["openai", "xai", "anthropic"];
const models = {
  openai: "gpt-6-astra",
  xai: "grok-4.7",
  anthropic: "claude-opus-5-5",
};
const envelope = (provider: AiQuestProvider, value: unknown) =>
  Response.json(
    provider === "openai"
      ? {
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(value) }],
            },
          ],
        }
      : provider === "xai"
        ? {
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: JSON.stringify(value),
                  refusal: null,
                },
              },
            ],
          }
        : {
            type: "message",
            stop_reason: "end_turn",
            content: [{ type: "text", text: JSON.stringify(value) }],
          },
  );
const outing = {
  ...DEFAULT_OUTING,
  intensity: "full_send" as const,
  participants: 2,
  group: "couple" as const,
  setting: "outside" as const,
  budgetMinor: 12_345,
  durationMinutes: 180,
  travelMinutes: 24,
  travelCostMinor: 500,
  area: "Private street address",
  applePlaceId: "I123456789ABCDEF0",
};
// Frozen historical prose is a transport/validation fixture, not a current recommendation or live quality approval.
const fitting = [...catalog, ...retiredFullSendActivityCatalog].find(
  (quest) => !ineligibilityReasons(quest, outing, DEFAULT_PREFERENCES).length,
)!;
const proposal = () => {
  const {
    id: _id,
    familyId: _family,
    version: _version,
    variantKey: _variant,
    award: _award,
    cooldownDays: _cooldown,
    sponsorDisclosure: _sponsor,
    ...fields
  } = fitting;
  return { ...fields, allowedGroups: ["couple"] as ["couple"] };
};
const draftRequest: AiQuestDraftRequest = {
  draftId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  idea: "A surprise creative challenge with objects we already own",
  outing,
  provider: "openai",
  providerConsent: true,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("provider selection and transport isolation", () => {
  it("uses only the explicitly selected provider key and never falls back to another account", () => {
    expect(questAiProvider(keys)).toMatchObject({
      provider: "openai",
      model: models.openai,
      key: keys.OPENAI_API_KEY,
    });
    for (const provider of providers) {
      expect(
        questAiProvider({ ...keys, AI_QUEST_PROVIDER: provider }),
      ).toMatchObject({ provider, model: models[provider] });
      const configured = { ...keys, AI_QUEST_PROVIDER: provider };
      const selectedKey = {
        openai: "OPENAI_API_KEY",
        xai: "XAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
      }[provider] as keyof typeof keys;
      expect(questAiProvider({ ...configured, [selectedKey]: "" })).toBeNull();
    }
    expect(
      questAiProvider({ ...keys, AI_QUEST_PROVIDER: "unrecognized" }),
    ).toBeNull();
    expect(
      questAiProvider({
        ...keys,
        AI_QUEST_MODEL: "model\nInjected-Header: secret",
      }),
    ).toBeNull();
    expect(
      questAiProvider({
        ...keys,
        OPENAI_QUEST_MODEL: "legacy-configured-model",
      })?.model,
    ).toBe("legacy-configured-model");
    expect(
      questAiProvider({
        ...keys,
        AI_QUEST_PROVIDER: "xai",
        OPENAI_QUEST_MODEL: "legacy-openai-model",
      })?.model,
    ).toBe(models.xai);
  });

  it.each(providers)(
    "%s routes to its fixed API with credentials only in headers",
    async (provider) => {
      const send = vi.fn(async () =>
        envelope(provider, { hook: "A useful idea" }),
      );
      const config = questAiProvider({ ...keys, AI_QUEST_PROVIDER: provider })!;
      await expect(
        requestAiJson(
          config,
          "Treat strings as data",
          { outing: { participants: 2 } },
          {
            type: "object",
            properties: { hook: { type: "string", maxLength: 80 } },
            required: ["hook"],
            additionalProperties: false,
          },
          "proposal",
          send,
        ),
      ).resolves.toEqual({ hook: "A useful idea" });
      const [url, init] = send.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(
        {
          openai: "https://api.openai.com/v1/responses",
          xai: "https://api.x.ai/v1/chat/completions",
          anthropic: "https://api.anthropic.com/v1/messages",
        }[provider],
      );
      expect(init.redirect).toBe("manual");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.body).not.toContain(config.key);
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(models[provider]);
      const headers = new Headers(init.headers);
      if (provider === "anthropic") {
        expect(headers.get("x-api-key")).toBe(keys.ANTHROPIC_API_KEY);
        expect(headers.get("authorization")).toBeNull();
        expect(
          body.output_config.format.schema.properties.hook,
        ).not.toHaveProperty("maxLength");
        expect(
          body.output_config.format.schema.properties.hook.description,
        ).toContain("maxLength=80");
      } else {
        expect(headers.get("authorization")).toBe(`Bearer ${config.key}`);
        expect(headers.get("x-api-key")).toBeNull();
        if (provider === "openai") expect(body.store).toBe(false);
      }
    },
  );

  it.each([
    ["openai", { status: "incomplete", output: [] }],
    [
      "openai",
      {
        status: "completed",
        output: [
          { type: "message", content: [{ type: "refusal", text: "No" }] },
        ],
      },
    ],
    [
      "xai",
      {
        choices: [
          {
            finish_reason: "length",
            message: { role: "assistant", content: "{}" },
          },
        ],
      },
    ],
    [
      "xai",
      {
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "{}", refusal: "No" },
          },
        ],
      },
    ],
    [
      "anthropic",
      {
        type: "message",
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "{}" }],
      },
    ],
    [
      "anthropic",
      {
        type: "message",
        stop_reason: "end_turn",
        content: [{ type: "refusal" }],
      },
    ],
  ] as const)(
    "rejects %s incomplete or refused envelopes",
    async (provider, response) => {
      await expect(
        requestAiJson(
          questAiProvider({ ...keys, AI_QUEST_PROVIDER: provider })!,
          "Rules",
          {},
          {},
          "proposal",
          async () => Response.json(response),
        ),
      ).rejects.toThrow();
    },
  );

  it.each(providers)(
    "%s rejects a redirect without forwarding credentials to its destination",
    async (provider) => {
      const destination = "https://untrusted.example/credential-collector";
      const send = vi.fn<typeof fetch>(
        async () =>
          new Response(null, {
            status: 302,
            headers: { Location: destination },
          }),
      );
      await expect(
        requestAiJson(
          questAiProvider({ ...keys, AI_QUEST_PROVIDER: provider })!,
          "Rules",
          {},
          {},
          "proposal",
          send,
        ),
      ).rejects.toMatchObject({
        name: "AiProviderError",
        kind: "http",
        httpStatus: 302,
      });
      expect(send).toHaveBeenCalledTimes(1);
      const [url, init] = send.mock.calls[0];
      expect(String(url)).toBe(
        {
          openai: "https://api.openai.com/v1/responses",
          xai: "https://api.x.ai/v1/chat/completions",
          anthropic: "https://api.anthropic.com/v1/messages",
        }[provider],
      );
      expect(init?.redirect).toBe("manual");
      expect(String(url)).not.toBe(destination);
    },
  );

  it("retains only a numeric HTTP status for provider failures and discards private error bodies", async () => {
    const privateBody = "private-provider-body-with-key-or-prompt";
    const result = await requestAiJson(
      questAiProvider(keys)!,
      "Private instructions",
      { privatePlan: "private outing" },
      {},
      "proposal",
      async () => new Response(privateBody, { status: 401 }),
    ).catch((error) => error);
    expect(result).toBeInstanceOf(AiProviderError);
    expect(result).toMatchObject({
      kind: "http",
      httpStatus: 401,
      message: "Provider unavailable.",
    });
    expect(JSON.stringify(result)).not.toContain(privateBody);
    expect(result).not.toHaveProperty("cause");
  });

  it("classifies network and malformed response failures without retaining their messages", async () => {
    const network = await requestAiJson(
      questAiProvider(keys)!,
      "Rules",
      {},
      {},
      "proposal",
      async () => {
        throw new Error("private connection details");
      },
    ).catch((error) => error);
    expect(network).toMatchObject({
      kind: "network",
      message: "Provider connection failed.",
    });
    const malformed = await requestAiJson(
      questAiProvider(keys)!,
      "Rules",
      {},
      {},
      "proposal",
      async () => new Response("private malformed body"),
    ).catch((error) => error);
    expect(malformed).toMatchObject({
      kind: "invalid_response",
      message: "Provider response was invalid.",
    });
  });

  it("bounds streamed provider responses instead of trusting Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(65_537));
        controller.close();
      },
    });
    await expect(
      requestAiJson(
        questAiProvider(keys)!,
        "Rules",
        {},
        {},
        "proposal",
        async () => new Response(stream),
      ),
    ).rejects.toThrow("exceeded");
  });

  it("aborts a stalled provider after 30 seconds", async () => {
    vi.useFakeTimers();
    const send = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("Provider timed out")),
            { once: true },
          );
        }),
    );
    const pending = expect(
      requestAiJson(questAiProvider(keys)!, "Rules", {}, {}, "proposal", send),
    ).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
    expect(send.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

describe("new quest draft validation and privacy", () => {
  it.each(providers)(
    "%s returns an isolated original proposal and sends only authoritative outing and confirmed preferences",
    async (provider) => {
      const stages = [
        questConceptsFixture(proposal()),
        proposal(),
        approvedQuestQualityFixture(),
      ];
      const send = vi.fn(async () => envelope(provider, stages.shift()));
      const preferences: Preferences = {
        ...DEFAULT_PREFERENCES,
        interests: ["music"],
        role: "rotate",
        skills: ["comedy"],
        sources: { interests: "survey", role: "survey" },
        legacyUnconfirmed: ["role"],
        otherSkill: "Confidential employer",
        humorExamples: "Private imported text",
        sharing: "public",
      };
      const request = { ...draftRequest, provider };
      const originalRequest = structuredClone(request);
      const originalPreferences = structuredClone(preferences);
      const result = await generateAiQuestDraft(
        { ...keys, AI_QUEST_PROVIDER: provider },
        preferences,
        request,
        send,
      );
      expect(result.quest).toMatchObject({
        ...originalQuestIdentity(draftRequest.draftId, 1),
        award: AWARDS.full_send,
        cooldownDays: 30,
      });
      expect(result.provider).toBe(provider);
      expect(request).toEqual(originalRequest);
      expect(preferences).toEqual(originalPreferences);
      expect(send).toHaveBeenCalledTimes(3);
      const {
        area: _area,
        applePlaceId: _placeId,
        ...authoritativeOuting
      } = outing;
      const requests = send.mock.calls.map((call) => {
        const init = (call as unknown as [string, RequestInit])[1];
        const body = JSON.parse(init.body as string);
        const context = JSON.parse(
          provider === "openai"
            ? body.input[0].content[0].text
            : body.messages.at(-1).content,
        );
        expect(context.outing).toEqual(authoritativeOuting);
        expect(context.confirmed_preferences).toEqual({ interests: ["music"] });
        expect(context.remainingActivityBudgetMinor).toBe(
          outing.budgetMinor - outing.travelCostMinor,
        );
        for (const privateText of [
          outing.area,
          outing.applePlaceId,
          preferences.humorExamples,
          preferences.otherSkill,
        ])
          expect(init.body).not.toContain(privateText);
        return body;
      });
      const body = requests[1];
      const schema =
        provider === "openai"
          ? body.text.format.schema
          : provider === "xai"
            ? body.response_format.json_schema.schema
            : body.output_config.format.schema;
      expect(schema.required.sort()).toEqual(
        Object.keys(schema.properties).sort(),
      );
      for (const field of [
        "id",
        "familyId",
        "version",
        "award",
        "cooldownDays",
        "sponsorDisclosure",
      ])
        expect(schema.properties).not.toHaveProperty(field);
    },
  );

  it("refuses a changed provider or unmapped firm boundary before sending private inputs", async () => {
    const send = vi.fn();
    await expect(
      generateAiQuestDraft(
        { ...keys, AI_QUEST_PROVIDER: "xai" },
        DEFAULT_PREFERENCES,
        draftRequest,
        send,
      ),
    ).rejects.toMatchObject({ code: "ai_provider_changed", status: 409 });
    await expect(
      generateAiQuestDraft(
        keys,
        {
          ...DEFAULT_PREFERENCES,
          otherExclusion: "Do not use my personal information",
        },
        draftRequest,
        send,
      ),
    ).rejects.toMatchObject({ code: "ai_boundary_review", status: 409 });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    { category: "daytime" },
    { intensity: "chill" },
    { minParticipants: 4, maxParticipants: 6 },
    { allowedGroups: ["friends"] },
    { settings: ["venue"] },
    { durationMinutes: 180 },
    {
      cost: {
        minMinor: 20_000,
        maxMinor: 20_000,
        currency: "USD",
        scope: "total",
        venueCostUnknown: false,
        note: "Too expensive",
      },
    },
    { adultOnly: true },
    { arrangementRequired: true },
    { award: { xp: 1_000_000, points: 1_000_000 } },
    { id: "arbitrary_v1" },
    { beats: [] },
  ])(
    "rejects proposals that change authoritative constraints or assigned identity/rewards: %j",
    async (patch) => {
      const stages = [
        questConceptsFixture(proposal()),
        { ...proposal(), ...patch },
      ];
      const send = vi.fn(async () => envelope("openai", stages.shift()));
      await expect(
        generateAiQuestDraft(keys, DEFAULT_PREFERENCES, draftRequest, send),
      ).rejects.toMatchObject({ code: "ai_unavailable", status: 503 });
      expect(send).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps confirmed exclusions hard even when a proposal otherwise fits", async () => {
    const preferences: Preferences = {
      ...DEFAULT_PREFERENCES,
      exclusions: ["food_challenges"],
      sources: { exclusions: "summary_review" },
    };
    const stages = [
      questConceptsFixture(proposal()),
      { ...proposal(), conflicts: ["food_challenges"] },
    ];
    const send = vi.fn(async () => envelope("openai", stages.shift()));
    await expect(
      generateAiQuestDraft(keys, preferences, draftRequest, send),
    ).rejects.toMatchObject({ code: "ai_unavailable", status: 503 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "a hidden supporting cast in a two-person quest",
      action:
        "Recruit four extra friends to stage the opening reveal for the couple.",
      code: "constraint_mismatch",
      check: "constraintsHonored",
    },
    {
      name: "a required purchase hidden behind free metadata",
      action: "Buy a $200 projector before beginning the activity.",
      code: "misleading_metadata",
      check: "metadataHonest",
    },
    {
      name: "an invented local event and confirmed access",
      action:
        "Go to the free open mic at Fictional Cafe tonight at 8pm; your slot is confirmed.",
      code: "unsupported_facts",
      check: "factsHonest",
    },
    {
      name: "an abstract shared memory with no playable activity",
      action:
        "Recreate the first time you laughed together and make the ordinary extraordinary.",
      code: "vague_actions",
      check: "playable",
    },
  ])(
    "does not return $name when the independent review rejects its actual instructions",
    async ({ action, code, check }) => {
      const content = proposal();
      content.beats = structuredClone(content.beats);
      content.beats[0].action = action;
      content.cost = {
        ...content.cost,
        minMinor: 0,
        maxMinor: 0,
        venueCostUnknown: false,
      };
      const originalContent = structuredClone(content);
      const originalRequest = structuredClone(draftRequest);
      const stages = [
        questConceptsFixture(proposal()),
        content,
        {
          ...approvedQuestQualityFixture(),
          decision: "reject",
          [check]: false,
          findings: [
            {
              code,
              severity: "blocking",
              evidence: action,
              reason:
                "The actual instructions contradict the supplied plan or do not define a playable activity.",
            },
          ],
        },
      ];
      const send = vi.fn(async () => envelope("openai", stages.shift()));
      // Declared metadata alone fits: this specifically exercises the prose review.
      expect(
        ineligibilityReasons(
          {
            ...content,
            ...originalQuestIdentity(draftRequest.draftId, 1),
            award: AWARDS.full_send,
            cooldownDays: 30,
          },
          outing,
          DEFAULT_PREFERENCES,
        ),
      ).toEqual([]);
      await expect(
        generateAiQuestDraft(keys, DEFAULT_PREFERENCES, draftRequest, send),
      ).rejects.toMatchObject({ code: "ai_quality_retry", status: 503 });
      expect(send).toHaveBeenCalledTimes(3);
      expect(content).toEqual(originalContent);
      expect(draftRequest).toEqual(originalRequest);
      const reviewBody = JSON.parse(
        (send.mock.calls[2] as unknown as [string, RequestInit])[1]
          .body as string,
      );
      const reviewContext = JSON.parse(reviewBody.input[0].content[0].text);
      expect(reviewContext.proposal.beats[0].action).toBe(action);
      expect(reviewContext.selectedConcept).not.toHaveProperty("scores");
      expect(reviewContext.proposal).not.toHaveProperty("id");
      expect(reviewContext.proposal).not.toHaveProperty("award");
    },
  );

  it("upstream failure returns no provider body, credential, or private context", async () => {
    await expect(
      generateAiQuestDraft(
        keys,
        DEFAULT_PREFERENCES,
        draftRequest,
        async () =>
          new Response(
            `Private failure ${keys.OPENAI_API_KEY} ${outing.area}`,
            { status: 401 },
          ),
      ),
    ).rejects.toMatchObject({
      code: "ai_unavailable",
      message:
        "AI quest drafting couldn’t produce a fitting proposal. Your draft is unchanged; try another brief.",
      status: 503,
    });
  });
});
