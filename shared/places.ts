import { z } from "zod";

// Persist the durable identifier only. Apple place names, addresses and coordinates
// are fetched for display and are never copied into the outing or a public post.
export const applePlaceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[^\s\x00-\x1f\x7f]+$/);
export function applePlaceUrl(id: string): string {
  return `https://maps.apple.com/place?${new URLSearchParams({ "place-id": applePlaceIdSchema.parse(id) })}`;
}
export function appleSearchUrl(query: string): string {
  return `https://maps.apple.com/search?${new URLSearchParams({ query: query.trim().slice(0, 250) || "parks" })}`;
}
export function appleDirectionsUrl(
  id: string,
  coordinate: { latitude: number; longitude: number },
  transport: string,
): string {
  const query = new URLSearchParams({
    destination: `${coordinate.latitude},${coordinate.longitude}`,
    "destination-place-id": applePlaceIdSchema.parse(id),
  });
  const mode = {
    car: "driving",
    walk: "walking",
    bike: "cycling",
    transit: "transit",
  }[transport];
  if (mode) query.set("mode", mode);
  return `https://maps.apple.com/directions?${query}`;
}
