# App Store release preparation — October 2, 2026

**Later checkpoint:** On October 3, Build 12 replaced Build 11 in the draft
App Store version and manual release was selected. See
[current preparation](APP_STORE_PREPARATION_2026-10-03.md). The historical
Build 11 evidence below is preserved; it does not claim the newer submission
work is complete.

Checkpoint: **2026-10-02 21:39 UTC**. Build **1.0.0 (11)** has been archived,
exported, verified, validated, uploaded and processed by Apple. It is available
to the existing internal TestFlight group and attached to the draft App Store
version. It has **not been submitted to App Review**. The local full browser run
passed, and the corrected release CI passed all 259 browser scenarios. The
explicit production deployment succeeded; all four policy pages were verified
live without signing in. Owner/device checks remain incomplete.

This record supplements the historical build-10 delivery evidence; it does not
turn preparation, successful validation or saved listing fields into a public
release or Apple approval.

## Verified application and database checks

| Check                                      | Result at this checkpoint                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit suite                                 | **725 tests passed**.                                                                                                                                                              |
| TypeScript, lint, production build         | Passed.                                                                                                                                                                            |
| Isolated Postgres suite                    | All **22 migrations** applied; database invariant and advisor checks passed.                                                                                                       |
| Independent canonical-content/replay audit | Passed, including the public-content screening preflight and replay behavior.                                                                                                      |
| Local full browser suite                   | **All 259 scenarios passed**, approximately 12 minutes. Native device checks remain separate evidence.                                                                             |
| Hosted migration                           | Applied successfully as version **20261002203133**; local filename reconciled to `20261002203133_reel_publication_review.sql`. Hosted history totals **22 migrations**.            |
| Hosted content/operator snapshot           | **0 existing community posts; 0 active operator memberships**. No moderator was appointed by this work.                                                                            |
| Live OpenAI service probe                  | `omni-moderation-latest` returned HTTP **200** with **flagged=false** for the probe. This verifies provider access, not a complete production moderation workflow or video review. |

The hosted security advisor's restrictive-RLS INFO findings concern intentional
service-only tables/functions; ordinary clients do not receive broad access to
those review operations. The pre-existing **WARN: leaked password protection
disabled** remains unresolved. Supabase documents enabling leaked-password
protection in Auth settings and notes that it requires Pro or above. No plan,
password policy or existing account password was changed to resolve that warning.
[Supabase password-security guidance](https://supabase.com/docs/guides/auth/password-security)

Delivered source adds public privacy/support/terms/community pages and Settings
links, an ordinary email/password fallback, the native PKCE resend correction,
explicit public profile/Series screening consent, and independent review before
community reel publication. The compatible Worker is deployed and public-route
verification passed. Authenticated native access and actual independent moderation
operation remain separate checks. See [authentication update](APP_STORE_AUTH_2026-10-02.md)
and [reel publication review](REEL_PUBLICATION_REVIEW.md).

## Build 11 artifacts and Apple validation

- App: **Sidequest Me**, App Store Connect record `6817917086`.
- Native bundle: `com.aaronpilk.sidequest`; signing team: `5F5C5G25Y6`.
- Archive: `.local/Sidequest-build11-delivery.xcarchive`.
- Exported IPA: `.local/ios-production-export-build11-delivery/App.ipa`.
- Independent exported-bundle verification at `2026-10-02T20:29:22.896Z`
  confirms version **1.0.0**, build **11**, **arm64**, production bundled assets
  and distribution signing. Evidence: `.local/beta11-export-verification.json`.
- Apple validation passed. The validation proof binds the result to the verified
  IPA's SHA-256. Evidence: `.local/beta11-apple-validation.log` and
  `.local/beta11-apple-validation-proof.json`.
- Apple upload completed with exit **0**. Evidence: `.local/beta11-apple-upload.log`.
- Apple processing and internal TestFlight delivery are verified below; review
  submission remains separate.

The local phased tooling is `.local/build11-release.mjs`, with its execution
record in `.local/BUILD11_RELEASE_PLAN.md`. It defaults to a read-only plan and
does not upload without an explicit upload phase. The build's production assets
must match the final source and compatible deployed backend.

## Verified internal TestFlight delivery

Independent API readback at **2026-10-02T20:49:12.901Z** confirms:

- Build ID `2eae7135-019c-4ddc-839c-57963fa804af`, build **11**, processing state
  **VALID**, internal build state **IN_BETA_TESTING**.
- Access for the existing **Sidequest Internal** group
  `f10a5d96-4a4a-4b23-862c-1f33802a4397` was added with HTTP **204**. Both the
  build's group relationship and the group's build list include the association.
- The English **What to Test** note was saved with HTTP **200** and read back
  exactly. It covers public policy access, ordinary sign-in, preferences/open
  quests, profile/Series screening, private publication pending independent
  review, and physical iPhone camera/audio/export checks. It discloses that email
  delivery and moderator setup still need completion; it claims no immediate
  community publication or completed App Review.
- App Store version `07c31559-9097-43fb-9d6f-2744374be7aa` is associated with
  Build 11 (HTTP **204**, matching readback). Its state remains
  **PREPARE_FOR_SUBMISSION**.
- External beta state remains **READY_FOR_BETA_SUBMISSION**. No external Beta App
  Review or App Store Review submission was sent by these operations.

Private response evidence and the combined readback are retained under `.local/`:
`beta11-delivery-proof.json`, `beta11-asc-after-association.json`,
`beta11-group-builds-after.json`, `beta11-localizations-after.json` and
`beta11-version-after-association.json`. The exact note is
`beta11-what-to-test.txt`. These files contain no copied signing key or reviewer
password and are not committed.

## Production deployment and live verification

Release CI run [37062008577](https://github.com/AaronPilk/side-quest-me/actions/runs/37062008577)
for exact source `dec3c6874fd71d547befd45da28629e7c5779bf2` passed its lint,
typecheck, unit and database stages, but its browser stage finished with **258
passed and 1 failed**. The failure was the native Series cover-clearance check
at **402 × 874**. Production deployment was **not dispatched** after that failure.

The retained trace shows an initial document scroll of 72px and passing Sunrise
clearance, followed by an unstable element during the 180ms stage entrance,
Playwright's scroll-into-view resetting the document to 0, and the subsequent
Forest check failing. Repeated unchanged local diagnostics show settled bottom
scroll has approximately 66px clearance. A deliberately prolonged animation did
not independently reproduce the reset, so this record does not assert a fully
reproduced environmental cause.

The correction is confined to `tests/series-native-layout-browser.spec.ts`:
bounded polling waits for stage animation completion, measures cover/footer/nav
rectangles in one frame, and checks again after each selection. The exact
safe-area and footer/navigation clearance requirements are unchanged. **12
targeted Chromium runs passed**, with typecheck, lint and build also passing.
No CSS or app code changed, so the delivered Build 11 bundle is unaffected.
Corrected source `adf601007de355f8a2cbd48a0ce776e53a8b497c` changes only that test;
its [Checks run 37065162212](https://github.com/AaronPilk/side-quest-me/actions/runs/37065162212)
completed successfully at **2026-10-02T21:29:47Z**, including **725 unit tests**,
the database suite, **all 259 browser scenarios** (17.2 minutes), typecheck, lint
and build. The existing app implementation and Build 11 remain unchanged.
Evidence: `.local/beta11-corrected-ci-result.json` and
`.local/beta11-corrected-ci.log`.
Failure logs, artifact and diagnostic evidence are retained as
`.local/beta11-ci-result.json`, `.local/beta11-ci-failure.log`,
`.local/beta11-ci-artifact/` and `.local/series-layout-diagnostic-results/`.

The authorized deployment target is the existing `deploy.yml` workflow on
`main` with input **environment=production**. It creates an explicit
`.local/wrangler.target.json` before the Vite build for Worker **sidequest-me**,
bucket **sidequest-me-media**, queue **sidequest-me-renders** and origin
`https://sidequest-me.aaron-9c3.workers.dev`. It must not be replaced with a
default-config deployment. A generic SPA shell with HTTP 200 alone does not
verify that a policy page renders; the readback below includes signed-out SPA
content.

The corrected CI result and remote `main` SHA were checked before dispatching
[production deployment run 37067367534](https://github.com/AaronPilk/side-quest-me/actions/runs/37067367534)
with input **environment=production**. It succeeded for the exact corrected SHA.
Logs confirm `SIDEQUEST_ENV: production`, the explicit target configuration at
build time, deployment of Worker **sidequest-me**, and Worker version
**5cbf2d4b-825a-44c2-b0f6-0fd81d8c7628**. Evidence:
`.local/beta11-production-deploy-result.json` and
`.local/beta11-production-deploy.log`.

Read-only live verification at **2026-10-02T21:36:22.023Z** passed:

- `/api/health` returned HTTP **200**, `status=ok`, `environment=production`,
  `demo=false`, with database and renderer configuration present. The response
  to `Origin: capacitor://localhost` allows that exact native origin.
- Fresh signed-out headless Chrome contexts at **390 × 844** rendered the
  expected heading and page title on [Privacy policy](https://sidequest-me.aaron-9c3.workers.dev/privacy),
  [Help & support](https://sidequest-me.aaron-9c3.workers.dev/support),
  [Terms of use](https://sidequest-me.aaron-9c3.workers.dev/terms) and
  [Community guidelines](https://sidequest-me.aaron-9c3.workers.dev/community-guidelines).
  Each page returned **200**, showed all four policy footer links, had no
  horizontal overflow and emitted no page errors.
- The deployed entry is `/assets/index-CE4qS_jz.js`; its policy chunk is
  `/assets/PublicInformation-BVCyQJaP.js`. Both returned **200**. The chunk
  includes all four routes and the OpenAI disclosure. SHA-256 hashes and page
  measurements are retained in `.local/beta11-live-public/verification.json`.
- The initial verifier could not find the newly expected bundled Playwright
  browser executable; the completed verification used the repository's installed
  Chrome headless channel with fresh contexts, without interacting with the
  user's Chrome window or signing in.

The policy pages honestly disclose that a monitored public support contact is
not yet configured. Successful rendering does **not** resolve that missing
contact or establish readiness for public App Review submission. It does verify
the live privacy URL needed before publishing the saved App Privacy labels.

App Privacy remains a **saved draft, not published**. After live-policy
verification, App Store Connect's Publish action opened a final confirmation
requiring agreement that the answers are accurate, comply with the App Store
Review Guidelines and applicable law, and will be promptly updated when needed.
The final acceptance has **not** been sent. The owner was asked for action-time
confirmation of that declaration; the dialog is preserved while the answer is
pending. Evidence: `.local/appstore-privacy-publish-confirmation.png`.

## Listing, pricing and screenshot delivery

The English subtitle, description, keywords and promotional text are saved and
read back in App Store Connect. Categories are **Lifestyle** and **Social
Networking**. The listing points to the production `/privacy` and `/support`
routes. Launch pricing is **free ($0.00)**, initially **United States only**,
with automatic availability in new territories off. These saved settings do not
constitute submission. Exact copy and metadata evidence are in
[the listing record](APP_STORE_LISTING_2026-10-02.md).

The factual current-build review Notes were saved to the Apple draft through
App Store Connect. Exact field readback matched, with Save disabled and 890
characters remaining. Evidence: `.local/appstore-review-notes-saved.png` and
`.local/app-store-metadata/review-notes-current-build.txt`. Reviewer credentials,
owner contact and copyright fields remain blank; saving Notes did not submit
App Review.

One authentic **1320 × 2868** welcome capture was composed with approved violet
branding and restrained marketing typography. Apple's screenshot processing
returned **COMPLETE**:

- Screenshot ID: `d3c00019-6612-889e-8008-9e729a91f11b`.
- Screenshot set: `77d9b143-e9fd-433a-be3c-70a6c4d00245`.
- Unchanged native capture: `app-store/2026-10-02/raw/welcome.png`.
- Delivered artwork: `app-store/2026-10-02/welcome-artwork/07-great-stories-start-here.png`.
- Provenance/dimensions/checksums: `app-store/2026-10-02/welcome-artwork/artwork-manifest.json`.
- Visual contact sheet: `app-store/2026-10-02/welcome-artwork/contact-sheet.jpg`.

The **six feature screenshots are not captured/completed**. The Mac became
locked, preventing the required native app walkthrough and screen captures.
Their storyboard is `app-store/2026-10-02/captures.json`: quest result, Create
choices, places, camera, Series and private journal. These planned files are not
evidence of captured screens. Complete them from the actual final iPhone app,
inspect each composed image and verify Apple's processing/order; do not replace
missing UI with invented working previews or counts.

## Authentication and reviewer access

A dedicated ordinary reviewer account exists. Its credentials are retained only
in a private local file, outside committed source. Normal password authentication
and an authenticated API request passed; the account has no reviewer bypass in
the app. Welcome's expandable **Sign in with password** uses the normal
Supabase method, session listener, onboarding gate and role checks.

**Real native UI password sign-in is still unverified** because the Mac is
locked. Complete that check before supplying the account in App Store Connect's
protected review-access fields. A successful password/API check does not verify
the native keyboard, routing or every reviewer workflow.

Public signup email/custom SMTP delivery remains pending owner setup. The
built-in sender's quota caused email delivery-limit responses during the native
sign-in check. The 60-second app resend timer prevents rapid requests; it does
not resolve the separate provider/project quota or establish general-public
delivery. Owner SMTP details and verified sender authorization remain pending.
[Supabase Auth email-delivery setup](https://supabase.com/docs/guides/auth/auth-smtp)

The **18+ age-rating questionnaire is saved**: Apple returned HTTP **200**,
and readback confirms the 18+ override with the expected Boolean answers.
Frequency inputs `INFREQUENT` and `FREQUENT` read back through legacy aliases
`INFREQUENT_OR_MILD` and `FREQUENT_OR_INTENSE`. The independent
[schema/readback record](APP_STORE_AGE_RATING_2026-10-02.md) confirms both forms
are documented values, with four observed normalizations and no documented
conversion rule. The V2 18+ override and Boolean answers match; this is not an
exact frequency-string match. The content-rights draft is still unsaved.
An age-rating selection alone does not verify users' ages or establish content
gating.

## Moderation and commercial operation

The prepared posting flow keeps a submitted reel private until an independent
operator reviews the exact video, audio, caption and shared quest instructions.
Public profile text/photo and published Series text use a separate OpenAI
screening gate with explicit consent. The text/image classifier is not a video
review or age-verification system.

There are **zero active operator memberships** at this checkpoint. The owner
must authorize a specific account, appoint a moderator through an authorized
administrative channel, and arrange actual submission/report handling. No role
was granted and no staffed service, review hours or response-time guarantee is
claimed. Test the publication queue with separate creator/reviewer accounts,
including return-for-changes, approval, removal and revoked-role access after
the compatible Worker is deployed.

The paid brand-licensing path remains a **manual** negotiation/payment/permission
verification flow behind business approval and account roles. There are no new
automatic payouts or StoreKit purchases. Confirm the intended launch scope and
provide appropriate authorized review access if that scope includes gated brand
functions. Apple's payment treatment must be assessed for the actual flow and
storefront; this record makes no eligibility guarantee.
[Apple App Review Guidelines: UGC, access and payments](https://developer.apple.com/app-store/review/guidelines/)

## Remaining submission work

- Retain both the local and corrected CI **259-scenario** browser evidence with
  this release and complete the separate native device checks below.
- The final compatible Worker and public policy routes are deployed and verified.
  Complete authenticated native access, screening and independent publication
  review against the hosted database; the migration is already applied.
- Unlock the Mac, verify the ordinary reviewer login in the final native app,
  complete the six feature captures and upload/process/order the artwork.
- Complete the final physical iPhone camera preview, microphone/audio,
  recording interruptions, Photos export and signed-build acceptance checks.
- Obtain the owner's approved public support email/contact, App Review contact
  details, copyright identity and content-rights answers. `PUBLIC_SUPPORT_EMAIL`
  is still empty; configure and publish it before public submission. No mailbox,
  legal entity or rights assertion was invented.
- Complete public email/SMTP sender setup and verify normal new-user delivery.
- Appoint an owner-authorized independent moderator and verify the real queue
  and report-handling operation; do not grant privileges without authorization.
- App Privacy: **all 19 data categories and purpose/linkage/sharing answers are
  saved in the draft**; the independent matrix audit passed and the live
  privacy-policy route is verified. Final Publish acceptance is pending the
  owner's confirmation of Apple's accuracy/compliance/update declaration.
  A saved draft alone is not a published privacy label or an App Review submission.
- Retain the independent schema/readback record for the saved **18+** rating.
  Obtain the owner's content-rights answers and save that draft, which remains
  **unsaved**. An age rating does not establish age verification or content gating.
- Assess the manual paid brand-licensing launch scope and reviewer role access.
- Build 11 upload, Apple processing, internal TestFlight access and App Store
  version association are complete. Finish and verify the remaining metadata
  and review-access requirements, then submit App Review only after they are
  satisfied.

At this checkpoint, **no App Review submission was sent** and **no public App
Store release occurred**. This record contains preparation and verification
evidence, with the unfinished work explicitly retained.
