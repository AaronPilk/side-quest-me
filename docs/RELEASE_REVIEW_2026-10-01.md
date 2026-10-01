# Series release review — October 1, 2026

Release requested: review Claude’s Series rework and deliver the updated iPhone app through internal TestFlight. The existing production Supabase project and Cloudflare Worker remain the release targets.

## Findings fixed before release

- **Create Part 2 retry:** a lost successful response could reuse the idempotency key with a newly generated part ID. The complete pending request is now retained so retry returns the original part. The regression failed before the fix and passed afterward.
- **Accepted part identity:** private parts referenced by accepted or abandoned runs could be removed, reordered or changed through the Series save RPC. The database now freezes identity, order, quest version and content, while allowing safe private text/prerequisite edits. Acceptance/removal concurrency is covered. The owner-only attempted flag keeps older history protected beyond the recent-run list.
- **Quest version drift:** new source-linked parts could silently load a newer quest revision. Growth now preserves exact source quest/version/content and rejects a changed or withdrawn source version.
- **Private attribution:** publishing a video from an unpublished Part 2 could reveal its private Series title. Public attribution now requires both the Series and exact part to be published and unredacted, with an active author. The accepted private run retains its frozen context.

The obsolete parked QuestSeriesChoice component and stylesheet were removed. Account intent, preferences wizard, Discover/Profile changes and the OpenAI integration were preserved. Sign in with Apple is a separate future milestone, not included in this release.

## Verification

The complete baseline browser suite passed 163/163 on this Mac. The baseline unit suite passed 572/572; the previously reported native-share timeout and two browser failures did not reproduce. Final unit suite: 575/575 across 54 files; typecheck, lint and build passed. All 24 focused Series/business browser cases passed, followed by the final affected accepted-history case after the last button guard. Full isolated database tests and local security advisors passed with all 15 migrations, then passed again after aligning migration filenames with the hosted ledger. Hosted advisors reported no SQL security errors: the existing service-only tables retain default-deny RLS INFO entries, and Auth reports the existing leaked-password-protection warning.

The rebuilt iPhone 17 / iOS 26.4 Simulator was manually exercised through the six-question Create flow, matching recommendations, quest acceptance, full-screen camera, native Photos import of the existing synthetic 15-second clip, save as one video, Turn into a series, the prefilled conversion form, and the private Series with original video/progress retained. This was local demo data, not a claim of real camera hardware coverage. The broader render/publish/episode-navigation path is covered by automated integration scenarios; physical-device TestFlight validation remains necessary.

## Deployment order

The compatible migrations were applied successfully before the Worker in the following order. Local filenames were aligned with the migration versions assigned by hosted Supabase (the original draft filenames were 20260930214710, 20261001132300 and 20261001190000 respectively; SQL contents are unchanged):

1. 20261001173038_account_type_intent.sql
2. 20261001173049_link_existing_run_to_series.sql
3. 20261001173101_series_grow_from_quest.sql

OpenAI configuration is server-only: OPENAI_API_KEY as a Worker secret, AI_QUEST_PROVIDER=openai and AI_QUEST_MODEL=gpt-6-astra in the production environment. Normal recommendations remain deterministic; AI drafting and filming help require explicit in-app consent. Original generated drafts still need review before becoming runnable recommendations.

## Delivery status

Release checks and delivery are in progress. Do not treat the signed archive alone as TestFlight availability.
