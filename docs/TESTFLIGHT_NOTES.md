# Internal iPhone beta — 1.0.0 (7)

Build 7 focuses on the camera screen after a report of a black preview while iPhone camera and microphone indicators were active.

- The app explicitly starts preview playback and waits for a video frame before enabling recording.
- If the preview cannot start or stops, recovery controls let you retry playback or reopen the camera. Earlier saved takes and video import remain available.
- Switching cameras attaches the new stream directly and cycles through the available cameras.
- Returning from the background does not automatically resume recording.

Please test on your iPhone after updating:

1. Open an accepted quest → Record or import video. Grant camera and microphone access if asked. Confirm you see a moving preview before recording becomes available.
2. Record a short take, pause, switch cameras and record another. Preview the result and confirm both the picture and microphone audio work.
3. Leave the app and return. Reopen the camera, then confirm earlier takes remain and recording starts only when you choose it.
4. If the preview is black or stalled, try the recovery controls. Also check importing a video, saving and exporting to Photos.

The exact cause of the original iPhone failure has not been established. The update adds playback checks and recovery; real camera preview and audio still need confirmation on your device. Report your iPhone model, iOS version, which camera you used and whether the issue repeats.

Recording supports up to 60 seconds. Videos and series remain private until you explicitly publish.
