# Sidequest iOS release guide

Status checked **September 30, 2026**. The repository now contains a Capacitor iOS app that bundles the React interface and connects to the existing Cloudflare/Supabase backend. The App Store Connect record **SidequestMe** (`6817917086`) exists for bundle `com.aaronpilk.sidequest`, signing team **`5F5C5G25Y6`** is configured, and a **signed archive succeeded**. **Upload is pending; no processed TestFlight build or public release is confirmed.** Physical iPhone verification remains a separate requirement.

## Project and build commands

| Item                    | Current value                                                        |
| ----------------------- | -------------------------------------------------------------------- |
| App name                | Sidequest                                                            |
| App Store Connect       | SidequestMe · `6817917086`                                           |
| Signing team            | `5F5C5G25Y6`                                                         |
| Bundle identifier       | `com.aaronpilk.sidequest`                                            |
| Native project          | `ios/App/App.xcodeproj`                                              |
| Xcode scheme            | `App`                                                                |
| Bundled web assets      | `dist-ios`, copied into `ios/App/App/public` by Capacitor            |
| Native configuration    | `capacitor.config.ts`, `vite.ios.config.ts`                          |
| Backend and public site | `https://sidequest-me.aaron-9c3.workers.dev`                         |
| Supabase project        | `fpwpsxerogbwlnrvuurm` — the existing approved Side quest Me project |
| Auth callback           | `com.aaronpilk.sidequest://auth/callback`                            |

Use Node 22.12 or newer and the installed Xcode toolchain. Xcode 26.4.1 and an iOS 26.4 Simulator were present during this audit. Apple currently requires Xcode 26 or later with the iOS 26 SDK or later for uploads; recheck this before submitting a future release. The SDK version and the app's minimum supported iOS version are separate settings. [Apple requirements](https://developer.apple.com/news/upcoming-requirements/)

```sh
cd "/Users/pilksclaes/Side Quest Me"
npm ci
cp -n .env.ios.example .env.ios.local
```

Set the four public build values in `.env.ios.local`: `VITE_API_ORIGIN`, `VITE_PUBLIC_ORIGIN`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. The example contains the existing service origins; replace the publishable-key placeholder. These values are included in the app bundle. Never use a Supabase secret/service-role key, Cloudflare token, Apple private key, or signing credential in a `VITE_` variable.

For a production-connected device or release build:

```sh
npm run ios:sync
npm run ios:verify:release
npm run ios:open
```

`ios:sync` builds production assets and syncs plugins/assets into Xcode. Run it after frontend or plugin changes; opening Xcode alone does not update bundled JavaScript. `ios:verify:release` checks the copied build record for production HTTPS configuration. It does not prove signing, API availability, privacy compliance, or device behavior.

For the separate local demonstration:

```sh
npm run ios:simulator -- --demo
```

`ios:simulator -- --demo` builds, syncs, installs, and launches the demo in an available iPhone Simulator; omit `--demo` for a production-connected Simulator build. Add `--device=SIMULATOR_UUID` to choose one. Demo identities and records are local fixtures, not production users or payments. Demo media uses the development server at `127.0.0.1:5173` and its renderer proxy; run `npm run dev:demo` and `npm run render:dev` in separate terminals when testing that flow. Simulator loopback reaches this Mac; an actual iPhone's loopback does not. Re-run **`npm run ios:sync`** before archiving for TestFlight. Do not distribute the demo bundle as the production app.

## Remaining release blockers

The iOS target declares `ITSAppUsesNonExemptEncryption=false`. The current client uses platform HTTPS and Web Crypto for authentication; it does not ship proprietary encryption. Review this declaration when adding cryptographic libraries or features. [Apple export documentation](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)

| Area                     | Existing implementation                                                                                                                             | Work required before public submission                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signing and distribution | App Store Connect record `6817917086` and team `5F5C5G25Y6` are configured; signed archive succeeded.                                               | Upload the final rebuilt signed archive, wait for App Store Connect processing, answer compliance questions, assign the internal TestFlight group and verify installation. A successful archive does not confirm upload or beta availability.                      |
| Native backend access    | Client uses configured HTTPS API/media URLs with bearer authentication. Native CORS support is included in the Worker code.                         | Deploy the compatible Worker with `NATIVE_APP_ORIGIN=capacitor://localhost`, then verify real signed-in requests and video responses from the app. A local build does not update the hosted API.                                                                   |
| Sign-in                  | Email magic links use PKCE with validated native callbacks and cold-start handling.                                                                 | Add the exact native callback to Supabase Auth's redirect allowlist while preserving the web callback. Verify external-email delivery/custom SMTP and both cold/warm app launches. Provide review access that Apple can actually use.                              |
| Policies and contact     | Account/preferences screens exist.                                                                                                                  | Publish actual privacy, support/contact, and community/usage terms pages and link them from Settings. No such app-accessible pages/contact channel were found in this audit. Creator licensing terms on individual offers are not general service terms.           |
| Objectionable UGC        | Users can report posts/offers and block accounts; operators can inspect/remove posts and suspend licensing. Original quest submissions have review. | Ordinary rendered reels publish immediately. There is no prepublication objectionable-video screening/moderation gate. Implement an effective posting filter/review process and staff report responses before opening public UGC.                                  |
| Content age controls     | Outing-specific adult eligibility exists.                                                                                                           | Public creator profiles/posts have no content-age classification or declared-age access gate. Decide the supported audience and implement appropriate controls for content exceeding it; the outing checkbox does not cover the public feed.                       |
| Commercial release scope | Exact-video licensing negotiations and operator-recorded fulfillment exist.                                                                         | Decide what commercial features ship on iOS, establish actual fulfillment/support, and assess the payment rules for that final model. There is no automatic payout, StoreKit purchase, Meta attribution, or Shopify integration. Do not market those as available. |
| Device reliability       | Unit/browser checks and Simulator builds can exercise portions of the system.                                                                       | Complete the physical-device matrix below, fix failures, and test the signed build through TestFlight.                                                                                                                                                             |

Apple's UGC rules cover filtering, reporting, blocking, and reachable contact information; creator-content rules also address age restrictions. A report button alone is insufficient. Payment treatment depends on the final transaction and storefront, so do not assume an external invoice automatically settles App Review eligibility. [App Review Guidelines, sections 1.2, 1.2.1, and 3.1](https://developer.apple.com/app-store/review/guidelines/)

## Account deletion audit

Deletion is implemented; it should not be rebuilt as a mere sign-out. The path is **Settings → Account settings → Delete my account** (`/account`). `DELETE /api/me` invokes `sq_delete_account`, removes public availability, revokes share links and roles, cancels pending work, clears profile text, and queues private media cleanup. The scheduled Worker retries storage cleanup, calls `sq_finalize_account_deletion`, deletes the Supabase Auth user, and marks the account deleted. Sign-out clears local capture drafts. Minimal accounting/licensing records intentionally remain.

On a disposable production test account, verify the entire chain, including storage deletion, revoked public links, the removed Auth user, and retry behavior when cleanup temporarily fails. Explain the retained records and actual deletion timing in the privacy policy and user feedback; do not promise immediate physical deletion. Apple requires an in-app deletion initiation path and expects retained data to be explained. [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

## Permissions and privacy disclosures

Inspect the final archived app's `Info.plist` and privacy manifest, not only repository files:

| Permission/configuration                       | Purpose and verification                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NSCameraUsageDescription`                     | Record user-initiated quest takes. Test allow, deny, and later re-enable.                                                                                                                   |
| `NSMicrophoneUsageDescription`                 | Record audio with those takes. Test camera allowed/microphone denied separately.                                                                                                            |
| `NSLocationWhenInUseUsageDescription`          | Optional nearby places/events lookup. Keep manual location usable when denied.                                                                                                              |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | Capacitor Geolocation's documented iOS configuration also lists this key. The app should still request foreground location only; do not add background location modes.                      |
| `NSPhotoLibraryAddUsageDescription`            | Explain saving a finished reel through the system share sheet. Verify Save Video on a device; Save to Files is a separate destination. Do not ask for broad library access merely to share. |
| URL scheme registration                        | Must match `com.aaronpilk.sidequest://auth/callback`; changes also require native handler and Supabase allowlist updates.                                                                   |
| Filesystem privacy manifest                    | Include `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1` for the Filesystem plugin, and inspect dependency manifests in Xcode's archive privacy report.                     |

The app uses foreground coordinates, not continuous location tracking. The installed Geolocation plugin's setup requirements are documented separately from user permission requests. [Capacitor Geolocation](https://capacitorjs.com/docs/apis/geolocation) Filesystem's required-reason manifest is distinct from permission strings and App Store privacy labels. [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem)

Native exports are temporary files in private Cache/`sidequest-shares`. Successful shares retain their file while the receiving app imports it; files older than 24 hours are removed on a subsequent launch/export. Failed or canceled exports are removed after the share operation ends. User-saved copies cannot be revoked by Sidequest.

App Store Connect privacy answers must reflect the deployed product and vendors: account email/user ID, profiles/imported summaries, photos/videos/audio, activity and licensing records, and any coordinates transmitted to places/events services. Audit each field's use, retention, linkage, and sharing instead of marking the app “collects no data.” There is no implemented advertising-attribution SDK here; reassess disclosures and tracking consent before adding one. [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)

## Required physical-device acceptance run

Simulator success demonstrates compilation, bundled app launch, navigation/layout, and supported simulated interactions. Mocked browser tests verify contracts and UI behavior. Neither proves real camera/audio, memory pressure, Photos sharing, mail callbacks, or background interruptions on an iPhone.

Use a signed production-connected build on at least one physical iPhone, plus the smallest supported screen and oldest supported OS available to the team:

1. Install fresh; complete email sign-in from Mail with the app running and force-closed. Test expired links, resend, sign-out, session refresh, and protected return destinations.
2. Create a quest with the selected intensity/group/budget/time unchanged. Skip profile questions, edit/remove imported text, force-close, and verify persistence.
3. Record one video with stop/add takes, leave and return to the draft, then save the whole session. Existing three-clip runs must also remain readable and renderable. Test microphone/camera denial, incoming interruption, background/foreground, app restart, front/back camera, silent/no-audio input, and storage pressure. Validate restored drafts, correct take order, full saved duration, and the five-to-sixty-second session limit.
4. Upload real camera media over Wi-Fi and cellular, including a slow/interrupted connection. Render, replay audio, save to Photos and Files, share to another installed app, and cancel sharing. Confirm the exported file plays independently and remains private until publication.
5. Publish a disposable reel; check another account's feed/profile, follow/unfollow, search, report, block/unblock, operator removal, and public-link revocation. Test account deletion and local/server cleanup with disposable accounts.
6. Test foreground location allowed/denied/approximate, external Apple Maps/events links, offline startup/retry, keyboard/safe areas, VoiceOver, larger text, reduced motion, and every enabled iPad/orientation configuration.
7. Exercise real reward/licensing paths only with intentionally configured test inventory and authorized operators. Confirm failures never claim payment, redemption, or publication success.

Camera currently uses WebKit `getUserMedia`/`MediaRecorder` inside the native app, not a custom AVFoundation recorder. Keep any incompatible codec, interrupted-take, or memory failures as release blockers rather than treating browser automation as substitute evidence.

## TestFlight and submission

After resolving the relevant blockers and building production assets:

1. In Xcode select the **App** target and confirm signing team `5F5C5G25Y6` and bundle `com.aaronpilk.sidequest` match the existing SidequestMe App Store Connect record `6817917086`. Set the version/build number; increment the build number for each upload. Check the chosen device families and orientations against actual testing.
2. Run the project's typecheck, lint, unit/database/browser checks, `npm run ios:sync`, and `npm run ios:verify:release`. Review `docs/DEPLOYMENT.md` for the separate backend deployment. Keep signing credentials and private configuration out of Git.
3. Select a generic physical iOS destination in Xcode, archive, validate, and distribute through Organizer to App Store Connect. A Simulator `.app` cannot substitute for this signed archive. [Capacitor distribution guide](https://capacitorjs.com/docs/ios/deploying-to-app-store)
4. Finish App Store Connect processing/compliance questions and use internal TestFlight first. External testing follows Apple's beta-review workflow. Collect device failures before proceeding. [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
5. Supply truthful screenshots, age-rating responses, privacy disclosures, support/privacy URLs, content-rights and export-compliance information, reviewer contact/access, and concise review notes covering quest creation, recording, deletion, moderation, and the exact commercial scope. Choose the processed build and submit it for review. [Submission workflow](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/)

Use the final device-tested build and functioning backend for review. Do not claim AI video analysis, automatic payouts, live event coverage, or other integrations merely because a UI placeholder or configuration hook exists. Build validation and this checklist do not constitute Apple approval.

## Current handoff to TestFlight

The current goal is an internal TestFlight build, not a public App Store launch. The signed archive checkpoint is complete; the final changed source must be rebuilt, archived, uploaded and processed before claiming testers can install it. No upload or beta-processing result is recorded here yet.

A manual iPhone Simulator check using a synthetic camera stream completed **48.2 seconds across two takes**, left and reopened the draft, and saved the session as one video successfully. This demonstrates the tested draft/session path; it does not establish the entire physical-device acceptance matrix above. Keep the existing synthetic Simulator evidence distinct from real camera/microphone hardware verification.

The bundled iPhone app uses native `MKLocalSearch` and `MKMapItemRequest` on iOS 18+ through `SidequestPlaces`; it needs no browser token. Only actual Apple place IDs are saved, and selected-place categories influence ranking without changing hard outing constraints. The iOS 15–17 fallback explicitly offers manual area entry and external Apple Maps because durable native place IDs require iOS 18. Browser in-app Maps still needs a valid `APPLE_MAPS_TOKEN`. Native cards offer details and directions; browser map previews are not embedded into the native view.

The native plugin passed unsigned Simulator compilation, 44 focused place/service tests, typecheck and scoped lint. On **September 30, 2026**, the rebuilt **iPhone 17 / iOS 26.4 Simulator** performed a live native search for **Central Park New York**, returned Apple’s real Central Park result (New York, NY 10028), and resolved its durable place ID into the selected-place card with directions controls. Denied location showed the manual fallback, and manual-area search worked. **Allowed/approximate GPS, reopening across a full app restart, the actual directions handoff and physical-device behavior remain to be verified.** The observed search used live Apple data; the unit fixtures remain separate evidence.

Ticketmaster nearby listings need `TICKETMASTER_API_KEY`; Eventbrite and other event resources are outbound browsing links, not a claimed live scraped feed. Set private provider configuration on the backend and test deployed responses. Manual-area fallbacks must continue to work when services are absent or permission is denied. No automated language-model quest generator is configured; recommendations use reviewed authored activities and conservative selected-place relevance.

The renderer accepts an optional still PNG/JPEG/WebP overlay up to 5 MB at one of five fixed positions. It strips image metadata and applies the chosen image to the saved session; transient upload files are deleted after composition. New single-video final renders include the approved logo and visible “Side quest app” watermark. Legacy three-clip renders retain their existing layout. Validate the full-screen native editor and image preview on the final build.

`node scripts/verify-session-renderer.mjs --minute --sponsor` passed locally with actual FFmpeg: two 30-second takes, raster image overlay, sponsor disclosure, exact 60-second final duration, retained image pixels and watermark pixels. A six-second case also passed. The updated container Dockerfile and ignore rules include shared logo geometry; a local Docker container build was unavailable because Docker is not installed, so the deployment container build still needs its normal CI verification.
