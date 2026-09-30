import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext, AppEnv } from "../worker/services";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  authenticate: vi.fn(),
  serviceDb: vi.fn(),
}));
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
vi.mock("../worker/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker/services")>();
  return {
    ...actual,
    serviceDb: () => {
      state.serviceDb();
      return { rpc: state.rpc };
    },
    authenticate: async (c: AppContext) => {
      state.authenticate(c.req.header("Authorization"));
      if (c.req.header("Authorization") !== "Bearer valid-session")
        throw new actual.ApiError("session_expired", "Sign in again.", 401);
      c.set("actor", "11111111-1111-4111-8111-111111111111");
      c.set("serviceDb", {
        rpc: state.rpc,
      } as unknown as AppContext["var"]["serviceDb"]);
    },
  };
});
import worker from "../worker/index";
import { hash } from "../worker/services";

const actor = "11111111-1111-4111-8111-111111111111";
const seriesId = "22222222-2222-4222-8222-222222222222";
const partId = "33333333-3333-4333-8333-333333333333";
const auth = { Authorization: "Bearer valid-session" };
const follow = { action: "follow", input: { id: seriesId, following: true } };
const save = {
  action: "save",
  input: {
    expectedVersion: 0,
    title: "A fixture story",
    premise: "One story across independently attempted parts.",
    cover: "forest",
    kind: "finite",
    state: "draft",
    parts: [
      {
        id: partId,
        title: "First part",
        templateId: "date_menu_draft_chill_v1",
        prerequisitePartId: null,
        prerequisiteReason: "",
        published: false,
      },
    ],
  },
};
function request(path: string, init: RequestInit = {}, env = {} as AppEnv) {
  return worker.fetch(
    new Request(`https://app.test${path}`, init),
    env,
    {} as ExecutionContext,
  );
}
function mutate(input: unknown, key: string | null = "series-request-key") {
  return request("/api/series/mutate", {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      ...(key === null ? {} : { "Idempotency-Key": key }),
    },
    body: JSON.stringify(input),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: { id: seriesId }, error: null });
});

describe("Series Worker public and authenticated route boundary", () => {
  it("uses only the narrow public read inputs with an anonymous actor and no-store responses", async () => {
    for (const [path, view, input] of [
      ["/api/series", "list", {}],
      [`/api/series?creatorId=${actor}`, "list", { creatorId: actor }],
      [`/api/series/${seriesId}`, "detail", { id: seriesId }],
      [`/api/series/parts/${partId}`, "part", { id: partId }],
    ] as const) {
      const response = await request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(state.rpc).toHaveBeenLastCalledWith("sq_series_read", {
        p_actor: null,
        p_view: view,
        p_input: input,
      });
    }
    expect(state.authenticate).not.toHaveBeenCalled();
  });

  it("uses verified credentials rather than a forged actor header and never falls back after rejected credentials", async () => {
    expect(
      (
        await request(`/api/series/${seriesId}`, {
          headers: { ...auth, "X-Actor-ID": partId },
        })
      ).status,
    ).toBe(200);
    expect(state.rpc).toHaveBeenLastCalledWith("sq_series_read", {
      p_actor: actor,
      p_view: "detail",
      p_input: { id: seriesId },
    });
    state.rpc.mockClear();
    state.serviceDb.mockClear();
    const denied = await request(`/api/series/parts/${partId}`, {
      headers: { Authorization: "Bearer revoked-session" },
    });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({
      error: { code: "session_expired" },
    });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.serviceDb).not.toHaveBeenCalled();
  });

  it("rejects forged viewer or private query fields and malformed public IDs before database access", async () => {
    for (const path of [
      `/api/series?actor=${actor}`,
      `/api/series?mine=true`,
      `/api/series?creatorId=not-a-uuid`,
      `/api/series/${seriesId}?includePrivate=true`,
      `/api/series/parts/${partId}?p_actor=${actor}`,
      "/api/series/not-a-uuid",
    ])
      expect((await request(path)).status).toBe(422);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("routes mine, templates and mutations through the actual root authentication middleware", async () => {
    for (const [path, init] of [
      ["/api/series/mine", {}],
      ["/api/series/templates", {}],
      ["/api/series/mutate", { method: "POST", body: JSON.stringify(follow) }],
    ] as const)
      expect((await request(path, init)).status).toBe(401);
    expect(state.authenticate).toHaveBeenCalledTimes(3);
    expect(state.rpc).not.toHaveBeenCalled();
    for (const [path, view, input] of [
      ["/api/series/mine", "list", { mine: true }],
      ["/api/series/templates", "templates", {}],
    ] as const) {
      expect((await request(path, { headers: auth })).status).toBe(200);
      expect(state.rpc).toHaveBeenLastCalledWith("sq_series_read", {
        p_actor: actor,
        p_view: view,
        p_input: input,
      });
    }
  });

  it("enforces public network limits and the root mutation origin check before RPC access", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const blocked = await request("/api/series", {}, {
      API_RATE_LIMITER: { limit },
    } as unknown as AppEnv);
    expect(blocked.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "network:local" });
    const foreign = await request("/api/series/mutate", {
      method: "POST",
      headers: { ...auth, Origin: "https://foreign.test" },
      body: JSON.stringify(follow),
    });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toMatchObject({
      error: { code: "origin_rejected" },
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("Series mutation transport and error contract", () => {
  it("dispatches a validated operation with server identity and a stable action-inclusive request hash", async () => {
    for (const operation of [save, follow]) {
      expect((await mutate(operation)).status).toBe(200);
      const first = state.rpc.mock.lastCall;
      expect((await mutate(operation)).status).toBe(200);
      expect(state.rpc.mock.lastCall).toEqual(first);
      expect(state.rpc).toHaveBeenLastCalledWith("sq_series_mutate", {
        p_actor: actor,
        p_action: operation.action,
        p_input: operation.input,
        p_key: "series-request-key",
        p_hash: await hash(operation),
      });
    }
  });

  it("rejects unknown actions, forged ownership, extra fields, and more than 40 parts", async () => {
    for (const operation of [
      { action: "complete", input: { id: seriesId } },
      { ...follow, actorId: actor },
      { ...follow, input: { ...follow.input, following: "true" } },
      { ...save, input: { ...save.input, ownerId: actor } },
      {
        ...save,
        input: {
          ...save.input,
          parts: Array.from({ length: 41 }, (_, index) => ({
            ...save.input.parts[0],
            id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
          })),
        },
      },
    ])
      expect((await mutate(operation)).status).toBe(422);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("requires a reusable bounded idempotency key", async () => {
    for (const key of [null, "short", "has whitespace", "x".repeat(101)]) {
      const result = await mutate(follow, key);
      expect(result.status).toBe(422);
      expect(await result.json()).toMatchObject({
        error: { code: "invalid_idempotency_key" },
      });
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("accepts a valid published 40-part series with long text exceeding the shared 16KB limit", async () => {
    const partIdAt = (index: number) =>
      `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`;
    const operation = {
      ...save,
      input: {
        ...save.input,
        state: "published",
        title: "Story ".repeat(16).trim(),
        premise: "A continuing shared adventure. ".repeat(25).trim(),
        parts: Array.from({ length: 40 }, (_, index) => ({
          ...save.input.parts[0],
          id: partIdAt(index),
          title: "旅".repeat(100),
          prerequisitePartId: index ? partIdAt(index - 1) : null,
          prerequisiteReason: index ? "先".repeat(300) : "",
          published: true,
        })),
      },
    };
    expect(
      new TextEncoder().encode(JSON.stringify(operation)).length,
    ).toBeGreaterThan(16_000);
    expect((await mutate(operation)).status).toBe(200);
    expect(state.rpc).toHaveBeenLastCalledWith("sq_series_mutate", {
      p_actor: actor,
      p_action: "save",
      p_input: operation.input,
      p_key: "series-request-key",
      p_hash: await hash(operation),
    });
  });

  it("enforces the 128KiB streamed Series limit without trusting Content-Length", async () => {
    for (const [size, status] of [
      [128 * 1024, 200],
      [128 * 1024 + 1, 413],
    ]) {
      state.rpc.mockClear();
      const result = await request("/api/series/mutate", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
          "Idempotency-Key": "series-size-boundary",
        },
        body: JSON.stringify(follow).padEnd(size, " "),
      });
      expect(result.status).toBe(status);
      if (status === 413) {
        expect(await result.json()).toMatchObject({
          error: { code: "too_large" },
        });
        expect(state.rpc).not.toHaveBeenCalled();
      } else expect(state.rpc).toHaveBeenCalledOnce();
    }
  });

  it("preserves availability, prerequisite, source-part, version and permission errors without leaking database detail", async () => {
    for (const [code, status] of [
      ["series_unavailable", 404],
      ["series_prerequisite", 409],
      ["series_inspiration_mismatch", 409],
      ["series_template_mismatch", 409],
      ["published_part_immutable", 409],
      ["stale_version", 409],
      ["forbidden", 403],
      ["operation_failed", 409],
    ] as const) {
      state.rpc.mockResolvedValue({
        data: null,
        error: { message: `${code}: private database diagnostic` },
      });
      const result = await mutate(follow);
      expect(result.status).toBe(status);
      const body = await result.json();
      expect(body).toMatchObject({ error: { code } });
      expect(JSON.stringify(body)).not.toContain("private database diagnostic");
    }
  });
});
