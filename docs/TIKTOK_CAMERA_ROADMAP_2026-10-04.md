# Sidequest camera implementation roadmap

October 4, 2026. Based on the owner's TikTok reference and the
[primary-source research and code audit](TIKTOK_CAMERA_RESEARCH_2026-10-04.md).
This is a proposed sequence. No phase below is declared complete merely because
a toolbar button exists or a mocked browser test passes.

## Product outcome

An accepted quest opens a full-screen camera immediately. The creator can record
and stop repeatedly, add media from Photos, leave and return, edit the combined
story visually, and save one watermarked video. They can swipe up for quest
instructions without leaving capture. Finishing is separate from publishing;
the private journal remains a valid destination.

Use Sidequest's violet logo and clean iOS styling around the familiar preview,
right-side tools, duration strip, large shutter, gallery and finish button.
Do not reproduce TikTok trademarks, branded assets or unsupported controls.
The quest adds useful context; the camera should remain primarily a viewfinder.

## Phase 0 — reliable recording and recovery

Priority: release blocker. Build 13's import/recovery work belongs here,
but its final release and physical-device results must be verified separately.

- Real preview appears before Record becomes available. Permission denial,
  restricted device and session failure each have a usable explanation/action.
- Hold starts once; release/pointer cancel stops once. A tap starts/stops without
  requiring a second small button. Timer recording stays hands-free after the
  countdown. Rapid taps cannot create competing record/stop promises.
- Pause preserves a playable take and progress. The next take appends to the
  same session. The screen never demands three independent uploads.
- Reopening restores every durable completed take, duration and editing state
  for the correct owner/quest. Recovery actions are positioned above controls
  and remain reachable with Dynamic Type and small displays.
- Record cancellation, backgrounding, camera interruption and low disk never
  report a save as successful unless playable media is durable. Retain a
  recoverable file when copying fails; retry does not discard it first.
- Gallery import returns a playable preview with audio and clear progress;
  canceling changes nothing. Explicit replacement preserves the former draft
  until replacement succeeds.
- Close offers Save draft or Discard when needed. No automatic record restart
  on foregrounding. Sign-out clears that account's device draft/recovery data.

Acceptance: owner physical-iPhone capture/import/preview/audio/export check plus
automated bridge/state tests. Simulator can verify layout, Photos imports and
navigation; it cannot prove camera hardware operation. [Apple AVCam](https://developer.apple.com/documentation/avfoundation/avcam-building-a-camera-app).

## Phase 1 — one visual timeline and a genuine finish flow

Priority: the highest-value feature gap after Phase 0. Preserve the native
recording foundation and replace form-like editing with a thumbnail timeline.

- Add take thumbnails, a scrubber and selected-clip outline. Drag trim handles
  with live preview; display human-readable selected time rather than numeric
  start/end fields. Add split, arbitrary delete, reorder and undo/redo.
- Gallery selects several images/videos and appends them as clips. Selection
  order is explicit; imported photos have adjustable display duration. Handle
  iCloud downloads and cancellation visibly.
- Persist a versioned edit manifest containing source identity, clip in/out,
  timeline order, framing and audio state. Never destructively trim source files.
- Use the same manifest for preview and export. Native composition is the
  proposed engine: Apple supports track/time-range edits and a video composition
  for transforms. The precise internal TikTok implementation is unknown.
  [AVMutableComposition](https://developer.apple.com/documentation/avfoundation/avmutablecomposition),
  [video composition](https://developer.apple.com/documentation/avfoundation/avmutablevideocomposition).
- Finish opens a full-screen playback preview with Edit, Save video and Continue.
  Save video exports one H.264/AAC MP4 with Sidequest's requested watermark;
  cancellation and failures retain the editable story. Add a cover frame picker.
- Give export progress, estimated storage needs and a usable retry. Successful
  export means a validated playable file, not only a job queued on the server.
  Keep upload/render/publication as separate visible states.

Acceptance examples: import two videos plus one photo, reorder them, trim the
first, delete the middle, undo deletion, reopen the app, export, and verify that
the exported frame/audio order matches preview. Run a second recording after
reopening without replacing the earlier take. Save without publishing.

## Phase 2 — sound, captions, text and overlays

Priority: creator retention and usable footage. TikTok documents timed text,
image/video layers, sound edits and voiceover; Sidequest currently has only
source audio and a fixed-position image. [TikTok enhanced editing](https://newsroom.tiktok.com/editing-tools/?lang=en),
[voiceover](https://newsroom.tiktok.com/giving-a-voiceover-to-the-voiceoverless?lang=en).

- Add separate original-audio, music and voiceover tracks with waveforms,
  timeline offsets, volume and fades. Voiceover records against playback; the
  creator can retake a range and keep the camera audio underneath.
- Start with owned/licensed sounds and original recordings. Maintain catalog
  rights and export/brand-use permissions as data. TikTok's music licenses do
  not establish a license for Sidequest. [TikTok commercial music guidance](https://support.tiktok.com/en/business-and-creator/creator-and-business-accounts/commercial-use-of-music-on-tiktok?lang=en).
- Generate editable captions from actual recorded speech, including time ranges.
  Allow correction, style/placement changes and preview before export. Choose
  on-device or backend transcription explicitly and reflect any new server
  processing in privacy disclosure. Check APIs against the app's iOS 15 minimum.
- Add text/sticker/photo/video layers with direct drag/resize/rotate, start/end,
  opacity and layer ordering. Show action controls only for the selected layer.
  One entire-video corner image remains a useful simple option, not the full
  overlay editor.
- Keep teleprompter text distinct from captions: edit script, font size, pace,
  position and mirror behavior; persist settings with the local draft. The
  prompter must not appear in exported footage unless intentionally converted
  to a separate text layer.
- Add precise quest filming cues to the swipe-up sheet: one relevant opening
  hook, concrete scenes and an optional closing callback. These are guidance,
  not mandatory recording slots or guaranteed virality claims.

Acceptance: speech captions are correctable; overlay gestures and durations
match export; voiceover remains synchronized after trimming/reordering; all
audio controls work at mute/zero volume; captions and watermark avoid each other.
The creator can save a clean story without adding every available feature.

## Phase 3 — longer recording and imports

Priority: follow core reliability/editor work. Suggested staged rollout: retain
15s/60s, then enable 3m, then 10m after measured storage/export results. This is a
Sidequest choice, not a claim that every TikTok account uses those exact presets.
TikTok's own Share Kit duration allowance varies by region. [Share Kit](https://developers.tiktok.com/docs/en/share-kit-ios-quickstart-v2).

Treat this as a coordinated contract version, with compatibility for existing
60-second stories:

| Layer            | Required work before enabling 10m                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native capture   | Duration/file-size limit, bitrate policy, free-disk reservation, thermal/error handling and recovery across long takes.                                                      |
| Frontend/session | Selected total duration, take-count policy, file-backed media handles, limits, progress and imported-video validation. Avoid base64/whole-file copies as the durable design. |
| Edit model       | Longer timeline thumbnails/waveforms produced lazily; stable timestamps, caching, undo without duplicating media.                                                            |
| Upload/API       | Resumable or chunked transfer, expiry/retry policy, byte validation and server limits compatible with larger sources.                                                        |
| Renderer         | Probe/decode timeouts, compose/render duration, output size, CPU/memory budget, temporary storage and preview/final consistency.                                             |
| Database         | New compatible checks/functions for source/session durations and upload/output limits; existing one-minute records remain valid.                                             |
| Capacity/cost    | Account quota, source count, render concurrency, queue fairness, retention, abuse controls and measured cost per completed video.                                            |

At the current requested 3Mbps, ten minutes is about 225MB before audio/container
overhead. The current 40MB input and 100MB final output ceilings do not fit that
budget. Native, JavaScript, renderer and database all enforce shorter limits
today; see the research audit for source locations. Do not ship a 10m button
that records successfully then cannot be saved.

Acceptance: 3m and 10m actual iPhone recordings, mixed camera/gallery sources,
lock/call/background interruption, app relaunch, low disk, upload failure/retry,
and full export with sound. Test the oldest supported phone and a current phone
under normal and low-power conditions. Measure peak memory, local bytes, export
time, frame/audio integrity and server queue behavior. Establish product caps
from those results; do not promise 4K/HDR or automatic quality preservation.

## Phase 4 — effects, modes and collaboration

Priority: expand only after the preceding workflows are dependable.

- Recording/edit speed with correct timeline and audio treatment. Decide whether
  slower capture requires higher source frame rate; retiming alone cannot create
  motion samples that were not captured.
- Original color filters and reversible enhancement first. The same processing
  must be used for visible preview and exported frames.
- Native photo capture, photo story/carousel and optional text cards. Update
  media/schema/feed behavior deliberately; do not reinterpret a Photo overlay
  button as proof of a photo camera.
- Subject segmentation/green screen, background video and effects processing.
  Prototype latency, hair/edge quality, movement and low light. Apple's Vision
  segmentation exposes an accuracy/performance choice; it does not promise
  TikTok's effect quality. [Segmentation quality](https://developer.apple.com/documentation/vision/vngeneratepersonsegmentationrequest/qualitylevel-swift.property).
- Face retouch and AR require their own rendering/tracking pipeline, explicit
  controls and device profiling. Do not include an empty Beauty button merely
  because the reference app has one.
- Sidequest response/remix: original content permission, attribution, deletion
  behavior and synchronized duet layouts. Add Story continuation/series context
  without turning each camera take into a separate Series episode.
- Optional TikTok sharing through approved Share Kit/Posting API. Preserve the
  private Sidequest video and show success/cancel/draft statuses honestly.
  TikTok's current APIs are integrations, not a license to embed its full camera
  or access its entire effect/music catalog. [Direct Post requirements](https://developers.tiktok.com/docs/en/content-posting-api-get-started),
  [Green Screen Kit](https://developers.tiktok.com/docs/en/green-screen-kit).

LIVE streaming is a separate media/network/moderation product, even when its
tab is visible in the reference camera. It should have a dedicated scope and
working service rather than an inert tab in this recording release.

## Hardware and flow test matrix

| Area                  | Required cases                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission            | First grant; camera denied; microphone denied; changed in Settings; Photos picker cancel; Save to Photos denied; iCloud-only selected file.                                 |
| Record gestures       | Short tap; long hold; release outside shutter; pointer cancel; rapid repeat; countdown cancel; selected-duration auto-stop; no duplicate empty take.                        |
| Preview/record parity | Rear/front; supported 0.5×/1× and pinch while recording; portrait; mirroring; torch; exported frames match visible framing.                                                 |
| Interruptions         | Home/background; lock; incoming call; camera unavailable; audio route change; media-service reset; thermal pressure; no automatic restart.                                  |
| Draft integrity       | Relaunch after each take; crash during save; retry copy; recover valid files; missing/corrupt file; seven-day expiry; sign-out/account switch; two quests.                  |
| Editor                | Trim/split/reorder/delete/undo; overlay boundaries; caption corrections; volume fades; voiceover alignment; cover frame; preview/export parity.                             |
| Delivery              | Offline; upload retry; render failure; local export; share cancel; Save Video/Files; interrupted download; original sources retained until safe cleanup.                    |
| Layout/accessibility  | Small iPhone; large iPhone; safe areas; Dynamic Type; VoiceOver; keyboard; Reduced Motion; tool sheets; quest swipe conflicts; recovery actions never hidden under shutter. |

Every shipped control needs either a tested action or a truthful disabled state
with a reason. Maintain a release inventory separating **implemented**, **tested
on Simulator**, **tested on physical iPhone**, and **planned**. The first result
to prove is simple: record two takes, leave, return, import one clip, edit, and
save one good video with audio.
