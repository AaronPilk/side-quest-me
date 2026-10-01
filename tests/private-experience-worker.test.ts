import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type QuestVariant,
} from "../shared/domain";
import type { AppContext, AppEnv } from "../worker/services";
const state = vi.hoisted(() => ({
  quest: null as QuestVariant | null,
  owner: "11111111-1111-4111-8111-111111111111",
  outing: {} as object,
}));
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
vi.mock("../worker/services", async (load) => {
  const actual = await load<typeof import("../worker/services")>();
  return {
    ...actual,
    authenticate: async (c: AppContext) => {
      if (!c.req.header("Authorization"))
        throw new actual.ApiError("sign_in_required", "Sign in", 401);
      const actor = c.req.header("X-Fixture-Actor") || state.owner;
      c.set("actor", actor);
      const db = {
        from: (table: string) => {
          let requestedOwner: string | undefined;
          const query = {
            select: () => query,
            eq: (column: string, value: string) => {
              if (column === "owner_id") requestedOwner = value;
              return query;
            },
            single: async () => ({
              data:
                table === "profiles"
                  ? { preferences: DEFAULT_PREFERENCES }
                  : table === "wallets"
                    ? { xp: 0, points: 0, version: 1 }
                    : { content: state.quest },
              error: null,
            }),
            maybeSingle: async () => ({
              data:
                requestedOwner === state.owner
                  ? {
                      id: "fixture",
                      owner_id: state.owner,
                      template_id: state.quest!.id,
                      outing: state.outing,
                      location: null,
                      expires_at: "2030-01-01T00:00:00Z",
                    }
                  : null,
              error: null,
            }),
          };
          return query;
        },
        rpc: async () => ({ data: [], error: null }),
      };
      c.set("userDb", db as unknown as AppContext["var"]["userDb"]);
      c.set("serviceDb", db as unknown as AppContext["var"]["serviceDb"]);
    },
  };
});
import worker from "../worker/index";
import { curatedDiscoveryFallback } from "../worker/experience-discovery";
const outing = {
  ...DEFAULT_OUTING,
  category: "demon" as const,
  intensity: "full_send" as const,
  group: "friends" as const,
  participants: 5,
  setting: "venue" as const,
  budgetMinor: 30000,
  durationMinutes: null,
};
const request = (
  path: string,
  body?: object,
  actor?: string,
  signedIn = true,
) =>
  worker.fetch(
    new Request(`https://app.test/api/quests/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(signedIn ? { Authorization: "Bearer fixture" } : {}),
        ...(actor ? { "X-Fixture-Actor": actor } : {}),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    { APP_ORIGIN: "https://app.test" } as unknown as AppEnv,
    {} as ExecutionContext,
  );
beforeEach(() => {
  state.quest = curatedDiscoveryFallback(DEFAULT_PREFERENCES, {
    outing,
    provider: "openai",
    consent: true,
    nearbyPlaces: [],
  })!.quest;
  state.outing = outing;
});
describe("owned generated quest reload and later episode discovery", () => {
  it("reloads the stored private plan only for its owner", async () => {
    const result = await request(state.quest!.id);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      id: state.quest!.id,
      privateGenerated: true,
      privatePlan: outing,
      privateLocation: null,
    });
    expect(
      (
        await request(
          state.quest!.id,
          undefined,
          "22222222-2222-4222-8222-222222222222",
        )
      ).status,
    ).toBe(404);
    expect(
      (await request(state.quest!.id, undefined, undefined, false)).status,
    ).toBe(401);
  });
  it("runs canonical viability and recommendation against an owner-mapped unpublished template", async () => {
    const confirmedOuting = {
      ...outing,
      arrangementConfirmed: true,
      confirmedVenueCostMinor: 15000,
    };
    const result = await request("recommend", {
      outing: confirmedOuting,
      templateId: state.quest!.id,
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject([
      {
        id: state.quest!.id,
        rewardEligibility: { eligible: false, reason: "private_generated" },
        award: { xp: 0, points: 0 },
      },
    ]);
    const viability = await request("viability", {
      outing: confirmedOuting,
      templateId: state.quest!.id,
      confirmed: Object.keys(confirmedOuting),
    });
    expect(await viability.json()).toMatchObject({ viableCount: 1 });
    expect(
      (
        await request(
          "recommend",
          { outing: confirmedOuting, templateId: state.quest!.id },
          "22222222-2222-4222-8222-222222222222",
        )
      ).status,
    ).toBe(404);
  });
});
