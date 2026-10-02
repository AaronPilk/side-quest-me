# Build 5 feedback fixes — October 1, 2026

**Build 1.0.0 (5) is available in Sidequest Internal: `VALID` and
`IN_BETA_TESTING`.** Its frozen iOS frontend is `292af0a` and deployed backend is
`3422cbc`. **652 unit tests and the full 209-case local browser suite pass**, with
**21 hosted migrations** applied and real OpenAI production smoke passing. A
test-only navigation-race fix is `1756a3f`; follow-up GitHub CI [36938154871](https://github.com/AaronPilk/side-quest-me/actions/runs/36938154871) completed successfully (verified October 2).
Apple availability and testing-note readback were verified at
**2026-10-01T23:07:51Z**. Open TestFlight → Sidequest Me → Update.

## Release record

| Item                         | Status                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed feedback            | All **20 screenshot reports** belong to **1.0.0 (3)**, build `6d4968d2-0e57-4ca0-9fa2-c1d964f57c04`.                                                                                                                            |
| Crash feedback               | Apple returned **zero crash feedback submissions**; this does not prove that no crashes occurred.                                                                                                                               |
| iOS frontend source          | `292af0a` — unchanged by the later server-only transport fix.                                                                                                                                                                   |
| Backend source               | `3422cbc` — Worker-compatible provider transport and bounded diagnostics.                                                                                                                                                       |
| Browser fixture source       | `1756a3f` — test-only route/remount synchronization; neither the delivered iOS binary nor deployed backend changes.                                                                                                             |
| Database                     | All **21 migrations applied**, including required costs and permissions in any setting.                                                                                                                                         |
| Production Worker            | Deployment [36935884932](https://github.com/AaronPilk/side-quest-me/actions/runs/36935884932) passed; version `79ac83f0-569f-4272-b3cd-71fb5087068e`. Earlier run `36932946541` was canceled before final fixes.                |
| Authenticated live-AI smoke  | **Passed** after the transport fix: configured OpenAI source, exact outing, replay, owner isolation, relevant preflight, immutable zero-award acceptance and cleanup. `.local/beta5-production-smoke-final.log`.                |
| Signed archive / IPA         | `.local/Sidequest-build5-delivery.xcarchive` and `.local/ios-production-export-build5-delivery/App.ipa`, based on iOS frontend `292af0a`. Apple validation passed without errors; `.local/beta5-apple-validation-delivery.log`. |
| Apple upload                 | **Accepted without errors** at 18:42:16 EDT on October 1. Delivery UUID `99b0d926-77e6-46e5-b130-480fba5f4985`; `.local/beta5-apple-upload.log`.                                                                                |
| App Store Connect processing | Build **1.0.0 (5)**, ID `99b0d926-77e6-46e5-b130-480fba5f4985`, processed as **VALID**; internal state **IN_BETA_TESTING**.                                                                                                     |
| Testing notes                | Saved English (`en-US`) localization `a9081092-53e3-4ebd-aac2-ae273f739188`, 2,508 characters; final readback exactly matches the intended notes.                                                                               |
| Internal group               | Assigned to **Sidequest Internal**, group `f10a5d96-4a4a-4b23-862c-1f33802a4397`. Availability, state and notes verified at `2026-10-01T23:07:51Z`; `.local/beta5-delivery-verification.json`.                                  |

The feedback device reported iOS 18.7.3 at 393 × 852 points. All comments and
screenshots were inspected. The [numbered feedback inventory](BETA_FEEDBACK_REVIEW_2026-10-01.md)
retains the original evidence; tester details and expiring URLs remain in ignored
local files. A fresh screenshot-feedback check after upload still returned all
20 build-3 reports with no next page;
`.local/beta-feedback-build5-upload-check.json`.

## What changed

| Reports | Implemented response                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–2     | Retired weak Full Send observation/photo/craft expansions. Normal Create compares concrete experiences, expands a complete plan and independently reviews the actual intensity mechanic. Accepted historical snapshots remain intact.                        |
| 3       | Preserved the modest positive alphabet-hunt example at suitable intensities.                                                                                                                                                                                 |
| 4–5, 19 | Current-area or town discovery searches multiple real Apple Maps activity categories. The plan may select a compatible supplied stop. A specific venue, café/bar keyword or named location is optional.                                                      |
| 6, 20   | Visible transport choices replace the dropdown.                                                                                                                                                                                                              |
| 7       | Budget slider, clear exact-amount action and Whole group / Each person pills stay synchronized, including zero and decimals.                                                                                                                                 |
| 8–9, 13 | Compact Create/account/preferences layouts, bottom actions and native safe-area treatment. During Create, an active quest becomes a compact resume link. Keyboard and larger-text scrolling remain available.                                                |
| 10–11   | Dedicated ChatGPT step with an immediately visible paste box. Continue saves before advancing; errors preserve text. Repeated prompt shortcuts are removed from survey questions. Summary removal preserves separately confirmed answers.                    |
| 12      | Native handoff tries `https://chatgpt.com/#native`, then explicitly falls back to the browser. Installed ChatGPT routing remains a physical-phone check.                                                                                                     |
| 14      | Fixed the STABLE social-read RPC's incompatible row lock; mutation locks remain. Read/save errors are distinguished, successful saves clear old errors, and late stale loads cannot replace fresh data.                                                      |
| 15–18   | Normal Find my quests invokes AI, suggests a conditional experience before specific booking checks and preserves the selected intensity, group, budget, time and setting. Unknown required charges and permissions are enforced outdoors as well as indoors. |

## Experience and privacy behavior

Normal Create uses consented, server-only **OpenAI / GPT-6 Astra** for concept
comparison, expansion and independent review. A quality failure can return a
clearly labeled authored fallback; it does not switch provider, lower intensity
or change the group. Raw imported summaries, profile identity and exact device
coordinates are excluded. The model may choose only a supplied Apple place ID or
no named place. Listing coordinates are stripped from persisted proposal/replay
records. Listings do not establish opening hours, prices, seats, reservations or
filming permission.

Generated proposals are owner-bound and unpublished. Relevant checks appear after
a concrete suggestion. Unknown prices display **Booking price to check**, rather
than $0. Costs include the confirmed required charge exactly once, travel and
separate known activity costs in any setting. Permission requirements apply to
the activity's actual setting. Fresh suggestions reset old booking confirmations;
reopening an owned private episode retains its plan and collects fresh required
checks. The Worker and SQL independently block incomplete or over-budget acceptance.

Accepted snapshots are immutable and award **zero XP/points**, disclosed before
acceptance. Users may explicitly publish their resulting story and grow their own
series; generated templates do not enter the public quest catalog. Shared private
stories provide readable instructions and fresh Create, rather than another
owner's acceptance link. Deletion clears proposals/caches and redacts generated
prose while preserving required opaque historical identities.

A durable lease prevents duplicate generation under the same request key. A replay
returns the completed proposal. One logical discovery can contain multiple bounded
provider calls; it is not a claim of one billed model call. See [AI setup](AI_SETUP.md).

## Verified results

| Check                           | Result / evidence                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit tests                      | **652 passed**, 60 files, on backend `3422cbc`; deployment checks recorded in `.local/beta5-deploy-runtime-fix.log`.                                                                                                                                                                                                                                                     |
| Lint / typecheck                | Both passed again in deployment `36935884932`; `.local/beta5-deploy-runtime-fix.log`.                                                                                                                                                                                                                                                                                    |
| Production bundle               | Passed; `.local/beta5-build.log`. Final iOS delivery uses frozen source `292af0a`.                                                                                                                                                                                                                                                                                       |
| Discovery browser regressions   | **8 cases repeated three times: 24/24 passed** after fixture fix `1756a3f`, in 1.0 minute; `.local/discovery-fixture-repeat-2026-10-01.log`. Includes the exact Demon / Full Send / friends 4 / $300 total / unlimited / venue plan, Full Send for a couple outdoors, required outdoor cost and fresh owned-episode preflight. Provider responses are explicitly mocked. |
| Earlier CI browser run          | [Checks 36935865586](https://github.com/AaronPilk/side-quest-me/actions/runs/36935865586): **206 passed / 3 failed**, 13.1 minutes. All three failures were in the discovery fixture before `1756a3f`; `.local/final-checks-failure-36935865586.log`.                                                                                                                    |
| Full post-fix local browser run | **209/209 passed**, 9.6 minutes, with test-only fix `1756a3f`; `.local/final-browser-fixture-suite-2026-10-01.log`. This is one complete green invocation, separate from the targeted repeats.                                                                                                                                                                           |
| Follow-up GitHub CI             | [Checks 36938154871](https://github.com/AaronPilk/side-quest-me/actions/runs/36938154871) is **running** at this checkpoint. Local full-suite success is not a claim that this independent CI run has passed.                                                                                                                                                            |
| Affected browser suite          | **26 passed**, 1.6 minutes, covering discovery/wizard/recovery/community/private stories; `.local/beta5-changed-browser.log`. The final 8 discovery cases additionally verify the later cost/episode fixes.                                                                                                                                                              |
| Account/preferences UI suite    | **40 passed**, including native safe areas, summary save/retry/removal, copy/open recovery and unknown answers; `.local/beta-ui-final.log`.                                                                                                                                                                                                                              |
| Social profile                  | Read-only RPC, error classification, successful-save clearing and stale-response races pass; `.local/profile-social-loading-final.log`, `.local/profile-social-db.log`.                                                                                                                                                                                                  |
| Database / advisors             | **21 local migrations**, invariant suite and advisors passed. Real RLS, owner binding, replay, outdoor cost/permission checks, immutable snapshots, zero rewards and deletion covered; `.local/private-outdoor-db-final.log` and database test harness. The CLI's “Connecting to remote database” message does not mean this isolated test used hosted data.             |
| Native Simulator / Maps         | iPhone 17 build compiled, installed and launched; revised screens checked. Native Apple Maps retrieved **12 real nearby listings** for Saint Petersburg; `.local/beta5-simulator-final.log`, `.local/beta5-native-nearby.png`.                                                                                                                                           |
| Live model example              | Final synthetic five-friend Full Send plan passed independent review in **57.4 seconds**, with unknown admission handled once; `.local/ai-eval/discovery/five-friends-full-send.json`. One checked example does not guarantee taste or accuracy.                                                                                                                         |
| Provider transport probe        | Synthetic request under the Worker runtime received HTTP 200 after the redirect fix; `.local/ai-provider-synthetic-smoke.log`. This is transport evidence, not a completed production discovery.                                                                                                                                                                         |
| Live production discovery       | **Passed** with configured OpenAI, without a curated fallback; `.local/beta5-production-smoke-final.log`. One logical paid discovery plus same-key replay preserved the exact requested plan; both temporary accounts were cleaned up.                                                                                                                                   |

The initial complete browser run had **194 passed / 8 fixture failures** across
202 cases (`.local/beta5-browser.log`). Stale copy/arrangement/catalog expectations
and premature capture-fixture import were corrected, then affected scenarios
passed.

The later final CI run had **206 passed / 3 failed**. Trace evidence showed a
Create click only **2 ms after the Discover click**, before React rendered
Discover: the old Create DOM and `aria-current` remained, so the mocked configured
provider was not loaded by a fresh Create mount. Test-only commit `1756a3f` waits
for the Discover heading before returning to Create, verifies the mocked
configuration is read and adds the same rendered-route barrier to the pending
request/remount case. All eight discovery cases then passed three repetitions
(24 executions). The complete **209-case local rerun then passed in 9.6 minutes**
as one invocation. Follow-up GitHub CI `36938154871` is still running; its outcome
is not inferred from local results. Overlapping runs are not added together.

## Applied migrations

The six build-5 migrations bring the approved existing project to **21 total**:

1. `20261001214915_private_experience_discovery.sql`
2. `20261001214926_social_read_without_row_lock.sql`
3. `20261001214937_private_experience_account_privacy.sql`
4. `20261001214951_retire_inflated_full_send_recipes.sql`
5. `20261001221320_private_experience_cost_in_any_setting.sql`
6. `20261001221647_private_experience_permission_in_any_setting.sql`

## Production AI verification

Two authenticated production runs preserved the exact outing and passed social
profile persistence, same-key replay, relevant synthetic preflight, owner isolation
and immutable zero-award acceptance. Both cleaned up their marked disposable
accounts. Neither uploaded media, completed quests, published posts or awarded
rewards. Both returned a **curated fallback**, including after reconciling the
working provider key, so both failed the required AI-source assertion. Evidence:
`.local/beta5-production-smoke.log` and
`.local/beta5-production-smoke-key-reconciled.log`.

The rapid fallback (about 396 ms) was traced to `redirect: "error"`: the deployed
Worker runtime threw a TypeError before a provider HTTP response. Backend
`3422cbc` uses `redirect: "manual"` and explicitly rejects all non-OK responses,
including redirects. A synthetic runtime probe then received HTTP 200 in about
1.6 seconds. Deployment `36935884932` passed. The probe and a configured key alone
did not establish successful end-to-end generation.

The subsequent authenticated production smoke **passed** with the configured
OpenAI model and source `ai`, without using the curated fallback. It preserved
Demon / Full Send / four friends / $300 total / unlimited time / venue, replayed
the same request key without a second proposal, enforced only the relevant
preflight requirements and rejected wrong-owner or changed-intensity acceptance.
The resulting owner-only private run remained immutable and awarded zero
XP/points. All temporary accounts and generated app data were deleted or redacted.
Evidence: `.local/beta5-production-smoke-final.log` and the ignored report
`.local/beta5-production-smoke-report.json`. This validates one live plan; it does
not guarantee the quality of every generated experience.

Failure diagnostics retain fixed stage/provider/failure-kind labels, elapsed time
and numeric HTTP status only. They exclude raw error text, stacks, provider
bodies, keys, prompts, account identifiers and private outing/location context.
Apple build state, internal-group membership and exact testing-note readback are
confirmed in `.local/beta5-delivery-verification.json` at
`2026-10-01T23:07:51Z`.

## Remaining physical checks and business scope

- Installed ChatGPT copy/open/return/paste routing requires a **physical iPhone**
  check. Simulator/native-link tests do not prove installed-app routing.
- Physical camera/audio interruptions, Photos import/export/watermark, location
  permissions and app background/resume still require final TestFlight checks.
- Live events lack `TICKETMASTER_API_KEY`. Eventbrite is an outbound resource;
  there is no scraping or verified concert/seat/ticket inventory in this release.
- Native nearby Maps works on iOS 18+ without a browser token. Older iOS and
  unconfigured browsers retain manual/external Maps fallback, not listing parity.
- Consumer access stays free. Existing opt-in licensing and funded campaign tools
  remain. **Paid destination distribution and traffic-lift measurement are future
  business work**, not a completed feature of this release.

This is an internal beta, not an App Store submission or approval. The build-3
physical feedback documents earlier problems; it is not physical acceptance of
build 5. Physical-device acceptance remains necessary even though the build is
available to internal testers. The follow-up GitHub CI result remains pending above.
