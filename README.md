# Sidequest

A mobile-first React/Vite PWA for choosing a real-world quest, recording three
moments, exporting a private reel, and earning server-controlled progress.

**Current state:** working isolated local demo, actual local FFmpeg rendering,
and tested PostgreSQL migrations. No Sidequest production account, merchant,
or cloud deployment has been provisioned. Demo rewards are examples only:
they cannot spend points, reserve stock, or issue codes.

## Run locally

Use Node 22.12+ or 24 LTS, npm, FFmpeg/ffprobe, and PostgreSQL 17 developer tools
(`pg_config`, `initdb`, `pg_ctl`, `psql`). The renderer needs no Docker locally.

```sh
npm ci
npm run render:dev
# In another terminal:
npm run dev:demo
```

Open **http://127.0.0.1:5173**. The banner always identifies the local demo.
The ten-question onboarding is editable; import and AI are optional. Select an
at-home, Chill, zero-budget outing for the quickest path. Accept a quest,
record/upload three 5–15-second selections, and complete it. The local renderer
saves actual files under `.local/media`; demo profile/progress stays in browser
storage. Local progress is a simulation, not proof of the production economy.

The first renderer run needs `sharp` from `npm ci`. Camera access needs localhost
or HTTPS. Permission denial has an equal file-upload/capture alternative. Generated
fixture footage is synthetic and must not be represented as a genuine quest attempt.

## Commands and verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:db:advisors  # installed Supabase CLI + openssl required
npm run render:fixtures
npm run test:browser
npm run build
npm run cf:types
node scripts/config-smoke.mjs
```

Database tests start a fresh temporary PostgreSQL cluster, apply every migration
and the thirty-variant seed, run real concurrent transactions and RLS checks,
then stop/remove the cluster. They do not contact an existing database. The
advisor mode briefly enables loopback TLS for the CLI. It is also local.

The render proof produces `.local/fixtures/sidequest-proof.mp4`: real H.264/AAC,
1080×1920, about 21 seconds. It checks decoding, dimensions, audio/silence,
bytes and SHA-256 after downloading. It covers three source orientations,
replacement immutability, retries and hostile manifests.

The Worker development server uses `npm run dev`. Without secrets it exposes
`/api/health` and an honest setup error for dependent operations. Local Container
emulation is disabled because Docker is not installed on this workstation;
use the real local render adapter above or enable it deliberately with Docker.

## Connect staging

1. Choose the intended GitHub repository, Supabase project and Cloudflare account.
   No existing unrelated project should be repurposed. This repository has no remote.
2. Copy `.env.example` to `.env.local` and `.dev.vars.example` to `.dev.vars`.
   Only `VITE_SUPABASE_URL` and the public publishable key go in the browser.
   Keep secret keys and renderer/redemption/share signing keys server-only.
3. Apply [the migration and seed](supabase/) to the selected fresh **staging**
   database after inspecting its target. See [database operations](docs/DATABASE.md).
   Configure Supabase email delivery and allowlist only the actual staging origin’s
   `/auth/callback`. Supabase anonymous accounts cannot accept or earn.
4. Configure separate staging R2, Queue and Container resources. Keep R2 private.
   The Worker uses authenticated streaming uploads, so browser-to-R2 CORS or R2
   access keys are not required. See [media setup](docs/MEDIA.md).
5. Set server `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `RENDERER_INTERNAL_TOKEN`, `REDEMPTION_SIGNING_KEY`, `SHARE_SIGNING_KEY`.
   Generate independent random secrets of at least 32 characters. Set `APP_ORIGIN`
   to the exact deployed HTTPS origin, `LAUNCH_AREA` to the real pilot area,
   and `LAUNCH_CURRENCY=USD` for the single-currency pilot.
6. Grant the first operator out of band using the scoped SQL example in
   [DATABASE.md](docs/DATABASE.md). Neither profile metadata nor an API endpoint
   can grant roles. An operator records an approved merchant/agreement/funding
   reference, then a funded offer with complete terms, dates and inventory.
   The merchant receives only its own database membership.
7. Build and deploy the selected configuration through the documented manual
   GitHub Actions deployment. Test email, two accounts, private uploads, Container
   encoding, share/revoke, reserve, scoped merchant consume and deletion in staging
   before a public pilot. Never attach a preview to production inventory.

The repository’s default Wrangler resource names are **development configuration**,
not evidence those resources exist. `scripts/configure-environment.mjs` creates a
separate configuration from explicit inputs; it never creates remote resources.
Use one deploy owner (GitHub Actions), not a second auto-deploy integration.

The **Deploy selected environment** workflow reads these GitHub environment
variables: `CLOUDFLARE_ACCOUNT_ID`, `SIDEQUEST_WORKER`, `SIDEQUEST_BUCKET`,
`SIDEQUEST_QUEUE`, `SIDEQUEST_ORIGIN`, `SIDEQUEST_AREA`, `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`. Its environment secret is `CLOUDFLARE_API_TOKEN`.
The six Worker secrets listed above must be installed separately for that Worker.
Use environment protection for production and run the Checks workflow before
dispatching a release from `main`.

After selecting actual destinations, the infrastructure preparation commands are:

```sh
# Set the explicit SIDEQUEST_* inputs documented above and SIDEQUEST_ENV=staging.
node scripts/configure-environment.mjs
npx wrangler r2 bucket create "$SIDEQUEST_BUCKET" --config .local/wrangler.target.json
npx wrangler queues create "$SIDEQUEST_QUEUE" --config .local/wrangler.target.json
# Prepare this ignored file with the six actual staging-only Worker secrets.
npx wrangler secret bulk .local/staging-secrets.env --config .local/wrangler.target.json
SIDEQUEST_CONFIG=.local/wrangler.target.json npm run build
npx wrangler deploy --dry-run
```

These commands create resources only when deliberately run with a selected target;
they were **not** run against a remote account during this build. Full dry-run
validation needs Docker. Let the Actions workflow perform the actual deployment.
Configure the chosen hostname and Supabase callback allowlist to match
`SIDEQUEST_ORIGIN`, then exercise the staging checklist in [MEDIA.md](docs/MEDIA.md).

## What is here

- `src/`: four consumer tabs, email sign-in, onboarding, discovery, capture/review,
  private journal, export, reward reservation UI, and restricted operator tools.
- `shared/`: canonical types, hard filters, deterministic ranking and thirty
  complete authored variants across ten families. Branding lives in `APP_CONFIG`.
- `worker/`: JWT/session checks, RLS reads, narrow transaction endpoints,
  private media, explicit sharing, Queue dispatch and scheduled recovery/cleanup.
- `supabase/`: schema, immutable ledger/evidence/snapshots, fenced jobs,
  RLS, service-only invoker RPCs, reward inventory and a reproducible catalog seed.
- `renderer/`: narrow authenticated FFmpeg service, shared manifest and Dockerfile.
- `tests/`: domain/media/browser checks plus actual PostgreSQL concurrency tests.

XP and points are separate. Eligible awards are 100/10, 250/25 or 500/50, capped at
three rewarded runs per UTC day and one family award per thirty days. Rendering,
sharing and a favorable reaction do not determine awards. Review freezes evidence
and evaluates eligibility at finalization. Rendering retries never award again.

## Operational boundaries

Demo offers say **View demo**. Live offers need verified funding and stock. Pause an
offer to stop new claims while preserving issued reservations. Merchant tokens are
private, signed, short-lived and single-use. Cancel/expiry refunds the original
price once. See the database guide for consumption, reconciliation and recovery.

Campaigns are separate from reward offers. An operator records the approved provider,
funding reference, time window, area, category/family scope and visible disclosure.
Only matching funded campaigns can appear after ordinary eligibility filtering.
The reviewed campaign version is checked again at acceptance and its disclosure
stays frozen in the run, shared page and encoded reel. **Pause campaign** stops new
placements while preserving existing accepted stories. No real campaign is seeded.

Source retention is conditional at 30 days: do not delete the only recoverable
footage while a render is failing or evidence is under review. Reviews close after
14 days. Saved reels are limited to 50 per account, and total media to 2 GiB.
Explicit deletion immediately removes access; retryable cleanup removes R2 bytes.
Minimal pseudonymous ledger/audit records remain. Revoked links stop new app access;
downloaded copies cannot be recalled.

Real-device iPhone/Android camera behavior, real Supabase email, deployed Container
builds and cloud end-to-end behavior require staging verification. No funded
sponsors or live rewards are asserted. AI parsing/vision is unconfigured and the
manual authored flow remains useful. Public feeds, billing, subscriptions, grand
prizes/drawings, automatic social publishing and advanced video editing are deferred.

See [BUILD_STATUS](docs/BUILD_STATUS.md) for measured results and remaining setup,
[DECISIONS](docs/DECISIONS.md) for meaningful design choices, and [LICENSES](LICENSES.md).
