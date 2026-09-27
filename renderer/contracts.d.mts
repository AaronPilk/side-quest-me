import type { z } from "zod";
export interface ClipSelectionShape {
  assetId: string;
  start: number;
  end: number;
  mute: boolean;
  fit: "fit" | "fill";
  crop: number;
  label: string;
}
export interface RenderManifestShape {
  version: 1;
  runId: string;
  revision: number;
  outputId: string;
  title: string;
  sponsorDisclosure?: string;
  clips: ClipSelectionShape[];
}
export const clipSelectionSchema: z.ZodType<ClipSelectionShape>;
export const renderManifestSchema: z.ZodType<RenderManifestShape>;
export const MEDIA_LIMITS: Readonly<{
  maxUploadBytes: number;
  maxOutputBytes: number;
  maxRawSeconds: number;
  minSelectedSeconds: number;
  maxSelectedSeconds: number;
  width: number;
  height: number;
  fps: number;
  maxJobMs: number;
  maxLocalBytes: number;
  maxInputsPerRun: number;
  sourceRetentionDays: number;
}>;
export function assertId(value: unknown): string;
