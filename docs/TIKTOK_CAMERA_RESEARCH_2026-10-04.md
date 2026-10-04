# TikTok camera research and Sidequest gap audit

Research date: October 4, 2026. This is a product and implementation research
record, not a claim that Sidequest has all these features. Build 13's recording
import and recovery fixes are documented separately. No app code, release configuration or hosted data was
changed by this research.

## Finding

The useful TikTok reference is a complete creation workflow: an unobstructed
viewfinder, quick recording controls, reusable takes, a visual editor, sound and
text tools, a clear finish action, and a draft that survives returning later.
Matching the placement of the shutter and toolbar alone does not reproduce that
experience. Sidequest already has a native recording foundation and one-video
session output; its largest gaps are editing, media import and audio tools.

For Sidequest, preserve that familiar creation flow while making quest
instructions available by swiping up. Instructions and the teleprompter belong
above the preview as optional recording aids; captions and image overlays
belong in the resulting video. They are different types of content and should
never be confused.

## Evidence and limits

- **Documented:** first-party TikTok Help, Newsroom, developer and Effect House
  material supports the stated feature. A historical announcement verifies
  that a capability exists, not its exact current icon, availability or menu.
- **Owner reference:** the supplied TikTok iPhone screenshot shows `10m`, `60s`,
  `15s`, `PHOTO`, `TEXT`, an Add sound pill, a right-side toolbar, gallery access,
  shutter and camera flip. The owner also specified hold/release capture and a
  teleprompter. Those are the intended reference interactions; the screenshot
  does not prove unseen settings, storage behavior or every account's menu.
- **Implementation proposal:** Apple APIs describe how Sidequest can implement
  comparable behavior. They do not reveal which code TikTok uses internally.
- **Unverified:** no fresh on-device TikTok interaction was performed in this
  audit. Exact current universal duration choices, teleprompter availability,
  automatic beautification defaults, effect catalogs, bitrate policies and
  internal draft/recovery architecture remain unknown.

Several English Help pages now redirect to TikTok's newer support site or deny
automated fetching. Search-indexed primary Help text was available for some
topics. In particular, indexed Romanian Camera tools text still describes old
60-second recording/3-minute upload limits, despite the owner's newer screenshot
and current developer documentation. Those old limits must not be represented
as today's universal TikTok product limit. This document records that conflict
instead of resolving it with third-party guesses. [TikTok Camera tools](https://support.tiktok.com/ro/using-tiktok/creating-videos/camera-tools?invalid_lang=sv),
[current Share Kit documentation](https://developers.tiktok.com/docs/en/share-kit-ios-quickstart-v2).

## Camera and creation features

| Feature                      | What is supported by the evidence                                                                                                                                                                                                                                                                                 | Sidequest implication                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Duration choices             | The owner's reference displays 15s, 60s and 10m. Current Share Kit says sharing can reach ten minutes, with regional variation; it is an integration limit, not proof of every in-app recording menu. [Share Kit](https://developers.tiktok.com/docs/en/share-kit-ios-quickstart-v2)                              | Keep quick presets. Add longer modes only when the complete media pipeline accepts them.                                      |
| Hold, tap and multiple takes | Owner requests hold to record/release to stop. Historical Help describes pressing the red button to start/stop and a finish checkmark. Exact present hold/tap gesture behavior needs device verification. [Camera tools](https://support.tiktok.com/ro/using-tiktok/creating-videos/camera-tools?invalid_lang=sv) | One session, multiple preserved takes, one final video. A pause should not force an upload or a quest-instruction checkpoint. |
| Flip, zoom and light         | Help documents front/rear switching, pinch zoom and rear-camera flash. It does not prove seamless switching for all devices or modes. [Camera tools](https://support.tiktok.com/ro/using-tiktok/creating-videos/camera-tools?invalid_lang=sv)                                                                     | Change actual recorded camera state; never enlarge only the preview. Show only supported lens/light options.                  |
| Timer                        | Help describes hands-free countdown recording with a selected stopping point. Current exact countdown menu was not freshly observed. [Camera tools](https://support.tiktok.com/ro/using-tiktok/creating-videos/camera-tools?invalid_lang=sv)                                                                      | Provide countdown and optional take duration, with an obvious cancel action.                                                  |
| Recording speed              | Historical Help lists 0.3×, 0.5×, 1×, 2× and 3×. These values establish a documented reference, not guaranteed current availability. [Camera tools](https://support.tiktok.com/ro/using-tiktok/creating-videos/camera-tools?invalid_lang=sv)                                                                      | Speed must change exported video timing and its duration accounting, not a UI label.                                          |
| Teleprompter                 | Requested by the owner; no accessible first-party consumer specification was found in this audit.                                                                                                                                                                                                                 | Treat it as a Sidequest requirement. Make text editable, size/position/speed adjustable and private to the recorder.          |
| Photo and text modes         | TikTok announced photo/video/text creation modes; text posts support backgrounds, stickers, sounds and drafts. [Text posts](https://newsroom.tiktok.com/text-posts?lang=en)                                                                                                                                       | Photo capture, a photo carousel, a photo overlay and a text card are distinct modes. Label them clearly.                      |
| Gallery/import               | TikTok's documented editor accepts recorded/uploaded media; Photo Mode is a swipeable image carousel. [Creation and editing announcement](https://newsroom.tiktok.com/editing-tools/?lang=en)                                                                                                                     | Import multiple selected assets into the same story and preserve their order. Avoid replacing a draft silently.               |
| Filters                      | Effect House documents color filtering with LUT textures. This establishes an effects capability, not its consumer menu placement. [Filter](https://effecthouse.tiktok.com/learn/guides/workspace/objects/post-effect/filter)                                                                                     | Start with a small original color-filter set with adjustable intensity and matching export.                                   |
| Beauty/retouch               | Effect House documents face-specific skin, eye and shadow adjustments; it is not evidence that consumer camera defaults are identical. [Face Retouch](https://effecthouse.tiktok.com/learn/guides/workspace/objects/face-effects/face-retouch)                                                                    | Face-aware retouch is a separate processing system from color filters; evaluate device performance and explicit controls.     |
| Visual enhancement           | TikTok announced reversible exposure, low-light and color enhancement. [Enhancement announcement](https://newsroom.tiktok.com/new-editing-tools?lang=en)                                                                                                                                                          | A basic enhancement control can be added after core recording/editing works.                                                  |
| Green screen                 | A chosen photo/video can be used behind the creator. [Green Screen effect](https://newsroom.tiktok.com/greenscreen-effect-expands-possibilities-on-tiktok/?lang=en), [Green Screen Kit](https://developers.tiktok.com/docs/en/green-screen-kit)                                                                   | Background replacement needs subject segmentation and compositing; a corner photo overlay is not green screen.                |
| Duet                         | TikTok documents reaction/co-creation through another creator's video; Green Screen Duet uses it as background. [Duet tutorial](https://newsroom.tiktok.com/diy-duets-reactions-on-tiktok?lang=en-GB), [Green Screen Duet](https://newsroom.tiktok.com/introducing-green-screen-duet-ca?lang=en-CA)               | A later Sidequest remix mode needs source permission, synchronization and attribution, beyond basic recording.                |
| Stitch                       | Creators select part of another post and record their addition; reuse permissions can be managed globally/per post. [Stitch Help](https://support.tiktok.com/en/using-tiktok/creating-videos/stitch-settings?_hsmi=251993839)                                                                                     | A later quest-response format should respect revocation and retain source attribution.                                        |

## Editing and finishing features

| Feature                     | TikTok evidence                                                                                                                                                                                                                                                                                              | Sidequest target                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Timeline                    | TikTok documents stacking, trimming and splitting clips. [Enhanced editing](https://newsroom.tiktok.com/editing-tools/?lang=en)                                                                                                                                                                              | Thumbnail strips, trim handles, scrubber, reorder, split, delete and undo; no numeric start/end form.                                      |
| Text and stickers           | Text can be positioned, styled and sized; stickers can be placed and removed. [Editing Help](https://support.tiktok.com/en/using-tiktok/creating-videos/editing-posting-and-deleting?lang=id)                                                                                                                | Direct manipulation with safe-area guides, duration controls and preview/export agreement.                                                 |
| Photo/video overlays        | TikTok documents picture-in-picture layering, timed text and individual clip framing. [Enhanced editing](https://newsroom.tiktok.com/editing-tools/?lang=en)                                                                                                                                                 | Multiple timed layers with drag, scale, rotate and a layer selector.                                                                       |
| Transitions and effects     | TikTok's current seller training includes transitions, effects, overlays and sound effects, dated March 2026. [TikTok Edit training](https://seller-my.tiktok.com/university/course?content_id=476696878221057&default_language=en&learning_id=4789914394920721)                                             | Simple original transitions first; the training does not disclose effect algorithms.                                                       |
| Sound editing               | TikTok documents cutting/trimming sounds and setting duration. [Enhanced editing](https://newsroom.tiktok.com/editing-tools/?lang=en)                                                                                                                                                                        | Waveforms, sound start/end, original-audio/music volume and fades.                                                                         |
| Voiceover                   | TikTok documents recording narration over selected portions and adjusting original sound. [Voiceover announcement](https://newsroom.tiktok.com/giving-a-voiceover-to-the-voiceoverless?lang=en)                                                                                                              | Record a separate audio track against the video timeline, with retake and mixing controls.                                                 |
| Voice effects               | TikTok announced processing recorded voices into musical/animal sounds. [Voice effects](https://newsroom.tiktok.com/new-editing-tools?lang=en)                                                                                                                                                               | Optional later DSP presets; microphone recording alone does not implement them.                                                            |
| Captions and text-to-speech | Automatic captions can be edited; TikTok also documents text-to-speech and later accessibility updates. [Auto captions](https://newsroom.tiktok.com/introducing-auto-captions?lang=en), [2025 accessibility update](https://newsroom.tiktok.com/creating-an-accessible-and-inclusive-tiktok?lang=en-150)     | Editable transcript/timing, readable styles, correction before export and an optional generated voice track.                               |
| Cover selection             | TikTok Help describes selecting a video frame as a post cover. [Editing Help](https://support.tiktok.com/en/using-tiktok/creating-videos/editing-posting-and-deleting?lang=id)                                                                                                                               | Pick a frame after editing; persist it separately from playback.                                                                           |
| Download/export             | Creators can save before publishing; downloading another creator's content depends on their permission. [Download Help](https://support.tiktok.com/en/using-tiktok/exploring-videos/video-downloads//)                                                                                                       | Save a real playable video with the requested Sidequest logo and “Sidequest app” watermark; posting must remain optional.                  |
| Drafts and recovery         | Help describes private drafts, device/account-transfer limitations and a separate 30-day deleted-post recovery period. It does not promise recovery of unfinished or corrupted camera files. [Editing Help](https://support.tiktok.com/en/using-tiktok/creating-videos/editing-posting-and-deleting?lang=id) | Explicit local draft expiry, preserved takes and account separation. Deleted posts, cloud drafts and crash recovery are separate features. |

All TikTok-derived wording above is paraphrased. Newsroom announcements from
2019–2023 establish capabilities; current 2026 developer/training pages provide
additional present documentation. No TikTok source code, assets, licensed music,
beauty models, recommendations or proprietary compression algorithm was obtained.

## Sound integration is a separate product decision

TikTok distinguishes ordinary sounds from its Commercial Music Library and says
its licenses outside that library do not cover commercial promotional use.
Business/personal accounts and campaign region affect its sound choices. Those
licenses are not evidence of rights to copy tracks into Sidequest or use them
for brand licensing outside TikTok. [Commercial-use Help](https://support.tiktok.com/en/business-and-creator/creator-and-business-accounts/commercial-use-of-music-on-tiktok?lang=en),
[Commercial Music Library documentation, July 2026](https://ads.tiktok.com/resources/help/article/how-to-use-the-commercial-music-library?lang=en-GB).

Recommended Sidequest approach: original microphone audio, creator-owned audio,
voiceover and a separately licensed catalog with recorded usage rights. Provide
an export/share route to TikTok if the creator wants to add TikTok sounds there.
Do not claim that an exported TikTok soundtrack is automatically cleared for a
Sidequest brand offer.

TikTok Share Kit can hand media to TikTok, while the Content Posting API requires
app/user authorization and audit for unrestricted direct posting. Query the
creator's current duration/privacy capabilities; do not treat a share callback
as a new Sidequest publication or guaranteed public TikTok post. [Share Kit](https://developers.tiktok.com/docs/en/share-kit-ios-quickstart-v2),
[Direct Post requirements](https://developers.tiktok.com/docs/en/content-posting-api-get-started).

## Sidequest implementation snapshot

Later Build 14 increment (`62fc7983569d26b1b911e488f99387973f3471e5`): a
single still photo now supports direct dragging, pinch resizing, an accessible
size slider and draft persistence. Shared normalized placement drives the
portrait preview and renderer. Local export and an authenticated production
composition verified matching output placement. The Build 13 audit table below
is retained as the research baseline; free positioning is no longer a current
gap. Multiple/timed layers, rotation and a complete visual editor remain gaps,
and physical iPhone verification remains separate.

Read-only source audit on October 4, checked against release source
`4964f80e7f119ba35fb0bd2ec5cd69f4ce1c5961`. Native import/recovery fixes are
included in Build 13; the larger editing features below remain gaps. Code
presence is not a physical-iPhone test result.

| Area           | Implemented in audited source                                                                                                                                                                                    | Missing or limited                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Record session | 15/30/60s; hold/release plus a separate tap toggle; one completed take per stop; sequential preview; delete last take; max 30 takes.                                                                             | No 3m/10m, arbitrary take deletion/reorder or full editor. `Capture.tsx:1589,1741,1802,1862`; `recording-session.ts:18`.                                                                                                       |
| Camera         | Native AVFoundation movie capture, real pinch zoom and hardware-dependent 0.5×/1×; front/back; rear torch; 0/3/10s countdown.                                                                                    | Flip/torch/timer disabled during recording; no front screen light, extra lens presets or photo output. `Capture.tsx:678,1172,1250,1500`; `SidequestCameraPlugin.swift:54,584,606`.                                             |
| Instructions   | Optional quest sheet and a 500-character editable teleprompter with three scrolling speeds.                                                                                                                      | Prompter settings are not persisted in draft fields; it does not create video captions. `Capture.tsx:1410,1931`; `capture-drafts.ts:8`.                                                                                        |
| Import         | One video replaces the current draft after confirmation; one ≤5MB image can overlay the whole video in five fixed positions.                                                                                     | No append/multi-import, layer timings, video overlay, free positioning or slideshow. Recorded-file import reliability is addressed by the Build 13 fix. `Capture.tsx:1095,1336,1554`; `renderer/overlays.mjs:38`.              |
| Editor         | Backend selections support trim, mute and fit/fill/crop, plus short labels.                                                                                                                                      | The current unified-session UI does not expose those controls: save uses full duration, fit, centered crop, unmuted audio and no caption. `session-media.ts:52`; `renderer/contracts.mjs:26`; `Capture.tsx:1640`.              |
| Audio/effects  | Source microphone audio is retained; missing audio becomes silence; backend mute field exists.                                                                                                                   | No selected sound, voiceover, mix/volume UI, speed retiming, color filters, face effects, transitions or transcription. `native-camera.ts:34`; `renderer/core.mjs:319,352`.                                                    |
| Finish/export  | Server joins takes into a saved source when composition is needed. After quest completion, final reel rendering adds the Sidequest watermark; the ready reel offers native share/download and a fixed thumbnail. | No local composition export, cover frame selection or quality selector. `session-media.ts:19`; `ActiveQuest.tsx:106,339`; `native-share.ts:82`; `renderer/core.mjs:300,477,625`.                                               |
| Recovery       | Owner/run-scoped local drafts, seven-day expiry; playable native MOV/sidecar recovery; failed saving retains file; camera stops on background.                                                                   | No cloud draft sync; corrupted/unplayable files cannot be promised recoverable; no automatic recording restart. `capture-drafts.ts:3`; `Capture.tsx:205,301`; `SidequestCameraPlugin.swift:326,375`; `capture-lifecycle.ts:5`. |

There is no separate `CaptureSession` component in this source inventory.
`capture-session.ts` contains timing/filming helpers. The active recorder is
`Capture.tsx`, with `recording-session.ts`, `session-media.ts`, `native-camera.ts`
and `SidequestCameraPlugin.swift`.

## Ten-minute recordings require a pipeline change

Current limits are enforced independently, so changing the visible duration
buttons would still fail:

- Native movie output: up to 60 seconds and 40MB, 50MB minimum free disk,
  requested H.264/3Mbps and 1080p when supported. `SidequestCameraPlugin.swift:542`.
- Session compose: 1–30 takes, combined 5–60.1 seconds and ≤40MB; normalized to
  1080×1920, 30fps, H.264/AAC. `renderer/core.mjs:514,578,608`.
- Probe and render: ≤60-second source, one video and at most one audio track;
  60-second decode timeout; 100MB output, 240-second encoding budget.
  `renderer/core.mjs:80`; `renderer/contracts.mjs:3,41`.
- Database checks: source/upload duration ≤60,000ms and upload ≤40MB; session
  functions also enforce 5–60 seconds. `20260927151042_sidequest_core.sql:71`;
  `20260930203127_unified_recording_sessions.sql:14,64`.
- Capacity: 15-minute upload reservations, 36 sources/run, 2GiB/account,
  50 sealed reels/account and three pending renders/account. The renderer also
  has a separate 2GiB local storage limit, one queue consumer/container slot
  and a serialized busy flag. `20260927151042_sidequest_core.sql:281,412,720`;
  `20260930203127_unified_recording_sessions.sql:62`; `renderer/contracts.mjs:13`;
  `wrangler.jsonc:39`; `worker/media.ts:105`; `renderer/server.mjs:254,339`.

Planning arithmetic, not a measured file-size guarantee: 600 seconds at 3Mbps
is approximately 225MB of video before audio/container overhead; at 8Mbps it
is approximately 600MB. Keeping ten minutes under the current 40MB input limit
would permit only about 0.53Mbps overall. Durable sources, a composition copy,
the final export and temporary encoding data can coexist, so reserve more than
one video's size. Use measured hardware output rather than assuming requested
bitrate determines every file.

For an optional TikTok direct-post integration, its documented API media limits
are also distinct: MP4/H.264 recommended; 23–60fps, 360–4096px dimensions, up to
4GB, and at most ten minutes of developer-sent video. Creator capabilities can
be lower. These do not set Sidequest's own limits. [TikTok Media Transfer Guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide).

## Native architecture for Sidequest — proposal, not TikTok internals

1. Keep an AVFoundation session with a real preview and record state on a serial
   queue/actor. Apple's current AVCam sample demonstrates this structure and
   states that camera verification requires a device rather than Simulator.
   Its latest sample targets iOS 26, while Sidequest's minimum is iOS 15;
   availability must be checked rather than copying the sample wholesale.
   [AVCam](https://developer.apple.com/documentation/avfoundation/avcam-building-a-camera-app),
   [capture-session setup](https://developer.apple.com/documentation/avfoundation/setting-up-a-capture-session).
2. Persist immutable source files and a versioned edit manifest. Compose timeline
   ranges with `AVMutableComposition`; use video composition for transforms and
   overlays and audio mix for volume/fades. Both local preview and final export
   must consume the same edit decisions. [Composition](https://developer.apple.com/documentation/avfoundation/avmutablecomposition),
   [video effects](https://developer.apple.com/documentation/avfoundation/video-effects),
   [audio mix](https://developer.apple.com/documentation/avfoundation/avmutableaudiomix).
3. Export a playable file locally with progress/cancellation, then upload it for
   server validation/publication. `AVAssetExportSession` provides export
   configuration; custom sample processing can use data outputs and
   `AVAssetWriter`. Preview-layer decoration alone is not encoded into movies.
   [Export session](https://developer.apple.com/documentation/avfoundation/avassetexportsession),
   [video data output](https://developer.apple.com/documentation/avfoundation/avcapturevideodataoutput),
   [asset writer](https://developer.apple.com/documentation/avfoundation/avassetwriter).
4. Import through the system Photos picker and copy selected assets into the
   app's durable storage before editing. Use recorded-audio speech recognition
   for captions, with OS availability, permission and language checks. Person
   segmentation is a candidate for green screen, with accuracy/performance
   tradeoffs. These are implementation options, not proofs of TikTok's design.
   [Photos picker](https://developer.apple.com/documentation/photosui/phpickerviewcontroller),
   [recorded-audio recognition](https://developer.apple.com/documentation/speech/sfspeechurlrecognitionrequest),
   [segmentation quality](https://developer.apple.com/documentation/vision/vngeneratepersonsegmentationrequest/qualitylevel-swift.property).
5. Preserve valid takes when a call, backgrounding, heat, disk limit or media
   reset interrupts capture. Show a precise recoverable state and wait for a
   new record action. Apple documents background camera restrictions and
   interruption/runtime notifications. [Background restrictions](https://developer.apple.com/documentation/avfoundation/avcapturesession/interruptionreason/videodevicenotavailableinbackground),
   [session state](https://developer.apple.com/documentation/avfoundation/avcapturesession).

See [the implementation roadmap](TIKTOK_CAMERA_ROADMAP_2026-10-04.md) for phases,
acceptance criteria and the hardware test matrix.
