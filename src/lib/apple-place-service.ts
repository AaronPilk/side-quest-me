import type { MapKit } from "@apple/mapkit-loader";
import { registerPlugin } from "@capacitor/core";
import { z } from "zod";
import { applePlaceIdSchema } from "../../shared/places";
import { loadAppleMaps, uniquePlaces, type ApplePlace } from "./apple-maps";
import { isNativeApp } from "./runtime";

type SearchOptions = {
  coordinate?: { latitude: number; longitude: number };
  signal: AbortSignal;
};
export type ApplePlaceService = {
  mapkit?: MapKit;
  search: (query: string, options: SearchOptions) => Promise<ApplePlace[]>;
  lookup: (id: string, options: { signal: AbortSignal }) => Promise<ApplePlace>;
};
interface NativePlacesPlugin {
  availability(): Promise<{ available: boolean }>;
  search(options: {
    requestId: string;
    query: string;
    latitude?: number;
    longitude?: number;
  }): Promise<{ places: unknown[] }>;
  lookup(options: {
    requestId: string;
    placeId: string;
  }): Promise<{ place: unknown }>;
  cancel(options: { requestId: string }): Promise<void>;
}
const nativePlaces = registerPlugin<NativePlacesPlugin>("SidequestPlaces");
const nativePlaceSchema = z.object({
  id: applePlaceIdSchema,
  name: z.string().trim().min(1).max(500),
  formattedAddress: z.string().max(1500),
  coordinate: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  pointOfInterestCategory: z.string().max(100).nullable(),
});

async function nativeRequest<T>(
  signal: AbortSignal,
  run: (id: string) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  // Native requests also have a deadline, including when a web view disappears.
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => {
      void nativePlaces.cancel({ requestId }).catch(() => {});
      reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([run(requestId), cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export async function loadApplePlaceService(): Promise<ApplePlaceService | null> {
  if (isNativeApp()) {
    if (!(await nativePlaces.availability()).available) return null;
    return {
      async search(query, { coordinate, signal }) {
        const result = await nativeRequest(signal, (requestId) =>
          nativePlaces.search({ requestId, query, ...coordinate }),
        );
        return uniquePlaces(
          result.places.flatMap((value) => {
            const parsed = nativePlaceSchema.safeParse(value);
            return parsed.success ? [parsed.data] : [];
          }),
        );
      },
      async lookup(placeId, { signal }) {
        applePlaceIdSchema.parse(placeId);
        const result = await nativeRequest(signal, (requestId) =>
          nativePlaces.lookup({ requestId, placeId }),
        );
        const place = nativePlaceSchema.parse(result.place);
        if (place.id !== placeId)
          throw new Error("Apple Maps returned a different place.");
        return place;
      },
    };
  }
  const kit = await loadAppleMaps();
  if (!kit) return null;
  return {
    mapkit: kit,
    async search(query, options) {
      return uniquePlaces(
        (await new kit.Search().search(query, options)).places,
      );
    },
    lookup: (id, options) => new kit.PlaceLookup().getPlace(id, options),
  };
}
