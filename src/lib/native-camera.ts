import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

export type NativeCameraState = {
  captureId: string;
  position: "back" | "front";
  zoom: number;
  minZoom: number;
  maxZoom: number;
  presets: number[];
  torchAvailable: boolean;
  torch?: boolean;
  canFlip?: boolean;
};
export type NativeCameraTake = {
  contextId: string;
  captureId: string;
  recordingId: string;
  fileUrl: string;
  durationMs: number;
  mimeType: string;
  interrupted?: boolean;
};
export type PreviewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type CameraNotice = { message?: string };
interface NativeCameraPlugin {
  start(options: {
    contextId: string;
    captureId: string;
    position: "back" | "front";
    preview: PreviewBounds;
  }): Promise<NativeCameraState>;
  updatePreview(options: { preview: PreviewBounds }): Promise<void>;
  setZoom(options: { zoom: number }): Promise<NativeCameraState>;
  flip(): Promise<NativeCameraState>;
  setTorch(options: { enabled: boolean }): Promise<NativeCameraState>;
  startRecording(options: { recordingId: string }): Promise<void>;
  stopRecording(): Promise<NativeCameraTake>;
  discardRecording(options: { fileUrl: string }): Promise<void>;
  recoverRecordings(options: {
    contextId: string;
  }): Promise<{ takes: NativeCameraTake[] }>;
  stop(): Promise<void>;
  clearRecordings(): Promise<void>;
  addListener(
    event: "cameraReady",
    listener: (state: NativeCameraState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "recordingStopped",
    listener: (take: NativeCameraTake) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "interrupted" | "cameraError",
    listener: (notice: CameraNotice) => void,
  ): Promise<PluginListenerHandle>;
}

export const nativeCamera =
  registerPlugin<NativeCameraPlugin>("SidequestCamera");
export function usesNativeCamera() {
  return (
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("SidequestCamera")
  );
}

/** Copy finalized recording bytes into the existing durable device-draft pipeline. */
export async function readNativeCameraTake(
  take: NativeCameraTake,
): Promise<Blob> {
  const url = new URL(take.fileUrl);
  if (
    url.protocol !== "file:" ||
    url.host ||
    !/\/SidequestCamera\/[A-Za-z0-9_-]+\.(mov|mp4)$/.test(url.pathname) ||
    /%(2f|5c|2e|0[0-9a-f]|1[0-9a-f]|7f)/i.test(take.fileUrl) ||
    /\/(?:\.|\.\.)(?:\/|$)/.test(take.fileUrl) ||
    url.search ||
    url.hash ||
    !Number.isFinite(take.durationMs) ||
    take.durationMs <= 0
  )
    throw new Error(
      "The camera could not prepare this take. Your earlier takes are saved.",
    );
  const localUrl = Capacitor.convertFileSrc(take.fileUrl);
  const response = await fetch(localUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  // Capacitor's WKURLSchemeHandler serves MOV/MP4 using URLResponse rather
  // than HTTPURLResponse. WebKit returns its readable body with status 0,
  // ok=false, type=basic, and no MIME header. That is a local media response,
  // not a failed HTTP download. Never accept opaque/error or remote responses
  // this way, and still copy/check every byte before the caller removes a take.
  const converted = new URL(localUrl);
  const localMediaResponse =
    response.status === 0 &&
    response.type === "basic" &&
    Capacitor.getPlatform() === "ios" &&
    converted.protocol === "capacitor:" &&
    converted.host === "localhost" &&
    !converted.username &&
    !converted.password &&
    !converted.search &&
    !converted.hash &&
    converted.pathname === `/_capacitor_file_${url.pathname}`;
  if (!response.ok && !localMediaResponse)
    throw new Error(
      "This take could not be read. Keep the camera open and try again.",
    );
  const blob = await response.blob();
  if (!blob.size || blob.size > 40 * 1024 * 1024)
    throw new Error(
      "This take exceeds the recording size limit. Your earlier takes are saved.",
    );
  return new Blob([await blob.arrayBuffer()], {
    type: take.mimeType === "video/mp4" ? "video/mp4" : "video/quicktime",
  });
}
