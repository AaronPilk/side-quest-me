# Build 7 camera follow-up — 2026-10-02

Build **1.0.0 (7)** was processed as **VALID** but **was not assigned to internal testers**. The full GitHub browser run exposed a preview-recovery race. Build 8 supersedes this upload; see [build-8 release evidence](BETA_FEEDBACK_BUILD_8_RELEASE.md).
Source **033a1bb9f515b899ffdf5263c58791d0bcb606c3** is pushed to `main`.
No database migration is required. Real iPhone preview and microphone behavior
still need confirmation after updating.

## Report and findings

A physical-iPhone screenshot showed a fullscreen black camera preview while camera
and microphone indicators were active. The exact cause is unproven. Those
indicators establish that capture resources are in use; they do not establish that
the video element is displaying frames.

The previous implementation treated successful stream acquisition as preview
readiness, relied on autoplay without checking playback, and enabled recording
without confirming a rendered frame. Stream attachment depended on a camera
boolean, so a fast replacement could miss reattachment. Camera selection could
oscillate between the first two enumerated devices. Existing browser tests checked
element visibility and active tracks, which could pass despite a blank preview.

The read-only native audit found camera/microphone usage descriptions and inline
playback configuration present. The native background/foreground handling avoids
treating a permission dialog as backgrounding. These findings do not diagnose the
specific device failure.

## Change scope

- Explicitly start muted inline preview playback and wait for the first video
  frame before enabling recording.
- Expose playback retry and camera reopening when preview startup fails or the
  preview stalls. Saved takes and video import remain available during recovery.
- Attach preview by stream identity so replacement streams are not dependent on a
  boolean state transition. Guard stale stream callbacks during replacement.
- Cycle through available cameras instead of repeatedly selecting only the first
  alternative device.
- Preserve interruption handling: stop recording when capture is interrupted;
  returning to the foreground does not automatically resume recording.

## Verification record

| Check                                                                  | Status                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused preview readiness and recovery unit tests                      | 17 helper/session/lifecycle checks pass                                                                                                                                                                                                                                                                                                                          |
| Capture browser tests, including rendered-frame and replacement checks | 16 pass, including 5 new failure/recovery/switch cases; `.local/camera-preview-regression.log`                                                                                                                                                                                                                                                                   |
| Full unit suite, typecheck, lint and production build                  | 691 unit tests / 62 files pass; lint, typecheck and build pass; `.local/beta7-unit.log`                                                                                                                                                                                                                                                                          |
| Native build, sync and release guard                                   | Production sync and signed archive/export pass; packaged guard passes; version 1.0.0 / build 7, arm64, exported `get-task-allow=false`, `beta-reports-active=true`                                                                                                                                                                                               |
| Native Simulator walkthrough                                           | iPhone 17 / iOS 26.4: moving simulated camera preview, recording/pause, camera switch, two-take playback and draft restore pass; `.local/beta7-simulator-restored-camera.png`; not physical-camera evidence                                                                                                                                                      |
| Physical-iPhone live preview and microphone audio                      | Required after update; unverified                                                                                                                                                                                                                                                                                                                                |
| Source and production release identifiers                              | `033a1bb9f515b899ffdf5263c58791d0bcb606c3`; [Checks 37027608984](https://github.com/AaronPilk/side-quest-me/actions/runs/37027608984) failed: 218 of 219 browser checks passed; the new rejected-playback retry test failed; [production deployment 37027671911](https://github.com/AaronPilk/side-quest-me/actions/runs/37027671911) passed, Worker `ef35c500-be3c-4735-8f8f-760fb4ac0a10`; deployed capture asset recovery controls verified |
| Apple validation, upload and processing                                | See recorded upload and superseding-build evidence below                                                                                                                                                                                                                                                                                                                                   |
| TestFlight internal tester delivery and note readback                  | See recorded upload and superseding-build evidence below                                                                                                                                                                                                                                                                                                                                   |

Automated tests should cover pending or rejected playback, a stream with no
rendered frames, successful recovery, fast stream replacement, camera cycling,
interruption and retention of saved takes. Browser synthetic media and a Simulator
walkthrough cannot prove real iPhone camera or microphone behavior.

## Device checks after updating

Start capture with a first-time permission grant and with previously granted
permissions. Confirm moving frames before recording, then record and play back
short takes from available cameras with audible microphone input. Check background
and foreground return, retry/reopen after a stalled preview, earlier take retention,
video import and Photos export. Record the iPhone model, iOS version, camera and
reproduction steps for any remaining failure.

The concise tester instructions are in [TestFlight notes](TESTFLIGHT_NOTES.md).

## Local delivery artifacts

- Archive: `.local/Sidequest-build7-delivery.xcarchive`.
- Distribution IPA: `.local/ios-production-export-build7-delivery/App.ipa`.
- Exported bundle inspection: `.local/beta7-export-inspect/Payload/App.app`.
- Archive/export logs: `.local/beta7-ios-archive.log`, `.local/beta7-ios-export.log`.

Apple validation succeeded without errors. Upload was accepted at **11:37:20 EDT**,
October 2, delivery/build ID `c28ba467-98d2-4645-8bac-fd94602ef6e0`. Apple has processed
build 7 as **VALID**. The English notes are saved (1,547 characters). Internal-group
assignment was deliberately withheld after the CI failure; build 7 was not delivered to testers.

The production deployment succeeded: Worker `ef35c500-be3c-4735-8f8f-760fb4ac0a10`.
The deployed capture asset contains the new recovery controls;
`.local/beta7-production-asset-check.json`.

## Superseded after recovery regression

A deterministic Chromium probe of this source showed that a queued `waiting` event could change a playing, readyState-4 video from ready to blocked. That establishes a real helper defect, though the exact event in the CI failure and the original physical-iPhone cause remain unproven. Build 8 checks present playback state before honoring queued pause/waiting/stalled/mute events, and rearms frame monitoring when genuine interrupted playback resumes. It adds deterministic and end-to-end regression coverage without relaxing the original test.
