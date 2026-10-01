# Claude — Series rework: a series grows from a quest (2026-10-01)

Local only. Nothing was pushed, deployed, migrated on the hosted project, or
uploaded to TestFlight. This report accompanies `docs/CLAUDE_REVIEW_2026-10-01.md`
(the earlier review of Codex's uncommitted pass) and replaces the Series
description in `docs/SERIES_AI_MILESTONE_2026-10-01.md`.

## What the owner asked for

Codex built Series as something a person authors from scratch: Create → Start a
series, type a title, pick reviewed quests for each part. That is not the
product. The point of the app is to _generate_ the side-quest idea. A series
should work like Part 1 / Part 2 / Part 3 on TikTok or Instagram:

1. Use the quest feature to get an idea and accept it.
2. Do it, film it, publish it (or keep it private).
3. Later, go back to that quest and **turn it into a series**.
4. **Create Part 2** — the same quest, filmed again — and so on.

Nobody would come to this app to write a series by hand; they would do that on
Instagram or TikTok. So from-scratch authoring is gone, and every part of a
series is the same quest the series started from.

## What changed

### Product flow

- Accepting a quest never asks about a series. The "Just this quest / Start a
  series" choice before acceptance is removed (`QuestSeriesChoice` deleted).
- No authoring entries anywhere: Create's "Start a series" link, Discover →
  Series "Create a series", and the profile's "New series" are gone.
  `/series/new` with no quest explains "A series starts with a quest you did."
  and links to Create and the journal.
- **Turn into a series** (on the quest page or in the journal) is one screen:
  title and premise prefilled from the quest, a cover chosen from its category.
  Saving makes the finished quest Part 1 of a private series and lands on the
  series page with a one-time "Series saved privately" notice. Cancel leaves the
  quest untouched. No run, media, render, publication, reward or wallet record is
  rewritten.
- The series page offers **Create Part N**. It appends a private part for the
  same reviewed quest version and opens Create to accept it with the author's
  own outing; the attempt is stamped as that part. The quest page links back as
  **Open series · Create Part N+1** once an attempt is finalized.
- **Publish Part N** on the series page publishes a finished part. A growing
  story goes public with its first published part; later parts stay private
  until published one by one. A planned story publishes all parts through the
  editor and then keeps its part count ("Create Part N" is disabled with the
  reason shown).
- The editor still shapes the story (title, premise, cover, growing/planned,
  part titles, prerequisites, reordering of draft parts, include-when-published)
  but the reviewed-quest picker and **Add part** are removed. Part 1 keeps its
  locked source identity, and a part the author already filmed or is filming
  cannot be removed.

### Database (one new compatible migration)

`supabase/migrations/20261001173101_series_grow_from_quest.sql` replaces two
functions and rewrites no rows:

- `private.series_stamp_run` (acceptance trigger): the author may accept any
  part of their own series, published or not. Everyone else still needs a
  published part of a published series. A privacy-redacted part is refused.
- `public.sq_series_read` detail/part views: `available` is true for the owner's
  own unpublished parts (so the owner's "current part" and `canStart` point at
  the part they should film next); `unavailableReason` says "still a draft" only
  for non-authors. Non-authors still cannot read a draft series at all.

Apply after `20261001173049_link_existing_run_to_series.sql` and before the
Worker that uses it; without it the Worker's "Create Part N" acceptance is
refused with `series_unavailable`. Doing the same quest again inside its family
cooldown earns no second award, and the run reports `family_cooldown` honestly.

### Code

- `shared/series.ts`: `deriveSeriesProgress` picks the current part from
  _available_ parts (owner's unpublished next part included, matching SQL);
  new `seriesSaveFromDetail`, `nextSeriesPartBlocker`, `withNextSeriesPart`,
  `withPartPublished`, `SERIES_MAX_PARTS`.
- `src/lib/demo-series.ts`: owner availability mirrors the SQL rule.
- `src/pages/Series.tsx`: library/profile without authoring entries; series
  view with Create Part N / Film Part N / Publish Part N and the saved notice;
  one-screen setup from a run; editor without picker/Add part and with the
  filmed-part removal guard.
- `src/pages/Quest.tsx`, `src/components/QuestWizard.tsx`: choice and link
  removed. `src/pages/ActiveQuest.tsx`: new linked-run copy; dead notice removed.
- Docs: `docs/CREATOR_SERIES.md`, `docs/SERIES_AI_MILESTONE_2026-10-01.md`
  (Series section), `docs/AI_SETUP.md` (migration order).

### Tests

- Unit: `tests/series.test.ts` + "A series grows by doing its quest again"
  (3 tests). 548 pass; the single failure (`native-share` 1 MiB chunk, 5 s
  timeout) also fails on the untouched baseline in this container.
- Database: `tests/database/series-growth-invariants.mjs` (registered in
  `series-invariants.mjs`): author finalizes Part 1, starts the series, adds
  Part 2 (same template, unpublished) → available for the author, `canStart`;
  viewer detail/part/accept all `series_unavailable`; author's acceptance is
  stamped position 2 with `family_cooldown`; Part 1 row byte-identical; series
  still draft and absent from the public list. Full isolated suite passes with
  all 15 migrations.
- Browser: new `tests/series-growth-browser.spec.ts` (+ helpers) covers the
  owner's exact flow end to end, including viewer isolation and part-by-part
  publication. Every Codex Series spec that encoded from-scratch authoring was
  rewritten to build series through the growth flow instead
  (`quest-series-flow`, `series`, `series-completion` with real import +
  render + publication + episode navigation, `series-editor-layout`,
  `series-layout`, `series-native-layout`, `series-identity`,
  `profile-layout`, and the two Series tests in `business-audit`; the
  `chooseSeriesQuest` helper is gone). 41/41 pass. Note: the business-audit
  "Series search keeps selections" test was already stale against Codex's own
  picker before this work.

## Verification on the final tree

| Check                                          | Result                                                                                                                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                            | exit 0                                                                                                                                                                                                                                              |
| `npm run lint`                                 | exit 0                                                                                                                                                                                                                                              |
| `npm test`                                     | 52 files, 548 passed, 1 environmental (see above)                                                                                                                                                                                                   |
| `npm run build`                                | ok                                                                                                                                                                                                                                                  |
| `scripts/db-test.mjs` (isolated PostgreSQL 16) | PASS, 15 migrations, growth invariants included                                                                                                                                                                                                     |
| Series/profile/business browser specs (41)     | 41 passed                                                                                                                                                                                                                                           |
| Full `npx playwright test` (161 scenarios)     | 159 passed, 2 failed — neither Series: `social-browser` sign-out passes 2/2 in isolation (load flake); `browser.spec` synthetic two-take recording fails identically on the untouched baseline in this container (compose > 15 s), so environmental |

Not verified here: the iPhone Simulator (the installed build predates this
tree) and the hosted database (no migration applied).

## Release blockers before another TestFlight / production step

1. Rebuild and walk the Simulator on this tree: `npm run ios:simulator -- --demo`,
   then accept a quest → Turn into a series → Create Part 2 → Publish Part 1 →
   switch persona and confirm the draft series is invisible.
2. `npm run test:db:advisors` on the Mac (15 migrations).
3. Apply `20261001173049` then `20261001173101` to the hosted project before
   deploying the Worker (and the account-intent migration before both).
4. Everything in `docs/CLAUDE_REVIEW_2026-10-01.md` still stands (physical
   device checks, AI rollout decision, public-release requirements).

## Open product questions (not blocking)

- Should a part the author filmed privately but never published be deletable
  with its video, or only hidden? Today the editor refuses to remove it.
- A growing series currently has no cap on how often the same quest can be
  repeated; the 30-day family cooldown only withholds the award. If repeats
  should earn something, that is a rewards policy decision, not a Series one.
