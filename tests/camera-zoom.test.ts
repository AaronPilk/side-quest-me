import { describe, expect, it } from "vitest";
import {
  beginPinchZoom,
  cameraFacing,
  cameraZoomConstraints,
  clampCameraZoom,
  oppositeCameraDevice,
  updatePinchZoom,
  zoomButtonChoices,
  zoomRangeFromCapabilities,
  type ZoomPoint,
} from "../src/lib/camera-zoom";

const range = { min: 1, max: 6, step: 0.1 };
const points = (separation: number): ZoomPoint[] => [
  { id: 11, x: 20, y: 30 },
  { id: 22, x: 20 + separation, y: 30 },
];

describe("actual camera zoom capabilities", () => {
  it("rejects unsupported, fixed, malformed or non-finite hardware ranges", () => {
    for (const capabilities of [
      undefined,
      {},
      { zoom: true },
      { zoom: { min: "1", max: 6 } },
      { zoom: { min: 1, max: 1 } },
      { zoom: { min: 2, max: 1 } },
      { zoom: { min: 0, max: 6 } },
      { zoom: { min: 1, max: Infinity } },
      { zoom: { min: 1, max: 6, step: -1 } },
      { zoom: { min: 1, max: 6, step: NaN } },
    ])
      expect(zoomRangeFromCapabilities(capabilities)).toBeNull();
    expect(zoomRangeFromCapabilities({ zoom: range, torch: true })).toEqual(
      range,
    );
    expect(zoomRangeFromCapabilities({ zoom: { min: 1, max: 3 } })).toEqual({
      min: 1,
      max: 3,
      step: 0,
    });
  });

  it("clamps and rounds actual recording constraints relative to the hardware minimum", () => {
    expect(clampCameraZoom(-30, range)).toBe(1);
    expect(clampCameraZoom(40, range)).toBe(6);
    expect(clampCameraZoom(2.34, range)).toBe(2.3);
    expect(clampCameraZoom(2.37, range)).toBe(2.4);
    expect(clampCameraZoom(1.18, { min: 0.6, max: 4.2, step: 0.4 })).toBe(1);
    expect(clampCameraZoom(2, { min: 1, max: 2, step: 0.6 })).toBe(1.6);
    expect(cameraZoomConstraints(2.37, range)).toEqual({
      advanced: [{ zoom: 2.4 }],
    });
  });

  it("never returns NaN/Infinity for bad input, fallback or range", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(clampCameraZoom(value, range, 2.3)).toBe(2.3);
      expect(clampCameraZoom(value, range, NaN)).toBe(1);
    }
    expect(clampCameraZoom(3, { min: 1, max: Infinity, step: 0.1 })).toBe(1);
    expect(clampCameraZoom(1.234567, { min: 0.5, max: 5, step: 0 })).toBe(
      1.234567,
    );
    const precise = { min: 1.2345678901233, max: 1.2345678901234, step: 0 };
    expect(clampCameraZoom(precise.min, precise)).toBeGreaterThanOrEqual(
      precise.min,
    );
    expect(clampCameraZoom(precise.max, precise)).toBeLessThanOrEqual(
      precise.max,
    );
  });

  it("shows no fake 0.5 lens when a browser reports a minimum of 1", () => {
    expect(zoomButtonChoices(range)).toEqual([1, 2, 3, 5]);
    expect(zoomButtonChoices({ min: 0.5, max: 3, step: 0.1 })).toEqual([
      0.5, 1, 2, 3,
    ]);
    expect(zoomButtonChoices({ min: 0.6, max: 3, step: 0.1 })).toEqual([
      0.6, 1, 2, 3,
    ]);
    expect(zoomButtonChoices({ min: 1, max: 2, step: 0.6 })).toEqual([1]);
    expect(zoomButtonChoices(range, [2, 2, NaN, Infinity, 10])).toEqual([1, 2]);
  });
});

describe("two-pointer zoom", () => {
  it("starts at the current zoom without jumping, then uses an unchanged distance baseline", () => {
    const first = updatePinchZoom(null, points(100), 2, range);
    expect(first.zoom).toBe(2);
    expect(first.gesture).toEqual({
      pointerIds: [11, 22],
      distance: 100,
      zoom: 2,
    });
    const second = updatePinchZoom(
      first.gesture,
      points(150),
      first.zoom,
      range,
    );
    expect(second.zoom).toBe(3);
    const third = updatePinchZoom(
      second.gesture,
      points(200),
      second.zoom,
      range,
    );
    expect(third.zoom).toBe(4); // A compounded per-move baseline would incorrectly produce 6.
    expect(third.gesture).toBe(first.gesture);
    expect(
      updatePinchZoom(third.gesture, points(50), third.zoom, range).zoom,
    ).toBe(1);
  });

  it("clamps a pinch to real limits and tolerates reordered pointer events", () => {
    const gesture = beginPinchZoom(points(100), 2, range);
    expect(updatePinchZoom(gesture, points(500).reverse(), 2, range).zoom).toBe(
      6,
    );
    expect(updatePinchZoom(gesture, points(10), 6, range).zoom).toBe(1);
    expect(
      updatePinchZoom(
        gesture,
        [
          { id: 11, x: 20, y: 30 },
          { id: 22, x: 20, y: 180 },
        ],
        2,
        range,
      ).zoom,
    ).toBe(3);
  });

  it("rebases when one finger changes, and ignores an extra finger while the original pair remains", () => {
    const gesture = beginPinchZoom(points(100), 2, range);
    const extra = { id: 33, x: 1000, y: 0 };
    expect(
      updatePinchZoom(gesture, [extra, ...points(150)], 2, range).zoom,
    ).toBe(3);
    const replacement = updatePinchZoom(
      gesture,
      [points(100)[0], extra],
      3,
      range,
    );
    expect(replacement.zoom).toBe(3);
    expect(replacement.gesture?.pointerIds).toEqual([11, 33]);
    expect(replacement.gesture?.zoom).toBe(3);
    expect(
      updatePinchZoom(replacement.gesture, [points(100)[0]], 3, range),
    ).toEqual({ gesture: null, zoom: 3 });
    expect(updatePinchZoom(null, points(200), 3, range).zoom).toBe(3);
  });

  it("does not amplify coincident/invalid pointers or resume a corrupt gesture", () => {
    expect(beginPinchZoom(points(0), 2, range)).toBeNull();
    expect(beginPinchZoom([{ id: 11, x: 0, y: 0 }], 2, range)).toBeNull();
    expect(
      beginPinchZoom(
        [
          { id: 11, x: 0, y: 0 },
          { id: 11, x: 100, y: 0 },
        ],
        2,
        range,
      ),
    ).toBeNull();
    expect(
      beginPinchZoom(
        [
          { id: 11, x: NaN, y: 0 },
          { id: 22, x: 100, y: 0 },
        ],
        2,
        range,
      ),
    ).toBeNull();
    const recovery = updatePinchZoom(
      { pointerIds: [11, 22], distance: 0, zoom: NaN },
      points(100),
      2.5,
      range,
    );
    expect(recovery.zoom).toBe(2.5);
    expect(recovery.gesture?.distance).toBe(100);
    expect(
      updatePinchZoom(
        recovery.gesture,
        [
          { id: 11, x: Number.MAX_VALUE, y: 0 },
          { id: 22, x: -Number.MAX_VALUE, y: 0 },
        ],
        2.5,
        range,
      ),
    ).toEqual({ gesture: null, zoom: 2.5 });
  });
});

describe("front/rear camera selection", () => {
  const rearUltra = {
    deviceId: "ultra",
    kind: "videoinput",
    label: "Back Ultra Wide Camera",
  };
  const rearTele = {
    deviceId: "tele",
    kind: "videoinput",
    label: "Back Telephoto Camera",
  };
  const rearMain = {
    deviceId: "main",
    kind: "videoinput",
    label: "Back Camera",
  };
  const front = {
    deviceId: "front",
    kind: "videoinput",
    label: "Front Camera",
  };
  const devices = [rearUltra, rearTele, rearMain, front];

  it("treats rear optical lenses as rear, and flips to the opposite facing rather than array order", () => {
    for (const rear of devices.slice(0, 3)) {
      expect(cameraFacing(rear)).toBe("environment");
      expect(oppositeCameraDevice(devices, rear.deviceId)).toBe(front);
    }
    expect(oppositeCameraDevice(devices, front.deviceId)).toBe(rearMain);
    expect(cameraFacing({ label: "Front Ultra Wide Camera" })).toBe("user");
    expect(cameraFacing({ label: "FaceTime HD Camera" })).toBe("user");
  });

  it("uses reported facingMode when available and does not guess unidentified cameras", () => {
    expect(cameraFacing({ label: "Back Camera", facingMode: "user" })).toBe(
      "user",
    );
    expect(cameraFacing({ facingMode: ["environment"] })).toBe("environment");
    expect(cameraFacing({ label: "Camera 0" })).toBe("unknown");
    expect(
      oppositeCameraDevice([{ deviceId: "one" }, { deviceId: "two" }], "one"),
    ).toBeNull();
    expect(
      oppositeCameraDevice([{ deviceId: "one" }, front], "one", "environment"),
    ).toBe(front);
    expect(
      oppositeCameraDevice([rearUltra, rearTele, rearMain], "main"),
    ).toBeNull();
    expect(
      oppositeCameraDevice(
        [rearMain, { ...front, kind: "audioinput" }],
        "main",
      ),
    ).toBeNull();
  });
});
