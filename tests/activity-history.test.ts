import { describe, expect, it } from "vitest";
import {
  currentActivityTemplateId,
  isArchivedActivityTemplate,
} from "../shared/activity-history";
import {
  activityCatalog,
  historicalActivityCatalog,
  retiredFullSendActivityCatalog,
} from "../shared/activity-recipes";

describe("immutable published activity history", () => {
  it("offers a current version for retained intensities and keeps retired Full Send playback only", () => {
    for (const old of historicalActivityCatalog) {
      const id = currentActivityTemplateId(old.id);
      if (old.intensity === "full_send") {
        expect(id).toBeNull();
        expect(isArchivedActivityTemplate(old.id)).toBe(true);
        continue;
      }
      const updated = activityCatalog.find((quest) => quest.id === id)!;
      expect(updated).toBeDefined();
      expect(updated.familyId).toBe(old.familyId);
      expect(updated.variantKey).toBe(old.variantKey);
      expect(updated.intensity).toBe(old.intensity);
      expect(updated.version).toBeGreaterThan(old.version);
      expect(isArchivedActivityTemplate(old.id)).toBe(true);
    }
  });
  it("retains an explicit allow-list of withdrawn v2 templates without replacements", () => {
    for (const quest of retiredFullSendActivityCatalog) {
      expect(isArchivedActivityTemplate(quest.id)).toBe(true);
      expect(currentActivityTemplateId(quest.id)).toBeNull();
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
