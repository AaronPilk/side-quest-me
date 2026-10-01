import { confirmedAiPreferences } from "./ai-quest";
import {
  effectiveBudget,
  normalizePreferences,
  type Exclusion,
  type Outing,
  type Preferences,
} from "./domain";

type ConfirmedRoutingPreferences = Partial<
  Pick<
    Preferences,
    | "categories"
    | "premises"
    | "humor"
    | "usualIntensity"
    | "role"
    | "approach"
    | "preparation"
    | "interests"
    | "skills"
    | "exclusions"
  >
>;

export type QuestExperienceDomain =
  | "competition"
  | "spontaneous_adventure"
  | "skill_reveal"
  | "elaborate_setup"
  | "absurd_comedy"
  | "local_exploration"
  | "shared_discovery"
  | "music"
  | "food"
  | "food_challenge"
  | "public_performance"
  | "surprise"
  | "surprise_target"
  | "physical_challenge"
  | "legitimate_adrenaline"
  | "adult_nightlife";

const intensityDirection: Record<Outing["intensity"], string> = {
  chill:
    "Make an easy-entry experience with a specific enjoyable objective and a visible payoff; keep the commitment light.",
  bold: "Create a lively experience with a real creative, social or competitive stretch and a clear payoff.",
  full_send:
    "Deliver the strongest experiential route: an ambitious adventure, standout competition, elaborate reveal or legitimate adrenaline experience. A routine open mic, extra rounds, crafts or observation exercise alone does not meet Full Send.",
};

const exclusionDomains: Partial<Record<Exclusion, QuestExperienceDomain[]>> = {
  adult_venues: ["adult_nightlife"],
  public_performance: ["public_performance"],
  physical_challenges: ["physical_challenge", "legitimate_adrenaline"],
  food_challenges: ["food_challenge"],
  being_surprised: ["surprise_target"],
};

/** Shared model context, not eligibility or a grant of venue/activity permission.
 * Only confirmed positive answers steer the experience. Retained boundaries
 * remain restrictions, even when their provenance is older or incomplete.
 * No imported prose, private notes, area, place ID or coordinates are included.
 */
export function buildQuestRoutingBrief(
  preferencesInput: Preferences,
  outing: Outing,
) {
  const preferences = normalizePreferences(preferencesInput);
  const confirmed = confirmedAiPreferences(
    preferences,
  ) as ConfirmedRoutingPreferences;
  const exclusions = [...(preferences.exclusions ?? [])];
  const excluded = new Set(exclusions);
  const confirmedNonTargetSurpriseRole =
    confirmed.role === "mastermind" || confirmed.role === "camera_person"
      ? confirmed.role
      : null;
  const tags = new Set([
    ...(confirmed.interests ?? []),
    ...(confirmed.skills ?? []).filter((skill) => skill !== "none"),
    ...(confirmed.humor ?? []),
    ...(confirmed.premises ?? []).filter((premise) => premise !== "not_sure"),
  ]);
  const totalBudgetMinor = effectiveBudget(outing);
  const venueCostMinor =
    outing.setting === "venue" ? (outing.confirmedVenueCostMinor ?? 0) : 0;
  const budgetAfterReservations =
    totalBudgetMinor - outing.travelCostMinor - venueCostMinor;
  const minutesAfterTravel =
    outing.durationMinutes === null
      ? null
      : outing.durationMinutes - outing.travelMinutes;
  const adultBlockers: string[] = [];
  if (outing.adultContext) {
    if (!outing.adultEligible)
      adultBlockers.push("adult_eligibility_not_self_confirmed");
    if (outing.setting !== "venue") adultBlockers.push("venue_required");
    if (!outing.venuePermission)
      adultBlockers.push("venue_permission_not_confirmed");
    if (excluded.has("adult_venues"))
      adultBlockers.push("adult_venues_excluded");
  }
  const adultNightlife = outing.adultContext && adultBlockers.length === 0;
  const excludedDomains = [
    ...new Set(exclusions.flatMap((value) => exclusionDomains[value] ?? [])),
  ];
  const excludedDomainSet = new Set(excludedDomains);
  const preferred = new Set<QuestExperienceDomain>();
  if (tags.has("competitive") || tags.has("games") || tags.has("sports"))
    preferred.add("competition");
  if (tags.has("spontaneous")) preferred.add("spontaneous_adventure");
  if (tags.has("skill_reveals") || tags.has("secret_expert"))
    preferred.add("skill_reveal");
  if (tags.has("elaborate_setups") || tags.has("fan_club"))
    preferred.add("elaborate_setup");
  if (tags.has("absurd") || tags.has("comedy")) preferred.add("absurd_comedy");
  if (tags.has("local_knowledge")) preferred.add("local_exploration");
  if (tags.has("mystery_date") || outing.group === "couple")
    preferred.add("shared_discovery");
  if (tags.has("music")) preferred.add("music");
  if (tags.has("cooking")) preferred.add("food");
  if (tags.has("meal_challenge")) preferred.add("food_challenge");
  if (tags.has("open_mic")) preferred.add("public_performance");
  if (
    tags.has("surprises") &&
    (!excluded.has("being_surprised") || confirmedNonTargetSurpriseRole)
  )
    preferred.add("surprise");
  if (tags.has("sports")) preferred.add("physical_challenge");
  if (adultNightlife) preferred.add("adult_nightlife");
  const preferredDomains = [...preferred].filter(
    (domain) => !excludedDomainSet.has(domain),
  );
  // Intensity is an appetite for commitment, not consent to a particular risk.
  const domainsRequiringActivityOptIn: QuestExperienceDomain[] =
    outing.intensity === "full_send" &&
    outing.setting !== "home" &&
    !excluded.has("physical_challenges")
      ? ["legitimate_adrenaline"]
      : [];
  const blockers = [...adultBlockers];
  if (preferences.otherExclusion.trim())
    blockers.push("custom_boundary_needs_review");
  if (budgetAfterReservations < 0)
    blockers.push("reserved_costs_exceed_budget");
  if (minutesAfterTravel !== null && minutesAfterTravel <= 0)
    blockers.push("no_activity_time_after_travel");
  if (excluded.has("travel_outside_area") && outing.travelMinutes > 0)
    blockers.push("travel_conflicts_with_area_boundary");

  return {
    version: 1 as const,
    currentOuting: {
      category: outing.category,
      intensity: outing.intensity,
      group: outing.group,
      participants: outing.participants,
      setting: outing.setting,
      budgetMinor: outing.budgetMinor,
      budgetScope: outing.budgetScope,
      durationMinutes: outing.durationMinutes,
      transport: outing.transport,
      arrangementConfirmed: outing.arrangementConfirmed,
      venuePermission: outing.venuePermission,
    },
    confirmedPreferences: confirmed,
    audience: {
      group: outing.group,
      participants: outing.participants,
      context: adultNightlife
        ? ("adult_nightlife" as const)
        : ("general" as const),
      energy:
        outing.intensity === "chill"
          ? ("easygoing" as const)
          : outing.intensity === "full_send"
            ? outing.group === "friends"
              ? ("rowdy" as const)
              : ("adventurous" as const)
            : ("lively" as const),
    },
    experience: {
      intensity: outing.intensity,
      preferredDomains,
      domainsRequiringActivityOptIn,
      excludedDomains,
      direction: intensityDirection[outing.intensity],
      preserveIntensityUnderConstraints: true as const,
      noFeasibleMatch: "return_no_fit_instead_of_a_weak_placeholder" as const,
    },
    adultContext: {
      requested: outing.adultContext,
      venueMinimumSelfConfirmed: outing.adultEligible,
      ageVerified: false as const,
      legalDrinkingAgeVerified: false as const,
      nightlifeRouteAllowed: adultNightlife,
      blockers: adultBlockers,
      direction:
        "Adult flags are self-confirmation of the venue minimum, not verified age or verified 21+ status. Group, category and intensity never establish adulthood. Adult nightlife does not require alcohol.",
    },
    boundaries: {
      exclusions,
      customBoundaryNeedsReview: Boolean(preferences.otherExclusion.trim()),
      participation:
        excluded.has("strangers") || confirmed.approach === "group_only"
          ? ("within_group" as const)
          : confirmed.approach === "invitation" ||
              confirmed.approach === "conversation"
            ? confirmed.approach
            : ("no_assumed_stranger_participation" as const),
      alcohol: excluded.has("alcohol")
        ? ("excluded" as const)
        : ("not_requested_or_required" as const),
      surpriseTargetExcluded: excluded.has("being_surprised"),
      confirmedNonTargetSurpriseRole,
      requiredIntoxication: false as const,
      drinkingBeforePhysicalActivities: false as const,
      direction:
        "Firm exclusions override interests and preferred domains. Food challenges excludes challenge mechanics, not ordinary cooking or dining. Being surprised excludes making this user the target; a confirmed mastermind or camera-person role can organize or film a willing group's surprise while remaining outside the reveal. Without that confirmed role, do not assume surprise participation. Unknown answers grant no permissions. Do not require intoxication, drinking quotas, or drinking before driving or physical activities.",
    },
    resources: {
      currency: outing.currency,
      totalBudgetMinor,
      travelCostMinor: outing.travelCostMinor,
      confirmedVenueCostMinor:
        outing.setting === "venue" ? outing.confirmedVenueCostMinor : 0,
      venueCostStatus:
        outing.setting !== "venue"
          ? ("not_applicable" as const)
          : outing.confirmedVenueCostMinor === null
            ? ("unconfirmed" as const)
            : ("confirmed" as const),
      remainingActivityBudgetMinor: Math.max(0, budgetAfterReservations),
      remainingBudgetExcludesUnknownVenueCharges:
        outing.setting === "venue" && outing.confirmedVenueCostMinor === null,
      budgetOverrunMinor: Math.max(0, -budgetAfterReservations),
      totalAvailableMinutes: outing.durationMinutes,
      travelMinutes: outing.travelMinutes,
      remainingActivityMinutes:
        minutesAfterTravel === null ? null : Math.max(0, minutesAfterTravel),
      blockers,
    },
    direction: [
      "The current outing overrides usual profile category, intensity and group. Use confirmed preferences as creative leads, never as permission to ignore boundaries or add participants.",
      outing.group === "couple"
        ? "Design for exactly two active participants. A couple or date can be adventurous; the selected intensity determines ambition."
        : outing.group === "friends"
          ? "Give the actual friend group active roles and a shared payoff. Full Send can be rowdy, competitive and memorable without forced drinking or uninvited participants."
          : "Make the solo experience complete without inventing a supporting cast.",
      "Skills are resources, not an instruction to default to crafts or practice drills. A preferred open mic is a lead, not sufficient Full Send mechanics by itself.",
      "Conditional adrenaline ideas require explicit activity agreement, a legitimate operator or permitted activity, and suitable costs, time and arrangements. Do not invent availability, bookings or consent.",
      "Budget and time are hard limits, not reasons to lower the selected intensity. Preparation counts as activity time. Unconfirmed venue charges are unknown, not free; confirm required charges before declaring a fit.",
      "If a blocker remains or no strong feasible experience exists, report no fit and the needed adjustment. Do not fill the result with a weak substitute.",
    ],
  };
}

export type QuestRoutingBrief = ReturnType<typeof buildQuestRoutingBrief>;
