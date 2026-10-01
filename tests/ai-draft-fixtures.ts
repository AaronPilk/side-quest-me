import type { QuestVariant } from "../shared/domain";

/** Synthetic model envelopes for transport/authorization tests. They do not
 * establish that a live model will score or review a proposal accurately. */
export function questConceptsFixture(
  content: Pick<
    QuestVariant,
    | "title"
    | "hook"
    | "beats"
    | "completionQuestions"
    | "durationMinutes"
    | "cost"
  >,
  participants = 2,
) {
  return {
    candidates: [
      {
        id: "A",
        title: content.title.slice(0, 60),
        mission:
          "Set up the challenge, alternate contrasting attempts, and reveal the results. Each attempt must follow the same rule.",
        goal: content.completionQuestions[0].slice(0, 90),
        durationMinutes: content.durationMinutes,
        estimatedCostMinor:
          content.cost.maxMinor *
          (content.cost.scope === "per_person" ? participants : 1),
        scores: {
          playability: 5,
          goal: 5,
          originality: 5,
          audienceIntensity: 5,
          filmability: 5,
        },
      },
      {
        id: "B",
        title: "The One-Line Portrait Exchange",
        mission:
          "Draw each other for five minutes without lifting the pencil. Reveal both portraits and each identify one recognizable detail.",
        goal: "Complete two portraits and identify one actual detail in each.",
        durationMinutes: 20,
        estimatedCostMinor: 0,
        scores: {
          playability: 4,
          goal: 4,
          originality: 4,
          audienceIntensity: 4,
          filmability: 4,
        },
      },
      {
        id: "C",
        title: "A Museum for One Ordinary Object",
        mission:
          "Choose an owned object. Write a factual museum label and an absurd fictional label, then reveal both beside the same object.",
        goal: "Complete the two labels and show how differently they explain the same object.",
        durationMinutes: 15,
        estimatedCostMinor: 0,
        scores: {
          playability: 4,
          goal: 4,
          originality: 3,
          audienceIntensity: 4,
          filmability: 4,
        },
      },
    ],
  };
}

export function approvedQuestQualityFixture() {
  return {
    decision: "approve",
    playable: true,
    coherent: true,
    constraintsHonored: true,
    factsHonest: true,
    metadataHonest: true,
    scores: {
      playability: 5,
      goal: 5,
      originality: 5,
      audienceIntensity: 5,
      filmability: 5,
    },
    findings: [],
  };
}
