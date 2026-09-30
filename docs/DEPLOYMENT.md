# Sidequest deployment — 2026-09-30

The user selected the existing **Side quest Me** Supabase project in the **TRACT
Mortgage** organization. Do not create a replacement or reuse another app's resources.

## Prepared live resources

| Service            | Selected resource                  | Status                                                    |
| ------------------ | ---------------------------------- | --------------------------------------------------------- |
| GitHub             | `AaronPilk/side-quest-me`, `main`  | Application code pushed; Checks workflow runs on push     |
| GitHub environment | `production`                       | All eight deployment variables configured                 |
| Supabase           | `fpwpsxerogbwlnrvuurm`             | Eight migrations applied; 33 quests / 13 families seeded  |
| Cloudflare account | `9c332c75b96cc642621dad5d86d4bf18` | Existing Aaron account                                    |
| Worker             | `sidequest-me`                     | Bootstrap responds 503 until the full application release |
| R2                 | `sidequest-me-media`               | Created; public `r2.dev` access disabled                  |
| Queue              | `sidequest-me-renders`             | Created; application consumer installed by deployment     |
| Container          | `sidequest-me-sidequestrenderer`   | Created by the first full deployment; not yet deployed    |

Target origin: `https://sidequest-me.aaron-9c3.workers.dev`.
The Supabase Site URL and exact `/auth/callback` allowlist entry already match it.
Email sign-in and email confirmation remain enabled. Custom SMTP is not configured.

All six server secrets are installed on the Worker: `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `RENDERER_INTERNAL_TOKEN`,
`REDEMPTION_SIGNING_KEY`, and `SHARE_SIGNING_KEY`. No secret values belong in this
repository. Ignored local bootstrap files are restricted to the local user.

`SIDEQUEST_AREA` currently reads **Sidequest pilot**, with USD currency. There are
no merchants, funded rewards, balances, or accounts seeded. Choose the actual pilot
area before creating geographically scoped offers.

## Finish the first release

1. In [Cloudflare account API tokens](https://dash.cloudflare.com/9c332c75b96cc642621dad5d86d4bf18/api-tokens),
   create a deployment token scoped to this account. It needs Workers Scripts
   Edit, Workers R2 Storage Edit, Queues Edit, and Workers Containers Write/Edit.
   Permission labels can appear as Write rather than Edit. Do not grant access
   to other accounts. The connected API cannot create tokens for the user.
2. Save it as **CLOUDFLARE_API_TOKEN** in the repository's
   [production environment](https://github.com/AaronPilk/side-quest-me/settings/environments).
   Alternatively run this command, then paste the token into the hidden prompt:

   ```sh
   gh secret set CLOUDFLARE_API_TOKEN --repo AaronPilk/side-quest-me --env production
   ```

3. After the Checks workflow passes, dispatch the existing deployment workflow:

   ```sh
   gh workflow run deploy.yml --repo AaronPilk/side-quest-me --ref main -f environment=production
   gh run list --repo AaronPilk/side-quest-me --workflow deploy.yml --limit 1
   ```

   GitHub's Ubuntu runner builds the FFmpeg Docker image. The workflow builds the
   exact configured Worker and frontend together, then runs Wrangler. Avoid also
   enabling a separate Cloudflare Git auto-deployment. A missing token or invalid
   browser Supabase configuration now fails before installation/build.

4. Confirm the workflow, Worker, queue consumer, and Container rollout complete.
   Check `/api/health`, the Create flow, sign-in, persistence, and a real three-clip
   render. A Worker URL alone does not prove its Container is ready.

The Cloudflare account's Container billing/availability has not been verified by a
full deployment. If Cloudflare asks for a plan upgrade, review that in the dashboard
before proceeding. No billing plan was changed during setup.

## Before inviting users

Configure a sender domain and custom SMTP in
[Supabase Authentication email settings](https://supabase.com/dashboard/project/fpwpsxerogbwlnrvuurm/auth/smtp).
Use your chosen email provider's SMTP host, port, username, password, and verified
From address. Keep email confirmation enabled. Supabase's default sender is limited
to project-team addresses; see [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

For live Apple Maps place search, install `APPLE_MAPS_TOKEN` on the Worker using a
public MapKit JS token restricted to the deployed domain. Never upload Apple's
`.p8` signing key to the frontend. See [Maps setup](MAPS.md). Without this token,
the app clearly presents the manual-location fallback.

Optional later: connect your own domain, update `SIDEQUEST_ORIGIN` and Supabase's
Site URL/callback allowlist, and rebuild. A custom domain is not required for the
initial `workers.dev` release.

## Verification completed during setup

- Hosted migration history matches all eight local migrations; a second dry run
  reports the remote database up to date.
- All 30 public and nine private application tables have RLS. Browser roles cannot
  execute service-only mutation RPCs. No example economic records were seeded.
- Hosted security/performance advisors have no warnings or errors. Informational
  notices describe deliberately service-only tables, unused indexes, and connection
  allocation on the new empty project.
- The optional hosted auto-RLS helper's browser execution grant was removed by a
  compatible migration; its event-trigger behavior remains tested.
- Local database regression suite, deployment-config checks, lint, typecheck, and
  production-configured build passed. The browser bundle contains none of the four
  server-only secret values. Previous local app verification covered 242 unit tests
  and 48 browser scenarios; public-cloud end-to-end verification remains pending.
