# Build 9 camera and saved-draft recovery — 2026-10-02

**Build 1.0.0 (9) is VALID and IN_BETA_TESTING in Sidequest Internal**, verified at `2026-10-02T16:59:12.063Z`. Build ID `baece762-b9f6-48dc-9293-8e68476ff907`, group `f10a5d96-4a4a-4b23-862c-1f33802a4397`; exact English notes and group membership were read back from App Store Connect. Open TestFlight → Sidequest Me → Update. Builds 7 and 8 were uploaded but withheld from testers after verification found preview recovery and saved-draft playback failures. Build 9 includes their preview fixes plus the draft restoration correction. No database migration is required.

## Changes

Live camera readiness requires actual playback and a presented frame. Stalled or rejected previews expose Start preview and Restart camera controls while retaining earlier takes. Delayed playback events do not disable a healthy preview; interrupted playback must present a fresh frame, and recording never resumes automatically.

Saved drafts now copy each unique media Blob into fresh byte-backed playback buffers before Capture reuses it. Ownership, session identity and cancellation are checked around the asynchronous read. Original bytes, MIME types, take order, metadata and overlay positioning are preserved. Failed reads keep the original session and show a recovery message rather than treating it as empty. Restore does not write to the database.

## Evidence

- Native candidate on iPhone 17 / iOS 26.4: the same older three-take draft that failed in build 8 now plays its first take and advances through to its final take. Native synthetic camera preview remains moving.
- Focused draft/session unit coverage: 15 pass. Final restore/append/playback and injected-read-failure browser pair: 2 pass; the latter checks retained SHA-256 bytes after another recording.
- Full local checks passed: 698 unit tests in 63 files, lint, typecheck and production build. Full GitHub CI [37035790968](https://github.com/AaronPilk/side-quest-me/actions/runs/37035790968) passed: 698 unit tests, all 222 browser tests (12.2 minutes), isolated database checks, lint, typecheck and build. Logs: `.local/beta9-github-checks.log`.
- Final installed native build 9 on iPhone 17 / iOS 26.4: moving synthetic preview, camera switch while keeping three takes, restored first-to-final-take playback after app relaunch passed. Screenshots and build metadata: `.local/beta9-final-restored-first-take.png`, `.local/beta9-final-restored-last-take.png`, `.local/beta9-native-verification.json`.
- Production deployment [37035840329](https://github.com/AaronPilk/side-quest-me/actions/runs/37035840329) passed; Worker version `b0fcb987-42fc-49b4-bec9-e2fed780db13`. Deployed asset `assets/ActiveQuest-BAdP6WIJ.js` contains the camera and restore controls; `.local/beta9-production-asset-check.json`.
- Production sync, signed archive, export, arm64/distribution entitlements and packaged release guard passed. Apple validation succeeded with no errors at 12:50:45 EDT; upload accepted at 12:52:26 EDT, delivery UUID `baece762-b9f6-48dc-9293-8e68476ff907`. Apple processing: VALID. Internal group assignment: IN_BETA_TESTING. Exact English-note readback passed; `.local/beta9-delivery-verification.json`.
- Source: `b05059c4a11608b9a896a94293ff2bdd6a2c43d6`. Archive: `.local/Sidequest-build9-delivery.xcarchive`; delivered IPA: `.local/ios-production-export-build9-delivery/App.ipa`; validation/upload logs: `.local/beta9-apple-validation.log`, `.local/beta9-apple-upload.log`.

## Limits

The exact cause of the original physical-iPhone black preview remains unproven. Synthetic browser media and Simulator frames do not verify physical camera preview or microphone audio. Recent feedback names iOS 18.7.3; the local runtime is iOS 26.4. After updating, test moving preview, record/pause/flip, audible playback, closing/reopening and adding to a draft, background return, import and Photos export.

No AI provider, recommendation, account, quest, series, reward or database behavior changes in this camera follow-up. Existing media formats are preserved.
