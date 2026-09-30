# Authored activity catalog

The local catalog contains **1,113 published quest variants across 73 reward
families**: the original 33 variants plus 1,080 new activity variants. The new
content consists of **60 authored activity recipes, six concrete task briefs per
recipe, and three intensity treatments per brief**. These are 360 task briefs
with intensity variations, not 1,080 independently sourced events, listings, or
venues. No event inventory or venue availability is invented.

`shared/activity-recipes.ts` is the editorial source. It covers photo duets,
postcards, drawing, tiny games, sound design, local observation, puzzles, comics,
stop motion, original music, and absurd performances. Every current brief has a concrete action, observable result, opening hook and activity-specific filming guidance. An ending may return to an opening object when that genuinely fits the activity; a visual loop is optional. The six briefs change the activity's actual creative
assignment. Their descriptive titles expose that difference in discovery.

Intensity changes the deliverable: Chill makes one attempt (25 minutes), Bold
compares two versions (40 minutes), and Full Send expands the challenge to a complete comparison or sequence (55 minutes). The Three-Stop Date instead gives each partner a real stop to lead and a shared final stop; its time and participant filters remain authoritative. Full Send does not imply extra people, a purchased
experience, dangerous behavior, or an advance booking. All new variants use
supplies already owned. Outdoor tasks can stay inside one small accessible
area; speed and distance are not scored. Quiet venue-compatible tasks require a
free-access place where the activity and personal filming are allowed.

Budget, time, group size, setting, intensity, and profile boundaries remain hard
filters. Confirmed interests, skills, participation style, and preparation
preferences still rank eligible results. Unknown profile answers add no fit
claims. Existing charges and travel costs in an outing still count toward its
budget even though the new activity itself requires no purchase.

The recommendation tiebreak rotates eligible briefs within a new activity family
using the supplied UTC date. Results remain deterministic within a day; the
rotation does not change a preference score or bypass eligibility. One result per
family prevents the same recipe filling all three recommendation slots.

**More quest ideas** loads another page of three eligible families while keeping
exactly the same outing answers and preference filters. It does not downgrade
intensity, change the group, or repeat a family already shown in that sequence.
The default recommendation call still returns the same deterministic first three;
additional pages use the explicit offset after family deduplication. Changing the
plan starts a new recommendation sequence.

The Worker loads published templates through `worker/catalog.ts` with stable
ID-based pages of at most 500 records. Category, intensity, and an optional exact
template ID are applied to every applicable page. This avoids Supabase's default
1,000-row response truncation; entries beyond the first 1,000 remain available
for eligibility and ranking. Invalid or failed pages produce an error instead
of silently presenting incomplete inventory.

## Identity, immutable history, and installation

The original 33 seed rows and 1,080 activity v1 rows are byte-identical to the prior seed. The current catalog uses 1,080 additive v2 activity rows, while v1 publication flags are retired. There are 2,193 stored rows and 1,113 current published choices. New recipes use
`activity_…` family IDs, and each brief has a `variantKey` such as `alpha` or
`bravo`. A recipe shares the same family across every brief and intensity, so its
30-day reward cooldown cannot be bypassed by selecting another prompt.

The compatible migration adds `quest_templates.variant_key` with a `default`
value for historical rows and changes the uniqueness key to
`(family_id, intensity, variant_key, version)`. A database constraint requires the
column to agree with the optional `content.variantKey`. Published content and
accepted snapshots remain immutable. Editorial revisions still require new
version numbers and IDs; separate briefs do not misuse revision numbers.

Apply `supabase/migrations/20260930160717_expanded_activity_catalog.sql` to the
explicitly selected database before deploying code that depends on the expansion.
It contains the schema change and all 1,080 original activity rows. Then apply `20260930203052_activity_instructions_v2.sql`, which inserts reviewed v2 instructions and retires only the exact superseded v1 IDs. Neither migration rewrites content or accepted run snapshots. `supabase/seed.sql` is also
idempotent for fresh environments. Neither creates balances, sponsors, offers,
or users. The public template RLS policy and browser grants remain unchanged.

To regenerate the local seed:

```sh
node scripts/seed-catalog.mjs
```

The v1 migration is frozen. While the new v2 migration remains local and unpublished, its generated data may be rebuilt with:

```sh
node scripts/seed-catalog.mjs --activity-revision-migration supabase/migrations/20260930203052_activity_instructions_v2.sql
```

Do not rewrite an applied migration or published template version. Future
editorial additions should receive a new CLI-created additive migration.

## Regression coverage

`tests/activity-catalog.test.ts` checks counts, unique briefs, full schema
compatibility, historical row hashes, append-only seed contents, daily rotation,
shared cooldowns, distinct-family recommendation pages, truthful fit explanations, confirmed-interest ranking, and the
reported two-person outdoor Full Send plan at free and $100 budgets with
1-hour/3-hour/5-hour/unlimited time limits. The matrix covers all five scenes,
three intensities, and multiple group sizes outdoors, plus solo/home choices.

`tests/database/activity-catalog-invariants.mjs` replays the migration and seed in
an isolated PostgreSQL database, verifies 1,113 current choices plus 1,080 archived v1 rows, checks unchanged
historical content and RLS, and rejects duplicate editions, mismatched variant
keys, and attempts to mutate a published key. Full existing database transaction,
reward, rendering, social, and Series invariants also run against the expanded
seed.

`tests/catalog-pagination.test.ts` checks complete loading beyond 1,000 records
and filter consistency across every backend page. Browser coverage checks that
**More quest ideas** exposes additional matching families without changing the
selected outing.

## Revised instructions and historical links

Current discovery names the activity before its brief. The old bare title “The first time you laughed together” is replaced by The Three-Stop Date for new attempts: choose three actual free stops in a familiar area, let each partner lead one, and choose a favorite. The twelve Date Night families have authored opening, activity and reveal shots. Other families describe their actual activity and observable result instead of asking users to manufacture an abstract prompt or reaction.

Known archived activity links still read their original content. The page offers an explicit updated-quest action; it does not rewrite an existing post, accepted run, or its inspiration/Series attribution. Arbitrary unpublished creator drafts do not become public through this archive allow-list.

Personal milestones are counted from finalized, accepted completion outcomes (including reward cooldown/daily-cap completions), excluding rejected, closed and pending reviews. Crowns begin at five completed quests, then 25 and 100. They are personal milestones, not global rankings or additional currency.
