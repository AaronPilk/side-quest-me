import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

// Explicit local-only fixtures. This script does not call a provider or create resources.
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "sidequest-config-test-"));
try {
  await copyFile(
    path.join(root, "wrangler.jsonc"),
    path.join(directory, "wrangler.jsonc"),
  );
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts/configure-environment.mjs")],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        SIDEQUEST_ENV: "staging",
        CLOUDFLARE_ACCOUNT_ID: "0".repeat(32),
        SIDEQUEST_WORKER: "sidequest-config-fixture",
        SIDEQUEST_BUCKET: "sidequest-config-fixture-media",
        SIDEQUEST_QUEUE: "sidequest-config-fixture-renders",
        SIDEQUEST_ORIGIN: "https://sidequest-config-fixture.invalid",
        SIDEQUEST_AREA: "CONFIGURATION TEST ONLY",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(
    await readFile(path.join(directory, ".local/wrangler.target.json"), "utf8"),
  );
  assert.equal(config.vars.APP_ENV, "staging");
  assert.equal(config.main, "../worker/index.ts");
  assert.equal(config.containers[0].image_build_context, "..");
  assert.equal(
    config.queues.consumers[0].queue,
    config.queues.producers[0].queue,
  );
  assert.equal(
    config.vars.APP_ORIGIN,
    "https://sidequest-config-fixture.invalid",
  );
  assert.equal(
    config.r2_buckets[0].bucket_name,
    "sidequest-config-fixture-media",
  );
  console.log(
    "PASS: JSONC configuration generates an explicitly isolated target; no remote resources created.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
