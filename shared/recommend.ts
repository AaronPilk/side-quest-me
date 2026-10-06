import { placeFitReason, type PlaceContext } from "./place-matching";
import { catalog } from "./catalog";
import { confirmedAgeBand, isAdultAgeConfirmed } from "./age-eligibility";
import {
  CATEGORIES,
  INTENSITIES,
  effectiveBudget,
  outingSchema,
  normalizePreferences,
  REWARD_POLICY,
  type Candidate,
  type Outing,
  type Preferences,
  type QuestVariant,
} from "./domain";

export type TriedFamily =
  | string
  | { familyId: string; attemptedAt?: string; awardedAt?: string | null };
const DAY_MS = 86_400_000;

/** Stable within one UTC day. Editorial briefs rotate without inventing a new
 * reward family, changing preference scores, or weakening any hard filter. */
function dailyBriefOrder(id: string, now: Date): number {
  let hash = 2166136261;
  for (const character of `${now.toISOString().slice(0, 10)}:${id}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

function preferenceLabel(value: string): string {
  const labels: Record<string, string> = {
    making: "making and design",
    local_knowledge: "local knowledge",
    friendly_awkward: "friendly awkwardness",
    elaborate_setups: "elaborate setups",
    skill_reveals: "skill reveals",
    competitive: "friendly competition",
    absurd: "absurd situations",
    surprises: "surprises",
  };
  return labels[value] ?? value;
}

/** Currency amounts remain integer minor units throughout ranking and acceptance. */
export function estimateCost(
  quest: QuestVariant,
  outing: Outing,
): { minMinor: number; maxMinor: number; known: boolean } {
  const multiplier =
    quest.cost.scope === "per_person" ? outing.participants : 1;
  // Generated rentals, tours and equipment can carry a pending total charge
  // outdoors too. Keep the real setting and use the existing confirmed-cost
  // field for that one group charge, independent of activity cost scope.
  const needsConfirmedCharge =
    outing.setting === "venue" ||
    (quest.privateGenerated === true && quest.cost.venueCostUnknown);
  const venueUnknown =
    needsConfirmedCharge &&
    quest.cost.venueCostUnknown &&
    outing.confirmedVenueCostMinor === null;
  const venueMinor = needsConfirmedCharge
    ? (outing.confirmedVenueCostMinor ?? 0)
    : 0;
  return {
    minMinor:
      quest.cost.minMinor * multiplier + venueMinor + outing.travelCostMinor,
    maxMinor:
      quest.cost.maxMinor * multiplier + venueMinor + outing.travelCostMinor,
    known: !venueUnknown,
  };
}

export type EligibilityIssueCode =
  | "category"
  | "intensity"
  | "participants"
  | "setting"
  | "duration"
  | "venue_cost"
  | "budget"
  | "currency"
  | "venue_permission"
  | "arrangements"
  | "adults"
  | "age"
  | "adult_context"
  | "boundary"
  | "custom_boundary";
export type EligibilityIssue = { code: EligibilityIssueCode; reason: string };

/** Adult-nightlife opt-in broadens private discovery, not the age of every
 * suggestion. Catalog entries keep their established adult-context contract. */
export function usesAdultVenueContext(quest: QuestVariant, outing: Outing) {
  const actualAdultVenue = quest.conflicts.some(
    (conflict) => conflict === "alcohol" || conflict === "adult_venues",
  );
  return (
    actualAdultVenue ||
    (outing.adultContext &&
      (!quest.privateGenerated ||
        (quest.supportsAdultContext &&
          (quest.adultOnly || quest.minimumAge !== undefined))))
  );
}

/** The single source of truth for previews, recovery explanations, and acceptance. */
export function ineligibilityIssues(
  quest: QuestVariant,
  outing: Outing,
  preferencesInput: Preferences,
): EligibilityIssue[] {
  const preferences = normalizePreferences(preferencesInput);
  const exclusions = preferences.exclusions ?? [];
  const adultVenueContext = usesAdultVenueContext(quest, outing);
  const minimumAge = quest.conflicts.includes("alcohol")
    ? 21
    : quest.minimumAge;
  const reasons: EligibilityIssue[] = [];
  const issue = (code: EligibilityIssueCode, reason: string) =>
    reasons.push({ code, reason });
  if (quest.category !== outing.category)
    issue(
      "category",
      `This quest is in ${CATEGORIES.find(({ id }) => id === quest.category)!.label}.`,
    );
  if (quest.intensity !== outing.intensity)
    issue(
      "intensity",
      `This quest uses ${INTENSITIES.find(({ id }) => id === quest.intensity)!.label} intensity.`,
    );
  if (
    outing.participants < quest.minParticipants ||
    outing.participants > quest.maxParticipants
  )
    issue(
      "participants",
      `This quest needs ${quest.minParticipants}–${quest.maxParticipants} participants, including its supporting cast.`,
    );
  if (quest.allowedGroups && !quest.allowedGroups.includes(outing.group))
    issue(
      "participants",
      `This quest is written for ${quest.allowedGroups.map((group) => ({ solo: "one person", couple: "a couple", friends: "a group of friends" })[group]).join(" or ")}.`,
    );
  if (!quest.settings.includes(outing.setting))
    issue(
      "setting",
      `This quest needs ${quest.settings.map((setting) => ({ home: "a home setting", outside: "an outdoor setting", venue: "a venue" })[setting]).join(" or ")}.`,
    );
  if (
    outing.durationMinutes !== null &&
    quest.durationMinutes + outing.travelMinutes > outing.durationMinutes
  )
    issue(
      "duration",
      `Allow ${quest.durationMinutes + outing.travelMinutes} minutes for preparation, the quest, and round-trip travel.`,
    );
  const costs = estimateCost(quest, outing);
  if (!costs.known)
    issue(
      "venue_cost",
      "Confirm the complete required group charge before this quest can fit your budget.",
    );
  if (costs.maxMinor > effectiveBudget(outing))
    issue(
      "budget",
      `The full estimated group cost of ${formatMoney(costs.maxMinor)} is above your ${formatMoney(effectiveBudget(outing))} budget.`,
    );
  if (quest.cost.currency !== outing.currency)
    issue("currency", "This quest is unavailable in the selected currency.");
  if (
    (outing.setting === "venue" || quest.privateGenerated) &&
    quest.venuePermissionRequired &&
    !outing.venuePermission
  )
    issue(
      "venue_permission",
      "Required activity and filming permission has not been confirmed.",
    );
  if (quest.arrangementRequired && !outing.arrangementConfirmed)
    issue(
      "arrangements",
      "Arrange the required friends, space, or performance slot before accepting.",
    );
  if (minimumAge === 21 && confirmedAgeBand(preferences) !== "21_plus")
    issue(
      "age",
      "This experience is for ages 21+. Update your age group in Account & quest preferences or choose another experience.",
    );
  else if (
    confirmedAgeBand(preferences) === "18_20" &&
    minimumAge === undefined &&
    (quest.adultOnly || (adultVenueContext && quest.supportsAdultContext))
  )
    issue(
      "age",
      "This older adult experience needs a fresh age-matched suggestion. Find another experience for your current age group.",
    );
  else if (
    (minimumAge === 18 ||
      quest.adultOnly ||
      quest.requiresVolunteer ||
      adultVenueContext) &&
    !isAdultAgeConfirmed(preferences)
  )
    issue(
      "age",
      "This activity is for adults. Confirm your age group in Account & quest preferences to see eligible options.",
    );
  if (
    (minimumAge ||
      quest.adultOnly ||
      quest.requiresVolunteer ||
      adultVenueContext) &&
    !outing.adultEligible
  )
    issue(
      "adults",
      "Explicit adult eligibility is required for this activity.",
    );
  if (
    adultVenueContext &&
    (!quest.supportsAdultContext ||
      outing.setting !== "venue" ||
      !outing.venuePermission)
  )
    issue(
      "adult_context",
      "This quest does not support the selected adult-venue context.",
    );
  const conflicts = quest.conflicts.filter((conflict) => {
    // A private performance is not public; directing a surprise does not make its organizer the target.
    if (conflict === "public_performance" && outing.setting === "home")
      return false;
    if (
      conflict === "being_surprised" &&
      preferences.role !== null &&
      quest.roles.includes(preferences.role) &&
      ["mastermind", "camera_person"].includes(preferences.role)
    )
      return false;
    return exclusions.includes(conflict);
  });
  if (
    exclusions.includes("food_challenges") &&
    quest.familyId === "street_meal_choice"
  )
    conflicts.push("food_challenges");
  if (exclusions.includes("adult_venues") && adultVenueContext)
    conflicts.push("adult_venues");
  // No catalog variant requires alcohol. A sober adult-venue visit remains possible if otherwise explicitly eligible.
  if (
    exclusions.includes("strangers") &&
    quest.requiresVolunteer &&
    outing.setting !== "home"
  )
    conflicts.push("strangers");
  if (
    preferences.approach === "group_only" &&
    quest.requiresVolunteer &&
    outing.setting !== "home"
  )
    conflicts.push("strangers");
  // Without trustworthy area boundaries, keep this exclusion conservative instead of guessing where travel ends.
  if (exclusions.includes("travel_outside_area") && outing.travelMinutes > 0)
    conflicts.push("travel_outside_area");
  if (conflicts.length)
    issue("boundary", "This quest conflicts with a boundary in your profile.");
  if (preferences.otherExclusion.trim())
    issue(
      "custom_boundary",
      "Your custom boundary needs review. Select matching listed boundaries or edit it before choosing a quest.",
    );
  return reasons;
}

/** Hard filters run before scoring. Returned explanations are safe to display. */
export function ineligibilityReasons(
  quest: QuestVariant,
  outing: Outing,
  preferences: Preferences,
): string[] {
  return ineligibilityIssues(quest, outing, preferences).map(
    ({ reason }) => reason,
  );
}

export function familyEligibility(
  familyId: string,
  triedFamilies: TriedFamily[],
  now = new Date(),
): Candidate["rewardEligibility"] {
  const cutoff = now.getTime() - REWARD_POLICY.cooldownDays * DAY_MS;
  const cooling = triedFamilies.some(
    (tried) =>
      typeof tried !== "string" &&
      tried.familyId === familyId &&
      tried.awardedAt &&
      Number.isFinite(Date.parse(tried.awardedAt)) &&
      Date.parse(tried.awardedAt) > cutoff,
  );
  return {
    eligible: !cooling,
    reason: cooling ? "family_cooldown" : "eligible",
  };
}

/**
 * Curated, deterministic matching: only confirmed structured preferences influence ranking.
 * Imported prose, tentative impressions, unknown answers, and sponsors never imply willingness.
 * Server acceptance and finalization must recheck real account cap/cooldown with server time.
 */
export function recommend(
  outingInput: Outing,
  preferencesInput: Preferences,
  triedFamilies: TriedFamily[] = [],
  now = new Date(),
  variants: QuestVariant[] = catalog,
  offset = 0,
  placeContext?: PlaceContext | null,
): Candidate[] {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 30_000)
    throw new RangeError("Invalid quest page.");
  const outing = outingSchema.parse(outingInput);
  const preferences = normalizePreferences(preferencesInput);
  const tried = new Set(
    triedFamilies.map((item) =>
      typeof item === "string" ? item : item.familyId,
    ),
  );
  const budget = effectiveBudget(outing);
  const ranked = variants
    .filter(
      (quest) => ineligibilityReasons(quest, outing, preferences).length === 0,
    )
    .map((quest) => {
      const factors: { score: number; reason: string }[] = [];
      const locationFit = placeFitReason(quest, outing, placeContext);
      if (locationFit) factors.push({ score: 6, reason: locationFit });
      const premises = (preferences.premises ?? []).filter(
        (
          premise,
        ): premise is Exclude<
          NonNullable<Preferences["premises"]>[number],
          "not_sure"
        > =>
          premise !== "not_sure" &&
          quest.interests.includes(premise) &&
          // This survey answer explicitly means no preparation; a shared tag cannot erase that qualifier.
          (premise !== "spontaneous" ||
            (quest.preparation === "start_now" && !quest.arrangementRequired)),
      );
      if (premises.length) {
        const premise = premises[0];
        const labels = {
          fan_club: "a fan-club surprise",
          open_mic: "an open mic",
          secret_expert: "a secret-expert game",
          mystery_date: "a mystery date",
          meal_challenge: "a meal challenge",
          spontaneous: "something spontaneous",
        };
        const privatePractice =
          premise === "open_mic" &&
          (outing.setting === "home" || quest.intensity !== "full_send");
        factors.push({
          score: premises.length * 5,
          reason: privatePractice
            ? "Private practice for the open mic you'd try"
            : `Matches a premise you'd try: ${labels[premise]}`,
        });
      }
      const skills = (preferences.skills ?? []).filter(
        (skill) => skill !== "none" && quest.interests.includes(skill),
      );
      if (skills.length)
        factors.push({
          score: skills.length * 4,
          reason: `Can use your ${preferenceLabel(skills[0])}${skills[0] === "local_knowledge" ? "" : " skills"}`,
        });
      const interests = (preferences.interests ?? []).filter((interest) =>
        quest.interests.includes(interest),
      );
      if (interests.length)
        factors.push({
          score: interests.length * 3,
          reason: `Matches your interest in ${interests[0] === "local_knowledge" ? "exploring local places" : preferenceLabel(interests[0])}`,
        });
      const humor = (preferences.humor ?? []).filter((style) =>
        quest.interests.includes(style),
      );
      if (humor.length)
        factors.push({
          score: humor.length * 2,
          reason: `Matches your taste for ${preferenceLabel(humor[0])}`,
        });
      const roleFit =
        preferences.role !== null && quest.roles.includes(preferences.role);
      if (roleFit)
        factors.push({
          score: 2,
          reason: {
            mastermind: "Supports your preference to organize",
            camera_person: "Supports your preference to film",
            main_character: "Supports your preference to take the lead",
            rotate: "Supports your preference to rotate roles",
          }[preferences.role!],
        });
      const preparationFit = preferences.preparation === quest.preparation;
      if (preparationFit)
        factors.push({
          score: 2,
          reason: {
            start_now: "Matches your preference to start without preparation",
            a_few_things: "Matches your preference for a little preparation",
            proper_setup: "Matches your preference for a proper setup",
          }[quest.preparation],
        });
      if (
        preferences.approach === "group_only" &&
        (outing.setting === "home" || !quest.requiresVolunteer)
      )
        factors.push({
          score: 2,
          reason: "Keeps participation within your group",
        });
      else if (
        quest.requiresVolunteer &&
        outing.setting !== "home" &&
        (preferences.approach === "invitation" ||
          preferences.approach === "conversation")
      )
        factors.push({
          score: 2,
          reason:
            preferences.approach === "invitation"
              ? "Uses a clear invitation, as you prefer"
              : "Fits your willingness to start a conversation",
        });
      const score =
        factors.reduce((total, factor) => total + factor.score, 0) -
        (tried.has(quest.familyId) ? 8 : 0);
      const cost = estimateCost(quest, outing);
      const reasons = [
        ...factors
          .sort((a, b) => b.score - a.score)
          .map((factor) => factor.reason),
        outing.setting === "home"
          ? "Works at home"
          : "Fits your confirmed setting",
        cost.maxMinor === 0
          ? "No purchase needed"
          : `Fits your ${formatMoney(budget, outing.currency)} group budget`,
      ];
      const candidate: Candidate = {
        ...quest,
        effectiveBudgetMinor: budget,
        estimatedCostMinMinor: cost.minMinor,
        estimatedCostMaxMinor: cost.maxMinor,
        whyFits: reasons.slice(0, 5),
        ready: true,
        selectedRole: roleFit ? preferences.role : null,
        rewardEligibility: familyEligibility(
          quest.familyId,
          triedFamilies,
          now,
        ),
      };
      return { candidate, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.candidate.familyId.localeCompare(b.candidate.familyId) ||
        (a.candidate.familyId.startsWith("activity_")
          ? dailyBriefOrder(a.candidate.id, now) -
            dailyBriefOrder(b.candidate.id, now)
          : 0) ||
        a.candidate.id.localeCompare(b.candidate.id),
    );
  const seen = new Set<string>();
  return ranked
    .filter(
      ({ candidate }) =>
        !seen.has(candidate.familyId) && !!seen.add(candidate.familyId),
    )
    .slice(offset, offset + 3)
    .map((item) => item.candidate);
}

export function formatMoney(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
export function nextUtcReset(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}
