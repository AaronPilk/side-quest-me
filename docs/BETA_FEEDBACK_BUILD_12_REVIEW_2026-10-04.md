# Build 12 beta feedback — October 4, 2026

Fresh App Store Connect retrieval returned 23 screenshot reports and zero crash
submissions, without pagination. Two reports are new and belong to Build 12 on
an iPhone 15 Pro, iOS 18.7.3, at 393 × 852 points. The previous reports concern
Builds 3 and 11; their historical fixes remain documented separately.

## New reports and corrections

| Report                    | Finding                                                                      | Correction                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AAElb1CKNZLcp5bsSb8ccbM` | Preview works, but stopping a recording shows “This take could not be read.” | Accept the specific readable iOS local-media response instead of treating its non-HTTP status as a download failure.                |
| `ABto5WPw_zIt4J39seQPuV0` | Retry/discard, preview restart and error feedback overlap.                   | One recovery panel contains the explanation and stacked actions; unavailable recording controls are hidden until recovery succeeds. |

The owner separately confirmed that camera preview and zoom work. This does
not establish successful recording import, microphone playback or final export.
In particular, the new report identifies a remaining failure after preview.

## Recording failure evidence

Capacitor 8.5.2's iOS local-file handler serves MOV/MP4 bytes through a
Foundation `URLResponse`, rather than `HTTPURLResponse`. Actual WebKit execution
returned `status: 0`, `ok: false`, `type: basic`, an empty MIME header, and all
original bytes. An HTTP-response control returned 200/true. The old reader
rejected `!response.ok` before reading any of those valid video bytes.

The corrected reader allows status zero only on iOS, for a basic response at
`capacitor://localhost/_capacitor_file_` matching the already validated recording
path. Remote or unrelated URLs, decorated URLs, opaque/error responses, HTTP
errors, invalid recording metadata, empty/oversized files and failed reads still
reject. Bytes are copied into an independently backed video Blob. The existing
durable save must succeed before the native take is removed. Pending and
recovered Build 12 recordings use this same reader.

No AVFoundation recording or file-retention changes were needed. Tests now
simulate the actual non-HTTP response instead of pretending all native media
arrives with HTTP 200. The isolated iOS 26.4 WebKit reproduction is separate
from a physical iOS 18.7.3 acceptance check; its temporary device was removed
after preserving results and source.

## Other submission progress

Apple's protected review contact and ordinary reviewer-access fields were saved
and independently verified. Copyright is now **2026 Aaron Pilkington**. The
owner approved **aaron@pilk.ai** as the public support mailbox; that contact and
the October 4 policy date are included in the next native bundle.

The normal production Simulator flow generated **Four-Friend Karting Grand
Prix** from the saved Daytime / Full Send / four friends / $200 group / three-hour
plan and the real selected Victory Lane Indoor Karting location. This verifies
normal generation and quest details; it does not assert venue booking or activity
completion. Its genuine native capture is retained for the App Store presentation.

Build 13 preparation and focused verification are ongoing at this checkpoint.
No App Review submission or public release has been sent. Paid-licensing scope,
public signup email delivery, operating moderation and final owner declarations
remain separate submission work.

Private feedback images, reporter metadata, native-harness evidence and Apple
review credentials remain in ignored `.local/`. They are not marketing artwork
and are not committed.
