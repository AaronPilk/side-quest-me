import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/auth", () => ({
  DEMO: false,
  supabase: null,
  accessToken: vi.fn(async () => "native-session-token"),
}));
import { request } from "../src/lib/api";
import { accessToken } from "../src/lib/auth";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_NATIVE", "true");
  vi.stubEnv("VITE_API_ORIGIN", "https://api.sidequest.test");
  vi.stubGlobal("window", {
    location: {
      href: "capacitor://localhost/create",
      origin: "capacitor://localhost",
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("native API request transport", () => {
  it("keeps native bearer/JSON/idempotency headers while preventing redirects and cookies", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ saved: true }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await request("/api/quest-runs", {
        method: "POST",
        body: JSON.stringify({ templateId: "fixture" }),
        headers: { "Idempotency-Key": "same-logical-request" },
      }),
    ).toEqual({ saved: true });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.sidequest.test/api/quest-runs",
      expect.objectContaining({
        credentials: "omit",
        redirect: "error",
        method: "POST",
        headers: {
          Authorization: "Bearer native-session-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "same-logical-request",
        },
      }),
    );
  });

  it("rejects an external address before reading the session or sending credentials", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(request("https://attacker.test/api/me")).rejects.toThrow(
      "not trusted",
    );
    expect(accessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves the authenticated upload body/content-type instead of serializing video", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ duration_ms: 9000 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" });
    await request("/api/media/one/upload", {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": "video/mp4" },
    });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(blob);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer native-session-token",
      "Content-Type": "video/mp4",
    });
  });
});
