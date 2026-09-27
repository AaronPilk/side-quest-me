# Build status — 2026-09-27

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
account/Worker inventory were inspected read-only. Existing Supabase projects and
Cloudflare Workers belong to other products and were not modified. No intended
Sidequest repository/project/resource destination was supplied; no remote was guessed,
no schema was pushed and no cloud resources, offers or sponsor agreements were created.

Docker is absent: the normal Container-inclusive dry run could not build its image.
The actual renderer ran locally; deployed Container, Queue and R2 behavior still need
staging validation. Real Supabase email, physical iPhone/Android/Safari capture,
real merchant fulfillment and cloud deletion/revocation have not been exercised.
Browser bundle inspection found no server-only secret/configuration markers; no real
secret files were created. Demo balances are simulated and demo offers cannot redeem.

The next task is to select the intended GitHub repository, fresh Supabase staging
project, Cloudflare account/resources, launch area/currency and operator identity.
Follow [README](../README.md), [database setup](DATABASE.md) and [media setup](MEDIA.md),
then run the two-account staging flow before activating any real funded offer.
Operator membership is granted only through an admin SQL connection, not profile
metadata. The operator records a real agreement and inventory; a scoped merchant
confirms a reservation once. Pause controls stop new claims/placements. Transient
render retries preserve evidence and never modify wallet awards.

AI parsing/vision is unconfigured; manual context and authored recommendations work.
Grand prizes/drawings, cars, checkout/subscriptions, public feeds, social automation,
and self-service sponsor billing remain deliberately disabled.
