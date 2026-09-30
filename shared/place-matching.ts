import { z } from "zod";
import type { Outing, QuestVariant } from "./domain";
import { applePlaceIdSchema } from "./places";

// Editorial affinities, based on Apple's structured POI category, not guesses
// from a venue's name. This context is transient and never grants eligibility.
export const placeCategorySchema = z.enum([
  "Park",
  "Beach",
  "NationalPark",
  "Hiking",
  "Landmark",
  "NationalMonument",
  "Museum",
  "Library",
  "Cafe",
  "Restaurant",
  "Bakery",
  "FoodMarket",
]);
export const placeContextSchema = z
  .object({
    placeId: applePlaceIdSchema,
    category: placeCategorySchema,
  })
  .strict();
export type PlaceContext = z.infer<typeof placeContextSchema>;

const outdoors = [
  "date_prompt_walk",
  "date_memory_map",
  "date_photo_duet",
  "date_postcard",
  "day_color_atlas",
  "day_texture_library",
  "day_sound_map",
  "day_observation_bingo",
  "street_nature_notes",
  "street_frame_within",
  "street_color_relay",
];
const observation = [
  "date_photo_duet",
  "day_color_atlas",
  "day_texture_library",
  "day_local_alphabet",
  "day_observation_bingo",
  "street_geometry",
  "street_mini_documentary",
  "street_typography",
  "street_detail_awards",
];
const tabletop = [
  "date_photo_duet",
  "date_time_capsule",
  "day_color_atlas",
  "day_micro_comic",
  "day_paper_puzzle",
  "night_prediction_cards",
];
const affinities: Record<
  PlaceContext["category"],
  { label: string; recipes: string[] }
> = {
  Park: { label: "a park", recipes: outdoors },
  Beach: { label: "a beach", recipes: outdoors },
  NationalPark: { label: "a national park", recipes: outdoors },
  Hiking: { label: "a walking area", recipes: outdoors },
  Landmark: { label: "a landmark", recipes: observation },
  NationalMonument: { label: "a monument", recipes: observation },
  Museum: { label: "a museum", recipes: observation },
  Library: { label: "a library", recipes: tabletop },
  Cafe: { label: "a café", recipes: tabletop },
  Restaurant: { label: "a restaurant", recipes: tabletop },
  Bakery: { label: "a bakery", recipes: observation },
  FoodMarket: { label: "a food market", recipes: observation },
};

export function placeFitReason(
  quest: Pick<QuestVariant, "familyId">,
  outing: Pick<Outing, "applePlaceId" | "setting">,
  context?: PlaceContext | null,
): string | null {
  const parsed = placeContextSchema.safeParse(context);
  if (
    !parsed.success ||
    outing.setting === "home" ||
    parsed.data.placeId !== outing.applePlaceId
  )
    return null;
  const affinity = affinities[parsed.data.category];
  return affinity.recipes.some((id) => quest.familyId === `activity_${id}`)
    ? `Suggested for ${affinity.label} setting`
    : null;
}
