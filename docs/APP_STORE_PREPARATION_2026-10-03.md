# App Store preparation — October 3, 2026

This is a historical October 3 checkpoint. See
[the October 4 checkpoint](APP_STORE_PREPARATION_2026-10-04.md) for the updated
review contact, support mailbox, screenshot set and Build 13 delivery status.

The editable App Store version now selects **1.0.0 (12)**. It remains
`PREPARE_FOR_SUBMISSION`, with **manual release** selected. No App Review
submission or public release was sent. Build 12 remains available in internal
TestFlight.

## Verified work

- App `6817917086`, bundle `com.aaronpilk.sidequest`, version record
  `07c31559-9097-43fb-9d6f-2744374be7aa`.
- Selected build `cff67bf8-3f88-40ce-9082-67b696669798`, build 12, processing
  `VALID`. Association returned HTTP 204; independent readback confirms the
  same build and `releaseType=MANUAL`.
- Build 12's [full source checks](https://github.com/AaronPilk/side-quest-me/actions/runs/37081949991)
  succeeded: 744 unit tests, 277 browser scenarios, database checks, lint,
  typecheck, fixtures and production build.
- Archived/exported native metadata audit confirms iPhone-only portrait,
  minimum iOS 15, camera/microphone/location/Photos-save descriptions, native
  auth scheme, distribution signing and FileTimestamp reason `C617.1`.
  Durable camera recovery itself stores files locally and adds no collection
  category merely by retaining those files on the device.
- English listing text, Lifestyle/Social Networking categories, free US-only
  pricing and live privacy/support URLs remain saved. Apple's `APP_IPHONE_67`
  screenshot set now contains three `COMPLETE` images; hashes and order were
  independently verified.
- Fresh signed-out checks confirmed all four live policy pages render without
  horizontal overflow or page errors. The missing public support contact is
  still honestly displayed.
- Privacy text now distinguishes saved drafts from native recovery files
  and describes expiry checked on reopening. Support text includes ordinary
  password sign-in. Typecheck, lint and all six public-information browser
  scenarios passed after these copy changes. Commit
  `75531f7cbeb09010340033d0c475f59dc75ee425` was deployed successfully in
  [production run 37139734285](https://github.com/AaronPilk/side-quest-me/actions/runs/37139734285),
  Worker version `e52a2f59-82ad-4fdf-94cf-12aace008fdc`. **These copy updates
  are live on the production Worker but absent from uploaded TestFlight Build 12.**
- The same commit's [complete Checks run 37139683330](https://github.com/AaronPilk/side-quest-me/actions/runs/37139683330)
  also passed, including unit, database and browser suites, lint and typecheck.

Private Apple readback is retained in `.local/appstore-build12-associated-readback.json`,
`.local/appstore-2026-10-03-screenshots.json`, and the corresponding association
and manual-release response files. No credentials are copied into this record.

## Screenshots

Apple screenshot set `77d9b143-e9fd-433a-be3c-70a6c4d00245` (`APP_IPHONE_67`)
contains these three visually inspected, processed images in verified order:

1. `02-your-kind-of-quest` — the real budget slider and group scope.
2. `04-your-next-detour` — the real Apple Maps place selection in Charlotte.
3. `07-great-stories-start-here` — the production welcome screen.

Fresh Apple API readback confirmed all three remain `COMPLETE`. Local file
checksums match Apple's delivered checksums, with exact order retained in
[`apple-delivery.json`](../app-store/2026-10-03/artwork/apple-delivery.json).

[`store-draft-manifest.json`](../app-store/2026-10-03/artwork/store-draft-manifest.json)
explicitly describes this **partial three-image set**.
[`captures-ready.json`](../app-store/2026-10-03/captures-ready.json) and
[`artwork-manifest.json`](../app-store/2026-10-03/artwork/artwork-manifest.json)
contain the two completed feature captures. The six-screen capture guide and
camera / finished-video manifests remain plans; generation, accepted quest,
filming, Series and journal captures are not marked complete.

A fresh **production** Simulator bundle was compiled, installed and launched
on Sidequest's `F9FFF0C9-F9F9-41C0-8CC2-AFA5E6C47DA4` device only. Packaged
release verification passed. It includes the policy copy updates and is
distinct from uploaded TestFlight Build 12 despite the unchanged local Debug
build number. The earlier window-selection problem was recovered by minimizing
the other Simulator windows; no other device's app data was altered.

Ordinary native reviewer sign-in succeeded without authenticated-state
injection. The personal profile nickname is **Sidequest Explorer**. The
**Daytime** preference was saved and the explicit **Finish later / Save and
explore** exit was verified; revisiting the preference resume flow is still
untested. The real quest plan is **Daytime, Full Send, Friends, 4 people,
$200 for the group, 3 hours, at a venue**. Apple Maps returned real Go karting
results for Charlotte, NC, and **Victory Lane Indoor Karting** was selected
through the normal place picker. The Mac locked again before generation,
acceptance and journal verification, so the remaining walkthrough and captures
are pending another unlock.

The standard 9:41 screenshot status-bar override was cleared afterward.

Native Chrome control recovered, but Sidequest's Apple browser login is
expired. The owner was asked to sign back in. No privacy declaration was
accepted and no App Review submission was made.

The Simulator has no camera hardware. Use a physical iPhone live-preview capture
or a genuine finished-video/import screen with matching copy. Never replace a
missing preview with invented working footage. A private authentic Series is
sufficient; publishing solely for screenshot imagery is unnecessary.

## Account and operating readiness

Read-only hosted checks confirm email signup enabled, Apple/social providers
disabled, the ordinary reviewer account confirmed and unbanned, 22 migrations,
and **zero active operator memberships, community posts and business profiles**.
The hosted audit changed no account, role or Auth setting. The subsequent
ordinary reviewer walkthrough saved only its profile and preference choices.

Fresh native Chrome inspection of this exact production project confirmed
**custom SMTP off** and an **empty Auth Hooks list**. No sender configuration was
changed. [Supabase's SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)
states the built-in sender refuses addresses outside the project's team and is
not intended for production. Public signup delivery must be demonstrated with
a production sender and normal new-user flow; an existing password account is
not proof of new-user onboarding.

The protected ordinary reviewer account is ready for Apple's review-access
fields. Apple rejected the credentials-only update with HTTP 409 because the
review contact's first/last name, email and international-format phone are all
required. Independent readback confirms the review credentials remain unset.
The contact identity must come from the owner; no substitute was invented.

Email-only proprietary sign-in is separate from the earlier Apple-first product
discussion; [Apple guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services)
includes an exception for an app using exclusively its own account system.
There is no Apple sign-in implementation or entitlement in Build 12.

Public reels are held for independent review, but the queue is unstaffed until
an authorized operator is appointed. The existing `operator` role also provides
other administrative functions, including licensing operations; disclose that
scope before assigning a person solely to moderate content. Verify review,
return, approval, reporting, blocking and removal with separate ordinary creator
and operator accounts. [Apple UGC requirements](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)
cover filtering, reporting, blocking and published contact.

Paid brand licensing has manual terms/payment/permission verification and no
checkout/IAP implementation. Its initial launch scope and actual operation need
an owner decision and appropriate reviewer access. Do not claim automatic
payouts or assume a payment exception applies to this exact flow.

## Owner inputs and final work

Pending owner answers were requested for:

1. App Review contact name/email/phone, monitored public support email and
   copyright identity.
2. Specific existing account and authorization for moderation, with the actual
   operator scope explained before assignment.
3. Build 12 physical iPhone preview/recording/audio/export results.
4. Initial paid-licensing launch scope.
5. Production email provider and verified sender setup, without posting secrets.
6. Unlock the Mac again to continue quest generation, acceptance and captures.
7. Renewed Apple browser sign-in for the final App Privacy declaration.

Then finish support configuration, native reviewer walkthrough, genuine feature
images, protected review-access fields, matching review notes and any resulting
new native build/deployment. Verify hosted signup and moderation operation.
The iOS policy/support routes are bundled locally; adding the monitored support
contact requires a new native build as well as a Worker deployment.

App Privacy remains a saved draft pending the owner's action-time acceptance
of Apple's accuracy/compliance/update declaration. Content-rights answers and
copyright remain incomplete. Obtain truthful owner rights answers rather than
inventing them. The saved 18+ rating is not age verification; describe only the
actual self-declared outing eligibility and moderation controls.

Once all requirements are satisfied, complete Apple's final privacy/content
declarations and App Review submission. Manual release keeps public availability
under owner control after approval.
