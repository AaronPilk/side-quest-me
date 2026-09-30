# Audit verification and continuation — 2026-09-30 (Claude)

This records what was actually run against the **final working tree** after the
three interrupted audits (`audit-consumer.md`, `audit-capture.md`,
`audit-business.md`) and the handoff. Nothing here was committed, pushed,
migrated, or deployed. The tenth migration remains local and unapplied.

## Environment

Verification ran in an isolated Linux container on a byte-identical snapshot of
the Mac working tree (every tracked and untracked source file matched the
handoff manifest SHA-256 before work began). Node 22.22, FFmpeg, Chromium via
Playwright 1.63 (`npx playwright install chromium`), Vite demo on 5173 and the
local renderer on 8789 in dedicated background processes, one Playwright
invocation at a time, each with its own `--output` directory.

Not runnable in that container: `npm run test:db` / `test:db:advisors` (initdb
refuses to run as root; no Supabase CLI). The isolated DB checks are still the
Mac's job; the handoff recorded them passing with all ten migrations.

## Results on the final tree

| Check                                              | Result                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                | exit 0                                                                                                            |
| `npm run lint`                                     | exit 0                                                                                                            |
| `npm test`                                         | 27 files, **301 tests passed** (was 282; +5 share-link Worker tests, +1 return-path test, +13 idea library tests) |
| `npm run build`                                    | production build succeeded                                                                                        |
| `node scripts/config-smoke.mjs`                    | 3 PASS                                                                                                            |
| `npm run render:fixtures`                          | synthetic media generated and verified                                                                            |
| `git diff --check`                                 | clean                                                                                                             |
| `node scripts/seed-catalog.mjs`                    | `supabase/seed.sql` byte-identical after the `recipeVariants` refactor                                            |
| Full `npx playwright test`                         | 77 passed, 6 failed, 2 skipped **before** fixtures existed                                                        |
| Rerun of those 6 + the 2 skipped **with** fixtures | 8 passed                                                                                                          |
| Net browser state                                  | **85 scenarios passing, 0 failing, 0 skipped** across the runs above                                              |

## The five documented failures, resolved

1. **Search empty state** (`discovery-audit-browser.spec.ts:38`): passes with
   stable servers. It was a contention artifact of concurrent Playwright
   invocations, not a product defect. No code change.
2. **Activity fixture null** (`:144`): test bug. Demo reads deliberately never
   write `sidequest-community-demo-v1`; the test now seeds the store through a
   real mutation (a feed follow) before editing the activity list.
3. **Mocked auth error not shown** (`:185`): test bug. React StrictMode
   double-invokes the mount effect in development, so the mock's "fail once"
   counter was consumed by the discarded first run. The mock now fails while a
   window flag is set and the test clears it before Retry. The same pattern was
   fixed in the journal load-error test in `media-actions-browser.spec.ts`.
   Production (no StrictMode double-invoke) already behaved correctly.
4. **Public playback while viewer read pending** (`reel-identity-browser.spec.ts:153`):
   reproduced with stable servers, so it was real — but the app is right and the
   test encoded the old contract. The audit gated the reel's account read on a
   signed-in session, so anonymous viewers no longer fire a pointless 401, and
   `useCommunity` returns `undefined` when disabled so owner controls drop
   immediately. The test now asserts exactly that: no anonymous `/api/community/me`
   request, owner controls gone, public caption still visible.
5. **Onboarding `/create` vs `/`** (`profile-browser.spec.ts:32`, `:70`): real
   contract drift. The audit's return-path change remembered any protected
   route, including `/`, so finishing onboarding from the root landed on `/`.
   Decision: `/create` is the canonical Create URL. `validateReturnTo` now maps
   `/` to `/create` while keeping query and hash, so selected-template,
   inspiration and Series return paths are untouched. Unit test added; both
   profile tests pass.

## Other verification the audits left open

- **Share-link listing endpoint**: new `tests/share-links-worker.test.ts` proves
  anonymous denial, cross-owner 404 with no listing query, malformed-id 404
  with no lookup, owner-scoped query (`run_id`, `owner_id`, `revoked_at is null`,
  `expires_at >` now, newest first), DTO stripping of any extra columns such as
  `token_hash`/`object_key`, and DB failure → `operation_failed`, never an empty
  list. Hosted browser fixtures now serve `/api/quest-runs/:id/share-links`, and
  a new browser test checks a link from an earlier session is listed after
  refresh, shows no URL, revokes (fail then succeed), and disappears.
- **Media-actions hosted fixture** omitted `roles`/`userId` from
  `/api/community/me`, which crashed the shell (the app relies on the typed
  contract the Worker always sends). Fixture fixed; the three never-run tests
  (public link lifecycle, abandon retry, journal filters) now pass.
- **Business (5), capture-drafts (3), consumer (14), discovery (6) suites**: all
  pass together in single sequential invocations.
- **Real media path**: three real uploads → render → MP4 download → journal, and
  the licensing flow's commercial download, pass with generated fixtures.

## Not verified here

Physical iPhone/Android camera, Safari, OS share sheets, real Supabase sign-in,
the tenth migration against the hosted project, live rendering on the
Cloudflare Container, 200% text/reduced-motion/keyboard passes beyond the
existing responsive tests, and Discover header density on 390px (the handoff's
polish note is still open).

## New in this pass: quest idea library

See `docs/QUEST_IDEAS.md`. Summary: a tagged 116-idea library
(`shared/quest-ideas.ts`), a deterministic generator that composes ideas into
`ActivityRecipe` drafts and expands them with the exact published
`recipeVariants` builder, an ingest CLI for new sources with dedupe and coverage,
and the raw 369-idea research pool with attribution. Drafts never enter the
catalog without a person and a new migration.

## Release path from here

1. On the Mac: `npm run test:db:advisors` (still required; not runnable in the
   container).
2. Commit this tree, push, wait for the full Checks workflow.
3. Apply `20260930182548_social_discovery_following_search.sql` to the selected
   Supabase project deliberately (inspect remote history, dry run first).
4. `gh workflow run deploy.yml --repo AaronPilk/side-quest-me --ref main -f environment=production`, then verify Following/search and the share-link list live with a controlled test identity.
