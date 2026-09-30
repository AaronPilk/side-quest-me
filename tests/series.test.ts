import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalog } from "../shared/catalog";
import { DEFAULT_OUTING } from "../shared/domain";
import {
  deriveSeriesProgress,
  seriesSaveSchema,
  type SeriesSave,
  type SeriesContext,
} from "../shared/series";
import {
  demoSeriesDetail,
  demoSeriesList,
  demoSeriesMutate,
  demoSeriesPart,
  demoValidateSeriesPart,
  clearDemoSeriesFollowsForBlock,
} from "../src/lib/demo-series";
import { demoMutate, demoRead } from "../src/lib/demo-community";
import { DEMO_PEOPLE } from "../src/lib/demo-identity";
import type { Run } from "../src/lib/types";
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.values.set(k, String(v));
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
  clear() {
    this.values.clear();
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
}
const first = () => ({
  id: crypto.randomUUID(),
  title: "The first part",
  templateId: "date_menu_draft_chill_v1",
  prerequisitePartId: null,
  prerequisiteReason: "",
  published: true,
});
const input = (): SeriesSave => ({
  expectedVersion: 0,
  title: "A continuing story",
  premise: "Make a story together, one real quest at a time.",
  cover: "ocean",
  kind: "ongoing",
  state: "published",
  parts: [first()],
});
const switchTo = (who: "creator" | "viewer") =>
  localStorage.setItem("sidequest-demo-persona", who);
function run(series: SeriesContext, status: Run["status"]): Run {
  return {
    id: crypto.randomUUID(),
    quest: catalog[0],
    outing: DEFAULT_OUTING,
    role: null,
    status,
    clips: [],
    createdAt: new Date().toISOString(),
    series,
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("Series authorship and prerequisites", () => {
  it("requires stable unique identities and only meaningful earlier prerequisites", () => {
    const draft = input(),
      second = {
        ...first(),
        prerequisitePartId: draft.parts[0].id,
        prerequisiteReason: "Use the result of the first part.",
      };
    expect(
      seriesSaveSchema.safeParse({ ...draft, parts: [...draft.parts, second] })
        .success,
    ).toBe(true);
    expect(
      seriesSaveSchema.safeParse({ ...draft, parts: [second, ...draft.parts] })
        .success,
    ).toBe(false);
    expect(
      seriesSaveSchema.safeParse({
        ...draft,
        parts: [...draft.parts, { ...second, prerequisiteReason: "" }],
      }).success,
    ).toBe(false);
    expect(
      seriesSaveSchema.safeParse({
        ...draft,
        parts: [draft.parts[0], draft.parts[0]],
      }).success,
    ).toBe(false);
    expect(
      seriesSaveSchema.safeParse({
        ...draft,
        kind: "finite",
        parts: [...draft.parts, { ...first(), published: false }],
      }).success,
    ).toBe(false);
    expect(
      seriesSaveSchema.safeParse({
        ...draft,
        parts: [...draft.parts, { ...first(), published: false }],
      }).success,
    ).toBe(true);
  });
  it("persists private author drafts and blocks other creators from reading or replacing them", () => {
    const values = { ...input(), state: "draft" as const };
    const saved = demoSeriesMutate("save", values);
    expect(demoSeriesList(undefined, true)).toHaveLength(1);
    expect(demoSeriesList()).toEqual([]);
    switchTo("viewer");
    expect(() => demoSeriesDetail(saved.id)).toThrow(/not available/);
    expect(() =>
      demoSeriesMutate("save", {
        ...values,
        id: saved.id,
        expectedVersion: saved.version,
      }),
    ).toThrow(/Only the author/);
  });
  it("freezes published ordered part identities and reviewed versions while ongoing series can append", () => {
    const values = input(),
      saved = demoSeriesMutate("save", values);
    expect(saved.parts[0].locked).toBe(true);
    expect(saved.parts[0].templateVersion).toBe(1);
    expect(() =>
      demoSeriesMutate("save", {
        ...values,
        id: saved.id,
        expectedVersion: saved.version,
        parts: [{ ...values.parts[0], title: "Changed objective" }],
      }),
    ).toThrow(/Published parts/);
    const appended = demoSeriesMutate("save", {
      ...values,
      id: saved.id,
      expectedVersion: saved.version,
      parts: [...values.parts, { ...first(), published: false }],
    });
    expect(appended.parts).toHaveLength(2);
    switchTo("viewer");
    expect(demoSeriesDetail(saved.id).parts).toHaveLength(1);
    expect(demoSeriesDetail(saved.id).publishedPartCount).toBe(1);
  });
  it("keeps authored snapshots and permits withdrawal after a source quest changes or becomes unavailable", () => {
    const values = input();
    const saved = demoSeriesMutate("save", values);
    const index = catalog.findIndex(
      (quest) => quest.id === values.parts[0].templateId,
    );
    const original = catalog[index];
    try {
      catalog[index] = { ...original, version: original.version + 1 };
      const stale = demoSeriesPart(values.parts[0].id);
      expect(stale.canStart).toBe(false);
      expect(stale.reason).toMatch(/original quest version/);
      const renamed = demoSeriesMutate("save", {
        ...values,
        id: saved.id,
        expectedVersion: saved.version,
        title: "The same authored story",
      });
      expect(renamed.parts[0].quest).toEqual(original);
      expect(renamed.parts[0].templateVersion).toBe(original.version);
      catalog.splice(index, 1);
      const withdrawn = demoSeriesMutate("save", {
        ...values,
        id: saved.id,
        expectedVersion: renamed.version,
        state: "draft",
      });
      expect(withdrawn.state).toBe("draft");
      expect(withdrawn.parts[0].quest).toEqual(original);
      switchTo("viewer");
      expect(() => demoSeriesDetail(saved.id)).toThrow(/not available/);
    } finally {
      if (catalog[index]?.id === original.id) catalog[index] = original;
      else catalog.splice(index, 0, original);
    }
  });
});

describe("Series follows and private participant progress", () => {
  it("follows persist and new published parts notify once, without awards or progress", async () => {
    const values = input(),
      saved = demoSeriesMutate("save", values);
    switchTo("viewer");
    demoSeriesMutate("follow", { id: saved.id, following: true });
    expect(demoSeriesDetail(saved.id).following).toBe(true);
    expect(demoSeriesDetail(saved.id).progress?.completedPartIds).toEqual([]);
    switchTo("creator");
    const next = {
        ...values,
        id: saved.id,
        expectedVersion: saved.version,
        parts: [...values.parts, first()],
      },
      key = crypto.randomUUID();
    demoSeriesMutate("save", next, key);
    demoSeriesMutate("save", next, key);
    switchTo("viewer");
    const activity = demoRead<{ items: { kind: string }[] }>("activity");
    expect(
      activity.items.filter((i) => i.kind === "series_part_published"),
    ).toHaveLength(1);
    expect(demoSeriesDetail(saved.id).progress?.completedPartIds).toEqual([]);
    expect(localStorage.getItem("sidequest-demo-v1:viewer")).toBeNull();
    await demoMutate(
      "block",
      { userId: DEMO_PEOPLE.creator.id, blocked: true },
      crypto.randomUUID(),
    );
    clearDemoSeriesFollowsForBlock(
      DEMO_PEOPLE.viewer.id,
      DEMO_PEOPLE.creator.id,
    );
    expect(() => demoSeriesDetail(saved.id)).toThrow(/not available/);
    await demoMutate(
      "block",
      { userId: DEMO_PEOPLE.creator.id, blocked: false },
      crypto.randomUUID(),
    );
    expect(demoSeriesDetail(saved.id).following).toBe(false);
  });
  it("only own finalized linked attempts unlock prerequisites; independent parts remain available", () => {
    const values = input(),
      dependent = {
        ...first(),
        prerequisitePartId: values.parts[0].id,
        prerequisiteReason: "Bring the first part’s result.",
      };
    values.parts.push(dependent, first());
    const saved = demoSeriesMutate("save", values);
    switchTo("viewer");
    expect(demoSeriesPart(dependent.id).canStart).toBe(false);
    expect(demoSeriesPart(values.parts[2].id).canStart).toBe(true);
    expect(() =>
      demoValidateSeriesPart(dependent.id, dependent.templateId, []),
    ).toThrow(/required earlier part/);
    const context = demoValidateSeriesPart(
        values.parts[0].id,
        values.parts[0].templateId,
        [],
      ),
      pending = run(context, "review_needed");
    const waiting = demoSeriesDetail(saved.id, [pending]);
    expect(waiting.progress?.activeRunId).toBe(pending.id);
    expect(waiting.progress?.completedPartIds).toEqual([]);
    expect(waiting.parts[1].available).toBe(false);
    const completed = { ...pending, status: "finalized" as const };
    const own = demoSeriesDetail(saved.id, [completed]);
    expect(own.parts[1].available).toBe(true);
    expect(own.progress?.currentPartId).toBe(dependent.id);
    expect(demoSeriesDetail(saved.id, []).progress?.completedPartIds).toEqual(
      [],
    );
    expect(() =>
      demoValidateSeriesPart(values.parts[0].id, "another_quest_v1", []),
    ).toThrow(/different quest version/);
  });
  it("distinguishes finite completion from being caught up and keeps completed history after adding a part", () => {
    const values = input(),
      saved = demoSeriesMutate("save", values),
      context = demoValidateSeriesPart(
        values.parts[0].id,
        values.parts[0].templateId,
        [],
      ),
      completed = run(context, "finalized");
    const ongoing = deriveSeriesProgress(saved, [completed, completed]);
    expect(ongoing.completedPartIds).toEqual([values.parts[0].id]);
    expect(ongoing.caughtUp).toBe(true);
    expect(ongoing.complete).toBe(false);
    expect(ongoing.currentPartId).toBeNull();
    expect(
      deriveSeriesProgress({ ...saved, kind: "finite" }, [completed]).complete,
    ).toBe(true);
    const appended = demoSeriesMutate("save", {
      ...values,
      id: saved.id,
      expectedVersion: saved.version,
      parts: [...values.parts, first()],
    });
    const progress = deriveSeriesProgress(appended, [completed]);
    expect(progress.caughtUp).toBe(false);
    expect(progress.completedPartIds).toEqual(ongoing.completedPartIds);
    expect(progress.currentPartId).toBe(appended.parts[1].id);
  });
});
