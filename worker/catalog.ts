import type { SupabaseClient } from "@supabase/supabase-js";
import {
  questVariantSchema,
  type Category,
  type Intensity,
  type QuestVariant,
} from "../shared/domain";
import { ApiError, dbError } from "./services";

/** Explicit pages avoid PostgREST's default 1,000-row truncation as the catalog grows. */
export async function publishedQuests(
  db: SupabaseClient,
  filters: { templateId?: string; category?: Category; intensity?: Intensity },
): Promise<QuestVariant[]> {
  const result: QuestVariant[] = [];
  let after: string | undefined;
  for (let page = 0; page < 100; page++) {
    let query = db
      .from("quest_templates")
      .select("id,content")
      .eq("published", true)
      .order("id")
      .limit(500);
    if (filters.templateId) query = query.eq("id", filters.templateId);
    if (filters.category) query = query.eq("category", filters.category);
    if (filters.intensity) query = query.eq("intensity", filters.intensity);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) dbError(error.message);
    if (!data?.length) return result;
    for (const row of data) result.push(questVariantSchema.parse(row.content));
    const next = data.at(-1)!.id as string;
    if (after && next <= after)
      throw new ApiError(
        "catalog_unavailable",
        "Quest choices couldn’t load. Please try again.",
        503,
      );
    after = next;
    if (filters.templateId) return result;
  }
  throw new ApiError(
    "catalog_too_large",
    "Quest choices couldn’t load. Please try again.",
    503,
  );
}
