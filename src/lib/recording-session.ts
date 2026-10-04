import type { Clip } from "./types";
import type {
  OverlayPosition,
  OverlayTransform,
} from "../../shared/image-overlay.mjs";

export type RecordedTake = {
  file: Blob;
  duration: number;
  nativeRecordingId?: string;
};
export type ImageOverlay = {
  file: Blob;
  position: OverlayPosition;
  transform?: OverlayTransform;
};
export const SESSION_DRAFT_SLOT = 3;
export const SESSION_SECONDS = 60;
export function sessionSeconds(takes: RecordedTake[]) {
  return takes.reduce((sum, take) => sum + take.duration, 0);
}
export function validSession(takes: RecordedTake[]) {
  const seconds = sessionSeconds(takes);
  return (
    takes.length > 0 &&
    takes.length <= 30 &&
    seconds >= 5 &&
    seconds <= 60.1 &&
    takes.every(
      (take) =>
        take.file.size > 0 &&
        Number.isFinite(take.duration) &&
        take.duration > 0,
    ) &&
    takes.reduce((sum, take) => sum + take.file.size, 0) <= 40 * 1024 * 1024
  );
}
export function hasReadyVideo(clips: Clip[]) {
  return (
    (clips.length === 1 &&
      clips[0].mode === "session" &&
      clips[0].slot === 0 &&
      clips[0].end - clips[0].start >= 5 &&
      clips[0].end - clips[0].start <= 60) ||
    (clips.length === 3 &&
      new Set(clips.map((clip) => clip.slot)).size === 3 &&
      clips.every(
        (clip) => clip.end - clip.start >= 5 && clip.end - clip.start <= 15,
      ))
  );
}
