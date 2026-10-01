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

**Delivered October 1, 2026:** iPhone **1.0.0 (2)** is processed as `VALID` and assigned to **Sidequest Internal**, with `internalBuildState=IN_BETA_TESTING`. Open TestFlight → Sidequest Me → Update. This is an internal beta; physical-device validation and public App Store submission remain separate.

- Application commit: `652176178dbbec12034fc0dace30fedcf066600a` on `main`, pushed to `AaronPilk/side-quest-me`.
- [Production deployment](https://github.com/AaronPilk/side-quest-me/actions/runs/36900418478): succeeded, Worker version `a7b9962e-ca24-4bd7-977c-ee3aaba125f7`. Hosted Supabase has all 15 migrations.
- Signed archive: `.local/Sidequest-build2-ship.xcarchive`; distributed IPA: `.local/ios-production-export-build2-ship/App.ipa`. SHA-256: `88834515bdf63236fddc0551172f9e5d43369474ddf7574643834db6efee3e16`.
- Exported arm64 app: `com.aaronpilk.sidequest`, team `5F5C5G25Y6`, `get-task-allow=false`, `beta-reports-active=true`, production service configuration. Final production Simulator compilation also succeeded.
- Apple validation/upload completed without errors. Delivery/build ID: `c77a17d1-f9bb-4fab-ba40-a4357b0e3735`. English testing notes were saved from `docs/TESTFLIGHT_NOTES.md`; group assignment returned 204 and was verified through the build's beta state.

Post-deployment authenticated smoke tests passed all nine check groups using two temporary Supabase accounts: native-origin CORS/preflight, unauthenticated denial, OpenAI/Astra readiness, account-type intent without granting business approval, summary edit/removal and confirmed preferences, AI consent guards, source-linked private Series creation, stable Part 2 retry, author-only acceptance, viewer invisibility, and zero reward issuance. Both temporary Auth accounts were deleted and application data redacted afterward. No public content or paid AI requests were generated by this smoke run. Earlier live synthetic OpenAI quality evaluations are documented separately in `OPENAI_QUALITY_CHECK_2026-10-01.md`.

The full [GitHub Checks run](https://github.com/AaronPilk/side-quest-me/actions/runs/36900344859) also **succeeded** on the exact application commit: **575 unit tests, 164 browser scenarios**, configuration smoke checks, isolated PostgreSQL tests, typecheck, lint and production build. This includes the new regression added after the initial 163-scenario local run. Evidence is retained in ignored `.local/release2-*` logs and reports; `.local/release2-checks-ci.log` records the complete independent Linux run.
