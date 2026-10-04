import { accessToken, DEMO } from "./auth";
import { api, request } from "./api";
import { apiUrl } from "./runtime";
import type { Clip } from "./types";
import { validOverlayTransform } from "../../shared/image-overlay.mjs";
import {
  validSession,
  type RecordedTake,
  type ImageOverlay,
} from "./recording-session";

export async function saveRecordingSession(
  runId: string,
  takes: RecordedTake[],
  source: "camera" | "gallery",
  overlay?: ImageOverlay,
) {
  if (!validSession(takes))
    throw new Error("Record or import 5–60 seconds, up to 40 MB.");
  let video = takes[0].file;
  if (takes.length > 1 || overlay || takes[0].duration > 59.8) {
    const body = new FormData();
    takes.forEach((take, index) =>
      body.append("take", take.file, `take-${index}`),
    );
    if (overlay) {
      if (!overlay.file.size || overlay.file.size > 5 * 1024 * 1024)
        throw new Error("Choose an overlay image no larger than 5 MB.");
      body.append("overlay", overlay.file, "overlay");
      body.append("overlayPosition", overlay.position);
      if (overlay.transform) {
        if (!validOverlayTransform(overlay.transform))
          throw new Error("Choose a valid photo position and size.");
        body.append("overlayTransform", JSON.stringify(overlay.transform));
      }
    }
    const url = apiUrl(
      DEMO ? "/api/local-media/compose" : `/api/quest-runs/${runId}/compose`,
    );
    const token = await accessToken();
    const response = await fetch(url, {
      method: "POST",
      body,
      credentials: "omit",
      redirect: "error",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(DEMO ? { "X-Sidequest-Demo": "1" } : {}),
      },
    });
    if (!response.ok)
      throw new Error(
        "Your takes could not be prepared. They are still saved here; try again.",
      );
    video = await response.blob();
  }
  let clip: Clip;
  const settings = {
    mode: "session" as const,
    start: 0,
    fit: "fit" as const,
    crop: 0.5,
    mute: false,
    caption: "",
  };
  if (DEMO) {
    const result = await request<{
      assetId: string;
      generation: number;
      mime: string;
      probe: { duration: number };
      previewUrl: string;
    }>(`/api/local-media/uploads?runId=${runId}&slot=0`, {
      method: "POST",
      headers: { "Content-Type": video.type, "X-Sidequest-Demo": "1" },
      body: video,
    });
    const duration = Math.min(
      60,
      Math.floor(result.probe.duration * 1000) / 1000,
    );
    clip = {
      ...settings,
      id: result.assetId,
      generation: result.generation,
      slot: 0,
      duration,
      end: duration,
      mime: result.mime,
      previewUrl: result.previewUrl,
    };
  } else {
    const reservation = await request<{ id: string; uploadUrl: string }>(
      `/api/quest-runs/${runId}/uploads`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          slot: 0,
          bytes: video.size,
          mime: video.type,
          source,
        }),
      },
    );
    const uploaded = await request<{ duration_ms: number }>(
      reservation.uploadUrl,
      { method: "PUT", headers: { "Content-Type": video.type }, body: video },
    );
    clip = await request<Clip>(`/api/media/${reservation.id}/finalize`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        ...settings,
        end: Math.min(60, uploaded.duration_ms / 1000),
      }),
    });
  }
  return api.saveClip(runId, clip);
}
