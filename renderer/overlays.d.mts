export const OVERLAY_POSITIONS: readonly [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
  "center",
];
export const MAX_OVERLAY_BYTES: number;
export function watermarkSvg(): string;
export function writeWatermark(file: string): Promise<void>;
export function writeImageOverlay(
  source: string,
  position: string,
  output: string,
): Promise<void>;
