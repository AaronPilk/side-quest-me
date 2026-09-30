import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext, AppEnv } from "../worker/services";

/** Records every filter the Worker applies so ownership and privacy scoping
 * are asserted from the actual query, not inferred from a happy response. */
type Call = [string, ...unknown[]];
const state = vi.hoisted(() => ({
  authenticate: vi.fn(),
  tables: {} as Record<
    string,
    { result: { data: unknown; error: unknown }; calls: Call[] }
  >,
}));
function table(name: string, result: { data: unknown; error: unknown }) {
  state.tables[name] = { result, calls: [] };
}
function builder(name: string) {
  const entry = state.tables[name];
  if (!entry) throw new Error(`Unexpected table ${name}`);
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject?: unknown) =>
      Promise.resolve(entry.result).then(resolve, reject as undefined),
  };
  for (const method of ["select", "eq", "is", "gt", "order", "limit", "single"])
    chain[method] = (...args: unknown[]) => {
      entry.calls.push([method, ...args]);
      return chain;
    };
  return chain;
}
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
vi.mock("../worker/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker/services")>();
  return {
    ...actual,
    serviceDb: () => ({ rpc: vi.fn() }),
    authenticate: async (c: AppContext) => {
      state.authenticate(c.req.header("Authorization"));
      const token = c.req.header("Authorization");
      if (token !== "Bearer valid-session")
        throw new actual.ApiError("sign_in_required", "Sign in.", 401);
      c.set("actor", owner);
      c.set("userDb", {
        from: builder,
      } as unknown as AppContext["var"]["userDb"]);
    },
  };
});
import worker from "../worker/index";

const owner = "11111111-1111-4111-8111-111111111111";
const runId = "77777777-7777-4777-8777-777777777777";
const auth = { Authorization: "Bearer valid-session" };
function get(path: string, headers: Record<string, string> = {}) {
  return worker.fetch(
    new Request(`https://app.test${path}`, { headers }),
    {} as AppEnv,
    {} as ExecutionContext,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.tables = {};
});

describe("owner-only share link listing", () => {
  it("denies anonymous callers before touching the database", async () => {
    const response = await get(`/api/quest-runs/${runId}/share-links`);
    expect(response.status).toBe(401);
    expect(state.authenticate).toHaveBeenCalledTimes(1);
    expect(state.tables.share_links).toBeUndefined();
  });

  it("returns not found for a run the actor does not own and never lists links", async () => {
    table("quest_runs", { data: null, error: { message: "0 rows" } });
    table("share_links", { data: [], error: null });
    const response = await get(`/api/quest-runs/${runId}/share-links`, auth);
    expect(response.status).toBe(404);
    expect(state.tables.quest_runs.calls).toEqual(
      expect.arrayContaining([
        ["eq", "id", runId],
        ["eq", "owner_id", owner],
      ]),
    );
    expect(state.tables.share_links.calls).toEqual([]);
  });

  it("rejects a malformed run id without a lookup", async () => {
    const response = await get("/api/quest-runs/not-a-uuid/share-links", auth);
    expect(response.status).toBe(404);
    expect(state.tables.quest_runs).toBeUndefined();
  });

  it("lists only active, unexpired links for the owner and strips every secret column", async () => {
    table("quest_runs", { data: { id: runId, owner_id: owner }, error: null });
    table("share_links", {
      data: [
        {
          id: "link-newer",
          caption: "Group chat",
          created_at: "2026-09-29T10:00:00.000Z",
          expires_at: "2026-10-29T10:00:00.000Z",
          // A misbehaving select must still never reach the browser.
          token_hash: "deadbeef",
          object_key: "private/reel.mp4",
          owner_id: owner,
        },
      ],
      error: null,
    });
    const response = await get(`/api/quest-runs/${runId}/share-links`, auth);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "link-newer",
        caption: "Group chat",
        createdAt: "2026-09-29T10:00:00.000Z",
        expiresAt: "2026-10-29T10:00:00.000Z",
      },
    ]);
    const calls = state.tables.share_links.calls;
    expect(calls[0]).toEqual(["select", "id,caption,created_at,expires_at"]);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", "run_id", runId],
        ["eq", "owner_id", owner],
        ["is", "revoked_at", null],
        ["order", "created_at", { ascending: false }],
      ]),
    );
    const expiry = calls.find((call) => call[0] === "gt");
    expect(expiry?.[1]).toBe("expires_at");
    expect(typeof expiry?.[2]).toBe("string");
    expect(response.headers.get("cache-control") ?? "").not.toContain("public");
  });

  it("surfaces a database failure as an error instead of an empty list", async () => {
    table("quest_runs", { data: { id: runId, owner_id: owner }, error: null });
    table("share_links", { data: null, error: { message: "timeout" } });
    const response = await get(`/api/quest-runs/${runId}/share-links`, auth);
    // Existing dbError convention: unknown database failures are reported as
    // an operation_failed error, never as a silently empty list.
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "operation_failed" },
    });
  });
});
