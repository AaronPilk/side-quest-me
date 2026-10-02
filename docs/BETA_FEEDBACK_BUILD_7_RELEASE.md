# Build 7 camera follow-up — 2026-10-02

Verification and delivery are pending. This document records the camera change
scope; the release owner will add confirmed test results, release identifiers and
TestFlight delivery evidence. No physical-iPhone fix is claimed as proven.

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

| Check | Status |
| --- | --- |
| Focused preview readiness and recovery unit tests | Pending confirmed results |
| Capture browser tests, including rendered-frame and replacement checks | Pending confirmed results |
| Full unit suite, typecheck, lint and production build | Pending confirmed results |
| Native build, sync and release guard | Pending confirmed results |
| Native Simulator walkthrough | Pending confirmed results; not physical-camera evidence |
| Physical-iPhone live preview and microphone audio | Required after update; unverified |
| Source and production release identifiers | Pending release-owner evidence |
| Apple validation, upload and processing | Pending release-owner evidence |
| TestFlight internal tester delivery and note readback | Pending release-owner evidence |

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
