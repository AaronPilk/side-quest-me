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
});
