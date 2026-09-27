import { catalog } from "./catalog";
import {
  effectiveBudget,
  outingSchema,
  preferencesSchema,
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

/** Currency amounts remain integer minor units throughout ranking and acceptance. */
export function estimateCost(
  quest: QuestVariant,
  outing: Outing,
): { minMinor: number; maxMinor: number; known: boolean } {
  const multiplier =
    quest.cost.scope === "per_person" ? outing.participants : 1;
  const venueUnknown =
    outing.setting === "venue" &&
    quest.cost.venueCostUnknown &&
    outing.confirmedVenueCostMinor === null;
  const venueMinor =
    outing.setting === "venue" ? (outing.confirmedVenueCostMinor ?? 0) : 0;
  return {
    minMinor:
      quest.cost.minMinor * multiplier + venueMinor + outing.travelCostMinor,
    maxMinor:
      quest.cost.maxMinor * multiplier + venueMinor + outing.travelCostMinor,
    known: !venueUnknown,
  };
}

/** Hard filters run before scoring. Returned explanations are safe to display. */
export function ineligibilityReasons(
  quest: QuestVariant,
  outing: Outing,
  preferences: Preferences,
): string[] {
  const reasons: string[] = [];
  if (quest.category !== outing.category)
    reasons.push("Choose this category to see this quest.");
  if (quest.intensity !== outing.intensity)
    reasons.push("Choose this intensity to see this quest.");
  if (
    outing.participants < quest.minParticipants ||
    outing.participants > quest.maxParticipants
  )
    reasons.push(
      `This quest needs ${quest.minParticipants}–${quest.maxParticipants} participants, including its supporting cast.`,
    );
  if (!quest.settings.includes(outing.setting))
    reasons.push("This quest needs a different setting.");
  if (
    outing.durationMinutes !== null &&
    quest.durationMinutes + outing.travelMinutes > outing.durationMinutes
  )
    reasons.push(
      "Allow more time for preparation, the quest, and round-trip travel.",
    );
  const costs = estimateCost(quest, outing);
  if (!costs.known)
    reasons.push(
      "Confirm the complete required venue charge before this quest can fit your budget.",
    );
  if (costs.maxMinor > effectiveBudget(outing))
    reasons.push("The full estimated group cost is above your budget.");
  if (quest.cost.currency !== outing.currency)
    reasons.push("This quest is unavailable in the selected currency.");
  if (
    outing.setting === "venue" &&
    quest.venuePermissionRequired &&
    !outing.venuePermission
  )
    reasons.push(
      "Confirm venue and filming permission, or choose a private-space version.",
    );
  if (quest.arrangementRequired && !outing.arrangementConfirmed)
    reasons.push(
      "Arrange the required friends, space, or performance slot before accepting.",
    );
  if (
    (quest.adultOnly || quest.requiresVolunteer || outing.adultContext) &&
    !outing.adultEligible
  )
    reasons.push("Explicit adult eligibility is required for this activity.");
  if (
    outing.adultContext &&
    (!quest.supportsAdultContext ||
      outing.setting !== "venue" ||
      !outing.venuePermission)
  )
    reasons.push(
      "This quest does not support the selected adult-venue context.",
    );
  const conflicts = quest.conflicts.filter((conflict) => {
    // A private performance is not public; directing a surprise does not make its organizer the target.
    if (conflict === "public_performance" && outing.setting === "home")
      return false;
    if (
      conflict === "being_surprised" &&
      ["mastermind", "camera_person"].includes(preferences.role)
    )
      return false;
    return preferences.exclusions.includes(conflict);
  });
  if (
    preferences.exclusions.includes("food_challenges") &&
    quest.familyId === "street_meal_choice"
  )
    conflicts.push("food_challenges");
  if (preferences.exclusions.includes("adult_venues") && outing.adultContext)
    conflicts.push("adult_venues");
  // No catalog variant requires alcohol. A sober adult-venue visit remains possible if otherwise explicitly eligible.
  if (
    preferences.exclusions.includes("strangers") &&
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
  if (
    preferences.exclusions.includes("travel_outside_area") &&
    outing.travelMinutes > 0
  )
    conflicts.push("travel_outside_area");
  if (conflicts.length)
    reasons.push("This quest conflicts with a boundary in your profile.");
  if (preferences.otherExclusion.trim())
    reasons.push(
      "Your custom boundary needs review. Select matching listed boundaries or edit it before choosing a quest.",
    );
  return reasons;
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
 * Curated, deterministic fallback: no imported summary, AI output, or sponsor can change eligibility.
 * Server acceptance and finalization must recheck real account cap/cooldown with server time.
 */
export function recommend(
  outingInput: Outing,
  preferencesInput: Preferences,
  triedFamilies: TriedFamily[] = [],
  now = new Date(),
): Candidate[] {
  const outing = outingSchema.parse(outingInput);
  const preferences = preferencesSchema.parse(preferencesInput);
  const tried = new Set(
    triedFamilies.map((item) =>
      typeof item === "string" ? item : item.familyId,
    ),
  );
  const preferenceInterests = new Set([
    ...preferences.premises,
    ...preferences.humor,
    ...preferences.skills,
  ]);
  const budget = effectiveBudget(outing);
  const ranked = catalog
    .filter(
      (quest) => ineligibilityReasons(quest, outing, preferences).length === 0,
    )
    .map((quest) => {
      const matches = quest.interests.filter((interest) =>
        preferenceInterests.has(interest as never),
      );
      const roleFit = quest.roles.includes(preferences.role);
      const preparationFit =
        preferences.preparation === "varies" ||
        preferences.preparation === quest.preparation;
      const score =
        matches.length * 4 +
        (roleFit ? 2 : 0) +
        (preparationFit ? 2 : 0) -
        (tried.has(quest.familyId) ? 8 : 0);
      const cost = estimateCost(quest, outing);
      const reasons = [
        outing.setting === "home"
          ? "Works at home"
          : "Fits your confirmed setting",
        cost.maxMinor === 0
          ? "No purchase needed"
          : `Fits your ${formatMoney(budget, outing.currency)} group budget`,
      ];
      const skill = preferences.skills.find((value) =>
        quest.interests.includes(value),
      );
      if (skill && skill !== "none")
        reasons.push(
          `Uses your ${skill === "making" ? "making and design" : skill.replaceAll("_", " ")} interests`,
        );
      if (preferences.role === "mastermind")
        reasons.push("You can organize the reveal");
      if (preferences.role === "camera_person")
        reasons.push("You can film willing participants");
      const candidate: Candidate = {
        ...quest,
        effectiveBudgetMinor: budget,
        estimatedCostMinMinor: cost.minMinor,
        estimatedCostMaxMinor: cost.maxMinor,
        whyFits: reasons.slice(0, 5),
        ready: true,
        selectedRole: preferences.role,
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
        b.score - a.score || a.candidate.id.localeCompare(b.candidate.id),
    );
  const seen = new Set<string>();
  return ranked
    .filter(
      ({ candidate }) =>
        !seen.has(candidate.familyId) && !!seen.add(candidate.familyId),
    )
    .slice(0, 3)
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
