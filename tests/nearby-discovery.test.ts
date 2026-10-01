import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OUTING } from "../shared/domain";
import {
  discoverNearbyPlaces,
  discoveryQueries,
} from "../src/lib/nearby-discovery";
import type { ApplePlaceService } from "../src/lib/apple-place-service";
const place = (id: string) => ({
  id,
  name: id,
  formattedAddress: "Town",
  coordinate: { latitude: 27.7, longitude: -82.6 },
  pointOfInterestCategory: null,
});
describe("discovery from an area", () => {
  it("searches multiple experiences without a typed venue category and mixes the results", async () => {
    const search = vi.fn(async (query: string) => [
      place(query),
      place("shared"),
    ]);
    const service: ApplePlaceService = { search, lookup: vi.fn() };
    const outing = {
      ...DEFAULT_OUTING,
      setting: "venue" as const,
      intensity: "full_send" as const,
      area: "St Petersburg",
    };
    const result = await discoverNearbyPlaces(
      outing,
      undefined,
      new AbortController().signal,
      service,
    );
    expect(search).toHaveBeenCalledTimes(4);
    expect(
      search.mock.calls.every(([q]) => q.endsWith(" in St Petersburg")),
    ).toBe(true);
    expect(result.slice(0, 4).map((p) => p.id)).toEqual(
      discoveryQueries(outing).map((q) => q + " in St Petersburg"),
    );
    expect(result.filter((p) => p.id === "shared")).toHaveLength(1);
  });
  it("uses coordinates as regional search input without appending a stale town", async () => {
    const search = vi.fn(async () => [place("test")]);
    const center = { latitude: 27.7, longitude: -82.6 };
    await discoverNearbyPlaces(
      { ...DEFAULT_OUTING, setting: "outside", area: "Old town" },
      center,
      new AbortController().signal,
      { search, lookup: vi.fn() },
    );
    expect(search).toHaveBeenCalledWith(
      expect.not.stringContaining("Old town"),
      expect.objectContaining({ coordinate: center }),
    );
  });
  it("does not require a place; an explicit place is looked up and checked", async () => {
    const lookup = vi.fn(async () => place("I1234567890ABCDEF"));
    const service: ApplePlaceService = { search: vi.fn(), lookup };
    expect(
      await discoverNearbyPlaces(
        { ...DEFAULT_OUTING, setting: "venue", area: "" },
        undefined,
        new AbortController().signal,
        service,
      ),
    ).toEqual([]);
    await discoverNearbyPlaces(
      {
        ...DEFAULT_OUTING,
        setting: "venue",
        applePlaceId: "I1234567890ABCDEF",
      },
      undefined,
      new AbortController().signal,
      service,
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    await expect(
      discoverNearbyPlaces(
        {
          ...DEFAULT_OUTING,
          setting: "venue",
          applePlaceId: "I1234567890ABCDEA",
        },
        undefined,
        new AbortController().signal,
        service,
      ),
    ).rejects.toThrow("verified");
  });
  it("keeps partial search success and surfaces total failure", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([place("one")]);
    const service: ApplePlaceService = { search, lookup: vi.fn() };
    expect(
      await discoverNearbyPlaces(
        { ...DEFAULT_OUTING, setting: "venue", area: "Town" },
        undefined,
        new AbortController().signal,
        service,
      ),
    ).toHaveLength(1);
    search.mockRejectedValue(new Error("offline"));
    await expect(
      discoverNearbyPlaces(
        { ...DEFAULT_OUTING, setting: "venue", area: "Town" },
        undefined,
        new AbortController().signal,
        service,
      ),
    ).rejects.toThrow("Retry");
  });
});
