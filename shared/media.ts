import { z } from "zod";
import {
  clipSelectionSchema,
  renderManifestSchema,
  MEDIA_LIMITS,
} from "../renderer/contracts.mjs";
export { clipSelectionSchema, renderManifestSchema, MEDIA_LIMITS };
export type ClipSelection = z.infer<typeof clipSelectionSchema>;
export type RenderManifest = z.infer<typeof renderManifestSchema>;
export interface ProbeMetadata {
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  hasAudio: boolean;
  audioCodec: string | null;
  format: string;
  bytes: number;
  sha256: string;
}
export interface LocalMediaAsset {
  assetId: string;
  generation: number;
  bytes: number;
  mime: string;
  probe: ProbeMetadata;
  sha256: string;
  status: "validated";
  previewUrl: string;
}
export interface LocalRenderResult {
  id: string;
  status: "ready";
  url: string;
  thumbnailUrl: string;
  metadata: ProbeMetadata & { renderMs: number };
}
