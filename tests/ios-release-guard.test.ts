import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { assertProductionOrigin } from "../scripts/ios-release-config.mjs";

vi.mock("vite", () => ({
  defineConfig: (config: unknown) => config,
  loadEnv: () => ({}),
}));
vi.mock("@vitejs/plugin-react", () => ({ default: () => [] }));
import iosConfig from "../vite.ios.config";

const production = {
  platform: "ios",
  environment: "production",
  apiOrigin: "https://sidequest-api.example",
  publicOrigin: "https://sidequest.example",
  builtAt: "2026-09-30T12:34:56.789Z",
};
let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "sidequest release guard "));
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

function runGuards(record: unknown, pass: boolean) {
  writeFileSync(join(directory, "native-build.json"), JSON.stringify(record));
  const commands: Array<[string, string[]]> = [
    [process.execPath, [resolve("scripts/verify-ios-release.mjs"), directory]],
  ];
  if (process.platform === "darwin")
    commands.push([
      "/bin/sh",
      [resolve("scripts/verify-ios-release.sh"), directory],
    ]);
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (pass) expect(result.status, result.stderr).toBe(0);
    else
      expect(result.status, `${command} accepted invalid metadata`).not.toBe(0);
    expect(result.stderr).not.toContain("do-not-log-this-password");
  }
}

describe("iOS release guard entry points", () => {
  it.each([
    production,
    {
      ...production,
      apiOrigin: "https://sidequest-api.example/",
      publicOrigin: "https://localhost.example.com",
    },
    {
      ...production,
      apiOrigin: "https://8.8.8.8:8443",
      publicOrigin: "https://[2001:4860:4860::8888]",
    },
  ])(
    "accepts a production manifest with exact public service origins %#",
    (record) => {
      runGuards(record, true);
    },
  );

  it.each([
    null,
    [],
    { ...production, environment: "demo" },
    { ...production, environment: "staging" },
    { ...production, platform: "web" },
    { ...production, builtAt: undefined },
    { ...production, builtAt: "2026-02-30T12:34:56.789Z" },
    { ...production, builtAt: 123 },
    { ...production, apiOrigin: undefined },
    { ...production, publicOrigin: null },
  ])("rejects incomplete or nonproduction metadata %#", (record) => {
    runGuards(record, false);
  });

  it.each([
    "http://sidequest.example",
    "capacitor://localhost",
    "https://user:do-not-log-this-password@sidequest.example",
    "https://sidequest.example/path",
    "https://sidequest.example/../",
    "https://sidequest.example?query=1",
    "https://sidequest.example?",
    "https://sidequest.example#fragment",
    "https://sidequest.example#",
    " https://sidequest.example",
    "https://sidequest.example\n",
    "https://localhost",
    "https://localhost.",
    "https://app.localhost",
    "https://127.0.0.1",
    "https://127.255.255.254:8443",
    "https://127.1",
    "https://2130706433",
    "https://0x7f000001",
    "https://0.0.0.0",
    "https://[::1]",
    "https://[0:0:0:0:0:0:0:1]",
    "https://[::]",
    "https://[::ffff:7f00:1]",
    "https://[::ffff:0:0]",
    "https://[bad-ipv6]",
    "https://sidequest.example:99999",
  ])("rejects unsafe or non-origin API configuration: %s", (apiOrigin) => {
    runGuards({ ...production, apiOrigin }, false);
  });

  it("applies the same origin boundary to public links", () => {
    runGuards({ ...production, publicOrigin: "https://127.0.0.1" }, false);
    runGuards(
      { ...production, publicOrigin: "https://sidequest.example/posts" },
      false,
    );
  });

  it("fails closed for missing and malformed metadata without touching app assets", () => {
    for (const content of [
      undefined,
      "not JSON",
      '{"apiOrigin":"https://user:do-not-log-this-password@example.com"',
    ]) {
      rmSync(join(directory, "native-build.json"), { force: true });
      if (content) writeFileSync(join(directory, "native-build.json"), content);
      const js = spawnSync(
        process.execPath,
        [resolve("scripts/verify-ios-release.mjs"), directory],
        { encoding: "utf8" },
      );
      expect(js.status).not.toBe(0);
      expect(js.stderr).not.toContain("do-not-log-this-password");
      if (process.platform === "darwin") {
        const shell = spawnSync(
          "/bin/sh",
          [resolve("scripts/verify-ios-release.sh"), directory],
          { encoding: "utf8" },
        );
        expect(shell.status).not.toBe(0);
        expect(shell.stderr).toMatch(/Missing|invalid/);
        expect(shell.stderr).not.toContain("do-not-log-this-password");
      }
    }
  });
});

describe("iOS configuration rejects bad production services before bundling", () => {
  function config(mode = "ios") {
    if (typeof iosConfig !== "function")
      throw new Error("Expected an iOS config factory");
    return iosConfig({ command: "build", mode });
  }
  function environment() {
    vi.stubEnv("VITE_API_ORIGIN", production.apiOrigin);
    vi.stubEnv("VITE_PUBLIC_ORIGIN", production.publicOrigin);
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture_only");
  }
  it("normalizes only an optional root slash and accepts the configured production build", () => {
    expect(assertProductionOrigin("https://sidequest.example/")).toBe(
      "https://sidequest.example",
    );
    environment();
    expect(() => config()).not.toThrow();
  });
  it.each(["VITE_API_ORIGIN", "VITE_PUBLIC_ORIGIN", "VITE_SUPABASE_URL"])(
    "blocks a loopback %s before a release bundle exists",
    (key) => {
      environment();
      vi.stubEnv(key, "https://127.0.0.1");
      expect(() => config()).toThrow(
        `${key} must be an exact public HTTPS origin`,
      );
    },
  );
  it("keeps the explicitly separate simulator demo configuration available", () => {
    environment();
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1");
    vi.stubEnv("VITE_PUBLIC_ORIGIN", "http://localhost");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    expect(() => config("ios-demo")).not.toThrow();
  });
});
