import { applePlaceIdSchema } from "./places";
import { z } from "zod";

export const CATEGORIES = [
  { id: "date_night", label: "Date Night" },
  { id: "daytime", label: "Daytime" },
  { id: "late_night", label: "Late Night" },
  { id: "street_challenges", label: "Street Challenges" },
  { id: "demon", label: "Demon" },
] as const;
export const INTENSITIES = [
  {
    id: "chill",
    label: "Chill",
    description: "Start easily. A little preparation, a good story.",
  },
  {
    id: "bold",
    label: "Bold",
    description: "Step into a performance, interaction, or competition.",
  },
  {
    id: "full_send",
    label: "Full Send",
    description: "Go all in on the challenge. Build up to a memorable reveal.",
  },
] as const;
export const categorySchema = z.enum([
  "date_night",
  "daytime",
  "late_night",
  "street_challenges",
  "demon",
]);
export const intensitySchema = z.enum(["chill", "bold", "full_send"]);
export const roleSchema = z.enum([
  "main_character",
  "mastermind",
  "camera_person",
  "rotate",
]);
export const settingSchema = z.enum(["home", "outside", "venue"]);
export const exclusionSchema = z.enum([
  "alcohol",
  "adult_venues",
  "public_performance",
  "physical_challenges",
  "food_challenges",
  "travel_outside_area",
  "strangers",
  "being_surprised",
]);
export type Category = z.infer<typeof categorySchema>;
export type Intensity = z.infer<typeof intensitySchema>;
export type Role = z.infer<typeof roleSchema>;
export type Setting = z.infer<typeof settingSchema>;
export type Exclusion = z.infer<typeof exclusionSchema>;

export const AWARDS: Record<Intensity, { xp: number; points: number }> = {
  chill: { xp: 100, points: 10 },
  bold: { xp: 250, points: 25 },
  full_send: { xp: 500, points: 50 },
};
export const REWARD_POLICY = {
  version: 1,
  dailyCap: 3,
  cooldownDays: 30,
} as const;
export const APP_CONFIG = {
  name: "Sidequest",
  currency: "USD",
  launchArea: "Local pilot",
  maxUploadBytes: 80 * 1024 * 1024,
  maxSourceSeconds: 120,
  minSelectedSeconds: 5,
  maxSelectedSeconds: 15,
  rawRetentionDays: 30,
  unresolvedReviewDays: 14,
  savedReelLimit: 50,
} as const;

const boundedText = (max: number) => z.string().trim().max(max);
const unique = <T>(values: T[]) => new Set(values).size === values.length;
export const PREFERENCE_KEYS = [
  "categories",
  "premises",
  "humor",
  "humorExamples",
  "usualIntensity",
  "role",
  "approach",
  "preparation",
  "interests",
  "skills",
  "otherSkill",
  "sharing",
  "exclusions",
  "otherExclusion",
] as const;
export const preferenceKeySchema = z.enum(PREFERENCE_KEYS);
export type PreferenceKey = z.infer<typeof preferenceKeySchema>;
export type PreferenceSource = "survey" | "summary_review";
export const interestSchema = z.enum([
  "sports",
  "music",
  "comedy",
  "cooking",
  "making",
  "games",
  "local_knowledge",
]);
const preferenceFields = {
  categories: z
    .array(categorySchema)
    .max(5)
    .refine(unique, "Choose each category once")
    .nullable(),
  premises: z
    .array(
      z.enum([
        "fan_club",
        "open_mic",
        "secret_expert",
        "mystery_date",
        "meal_challenge",
        "spontaneous",
        "not_sure",
      ]),
    )
    .max(7)
    .refine(unique)
    .nullable(),
  humor: z
    .array(
      z.enum([
        "friendly_awkward",
        "elaborate_setups",
        "skill_reveals",
        "competitive",
        "absurd",
        "surprises",
      ]),
    )
    .max(6)
    .refine(unique)
    .nullable(),
  humorExamples: boundedText(240),
  usualIntensity: z.enum(["chill", "bold", "full_send", "depends"]).nullable(),
  role: roleSchema.nullable(),
  approach: z
    .enum(["group_only", "invitation", "conversation", "depends"])
    .nullable(),
  preparation: z
    .enum(["start_now", "a_few_things", "proper_setup", "varies"])
    .nullable(),
  interests: z.array(interestSchema).max(7).refine(unique).nullable(),
  skills: z
    .array(
      z.enum([
        "sports",
        "music",
        "comedy",
        "cooking",
        "making",
        "games",
        "local_knowledge",
        "none",
      ]),
    )
    .max(8)
    .refine(unique)
    .nullable(),
  otherSkill: boundedText(120),
  sharing: z.enum(["public", "friends", "private", "decide_later"]).nullable(),
  exclusions: z.array(exclusionSchema).max(8).refine(unique).nullable(),
  otherExclusion: boundedText(240),
};
export const preferencesSchema = z
  .object({
    ...preferenceFields,
    version: z.literal(2),
    sources: z
      .partialRecord(preferenceKeySchema, z.enum(["survey", "summary_review"]))
      .default({}),
    legacyUnconfirmed: z
      .array(preferenceKeySchema)
      .max(PREFERENCE_KEYS.length)
      .refine(unique)
      .default([]),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Preferences = {
  version: 2,
  sources: {},
  legacyUnconfirmed: [],
  categories: null,
  premises: null,
  humor: null,
  humorExamples: "",
  usualIntensity: null,
  role: null,
  approach: null,
  preparation: null,
  interests: null,
  skills: null,
  otherSkill: "",
  sharing: null,
  exclusions: null,
  otherExclusion: "",
};

/** V1 stored preselected scalars without provenance. Preserve real selections and
 * boundaries, but never turn those ambiguous defaults into confirmed preferences. */
export function normalizePreferences(input: unknown): Preferences {
  const parsed = preferencesSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const legacy = raw.version !== 2;
  const defaults: Partial<Record<PreferenceKey, string>> = {
    usualIntensity: "depends",
    role: "rotate",
    approach: "depends",
    preparation: "varies",
    sharing: "decide_later",
  };
  const result: Preferences = {
    ...DEFAULT_PREFERENCES,
    sources: {},
    legacyUnconfirmed: [],
  };
  for (const key of PREFERENCE_KEYS) {
    const value = raw[key];
    if (legacy && defaults[key] === value && value !== undefined) {
      result.legacyUnconfirmed.push(key);
      continue;
    }
    const field = preferenceFields[key].safeParse(value);
    if (!field.success) continue;
    const answer =
      legacy && Array.isArray(field.data) && field.data.length === 0
        ? null
        : field.data;
    Object.assign(result, { [key]: answer });
    if (answer !== null && answer !== "") result.sources[key] = "survey";
  }
  if (!legacy) {
    const sources = preferencesSchema.shape.sources.safeParse(raw.sources);
    if (sources.success) result.sources = sources.data;
    const unconfirmed = preferencesSchema.shape.legacyUnconfirmed.safeParse(
      raw.legacyUnconfirmed,
    );
    if (unconfirmed.success) result.legacyUnconfirmed = unconfirmed.data;
  }
  return result;
}
export const profileSchema = z
  .object({
    displayName: boundedText(60),
    timezone: boundedText(80),
    locale: boundedText(35),
    summary: boundedText(3000),
    preferences: preferencesSchema,
    onboardingCompleted: z.boolean(),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;
export const profilePatchSchema = profileSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Choose a profile field to update.",
  );

export const outingSchema = z
  .object({
    category: categorySchema,
    intensity: intensitySchema,
    group: z.enum(["solo", "couple", "friends"]),
    participants: z.number().int().min(1).max(12),
    budgetMinor: z.number().int().min(0).max(1_000_000),
    budgetScope: z.enum(["total", "per_person"]),
    currency: z.literal("USD"),
    durationMinutes: z.number().int().min(15).max(720).nullable(),
    setting: settingSchema,
    area: boundedText(100),
    applePlaceId: applePlaceIdSchema.nullable().optional(),
    transport: z.enum(["none", "walk", "bike", "transit", "car"]),
    travelMinutes: z.number().int().min(0).max(240),
    travelCostMinor: z.number().int().min(0).max(100_000),
    venuePermission: z.boolean(),
    arrangementConfirmed: z.boolean(),
    adultEligible: z.boolean(),
    adultContext: z.boolean(),
    confirmedVenueCostMinor: z.number().int().min(0).max(1_000_000).nullable(),
  })
  .strict()
  .superRefine((outing, ctx) => {
    if (
      (outing.group === "solo" && outing.participants !== 1) ||
      (outing.group === "couple" && outing.participants !== 2) ||
      (outing.group === "friends" && outing.participants < 2)
    )
      ctx.addIssue({
        code: "custom",
        path: ["participants"],
        message: "Group size must match your selected group.",
      });
    if (
      outing.setting === "home" &&
      (outing.travelMinutes !== 0 || outing.travelCostMinor !== 0)
    )
      ctx.addIssue({
        code: "custom",
        path: ["travelMinutes"],
        message: "At-home outings do not include travel.",
      });
    if (
      outing.adultContext &&
      (!outing.adultEligible || outing.setting !== "venue")
    )
      ctx.addIssue({
        code: "custom",
        path: ["adultContext"],
        message:
          "Adult context needs explicit age eligibility and an approved venue.",
      });
  });
export type Outing = z.infer<typeof outingSchema>;
export const DEFAULT_OUTING: Outing = {
  category: "date_night",
  intensity: "chill",
  group: "couple",
  participants: 2,
  budgetMinor: 0,
  budgetScope: "total",
  currency: "USD",
  durationMinutes: 60,
  setting: "home",
  area: "",
  transport: "none",
  travelMinutes: 0,
  travelCostMinor: 0,
  venuePermission: false,
  arrangementConfirmed: false,
  adultEligible: false,
  adultContext: false,
  confirmedVenueCostMinor: null,
};

export const beatSchema = z
  .object({
    label: boundedText(40),
    action: boundedText(700),
    filming: boundedText(400),
    caption: boundedText(80),
  })
  .strict();
export const questVariantSchema = z
  .object({
    id: z.string().regex(/^[a-z_]+_v\d+$/),
    familyId: z.string().regex(/^[a-z_]+$/),
    variantKey: z
      .string()
      .regex(/^[a-z_]+$/)
      .max(40)
      .optional(),
    version: z.number().int().positive(),
    category: categorySchema,
    intensity: intensitySchema,
    title: boundedText(100),
    hook: boundedText(260),
    sponsorDisclosure: boundedText(120).optional(),
    durationMinutes: z.number().int().min(15).max(720),
    minParticipants: z.number().int().min(1),
    maxParticipants: z.number().int().max(12),
    allowedGroups: z
      .array(z.enum(["solo", "couple", "friends"]))
      .min(1)
      .max(3)
      .optional(),
    cost: z
      .object({
        minMinor: z.number().int().nonnegative(),
        maxMinor: z.number().int().nonnegative(),
        currency: z.literal("USD"),
        scope: z.enum(["total", "per_person"]),
        venueCostUnknown: z.boolean(),
        note: boundedText(400),
      })
      .strict(),
    settings: z.array(settingSchema).min(1).max(3),
    interests: z.array(z.string().max(40)).max(15),
    roles: z.array(roleSchema).min(1).max(4),
    preparation: z.enum(["start_now", "a_few_things", "proper_setup"]),
    conflicts: z.array(exclusionSchema).max(8),
    venuePermissionRequired: z.boolean(),
    arrangementRequired: z.boolean(),
    adultOnly: z.boolean(),
    supportsAdultContext: z.boolean(),
    requiresVolunteer: z.boolean(),
    beats: z.tuple([beatSchema, beatSchema, beatSchema]),
    materials: z.array(boundedText(200)).max(10),
    completionQuestions: z.array(boundedText(300)).min(1).max(6),
    fallback: boundedText(600),
    requirements: z.array(boundedText(400)).max(10),
    award: z
      .object({
        xp: z.number().int().nonnegative(),
        points: z.number().int().nonnegative(),
      })
      .strict(),
    cooldownDays: z.literal(30),
  })
  .strict()
  .superRefine((quest, ctx) => {
    if (quest.minParticipants > quest.maxParticipants)
      ctx.addIssue({
        code: "custom",
        path: ["minParticipants"],
        message: "Invalid participant bounds",
      });
    if (quest.cost.minMinor > quest.cost.maxMinor)
      ctx.addIssue({
        code: "custom",
        path: ["cost"],
        message: "Invalid cost bounds",
      });
    if (
      quest.award.xp !== AWARDS[quest.intensity].xp ||
      quest.award.points !== AWARDS[quest.intensity].points
    )
      ctx.addIssue({
        code: "custom",
        path: ["award"],
        message: "Awards must match the configured intensity policy",
      });
  });
export type QuestVariant = z.infer<typeof questVariantSchema>;
export const candidateSchema = questVariantSchema.safeExtend({
  sponsorCampaign: z
    .object({ id: z.uuid(), version: z.number().int().positive() })
    .strict()
    .optional(),
  effectiveBudgetMinor: z.number().int().nonnegative(),
  estimatedCostMinMinor: z.number().int().nonnegative(),
  estimatedCostMaxMinor: z.number().int().nonnegative(),
  whyFits: z.array(z.string().max(150)).min(1).max(5),
  ready: z.literal(true),
  selectedRole: roleSchema.nullable(),
  rewardEligibility: z
    .object({
      eligible: z.boolean(),
      reason: z.enum(["eligible", "family_cooldown"]),
    })
    .strict(),
});
// The output schema is intentionally composed from explicit fields rather than accepting arbitrary API data.
export type Candidate = QuestVariant & {
  sponsorCampaign?: { id: string; version: number };
  effectiveBudgetMinor: number;
  estimatedCostMinMinor: number;
  estimatedCostMaxMinor: number;
  whyFits: string[];
  ready: true;
  selectedRole: Role | null;
  rewardEligibility: {
    eligible: boolean;
    reason: "eligible" | "family_cooldown";
  };
};

export function levelFromXp(xp: number) {
  if (!Number.isSafeInteger(xp) || xp < 0)
    throw new RangeError("XP must be a nonnegative safe integer");
  return {
    level: 1 + Math.floor(xp / 1000),
    progress: xp % 1000,
    nextLevelXp: 1000,
  };
}
export function effectiveBudget(
  outing: Pick<Outing, "budgetMinor" | "budgetScope" | "participants">,
): number {
  const value =
    outing.budgetMinor *
    (outing.budgetScope === "per_person" ? outing.participants : 1);
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(outing.budgetMinor) ||
    !Number.isSafeInteger(outing.participants) ||
    outing.participants < 1
  )
    throw new RangeError("Budget and group size must be valid integers");
  return value;
}
