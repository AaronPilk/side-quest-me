import { z } from "zod";
import {
  normalizePreferences,
  outingSchema,
  PREFERENCE_KEYS,
  questVariantSchema,
  type QuestVariant,
  type Preferences,
} from "./domain";
import { placeContextSchema } from "./place-matching";

export const DEFAULT_QUEST_AI_MODEL = "gpt-6-astra";
export const aiQuestProviderSchema = z.enum(["openai", "xai", "anthropic"]);
export type AiQuestProvider = z.infer<typeof aiQuestProviderSchema>;
export const QUEST_AI_MODELS: Record<AiQuestProvider, string> = {
  openai: DEFAULT_QUEST_AI_MODEL,
  xai: "grok-4.7",
  anthropic: "claude-opus-5-5",
};
export const AI_PROVIDER_LABELS: Record<AiQuestProvider, string> = {
  openai: "OpenAI",
  xai: "xAI (Grok)",
  anthropic: "Anthropic (Claude)",
};
export const aiQuestRequestSchema = z
  .object({
    templateId: z.string().min(1).max(120),
    outing: outingSchema,
    placeContext: placeContextSchema.optional(),
    // Sending confirmed preferences to a model is a separate, explicit action.
    providerConsent: z.literal(true),
    // Old clients consented only to OpenAI. An omitted provider retains that
    // meaning rather than silently consenting to whichever provider is enabled.
    provider: aiQuestProviderSchema.optional(),
  })
  .strict();
export type AiQuestRequest = z.infer<typeof aiQuestRequestSchema>;

const proposalText = (max: number) => z.string().trim().min(1).max(max);
export const aiQuestProposalSchema = z
  .object({
    title: proposalText(100),
    hook: proposalText(260),
    filming: z
      .array(
        z
          .object({
            beatIndex: z.number().int().min(0).max(2),
            shot: proposalText(220),
            onScreenText: proposalText(80),
          })
          .strict(),
      )
      .length(3)
      .refine(
        (beats) => new Set(beats.map((beat) => beat.beatIndex)).size === 3,
        "Each existing quest beat needs one filming suggestion.",
      ),
    loopTip: proposalText(250),
  })
  .strict();
export type AiQuestProposal = z.infer<typeof aiQuestProposalSchema>;
export type AiQuestConfig = {
  configured: boolean;
  model: string | null;
  provider?: AiQuestProvider | null;
};
export type AiQuestResult = {
  templateId: string;
  proposal: AiQuestProposal;
  model: string;
  generatedAt: string;
  provider: AiQuestProvider;
};

export const aiQuestDraftRequestSchema = z
  .object({
    draftId: z.uuid(),
    idea: z.string().trim().min(3).max(600),
    outing: outingSchema,
    provider: aiQuestProviderSchema,
    providerConsent: z.literal(true),
  })
  .strict();
export type AiQuestDraftRequest = z.infer<typeof aiQuestDraftRequestSchema>;
// Identity and reward policy are always assigned by Sidequest, never the model.
export const aiQuestDraftProposalSchema = z
  .object(questVariantSchema.shape)
  .omit({
    id: true,
    familyId: true,
    version: true,
    variantKey: true,
    award: true,
    cooldownDays: true,
    sponsorDisclosure: true,
    privateGenerated: true,
  })
  .required({ allowedGroups: true })
  // Strict model output requires every field; null means no additional age
  // restriction and becomes omitted in the canonical quest after generation.
  .extend({
    minimumAge: z
      .union([z.literal(18), z.literal(21)])
      .nullable()
      .default(null),
  })
  .strict();
export type AiQuestDraftResult = {
  draftId: string;
  quest: QuestVariant;
  provider: AiQuestProvider;
  model: string;
  generatedAt: string;
};

/** Only separately confirmed survey/review answers leave the app. Imported text,
 * legacy defaults, identity, and free-form notes are never sent to the provider. */
export function confirmedAiPreferences(input: Preferences) {
  const preferences = normalizePreferences(input);
  const allowed = new Set([
    "categories",
    "premises",
    "humor",
    "usualIntensity",
    "role",
    "approach",
    "preparation",
    "interests",
    "skills",
    "exclusions",
  ]);
  return Object.fromEntries(
    PREFERENCE_KEYS.filter(
      (key) =>
        allowed.has(key) &&
        preferences.sources[key] &&
        !preferences.legacyUnconfirmed.includes(key) &&
        preferences[key] !== null &&
        preferences[key] !== "",
    ).map((key) => [key, preferences[key]]),
  );
}
