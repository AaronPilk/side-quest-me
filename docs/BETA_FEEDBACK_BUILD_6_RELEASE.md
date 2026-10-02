# Build 6 beta feedback follow-up — 2026-10-02

**Build 1.0.0 (6) is available in Sidequest Internal**, verified as **VALID** and
**IN_BETA_TESTING** at `2026-10-02T15:01:00Z`. Source `c416fcd` is deployed and
the signed iPhone build's English notes were read back exactly. Open
TestFlight → Sidequest Me → Update.
No database migration is required for build 6. Full GitHub checks pass: **686 unit tests and 214 browser tests**, plus database checks, lint, typecheck and build.

## Release record

| Item                                | Evidence                                                                                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                              | `c416fcd15168e55110a881c08142c95ecf5283f9`, pushed to `main`                                                                                                                                                                        |
| Production deployment               | [37023079638](https://github.com/AaronPilk/side-quest-me/actions/runs/37023079638), successful; Worker version `5f1cb462-b93e-44d8-812b-87aec2098c01`                                                                               |
| Database                            | Existing 21 migrations; no build-6 schema change                                                                                                                                                                                    |
| Archive and IPA                     | `.local/Sidequest-build6-delivery.xcarchive`, `.local/ios-production-export-build6-delivery/App.ipa`                                                                                                                                |
| Packaged app                        | Production service guard passed; arm64, version 1.0.0 / build 6; exported `get-task-allow=false`, `beta-reports-active=true`                                                                                                        |
| Apple validation                    | No errors; `.local/beta6-apple-validation.log`                                                                                                                                                                                      |
| Apple upload                        | Accepted without errors at 10:56:37 EDT, October 2; delivery UUID `af06e767-8c0d-47ec-b697-f8d822415a12`; `.local/beta6-apple-upload.log`                                                                                           |
| Production smoke                    | Passed: two real OpenAI generations, distinct reroll title, exact request replays, owner isolation, required preflight, immutable zero-award acceptance and cleanup; `.local/beta6-production-smoke-report.json`                    |
| Apple processing and internal group | Build ID `af06e767-8c0d-47ec-b697-f8d822415a12`, VALID / IN_BETA_TESTING; Sidequest Internal `f10a5d96-4a4a-4b23-862c-1f33802a4397`; `.local/beta6-delivery-verification.json`                                                      |
| Full GitHub checks                  | [37022868847](https://github.com/AaronPilk/side-quest-me/actions/runs/37022868847), successful: 686 unit tests / 61 files, 214 browser tests (14.1 minutes), database suite, lint/typecheck/build; `.local/beta6-github-checks.log` |

## Changes

- The native results screen reduces the gap between the brand header and quest
  results from 54px to 12px. **Edit plans** is a compact pill and restores the
  existing outing answers. The spacing change applies to results, including the
  no-results state.
- Normal **Find my quests** generation now uses two provider calls: one structured
  comparison of three scored concepts plus the complete selected proposal, followed
  by independent quality review. The overall deadline remains 90 seconds, with a
  60-second proposal cap and 30-second review cap. Existing quality thresholds and
  hard constraints are unchanged; there is no automatic paid full-generation retry.
- The generated schema fixes the chosen category, intensity, group, participant
  range and setting, and caps activity time by the time available after travel.
  The selected concept must exist and be feasible and strong enough to pass the
  existing checks.
- **Find another experience** includes up to five previous owner-bound proposal
  IDs. The server rejects invalid or other-owner history before generation and
  shares only concise previous-experience summaries with the model. Exact prior
  titles are rejected; independent review checks for renamed repeats. A fitting
  curated fallback skips exact prior titles when alternatives exist.
- A transport retry preserves the exact request and idempotency key. A deliberate
  reroll uses a new key; changing the outing clears its history. The optional history
  field preserves older clients' request/hash shape and uses existing storage.
- Provider incomplete/truncated responses and generation failures receive safe,
  fixed diagnostic classifications. Logs do not include raw provider text, prompts,
  location data, account data or credentials.

Generated experiences retain build 5's private, runnable and filmable flow. They
award zero XP/points, require relevant quote/booking/permission checks before
acceptance, and can be explicitly published as stories or continued by their owner
as series. A curated fallback remains honestly labeled. Listings do not establish
live availability, prices or permission; no live event inventory was added.

## Evidence and limits

The reported build-5 reroll showed a curated escape-room fallback after an earlier
successful generation. The exact cause of that request is unknown: historical
production logs were inaccessible. The old three-call flow could leave too little
of its 90-second budget for review; that source-level risk is addressed by combining
comparison and proposal. This does not establish that time starvation caused the
specific screenshot failure.

| Check                                              | Result                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Unit tests                                         | 686 passing across 61 files                                                                            |
| Focused discovery and native-layout browser checks | 13 passing locally; full GitHub browser suite 214/214 passing                                          |
| Typecheck and full lint                            | Passing                                                                                                |
| Production build, iOS sync and release guard       | Passing                                                                                                |
| Native Simulator walkthrough                       | Edit plans pill verified; all six answers restored; existing active quest card preserved               |
| Bounded live synthetic reroll                      | Approved in 64.8 seconds; details below                                                                |
| Production deployment and smoke                    | Passed with live OpenAI; first generation 56.6 seconds, reroll 55.6 seconds; exact replays and cleanup |
| TestFlight upload, processing and tester delivery  | No validation/upload errors; VALID and IN_BETA_TESTING with exact English-note readback                |

Browser fixtures verify integration and layout behavior; they are separate from
the native Simulator result and the real-provider synthetic check.

The single live test used **Late Night / Full Send / five friends**, a **$300 total
budget**, **180 minutes** with **15 minutes and $10 reserved for travel**, and no
named place. Its previous experience was an operator-run escape room. Two real
provider calls produced **Five-Driver Karting Championship** in **64.8 seconds**:
56.5 seconds for comparison/proposal and 8.1 seconds for review. Independent review
approved the 150-minute activity with no blocking findings. The plan required an
operator's booking, rules and actual all-in group quote of at most $290; it did not
claim a venue, reservation, current price or available session. The test used only
synthetic inputs and made no real account or public-content changes. One approved
example is not a guarantee of quality or variety on every reroll.

## Production and signed-build verification

The authenticated production smoke used two marked disposable accounts. The
synthetic plan was Demon / Full Send / four friends / $300 total / unlimited time /
venue, with no named listing. The first model experience took **56.6 seconds** and
the history-aware reroll **55.6 seconds**; both used **OpenAI / GPT-6 Astra**, with
no curated fallback. The reroll returned a different title, preserved the exact
intensity and four participants, and replayed its completed result. Two logical
requests and two replays left exactly two proposals; another account could not use
the owner's history. The test also passed private-owner acceptance checks,
activity-specific pending quotes/arrangements, immutable zero-award snapshots and
cleanup. It created no media, completed quest or public story. These successful
examples do not establish that every future generation will pass review.

The iPhone 17 Simulator on iOS 26.4 showed the actual pill, returned to the plan
review and retained Date Night / Chill / Couple·2 / $0 total / 1 hour / At home.
The existing active quest was preserved. The direct 12px brand-to-results gap was
covered by browser fixtures without that active card, including 200% text and
native safe areas. Evidence: `.local/beta6-simulator-results.png`,
`.local/beta6-simulator-edit-plans.png` and `.local/beta6-client-browser.log`.

Apple processed build `af06e767-8c0d-47ec-b697-f8d822415a12` as VALID. The build is
assigned to Sidequest Internal and reports IN_BETA_TESTING. English localization
`4c160879-fa60-45d7-97b1-89cb6c8287ae` contains the exact intended 2,699-character
notes. Final state, group membership and notes were verified together at
`2026-10-02T15:01:00.873Z`.

## Remaining checks

Internal-beta availability and delivery are verified; this is not public App Store approval.
Physical-iPhone feedback is still needed for the complete signed-in generation
journey, camera/audio interruptions, installed ChatGPT handoff and Photos export.
See [TestFlight notes](TESTFLIGHT_NOTES.md) for the tester flow and
[AI setup](AI_SETUP.md) for provider, privacy and retry details.
