import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext, AppEnv } from "../worker/services";
const state = vi.hoisted(() => ({
  accountType: null as string | null,
  update: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
vi.mock("../worker/services", async (load) => {
  const actual = await load<typeof import("../worker/services")>();
  return {
    ...actual,
    roles: async () => [{ role: "operator" }],
    authenticate: async (c: AppContext) => {
      c.set("actor", "11111111-1111-4111-8111-111111111111");
      c.set("serviceDb", {
        rpc: async () => ({ data: {}, error: null }),
      } as unknown as AppContext["var"]["serviceDb"]);
      c.set("userDb", {
        from: (table: string) => {
          const query = {
            select: () => query,
            update: (value: Record<string, unknown>) => {
              state.update(value);
              if ("account_type" in value)
                state.accountType = value.account_type as string | null;
              return query;
            },
            eq: (key: string, value: unknown) => {
              state.eq(table, key, value);
              return query;
            },
            in: () => query,
            then: (resolve: (value: unknown) => void) =>
              Promise.resolve({ count: 0, error: null }).then(resolve),
            single: async () => ({
              error: null,
              data:
                table === "profiles"
                  ? {
                      account_type: state.accountType,
                      display_name: "Alex",
                      preferences: {},
                    }
                  : { xp: 0, points: 0, version: 0 },
            }),
          };
          return query;
        },
      } as unknown as AppContext["var"]["userDb"]);
    },
  };
});
import worker from "../worker/index";
const actor = "11111111-1111-4111-8111-111111111111";
const call = (patch?: unknown) =>
  worker.fetch(
    new Request(
      "https://sidequest.test/api/me",
      patch === undefined
        ? {}
        : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
    ),
    { APP_ORIGIN: "https://sidequest.test" } as unknown as AppEnv,
    {} as ExecutionContext,
  );
beforeEach(() => {
  vi.clearAllMocks();
  state.accountType = null;
});

describe("private account intent transport", () => {
  it("does not infer brand intent from operator membership", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: { accountType: null },
      roles: ["operator"],
    });
  });
  it("persists only the requested account choice to the authenticated owner's row", async () => {
    const response = await call({ accountType: "brand" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: { accountType: "brand" },
    });
    expect(state.update).toHaveBeenCalledWith({ account_type: "brand" });
    expect(state.eq).toHaveBeenCalledWith("profiles", "id", actor);
    expect(await (await call()).json()).toMatchObject({
      profile: { accountType: "brand" },
    });
    await call({ summary: "Independent text edit" });
    expect(state.update).toHaveBeenLastCalledWith({
      imported_summary: "Independent text edit",
    });
    expect(state.accountType).toBe("brand");
    await call({ accountType: "personal" });
    expect(state.accountType).toBe("personal");
    await call({ accountType: null });
    expect(state.accountType).toBeNull();
  });
  it("rejects role-like values before any database update", async () => {
    expect((await call({ accountType: "operator" })).status).toBe(422);
    expect(state.update).not.toHaveBeenCalled();
  });
});
