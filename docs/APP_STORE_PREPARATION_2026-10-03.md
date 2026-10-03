# App Store preparation — October 3, 2026

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
  pricing and live privacy/support URLs remain saved. The existing welcome
  artwork is `COMPLETE`; the screenshot set still contains only that image.
- Fresh signed-out checks confirmed all four live policy pages render without
  horizontal overflow or page errors. The missing public support contact is
  still honestly displayed.
- Local privacy text now distinguishes saved drafts from native recovery files
  and describes expiry checked on reopening. Support text includes ordinary
  password sign-in. Typecheck, lint and all six public-information browser
  scenarios passed after these copy changes. **These local copy updates are
  not yet deployed or included in Build 12.**

Private Apple readback is retained in `.local/appstore-build12-associated-readback.json`,
`.local/appstore-2026-10-03-screenshots.json`, and the corresponding association
and manual-release response files. No credentials are copied into this record.

## Screenshots

Prepared a six-screen order: concrete quest, personalization, filming, nearby
places, Series and private journal. See
[`capture-guide.json`](../app-store/2026-10-03/capture-guide.json) and the live
camera / finished-video manifests in that directory. These are **capture plans,
not completed feature images**. Use the existing deterministic compositor around
authentic native captures, then visually inspect each output and verify Apple's
processing and order.

Native Simulator observation reached the production welcome screen. Attempts to
scroll initially returned `noWindowsAvailable`. After the owner reported the Mac
ready, the native control tool selected the separate **Rendprop Beta Polish
20261002** Simulator window; its Window-menu operation timed out. No Rendprop
app data was changed. The owner was asked to foreground the Sidequest
**iPhone 17 Pro Max** window. Browser control also timed out twice while binding
the existing Sidequest App Privacy tab. Resetting the control session did not
resolve the Simulator window selection. Ordinary native reviewer login and the
six feature captures remain unverified.

A fresh **production** Simulator bundle was then compiled, installed and
launched successfully on Sidequest's `F9FFF0C9-F9F9-41C0-8CC2-AFA5E6C47DA4`
device only. Packaged release verification passed and a device screenshot
confirms the signed-out welcome without DEMO/PILOT labels. It includes the local
policy edits and is distinct from the uploaded TestFlight Build 12 despite the
unchanged local Debug build number. Native control still binds the separate
Rendprop window. The ordinary reviewer login and feature captures remain
pending; no authenticated state was injected.

Native Chrome control recovered when bound to the installed app's full path.
Reloading Sidequest's Apple App Privacy tab revealed an expired Apple login
session. The owner was asked to sign back in. No privacy declaration was
accepted and no App Review submission was made.

The Simulator has no camera hardware. Use a physical iPhone live-preview capture
or a genuine finished-video/import screen with matching copy. Never replace a
missing preview with invented working footage. A private authentic Series is
sufficient; publishing solely for screenshot imagery is unnecessary.

## Account and operating readiness

Read-only hosted checks confirm email signup enabled, Apple/social providers
disabled, the ordinary reviewer account confirmed and unbanned, 22 migrations,
and **zero active operator memberships, community posts and business profiles**.
No account, role or hosted Auth setting was changed.

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
6. Correct Sidequest Simulator window selection for ordinary login and captures.
7. Renewed Apple browser sign-in for the final App Privacy declaration.

Then finish support configuration, native reviewer walkthrough, genuine feature
images, protected review-access fields, matching review notes and any resulting
new native build/deployment. Verify hosted signup and moderation operation.

App Privacy remains a saved draft pending the owner's action-time acceptance
of Apple's accuracy/compliance/update declaration. Content-rights answers and
copyright remain incomplete. Obtain truthful owner rights answers rather than
inventing them. The saved 18+ rating is not age verification; describe only the
actual self-declared outing eligibility and moderation controls.

Once all requirements are satisfied, complete Apple's final privacy/content
declarations and App Review submission. Manual release keeps public availability
under owner control after approval.
