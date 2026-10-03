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
  Recovery is isolated to the current account and quest. Seven-day expiry is
  enforced when that quest is reopened, rather than by a background purge timer.
  Sign-out/persona cleanup is enforced through a durable clear marker.
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

Build 12 (version 1.0.0, `com.aaronpilk.sidequest`) is available in the
**Sidequest Internal** TestFlight group. App Store Connect reports `VALID` and
`IN_BETA_TESTING`; group membership was verified after assignment. Camera test
notes are saved in the build's English localization.

- Source commit: `f493857d6d806a75ed4deae3caef4f46bdb0487c`, pushed to `main`.
- Apple build/delivery ID: `cff67bf8-3f88-40ce-9082-67b696669798`.
- Signed archive and export: successful; native camera/recovery/clear symbols
  were checked in both the archive and exported app binary.
- Apple validation: successful. Upload: successful, October 2, 2026 at 20:32 EDT.
- IPA SHA-256: `5086760c4db25023b3b312cd8a3320e0a3839a81983b5090b616f7cf7e9fa6a6`.
- Private delivery evidence: `.local/beta12-apple-validation-proof.json`,
  `.local/beta12-apple-upload.log`, `.local/beta12-apple-build.json` and
  `.local/beta12-group-builds-proof.json`.
- GitHub [Checks run 37081949991](https://github.com/AaronPilk/side-quest-me/actions/runs/37081949991)
  completed successfully after delivery: configuration, lint, typecheck, all
  744 unit tests, database tests, media fixtures, **277 browser scenarios**
  (18.1 minutes) and production build passed. The 36 focused camera scenarios
  also passed locally. The full CI log is retained in `.local/beta12-full-ci.log`.

The backend is unchanged. This camera release does not submit the App Store
listing for review or resolve the pending owner declarations described in
`APP_STORE_RELEASE_2026-10-02.md`.
