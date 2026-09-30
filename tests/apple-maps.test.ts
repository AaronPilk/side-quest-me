import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapKit, Place } from "@apple/mapkit-loader";
import { DEFAULT_OUTING, outingSchema } from "../shared/domain";
import {
  appleDirectionsUrl,
  applePlaceIdSchema,
  applePlaceUrl,
  appleSearchUrl,
} from "../shared/places";
import { uniquePlaces } from "../src/lib/apple-maps";

const loader = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@apple/mapkit-loader", () => ({ load: loader.load }));

const fixturePlace = (id: string, extra: Partial<Place> = {}) =>
  ({
    id,
    name: `Mock place ${id}`,
    formattedAddress: "Mock address for unit verification only",
    coordinate: { latitude: 47.620123, longitude: -122.350456 },
    ...extra,
  }) as Place;

describe("Apple Maps links and stored place identity", () => {
  it.each([
    "I123ABC",
    "id&mode=driving#redirect",
    "https://untrusted.example/place",
    "//untrusted.example",
    "a?destination=evil",
  ])("encodes place ID %s within a fixed Apple URL", (id) => {
    const url = new URL(applePlaceUrl(id));
    expect(url.origin).toBe("https://maps.apple.com");
    expect(url.pathname).toBe("/place");
    expect([...url.searchParams]).toEqual([["place-id", id]]);
    expect(url.hash).toBe("");
  });
  it("encodes search text and limits it without producing extra URL parameters", () => {
    const url = new URL(
      appleSearchUrl(
        "  parks & cafés #sunshine?redirect=https://elsewhere.example  ",
      ),
    );
    expect(url.origin).toBe("https://maps.apple.com");
    expect(url.pathname).toBe("/search");
    expect([...url.searchParams]).toEqual([
      ["query", "parks & cafés #sunshine?redirect=https://elsewhere.example"],
    ]);
    expect(new URL(appleSearchUrl(" ")).searchParams.get("query")).toBe(
      "parks",
    );
    expect(
      new URL(appleSearchUrl("x".repeat(300))).searchParams.get("query"),
    ).toHaveLength(250);
  });
  it.each([
    ["walk", "walking"],
    ["car", "driving"],
    ["bike", "cycling"],
    ["transit", "transit"],
    ["none", null],
    ["evil&mode=driving", null],
  ])("creates directions for %s", (transport, mode) => {
    const url = new URL(
      appleDirectionsUrl(
        "id&extra=value",
        { latitude: 47.620123, longitude: -122.350456 },
        transport!,
      ),
    );
    expect(url.origin).toBe("https://maps.apple.com");
    expect(url.pathname).toBe("/directions");
    expect(url.searchParams.get("destination")).toBe("47.620123,-122.350456");
    expect(url.searchParams.get("destination-place-id")).toBe("id&extra=value");
    expect(url.searchParams.get("mode")).toBe(mode);
    expect(url.searchParams.has("extra")).toBe(false);
  });
  it.each(["", "two ids", "a\nb", "a\u0000b", "a\u007fb", "x".repeat(257)])(
    "rejects invalid durable IDs %j",
    (id) => {
      expect(applePlaceIdSchema.safeParse(id).success).toBe(false);
    },
  );
  it("keeps old outings valid and allows only the selected ID in new outings", () => {
    expect(outingSchema.parse(DEFAULT_OUTING)).not.toHaveProperty(
      "applePlaceId",
    );
    const withPlace = outingSchema.parse({
      ...DEFAULT_OUTING,
      setting: "outside",
      applePlaceId: "I123ABC",
    });
    expect(withPlace.applePlaceId).toBe("I123ABC");
    expect(
      outingSchema.parse({ ...withPlace, applePlaceId: null }).applePlaceId,
    ).toBeNull();
    for (const property of [
      "placeName",
      "formattedAddress",
      "coordinate",
      "latitude",
      "longitude",
    ])
      expect(
        outingSchema.safeParse({ ...withPlace, [property]: "must not persist" })
          .success,
      ).toBe(false);
  });
  it("removes duplicate and unusable search results, including alternate IDs, and bounds results", () => {
    const all = [
      fixturePlace("first", { alternateIds: ["alias"] }),
      fixturePlace("alias"),
      fixturePlace("third", { alternateIds: ["first"] }),
      fixturePlace(""),
      fixturePlace("no-name", { name: "" }),
      fixturePlace("no-coordinate", { coordinate: undefined }),
      ...Array.from({ length: 10 }, (_, index) =>
        fixturePlace(`valid-${index}`),
      ),
    ];
    expect(uniquePlaces(all).map((place) => place.id)).toEqual([
      "first",
      ...Array.from({ length: 7 }, (_, index) => `valid-${index}`),
    ]);
  });
});

describe("Apple Maps loader without live authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { language: "en-US" });
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => ({ remove: vi.fn() })),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("returns an honest unconfigured state without loading the SDK", async () => {
    const fetcher = vi.fn(async () => Response.json({ token: null }));
    vi.stubGlobal("fetch", fetcher);
    const { loadAppleMaps } = await import("../src/lib/apple-maps");
    await expect(loadAppleMaps()).resolves.toBeNull();
    expect(loader.load).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/maps/config",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it("shares one configured SDK load and requests the services plus map libraries", async () => {
    const mockKit = { mock: true } as unknown as MapKit;
    loader.load.mockResolvedValue(mockKit);
    const fetcher = vi.fn(async () =>
      Response.json({ token: "mock-token-for-unit-verification" }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { loadAppleMaps } = await import("../src/lib/apple-maps");
    expect(await Promise.all([loadAppleMaps(), loadAppleMaps()])).toEqual([
      mockKit,
      mockKit,
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loader.load).toHaveBeenCalledExactlyOnceWith({
      token: "mock-token-for-unit-verification",
      version: "6",
      libraries: ["services", "full-map"],
      language: "en-US",
    });
  });
  it("clears failed downloads so an explicit retry can load again", async () => {
    const remove = vi.fn();
    vi.stubGlobal("document", { querySelector: vi.fn(() => ({ remove })) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ token: "mock-token" })),
    );
    loader.load
      .mockRejectedValueOnce(new Error("Simulated SDK failure"))
      .mockResolvedValueOnce({ mock: true });
    const { loadAppleMaps } = await import("../src/lib/apple-maps");
    await expect(loadAppleMaps()).rejects.toThrow(
      "Try again or open Apple Maps directly",
    );
    expect(remove).toHaveBeenCalledOnce();
    await expect(loadAppleMaps()).resolves.toEqual({ mock: true });
    expect(loader.load).toHaveBeenCalledTimes(2);
  });
});
