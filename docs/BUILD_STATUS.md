# Build status — 2026-09-30

The app is live on [Cloudflare](https://sidequest-me.aaron-9c3.workers.dev).
The selected Supabase database has nine migrations and 1,113 authored variants
across 73 families. The feedback release is deployed and undergoing final cloud-render verification;
see [the deployment record](DEPLOYMENT.md).

## Current feedback milestone

- Budget entry clears correctly and normalizes leading zeroes. Time choices are
  one, three, or five hours, or unlimited.
- Create asks six core questions plus nearby places when relevant. Manual travel
  estimates and the mandatory arrangements questionnaire are removed. Existing
  saved estimates remain visible and explicitly removable in review.
- Full Send outdoor dates for two now have matching activities. No intensity,
  participant count, or boundary is silently changed. More quest ideas loads
  further distinct matching families; backend catalog reads exceed the database's
  default 1,000-row response cap safely.
- Current-area location, optional Apple Maps, and a server-side Ticketmaster event
  adapter are implemented. Eventbrite is an external browse link. Live provider
  keys are still required; no scraped or invented event inventory is presented.
- Capture supports stopping and adding takes before finishing each part, saved
  finished drafts across refresh, and quest-specific hook/action/payoff/loop prompts.
  A restored finished part can be uploaded or replaced; it cannot append a new take.
- The production renderer's R2 stream-length failure has a tested bounded streaming
  fix. A 45-second live test hit the time limit; the follow-up resource configuration
  uses two vCPUs, still capped at one instance.

Typecheck, lint, 276 unit tests, deployment configuration checks, isolated PostgreSQL
regression tests/advisors, build, and all 55 browser scenarios pass. Production
render verification is pending the release. Vite reports its advisory large-entry
warning: 584.5 kB / 180.8 kB gzip for the local build, and 800.7 kB / 236.3 kB gzip
for the production build with live Auth. SMTP, Apple Maps and live events need the provider settings listed
in the deployment guide. Imported-profile review stays manual and explicit.

The sections below retain the verification history of earlier local milestones;
their deployment statements describe those earlier passes.

## Creator experience and Quest Series

The product handoff is implemented on top of the existing guided Create, profile,
discovery, Maps, media, and licensing work. The five primary destinations are
Create, Discover, Rewards, Activity, and Profile. Settings contains Demo tools;
Business workspace and permission-gated Admin replace the Studio catch-all, with
compatible redirects for old links.

Profiles now support uploaded photos, unique usernames, persistent follows, actual
counts, a portrait video grid, and Videos/Quests/Series/Private tabs. Reels open in
a focused viewer. Authentication changes discard the previous account's private
data immediately. Rewards separates proposals, accepted amounts awaiting manual
fulfillment, verified payments, and quest points without implying automatic payouts.

Series supports finite and ongoing authoring, drafts, frozen reviewed quest versions,
ordered parts, explicit prerequisites, independent parts, participant-owned progress,
refresh/resume, follows, and new-part Activity notifications. Real completion drives
progress. Publication remains explicit; licensing remains scoped to the exact video.
Account deletion redacts authored Series content while preserving other participants'
accepted records. See [the implementation guide](CREATOR_SERIES.md).

Verified locally for this handoff:

- All 242 unit tests across 18 files pass. Typecheck, lint, build, API smoke, and
  `git diff --check` pass. Vite retains its advisory chunk warning: the browser entry
  is about 535 kB / 165 kB gzip; creator, Series, reel, and operator screens are split.
- All 48 current browser scenarios passed across the combined run and focused
  follow-ups. The combined run passed 46 of its 47 scenarios; its new Series
  authoring test exposed accessible-select labels and an overly exact error-text
  selector. Both were corrected. The final three Series scenarios pass together,
  including the additional real capture → render → private completion → publication
  → separate participant attempt journey. Existing capture, business approval,
  licensing, fulfillment, profiles, recommendations, Maps, and pagination passed.
- A fresh isolated PostgreSQL cluster applied every migration and the 33-variant
  seed. Social and Series ownership, RLS/grants, follow/block behavior, frozen
  versions, prerequisites, completion retries, source attribution, cleanup, and
  deletion redaction passed alongside the existing concurrency/economic suite.
  Supabase advisors reported no findings; database types were regenerated. No
  existing or remote database was used.
- Mobile/desktop layouts and 200% text were checked at 320/390/768/1440px. The
  enlarged navigation wraps whole labels; photos fit their avatars; full-screen
  reels exclude the desktop rail. Series and reel screenshots are under
  `output/handoff-series-complete`; navigation/profile artifacts are under
  `output/navigation-layout-visual` and `output/social-profile-final`.
  Separate viewport captures `output/reel-large-text-top.png` and
  `output/reel-large-text-actions.png` verify readable enlarged reel controls.

Changes remain local. No push, deployment, remote migration, provider provisioning,
or payment was performed. Live Supabase Auth and Cloudflare R2/Queue/Container still
need the dedicated staging configuration and two-account checks. Apple Maps needs
a valid domain-restricted token; its configured tests use an explicit SDK fixture.
Profile parsing remains manual and reviewed, with no automatic parser configured.
Payments continue to use manual verification. These are configuration boundaries,
not claims of live provider integration.

## Reliable discovery and Apple Maps

Guided Create now checks viable quests against confirmed answers only. Canonical
eligibility issues supply concrete recovery choices, preserving other answers and
keeping boundaries and permissions enforced. Three complete small-group variants
bring the catalog to 33 variants across 13 families; the reported Daytime/Bold,
couple, $25, one-hour, at-home plan now has a suitable 45-minute, $0 quest.

Profile detours preserve the selected template, inspiration, and outing. Actual
target requirements expose adult/volunteer confirmations in every category.
Custom profile text keeps spaces during typing, and confirmed preference chips
represent all collected answers. Discover loads older pages with retry, deduplication,
filter resets, stale-response protection, and stable timestamp/ID cursors.

Apple Maps search, real-place selection, map preview, and directions are wired into
Create, review, and accepted quests. Only a durable Place ID is stored. Missing
configuration has an honest external Maps fallback. **A live Apple token is not
configured**; configured browser checks use an explicit SDK fixture. Follow
[Maps setup](MAPS.md) to connect and verify real Apple authorization and rendering.
No monetization or paid placement was activated.

Verified locally for this pass:

- 195 unit tests across 13 files and all 31 browser scenarios passed. These include
  the reported outing, early unknown answers, explicit recovery, hard boundaries,
  onboarding return/Back/cancel, actual sequential typing, pagination, Maps retry
  and persistence, plus the existing capture, publication, and licensing flows.
- Typecheck, lint, and production build passed. Vite reports its advisory 500 kB
  chunk warning for the 513 kB browser entry (159 kB gzip); the Apple loader is
  dynamically imported. This is not a build failure.
- A fresh isolated PostgreSQL cluster applied both additive migrations and the
  33-variant seed. Real cursor round trips with timezone offsets and equal timestamps,
  RLS, transactions, rewards, media, and commercial invariants passed. Supabase
  security advisors reported no findings. No existing database was contacted.
- Mobile browser screenshots are under `output/current-milestone-browser`, including
  the Daytime/couple result and the explicitly mocked Apple place preview.
- Maps search/results, missing-token fallback, and recovery layouts fit
  320/390/768/1440px and 200% text at 320px without horizontal overflow or clipped
  controls. The recovery heading now gives enlarged text its own row. Artifacts
  are under `output/current-milestone-visual`. All 12 affected browser scenarios
  passed again after the final heading and adult-confirmation wording changes.

Changes remain local. No deployment, GitHub push, or remote resource change was
made in this pass. The older milestone records below retain their original scope.

## Guided quest creation

Create is the first primary destination. The outing form now asks one question at
a time with progress, Back/Continue, refresh persistence, and an editable review
before showing matches. Travel and venue details follow the selected setting;
Try-this-quest keeps its authored scene/energy and asks for the participant’s own
plans. The matching and acceptance contracts remain unchanged; no database
migration is needed for this UI pass.

Verified locally: 118 unit tests, all 15 browser scenarios, typecheck, lint, and
production build pass. New regressions cover the guided flow, invalid number
editing, draft persistence, and venue/travel confirmations. All wizard steps fit
320/390/768/1440px and 200% text at 320px. Artifacts are under
`output/create-wizard-final` and `output/create-wizard-*.png`.

## Visual refinement

The interface now uses a quieter Apple/Instagram-inspired visual system: compact
mobile chrome, floating tabs, desktop navigation rail, a video-led Discover feed,
grouped creator profiles, and compact activity rows. All 13 browser regressions
passed after the navigation update. Responsive screenshots, 200% text checks, and
feed loading/error/retry checks passed. See [design notes](DESIGN.md) for the visual
layer and artifact locations. Existing privacy, capture, publishing, and licensing
behavior remains covered by the regression suite.

## Earlier community milestone

The existing local app now has Create/Discover/Activity/Profile navigation, explicit
public reel posts, personal Try-this-quest eligibility, reviewed original quests,
separate creator identities, approved business profiles, structured licensing,
immutable accepted terms, manual fulfillment, reporting, blocking, and moderation.
Private journal, hosted share links, rewards, and funded campaigns remain separate.
The demo selector exercises four isolated browser personas with labeled, actual
fixture media. Configured mode uses authenticated Worker endpoints and additive
Postgres migrations, not the demo store.

Onboarding now preserves unanswered preferences as unknown, keeps ambiguous legacy
defaults unconfirmed, and supplies explicit reset controls. Imported summaries have
standalone edit/removal and manual preference confirmation. Confirmed interests,
skills, willingness, participation, and preparation influence matching; explanations
come from actual ranking factors, and hard boundaries remain enforced. There is no
automatic text parser in this build. See [the profile audit](PROFILES.md).

Current verification results follow. The older foundation checks are retained
with their original scope and date.

### Milestone verification

- Isolated PostgreSQL migration reconstruction, existing reward/media invariants,
  and the new community concurrency/privacy/state-transition suite passed.
- Supabase security advisors reported no findings; database types regenerated.
- `npm test`: 118 tests across nine files passed, covering profile persistence,
  unknowns, matching, demo transitions/reset, Worker authorization, media transport,
  stale/duplicate negotiation, original quest acceptance, and commercial gates.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed.
  Production browser entry is approximately 487 kB / 150 kB gzip, with community,
  capture, licensing, and operator screens split into separate chunks.
- All 13 Playwright scenarios passed in the combined pass (1.1 minutes). Focused
  follow-ups passed after final UTC/availability fixes and after extending original
  quest coverage through actual acceptance and refresh. Tests used real local
  uploaded/rendered MP4s, a synthetic browser camera, and labeled fixture footage.
- Mobile and desktop screenshots were inspected. Browser coverage includes explicit
  private/publish/unpublish, personal constraints and separate attribution, original
  approval/acceptance, profile skip/reset/removal/error feedback, counter/accept/decline,
  manual fulfillment, actual commercial download, and suspension. Existing journal,
  rewards, capture, operator and merchant scenarios continue to pass.
- Local Worker/API smoke passed, including bounded setup errors on community and
  commercial endpoints without credentials and no fallback to demo records.
  Isolated configuration generation also passed without remote changes.

Browser artifacts are under `output/core-profile-browser`,
`output/licensing-availability-browser`, and `output/original-acceptance-browser`;
profile screenshots are `output/profile-review-mobile.png` and
`output/profile-review-desktop.png`. Database tests use local Auth/media fixtures;
community browser tests use the explicitly isolated demo. These checks do not
claim deployed Supabase Auth, Queue/Container/R2, or physical-device verification.

To try the flow, open `/discover` on the local demo. Use Creator to make/publish a
reel or submit an original quest. Use Brand to request the opted-in fixture video,
Second creator to respond, and Operator → `/studio` for review and manual evidence.
The [README](../README.md) has exact steps; [COMMUNITY](COMMUNITY.md) documents the
contract and operational boundaries.

No remote services were changed. Real business approval, agreement review, payment,
permission verification, and fee agreement remain manual. A future pilot needs
selected Supabase/Cloudflare resources, auth/email, operators, real business checks,
and deployed two-account media tests. Host-level provider credentials alone do not
configure automated profile parsing.

## Foundation verification — 2026-09-27

**Working locally:** [Sidequest demo](http://127.0.0.1:5173), with the real local
FFmpeg adapter on port 8789. Start these with `npm run dev:demo` and
`npm run render:dev`. The ordinary Worker development server is separately
available on port 5279. This is a local implementation, not a public deployment.

## Delivered

- React/TypeScript/Vite PWA, four consumer tabs, email Auth integration, ten editable
  survey questions, optional reviewed import, outing budgets and manual context.
- Thirty authored variants across ten families; hard filters, deterministic ranking,
  at most three choices, complete plans and immutable accepted snapshots.
- Three actual recorded/uploaded clips, trim/crop/mute/captions, genuine portrait
  MP4 output, private journal, download/share sheet, explicit hosted share/revoke,
  individual media deletion and account cleanup.
- Supabase migrations, catalog seed, generated schema types, RLS and service-only
  transactions: single active run, immutable evidence/ledger, UTC cap, thirty-day
  family cooldown, inventory reservation, cancellation/expiry refunds and scoped
  single-use merchant confirmation.
- Role-protected operator routes for reviewed templates, flagged evidence, provider
  agreements, funded offers and campaigns. Sponsorship never overrides filters;
  reviewed campaign versions and disclosures are frozen through rendered output.
- Worker API, private R2 transport, sealed source generations, one Queue, Container
  Durable Object, fenced retries/outbox recovery, retention and deletion jobs.
- Pinned dependencies, configuration examples, generated bindings, restricted Docker
  build context, GitHub checks/manual deployment, setup and operational documentation.

## Verification

Commands were run in this workspace; no production data was used.

| Command                                                    | Observed result                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run cf:types`                                         | Wrangler generated current Worker binding/runtime types.                                                                                         |
| `npm run typecheck`                                        | Pass.                                                                                                                                            |
| `npm run lint`                                             | Pass.                                                                                                                                            |
| `npm test`                                                 | 36 tests passed across four domain/media test files.                                                                                             |
| `node scripts/db-test.mjs --advisors --generate-types`     | Real temporary PostgreSQL migration, seed, RLS/concurrency tests passed; Supabase advisors found no issues; schema types generated.              |
| `node scripts/db-test.mjs --advisors`                      | Passed again after campaign acceptance/version tests; no advisor issues.                                                                         |
| `npm run render:fixtures`                                  | Real HTTP upload → sealed files → FFmpeg → downloaded/decoded/hashed MP4 passed; sponsored fixture also passed.                                  |
| `npm run test:browser -- --output=output/verified-browser` | All six scenarios passed in 27.1 seconds.                                                                                                        |
| `node scripts/api-smoke.mjs`                               | Real local Worker: health JSON, API 404 JSON, bounded missing-config 503, no-store, invalid share 404 and SPA fallback passed.                   |
| `node scripts/config-smoke.mjs`                            | JSONC parsed and explicit isolated target generated in a temporary directory; no remote resources created.                                       |
| `npm run build`                                            | Worker and frontend bundles produced. Browser entry approximately 445 kB / 138 kB gzip; capture and operator screens split into separate chunks. |
| `npx wrangler deploy --dry-run --containers-rollout=none`  | Worker/static-assets packaging passed; does not build or deploy the Container.                                                                   |

The actual proof is `.local/fixtures/sidequest-proof.mp4`: 21.021333 seconds,
1080×1920, H.264/AAC, 5,599,903 bytes. SHA-256:
`2acc4952f38c4261dccf1ebe507caec9330d0854e05d17971418ded2d2c69f97`.
Its recorded local encode time was 4.305 seconds. Fixtures cover mixed orientation,
missing audio, streaming WebM duration, immutable replacements, duplicate render
requests, empty/corrupt inputs, hostile origin/URL input and independent decoding.

Database checks use actual PostgreSQL transactions, including two-user authorization,
parallel acceptance, replayed awards, simultaneous daily-cap decisions, exact UTC
and cooldown boundaries, frozen review evidence, render fences/leases, transient
retry, last-stock and overspend races, consume/cancel/expiry races, price/version
changes, deletion while rendering, privacy redaction and campaign version changes.
The local Auth schema is an explicit test fixture; these are not live Supabase Auth tests.

Browser checks cover onboarding without import, refresh/resume, 320/390/768/1280px,
200% text, keyboard/modal focus, denied camera, empty input, actual synthetic
MediaRecorder capture with track shutdown, three actual uploads and an independently
probed download, journal persistence and canceled sharing. Operator/merchant browser
checks use explicitly mocked sessions/APIs; database integrity is tested separately.
Earlier accessibility audits reported no violations on onboarding and the four tabs.
Screenshots are in `output/qa/` and `test-results/`.

Observed toolchain: Node 25.9.0, npm 11.12.1, PostgreSQL 17.11, FFmpeg 8.1,
Supabase CLI 2.101.0, Wrangler 4.142.0. CI targets Node 24 and Ubuntu 24.04;
the GitHub workflows have not run remotely yet.

## External state and next task

GitHub CLI authentication, connected Supabase project inventory and Cloudflare
account/Worker inventory were inspected read-only. The user selected
[AaronPilk/side-quest-me](https://github.com/AaronPilk/side-quest-me) as the source
repository. Its origin is configured locally; GitHub runs checks on push and
requires an explicit manual action to deploy. Existing Supabase projects and
Cloudflare Workers belong to other products and were not modified. The user is
creating a dedicated Supabase organization and project next. No schema was pushed
and no cloud resources, offers or sponsor agreements were created.

Docker is absent: the normal Container-inclusive dry run could not build its image.
The actual renderer ran locally; deployed Container, Queue and R2 behavior still need
staging validation. Real Supabase email, physical iPhone/Android/Safari capture,
real merchant fulfillment and cloud deletion/revocation have not been exercised.
Browser bundle inspection found no server-only secret/configuration markers; no real
secret files were created. Demo balances are simulated and demo offers cannot redeem.

The next task is to connect the new Supabase project and select the intended
Cloudflare account/resources, launch area/currency and operator identity.
Follow [README](../README.md), [database setup](DATABASE.md) and [media setup](MEDIA.md),
then run the two-account staging flow before activating any real funded offer.
Operator membership is granted only through an admin SQL connection, not profile
metadata. The operator records a real agreement and inventory; a scoped merchant
confirms a reservation once. Pause controls stop new claims/placements. Transient
render retries preserve evidence and never modify wallet awards.

AI parsing/vision is unconfigured; manual context and authored recommendations work.
Grand prizes/drawings, cars, checkout/subscriptions, social automation,
and self-service sponsor billing remain deliberately disabled.
