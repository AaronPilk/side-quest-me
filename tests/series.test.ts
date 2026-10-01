import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalog } from "../shared/catalog";
import { DEFAULT_OUTING } from "../shared/domain";
import {
  deriveSeriesProgress,
  nextSeriesPartBlocker,
  seriesSaveFromDetail,
  seriesSaveSchema,
  withNextSeriesPart,
  withPartPublished,
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
  demoSeriesStartFromRun,
  demoPublicRunSeries,
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

describe("Making an existing quest the first episode", () => {
  const source = (status: Run["status"] = "accepted"): Run => ({
    id: crypto.randomUUID(),
    quest: structuredClone(catalog[0]),
    outing: DEFAULT_OUTING,
    role: null,
    status,
    clips: [],
    createdAt: new Date().toISOString(),
  });
  const promotion = (run: Run) => ({
    runId: run.id,
    title: "A continuing adventure",
    premise: "Try something new together.",
    cover: "forest" as const,
    kind: "ongoing" as const,
  });
  it("links once, preserves run data and wallet, and never publishes a private source draft", () => {
    const original = source("finalized"),
      input = promotion(original),
      key = crypto.randomUUID();
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({ runs: [original], wallet: { xp: 500, points: 50 } }),
    );
    const saved = demoSeriesStartFromRun(input, key);
    expect(saved.state).toBe("draft");
    expect(saved.parts[0].locked).toBe(true);
    expect(saved.parts[0].quest).toEqual(original.quest);
    expect(saved.progress?.completedPartIds).toEqual([saved.parts[0].id]);
    const persisted = JSON.parse(localStorage.getItem("sidequest-demo-v1")!);
    const { series, ...retained } = persisted.runs[0];
    expect(retained).toEqual(original);
    expect(persisted.wallet).toEqual({ xp: 500, points: 50 });
    expect(demoPublicRunSeries(original.id, series)).toBeUndefined();
    expect(demoSeriesStartFromRun(input, key)).toEqual(saved);
    expect(demoSeriesList(undefined, true)).toHaveLength(1);
    expect(() => demoSeriesStartFromRun(input)).toThrow(/already belongs/);
    expect(() =>
      demoSeriesStartFromRun({ ...input, title: "Different" }, key),
    ).toThrow(/request key/);
    const values: SeriesSave = {
      id: saved.id,
      expectedVersion: saved.version,
      title: saved.title,
      premise: saved.premise,
      cover: saved.cover,
      kind: saved.kind,
      state: "published",
      parts: saved.parts.map(
        ({
          id,
          title,
          templateId,
          prerequisitePartId,
          prerequisiteReason,
        }) => ({
          id,
          title,
          templateId,
          prerequisitePartId,
          prerequisiteReason,
          published: true,
        }),
      ),
    };
    expect(() =>
      demoSeriesMutate("save", {
        ...values,
        state: "draft",
        parts: [{ ...values.parts[0], title: "A different objective" }],
      }),
    ).toThrow(/Published parts/);
    demoSeriesMutate("save", values);
    expect(demoPublicRunSeries(original.id, series)).toEqual(series);
    switchTo("viewer");
    expect(demoSeriesDetail(saved.id).progress?.completedPartIds).toEqual([]);
  });
  it("rejects foreign and abandoned runs and reflects active progress before completion", () => {
    const original = source(),
      abandoned = source("abandoned");
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({ runs: [original, abandoned] }),
    );
    expect(() => demoSeriesStartFromRun(promotion(abandoned))).toThrow(
      /active or completed/,
    );
    switchTo("viewer");
    expect(() => demoSeriesStartFromRun(promotion(original))).toThrow(
      /active or completed/,
    );
    switchTo("creator");
    const saved = demoSeriesStartFromRun(promotion(original));
    expect(saved.progress?.activeRunId).toBe(original.id);
    expect(saved.progress?.completedPartIds).toEqual([]);
  });
});

describe("A series grows by doing its quest again", () => {
  const source = (): Run => ({
    id: crypto.randomUUID(),
    quest: structuredClone(catalog[0]),
    outing: DEFAULT_OUTING,
    role: null,
    status: "finalized",
    clips: [],
    createdAt: new Date().toISOString(),
  });
  const promote = (run: Run) =>
    demoSeriesStartFromRun({
      runId: run.id,
      title: run.quest.title,
      premise: run.quest.hook,
      cover: "sunrise",
      kind: "ongoing",
    });
  it("adds Part 2 of the same quest as a private part the author can attempt before anything is published", () => {
    const original = source();
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({ runs: [original], wallet: { xp: 0, points: 0 } }),
    );
    const series = promote(original);
    expect(nextSeriesPartBlocker(series)).toBeNull();
    const next = withNextSeriesPart(series);
    expect(next.position).toBe(2);
    expect(next.templateId).toBe(original.quest.id);
    expect(next.save.parts.map((part) => part.title)).toEqual([
      original.quest.title,
      "Part 2",
    ]);
    expect(next.save.parts[1].published).toBe(false);
    expect(next.save.state).toBe("draft");
    const saved = demoSeriesMutate("save", next.save);
    const part = saved.parts.find((candidate) => candidate.id === next.partId)!;
    expect(part.quest.id).toBe(original.quest.id);
    // The author may film their own unpublished part of a private series…
    expect(part.available).toBe(true);
    expect(demoSeriesPart(part.id).canStart).toBe(true);
    expect(saved.progress?.currentPartId).toBe(part.id);
    expect(
      demoValidateSeriesPart(part.id, original.quest.id, [original]).position,
    ).toBe(2);
    // …but nobody else can see or start it.
    switchTo("viewer");
    expect(() => demoSeriesDetail(saved.id)).toThrow(/not available/);
    switchTo("creator");
    expect(() => withNextSeriesPart({ ...saved, isOwner: false })).toThrow(
      /Only the author/,
    );
  });
  it("publishing a finished part makes a growing story public without touching other parts", () => {
    const original = source();
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({ runs: [original], wallet: { xp: 0, points: 0 } }),
    );
    const series = promote(original);
    const save = withPartPublished(series, series.parts[0].id);
    expect(save.state).toBe("published");
    expect(save.parts[0].published).toBe(true);
    const published = demoSeriesMutate("save", save);
    expect(published.state).toBe("published");
    const grown = demoSeriesMutate("save", withNextSeriesPart(published).save);
    expect(grown.parts).toHaveLength(2);
    expect(grown.parts[1].published).toBe(false);
    switchTo("viewer");
    const seen = demoSeriesDetail(grown.id);
    expect(seen.parts.map((part) => part.position)).toEqual([1]);
    expect(seen.parts[0].available).toBe(true);
  });
  it("new chapters keep the exact original snapshot and fail closed after its quest is revised or retired", () => {
    const original = source();
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({ runs: [original] }),
    );
    const series = promote(original);
    const next = withNextSeriesPart(series);
    const index = catalog.findIndex((quest) => quest.id === original.quest.id);
    const current = catalog[index];
    try {
      // A source story repeats its saved quest, even if a current catalog
      // payload with the same version has different presentation text.
      catalog[index] = { ...current, hook: "A newly written hook" };
      const grown = demoSeriesMutate("save", next.save);
      expect(grown.parts[1].quest).toEqual(original.quest);
      const waiting = withNextSeriesPart(grown);
      catalog[index] = { ...current, version: current.version + 1 };
      const stale = demoSeriesDetail(series.id);
      expect(nextSeriesPartBlocker(stale)).toMatch(/original quest version/);
      expect(() => withNextSeriesPart(stale)).toThrow(/original quest version/);
      expect(() => demoSeriesMutate("save", waiting.save)).toThrow(
        /original quest version/,
      );
      // Metadata edits still work; they never upgrade a saved chapter.
      const metadata = seriesSaveFromDetail(stale);
      metadata.parts[1].title = "A later attempt";
      const renamed = demoSeriesMutate("save", metadata);
      expect(
        renamed.parts.every(
          (part) => part.templateVersion === original.quest.version,
        ),
      ).toBe(true);
      expect(renamed.parts[1].quest).toEqual(original.quest);
      catalog.splice(index, 1);
      const retired = demoSeriesDetail(series.id);
      expect(nextSeriesPartBlocker(retired)).toMatch(/no longer available/);
      expect(() =>
        demoSeriesMutate("save", {
          ...waiting.save,
          expectedVersion: renamed.version,
        }),
      ).toThrow(/original quest version/);
    } finally {
      if (catalog[index]?.id === current.id) catalog[index] = current;
      else catalog.splice(index, 0, current);
    }
  });
  it("accepted private chapters keep identity and order after cancellation while future metadata remains editable", () => {
    const original = source();
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({ runs: [original] }),
    );
    const grown = demoSeriesMutate(
      "save",
      withNextSeriesPart(promote(original)).save,
    );
    const third = demoSeriesMutate("save", withNextSeriesPart(grown).save);
    const part = third.parts[1];
    const attempt = run(
      {
        id: third.id,
        title: third.title,
        partId: part.id,
        partTitle: part.title,
        position: part.position,
      },
      "abandoned",
    );
    const data = JSON.parse(localStorage.getItem("sidequest-demo-v1")!);
    data.runs.push(attempt);
    localStorage.setItem("sidequest-demo-v1", JSON.stringify(data));
    const input = seriesSaveFromDetail(third);
    expect(part.locked).toBe(false);
    expect(() =>
      demoSeriesMutate("save", {
        ...input,
        parts: [input.parts[0], input.parts[2]],
      }),
    ).toThrow(/saved attempts/);
    expect(() =>
      demoSeriesMutate("save", {
        ...input,
        parts: [input.parts[0], input.parts[2], input.parts[1]],
      }),
    ).toThrow(/saved attempts/);
    expect(() =>
      demoSeriesMutate("save", {
        ...input,
        parts: input.parts.map((part, index) =>
          index === 1
            ? {
                ...part,
                templateId: catalog[1].id,
              }
            : part,
        ),
      }),
    ).toThrow(/saved attempts/);
    input.parts[1] = {
      ...input.parts[1],
      title: "Try this again",
      prerequisitePartId: input.parts[0].id,
      prerequisiteReason: "Bring the first result.",
    };
    const saved = demoSeriesMutate("save", input);
    expect(saved.parts[1].title).toBe("Try this again");
    expect(saved.parts[1].attempted).toBe(true);
    expect(saved.parts[2].attempted).toBe(false);
    expect(saved.parts[1].quest).toEqual(part.quest);
    expect(saved.parts[1].templateVersion).toBe(part.templateVersion);
    expect(JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs).toEqual(
      data.runs,
    );
  });
  it("a video from a later private chapter exposes Series attribution only after that chapter is published", () => {
    const original = source();
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({ runs: [original] }),
    );
    const grown = demoSeriesMutate(
      "save",
      withNextSeriesPart(promote(original)).save,
    );
    const context: SeriesContext = {
      id: grown.id,
      title: grown.title,
      partId: grown.parts[1].id,
      partTitle: grown.parts[1].title,
      position: 2,
    };
    const runId = crypto.randomUUID();
    expect(demoPublicRunSeries(runId, context)).toBeUndefined();
    const firstPublished = demoSeriesMutate(
      "save",
      withPartPublished(grown, grown.parts[0].id),
    );
    expect(demoPublicRunSeries(runId, context)).toBeUndefined();
    const values = withPartPublished(firstPublished, context.partId);
    values.title = "A changed display title";
    demoSeriesMutate("save", values);
    // A visible post retains the attribution accepted with that attempt.
    expect(demoPublicRunSeries(runId, context)).toEqual(context);
    switchTo("viewer");
    expect(demoPublicRunSeries(runId, context)).toEqual(context);
    expect(
      demoSeriesDetail(grown.id).parts.every(
        (part) => part.attempted === false,
      ),
    ).toBe(true);
  });
  it("keeps a published planned story at its part count", () => {
    const original = source();
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({ runs: [original], wallet: { xp: 0, points: 0 } }),
    );
    const series = demoSeriesStartFromRun({
      runId: original.id,
      title: "Planned",
      premise: "A planned single-part story.",
      cover: "night",
      kind: "finite",
    });
    const published = demoSeriesMutate(
      "save",
      withPartPublished(series, series.parts[0].id),
    );
    expect(published.formatLocked).toBe(true);
    expect(nextSeriesPartBlocker(published)).toMatch(/planned story/);
    expect(() => withNextSeriesPart(published)).toThrow(/planned story/);
  });
});
