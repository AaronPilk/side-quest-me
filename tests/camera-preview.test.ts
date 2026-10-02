import { afterEach, describe, expect, it, vi } from "vitest";
import { connectCameraPreview } from "../src/lib/camera-preview";

function fixture() {
  const track = Object.assign(new EventTarget(), {
    readyState: "live",
    muted: false,
    stop: vi.fn(),
  });
  const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
  const frames = new Map<number, VideoFrameRequestCallback>();
  let nextFrame = 0;
  const element = Object.assign(new EventTarget(), {
    srcObject: null as MediaStream | null,
    defaultMuted: false,
    muted: false,
    playsInline: false,
    autoplay: false,
    paused: true,
    currentTime: 0,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    setAttribute: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    requestVideoFrameCallback: vi.fn((callback: VideoFrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }),
    cancelVideoFrameCallback: vi.fn((id: number) => frames.delete(id)),
  });
  const video = element as unknown as HTMLVideoElement;
  const present = () => {
    element.paused = false;
    element.readyState = 2;
    element.videoWidth = 1080;
    element.videoHeight = 1920;
    element.currentTime += 1 / 30;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) =>
      callback(0, {} as VideoFrameCallbackMetadata),
    );
  };
  return { video, element, stream, track, frames, present };
}

afterEach(() => vi.useRealTimers());

describe("live camera preview", () => {
  it("sets muted inline playback before attachment and waits for a presented frame", async () => {
    const { video, element, stream, present } = fixture();
    let attached: MediaStream | null = null;
    Object.defineProperty(element, "srcObject", {
      get: () => attached,
      set: (value) => {
        if (value)
          expect(element).toMatchObject({
            muted: true,
            defaultMuted: true,
            playsInline: true,
            autoplay: true,
          });
        attached = value;
      },
    });
    const state = vi.fn();
    const preview = connectCameraPreview(video, stream, state);
    await Promise.resolve();
    element.dispatchEvent(new Event("playing"));
    expect(state.mock.calls).toEqual([["starting"]]);
    expect(element.play).toHaveBeenCalledOnce();
    present();
    expect(state.mock.calls).toEqual([["starting"], ["ready"]]);
    preview.dispose();
  });

  it("offers a synchronous playback retry after autoplay rejection", async () => {
    const { video, element, stream, present } = fixture();
    element.play.mockRejectedValueOnce(
      new DOMException("Gesture required", "NotAllowedError"),
    );
    const state = vi.fn();
    const preview = connectCameraPreview(video, stream, state);
    await vi.waitFor(() => expect(state).toHaveBeenLastCalledWith("blocked"));
    preview.retry();
    expect(element.play).toHaveBeenCalledTimes(2);
    expect(state).toHaveBeenLastCalledWith("starting");
    present();
    expect(state).toHaveBeenLastCalledWith("ready");
    preview.dispose();
  });

  it("blocks a resolved play with no frames, and pauses safely when its track is muted", async () => {
    vi.useFakeTimers();
    const { video, stream, track, present } = fixture();
    const state = vi.fn();
    const preview = connectCameraPreview(video, stream, state);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(state).toHaveBeenLastCalledWith("blocked");
    expect(track.stop).not.toHaveBeenCalled();
    preview.retry();
    present();
    expect(state).toHaveBeenLastCalledWith("ready");
    await vi.advanceTimersByTimeAsync(6_000);
    expect(state).toHaveBeenLastCalledWith("blocked");
    preview.retry();
    present();
    track.muted = true;
    track.dispatchEvent(new Event("mute"));
    expect(state).toHaveBeenLastCalledWith("blocked");
    track.muted = false;
    track.dispatchEvent(new Event("unmute"));
    expect(state).toHaveBeenLastCalledWith("starting");
    present();
    expect(state).toHaveBeenLastCalledWith("ready");
    preview.dispose();
  });

  it("ignores old frame/play callbacks after disposal and leaves a replacement stream attached", async () => {
    const { video, element, stream, frames, track } = fixture();
    let reject!: (error: Error) => void;
    element.play.mockReturnValue(
      new Promise((_, rejectPlay) => {
        reject = rejectPlay;
      }),
    );
    const state = vi.fn();
    const preview = connectCameraPreview(video, stream, state);
    const oldFrame = [...frames.values()][0];
    const replacement = {} as MediaStream;
    element.srcObject = replacement;
    preview.dispose();
    oldFrame(0, {} as VideoFrameCallbackMetadata);
    reject(new Error("Old playback failed"));
    await Promise.resolve();
    await Promise.resolve();
    track.dispatchEvent(new Event("mute"));
    expect(state.mock.calls).toEqual([["starting"]]);
    expect(element.srcObject).toBe(replacement);
    expect(element.pause).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("supports WebViews without frame callbacks and detaches the disposed preview", () => {
    const { video, element, stream, present, track } = fixture();
    Object.assign(element, { requestVideoFrameCallback: undefined });
    const state = vi.fn();
    const preview = connectCameraPreview(video, stream, state);
    element.dispatchEvent(new Event("loadeddata"));
    expect(state).toHaveBeenLastCalledWith("starting");
    present();
    element.dispatchEvent(new Event("playing"));
    expect(state).toHaveBeenLastCalledWith("ready");
    preview.retry();
    element.dispatchEvent(new Event("playing"));
    expect(state).toHaveBeenLastCalledWith("starting");
    present();
    element.dispatchEvent(new Event("timeupdate"));
    expect(state).toHaveBeenLastCalledWith("ready");
    preview.dispose();
    expect(element.srcObject).toBeNull();
    expect(element.pause).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
  });
});
