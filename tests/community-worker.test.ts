import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings, AppContext, AppEnv } from "../worker/services";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  media: vi.fn(),
  authenticate: vi.fn(),
}));
vi.mock("../worker/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker/services")>();
  return {
    ...actual,
    serviceDb: () => ({ rpc: state.rpc }),
    authenticate: async (c: AppContext) => {
      state.authenticate(c.req.header("Authorization"));
      if (c.req.header("Authorization") !== "Bearer valid-session")
        throw new actual.ApiError("session_expired", "Sign in again.", 401);
      c.set("actor", "9c931c20-1ac5-4ce0-9ee0-4d21ae2a5080");
      c.set("serviceDb", {
        rpc: state.rpc,
      } as unknown as AppContext["var"]["serviceDb"]);
    },
  };
});
vi.mock("../worker/media", () => ({ servePrivateObject: state.media }));

import { ApiError, authenticate, hash } from "../worker/services";
import {
  COMMUNITY_PRIVATE_ROUTE,
  registerCommunityPrivate,
  registerCommunityPublic,
} from "../worker/community";

const actor = "9c931c20-1ac5-4ce0-9ee0-4d21ae2a5080";
const postId = "a012d494-69d6-413c-9e7c-2101a999f454";
const offerId = "17e3a382-6ccd-46d4-9821-e4c8fe0746ba";
const env = {} as AppEnv;

function app() {
  const result = new Hono<AppBindings>();
  result.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  result.onError((error, c) =>
    c.json(
      { error: error instanceof ApiError ? error.code : "invalid_input" },
      error instanceof ApiError
        ? error.status
        : error instanceof z.ZodError
          ? 422
          : 503,
    ),
  );
  registerCommunityPublic(result);
  result.use("/api/community/*", async (c, next) => {
    if (!COMMUNITY_PRIVATE_ROUTE.test(c.req.path))
      return c.json({ error: "not_found" }, 404);
    await authenticate(c);
    await next();
  });
  registerCommunityPrivate(result);
  return result;
}

function mutate(input: unknown, key: string | null = "same-request-key") {
  return app().request(
    "/api/community/mutate",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-session",
        "Content-Type": "application/json",
        ...(key === null ? {} : { "Idempotency-Key": key }),
      },
      body: JSON.stringify(input),
    },
    env,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({
    data: { posts: [], nextCursor: null },
    error: null,
  });
  state.media.mockImplementation(
    async (_request: Request, _env: AppEnv, _key: string, mime: string) =>
      new Response("fixture-video", {
        headers: { "Content-Type": mime, "Cache-Control": "private, no-store" },
      }),
  );
});

describe("community public read boundary", () => {
  it("provides bounded public feed reads without manufacturing an authenticated actor", async () => {
    const response = await app().request(
      "/api/community/feed?templateId=date_menu_draft_chill_v1&brandOnly=true&limit=12&before=2026-09-29T12%3A00%3A00.000Z",
      {},
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.authenticate).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith("sq_community_read", {
      p_actor: null,
      p_view: "feed",
      p_input: {
        templateId: "date_menu_draft_chill_v1",
        brandOnly: true,
        limit: 12,
        before: "2026-09-29T12:00:00.000Z",
      },
    });
  });

  it("passes verified identity to public reads so database blocking rules can apply", async () => {
    const response = await app().request(
      `/api/community/posts/${postId}`,
      {
        headers: { Authorization: "Bearer valid-session" },
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("sq_community_read", {
      p_actor: actor,
      p_view: "post",
      p_input: { id: postId },
    });
  });

  it("does not turn a rejected supplied credential into anonymous access", async () => {
    const response = await app().request(
      "/api/community/feed",
      {
        headers: { Authorization: "Bearer revoked-session" },
      },
      env,
    );
    expect(response.status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([
    "limit=51",
    "limit=-1",
    "brandOnly=perhaps",
    "actor=forged",
    "templateId=x&sourceKeys=true",
  ])("rejects unsupported or unbounded public input %s", async (query) => {
    const response = await app().request(
      `/api/community/feed?${query}`,
      {},
      env,
    );
    expect(response.status).toBe(422);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("applies network limits before the public database request", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const response = await app().request(
      "/api/community/feed",
      {},
      {
        ...env,
        API_RATE_LIMITER: { limit },
      },
    );
    expect(response.status).toBe(429);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("community mutation transport", () => {
  const change = {
    action: "post_update",
    input: {
      id: postId,
      expectedVersion: 3,
      caption: "Our own version",
      brandOptIn: false,
      published: false,
    },
  };

  it("uses server identity, exact expected version, and a stable action-inclusive idempotency digest", async () => {
    state.rpc.mockResolvedValue({
      data: { id: postId, state: "unpublished" },
      error: null,
    });
    const first = await mutate(change);
    const second = await mutate(change);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(state.rpc.mock.calls[0]).toEqual(state.rpc.mock.calls[1]);
    expect(state.rpc).toHaveBeenCalledWith("sq_community_mutate", {
      p_actor: actor,
      p_action: "post_update",
      p_input: change.input,
      p_key: "same-request-key",
      p_hash: await hash(change),
    });
  });

  it("rejects forged ownership and payment fields before dispatching a mutation", async () => {
    const response = await mutate({
      ...change,
      input: { ...change.input, ownerId: actor, paid: true },
    });
    expect(response.status).toBe(422);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([null, "short", "has whitespace"])(
    "requires a reusable safe idempotency key %s",
    async (key) => {
      expect((await mutate(change, key)).status).toBe(422);
      expect(state.rpc).not.toHaveBeenCalled();
    },
  );

  it("rejects oversized request bodies before database access", async () => {
    expect(
      (
        await mutate({
          ...change,
          input: { ...change.input, caption: "x".repeat(17_000) },
        })
      ).status,
    ).toBe(413);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("does not claim accepted terms are paid or grant access when backend authorization rejects an action", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { message: "forbidden: cannot modify another user's offer" },
    });
    const response = await mutate({
      action: "offer_respond",
      input: { id: offerId, expectedVersion: 2, decision: "accept" },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(state.media).not.toHaveBeenCalled();
  });

  it("preserves stale-version conflicts and distinguishes licensing availability from rewards", async () => {
    for (const code of ["stale_version", "offer_unavailable"]) {
      state.rpc.mockResolvedValue({ data: null, error: { message: code } });
      const response = await mutate({
        action: "offer_respond",
        input: { id: offerId, expectedVersion: 2, decision: "accept" },
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: code });
    }
  });

  it("routes offer and draft details to the exact authorized read view", async () => {
    for (const [route, view] of [
      ["offers", "offer"],
      ["drafts", "draft"],
    ]) {
      const response = await app().request(
        `/api/community/${route}/${offerId}`,
        {
          headers: { Authorization: "Bearer valid-session" },
        },
        env,
      );
      expect(response.status).toBe(200);
      expect(state.rpc).toHaveBeenCalledWith("sq_community_read", {
        p_actor: actor,
        p_view: view,
        p_input: { id: offerId },
      });
    }
  });

  it("requires authentication for private state and offer details", async () => {
    expect((await app().request("/api/community/me", {}, env)).status).toBe(
      401,
    );
    expect(
      (await app().request(`/api/community/offers/${offerId}`, {}, env)).status,
    ).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("community media authorization", () => {
  const grant = {
    object_key: "private/rendered/reel.mp4",
    thumbnail_key: "private/rendered/thumbnail.jpg",
    mime: "video/mp4",
    bytes: 1200,
  };

  it("streams only an RPC-authorized public reel and never returns private storage keys", async () => {
    state.rpc.mockResolvedValue({ data: grant, error: null });
    const response = await app().request(
      `/api/community/posts/${postId}/media`,
      {},
      env,
    );
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("sq_community_media", {
      p_actor: null,
      p_post: postId,
      p_offer: null,
    });
    expect(state.media).toHaveBeenCalledWith(
      expect.any(Request),
      env,
      grant.object_key,
      "video/mp4",
    );
    expect(await response.text()).toBe("fixture-video");
  });

  it("uses the separately authorized thumbnail key and respects every media request", async () => {
    state.rpc.mockResolvedValue({ data: grant, error: null });
    const response = await app().request(
      `/api/community/posts/${postId}/media?thumbnail=1`,
      {},
      env,
    );
    expect(response.status).toBe(200);
    expect(state.media).toHaveBeenCalledWith(
      expect.any(Request),
      env,
      grant.thumbnail_key,
      "image/jpeg",
    );
  });

  it.each([
    "post_unavailable",
    "forbidden",
    "fulfillment_required",
    "usage_period_inactive",
    "offer_suspended",
    "commercial_access_unavailable",
  ])(
    "never touches media after a denied authorization: %s",
    async (message) => {
      state.rpc.mockResolvedValue({ data: null, error: { message } });
      const response = await app().request(
        `/api/community/offers/${offerId}/media?download=1`,
        {
          headers: {
            Authorization: "Bearer valid-session",
            Range: "bytes=0-99",
          },
        },
        env,
      );
      expect([403, 404]).toContain(response.status);
      expect(state.media).not.toHaveBeenCalled();
    },
  );

  it("binds commercial download to the authenticated actor and exact offer", async () => {
    state.rpc.mockResolvedValue({ data: grant, error: null });
    const response = await app().request(
      `/api/community/offers/${offerId}/media?download=1`,
      {
        headers: { Authorization: "Bearer valid-session" },
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("sq_community_media", {
      p_actor: actor,
      p_post: null,
      p_offer: offerId,
    });
  });

  it("forwards verified ownership for unpublished media without exposing it anonymously", async () => {
    state.rpc.mockImplementation(
      async (_name: string, input: { p_actor: string | null }) =>
        input.p_actor === actor
          ? { data: grant, error: null }
          : { data: null, error: { message: "not_found" } },
    );
    const path = `/api/community/posts/${postId}/media`;
    expect((await app().request(path, {}, env)).status).toBe(404);
    expect(state.media).not.toHaveBeenCalled();
    const ownerResponse = await app().request(
      path,
      {
        headers: { Authorization: "Bearer valid-session" },
      },
      env,
    );
    expect(ownerResponse.status).toBe(200);
    expect(state.rpc).toHaveBeenLastCalledWith("sq_community_media", {
      p_actor: actor,
      p_post: postId,
      p_offer: null,
    });
    expect(state.media).toHaveBeenCalledOnce();
  });

  it("rejects supplied object keys and source IDs instead of bypassing the post authorization", async () => {
    const response = await app().request(
      `/api/community/posts/${postId}/media?object_key=private%2Fsource.mp4`,
      {},
      env,
    );
    expect(response.status).toBe(422);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.media).not.toHaveBeenCalled();
  });

  it("rejects missing media grants and unexpected source-like MIME types", async () => {
    for (const data of [null, { ...grant, mime: "video/webm" }]) {
      state.rpc.mockResolvedValue({ data, error: null });
      expect(
        (await app().request(`/api/community/posts/${postId}/media`, {}, env))
          .status,
      ).toBe(404);
    }
    expect(state.media).not.toHaveBeenCalled();
  });
});
