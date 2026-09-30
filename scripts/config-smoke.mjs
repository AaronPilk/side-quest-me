import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

// Explicit local-only fixtures. This script does not call a provider or create resources.
const root = fileURLToPath(new URL("../", import.meta.url));
const deploymentFixture = {
  CLOUDFLARE_API_TOKEN: "configuration-test-token-never-printed",
  VITE_SUPABASE_URL: "https://configuration-fixture.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_configuration_fixture_only",
};
function preflight(overrides = {}) {
  return spawnSync(
    process.execPath,
    [path.join(root, "scripts/deploy-preflight.mjs")],
    {
      encoding: "utf8",
      env: { ...process.env, ...deploymentFixture, ...overrides },
    },
  );
}
assert.equal(preflight().status, 0, "Public deployment inputs should pass");
for (const name of Object.keys(deploymentFixture)) {
  for (const value of ["", "YOUR_CONFIGURATION_PLACEHOLDER"]) {
    const result = preflight({ [name]: value });
    assert.notEqual(
      result.status,
      0,
      `${name} must not be empty or a placeholder`,
    );
    assert.match(result.stderr, new RegExp(name));
    assert.ok(!result.stderr.includes(deploymentFixture.CLOUDFLARE_API_TOKEN));
  }
}
for (const value of [
  "http://configuration-fixture.supabase.co",
  "https://example.com",
  "https://configuration-fixture.supabase.co/rest/v1",
  "not-a-url",
]) {
  const result = preflight({ VITE_SUPABASE_URL: value });
  assert.notEqual(
    result.status,
    0,
    "Deployments require an actual HTTPS project origin",
  );
}
const legacyKey = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.fixture`;
assert.equal(
  preflight({ VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey("anon") }).status,
  0,
  "Legacy public anon keys remain supported",
);
for (const value of [
  "sb_secret_never_print_this_server_key",
  legacyKey("service_role"),
]) {
  const result = preflight({ VITE_SUPABASE_PUBLISHABLE_KEY: value });
  assert.notEqual(
    result.status,
    0,
    "Server secrets must not enter the browser bundle",
  );
  assert.ok(
    !result.stderr.includes(value),
    "Validation must not print secret values",
  );
}
console.log(
  "PASS: deployment preflight rejects missing inputs, placeholders and browser-exposed server keys.",
);
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
