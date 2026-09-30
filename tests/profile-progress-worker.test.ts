import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext, AppEnv } from "../worker/services";
const state = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  count: 57,
  questId: "",
  published: false,
}));
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
vi.mock("../worker/services", async (load) => {
  const actual = await load<typeof import("../worker/services")>();
  return {
    ...actual,
    serviceDb: () => ({ from: state.from }),
    roles: async () => [],
    authenticate: async (c: AppContext) => {
      c.set("actor", "11111111-1111-4111-8111-111111111111");
      c.set("serviceDb", {
        rpc: async () => ({ data: {}, error: null }),
      } as unknown as AppContext["var"]["serviceDb"]);
      c.set("userDb", {
        from: state.from,
      } as unknown as AppContext["var"]["userDb"]);
    },
  };
});
import worker from "../worker/index";
beforeEach(() => {
  vi.clearAllMocks();
  state.published = false;
  state.questId = "";
  state.from.mockImplementation((table: string) => {
    const result =
      table === "quest_runs"
        ? { count: state.count, error: null }
        : { data: null, error: null };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        state.eq(table, key, value);
        if (table === "quest_templates" && key === "published")
          state.published = true;
        if (table === "quest_templates" && key === "id")
          state.questId = String(value);
        return query;
      },
      in: (key: string, value: unknown) => {
        state.in(table, key, value);
        return query;
      },
      single: async () =>
        table === "profiles"
          ? {
              data: {
                display_name: "Alex",
                timezone: "UTC",
                locale: "en",
                preferences: {},
                imported_summary: "",
                onboarding_complete: false,
              },
              error: null,
            }
          : table === "wallets"
            ? { data: { xp: 500, points: 50, version: 1 }, error: null }
            : {
                data: state.published
                  ? null
                  : {
                      content: {
                        id: state.questId,
                        title: "Frozen historical title",
                        version: 1,
                      },
                    },
                error: null,
              },
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
});
const call = (path: string) =>
  worker.fetch(
    new Request(`https://sidequest.test${path}`),
    { APP_ORIGIN: "https://sidequest.test" } as unknown as AppEnv,
    {} as ExecutionContext,
  );

describe("private progress and public template history", () => {
  it("counts all accepted completions for the authenticated owner, beyond the journal page", async () => {
    const response = await call("/api/me");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      completedQuestCount: 57,
      wallet: { xp: 500 },
    });
    expect(state.eq).toHaveBeenCalledWith(
      "quest_runs",
      "owner_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(state.eq).toHaveBeenCalledWith("quest_runs", "status", "finalized");
    expect(state.in).toHaveBeenCalledWith(
      "quest_runs",
      "reward_decision->>reason",
      ["eligible", "family_cooldown", "daily_cap"],
    );
  });
  it("returns the exact archived template without exposing arbitrary unpublished drafts", async () => {
    const historical = await call(
      "/api/quests/activity_date_memory_map_alpha_full_send_v1",
    );
    expect(historical.status).toBe(200);
    expect(await historical.json()).toMatchObject({
      id: "activity_date_memory_map_alpha_full_send_v1",
      title: "Frozen historical title",
      version: 1,
    });
    const privateDraft = await call("/api/quests/unpublished_creator_draft_v1");
    expect(privateDraft.status).toBe(404);
    expect(state.eq).toHaveBeenCalledWith("quest_templates", "published", true);
  });
});
