export type CameraZoomRange = {
  min: number;
  max: number;
  /** Zero means the device did not report a quantization step. */
  step: number;
};

export type ZoomPoint = { id: number; x: number; y: number };
export type PinchZoomState = {
  pointerIds: readonly [number, number];
  distance: number;
  zoom: number;
};
export type CameraFacing = "user" | "environment" | "unknown";
type CameraDevice = { deviceId: string; label?: string; kind?: string };

function validRange(range: CameraZoomRange) {
  return (
    Number.isFinite(range.min) &&
    range.min > 0 &&
    Number.isFinite(range.max) &&
    range.max >= range.min &&
    Number.isFinite(range.step) &&
    range.step >= 0
  );
}

/** A missing/fixed zoom capability must not advertise an unsupported lens. */
export function zoomRangeFromCapabilities(
  capabilities: unknown,
): CameraZoomRange | null {
  if (!capabilities || typeof capabilities !== "object") return null;
  const zoom = (capabilities as { zoom?: unknown }).zoom;
  if (!zoom || typeof zoom !== "object") return null;
  const value = zoom as { min?: unknown; max?: unknown; step?: unknown };
  if (typeof value.min !== "number" || typeof value.max !== "number")
    return null;
  if (value.step !== undefined && typeof value.step !== "number") return null;
  const range = {
    min: value.min,
    max: value.max,
    step: value.step === undefined ? 0 : (value.step as number),
  };
  return validRange(range) && range.max > range.min ? range : null;
}

/** Quantize relative to the reported minimum, never outside hardware bounds. */
export function clampCameraZoom(
  value: number,
  range: CameraZoomRange,
  fallback = 1,
): number {
  if (!validRange(range)) return 1;
  const finite = Number.isFinite(value)
    ? value
    : Number.isFinite(fallback)
      ? fallback
      : 1;
  const bounded = Math.min(range.max, Math.max(range.min, finite));
  if (!range.step)
    return Math.min(
      range.max,
      Math.max(range.min, Number(bounded.toPrecision(12))),
    );
  const maximumSteps = Math.floor(
    (range.max - range.min) / range.step + Number.EPSILON * 16,
  );
  const steps = Math.min(
    maximumSteps,
    Math.max(0, Math.round((bounded - range.min) / range.step)),
  );
  const rounded = Number((range.min + steps * range.step).toPrecision(12));
  return Math.min(range.max, Math.max(range.min, rounded));
}

/** Only real, exactly attainable ratios become buttons; labels do not imply
 * an optical lens. Native callers supply their normalized, reported range. */
export function zoomButtonChoices(
  range: CameraZoomRange,
  preferred: readonly number[] = [0.5, 1, 2, 3, 5],
): number[] {
  if (!validRange(range)) return [];
  return [...new Set([range.min, ...preferred])]
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value >= range.min &&
        value <= range.max &&
        Math.abs(clampCameraZoom(value, range) - value) <=
          Math.max(1, value) * 1e-10,
    )
    .sort((left, right) => left - right);
}

/** Use applyConstraints, rather than a CSS crop that only changes preview. */
export function cameraZoomConstraints(
  value: number,
  range: CameraZoomRange,
): MediaTrackConstraints & {
  advanced: (MediaTrackConstraintSet & { zoom: number })[];
} {
  return { advanced: [{ zoom: clampCameraZoom(value, range) }] };
}

function pair(
  points: readonly ZoomPoint[],
  previous?: PinchZoomState | null,
): readonly [ZoomPoint, ZoomPoint] | null {
  const valid = points.filter(
    (point) =>
      Number.isSafeInteger(point.id) &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y),
  );
  if (
    valid.length < 2 ||
    new Set(valid.map(({ id }) => id)).size !== valid.length
  )
    return null;
  if (previous) {
    const first = valid.find(({ id }) => id === previous.pointerIds[0]);
    const second = valid.find(({ id }) => id === previous.pointerIds[1]);
    if (first && second) return [first, second];
  }
  return [valid[0], valid[1]];
}

function distance(points: readonly [ZoomPoint, ZoomPoint]) {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

export function beginPinchZoom(
  points: readonly ZoomPoint[],
  currentZoom: number,
  range: CameraZoomRange,
): PinchZoomState | null {
  const selected = pair(points);
  if (!selected) return null;
  const separation = distance(selected);
  if (!Number.isFinite(separation) || separation < 1) return null;
  return {
    pointerIds: [selected[0].id, selected[1].id],
    distance: separation,
    zoom: clampCameraZoom(currentZoom, range),
  };
}

/** Keep one distance/zoom baseline for the gesture. A replaced pointer rebases
 * at the currently applied zoom instead of jumping or compounding each move. */
export function updatePinchZoom(
  gesture: PinchZoomState | null,
  points: readonly ZoomPoint[],
  currentZoom: number,
  range: CameraZoomRange,
): { gesture: PinchZoomState | null; zoom: number } {
  const selected = pair(points, gesture);
  const unchanged = clampCameraZoom(currentZoom, range);
  if (!selected) return { gesture: null, zoom: unchanged };
  if (
    !gesture ||
    gesture.pointerIds[0] !== selected[0].id ||
    gesture.pointerIds[1] !== selected[1].id ||
    !Number.isFinite(gesture.distance) ||
    gesture.distance < 1 ||
    !Number.isFinite(gesture.zoom)
  )
    return {
      gesture: beginPinchZoom(selected, unchanged, range),
      zoom: unchanged,
    };
  const separation = distance(selected);
  if (!Number.isFinite(separation)) return { gesture: null, zoom: unchanged };
  return {
    gesture,
    zoom: clampCameraZoom(
      gesture.zoom * (separation / gesture.distance),
      range,
      unchanged,
    ),
  };
}

/** Track settings are authoritative; granted device labels are a fallback. */
export function cameraFacing(device: {
  label?: string;
  facingMode?: string | readonly string[];
}): CameraFacing {
  const modes =
    typeof device.facingMode === "string"
      ? [device.facingMode]
      : (device.facingMode ?? []);
  if (modes.includes("user")) return "user";
  if (modes.includes("environment")) return "environment";
  const label = device.label ?? "";
  if (/\b(front|facetime|selfie|user)\b/i.test(label)) return "user";
  if (
    /\b(back|rear|environment|world|telephoto)\b|ultra[\s_-]?wide/i.test(label)
  )
    return "environment";
  return "unknown";
}

/** Rear ultra-wide/telephoto devices are not front cameras. If facing cannot
 * be established, let the caller request opposite facingMode rather than guess. */
export function oppositeCameraDevice<T extends CameraDevice>(
  devices: readonly T[],
  currentDeviceId: string,
  currentFacing?: CameraFacing,
): T | null {
  const current = devices.find(({ deviceId }) => deviceId === currentDeviceId);
  const facing =
    currentFacing && currentFacing !== "unknown"
      ? currentFacing
      : cameraFacing(current ?? {});
  if (facing === "unknown") return null;
  const opposite = facing === "user" ? "environment" : "user";
  const candidates = devices.filter(
    (entry) =>
      entry.deviceId &&
      entry.deviceId !== currentDeviceId &&
      (!entry.kind || entry.kind === "videoinput") &&
      cameraFacing(entry) === opposite,
  );
  // Prefer the ordinary rear camera when returning from the selfie camera.
  return (
    candidates.find(
      ({ label }) => !/ultra[\s_-]?wide|telephoto|depth/i.test(label ?? ""),
    ) ??
    candidates[0] ??
    null
  );
}
