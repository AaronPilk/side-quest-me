import { catalog } from "./catalog";
import {
  CATEGORIES,
  INTENSITIES,
  effectiveBudget,
  outingSchema,
  type Outing,
  type Preferences,
  type QuestVariant,
} from "./domain";
import {
  estimateCost,
  formatMoney,
  ineligibilityIssues,
  type EligibilityIssue,
  type EligibilityIssueCode,
} from "./recommend";

export type QuestRecovery = {
  id: string;
  label: string;
  description: string;
  fields: (keyof Outing)[];
  patch: Partial<Outing>;
  questId: string;
  questTitle: string;
  /** Jump to these controls; never manufacture completed arrangements or consent. */
  requiresConfirmation: boolean;
};
export type QuestViability = {
  /** Potential variants, not a promise that unknown requirements have been confirmed. */
  viableCount: number;
  reasons: string[];
  recoveries: QuestRecovery[];
};
const fieldsForIssue: Record<EligibilityIssueCode, (keyof Outing)[]> = {
  category: ["category"],
  intensity: ["intensity"],
  participants: ["group", "participants"],
  setting: ["setting"],
  duration: ["durationMinutes"],
  venue_cost: ["confirmedVenueCostMinor"],
  budget: ["budgetMinor", "budgetScope"],
  currency: ["currency"],
  venue_permission: ["venuePermission"],
  arrangements: ["arrangementConfirmed"],
  adults: ["adultEligible"],
  age: [],
  adult_context: ["adultContext"],
  boundary: [],
  custom_boundary: [],
};
const groupFor = (count: number): Outing["group"] =>
  count === 1 ? "solo" : count === 2 ? "couple" : "friends";

/**
 * Search for a possible completion of the unanswered questions. Every witness is
 * checked by the same hard filters used at acceptance. Witnesses are private to
 * this module: hypothetical permission, money, or arrangements are never saved
 * or returned as user answers. Enumerating people/settings handles conditional
 * profile boundaries and per-person budgets without treating defaults as input.
 */
function closestCompletion(
  quest: QuestVariant,
  outing: Outing,
  preferences: Preferences,
  confirmed: Set<keyof Outing>,
): { outing: Outing; issues: EligibilityIssue[] } {
  const settings = confirmed.has("setting") ? [outing.setting] : quest.settings;
  const counts = confirmed.has("participants")
    ? [outing.participants]
    : confirmed.has("group") && outing.group !== "friends"
      ? [outing.group === "solo" ? 1 : 2]
      : Array.from({ length: 12 }, (_, i) => i + 1).filter(
          (n) => !confirmed.has("group") || n >= 2,
        );
  const scopes: Outing["budgetScope"][] = confirmed.has("budgetScope")
    ? [outing.budgetScope]
    : ["total", "per_person"];
  let closest: { outing: Outing; issues: EligibilityIssue[] } | undefined;
  for (const setting of settings)
    for (const participants of counts)
      for (const budgetScope of scopes) {
        const hypothetical: Outing = {
          ...outing,
          category: confirmed.has("category")
            ? outing.category
            : quest.category,
          intensity: confirmed.has("intensity")
            ? outing.intensity
            : quest.intensity,
          setting,
          participants,
          group: confirmed.has("group") ? outing.group : groupFor(participants),
          budgetScope,
          budgetMinor: confirmed.has("budgetMinor")
            ? outing.budgetMinor
            : 1_000_000,
          durationMinutes: confirmed.has("durationMinutes")
            ? outing.durationMinutes
            : null,
          travelMinutes: confirmed.has("travelMinutes")
            ? outing.travelMinutes
            : 0,
          travelCostMinor: confirmed.has("travelCostMinor")
            ? outing.travelCostMinor
            : 0,
          confirmedVenueCostMinor: confirmed.has("confirmedVenueCostMinor")
            ? outing.confirmedVenueCostMinor
            : 0,
          venuePermission: confirmed.has("venuePermission")
            ? outing.venuePermission
            : true,
          arrangementConfirmed: confirmed.has("arrangementConfirmed")
            ? outing.arrangementConfirmed
            : true,
          adultEligible: confirmed.has("adultEligible")
            ? outing.adultEligible
            : true,
          adultContext: confirmed.has("adultContext")
            ? outing.adultContext
            : false,
        };
        // Some partial combinations are contradictory; they must not be counted
        // as witnesses merely because the remaining eligibility checks pass.
        if (!outingSchema.safeParse(hypothetical).success) continue;
        const issues = ineligibilityIssues(quest, hypothetical, preferences);
        if (!closest || issues.length < closest.issues.length)
          closest = { outing: hypothetical, issues };
        if (issues.length === 0) return closest;
      }
  return (
    closest ?? {
      outing,
      issues: ineligibilityIssues(quest, outing, preferences),
    }
  );
}

function recoveryFor(
  quest: QuestVariant,
  outing: Outing,
  preferences: Preferences,
  confirmed: Set<keyof Outing>,
  issues: EligibilityIssue[],
): QuestRecovery | null {
  const codes = new Set(issues.map((issue) => issue.code));
  // No recovery weakens or removes a profile boundary. An unknown custom
  // boundary cannot safely be resolved by changing the outing behind it.
  if (
    codes.has("boundary") ||
    codes.has("custom_boundary") ||
    codes.has("age") ||
    codes.has("currency")
  )
    return null;
  const requiresConfirmation = [
    "venue_cost",
    "venue_permission",
    "arrangements",
    "adults",
  ].some((code) => codes.has(code as EligibilityIssueCode));
  const fields = [
    ...new Set(issues.flatMap(({ code }) => fieldsForIssue[code])),
  ];
  if (requiresConfirmation) {
    return {
      id: `review:${quest.id}`,
      label: `Review requirements for ${quest.title}`,
      description: issues.map(({ reason }) => reason).join(" "),
      fields,
      patch: {},
      questId: quest.id,
      questTitle: quest.title,
      requiresConfirmation: true,
    };
  }
  const patch: Partial<Outing> = {};
  const changes: string[] = [];
  if (codes.has("category")) {
    patch.category = quest.category;
    changes.push(CATEGORIES.find(({ id }) => id === quest.category)!.label);
  }
  if (codes.has("intensity")) {
    patch.intensity = quest.intensity;
    changes.push(INTENSITIES.find(({ id }) => id === quest.intensity)!.label);
  }
  if (codes.has("participants")) {
    patch.participants = Math.max(
      quest.minParticipants,
      Math.min(quest.maxParticipants, outing.participants),
    );
    patch.group =
      patch.participants === 2 && outing.group === "friends"
        ? "friends"
        : groupFor(patch.participants);
    changes.push(
      `${patch.participants} ${patch.participants === 1 ? "person" : "people"}`,
    );
  }
  if (codes.has("setting")) {
    patch.setting = quest.settings.includes("home")
      ? "home"
      : quest.settings[0];
    // Mirrors the wizard's context reset: changing a setting never grants a
    // permission or carries venue-only confirmations into another setting.
    patch.venuePermission = false;
    patch.confirmedVenueCostMinor = null;
    patch.adultEligible = false;
    patch.adultContext = false;
    patch.applePlaceId = null;
    if (patch.setting === "home") {
      patch.transport = "none";
      patch.travelMinutes = 0;
      patch.travelCostMinor = 0;
    }
    changes.push(
      patch.setting === "home"
        ? "at home"
        : patch.setting === "outside"
          ? "outside"
          : "at a venue",
    );
  }
  if (codes.has("adult_context")) {
    patch.adultContext = false;
    changes.push("no adult-venue activity");
  }
  let updated = { ...outing, ...patch };
  const requiredMinutes = quest.durationMinutes + updated.travelMinutes;
  if (
    codes.has("duration") &&
    updated.durationMinutes !== null &&
    requiredMinutes > updated.durationMinutes
  ) {
    patch.durationMinutes = requiredMinutes;
    changes.push(`${patch.durationMinutes} minutes`);
  }
  if (codes.has("budget")) {
    const cost = estimateCost(quest, updated);
    if (!cost.known) return null;
    // A new setting or group may already remove the cost gap. Keep the
    // supplied budget when that preceding change makes it sufficient.
    if (cost.maxMinor > effectiveBudget(updated)) {
      const divisor =
        updated.budgetScope === "per_person" ? updated.participants : 1;
      patch.budgetMinor = Math.ceil(cost.maxMinor / divisor);
      changes.push(
        `${formatMoney(patch.budgetMinor)} ${updated.budgetScope === "per_person" ? "per person" : "total"}`,
      );
    }
  }
  // Only changed values belong in the patch; applying it preserves every other
  // supplied answer. A stale or already-true suggestion must never be shown.
  for (const key of Object.keys(patch) as (keyof Outing)[])
    if (JSON.stringify(patch[key]) === JSON.stringify(outing[key]))
      delete patch[key];
  if (!Object.keys(patch).length) return null;
  updated = { ...outing, ...patch };
  if (!outingSchema.safeParse(updated).success) return null;
  const after = closestCompletion(
    quest,
    updated,
    preferences,
    new Set([...confirmed, ...(Object.keys(patch) as (keyof Outing)[])]),
  );
  if (after.issues.length) return null;
  return {
    id: `change:${quest.id}`,
    label: `Try ${changes.join(" · ")}`,
    description: `An option for ${quest.title}. Your other answers stay the same.`,
    fields: Object.keys(patch) as (keyof Outing)[],
    patch,
    questId: quest.id,
    questTitle: quest.title,
    requiresConfirmation: false,
  };
}

export function assessViability(
  outingInput: Outing,
  preferences: Preferences,
  confirmedFields: (keyof Outing)[],
  variants: QuestVariant[] = catalog,
): QuestViability {
  const outing = outingSchema.parse(outingInput);
  const confirmed = new Set(confirmedFields);
  const evaluated = variants.map((quest) => ({
    quest,
    ...closestCompletion(quest, outing, preferences, confirmed),
  }));
  const viableCount = evaluated.filter(({ issues }) => !issues.length).length;
  if (viableCount) return { viableCount, reasons: [], recoveries: [] };
  // Prefer explanations for the user's current scene and energy before
  // proposing another category. Within that scope, show the smallest gap.
  const ordered = evaluated.sort((a, b) => {
    const distance = (item: typeof a) =>
      item.issues.reduce(
        (sum, { code }) =>
          sum +
          (code === "category"
            ? 20
            : code === "intensity"
              ? 10
              : code === "boundary" || code === "custom_boundary"
                ? 50
                : 1),
        0,
      );
    return distance(a) - distance(b) || a.quest.id.localeCompare(b.quest.id);
  });
  const reasons = ordered[0]?.issues.map(({ reason }) => reason) ?? [
    "No published quests are available for this selection yet.",
  ];
  const recoveries: QuestRecovery[] = [];
  const seen = new Set<string>();
  for (const item of ordered) {
    const recovery = recoveryFor(
      item.quest,
      outing,
      preferences,
      confirmed,
      item.issues,
    );
    if (!recovery) continue;
    const key = JSON.stringify([
      recovery.requiresConfirmation,
      recovery.patch,
      recovery.fields,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    recoveries.push(recovery);
    if (recoveries.length === 3) break;
  }
  return { viableCount: 0, reasons, recoveries };
}
