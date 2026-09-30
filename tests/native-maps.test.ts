import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  native: true,
  availability: vi.fn(),
  search: vi.fn(),
  lookup: vi.fn(),
  cancel: vi.fn(),
  web: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => mock }));
vi.mock("../src/lib/runtime", () => ({ isNativeApp: () => mock.native }));
vi.mock("../src/lib/apple-maps", async (original) => ({
  ...(await original<typeof import("../src/lib/apple-maps")>()),
  loadAppleMaps: mock.web,
}));
import { loadApplePlaceService } from "../src/lib/apple-place-service";
const place = {
  id: "I123456789",
  name: "Provider park",
  formattedAddress: "Provider street",
  coordinate: { latitude: 42, longitude: -71 },
  pointOfInterestCategory: "Park",
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.native = true;
  mock.availability.mockResolvedValue({ available: true });
  mock.cancel.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
describe("native Apple place service", () => {
  it("searches the native provider with an explicit area without requesting a web token", async () => {
    mock.search.mockResolvedValue({
      places: [
        place,
        place,
        { ...place, id: "BAD", coordinate: { latitude: 100, longitude: -71 } },
        { ...place, id: null },
      ],
    });
    const service = await loadApplePlaceService();
    expect(
      await service!.search("parks", {
        coordinate: { latitude: 42, longitude: -71 },
        signal: new AbortController().signal,
      }),
    ).toEqual([place]);
    expect(mock.search).toHaveBeenCalledWith({
      requestId: expect.any(String),
      query: "parks",
      latitude: 42,
      longitude: -71,
    });
    expect(mock.web).not.toHaveBeenCalled();
    expect(service!.mapkit).toBeUndefined();
  });
  it("keeps iOS before 18 on the explicit manual/external Maps fallback", async () => {
    mock.availability.mockResolvedValue({ available: false });
    expect(await loadApplePlaceService()).toBeNull();
    expect(mock.web).not.toHaveBeenCalled();
    expect(mock.search).not.toHaveBeenCalled();
  });
  it("does not infer unknown categories from venue names", async () => {
    mock.search.mockResolvedValue({
      places: [
        { ...place, name: "Museum Cafe Park", pointOfInterestCategory: null },
      ],
    });
    const service = await loadApplePlaceService();
    expect(
      (
        await service!.search("museums", {
          signal: new AbortController().signal,
        })
      )[0].pointOfInterestCategory,
    ).toBeNull();
  });
  it("validates lookups and refuses a different place than the saved ID", async () => {
    const service = await loadApplePlaceService();
    const options = { signal: new AbortController().signal };
    mock.lookup.mockResolvedValue({ place });
    expect(await service!.lookup(place.id, options)).toEqual(place);
    await expect(service!.lookup("I_OTHER", options)).rejects.toThrow(
      "different place",
    );
    await expect(
      service!.lookup("invalid place id", options),
    ).rejects.toThrow();
    expect(mock.lookup).toHaveBeenCalledTimes(2);
  });
  it("cancels a pending native search and ignores its later response", async () => {
    let complete!: (value: { places: (typeof place)[] }) => void;
    mock.search.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const service = await loadApplePlaceService();
    const controller = new AbortController();
    const pending = service!.search("parks", { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    expect(mock.cancel).toHaveBeenCalledWith({
      requestId: mock.search.mock.calls[0][0].requestId,
    });
    complete({ places: [place] });
    await expect(
      service!.search("parks", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mock.search).toHaveBeenCalledTimes(1);
  });
  it("preserves the browser SDK service outside the native build", async () => {
    mock.native = false;
    const search = vi.fn().mockResolvedValue({ places: [place] });
    const lookup = vi.fn().mockResolvedValue(place);
    const kit = {
      Search: class {
        search = search;
      },
      PlaceLookup: class {
        getPlace = lookup;
      },
    };
    mock.web.mockResolvedValue(kit);
    const service = await loadApplePlaceService();
    const options = { signal: new AbortController().signal };
    expect(service!.mapkit).toBe(kit);
    expect(await service!.search("parks", options)).toEqual([place]);
    expect(await service!.lookup(place.id, options)).toEqual(place);
    expect(mock.availability).not.toHaveBeenCalled();
  });
});
