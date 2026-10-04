import { z } from "zod";
import { aiQuestProviderSchema, type AiQuestProvider } from "./ai-quest";
import {
  outingSchema,
  type Candidate,
  type Outing,
  type Preferences,
  type QuestVariant,
} from "./domain";
import { applePlaceIdSchema } from "./places";
import { ineligibilityIssues, type EligibilityIssueCode } from "./recommend";

/** Public Apple listings supplied with named provider consent. Coordinates are
 * transient discovery context, never copied into a private proposal or run. */
export const discoveryPlaceSchema = z
  .object({
    id: applePlaceIdSchema,
    name: z.string().trim().min(1).max(160),
    address: z.string().trim().max(300),
    category: z.string().trim().max(100).nullable(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    url: z
      .url()
      .max(1000)
      .refine((url) => new URL(url).protocol === "https:")
      .optional(),
  })
  .strict();
export type DiscoveryPlace = z.infer<typeof discoveryPlaceSchema>;
export const experienceDiscoveryRequestSchema = z
  .object({
    outing: outingSchema,
    provider: aiQuestProviderSchema,
    consent: z.literal(true),
    nearbyPlaces: z.array(discoveryPlaceSchema).max(12).default([]),
    // Optional so requests from older iPhone builds retain their replay hash.
    // The server resolves these owner-bound proposals; clients supply no prose.
    previousProposalIds: z.array(z.uuid()).max(5).optional(),
  })
  .strict()
  .refine(
    ({ nearbyPlaces }) =>
      new Set(nearbyPlaces.map(({ id }) => id)).size === nearbyPlaces.length,
    "Place identifiers must be unique.",
  )
  .refine(
    ({ previousProposalIds }) =>
      !previousProposalIds ||
      new Set(previousProposalIds).size === previousProposalIds.length,
    "Previous proposal identifiers must be unique.",
  );
export type ExperienceDiscoveryRequest = z.infer<
  typeof experienceDiscoveryRequestSchema
>;
export type DiscoveryRequirement = {
  code: EligibilityIssueCode;
  label: string;
};
export type DiscoveryProposal = {
  proposalId: string;
  templateId: string;
  location: DiscoveryPlace | null;
  locationAttribution: "Apple Maps" | null;
  requirements: DiscoveryRequirement[];
  ready: boolean;
  expiresAt: string;
};
export type ExperienceDiscoveryResult = {
  candidates: Candidate[];
  proposals: DiscoveryProposal[];
  provider: AiQuestProvider;
  model: string;
  source: "ai" | "curated_fallback";
  generatedAt: string;
};

/** Discovery can suggest a conditional plan. Acceptance still runs every
 * canonical check after the user has confirmed the specific requirements. */
export function discoveryEligibility(
  quest: QuestVariant,
  outing: Outing,
  preferences: Preferences,
) {
  const pending = new Set<EligibilityIssueCode>([
    "venue_cost",
    "venue_permission",
    "arrangements",
    "adults",
  ]);
  // The separate `age` issue is always blocking: missing account age cannot
  // become a conditional booking requirement or be supplied by an outing flag.
  const issues = ineligibilityIssues(quest, outing, preferences);
  const pendingAdultPermission =
    outing.adultContext &&
    quest.supportsAdultContext &&
    outing.setting === "venue" &&
    !outing.venuePermission;
  const requirements = issues
    .filter(({ code }) => pending.has(code))
    .map(({ code, reason }) => ({ code, label: reason }));
  if (
    pendingAdultPermission &&
    !requirements.some(({ code }) => code === "venue_permission")
  )
    requirements.push({
      code: "venue_permission",
      label: "Confirm this venue permits your chosen adult nightlife activity.",
    });
  return {
    blocking: issues.filter(
      ({ code }) =>
        !pending.has(code) &&
        !(
          code === "adult_context" &&
          quest.supportsAdultContext &&
          outing.setting === "venue" &&
          !outing.venuePermission
        ),
    ),
    requirements,
  };
}

export function privatePlanMatches(original: Outing, next: Outing) {
  return (
    (
      ["category", "intensity", "group", "participants", "setting"] as const
    ).every((key) => original[key] === next[key]) &&
    (original.applePlaceId ?? null) === (next.applePlaceId ?? null)
  );
}
