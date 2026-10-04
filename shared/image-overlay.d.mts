export type OverlayPosition =
  "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center";
export type OverlayTransform = { x: number; y: number; width: number };
export type OverlaySize = { width: number; height: number };
export type OverlayLayout = OverlaySize & { left: number; top: number };
export const OVERLAY_POSITIONS: readonly OverlayPosition[];
export const OVERLAY_MIN_WIDTH: number;
export function validOverlayTransform(
  value: unknown,
): value is OverlayTransform;
export function overlayLayout(
  size: OverlaySize,
  position: string,
  transform?: OverlayTransform,
): OverlayLayout;
export function overlayTransformForLayout(
  layout: OverlayLayout,
): OverlayTransform;
export function boundOverlayTransform(
  size: OverlaySize,
  transform: OverlayTransform,
): OverlayTransform;
