# Sidequest deployment — 2026-09-30

The app is live at **https://sidequest-me.aaron-9c3.workers.dev**. The user selected
the existing **Side quest Me** Supabase project in the **TRACT Mortgage** organization.
Do not create a replacement or reuse another app's resources.

## Live resources

| Service            | Selected resource                  | Status                                                          |
| ------------------ | ---------------------------------- | --------------------------------------------------------------- |
| GitHub             | `AaronPilk/side-quest-me`, `main`  | Checks on push; manual production deployment                    |
| GitHub environment | `production`                       | Eight variables and account-scoped deployment token installed   |
| Supabase           | `fpwpsxerogbwlnrvuurm`             | Nine migrations; 1,113 published variants / 73 families         |
| Cloudflare account | `9c332c75b96cc642621dad5d86d4bf18` | Existing Aaron account                                          |
| Worker             | `sidequest-me`                     | Production app; health returns 200                              |
| R2                 | `sidequest-me-media`               | Private; public `r2.dev` disabled                               |
| Queue              | `sidequest-me-renders`             | Producer, consumer, and five-minute recovery schedule installed |
| Container          | `sidequest-me-sidequestrenderer`   | FFmpeg image deployed; one instance maximum                     |

The first complete release succeeded in [GitHub Actions](https://github.com/AaronPilk/side-quest-me/actions/runs/36740095380).
The subsequent feedback release and full-length render verification are in progress.
The renderer configuration now specifies 1 vCPU, 3 GiB memory, and 4 GB disk to
support the 45-second maximum reel within its four-minute encoding budget. No
billing plan was changed. See [media verification](MEDIA.md).

Supabase's Site URL and exact `/auth/callback` allowlist match the live origin.
Email sign-in and email confirmation are enabled. All six server secrets are
installed: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`RENDERER_INTERNAL_TOKEN`, `REDEMPTION_SIGNING_KEY`, and `SHARE_SIGNING_KEY`.
Secret values stay out of source and browser bundles. Local recovery files are
ignored and restricted to the local user.

`SIDEQUEST_AREA` currently reads **Sidequest pilot**, with USD currency. No funded
rewards, merchant inventory, wallet credits, or operator accounts were seeded.
Choose the actual pilot area before creating geographically scoped offers.

## Future releases

The saved GitHub token now has Workers Scripts Edit, Workers R2 Storage Edit,
Queues Edit, and Workers Containers Write/Edit. It does not need replacing.
After Checks passes, deploy with:

```sh
gh workflow run deploy.yml --repo AaronPilk/side-quest-me --ref main -f environment=production
gh run list --repo AaronPilk/side-quest-me --workflow deploy.yml --limit 1
```

GitHub's Ubuntu runner builds the FFmpeg Docker image and the explicitly selected
Worker/frontend configuration. Do not enable a competing Cloudflare Git deployment.
A missing credential or invalid public Supabase configuration fails before build.
The default repository Wrangler names are development resources; never deploy
that configuration directly over the selected production app.

## Remaining provider setup

Configure a sender domain and custom SMTP in
[Supabase Authentication email settings](https://supabase.com/dashboard/project/fpwpsxerogbwlnrvuurm/auth/smtp)
before inviting ordinary users. Supply the provider's SMTP host, port, username,
password, and verified From address. Keep email confirmation enabled. Supabase's
default sender is limited to project-team addresses;
see [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

For in-app Apple Maps search, install `APPLE_MAPS_TOKEN`, a public MapKit JS token
restricted to the deployed domain. Apple's private `.p8` key must never enter the
frontend. For live nearby event listings, install server-only `TICKETMASTER_API_KEY`.
Both integrations have honest unconfigured states; current-area selection and
external browsing remain available. Eventbrite is an external browsing link, not
an automated event feed. See [provider setup and limitations](MAPS.md).

A custom domain is optional. If adding one, update `SIDEQUEST_ORIGIN`, Supabase's
Site URL and exact callback, and the Apple token domain allowlist, then rebuild.

## Verification record

- The hosted catalog migration is additive; original IDs and historical snapshots
  remain unchanged. The remote migration dry run reports up to date.
- Hosted security advisors report no warnings or errors. All application tables
  retain RLS and service-only mutation RPC permissions.
- Live two-account verification passed Auth, profile save/edit/removal, confirmed
  preference matching, boundaries, private uploads, and cross-account denial.
- The initial video test exposed lost stream-length metadata between the Container
  SDK and R2. Fixed-length streaming is covered by eight actual workerd tests,
  including exact bytes, truncation, overflow, source/storage failures and checksum
  rejection. The production rerun is pending this release.
- Temporary verification accounts and media from the first run were deleted;
  retained records were redacted and synthetic footage earned no rewards.
- Local typecheck, lint, 272 unit tests, deployment configuration checks, isolated
  PostgreSQL regression/advisor tests, and build pass. Final browser and production
  verification results will be recorded after the new release.
