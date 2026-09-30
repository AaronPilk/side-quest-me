import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalog } from "../shared/catalog";
import { publishedQuests } from "../worker/catalog";

describe("published catalog pagination", () => {
  it("keeps entries beyond 1,000 eligible while applying selection filters to every page", async () => {
    const calls: { filters: Record<string, unknown>; after?: string }[] = [];
    const rows = Array.from({ length: 1103 }, (_, i) => ({
      id: String(i).padStart(5, "0"),
      content: { ...catalog[0], id: `fixture_v${i + 1}` },
    }));
    const db = {
      from: () => {
        const call: { filters: Record<string, unknown>; after?: string } = {
          filters: {},
        };
        calls.push(call);
        const query = {
          select: () => query,
          eq: (key: string, value: unknown) => {
            call.filters[key] = value;
            return query;
          },
          order: () => query,
          limit: () => query,
          gt: (_key: string, value: string) => {
            call.after = value;
            return query;
          },
          then: (resolve: (value: unknown) => void) =>
            resolve({
              data: rows
                .filter((r) => !call.after || r.id > call.after)
                .slice(0, 500),
              error: null,
            }),
        };
        return query;
      },
    } as unknown as SupabaseClient;
    const result = await publishedQuests(db, {
      category: "date_night",
      intensity: "full_send",
    });
    expect(result).toHaveLength(1103);
    expect(result.at(-1)!.id).toBe("fixture_v1103");
    expect(calls).toHaveLength(4);
    expect(
      calls.every(
        (c) =>
          c.filters.published === true &&
          c.filters.category === "date_night" &&
          c.filters.intensity === "full_send",
      ),
    ).toBe(true);
    expect(calls.map((c) => c.after)).toEqual([
      undefined,
      "00499",
      "00999",
      "01102",
    ]);
  });
});
