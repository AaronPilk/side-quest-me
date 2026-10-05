import { confirmedAiPreferences } from "./ai-quest";
import { confirmedAgeBand } from "./age-eligibility";
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
    "Match the user's appetite to go all in: make the actual experience ambitious, spontaneous, audacious or exhilarating within this outing's resources and boundaries. Be specific about what they will do and why they would be excited to say yes. Any activity genre can work; assess the proposed experience rather than an approved list. A competition, booking, surprise, performance or adrenaline activity is an option, never a required formula. Full Send does not require a winner, a wager, an audience or alcohol.",
};

const categoryDirection: Record<Outing["category"], string> = {
  date_night:
    "Build chemistry, shared intrigue or adventure for the actual participants; a date is not automatically quiet or sentimental. Let their selected intensity guide the experience. Never invent shared memories.",
  daytime:
    "Make the day worth leaving home for: a real activity, a surprising destination or a competition with a result people care about.",
  late_night:
    "Make a night the group wants to go out for. Music, shows, late food, spontaneous destinations, nightlife when eligible and unexpected local experiences are starting points, not a menu that limits the idea. The outing itself can be the payoff without an extra game or mission.",
  street_challenges:
    "Give the group a concrete public-world mission and a finish line. Public space does not make bystanders participants; strangers join only through an allowed, genuinely optional invitation.",
  demon:
    "Down for Anything means an open invitation to surprise the group with something they genuinely want to do. Explore across nightlife, travel, competition, food, entertainment, outdoors, attraction, oddball experiences and ideas beyond those examples. For eligible adults, irreverent or flirtatious fun and adult venues are valid directions when the outing permits them; do not default to a family-friendly tone. Match the selected intensity rather than forcing rivalry, dares, a winner, an elaborate twist or a reveal onto every outing. Respect willing participation, the user's exclusions and the actual setting, time and budget.",
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
  const ageBand = confirmedAgeBand(preferences);
  const ageEligible = ageBand === "18_20" || ageBand === "21_plus";
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
    if (!ageEligible)
      adultBlockers.push(
        ageBand === "under_18" ? "under_adult_age" : "age_not_confirmed",
      );
    if (!outing.adultEligible)
      adultBlockers.push("adult_eligibility_not_self_confirmed");
    if (outing.setting !== "venue") adultBlockers.push("venue_required");
    if (!outing.venuePermission)
      adultBlockers.push("venue_permission_not_confirmed");
    if (excluded.has("adult_venues"))
      adultBlockers.push("adult_venues_excluded");
  }
  const adultNightlife = outing.adultContext && adultBlockers.length === 0;
  const nightlifeSuggestionAllowed =
    outing.adultContext &&
    adultBlockers.every(
      (blocker) => blocker === "venue_permission_not_confirmed",
    );
  const alcoholSuggestionAllowed =
    nightlifeSuggestionAllowed &&
    ageBand === "21_plus" &&
    !excluded.has("alcohol");
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
  // This outing's adult-nightlife choice outranks older interests, including
  // when a venue is still being selected and permission is not yet confirmed.
  const preferredDomains = [
    ...(nightlifeSuggestionAllowed
      ? (["adult_nightlife"] as QuestExperienceDomain[])
      : []),
    ...preferred,
  ].filter((domain) => !excludedDomainSet.has(domain));
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
      categoryDirection: categoryDirection[outing.category],
      challengeDesign: {
        requireConcreteActivity: true as const,
        objective:
          "Name the actual experience, a useful first step and how to enjoy or complete it. Add rules only when the activity benefits from them; an outing does not need to become a challenge or competition.",
        stakes:
          "Stakes and prizes are optional. The experience itself can be enough. If a group wants a rivalry, an agreed winner privilege or capped shared treat can fit; count required purchases in the budget and never invent app-funded prizes or an uncapped obligation for the loser.",
        novelty:
          "Offer a meaningfully different experience from recent suggestions, not just a renamed repeat. Novelty can come from the activity, place, people, timing or approach; do not bolt on a gimmick to satisfy a formula.",
        filmHook:
          "Offer a short optional filming idea drawn from the actual outing. Capture what makes it worth sharing without inventing a result, staging every moment or making a video the reason to reject a worthwhile experience.",
      },
      preserveIntensityUnderConstraints: true as const,
      noFeasibleMatch:
        "return_no_fit_for_constraints_or_unmet_experience_quality" as const,
    },
    adultContext: {
      requested: outing.adultContext,
      participantAgeBand: ageBand,
      ageEligible,
      venueMinimumSelfConfirmed: outing.adultEligible,
      ageVerified: false as const,
      legalDrinkingAgeVerified: false as const,
      nightlifeRouteAllowed: adultNightlife,
      nightlifeSuggestionAllowed,
      alcoholSuggestionAllowed,
      blockers: adultBlockers,
      direction:
        "Age band is this account owner's private self-report, not ID verification or the ages of friends. Unknown or under-18 age cannot unlock adult-only suggestions. Outing flags separately confirm every participant meets the chosen venue's age rules and opts in. 18–20 allows age-appropriate adult venues but not alcohol suggestions. When alcoholSuggestionAllowed is true, ordinary alcohol-centered experiences such as cocktail outings, a bar crawl or brewery tasting are allowed. Do not demand ID proof just to suggest them after the age self-report and outing confirmation, and do not automatically replace them with mocktail-only activities. Venue entry, service and local rules still need to be checked before participating. Anyone can opt out of drinking; drinking is never a quota, timed contest, forfeit or prerequisite to taking part.",
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
        : alcoholSuggestionAllowed
          ? ("permitted_for_21_plus_outing" as const)
          : ("not_requested_or_required" as const),
      surpriseTargetExcluded: excluded.has("being_surprised"),
      confirmedNonTargetSurpriseRole,
      requiredIntoxication: false as const,
      drinkingBeforeHazardousActivities: false as const,
      paidGambling: false as const,
      direction:
        "Firm exclusions override interests and preferred domains. Food challenges excludes challenge mechanics, not ordinary cooking or dining. Being surprised excludes making this user the target; a confirmed mastermind or camera-person role can organize or film a willing group's surprise while remaining outside the reveal. Without that confirmed role, do not assume surprise participation. Unknown answers grant no permissions. The permitted_for_21_plus_outing alcohol state affirmatively allows ordinary drinking experiences; alcohol itself is not a rejection reason. No drinking quotas, timed drinking, chugging, required intoxication, or drinking before driving, cycling, water or hazardous physical activities. Ordinary drinks alongside low-risk social activities are allowed. Do not create paid gambling, wagers or parlays; use a non-cash scoreboard. Do not use fake disabilities, pressure workers for personal contact, send messages without the account owner's approval, or make unwilling/vulnerable people the punchline.",
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
      "The current outing overrides usual profile category, intensity and group. Preferred domains and confirmed interests are creative leads, not an allowlist; explore beyond them while respecting explicit exclusions. A selected adult-nightlife outing takes priority over older sports, games or other interests. Do not add participants or invent consent.",
      outing.group === "couple"
        ? "Design for exactly two active participants. A couple or date can be adventurous; the selected intensity determines ambition."
        : outing.group === "friends"
          ? "Design for the actual friend group to enjoy together. Full Send can be rowdy, spontaneous, competitive or simply an unforgettable outing; assigned roles, a winner and a staged payoff are optional."
          : "Make the solo experience complete without inventing a supporting cast.",
      "Skills are resources and interests are inspiration. Neither confines the idea to familiar activities, and no activity genre is automatically too tame; ambition comes from the actual experience and this group's appetite.",
      "Conditional adrenaline ideas require explicit activity agreement, a legitimate operator or permitted activity, and suitable costs, time and arrangements. Do not invent availability, bookings or consent.",
      "Budget and time are hard limits, not reasons to lower the selected intensity. Preparation counts as activity time. Unconfirmed venue charges are unknown, not free; confirm required charges before declaring a fit.",
      "Report no fit when actual time, budget, age, consent, safety or explicit boundary requirements cannot be met, or a clear, compelling experience at the requested intensity cannot be produced. Adult content, novelty and filming suitability are not reasons to block an otherwise fitting experience. Still provide clear actions, a clear ending and an experience that delivers the selected intensity.",
    ],
  };
}

export type QuestRoutingBrief = ReturnType<typeof buildQuestRoutingBrief>;
