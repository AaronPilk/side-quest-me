import { z } from "zod";
import {
  areaGeohash,
  type NearbyQuery,
  type NearbyResult,
} from "../shared/events.ts";

const text = z.string().max(1000);
const eventSchema = z.object({
  id: text,
  name: text,
  url: z.url(),
  dates: z.object({
    start: z.object({
      localDate: z.iso.date(),
      dateTime: z.iso.datetime({ offset: true }).optional(),
      localTime: z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
        .optional(),
      dateTBA: z.boolean().optional(),
      dateTBD: z.boolean().optional(),
      timeTBA: z.boolean().optional(),
      noSpecificTime: z.boolean().optional(),
    }),
    status: z.object({ code: text }).optional(),
  }),
  _embedded: z
    .object({
      venues: z
        .array(
          z.object({ name: text, city: z.object({ name: text }).optional() }),
        )
        .max(30),
    })
    .optional(),
  priceRanges: z
    .array(
      z.object({
        min: z.number().finite().nonnegative(),
        max: z.number().finite().nonnegative(),
        currency: z.string().regex(/^[A-Z]{3}$/),
      }),
    )
    .max(20)
    .optional(),
});

function sourceFor(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const host = url.hostname;
  if (host === "universe.com" || host.endsWith(".universe.com"))
    return "Universe";
  if (host === "frontgatetickets.com" || host.endsWith(".frontgatetickets.com"))
    return "Front Gate Tickets";
  if (
    /^(?:[a-z0-9-]+\.)*ticketmaster\.(?:com|ca|co\.uk|com\.au|co\.nz|ie|de|fr|nl|es|se|no|dk|fi|be|at|ch|pl|cz|mx)$/.test(
      host,
    )
  )
    return "Ticketmaster";
  return null;
}

async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty_provider_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_048_576) {
      await reader.cancel();
      throw new Error("provider_response_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** Called only by server handlers; provider secrets and raw responses never reach the client. */
export async function searchNearbyEvents(
  query: NearbyQuery,
  key?: string,
  now = new Date(),
): Promise<NearbyResult> {
  if (!key) return { configured: false, events: [], checkedAt: null };
  const end = new Date(now.getTime() + query.days * 86_400_000);
  const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.search = new URLSearchParams({
    apikey: key,
    ...(query.center
      ? { geoPoint: areaGeohash(query.center), radius: "25", unit: "miles" }
      : { city: query.area }),
    size: "20",
    sort: "date,asc",
    startDateTime: iso(now),
    endDateTime: iso(end),
    includeTBA: "no",
    includeTBD: "no",
    includeTest: "no",
    source: "ticketmaster,universe,frontgate",
  }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("event_provider_unavailable");
  const payload = z
    .object({
      _embedded: z.object({ events: z.array(z.unknown()).max(100) }).optional(),
    })
    .parse(await boundedJson(response));
  const seen = new Set<string>();
  const events = (payload._embedded?.events || [])
    .flatMap((raw) => {
      const parsed = eventSchema.safeParse(raw);
      if (!parsed.success) return [];
      const event = parsed.data;
      const start = event.dates.start;
      // localDate is the venue's calendar date, not UTC. An evening in New
      // York can be tomorrow in UTC. Compare real instants when supplied; for
      // date-only listings the provider's requested date window is authoritative.
      const timedStart =
        start.dateTime && !start.timeTBA && !start.noSpecificTime
          ? Date.parse(start.dateTime)
          : null;
      const source = sourceFor(event.url);
      if (
        !source ||
        seen.has(event.id) ||
        start.dateTBA ||
        start.dateTBD ||
        ["cancelled", "postponed", "rescheduled"].includes(
          event.dates.status?.code || "",
        ) ||
        (timedStart !== null &&
          (timedStart < now.getTime() || timedStart > end.getTime()))
      )
        return [];
      seen.add(event.id);
      const price = event.priceRanges?.find((p) => p.max >= p.min);
      const venue = event._embedded?.venues[0];
      return [
        {
          id: event.id,
          name: event.name,
          url: event.url,
          date: start.localDate,
          time:
            start.timeTBA || start.noSpecificTime
              ? null
              : start.localTime || null,
          venue: venue?.name || "Venue to be confirmed",
          city: venue?.city?.name || "",
          source,
          price: price
            ? `${price.currency} ${price.min.toFixed(2)}–${price.max.toFixed(2)} per ticket · fees may apply`
            : null,
        },
      ];
    })
    .slice(0, 12);
  return { configured: true, events, checkedAt: now.toISOString() };
}
