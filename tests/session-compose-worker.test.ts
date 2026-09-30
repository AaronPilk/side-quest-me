import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext, AppEnv } from "../worker/services";
const state = vi.hoisted(() => ({ owned: vi.fn(), renderer: vi.fn() }));
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
vi.mock("../worker/services", async (original) => {
  const actual = await original<typeof import("../worker/services")>();
  return {
    ...actual,
    authenticate: async (c: AppContext) => {
      if (c.req.header("Authorization") !== "Bearer session")
        throw new actual.ApiError("sign_in_required", "Sign in.", 401);
      c.set("actor", "actor");
    },
    owned: (c: AppContext, table: string, id: string) =>
      state.owned(c.get("actor"), table, id),
  };
});
vi.mock("../worker/media", async (original) => ({
  ...(await original<typeof import("../worker/media")>()),
  rendererFetch: (...args: unknown[]) => state.renderer(...args),
}));
import worker from "../worker/index";
import { ApiError } from "../worker/services";
const env = {
  APP_ORIGIN: "https://sidequest.test",
  NATIVE_APP_ORIGIN: "capacitor://localhost",
} as unknown as AppEnv;
const run = "17e3a382-6ccd-46d4-9821-e4c8fe0746ba";
function call(headers: Record<string, string> = {}) {
  return worker.fetch(
    new Request(`https://sidequest.test/api/quest-runs/${run}/compose`, {
      method: "POST",
      headers: {
        Origin: "capacitor://localhost",
        Authorization: "Bearer session",
        "Content-Type": "multipart/form-data; boundary=fixture",
        ...headers,
      },
      body: "--fixture",
    }),
    env,
    {} as ExecutionContext,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.owned.mockResolvedValue({ status: "in_progress" });
  state.renderer.mockResolvedValue(
    new Response("composed bytes", {
      headers: { "Content-Type": "video/mp4" },
    }),
  );
});
describe("authenticated session composition", () => {
  it("requires a session before consulting media ownership or invoking the renderer", async () => {
    const response = await call({ Authorization: "" });
    expect(response.status).toBe(401);
    expect(state.owned).not.toHaveBeenCalled();
    expect(state.renderer).not.toHaveBeenCalled();
  });
  it("requires ownership and an editable run before accepting takes", async () => {
    state.owned.mockRejectedValue(
      new ApiError("not_found", "Unavailable", 404),
    );
    expect((await call()).status).toBe(404);
    expect(state.renderer).not.toHaveBeenCalled();
    state.owned.mockResolvedValue({ status: "finalized" });
    expect((await call()).status).toBe(409);
    expect(state.renderer).not.toHaveBeenCalled();
  });
  it("preserves binary data and native CORS without exposing internal renderer credentials", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(state.owned).toHaveBeenCalledWith("actor", "quest_runs", run);
    expect(state.renderer).toHaveBeenCalledWith(
      env,
      "/compose",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=fixture" },
      }),
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "capacitor://localhost",
    );
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(await response.text()).toBe("composed bytes");
  });
  it("rejects non-multipart input and keeps upstream errors actionable", async () => {
    expect((await call({ "Content-Type": "application/json" })).status).toBe(
      400,
    );
    expect(state.renderer).not.toHaveBeenCalled();
    state.renderer.mockResolvedValue(
      new Response("private container details", { status: 503 }),
    );
    const response = await call();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private container");
  });
});
