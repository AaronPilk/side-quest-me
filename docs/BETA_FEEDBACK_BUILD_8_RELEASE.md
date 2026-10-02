# Build 8 camera recovery — 2026-10-02

Delivery is pending. Build 7 was uploaded but withheld from internal testers after a full CI run exposed a preview-recovery race. Build 8 includes all build-7 camera work plus its correction. No database migration is required.

## Camera changes

The reported physical-iPhone preview was black despite active capture indicators. The exact physical-device cause remains unproven. The app now explicitly starts muted inline playback, waits for a presented frame before enabling recording, monitors frame stalls, and offers Start preview and Restart camera controls while retaining earlier takes. Stream identity controls attachment; camera switching cycles available devices.

A deterministic Chromium probe reproduced a separate helper defect: a delayed waiting event blocked a healthy playing preview. Recovery now checks the actual paused/data/muted state before reacting to queued events. A genuine interrupted preview rearms on playing and requires a fresh frame. It never automatically resumes recording.

## Verification and delivery evidence

- Focused helper/session unit tests: 19 pass.
- Seven camera recovery browser scenarios repeated three times on pinned Chromium: 21 pass; `.local/beta8-camera-chromium.log`.
- Full unit suite: 693 tests in 62 files pass; lint, typecheck and production build pass.
- Full GitHub checks, including database and browser coverage: pending.
- Native iPhone Simulator walkthrough: pending for final build 8.
- Production sync, signed archive, export, packaged guard and Apple validation: pending.
- Production deployment and deployed capture asset verification: pending.
- Apple processing, internal tester assignment and English-note readback: pending.

Browser synthetic media and Simulator camera frames cannot establish physical iPhone preview or microphone audio. Recent beta feedback names iOS 18.7.3; the available local Simulator runtime is iOS 26.4. Real-device checks remain required after updating: first permission grant, moving preview, record/pause/flip, audible playback, background return, recovery with existing takes, video import and Photos export.

No AI provider, recommendation, account, quest, series, reward or database behavior changes in this camera follow-up. Existing videos and drafts retain their formats. See [TestFlight notes](TESTFLIGHT_NOTES.md) for the device walkthrough.
