import type { ApplePlace } from "./apple-maps";
import {
  placeContextSchema,
  type PlaceContext,
} from "../../shared/place-matching";
import { applePlaceIdSchema } from "../../shared/places";
import { loadApplePlaceService } from "./apple-place-service";

// A short-lived in-memory category cache avoids refetching a place just selected
// from Apple. No name, coordinate, category or address goes into browser storage.
const recent = new Map<
  string,
  { value: PlaceContext | null; expires: number }
>();
export function rememberApplePlaceContext(
  place: ApplePlace,
): PlaceContext | null {
  if (!applePlaceIdSchema.safeParse(place.id).success) return null;
  const parsed = placeContextSchema.safeParse({
    placeId: place.id,
    category: place.pointOfInterestCategory,
  });
  const value = parsed.success ? parsed.data : null;
  recent.delete(place.id!);
  recent.set(place.id!, { value, expires: Date.now() + 120_000 });
  if (recent.size > 32) recent.delete(recent.keys().next().value!);
  return value;
}

export async function selectedPlaceContext(
  placeId?: string | null,
): Promise<PlaceContext | null> {
  if (!applePlaceIdSchema.safeParse(placeId).success) return null;
  const cached = recent.get(placeId!);
  if (cached && cached.expires > Date.now()) return cached.value;
  try {
    const kit = await loadApplePlaceService();
    if (!kit) return null;
    const place = await kit.lookup(placeId!, {
      signal: AbortSignal.timeout(6000),
    });
    // Do not apply a stale or unrelated lookup result to the selected place.
    if (place.id !== placeId) return null;
    return rememberApplePlaceContext(place);
  } catch {
    // Matching continues honestly without a place-category claim if lookup fails.
    return null;
  }
}
