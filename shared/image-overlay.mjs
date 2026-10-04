export const OVERLAY_POSITIONS = [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
  "center",
];
export const OVERLAY_MIN_WIDTH = 0.08;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Center coordinates and width are relative to the final 1080 × 1920 video. */
export function validOverlayTransform(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.keys(value).length === 3 &&
    ["x", "y", "width"].every((key) => Number.isFinite(value[key])) &&
    value.x >= 0 &&
    value.x <= 1 &&
    value.y >= 0 &&
    value.y <= 1 &&
    value.width >= OVERLAY_MIN_WIDTH &&
    value.width <= 1
  );
}

/** One geometry implementation drives preview, gestures and raster export. */
export function overlayLayout(size, position, transform) {
  if (
    !OVERLAY_POSITIONS.includes(position) ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    (transform !== undefined && !validOverlayTransform(transform))
  )
    throw new Error("Choose a valid image position and size.");
  let width, height, left, top;
  if (transform) {
    width = Math.min(1080 * transform.width, (1920 * size.width) / size.height);
    height = (width * size.height) / size.width;
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    left = Math.round(clamp(transform.x * 1080 - width / 2, 0, 1080 - width));
    top = Math.round(clamp(transform.y * 1920 - height / 2, 0, 1920 - height));
  } else {
    const centered = position === "center";
    const ratio = Math.min(
      1,
      (centered ? 650 : 360) / size.width,
      (centered ? 800 : 480) / size.height,
    );
    width = Math.max(1, Math.round(size.width * ratio));
    height = Math.max(1, Math.round(size.height * ratio));
    left = centered
      ? Math.round((1080 - width) / 2)
      : position.endsWith("right")
        ? 1020 - width
        : 60;
    top = centered
      ? Math.round((1920 - height) / 2)
      : position.startsWith("bottom")
        ? 1620 - height
        : 180;
  }
  return { left, top, width, height };
}

export function overlayTransformForLayout(layout) {
  return {
    x: (layout.left + layout.width / 2) / 1080,
    y: (layout.top + layout.height / 2) / 1920,
    width: clamp(layout.width / 1080, OVERLAY_MIN_WIDTH, 1),
  };
}

export function boundOverlayTransform(size, transform) {
  return overlayTransformForLayout(
    overlayLayout(size, "center", {
      x: clamp(transform.x, 0, 1),
      y: clamp(transform.y, 0, 1),
      width: clamp(transform.width, OVERLAY_MIN_WIDTH, 1),
    }),
  );
}
