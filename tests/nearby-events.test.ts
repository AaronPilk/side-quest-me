import { afterEach, describe, expect, it, vi } from "vitest";
import {
  areaGeohash,
  eventbriteBrowseUrl,
  nearbyQuerySchema,
} from "../shared/events";
import { searchNearbyEvents } from "../worker/events";

afterEach(() => vi.unstubAllGlobals());
const now = new Date("2026-09-30T12:00:00Z");
const fixture = {
  id: "fixture-event",
  name: "Fixture concert",
  url: "https://www.ticketmaster.com/event/fixture",
  dates: {
    start: { localDate: "2026-10-02", localTime: "19:30:00" },
    status: { code: "onsale" },
  },
  _embedded: { venues: [{ name: "Fixture venue", city: { name: "Seattle" } }] },
  priceRanges: [{ min: 15, max: 30, currency: "USD" }],
};
describe("nearby provider integration", () => {
  it("keeps unconfigured inventory honest without requesting a provider", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await searchNearbyEvents({ area: "Seattle", days: 7 })).toEqual({
      configured: false,
      events: [],
      checkedAt: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires a bounded location and approved date range", () => {
    expect(nearbyQuerySchema.safeParse({}).success).toBe(false);
    expect(
      nearbyQuerySchema.safeParse({ area: "Seattle", days: 365 }).success,
    ).toBe(false);
    expect(
      nearbyQuerySchema.safeParse({ center: { latitude: 91, longitude: 0 } })
        .success,
    ).toBe(false);
    expect(nearbyQuerySchema.parse({ area: " Seattle " })).toEqual({
      area: "Seattle",
      days: 7,
    });
    expect(areaGeohash({ latitude: 42.6, longitude: -5.6 })).toBe("ezs42");
  });
  it("queries one fixed server provider with approximate location and upcoming dates, never returning its key", async () => {
    const fetcher = vi.fn(async (_url: URL, _options: RequestInit) =>
      Response.json({ _embedded: { events: [fixture] } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await searchNearbyEvents(
      {
        area: "ignored when GPS selected",
        center: { latitude: 42.6, longitude: -5.6 },
        days: 7,
      },
      "test-server-secret",
      now,
    );
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin).toBe("https://app.ticketmaster.com");
    expect(url.searchParams.get("geoPoint")).toBe("ezs42");
    expect(url.searchParams.has("latlong")).toBe(false);
    expect(url.searchParams.has("city")).toBe(false);
    expect(url.searchParams.get("endDateTime")).toBe("2026-10-07T12:00:00Z");
    expect(result.events).toEqual([
      {
        id: "fixture-event",
        name: "Fixture concert",
        url: fixture.url,
        source: "Ticketmaster",
        date: "2026-10-02",
        time: "19:30:00",
        venue: "Fixture venue",
        city: "Seattle",
        price: "USD 15.00–30.00 per ticket · fees may apply",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("test-server-secret");
  });
  it("filters canceled, undated, stale, duplicated, malformed and unsafe listings", async () => {
    const items = [
      fixture,
      fixture,
      { ...fixture, id: "unsafe", url: "javascript:alert(1)" },
      {
        ...fixture,
        id: "fake-domain",
        url: "https://ticketmaster.com.evil.test/event",
      },
      {
        ...fixture,
        id: "cancelled",
        dates: { ...fixture.dates, status: { code: "cancelled" } },
      },
      {
        ...fixture,
        id: "old",
        dates: {
          start: { localDate: "2020-01-01", dateTime: "2020-01-01T20:00:00Z" },
        },
      },
      {
        ...fixture,
        id: "far",
        dates: {
          start: { localDate: "2027-01-01", dateTime: "2027-01-01T20:00:00Z" },
        },
      },
      {
        ...fixture,
        id: "unknown",
        dates: { start: { localDate: "2026-10-02", dateTBD: true } },
      },
      { id: "bad" },
      {
        ...fixture,
        id: "universe",
        url: "https://www.universe.com/events/fixture",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ _embedded: { events: items } })),
    );
    const result = await searchNearbyEvents(
      { area: "Seattle", days: 7 },
      "test-key",
      now,
    );
    expect(result.events.map((e) => e.id)).toEqual([
      "fixture-event",
      "universe",
    ]);
  });
  it("compares real instants across venue midnight and honors exact range edges", async () => {
    const boundaryNow = new Date("2026-09-30T00:30:00Z");
    const event = (id: string, localDate: string, dateTime: string) => ({
      ...fixture,
      id,
      dates: { start: { localDate, localTime: "21:00:00", dateTime } },
    });
    const items = [
      event("new-york-tonight", "2026-09-29", "2026-09-29T21:00:00-04:00"),
      event("earlier-today", "2026-09-30", "2026-09-30T00:29:59Z"),
      event("exact-start", "2026-09-29", "2026-09-30T00:30:00Z"),
      event("exact-end", "2026-10-01", "2026-10-01T14:30:00+14:00"),
      event("after-end", "2026-10-01", "2026-10-01T00:30:01Z"),
      event("invalid-instant", "2026-09-30", "not-an-instant"),
      event("invalid-calendar-date", "2026-02-30", "2026-09-30T01:00:00Z"),
      {
        ...event("invalid-local-time", "2026-09-30", "2026-09-30T01:00:00Z"),
        dates: { start: { localDate: "2026-09-30", localTime: "29:99:99" } },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ _embedded: { events: items } })),
    );
    const result = await searchNearbyEvents(
      { area: "New York", days: 1 },
      "test-key",
      boundaryNow,
    );
    expect(result.events.map((item) => item.id)).toEqual([
      "new-york-tonight",
      "exact-start",
      "exact-end",
    ]);
    expect(result.events[0].date).toBe("2026-09-29");
    expect(result.events[0].time).toBe("21:00:00");
  });
  it("retains provider-filtered date-only listings without inventing a time or timezone", async () => {
    const items = [
      {
        ...fixture,
        id: "date-only",
        dates: { start: { localDate: "2026-09-29" } },
      },
      {
        ...fixture,
        id: "time-tba",
        dates: {
          start: {
            localDate: "2026-09-30",
            localTime: "00:00:00",
            dateTime: "2026-09-30T00:00:00Z",
            timeTBA: true,
          },
        },
      },
      {
        ...fixture,
        id: "all-day",
        dates: {
          start: {
            localDate: "2026-09-30",
            localTime: "00:00:00",
            noSpecificTime: true,
          },
        },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ _embedded: { events: items } })),
    );
    const result = await searchNearbyEvents(
      { area: "New York", days: 1 },
      "test-key",
      new Date("2026-09-30T00:30:00Z"),
    );
    expect(result.events.map((item) => item.id)).toEqual([
      "date-only",
      "time-tba",
      "all-day",
    ]);
    expect(result.events.every((item) => item.time === null)).toBe(true);
  });
  it("handles unavailable or oversized upstream responses without forwarding raw errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("raw provider credentials", { status: 401 }),
      ),
    );
    await expect(
      searchNearbyEvents({ area: "Seattle", days: 7 }, "test-key", now),
    ).rejects.toThrow("event_provider_unavailable");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(1_048_577))),
    );
    await expect(
      searchNearbyEvents({ area: "Seattle", days: 7 }, "test-key", now),
    ).rejects.toThrow("provider_response_too_large");
  });
  it("encodes external browse text without changing the destination", () => {
    const url = new URL(
      eventbriteBrowseUrl("Seattle&redirect=https://evil.test"),
    );
    expect(url.origin).toBe("https://www.eventbrite.com");
    expect(url.searchParams.has("redirect")).toBe(false);
  });
});
