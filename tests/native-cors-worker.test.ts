import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { nativeApiCors } from "../worker/native-cors";
import type { AppBindings } from "../worker/services";
import type { AppContext, AppEnv } from "../worker/services";
const state = vi.hoisted(() => ({ authenticate: vi.fn(), rpc: vi.fn() }));
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
vi.mock("../worker/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker/services")>();
  return {
    ...actual,
    authenticate: async (c: AppContext) => {
      state.authenticate(c.req.header("Authorization"));
      if (c.req.header("Authorization") !== "Bearer valid-session")
        throw new actual.ApiError("sign_in_required", "Sign in.", 401);
      c.set("actor", "11111111-1111-4111-8111-111111111111");
      c.set("serviceDb", {
        rpc: state.rpc,
      } as unknown as AppContext["var"]["serviceDb"]);
    },
  };
});
import worker from "../worker/index";
const origin = "capacitor://localhost";
const link = "/api/share-links/77777777-7777-4777-8777-777777777777";
const env = {
  NATIVE_APP_ORIGIN: origin,
  APP_ORIGIN: "http://localhost:5173",
} as AppEnv;
function call(path: string, init: RequestInit, bindings = env) {
  return worker.fetch(
    new Request(`https://api.sidequest.test${path}`, init),
    bindings,
    {} as ExecutionContext,
  );
}
function preflight(headers: Record<string, string> = {}, bindings = env) {
  return call(
    link,
    {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers":
          "Authorization, Content-Type, Idempotency-Key",
        ...headers,
      },
    },
    bindings,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: { revoked: true }, error: null });
});

describe("bundled iOS CORS with unchanged authentication", () => {
  it("allows a configured native preflight before auth without enabling cookie credentials", async () => {
    const response = await preflight();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "authorization",
    );
    expect(response.headers.get("Vary")).toContain("Origin");
    expect(state.authenticate).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([
    "https://attacker.test",
    "capacitor://evil",
    "capacitor://localhost.evil",
    "null",
  ])("does not reflect an untrusted origin: %s", async (value) => {
    const response = await preflight({ Origin: value });
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("requires explicit configuration and refuses unsafe methods/headers", async () => {
    for (const response of [
      await preflight({}, {} as AppEnv),
      await preflight({}, { ...env, NATIVE_APP_ORIGIN: "*" }),
      await preflight({ "Access-Control-Request-Method": "CONNECT" }),
      await preflight({
        "Access-Control-Request-Headers": "X-Operator-Override",
      }),
    ]) {
      expect(response.status).toBe(403);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("keeps native private mutations behind the existing bearer-session check", async () => {
    let response = await call(link, {
      method: "DELETE",
      headers: { Origin: origin },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(state.rpc).not.toHaveBeenCalled();
    response = await call(link, {
      method: "DELETE",
      headers: { Origin: origin, Authorization: "Bearer valid-session" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(state.authenticate).toHaveBeenCalledTimes(2);
    expect(state.rpc).toHaveBeenCalledWith(
      "sq_revoke_share",
      expect.objectContaining({
        p_actor: "11111111-1111-4111-8111-111111111111",
        p_input: { share_id: link.split("/").pop() },
      }),
    );
  });

  it("still rejects cross-origin web mutations and preserves same-origin requests", async () => {
    let response = await call(link, {
      method: "DELETE",
      headers: {
        Origin: "https://attacker.test",
        Authorization: "Bearer valid-session",
      },
    });
    expect(response.status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
    response = await call(link, {
      method: "DELETE",
      headers: {
        Origin: "https://api.sidequest.test",
        Authorization: "Bearer valid-session",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("permits native public config reads without changing their authentication contract", async () => {
    const response = await call("/api/maps/config", {
      headers: { Origin: origin },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(await response.json()).toEqual({ token: null });
    expect(state.authenticate).not.toHaveBeenCalled();
  });

  it("preserves streamed media/range headers and exposes them to the native origin", async () => {
    const app = new Hono<AppBindings>();
    app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-origin" }));
    app.use("/api/*", nativeApiCors);
    app.get(
      "/api/public-fixture",
      () =>
        new Response(new Uint8Array([2, 3]), {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": "2",
            "Content-Range": "bytes 1-2/4",
            "Accept-Ranges": "bytes",
          },
        }),
    );
    const response = await app.request(
      "https://api.sidequest.test/api/public-fixture",
      { headers: { Origin: origin, Range: "bytes=1-2" } },
      env,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
      "Content-Range",
    );
    expect(response.headers.get("Content-Range")).toBe("bytes 1-2/4");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "same-origin",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([2, 3]),
    );
  });
});
