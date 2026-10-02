export type CameraPreviewState = "starting" | "ready" | "blocked";

/** Camera permission and live tracks do not guarantee that a video is playing. */
export function connectCameraPreview(
  video: HTMLVideoElement,
  stream: MediaStream,
  onState: (state: CameraPreviewState) => void,
) {
  let disposed = false;
  let attempt = 0;
  let state: CameraPreviewState | undefined;
  let frame: number | undefined;
  let lastMediaTime = Number.NaN;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const tracks = stream.getVideoTracks();
  const current = () => !disposed && video.srcObject === stream;
  const notify = (next: CameraPreviewState) => {
    if (!current() || state === next) return;
    state = next;
    onState(next);
  };
  const clearWait = () => {
    clearTimeout(timeout);
    timeout = undefined;
    if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
    frame = undefined;
  };
  const block = () => {
    if (!current()) return;
    attempt++;
    clearWait();
    notify("blocked");
  };
  const hasFrame = () =>
    current() &&
    !video.paused &&
    video.readyState >= 2 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0 &&
    tracks.some((track) => track.readyState === "live" && !track.muted);
  const frameReady = () => {
    if (!hasFrame()) return false;
    clearTimeout(timeout);
    timeout = setTimeout(block, 6_000);
    notify("ready");
    return true;
  };
  const mediaReady = () => {
    // A presented frame is stronger evidence than resolved play()/metadata.
    // Older WebViews fall back to current decoded data and video dimensions.
    if (
      !video.requestVideoFrameCallback &&
      video.currentTime !== lastMediaTime &&
      frameReady()
    )
      lastMediaTime = video.currentTime;
  };
  const interrupted = () => {
    if (state === "ready") block();
  };
  const start = () => {
    if (!current()) return;
    clearWait();
    const pending = ++attempt;
    lastMediaTime = video.currentTime;
    notify("starting");
    timeout = setTimeout(block, 6_000);
    if (video.requestVideoFrameCallback) {
      const waitForFrame = () => {
        frame = video.requestVideoFrameCallback(() => {
          frame = undefined;
          if (!current() || pending !== attempt) return;
          frameReady();
          if (current() && pending === attempt) waitForFrame();
        });
      };
      waitForFrame();
    }
    // Keep this call synchronous so retry() retains the button's user gesture.
    video.defaultMuted = true;
    video.muted = true;
    try {
      void video
        .play()
        .then(() => {
          if (pending === attempt) mediaReady();
        })
        .catch(() => {
          if (pending === attempt) block();
        });
    } catch {
      block();
    }
  };

  video.defaultMuted = true;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.srcObject = stream;
  video.addEventListener("loadeddata", mediaReady);
  video.addEventListener("playing", mediaReady);
  video.addEventListener("timeupdate", mediaReady);
  video.addEventListener("pause", block);
  video.addEventListener("error", block);
  video.addEventListener("waiting", interrupted);
  video.addEventListener("stalled", interrupted);
  for (const track of tracks) {
    track.addEventListener("mute", block);
    track.addEventListener("unmute", start);
  }
  start();
  return {
    retry: start,
    dispose() {
      disposed = true;
      attempt++;
      clearWait();
      video.removeEventListener("loadeddata", mediaReady);
      video.removeEventListener("playing", mediaReady);
      video.removeEventListener("timeupdate", mediaReady);
      video.removeEventListener("pause", block);
      video.removeEventListener("error", block);
      video.removeEventListener("waiting", interrupted);
      video.removeEventListener("stalled", interrupted);
      for (const track of tracks) {
        track.removeEventListener("mute", block);
        track.removeEventListener("unmute", start);
      }
      if (video.srcObject === stream) {
        video.pause();
        video.srcObject = null;
      }
    },
  };
}
