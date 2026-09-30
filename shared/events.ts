import { z } from "zod";

export type SearchCenter = { latitude: number; longitude: number };
export const nearbyQuerySchema = z
  .object({
    area: z.string().trim().max(100).default(""),
    center: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
      })
      .strict()
      .optional(),
    days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
  })
  .strict()
  .refine((value) => value.center || value.area.length >= 2, {
    message: "Choose your current area or enter a town.",
  });
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;
export type NearbyEvent = {
  id: string;
  name: string;
  url: string;
  date: string;
  time: string | null;
  venue: string;
  city: string;
  source: string;
  price: string | null;
};
export type NearbyResult = {
  configured: boolean;
  events: NearbyEvent[];
  checkedAt: string | null;
};

/** Five characters gives an approximate area; exact GPS is never sent upstream. */
export function areaGeohash(center: SearchCenter): string {
  const alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
  const lat = [-90, 90];
  const lng = [-180, 180];
  let bits = 0;
  let value = 0;
  let result = "";
  for (let i = 0; i < 25; i++) {
    const range = i % 2 === 0 ? lng : lat;
    const position = i % 2 === 0 ? center.longitude : center.latitude;
    const midpoint = (range[0] + range[1]) / 2;
    const upper = position >= midpoint;
    range[upper ? 0 : 1] = midpoint;
    value = value * 2 + Number(upper);
    if (++bits === 5) {
      result += alphabet[value];
      bits = value = 0;
    }
  }
  return result;
}

export function eventbriteBrowseUrl(area: string): string {
  return `https://www.eventbrite.com/d/search/?${new URLSearchParams({
    ...(area.trim() ? { q: `events in ${area.trim().slice(0, 100)}` } : {}),
  })}`;
}
