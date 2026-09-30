import { describe, expect, it } from "vitest";
import {
  currentActivityTemplateId,
  isArchivedActivityTemplate,
} from "../shared/activity-history";
import {
  activityCatalog,
  historicalActivityCatalog,
} from "../shared/activity-recipes";

describe("immutable published activity history", () => {
  it("offers an explicit current version for every archived brief without changing old content", () => {
    for (const old of historicalActivityCatalog) {
      const id = currentActivityTemplateId(old.id);
      const updated = activityCatalog.find((quest) => quest.id === id)!;
      expect(updated).toBeDefined();
      expect(updated.familyId).toBe(old.familyId);
      expect(updated.variantKey).toBe(old.variantKey);
      expect(updated.intensity).toBe(old.intensity);
      expect(updated.version).toBeGreaterThan(old.version);
      expect(isArchivedActivityTemplate(old.id)).toBe(true);
    }
  });
  it("does not expose unknown unpublished content by guessing an ID or suffix", () => {
    for (const id of [
      "draft_unpublished_v1",
      "activity_fake_alpha_chill_v1",
      activityCatalog[0].id,
    ]) {
      expect(isArchivedActivityTemplate(id)).toBe(false);
      expect(currentActivityTemplateId(id)).toBeNull();
    }
  });
});
