# Build 9 camera and saved-draft recovery — 2026-10-02

Delivery is pending. Builds 7 and 8 were uploaded but withheld from testers after verification found preview recovery and saved-draft playback failures. Build 9 includes their preview fixes plus the draft restoration correction. No database migration is required.

## Changes

Live camera readiness requires actual playback and a presented frame. Stalled or rejected previews expose Start preview and Restart camera controls while retaining earlier takes. Delayed playback events do not disable a healthy preview; interrupted playback must present a fresh frame, and recording never resumes automatically.

Saved drafts now copy each unique media Blob into fresh byte-backed playback buffers before Capture reuses it. Ownership, session identity and cancellation are checked around the asynchronous read. Original bytes, MIME types, take order, metadata and overlay positioning are preserved. Failed reads keep the original session and show a recovery message rather than treating it as empty. Restore does not write to the database.

## Evidence

- Native candidate on iPhone 17 / iOS 26.4: the same older three-take draft that failed in build 8 now plays its first take and advances through to its final take. Native synthetic camera preview remains moving.
- Focused draft/session unit coverage: 15 pass. Final restore/append/playback and injected-read-failure browser pair: 2 pass; the latter checks retained SHA-256 bytes after another recording.
- Full local checks, full GitHub CI, final native build and production delivery: pending.
- Signed archive, packaged release guard, Apple validation/processing, notes and internal group assignment: pending.

## Limits

The exact cause of the original physical-iPhone black preview remains unproven. Synthetic browser media and Simulator frames do not verify physical camera preview or microphone audio. Recent feedback names iOS 18.7.3; the local runtime is iOS 26.4. After updating, test moving preview, record/pause/flip, audible playback, closing/reopening and adding to a draft, background return, import and Photos export.

No AI provider, recommendation, account, quest, series, reward or database behavior changes in this camera follow-up. Existing media formats are preserved.
