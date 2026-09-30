import type { Place } from "@apple/mapkit-loader";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ load: vi.fn(), lookup: vi.fn() }));
vi.mock("../src/lib/apple-place-service", () => ({
  loadApplePlaceService: mock.load,
}));
const fixture = (category: string | null = "Park", name = "MOCK Café") =>
  ({
    id: "MOCK_PLACE",
    name,
    pointOfInterestCategory: category,
  }) as Place;
beforeEach(() => {
  vi.resetModules();
  mock.load.mockReset();
  mock.lookup.mockReset();
});
afterEach(() => vi.useRealTimers());
describe("ephemeral Apple place category context", () => {
  it("uses structured provider categories, never name keywords or unsupported categories", async () => {
    const { rememberApplePlaceContext, selectedPlaceContext } =
      await import("../src/lib/place-context");
    expect(rememberApplePlaceContext(fixture())).toEqual({
      placeId: "MOCK_PLACE",
      category: "Park",
    });
    expect(await selectedPlaceContext("MOCK_PLACE")).toEqual({
      placeId: "MOCK_PLACE",
      category: "Park",
    });
    expect(mock.load).not.toHaveBeenCalled();
    expect(
      rememberApplePlaceContext(fixture(null, "Museum Park Restaurant")),
    ).toBeNull();
    expect(rememberApplePlaceContext(fixture("Hospital", "Park"))).toBeNull();
    expect(await selectedPlaceContext("MOCK_PLACE")).toBeNull();
  });
  it("expires category context and looks up the exact selected ID again", async () => {
    vi.useFakeTimers();
    const { rememberApplePlaceContext, selectedPlaceContext } =
      await import("../src/lib/place-context");
    rememberApplePlaceContext(fixture());
    vi.advanceTimersByTime(120_001);
    mock.lookup.mockResolvedValue(fixture("Museum"));
    mock.load.mockResolvedValue({
      lookup: mock.lookup,
    });
    expect(await selectedPlaceContext("MOCK_PLACE")).toEqual({
      placeId: "MOCK_PLACE",
      category: "Museum",
    });
    expect(mock.lookup).toHaveBeenCalledWith("MOCK_PLACE", {
      signal: expect.any(AbortSignal),
    });
  });
  it("falls back without fit claims if configuration is missing or lookup fails or returns another ID", async () => {
    const { selectedPlaceContext } = await import("../src/lib/place-context");
    mock.load.mockResolvedValue(null);
    expect(await selectedPlaceContext("MOCK_PLACE")).toBeNull();
    mock.load.mockResolvedValue({
      lookup: mock.lookup,
    });
    mock.lookup.mockRejectedValue(new Error("fixture provider unavailable"));
    expect(await selectedPlaceContext("MOCK_PLACE")).toBeNull();
    mock.lookup.mockResolvedValue({ ...fixture(), id: "ANOTHER_PLACE" });
    expect(await selectedPlaceContext("MOCK_PLACE")).toBeNull();
    const calls = mock.load.mock.calls.length;
    expect(await selectedPlaceContext(null)).toBeNull();
    expect(await selectedPlaceContext("bad place id")).toBeNull();
    expect(mock.load).toHaveBeenCalledTimes(calls);
  });
});
