import type { MapKit } from "@apple/mapkit-loader";
import { applePlaceIdSchema } from "../../shared/places";
import { apiUrl } from "./runtime";

declare global {
  interface Window {
    mapkit?: MapKit;
  }
}

let loading: Promise<MapKit | null> | undefined;
export async function loadAppleMaps(): Promise<MapKit | null> {
  if (loading) return loading;
  loading = (async () => {
    const response = await fetch(apiUrl("/api/maps/config"), {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error("Apple Maps couldn’t connect. Try again.");
    const config = (await response.json()) as { token?: string | null };
    if (!config.token) return null;
    const { load } = await import("@apple/mapkit-loader");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        load({
          token: config.token,
          version: "6",
          libraries: ["services", "full-map"],
          language: navigator.language,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error("Apple Maps took too long to load. Try again.")),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  })();
  try {
    const mapkit = await loading;
    if (!mapkit) loading = undefined;
    return mapkit;
  } catch {
    loading = undefined;
    // The official loader reuses its script. Remove a failed download so Retry
    // can download it again instead of waiting for an event that already fired.
    if (!window.mapkit)
      document
        .querySelector('script[data-callback="initMapKitLoaderV2"]')
        ?.remove();
    throw new Error(
      "Apple Maps couldn’t load. Try again or open Apple Maps directly.",
    );
  }
}
export type ApplePlace = {
  id: string | null;
  name: string | null;
  coordinate: { latitude: number; longitude: number } | null;
  formattedAddress: string | null;
  pointOfInterestCategory: string | null;
  alternateIds?: readonly string[] | null;
};
export function uniquePlaces<T extends ApplePlace>(places: T[]): T[] {
  const seen = new Set<string>();
  return places
    .filter((place) => {
      if (
        !applePlaceIdSchema.safeParse(place.id).success ||
        !place.coordinate ||
        !place.name
      )
        return false;
      const ids = [place.id!, ...(place.alternateIds || [])];
      const duplicate = ids.some((id) => seen.has(id));
      ids.forEach((id) => seen.add(id));
      return !duplicate;
    })
    .slice(0, 8);
}
