import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiUrl,
  isTrustedApiUrl,
  mediaCrossOrigin,
  mediaUrl,
  publicUrl,
} from "../src/lib/runtime";

beforeEach(() => {
  vi.stubEnv("VITE_NATIVE", "false");
  vi.stubEnv("VITE_API_ORIGIN", "https://api.sidequest.test");
  vi.stubEnv("VITE_PUBLIC_ORIGIN", "https://sidequest.test");
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.stubEnv("VITE_NATIVE_DEMO_API_ORIGIN", "");
  vi.stubGlobal("window", {
    location: {
      origin: "https://web.sidequest.test",
      href: "https://web.sidequest.test/create",
    },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("native and web URL boundaries", () => {
  it("keeps browser API and media same-origin regardless of native build settings", () => {
    expect(apiUrl("/api/me")).toBe("/api/me");
    expect(apiUrl("https://web.sidequest.test/api/me")).toBe("/api/me");
    expect(mediaUrl("/api/media/one/playback")).toBe("/api/media/one/playback");
    expect(publicUrl("/posts/one")).toBe(
      "https://web.sidequest.test/posts/one",
    );
    expect(mediaCrossOrigin("/api/community/posts/one/media")).toBeUndefined();
  });

  it("resolves native API/media URLs and shares against their separate origins", () => {
    vi.stubEnv("VITE_NATIVE", "true");
    vi.stubGlobal("window", {
      location: {
        origin: "capacitor://localhost",
        href: "capacitor://localhost/create",
      },
    });
    expect(apiUrl("/api/quests?limit=3")).toBe(
      "https://api.sidequest.test/api/quests?limit=3",
    );
    expect(mediaUrl("/api/media/one/playback")).toBe(
      "https://api.sidequest.test/api/media/one/playback",
    );
    expect(publicUrl("/posts/one")).toBe("https://sidequest.test/posts/one");
    expect(mediaUrl("blob:local-preview")).toBe("blob:local-preview");
    expect(mediaUrl("/brand/sidequest-mark.svg")).toBe(
      "/brand/sidequest-mark.svg",
    );
    expect(mediaCrossOrigin("/api/social/profile/one/photo")).toBe("anonymous");
    expect(isTrustedApiUrl("https://api.sidequest.test/api/media/one")).toBe(
      true,
    );
    expect(
      isTrustedApiUrl("https://api.sidequest.test.attacker.test/api/media/one"),
    ).toBe(false);
    expect(isTrustedApiUrl("https://sidequest.test/api/media/one")).toBe(false);
  });

  it.each([
    "https://attacker.test/api/me",
    "//attacker.test/api/me",
    "/\\attacker.test/api/me",
    "https://user:password@web.sidequest.test/api/me",
    "/api/../account",
    "javascript:alert(1)",
  ])(
    "rejects credential-bearing API requests outside the API boundary: %s",
    (value) => {
      expect(() => apiUrl(value)).toThrow("not trusted");
    },
  );

  it.each([
    "",
    "http://api.sidequest.test",
    "https://api.sidequest.test/path",
    "https://user:secret@api.sidequest.test",
    "https://api.sidequest.test?query=1",
    "https://api.sidequest.test#hash",
  ])("rejects malformed/release-insecure native origins: %s", (value) => {
    vi.stubEnv("VITE_NATIVE", "true");
    vi.stubEnv("VITE_API_ORIGIN", value);
    expect(() => apiUrl("/api/me")).toThrow("valid API origin");
  });

  it("allows loopback HTTP only through the explicit simulator demo setting", () => {
    vi.stubEnv("VITE_NATIVE", "true");
    vi.stubEnv("VITE_DEMO_MODE", "true");
    vi.stubEnv("VITE_NATIVE_DEMO_API_ORIGIN", "http://127.0.0.1:5173");
    expect(apiUrl("/api/local-media/demo-reel")).toBe(
      "http://127.0.0.1:5173/api/local-media/demo-reel",
    );
    vi.stubEnv("VITE_NATIVE_DEMO_API_ORIGIN", "http://192.168.1.2:5173");
    expect(() => apiUrl("/api/me")).toThrow("native demo API");
    vi.stubEnv("VITE_DEMO_MODE", "false");
    expect(apiUrl("/api/me")).toBe("https://api.sidequest.test/api/me");
  });

  it("never shares a native/internal origin or an external path supplied as a public route", () => {
    vi.stubEnv("VITE_NATIVE", "true");
    vi.stubEnv("VITE_PUBLIC_ORIGIN", "capacitor://localhost");
    expect(() => publicUrl("/posts/one")).toThrow("public website");
    vi.stubEnv("VITE_PUBLIC_ORIGIN", "https://sidequest.test");
    expect(() => publicUrl("//attacker.test/post")).toThrow("not valid");
  });
});
