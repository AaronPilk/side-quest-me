# Build 8 camera recovery — 2026-10-02

Build 8 was uploaded and processed as VALID, but was withheld from internal testers after a native Simulator check found an older saved draft could not play. Build 9 carries its preview fixes plus draft playback restoration. Build 7 was also withheld after a full CI run exposed a preview-recovery race. No database migration is required.

## Camera changes

The reported physical-iPhone preview was black despite active capture indicators. The exact physical-device cause remains unproven. The app now explicitly starts muted inline playback, waits for a presented frame before enabling recording, monitors frame stalls, and offers Start preview and Restart camera controls while retaining earlier takes. Stream identity controls attachment; camera switching cycles available devices.

A deterministic Chromium probe reproduced a separate helper defect: a delayed waiting event blocked a healthy playing preview. Recovery now checks the actual paused/data/muted state before reacting to queued events. A genuine interrupted preview rearms on playing and requires a fresh frame. It never automatically resumes recording.

## Verification and delivery evidence

- Focused helper/session unit tests: 19 pass.
- Seven camera recovery browser scenarios repeated three times on pinned Chromium: 21 pass; `.local/beta8-camera-chromium.log`.
- Full unit suite: 693 tests in 62 files pass; lint, typecheck and production build pass.
- Full GitHub checks [37031569052](https://github.com/AaronPilk/side-quest-me/actions/runs/37031569052) passed: 693 unit tests, 221 browser tests and isolated database checks.
- Native iPhone Simulator: moving preview, camera switching and retained takes passed. Previewing the older draft failed; this blocked tester assignment.
- Production sync, signed archive, export, packaged guard and Apple validation passed. Apple accepted upload at 12:15:31 EDT on October 2.
- Production deployment [37031568519](https://github.com/AaronPilk/side-quest-me/actions/runs/37031568519) passed; Worker version `14a713c3-9e70-4005-adb5-e075acf0ca19`. Deployed capture asset verification passed.
- Apple processing: VALID, build ID `84748082-4879-4dfb-ad99-6f97af347912`, source `c51606b`. Never assigned to Sidequest Internal; build 6 remained the delivered beta.

Browser synthetic media and Simulator camera frames cannot establish physical iPhone preview or microphone audio. Recent beta feedback names iOS 18.7.3; the available local Simulator runtime is iOS 26.4. Real-device checks remain required after updating: first permission grant, moving preview, record/pause/flip, audible playback, background return, recovery with existing takes, video import and Photos export.

No AI provider, recommendation, account, quest, series, reward or database behavior changes in this camera follow-up. Existing videos and drafts retain their formats. See [TestFlight notes](TESTFLIGHT_NOTES.md) for the device walkthrough.
