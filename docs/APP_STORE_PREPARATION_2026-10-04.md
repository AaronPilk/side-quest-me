# App Store preparation — October 4, 2026

**Version 1.0.0 (13) is available in internal TestFlight and selected in the
editable App Store draft.** It corrects both new Build 12 camera reports. The
TikTok camera research and feature roadmap are complete. App Review submission
and public release have not been sent.

## Contact and review access

Apple's protected review contact is Aaron Pilkington, aaron@pilk.ai, with the
owner's international-format phone. The ordinary reviewer account's access
fields are saved and independently verified. Its password stays in ignored
local release evidence. Copyright is **2026 Aaron Pilkington**.

The owner also approved **aaron@pilk.ai** as the public support mailbox. The
updated production iOS Simulator bundle visibly displays that contact on Help
& support, with the October 4 policy date. Ordinary navigation from Profile to
Settings to Help & support was verified. The temporary screenshot status-bar
override was cleared. No other Simulator's app data was altered.

## Beta corrections and verification

Source commit `4964f80e7f119ba35fb0bd2ec5cd69f4ce1c5961`:

- Native take import accepts the narrowly validated readable iOS local-media
  response. A dedicated iOS WebKit harness reproduced the former false rejection
  of valid bytes. Failed copying still retains the native file for retry.
- Camera recovery uses one panel with readable explanations and stacked Retry /
  Discard actions. Unusable camera controls are hidden during recovery.
- Public support contact and policy date are included in the bundled iOS pages.

Local verification passed: typecheck, lint, 747 unit tests, production build and
all 28 focused native-camera, camera-preview and public-information browser
cases in one clean run. The production Simulator build also succeeded. See
[the feedback evidence](BETA_FEEDBACK_BUILD_12_REVIEW_2026-10-04.md).

The owner confirmed physical iPhone camera preview and zoom on Build 12. Build
13 still needs actual recording, take playback with microphone audio, recovery
and finished-video download/export confirmation. Simulator and bridge fixtures
do not prove camera hardware behavior.

## Native release checkpoint

Version 1.0.0, build 13, bundle `com.aaronpilk.sidequest`, team `5F5C5G25Y6`.
Production archive, distribution export, arm64 / entitlement / bundle-identity
verification and Apple upload validation passed.

IPA SHA256:
`12c7e9ef9b80b0f087e1eeb449e0caf0f85202030b3da289626ae2e5216f4fc2`.

[Full Checks](https://github.com/AaronPilk/side-quest-me/actions/runs/37212262333)
passed for this exact source: 747 unit tests, all 279 browser scenarios,
database checks, render fixtures, lint, typecheck and production build.
The verified IPA was uploaded successfully. Independent Apple readback confirms:

- Build `a2b6db6d-d7e8-4323-b720-7638e6932967`, version 13, processing `VALID`
  and internal state `IN_BETA_TESTING`.
- Membership in existing **Sidequest Internal** group
  `f10a5d96-4a4a-4b23-862c-1f33802a4397`, with exact saved English test notes.
- Editable App Store version `07c31559-9097-43fb-9d6f-2744374be7aa` selects
  that exact build. It remains `PREPARE_FOR_SUBMISSION`, release type `MANUAL`.

[Production deployment](https://github.com/AaronPilk/side-quest-me/actions/runs/37213692898)
succeeded for the same source commit. Worker version
`e5244401-7a37-468a-ab52-0987ece56788` serves the approved public contact and
October 4 policy date. Fresh `/api/health` returned 200, production identity,
database/renderer configured and `demo=false`.

Private release evidence stays in ignored `.local/`: exact IPA validation/hash,
upload logs, independent Apple processing/group/localization/draft readbacks and
production asset/health checks. This record contains no reviewer password.

## Screenshots and research

The `APP_IPHONE_67` set contains four independently verified `COMPLETE` images,
in order: Make today a story, Your kind of quest, Your next detour, Great stories
start here. The previous three keep their existing Apple asset IDs.
[Delivery evidence](../app-store/2026-10-04/apple-screenshot-delivery.json) records
the exact order, file sizes and matching Apple / local checksums.

The new image shows a genuine normal production Simulator quest:
**Four-Friend Karting Grand Prix**, generated for Daytime / Full Send / four
friends / $200 group / three hours, using the actual selected Victory Lane
Indoor Karting location. It does not imply a booking or completed outing.
The artwork frames unaltered app pixels. Filming, completed-video, Series and
journal marketing images remain uncaptured; no footage or completion was
invented.

[TikTok research](TIKTOK_CAMERA_RESEARCH_2026-10-04.md) separates official
documentation, the owner's reference, source-code inventory and implementation
proposals. [The camera roadmap](TIKTOK_CAMERA_ROADMAP_2026-10-04.md) prioritizes
reliable recovery, a visual editor, sound/captions/timed layers, then longer
recording and effects. These larger features are planned, not shipped in Build 13. One-minute / 40MB limits remain in the current pipeline.

## Remaining App Store requirements

The historical hosted audit confirmed custom SMTP off, no Auth Hooks and zero
active operator memberships. None of those settings were changed by this
release. Public new-account email delivery must work with a production sender;
an existing reviewer password login does not establish signup delivery.

The public-content review queue needs an authorized operator and an actual
moderation walkthrough. The current operator role also includes licensing
administration; assigning it requires an explicit identity and scope decision.
Paid brand licensing has manual terms/payment/permission handling and no
checkout/IAP implementation. Its initial launch scope remains an owner decision.

App Privacy remains a saved draft pending the owner's final accuracy/compliance
declaration and renewed Apple browser sign-in. Third-party content-rights answers
still require truthful owner facts. The saved 18+ rating is not age verification.
No App Review submission should be claimed until these items and physical camera
delivery are resolved. Manual release keeps public availability under owner
control after approval.
