import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import sharp from "sharp";
import { z } from "zod";
import type { AppBindings, AppContext, AppEnv } from "../worker/services";
import { PHOTO_BYTES } from "../shared/social";
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../worker/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker/services")>();
  return {
    ...actual,
    serviceDb: () => ({ rpc: state.rpc }),
    authenticate: async (c: AppContext) => {
      if (c.req.header("Authorization") !== "Bearer valid")
        throw new actual.ApiError("session_expired", "Sign in again", 401);
      c.set("actor", "11111111-1111-4111-8111-111111111111");
      c.set("serviceDb", {
        rpc: state.rpc,
      } as unknown as AppContext["var"]["serviceDb"]);
    },
  };
});
import { ApiError, authenticate } from "../worker/services";
import { registerSocialPublic, registerSocialPrivate } from "../worker/social";
const actor = "11111111-1111-4111-8111-111111111111";
const env = {
  MEDIA: { put: state.put, get: state.get, delete: state.remove },
} as unknown as AppEnv;
function app() {
  const a = new Hono<AppBindings>();
  a.onError((e, c) =>
    c.json(
      { error: e instanceof ApiError ? e.code : "invalid_input" },
      e instanceof ApiError ? e.status : e instanceof z.ZodError ? 422 : 503,
    ),
  );
  registerSocialPublic(a);
  a.use("/api/social/*", async (c, next) => {
    await authenticate(c);
    await next();
  });
  registerSocialPrivate(a);
  return a;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: { creatorId: actor }, error: null });
  state.put.mockResolvedValue({});
  state.remove.mockResolvedValue(undefined);
});
it("rejects invalid supplied public credentials rather than serving anonymous metadata", async () => {
  const result = await app().request(
    `/api/social/profile/${actor}`,
    { headers: { Authorization: "Bearer invalid" } },
    env,
  );
  expect(result.status).toBe(401);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("anonymous social metadata uses the public-safe RPC without inventing a viewer", async () => {
  const result = await app().request(`/api/social/profile/${actor}`, {}, env);
  expect(result.status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("sq_social_read", {
    p_actor: null,
    p_target: actor,
  });
});
it("uploads a bounded raster under the authenticated owner and removes uncommitted objects on DB failure", async () => {
  const png = new Uint8Array(
    await sharp({
      create: { width: 256, height: 256, channels: 3, background: "#0866e9" },
    })
      .png()
      .toBuffer(),
  );
  const upload = () =>
    app().request(
      "/api/social/photo",
      {
        method: "PUT",
        headers: { Authorization: "Bearer valid", "Content-Type": "image/png" },
        body: png,
      },
      env,
    );
  expect((await upload()).status).toBe(200);
  expect(state.put.mock.calls[0][0]).toMatch(
    new RegExp(`^avatars/${actor}/[a-f0-9-]+\\.png$`),
  );
  expect(state.rpc).toHaveBeenCalledWith("sq_social_photo", {
    p_actor: actor,
    p_key: state.put.mock.calls[0][0],
  });
  state.rpc.mockResolvedValue({
    error: { message: "creator_profile_required" },
    data: null,
  });
  expect((await upload()).status).toBe(422);
  expect(state.remove).toHaveBeenCalledWith(state.put.mock.calls[1][0]);
});
it("rejects foreign image bodies and enforces the streamed limit without Content-Length", async () => {
  for (const body of [
    new TextEncoder().encode("<svg>not an image</svg>"),
    new Uint8Array(PHOTO_BYTES + 1),
  ]) {
    const result = await app().request(
      "/api/social/photo",
      {
        method: "PUT",
        headers: { Authorization: "Bearer valid", "Content-Type": "image/png" },
        body,
      },
      env,
    );
    expect([413, 422]).toContain(result.status);
  }
  expect(state.put).not.toHaveBeenCalled();
});
it("only serves the current photo key returned by the availability RPC", async () => {
  state.rpc.mockResolvedValue({
    data: `avatars/${actor}/old.png`,
    error: null,
  });
  state.get.mockResolvedValue({ body: new Uint8Array([1, 2, 3]), size: 3 });
  const result = await app().request(
    `/api/social/photo/${actor}?v=100`,
    {},
    env,
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("Content-Type")).toBe("image/png");
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  state.rpc.mockResolvedValue({ data: null, error: null });
  expect(
    (await app().request(`/api/social/photo/${actor}`, {}, env)).status,
  ).toBe(404);
});
