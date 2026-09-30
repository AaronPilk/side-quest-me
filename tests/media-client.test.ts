import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/auth", () => ({
  accessToken: vi.fn(async () => "session-test-token"),
}));
import { accessToken } from "../src/lib/auth";
import { fetchMediaBlob, mediaNeedsAuth } from "../src/components/PrivateMedia";

beforeEach(() => {
  vi.stubGlobal("window", {
    location: {
      href: "https://app.example.test/journal",
      origin: "https://app.example.test",
    },
  });
  vi.mocked(accessToken).mockResolvedValue("session-test-token");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("private media transport", () => {
  it("authenticates only the trusted native API while resolving relative media URLs", async () => {
    vi.stubEnv("VITE_NATIVE", "true");
    vi.stubEnv("VITE_API_ORIGIN", "https://api.sidequest.test");
    vi.stubGlobal("window", {
      location: {
        href: "capacitor://localhost/journal",
        origin: "capacitor://localhost",
      },
    });
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "video/mp4" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    await fetchMediaBlob("/api/media/one/playback");
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.sidequest.test/api/media/one/playback",
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer session-test-token",
    });
    expect(
      mediaNeedsAuth("https://api.sidequest.test.evil/api/media/one/playback"),
    ).toBe(false);
    vi.mocked(accessToken).mockClear();
    await fetchMediaBlob("https://untrusted.test/api/media/one/playback");
    expect(accessToken).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[1]?.[1]?.headers).toEqual({});
  });
  it("attaches a session only to the same-origin private media API", async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "video/mp4" },
        }),
    );
    vi.stubGlobal("fetch", request);
    const blob = await fetchMediaBlob("/api/media/asset-id");
    expect(blob.size).toBe(3);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer session-test-token" },
      credentials: "omit",
      redirect: "error",
    });
    expect(mediaNeedsAuth("https://untrusted.example/api/media/asset-id")).toBe(
      false,
    );
  });
  it("does not leak bearer tokens to public or external media", async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/jpeg" },
        }),
    );
    vi.stubGlobal("fetch", request);
    await fetchMediaBlob("https://untrusted.example/image.jpg", "image");
    expect(accessToken).not.toHaveBeenCalled();
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: {},
      credentials: "omit",
    });
  });
  it("requires a current session for private paths", async () => {
    vi.mocked(accessToken).mockResolvedValue(undefined);
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(fetchMediaBlob("/api/media/asset-id")).rejects.toThrow(
      "Sign in again",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("authenticates commercial downloads without sending tokens to public posts or another origin", async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "video/mp4" },
        }),
    );
    vi.stubGlobal("fetch", request);
    const path =
      "/api/community/offers/17e3a382-6ccd-46d4-9821-e4c8fe0746ba/media?download=1";
    expect(mediaNeedsAuth(path)).toBe(true);
    expect(mediaNeedsAuth(`/api/community/posts/public-post/media`)).toBe(
      false,
    );
    expect(mediaNeedsAuth(`https://untrusted.example${path}`)).toBe(false);
    await fetchMediaBlob(path);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer session-test-token" },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    vi.mocked(accessToken).mockResolvedValue(undefined);
    await expect(fetchMediaBlob(path)).rejects.toThrow("Sign in again");
    expect(request).toHaveBeenCalledOnce();
  });
  it("never saves a login page as an MP4", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>Sign in</html>", {
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    await expect(fetchMediaBlob("/api/media/asset-id")).rejects.toThrow(
      "could not be loaded",
    );
  });
  it("bounds the actual stream even when content-length is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
            headers: { "content-type": "image/jpeg" },
          }),
      ),
    );
    await expect(
      fetchMediaBlob("/api/media/asset-id?thumbnail", "image"),
    ).rejects.toThrow("download limit");
  });
  it("rejects empty media", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array(), {
            headers: { "content-type": "video/mp4" },
          }),
      ),
    );
    await expect(fetchMediaBlob("/api/media/asset-id")).rejects.toThrow(
      "empty",
    );
  });
});
