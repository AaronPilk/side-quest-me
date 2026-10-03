# Native camera release — 2026-10-02

Build 11 beta feedback requested 0.5× / 1× lens buttons and pinch zoom. The
existing camera used WebKit media capture and had no zoom implementation.
Build 12 moves iPhone capture to an AVFoundation plugin, keeping the existing
full-screen controls and one-video recording flow.

## Behavior

- Displayed zoom uses the device's actual wide-lens normalization. The 0.5×
  button appears only when an ultra-wide lens and its ratio are supported.
  Pinching changes the capture device, so the saved footage includes zoom.
- Native preview must be running and presenting before recording is enabled.
  Flip switches between rear and front cameras and waits for preview readiness.
  Preview and recorded footage use matching portrait orientation and mirroring.
- Hold/release and timed recording retain takes locally before native file
  cleanup. Normal completion and interruption share a deduplicated save path.
  Context, capture and recording identifiers prevent stale events joining
  another quest. Failed copy/storage operations expose retry and explicit discard.
- Private native files have durable metadata for chronological recovery after
  reopening. Draft provenance prevents duplicate takes after a cleanup failure.
  Recovery is isolated to the current account and quest, expires after seven
  days, and respects sign-out/persona cleanup through a durable clear marker.
- Browser capture remains available with reported hardware zoom capabilities,
  stable pinch gestures and front/rear selection. Unsupported lens ratios are
  not advertised. Finished-video import remains available after camera failure.

## Verification

- Full unit suite: 744 passed.
- Camera browser suite: 36 passed, including real fake-device media frames and
  native bridge boundary tests. Native bridge tests mock AVFoundation, not hardware.
- Full TypeScript and ESLint checks, production build and configuration checks passed.
- Device and Simulator SDK typechecks passed. Native Simulator build compiled,
  installed and launched; a production-configured welcome screen was captured.
- Independent native review corrected interrupted-start delivery, sensor rotation,
  finish-timeout retries and recovered-take ordering before packaging.

## Device checks and delivery

The Simulator has no camera hardware. A real iPhone must verify visible live
frames, rear 0.5×/1×, pinch during recording, front/rear flip, microphone audio,
torch, portrait playback and interruption recovery. No physical-device pass is
claimed by the browser tests or SDK compilation.

Build 12 archive, Apple validation and TestFlight processing evidence will be
recorded below when delivery completes. This camera release does not submit the
App Store listing for review or resolve the pending owner declarations described
in `APP_STORE_RELEASE_2026-10-02.md`.
