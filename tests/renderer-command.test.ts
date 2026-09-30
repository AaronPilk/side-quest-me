import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const coreUrl = new URL("../renderer/core.mjs", import.meta.url).href;
type Outcome =
  { ok: true; value: string } | { ok: false; status: number; message: string };

/** Exercise the real Node process helper outside the test runner without FFmpeg. */
async function commandOutcome(
  source: string,
  timeout = 2000,
): Promise<Outcome> {
  const runner = `
    import { command } from ${JSON.stringify(coreUrl)};
    try {
      const value = await command(process.execPath, ["-e", ${JSON.stringify(source)}], ${timeout});
      process.stdout.write(JSON.stringify({ ok: true, value }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, status: error.status, message: error.message }));
    }
  `;
  const { stdout } = await execute(
    process.execPath,
    ["--input-type=module", "-e", runner],
    { timeout: 10_000, maxBuffer: 16_384 },
  );
  return JSON.parse(stdout) as Outcome;
}

describe("renderer child-process outcomes", () => {
  it("returns ordinary stdout from a successful process", async () => {
    const result = await commandOutcome(
      'process.stderr.write("diagnostic only"); process.stdout.write("decoded successfully\\n");',
    );
    expect(result).toEqual({ ok: true, value: "decoded successfully\n" });
  });

  it("classifies a time limit as retryable server capacity without exposing process details", async () => {
    const result = await commandOutcome(
      'process.stderr.write("private decoder path and details"); setInterval(() => {}, 1000);',
      150,
    );
    expect(result).toEqual({
      ok: false,
      status: 503,
      message:
        "Media processing reached the server time limit. Please try again shortly.",
    });
    expect(JSON.stringify(result)).not.toContain("private decoder");
    expect(JSON.stringify(result)).not.toContain("shorter clip");
  });

  it("keeps an excessive stdout response non-retryable rather than misclassifying it as timeout", async () => {
    const result = await commandOutcome(
      'process.stdout.write("x".repeat(1024 * 1024 + 1)); setInterval(() => {}, 1000);',
    );
    expect(result).toEqual({
      ok: false,
      status: 422,
      message: "Media processing exceeded its output limit.",
    });
  });

  it("keeps a failed decoder exit non-retryable", async () => {
    const result = await commandOutcome(
      'process.stderr.write("Invalid media fixture"); process.exitCode = 1;',
    );
    expect(result).toEqual({
      ok: false,
      status: 422,
      message: "Media processing failed: Invalid media fixture",
    });
  });
});
