# Quest idea library

Sidequest now has an editorial seed bank the app can draw on to propose **new**
quests, separate from the published catalog. It turns short real-life side
quest ideas into reviewable recipe drafts that are catalog-compatible before a
person reads them. Nothing in this pipeline changes `shared/catalog.ts`,
`supabase/seed.sql`, or any migration on its own.

## Pieces

| Path                                   | Role                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/quest-ideas.ts`                | The library: 116 ideas in Sidequest's own words, each tagged with the recommender's hard filters (category, intensity, settings, group size, minutes, cost, boundary conflicts) plus ranking tags, themes, concrete briefs, evidence, and a safety note. Also `filterQuestIdeas`, `generateQuestRecipe(s)`, `draftVariants`, `ideaCoverage`. |
| `shared/activity-recipes.ts`           | Now exports `ActivityRecipe` and `recipeVariants(recipe)`, the exact six-brief × three-intensity expansion the published catalog uses. Output is byte-identical to before the refactor (`node scripts/seed-catalog.mjs` produced the same `seed.sql`).                                                                                       |
| `scripts/generate-quest-ideas.mjs`     | CLI that prints drafts for constraints and a seed, with review notes and the 18 validated variants.                                                                                                                                                                                                                                          |
| `scripts/ingest-quest-ideas.mjs`       | CLI that turns any raw pool (`[{idea, source, sourceUrl, id?}]`) into `research/quest-ideas/candidates.json`: normalized, near-duplicates folded, coverage against the library, heuristic tags, and review flags.                                                                                                                            |
| `scripts/quest-ideas-lib.mjs`          | Pure helpers (`tokens`, `similarity`, `suggestTags`, `ingest`) shared by the CLIs and tests.                                                                                                                                                                                                                                                 |
| `research/quest-ideas/raw-pool.json`   | 369 raw ideas gathered on 2026-09-30 with per-item source attribution. Research provenance only; not shipped.                                                                                                                                                                                                                                |
| `research/quest-ideas/SOURCES.md`      | Which requested pages were reachable, which substitutes were used, and each source's framing of what makes a good side quest.                                                                                                                                                                                                                |
| `research/quest-ideas/candidates.json` | Latest ingest output (regenerate any time).                                                                                                                                                                                                                                                                                                  |
| `tests/quest-ideas.test.ts`            | 13 tests: schema validity, unique ids, tag vocabulary, boundary declaration, no family-id collisions, filter behavior, generator determinism, constraint honoring, 18 valid variants per idea, reviewer notes, brief composition, ingest dedupe/coverage/flags.                                                                              |

## Using it

```sh
# Three drafts for tonight's constraints, same seed → same drafts
node scripts/generate-quest-ideas.mjs --seed 2026-10-01 --category late_night --setting home --group friends --exclude alcohol

# Machine-readable, with all 18 variants per draft
node scripts/generate-quest-ideas.mjs --count 5 --json --variants > .local/drafts.json

# Library coverage by category and scope
node scripts/generate-quest-ideas.mjs --coverage

# Bring in a new source list (any JSON array of {idea, source, sourceUrl})
node scripts/ingest-quest-ideas.mjs path/to/new-pool.json
```

`generateQuestRecipes` applies the same hard rules as the recommender at the idea
level: category, intensity, setting, group, time, budget, and firm boundaries are
exclusions, never softened. By default only `moment` and `session` scope ideas
(under 90 minutes) become drafts, because the three-clip quest structure assumes
under an hour; `outing` and `expedition` ideas are kept for Series parts and
future formats and are called out in the draft's review notes.

## Idea shape

Each idea carries: `text` (the activity in one sentence), `evidence` (what a
finished attempt can honestly show), `category`, `intensity`, `scope`,
`settings`, `groups`, `minutes`, `cost` (minor units), `interests` (only tags
`shared/recommend.ts` scores), `themes`, `conflicts` (firm boundaries it would
cross), `briefs` (concrete assignments in the recipe "prompt" voice), `note`
(safety/permission), and `sources` (raw pool ids). The schema enforces that Date
Night ideas work for a couple, minutes fit the scope, and anything involving
strangers declares the `strangers` boundary.

## From draft to published quest

1. Generate drafts. Read every brief aloud; cut anything that quietly needs a
   purchase, booking, or a stranger unless the idea declares it.
2. Fix cost honestly. Generated variants declare $0 like every other recipe; an
   idea with a real cost either becomes a free version or gets hand-authored cost
   fields.
3. Paste the reviewed recipe into `shared/activity-recipes.ts` (it is already
   in `ActivityRecipe` shape; drop `ideaId` and `reviewNotes`).
4. Regenerate the seed and create a **new** migration for the new rows. Never
   edit a published template, historical seed row, or applied migration.
5. Update the counts pinned in `tests/activity-catalog.test.ts` and
   `docs/ACTIVITY_CATALOG.md`.

## Growing the library

The ingest report lists `new` candidates (not yet represented), `covered`
candidates (already in the library, by cited source id or by text overlap), and
`needs_review` candidates (flagged as habit tracking, products/platforms, or
things like tattoos and psychics that are not quests). Promote a candidate by
writing it in Sidequest's own words with real tags and a `sources` entry; the
raw text is never copied into the library.

Current coverage: 116 ideas — daytime 63, street challenges 16, date night 14,
late night 14, demon 9; by scope: moment 16, session 82, outing 17,
expedition 1. Demon and Date Night are the thinnest and the best next targets.

## What this is not

No language model, scraper, or event feed runs here. Auto-tags from the ingest
script are keyword heuristics for a human editor, not understanding. Drafts do
not enter recommendations, rewards, or the database until a person publishes
them through the normal versioned migration path.
