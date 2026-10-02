import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import sharp from "sharp";
import { z } from "zod";
import type { AppBindings, AppContext, AppEnv } from "../worker/services";
import { PHOTO_BYTES } from "../shared/social";
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  reviewText: vi.fn(),
  reviewImage: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../worker/content-moderation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../worker/content-moderation")>()),
  assertPublicTextAllowed: state.reviewText,
  assertPublicImageAllowed: state.reviewImage,
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
      {
        error: e instanceof ApiError ? e.code : "invalid_input",
        message: e instanceof ApiError ? e.message : "Invalid input.",
      },
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
  state.reviewText.mockResolvedValue(undefined);
  state.reviewImage.mockResolvedValue(undefined);
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
it("classifies social read failures as retryable loading failures without exposing database details", async () => {
  state.rpc.mockResolvedValue({
    data: null,
    error: {
      message:
        "cannot execute SELECT FOR SHARE in a read-only transaction PRIVATE_DATABASE_CONTEXT",
    },
  });
  for (const path of ["/api/social/me", `/api/social/profile/${actor}`]) {
    const result = await app().request(
      path,
      { headers: { Authorization: "Bearer valid" } },
      env,
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      error: "social_read_failed",
      message: "Profile details could not be loaded. Please try again.",
    });
  }
});
it("keeps save, follow and photo lookup failures distinct from profile loading", async () => {
  state.rpc.mockResolvedValue({
    data: null,
    error: { message: "database unavailable" },
  });
  const cases = [
    {
      path: "/api/social/profile",
      method: "POST",
      body: {
        username: "creator_name",
        displayName: "Creator",
        avatarKey: "coral",
        bio: "",
        openToBrands: false,
        expectedVersion: 0,
      },
      error: "social_failed",
      message: "Your profile could not be saved. Please try again.",
    },
    {
      path: "/api/social/follow",
      method: "POST",
      body: {
        targetId: "22222222-2222-4222-8222-222222222222",
        following: true,
      },
      error: "social_follow_failed",
      message: "Your follow preference could not be saved. Please try again.",
    },
    {
      path: `/api/social/photo/${actor}`,
      method: "GET",
      error: "social_photo_read_failed",
      message: "This profile photo could not be loaded. Please try again.",
    },
    {
      path: "/api/social/photo",
      method: "DELETE",
      error: "social_photo_failed",
      message: "Your profile photo could not be saved. Please try again.",
    },
  ];
  for (const { path, method, body, error, message } of cases) {
    const result = await app().request(
      path,
      {
        method,
        headers: {
          Authorization: "Bearer valid",
          "X-Content-Review-Consent": "true",
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      env,
    );
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error, message });
  }
});
it("retains known unavailable and username-conflict responses", async () => {
  state.rpc.mockResolvedValue({
    data: null,
    error: { message: "account_unavailable" },
  });
  const unavailable = await app().request(
    "/api/social/me",
    { headers: { Authorization: "Bearer valid" } },
    env,
  );
  expect(unavailable.status).toBe(404);
  expect(await unavailable.json()).toEqual({
    error: "not_found",
    message: "This creator is unavailable.",
  });
  state.rpc.mockResolvedValue({
    data: null,
    error: { message: "username_taken" },
  });
  const conflict = await app().request(
    "/api/social/profile",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer valid",
        "X-Content-Review-Consent": "true",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "creator_name",
        displayName: "Creator",
        avatarKey: "coral",
        bio: "",
        openToBrands: false,
        expectedVersion: 0,
      }),
    },
    env,
  );
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toEqual({
    error: "username_taken",
    message: "That username is already taken. Try another.",
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
        headers: {
          Authorization: "Bearer valid",
          "X-Content-Review-Consent": "true",
          "Content-Type": "image/png",
        },
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
        headers: {
          Authorization: "Bearer valid",
          "X-Content-Review-Consent": "true",
          "Content-Type": "image/png",
        },
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

it("screens only submitted public profile fields after permission and before a database write", async () => {
  const input = {
    username: "public_handle",
    displayName: "Public name",
    bio: "Public bio",
    avatarKey: "violet",
    openToBrands: false,
    expectedVersion: 2,
  };
  const save = (consent?: string) =>
    app().request(
      "/api/social/profile",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer valid",
          "Content-Type": "application/json",
          ...(consent ? { "X-Content-Review-Consent": consent } : {}),
        },
        body: JSON.stringify(input),
      },
      env,
    );
  expect((await save()).status).toBe(422);
  expect(state.reviewText).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
  expect((await save("true")).status).toBe(200);
  expect(state.reviewText).toHaveBeenCalledWith(env, [
    input.username,
    input.displayName,
    input.bio,
  ]);
  state.rpc.mockClear();
  state.reviewText.mockRejectedValue(
    new ApiError("content_not_allowed", "Edit this content.", 422),
  );
  expect((await save("true")).status).toBe(422);
  expect(state.rpc).not.toHaveBeenCalled();
});

it("does not upload profile images or change the profile when screening rejects or is unavailable", async () => {
  const png = new Uint8Array(
    await sharp({
      create: { width: 256, height: 256, channels: 4, background: "#7950E8" },
    })
      .png()
      .toBuffer(),
  );
  const upload = (consent?: string) =>
    app().request(
      "/api/social/photo",
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer valid",
          "Content-Type": "image/png",
          ...(consent ? { "X-Content-Review-Consent": consent } : {}),
        },
        body: png,
      },
      env,
    );
  expect((await upload()).status).toBe(422);
  expect(state.reviewImage).not.toHaveBeenCalled();
  for (const status of [422, 503] as const) {
    state.reviewImage.mockRejectedValue(
      new ApiError("content_review_unavailable", "Try again.", status),
    );
    expect((await upload("true")).status).toBe(status);
    expect(state.put).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  }
  state.reviewImage.mockResolvedValue(undefined);
  expect((await upload("true")).status).toBe(200);
  const normalized = state.reviewImage.mock.lastCall?.[1];
  expect(normalized).toBeInstanceOf(Uint8Array);
  expect(state.put.mock.lastCall?.[1]).toEqual(normalized);
});
