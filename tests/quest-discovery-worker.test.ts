import { describe, expect, it, vi } from "vitest";
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}));
import worker from "../worker/index";
import type { AppEnv } from "../worker/services";

describe("public Maps configuration and authenticated discovery boundary", () => {
  it("returns an honest unavailable configuration without requiring a database", async () => {
    const response = await worker.fetch(
      new Request("https://app.test/api/maps/config"),
      {} as AppEnv,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: null });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("exposes only the browser Maps token, never other environment credentials", async () => {
    const response = await worker.fetch(
      new Request("https://app.test/api/maps/config"),
      {
        APPLE_MAPS_TOKEN: "fixture-public-domain-token",
        SUPABASE_SECRET_KEY: "fixture-secret-not-for-browser",
        SHARE_SIGNING_KEY: "fixture-signing-private",
      } as AppEnv,
      {} as ExecutionContext,
    );
    expect(await response.json()).toEqual({
      token: "fixture-public-domain-token",
    });
  });
  it("keeps viability behind the existing configured account gate", async () => {
    const response = await worker.fetch(
      new Request("https://app.test/api/quests/viability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      {} as AppEnv,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "setup_required" },
    });
  });
  it("reports event configuration without exposing the server key", async () => {
    const response = await worker.fetch(
      new Request("https://app.test/api/events/config"),
      {
        TICKETMASTER_API_KEY: "fixture-server-secret",
      } as AppEnv,
      {} as ExecutionContext,
    );
    expect(await response.json()).toEqual({ configured: true });
  });
  it("keeps missing event inventory explicit and rejects invalid coordinates", async () => {
    for (const [body, expected] of [
      [{ area: "Seattle", days: 7 }, 200],
      [{ center: { latitude: 120, longitude: 0 } }, 422],
    ] as const) {
      const response = await worker.fetch(
        new Request("https://app.test/api/events/nearby", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        {} as AppEnv,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(expected);
      if (expected === 200)
        expect(await response.json()).toEqual({
          configured: false,
          events: [],
          checkedAt: null,
        });
    }
  });
  it("bounds public provider usage before making upstream calls", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const response = await worker.fetch(
      new Request("https://app.test/api/events/nearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "192.0.2.1",
        },
        body: JSON.stringify({ area: "Seattle" }),
      }),
      { API_RATE_LIMITER: { limit } } as unknown as AppEnv,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "events:192.0.2.1" });
  });
});
