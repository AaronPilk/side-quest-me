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

The current application release is `9eb8bdf`, deployed by
[GitHub Actions run 36750945163](https://github.com/AaronPilk/side-quest-me/actions/runs/36750945163).
It applies the owner's violet branding; see [the brand guide](BRAND.md).
Deployment lint, typecheck, 278 unit tests and production build passed. Local
responsive/navigation checks and the real render fixture also passed. The live
browser shows the new mark and palette without console errors or horizontal
overflow; the published favicon, app icons, mark and manifest match the committed
assets byte for byte. No database changes were needed.

The brand release's [complete Checks run](https://github.com/AaronPilk/side-quest-me/actions/runs/36750276217)
was still installing apt dependencies when the live release was verified; it had
reported no test result or failure yet. The previous application release `02a27a8`
passed [the complete suite](https://github.com/AaronPilk/side-quest-me/actions/runs/36747885316)
after the focused media fixes. The production media evidence below is from that
release; the brand change alters only the renderer's colors.

The renderer uses **2 vCPU, 6 GiB memory, and 4 GB disk**, capped at one instance.
No billing plan was changed. The complete 45-second production test passed on its
first attempt: 90.4 seconds of rendering, HTTP 200 download, matching bytes/SHA-256,
and independent decoding of the 1080×1920 H.264/AAC file. Cross-account access was
denied. Cleanup completed at 17:05:34 UTC: both temporary Auth accounts and all
test R2 media were removed, retained records redacted, and rewards stayed zero.
See [media verification](MEDIA.md).

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
- Production media verification passed three private uploads, first-attempt
  45-second rendering, a full HTTP 200 download, matching byte count and checksum,
  independent decoding, and denial of access from a second account. Runtime tests
  cover fixed-length R2 streams, server timeout classification, and playback ranges.
- Temporary verification accounts and media were removed through the application
  deletion flow, with no recovery fallback. Retained records were redacted and
  synthetic footage earned no rewards.
- Local typecheck, lint, 278 unit tests, deployment configuration checks, isolated
  PostgreSQL regression/advisor tests, 55 browser scenarios, and the production
  build pass. Actual server secret values are absent from the browser artifact.
  The full production media verification above also passed.
