import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}));
vi.mock("@capacitor/geolocation", () => ({ Geolocation: native }));
import { currentArea } from "../src/lib/location";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_NATIVE", "true");
  native.checkPermissions.mockResolvedValue({ location: "granted" });
  native.getCurrentPosition.mockResolvedValue({
    coords: { latitude: 25.7, longitude: -80.2, accuracy: 10 },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("one-time native location", () => {
  it("uses native location with bounded options and returns only coordinates", async () => {
    expect(await currentArea()).toEqual({ latitude: 25.7, longitude: -80.2 });
    expect(native.getCurrentPosition).toHaveBeenCalledWith({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    });
  });
  it("preserves a denied permission without requesting another reading", async () => {
    native.checkPermissions.mockResolvedValue({ location: "denied" });
    await expect(currentArea()).rejects.toThrow("search by town");
    expect(native.getCurrentPosition).not.toHaveBeenCalled();
  });
  it("allows the OS prompt from a user-initiated reading and surfaces provider failures", async () => {
    native.checkPermissions.mockResolvedValue({ location: "prompt" });
    native.getCurrentPosition.mockRejectedValue(new Error("Location disabled"));
    await expect(currentArea()).rejects.toThrow("Location disabled");
  });
  it("keeps browser location unchanged and rejects impossible coordinates", async () => {
    vi.stubEnv("VITE_NATIVE", "false");
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 500, longitude: 0 },
          } as GeolocationPosition),
      },
    });
    await expect(currentArea()).rejects.toThrow("could not be determined");
    expect(native.getCurrentPosition).not.toHaveBeenCalled();
  });
});
