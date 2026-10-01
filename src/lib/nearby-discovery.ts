import type { Outing } from "../../shared/domain";
import type { ApplePlace } from "./apple-maps";
import {
  loadApplePlaceService,
  type ApplePlaceService,
} from "./apple-place-service";

export type DiscoveryCenter = { latitude: number; longitude: number };

/** A mix of experiences, not one café query. Intensity changes the places we
 * explore; it never promises that a listing has bookings or is currently open. */
export function discoveryQueries(
  outing: Pick<Outing, "category" | "intensity" | "setting">,
): string[] {
  if (outing.setting === "home") return [];
  if (outing.setting === "outside")
    return outing.intensity === "full_send"
      ? [
          "outdoor adventure tours",
          "kayak jet ski rentals",
          "climbing adventure park",
          "waterfront parks",
        ]
      : [
          "waterfront parks",
          "outdoor activities",
          "public markets",
          "scenic trails",
        ];
  if (outing.intensity === "full_send")
    return [
      "go kart racing",
      "escape room",
      "indoor skydiving adventure",
      "live music venues",
    ];
  if (outing.category === "late_night" || outing.category === "demon")
    return [
      "comedy club",
      "live music venues",
      "arcade bowling",
      "restaurants",
    ];
  if (outing.category === "date_night")
    return [
      "interactive experiences",
      "comedy club",
      "cooking classes",
      "restaurants",
    ];
  return [
    "escape room",
    "arcade bowling",
    "interactive museums",
    "live music venues",
  ];
}

export async function discoverNearbyPlaces(
  outing: Pick<
    Outing,
    "category" | "intensity" | "setting" | "area" | "applePlaceId"
  >,
  center?: DiscoveryCenter,
  signal: AbortSignal = AbortSignal.timeout(16000),
  service?: ApplePlaceService | null,
): Promise<ApplePlace[]> {
  if (outing.setting === "home") return [];
  const kit = service === undefined ? await loadApplePlaceService() : service;
  if (!kit)
    throw new Error(
      "Nearby places aren’t available right now. You can still get a quest without a specific destination.",
    );
  if (outing.applePlaceId) {
    const place = await kit.lookup(outing.applePlaceId, { signal });
    if (place.id !== outing.applePlaceId)
      throw new Error(
        "That place could not be verified. Choose another place or let us choose.",
      );
    return [place];
  }
  if (!center && !outing.area.trim()) return [];
  const groups = await Promise.allSettled(
    discoveryQueries(outing).map((query) =>
      kit.search(center ? query : `${query} in ${outing.area.trim()}`, {
        signal,
        ...(center ? { coordinate: center } : {}),
      }),
    ),
  );
  signal.throwIfAborted();
  if (groups.every((group) => group.status === "rejected"))
    throw new Error(
      "Nearby places couldn’t load. Retry, or continue without a specific destination.",
    );
  // Round-robin prevents one popular category occupying the entire shortlist.
  const seen = new Set<string>();
  const places: ApplePlace[] = [];
  for (let position = 0; position < 8 && places.length < 12; position++) {
    for (const group of groups) {
      const place =
        group.status === "fulfilled" ? group.value[position] : undefined;
      if (!place?.id || !place.name || !place.coordinate || seen.has(place.id))
        continue;
      seen.add(place.id);
      places.push(place);
      if (places.length === 12) break;
    }
  }
  return places;
}
