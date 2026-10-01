import {
  activityCatalog,
  historicalActivityCatalog,
  retiredFullSendActivityCatalog,
} from "./activity-recipes";

// An explicit allow-list of versions that were publicly published, not a rule
// that exposes arbitrary unpublished creator drafts or moderated templates.
const archived = new Set(
  [...historicalActivityCatalog, ...retiredFullSendActivityCatalog].map(
    (quest) => quest.id,
  ),
);
const currentByKey = new Map(
  activityCatalog.map((quest) => [
    `${quest.familyId}:${quest.variantKey}:${quest.intensity}`,
    quest.id,
  ]),
);
const replacements = new Map(
  historicalActivityCatalog.map((quest) => [
    quest.id,
    currentByKey.get(
      `${quest.familyId}:${quest.variantKey}:${quest.intensity}`,
    ),
  ]),
);
export const isArchivedActivityTemplate = (id: string) => archived.has(id);
/** An explicit user navigation to this ID starts the revised quest. */
export const currentActivityTemplateId = (id: string): string | null =>
  replacements.get(id) ?? null;
