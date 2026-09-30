import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeReturnTo,
  readReturnTo,
  rememberReturnTo,
  validateReturnTo,
} from "../src/lib/internal-return";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("internal onboarding and sign-in returns", () => {
  it("retains the selected template, inspiration and fragment until consumed", () => {
    const route = "/create?template=day_scene_bold_v1&from=post-123#plans";
    expect(validateReturnTo(route)).toBe(route);
    rememberReturnTo(route);
    expect(readReturnTo()).toBe(route);
    expect(consumeReturnTo()).toBe(route);
    expect(readReturnTo()).toBe("/create");
  });

  it.each([
    "/series/new",
    "/series/abc-123",
    "/series/abc-123/edit",
    "/settings/demo-tools",
    "/business",
    "/admin",
    "/rewards?tab=earnings",
    "/create?template=day_tiny_discovery_chill_v1&seriesPart=part-123&from=post-123",
  ])("preserves a supported creator journey: %s", (route) => {
    rememberReturnTo(route);
    expect(consumeReturnTo()).toBe(route);
  });

  it.each([
    "https://evil.test/create",
    "//evil.test/create",
    "/\\evil.test/create",
    "javascript:alert(1)",
    "/%2f%2fevil.test",
    "/%252f%252fevil.test",
    "/discover/../create",
    "/%2e%2e/create",
    "/create\n",
    "/create\u0000",
    "/auth/callback",
    "/onboarding",
    "/unknown-page",
  ])("rejects unsafe or looping stored destinations: %s", (route) => {
    expect(validateReturnTo(route)).toBeNull();
    sessionStorage.setItem("sq-return-to", route);
    expect(consumeReturnTo("/account")).toBe("/account");
    expect(sessionStorage.getItem("sq-return-to")).toBeNull();
    rememberReturnTo(route);
    expect(readReturnTo()).toBe("/create");
  });
});

describe("root path canonicalization", () => {
  it("returns to /create when the remembered route was the root, keeping its query", () => {
    expect(validateReturnTo("/")).toBe("/create");
    expect(validateReturnTo("/?template=day_scene_bold_v1")).toBe(
      "/create?template=day_scene_bold_v1",
    );
    rememberReturnTo("/");
    expect(consumeReturnTo()).toBe("/create");
  });
});
