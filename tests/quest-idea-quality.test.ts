import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { catalog } from "../shared/catalog";
import { retiredFullSendActivityCatalog } from "../shared/activity-recipes";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  questVariantSchema,
  type QuestVariant,
} from "../shared/domain";
import {
  aiQuestDraftProposalSchema,
  type AiQuestDraftRequest,
} from "../shared/ai-quest";
import { originalQuestIdentity } from "../shared/community";
import { buildQuestRoutingBrief } from "../shared/quest-routing";
import { ineligibilityReasons } from "../shared/recommend";
import { generateAiQuestDraft } from "../worker/ai-quest-draft";
import {
  acceptsQuestQuality,
  chooseQuestConcept,
  hasCompleteQuestText,
  questConceptsSchema,
  questQualityReviewSchema,
} from "../worker/quest-idea-quality";
import {
  approvedQuestQualityFixture,
  questConceptsFixture,
} from "./ai-draft-fixtures";

const outing = {
  ...DEFAULT_OUTING,
  setting: "outside" as const,
  intensity: "full_send" as const,
  participants: 2,
  group: "couple" as const,
  budgetMinor: 10_000,
  durationMinutes: 180,
  travelMinutes: 15,
  travelCostMinor: 500,
};
// Frozen historical prose is a transport/validation fixture, not a current recommendation or live quality approval.
const fitting = [...catalog, ...retiredFullSendActivityCatalog].find(
  (quest) => !ineligibilityReasons(quest, outing, DEFAULT_PREFERENCES).length,
)!;
const {
  id: _id,
  familyId: _family,
  version: _version,
  variantKey: _variant,
  award: _award,
  cooldownDays: _cooldown,
  sponsorDisclosure: _sponsor,
  ...content
} = fitting;
const proposal = { ...content, allowedGroups: ["couple"] };
const input: AiQuestDraftRequest = {
  draftId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  idea: "Give us a playful creative challenge worth doing together",
  outing,
  provider: "openai",
  providerConsent: true,
};
const env = { OPENAI_API_KEY: "fixture-only-key" };
const envelope = (value: unknown) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  });
const bodyContext = (init?: RequestInit) =>
  JSON.parse(JSON.parse(init!.body as string).input[0].content[0].text);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("bounded concept comparison and independent quality review", () => {
  it("ranks concrete playability and audience fit above novelty alone", () => {
    const candidates = questConceptsSchema.parse(
      questConceptsFixture(fitting),
    ).candidates;
    candidates[0].scores = {
      playability: 3,
      goal: 3,
      originality: 5,
      audienceIntensity: 3,
      filmability: 5,
    };
    candidates[1].scores = {
      playability: 5,
      goal: 5,
      originality: 3,
      audienceIntensity: 5,
      filmability: 3,
    };
    expect(chooseQuestConcept(candidates).id).toBe("B");
  });

  it("uses strict portable schemas with no omitted review checks", () => {
    const visit = (schema: Record<string, unknown>) => {
      if (schema.type === "object") {
        const properties = schema.properties as Record<string, unknown>;
        expect(schema.additionalProperties).toBe(false);
        expect([...(schema.required as string[])].sort()).toEqual(
          Object.keys(properties).sort(),
        );
        Object.values(properties).forEach((property) =>
          visit(property as Record<string, unknown>),
        );
      }
      if (schema.items) visit(schema.items as Record<string, unknown>);
    };
    visit(z.toJSONSchema(questConceptsSchema));
    visit(z.toJSONSchema(questQualityReviewSchema));
    const repeated = questConceptsFixture(fitting);
    repeated.candidates[1].id = "A";
    expect(questConceptsSchema.safeParse(repeated).success).toBe(false);
    expect(
      questQualityReviewSchema.safeParse({ decision: "approve" }).success,
    ).toBe(false);
  });

  it("an approval cannot override a blocking contradiction or false metadata check", () => {
    const accepted = questQualityReviewSchema.parse(
      approvedQuestQualityFixture(),
    );
    expect(acceptsQuestQuality(accepted)).toBe(true);
    for (const field of [
      "playable",
      "coherent",
      "constraintsHonored",
      "factsHonest",
      "metadataHonest",
      "audienceExperienceFits",
    ] as const)
      expect(acceptsQuestQuality({ ...accepted, [field]: false })).toBe(false);
    expect(
      acceptsQuestQuality({
        ...accepted,
        findings: [
          {
            code: "misleading_metadata",
            severity: "blocking",
            evidence: "Buy four admission tickets",
            reason: "The proposal claims a free two-person activity.",
          },
        ],
      }),
    ).toBe(false);
  });

  it("allows harmless optional improvements while refusing a weak or vague mission", () => {
    const reviewed = questQualityReviewSchema.parse({
      ...approvedQuestQualityFixture(),
      scores: {
        playability: 4,
        goal: 4,
        originality: 4,
        audienceIntensity: 4,
        filmability: 4,
      },
      findings: [
        {
          code: "weak_twist",
          severity: "note",
          evidence: "Use the same route for your last attempt",
          reason: "A different route could add optional variety.",
        },
      ],
    });
    expect(acceptsQuestQuality(reviewed)).toBe(true);
    expect(
      acceptsQuestQuality({
        ...reviewed,
        scores: { ...reviewed.scores, playability: 3 },
      }),
    ).toBe(false);
    expect(
      acceptsQuestQuality({
        ...reviewed,
        scores: { ...reviewed.scores, originality: 2 },
      }),
    ).toBe(false);
  });

  it("rejects empty and repeated stage content before asking a model to review it", () => {
    expect(hasCompleteQuestText(fitting)).toBe(true);
    for (const patch of [
      { hook: " " },
      { completionQuestions: [""] },
      {
        beats: fitting.beats.map((beat) => ({ ...beat, action: "Do a thing" })),
      },
    ])
      expect(
        hasCompleteQuestText({ ...fitting, ...patch } as QuestVariant),
      ).toBe(false);
  });

  it("requires the critic to assess the experience even when every numeric score is high", () => {
    const inflated = questQualityReviewSchema.parse({
      ...approvedQuestQualityFixture(),
      audienceExperienceFits: false,
      intensityEvidence:
        "Finding six shades of gray is ordinary observation, regardless of added rounds.",
    });
    expect(acceptsQuestQuality(inflated)).toBe(false);
    const { audienceExperienceFits: _fit, ...oldReview } = inflated;
    expect(questQualityReviewSchema.safeParse(oldReview).success).toBe(false);
    expect(
      questQualityReviewSchema.safeParse({
        ...inflated,
        intensityEvidence: " ",
      }).success,
    ).toBe(false);
    const concepts = questConceptsFixture(fitting);
    concepts.candidates[0].intensityMechanic = " ";
    expect(questConceptsSchema.safeParse(concepts).success).toBe(false);
  });
});

describe("three-call quest drafting budget and semantic gate", () => {
  it("does not spend a model call on a plan whose confirmed journey already exhausts time or budget", async () => {
    const send = vi.fn();
    for (const outingPatch of [
      { durationMinutes: 30, travelMinutes: 20 },
      { budgetMinor: 100, travelCostMinor: 500 },
      {
        setting: "venue" as const,
        budgetMinor: 500,
        confirmedVenueCostMinor: 100,
        travelCostMinor: 500,
      },
    ])
      await expect(
        generateAiQuestDraft(
          env,
          DEFAULT_PREFERENCES,
          { ...input, outing: { ...outing, ...outingPatch } },
          send,
        ),
      ).rejects.toMatchObject({ code: "ai_plan_unavailable", status: 409 });
    expect(send).not.toHaveBeenCalled();
  });

  it("selects an eligible lower-ranked idea and does not give the critic earlier grades", async () => {
    const concepts = questConceptsFixture(fitting);
    concepts.candidates[0].estimatedCostMinor = 100_000;
    concepts.candidates[2].durationMinutes = 180;
    const stages = [concepts, proposal, approvedQuestQualityFixture()];
    const send = vi.fn(async () => envelope(stages.shift()));
    await generateAiQuestDraft(env, DEFAULT_PREFERENCES, input, send);
    expect(send).toHaveBeenCalledTimes(3);
    const bodies = send.mock.calls.map((call) =>
      JSON.parse((call as unknown as [string, RequestInit])[1].body as string),
    );
    expect(bodies.map((body) => body.text.format.name)).toEqual([
      "quest_concept_comparison",
      "original_quest_proposal",
      "quest_quality_review",
    ]);
    expect(bodies.map((body) => body.reasoning.effort)).toEqual([
      "low",
      "low",
      "low",
    ]);
    const expanded = bodyContext(
      (send.mock.calls[1] as unknown as [string, RequestInit])[1],
    );
    const reviewed = bodyContext(
      (send.mock.calls[2] as unknown as [string, RequestInit])[1],
    );
    expect(expanded.selectedConcept.id).toBe("B");
    expect(reviewed.selectedConcept).not.toHaveProperty("scores");
    expect(reviewed.proposal).toEqual(proposal);
    expect(reviewed).not.toHaveProperty("candidates");
    for (const body of bodies) {
      const context = JSON.parse(body.input[0].content[0].text);
      expect(context.experience_routing).toEqual(
        buildQuestRoutingBrief(DEFAULT_PREFERENCES, outing),
      );
      expect(context.experience_routing).not.toHaveProperty("area");
      expect(context.experience_routing).not.toHaveProperty("summary");
    }
  });

  it("does not expand a weak Full Send just to return something", async () => {
    const concepts = questConceptsFixture(fitting);
    for (const concept of concepts.candidates) {
      concept.scores.audienceIntensity = 2;
      concept.intensityMechanic =
        "This is a mild observation exercise with more rounds, not a substantial experience.";
    }
    const send = vi.fn(async () => envelope(concepts));
    await expect(
      generateAiQuestDraft(env, DEFAULT_PREFERENCES, input, send),
    ).rejects.toMatchObject({ code: "ai_quality_retry", status: 503 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects an inflated audience fit after expansion without retrying or accepting", async () => {
    const stages = [
      questConceptsFixture(fitting),
      proposal,
      {
        ...approvedQuestQualityFixture(),
        audienceExperienceFits: false,
        intensityEvidence:
          "A longer sound hunt still lacks the substantial experience the group requested.",
      },
    ];
    const send = vi.fn(async () => envelope(stages.shift()));
    await expect(
      generateAiQuestDraft(env, DEFAULT_PREFERENCES, input, send),
    ).rejects.toMatchObject({ code: "ai_quality_retry", status: 503 });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("stops after concept comparison when no concrete idea fits the remaining time and budget", async () => {
    const concepts = questConceptsFixture(fitting);
    concepts.candidates.forEach((candidate) => {
      candidate.estimatedCostMinor = 100_000;
      candidate.durationMinutes = 180;
    });
    const send = vi.fn(async () => envelope(concepts));
    await expect(
      generateAiQuestDraft(env, DEFAULT_PREFERENCES, input, send),
    ).rejects.toMatchObject({ code: "ai_quality_retry" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stops after a literal blank expansion without paying for a critic call", async () => {
    const stages = [questConceptsFixture(fitting), { ...proposal, hook: " " }];
    const send = vi.fn(async () => envelope(stages.shift()));
    await expect(
      generateAiQuestDraft(env, DEFAULT_PREFERENCES, input, send),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rejects a schema-valid but semantically contradictory quest with no repair or autoaccept", async () => {
    const stages = [
      questConceptsFixture(fitting),
      proposal,
      {
        ...approvedQuestQualityFixture(),
        decision: "reject",
        coherent: false,
        findings: [
          {
            code: "incoherent_story",
            severity: "blocking",
            evidence: "Private raw model evidence must never become an error",
            reason: "The hook and objective promise different activities.",
          },
        ],
      },
    ];
    const send = vi.fn(async () => envelope(stages.shift()));
    await expect(
      generateAiQuestDraft(env, DEFAULT_PREFERENCES, input, send),
    ).rejects.toMatchObject({
      code: "ai_quality_retry",
      message:
        "AI couldn’t make this idea clear and playable enough within your plan. Try a different theme or a more specific mission. Your draft is unchanged.",
    });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("rejects victory-required completion when the fallback allows an honest failed attempt", async () => {
    const victoryQuestion =
      "Did your bridge hold all five pebbles for ten hands-off seconds?";
    const mismatched = aiQuestDraftProposalSchema.parse({
      ...proposal,
      title: "The Five-Pebble Bridge Attempt",
      hook: "Build a tiny bridge and test whether it can hold five pebbles.",
      beats: [
        {
          label: "Build",
          action:
            "Use loose sticks to build a small bridge across a clear gap.",
          filming: "Show the empty gap and your first bridge design.",
          caption: "Five pebbles to carry.",
        },
        {
          label: "Test",
          action:
            "Load five pebbles onto the unsupported span and time a ten-second hands-off test.",
          filming: "Keep the load and both hands visible during the test.",
          caption: "Let go and count.",
        },
        {
          label: "Finish",
          action:
            "Rebuild for up to three attempts, record the actual final result, and restore the patch.",
          filming: "Show the successful span or honest collapse, then cleanup.",
          caption: "Here is what actually happened.",
        },
      ],
      completionQuestions: [victoryQuestion],
      fallback:
        "After three failed load tests, complete the quest with an honest collapse reveal and cleanup; success is optional.",
    });
    const quest = questVariantSchema.parse({
      ...mismatched,
      ...originalQuestIdentity(input.draftId, 1),
      award: fitting.award,
      cooldownDays: 30,
    });
    expect(ineligibilityReasons(quest, outing, DEFAULT_PREFERENCES)).toEqual(
      [],
    );
    expect(hasCompleteQuestText(quest)).toBe(true);
    const original = structuredClone(mismatched);
    const stages = [
      questConceptsFixture(quest),
      mismatched,
      {
        ...approvedQuestQualityFixture(),
        decision: "reject",
        coherent: false,
        findings: [
          {
            code: "incoherent_story",
            severity: "blocking",
            evidence: victoryQuestion,
            reason:
              "The fallback permits completion after failed attempts, but the mandatory completion question requires victory.",
          },
        ],
      },
    ];
    const send = vi.fn(async () => envelope(stages.shift()));
    await expect(
      generateAiQuestDraft(env, DEFAULT_PREFERENCES, input, send),
    ).rejects.toMatchObject({ code: "ai_quality_retry", status: 503 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(mismatched).toEqual(original);
    const reviewed = bodyContext(
      (send.mock.calls[2] as unknown as [string, RequestInit])[1],
    );
    expect(reviewed.proposal.completionQuestions).toEqual([victoryQuestion]);
    expect(reviewed.proposal.fallback).toBe(mismatched.fallback);
  });

  it("gives the final reviewer only the remaining cumulative deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let call = 0;
    const send = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        call += 1;
        if (call === 1) {
          vi.setSystemTime(35_000);
          return envelope(questConceptsFixture(fitting));
        }
        if (call === 2) {
          vi.setSystemTime(85_000);
          return envelope(proposal);
        }
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () =>
            reject(new Error("Review deadline reached")),
          );
        });
      },
    );
    const pending = expect(
      generateAiQuestDraft(env, DEFAULT_PREFERENCES, input, send),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(3);
    const signal = send.mock.calls[2][1]!.signal!;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(signal.aborted).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });
});
