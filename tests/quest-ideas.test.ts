import { describe, expect, it } from "vitest";
import { activityRecipes } from "../shared/activity-recipes";
import { catalog } from "../shared/catalog";
import { questVariantSchema, DEFAULT_PREFERENCES } from "../shared/domain";
import {
  BRIEF_TWISTS,
  IDEA_INTEREST_TAGS,
  composeBriefs,
  cutAtWord,
  draftVariants,
  filterQuestIdeas,
  generateQuestRecipe,
  generateQuestRecipes,
  ideaCoverage,
  questIdeaSchema,
  questIdeas,
} from "../shared/quest-ideas";
import {
  ingest,
  similarity,
  suggestTags,
} from "../scripts/quest-ideas-lib.mjs";

describe("idea library integrity", () => {
  it("validates every idea, with unique ids and briefs, and covers every category", () => {
    expect(questIdeas.length).toBeGreaterThanOrEqual(100);
    expect(new Set(questIdeas.map((idea) => idea.id)).size).toBe(
      questIdeas.length,
    );
    for (const idea of questIdeas) {
      expect(() => questIdeaSchema.parse(idea)).not.toThrow();
      expect(new Set(idea.briefs).size).toBe(idea.briefs.length);
      expect(idea.text).not.toMatch(/\bmagic bullet|viral|guarantee/i);
    }
    const coverage = ideaCoverage();
    for (const count of Object.values(coverage.byCategory))
      expect(count).toBeGreaterThanOrEqual(8);
    expect(coverage.byScope.moment + coverage.byScope.session).toBeGreaterThan(
      coverage.total / 2,
    );
  });

  it("only uses ranking tags the recommender can score", () => {
    const preferenceVocabulary = new Set<string>([
      ...(DEFAULT_PREFERENCES.interests ?? []),
      "sports",
      "music",
      "comedy",
      "cooking",
      "making",
      "games",
      "local_knowledge",
      "fan_club",
      "open_mic",
      "secret_expert",
      "mystery_date",
      "meal_challenge",
      "spontaneous",
      "friendly_awkward",
      "elaborate_setups",
      "skill_reveals",
      "competitive",
      "absurd",
      "surprises",
    ]);
    for (const tag of IDEA_INTEREST_TAGS)
      expect(preferenceVocabulary.has(tag)).toBe(true);
  });

  it("declares the strangers boundary on every idea that involves strangers", () => {
    for (const idea of questIdeas)
      if (idea.themes.includes("strangers"))
        expect(idea.conflicts).toContain("strangers");
  });

  it("never collides with a published recipe family", () => {
    const published = new Set(catalog.map((quest) => quest.familyId));
    for (const idea of questIdeas)
      expect(published.has(`activity_idea_${idea.id}`)).toBe(false);
    expect(
      activityRecipes.some((recipe) => recipe.id.startsWith("idea_")),
    ).toBe(false);
  });
});

describe("idea filtering mirrors hard filters", () => {
  it("applies boundaries, budget, time, group, setting and category as exclusions", () => {
    const strangers = filterQuestIdeas({ exclusions: ["strangers"] });
    expect(
      strangers.every((idea) => !idea.conflicts.includes("strangers")),
    ).toBe(true);
    expect(strangers.length).toBeLessThan(questIdeas.length);
    const free = filterQuestIdeas({ budgetMinor: 0 });
    expect(free.every((idea) => idea.cost.minMinor === 0)).toBe(true);
    const quick = filterQuestIdeas({ maxMinutes: 15 });
    expect(quick.every((idea) => idea.minutes <= 15)).toBe(true);
    const solo = filterQuestIdeas({ group: "solo", category: "date_night" });
    expect(solo.every((idea) => idea.groups.includes("solo"))).toBe(true);
    const home = filterQuestIdeas({ setting: "home", intensity: "full_send" });
    expect(
      home.every(
        (idea) =>
          idea.settings.includes("home") && idea.intensity === "full_send",
      ),
    ).toBe(true);
    expect(filterQuestIdeas({ themes: ["night"] }).length).toBeGreaterThan(3);
  });

  it("returns nothing rather than bending a constraint", () => {
    expect(
      filterQuestIdeas({ category: "demon", budgetMinor: 0, maxMinutes: 5 }),
    ).toEqual([]);
  });
});

describe("recipe generation", () => {
  it("is deterministic for a seed and changes with the seed", () => {
    const a = generateQuestRecipes({ seed: "2026-10-01", count: 4 });
    const b = generateQuestRecipes({ seed: "2026-10-01", count: 4 });
    const c = generateQuestRecipes({ seed: "2026-10-02", count: 4 });
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id));
    expect(a.map((d) => d.prompts)).toEqual(b.map((d) => d.prompts));
    expect(a.map((d) => d.id)).not.toEqual(c.map((d) => d.id));
    expect(new Set(a.map((d) => d.id)).size).toBe(4);
  });

  it("honors constraints and only drafts quest-length ideas by default", () => {
    const drafts = generateQuestRecipes({
      seed: "test",
      count: 10,
      category: "street_challenges",
      exclusions: ["public_performance"],
    });
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(draft.category).toBe("street_challenges");
      expect(draft.conflicts).not.toContain("public_performance");
      const idea = questIdeas.find((item) => item.id === draft.ideaId)!;
      expect(["moment", "session"]).toContain(idea.scope);
    }
  });

  it("expands every draft into 18 schema-valid variants with unique ids and titles", () => {
    for (const idea of questIdeas) {
      const draft = generateQuestRecipe(idea, "all");
      const variants = draftVariants(draft);
      expect(variants).toHaveLength(18);
      expect(new Set(variants.map((v) => v.id)).size).toBe(18);
      expect(new Set(variants.map((v) => v.title)).size).toBe(6);
      for (const variant of variants) {
        expect(() => questVariantSchema.parse(variant)).not.toThrow();
        expect(variant.familyId).toBe(`activity_idea_${idea.id}`);
        expect(variant.conflicts).toEqual(idea.conflicts);
        expect(variant.beats[1].action).toContain(idea.text);
      }
    }
  });

  it("surfaces cost, scope and safety notes for the reviewer instead of hiding them", () => {
    const paid = questIdeas.find((idea) => idea.cost.maxMinor > 0)!;
    const long = questIdeas.find((idea) => idea.scope === "outing")!;
    const risky = questIdeas.find((idea) => idea.note)!;
    expect(generateQuestRecipe(paid).reviewNotes.join(" ")).toMatch(/can cost/);
    expect(generateQuestRecipe(long).reviewNotes.join(" ")).toMatch(
      /outing-scale/,
    );
    expect(generateQuestRecipe(risky).reviewNotes.join(" ")).toContain(
      risky.note,
    );
  });

  it("fills briefs from the idea first and never repeats or overruns a title", () => {
    const idea = questIdeas.find((item) => item.briefs.length === 3)!;
    const briefs = composeBriefs(idea, () => 0.5);
    expect(briefs.slice(0, 3)).toEqual(idea.briefs);
    expect(new Set(briefs).size).toBe(6);
    for (const brief of briefs) expect(brief.length).toBeLessThanOrEqual(100);
    expect(BRIEF_TWISTS.some((twist) => briefs[3].endsWith(twist))).toBe(true);
    expect(
      cutAtWord("Host a skill swap where everyone teaches one thing for", 50),
    ).toBe("Host a skill swap where everyone teaches one thing");
  });
});

describe("raw idea ingestion", () => {
  it("folds near-duplicates, marks covered ideas, and flags habits and products", () => {
    const pool = [
      { id: "oms-22", idea: "Photograph ten really cool doors." },
      { id: "a-2", idea: "Photograph ten cool doors!" },
      { id: "b-1", idea: "Drink 8 glasses of water a day for a week." },
      { id: "c-1", idea: "Try a monthly subscription box for curiosity." },
      { id: "d-1", idea: "Take a pottery wheel class at a walk-in studio." },
      {
        id: "e-1",
        idea: "Ask a stranger for directions to a landmark you can both see.",
      },
    ];
    const result = ingest(pool, questIdeas);
    expect(result.summary).toMatchObject({ raw: 6, unique: 5, duplicates: 1 });
    const byId = Object.fromEntries(result.candidates.map((c) => [c.id, c]));
    // Provenance beats fuzzy matching: an idea that cites this raw id covers it.
    expect(byId["oms-22"].status).toBe("covered");
    expect(byId["oms-22"].covered).toBe("ten_doors");
    expect(byId["oms-22"].alsoFrom).toEqual(["a-2"]);
    expect(byId["b-1"].status).toBe("needs_review");
    expect(byId["b-1"].suggested.flags).toContain("habit_not_quest");
    expect(byId["c-1"].suggested.flags).toContain("product_or_platform");
    expect(byId["d-1"].status).toBe("new");
    expect(byId["d-1"].suggested.settings).toContain("venue");
    expect(byId["e-1"].suggested.category).toBe("street_challenges");
    expect(byId["e-1"].suggested.conflicts).toContain("strangers");
  });

  it("scores similarity symmetrically and ignores stop words", () => {
    expect(
      similarity("Photograph ten doors", "ten doors photographed"),
    ).toBeGreaterThan(0.6);
    expect(similarity("a b c", "the of and")).toBe(0);
    expect(
      suggestTags("Cook a three-course meal from scratch").themes,
    ).toContain("food");
  });
});
