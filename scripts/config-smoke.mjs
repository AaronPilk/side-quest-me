import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  checkCloudflareAuth,
  credentialMetadata,
  safeProviderErrors,
} from "./cloudflare-auth-preflight.mjs";

// Explicit local-only fixtures. This script does not call a provider or create resources.
const root = fileURLToPath(new URL("../", import.meta.url));
const authFixture = {
  CLOUDFLARE_API_TOKEN: "opaque-authentication-fixture-never-printed",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  SIDEQUEST_WORKER: "sidequest-auth-fixture",
};
const authLogs = [];
let authRequests = 0;
await checkCloudflareAuth({
  env: authFixture,
  log: (message) => authLogs.push(message),
  fetchImpl: async (url, options) => {
    authRequests++;
    assert.equal(
      url,
      `https://api.cloudflare.com/client/v4/accounts/${authFixture.CLOUDFLARE_ACCOUNT_ID}/workers/scripts`,
    );
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(
      options.headers.Authorization,
      `Bearer ${authFixture.CLOUDFLARE_API_TOKEN}`,
    );
    return Response.json({
      success: true,
      result: [{ id: "unrelated-worker-inventory" }],
    });
  },
});
assert.equal(authRequests, 1);
assert.ok(!authLogs.join("\n").includes("unrelated-worker-inventory"));
assert.ok(!authLogs.join("\n").includes(authFixture.CLOUDFLARE_API_TOKEN));
for (const [token, kind] of [
  [authFixture.CLOUDFLARE_ACCOUNT_ID, "account_id"],
  ["b".repeat(32), "account_or_token_id_hex32"],
  ["b".repeat(37), "global_api_key_hex37"],
  ["CLOUDFLARE_API_TOKEN", "literal_secret_name"],
  ["sb_secret_configuration_fixture_only", "supabase_key"],
]) {
  assert.equal(
    credentialMetadata(token, authFixture.CLOUDFLARE_ACCOUNT_ID).kind,
    kind,
  );
  await assert.rejects(
    checkCloudflareAuth({
      env: { ...authFixture, CLOUDFLARE_API_TOKEN: token },
      log: () => undefined,
      fetchImpl: async () => {
        throw new Error("Wrong credential types must never be sent");
      },
    }),
    new RegExp(kind),
  );
}
assert.equal(credentialMetadata("opaque\u200bfixture", "").nonAscii, true);
await assert.rejects(
  checkCloudflareAuth({
    env: { ...authFixture, CLOUDFLARE_API_TOKEN: "opaque\u200bfixture" },
    log: () => undefined,
  }),
  /raw ASCII token/,
);
await assert.rejects(
  checkCloudflareAuth({
    env: { ...authFixture, CLOUDFLARE_ACCOUNT_ID: "../other-account" },
    log: () => undefined,
  }),
  /CLOUDFLARE_ACCOUNT_ID/,
);
const providerFailure = {
  errors: [
    {
      code: 6003,
      message: "Invalid request headers",
      error_chain: [
        { code: 6111, message: "Invalid format for Authorization header" },
        { code: 9999, message: `Echo: ${authFixture.CLOUDFLARE_API_TOKEN}` },
        {
          code: 9999,
          message: encodeURIComponent(authFixture.CLOUDFLARE_API_TOKEN),
        },
      ],
    },
  ],
};
assert.equal(safeProviderErrors(providerFailure).length, 4);
assert.ok(
  !JSON.stringify(safeProviderErrors(providerFailure)).includes(
    authFixture.CLOUDFLARE_API_TOKEN,
  ),
);
await assert.rejects(
  checkCloudflareAuth({
    env: authFixture,
    log: (message) => authLogs.push(message),
    fetchImpl: async () => Response.json(providerFailure, { status: 400 }),
  }),
  /authorization format/,
);
assert.ok(authLogs.some((message) => message.includes('"code":6111')));
assert.ok(!authLogs.join("\n").includes(authFixture.CLOUDFLARE_API_TOKEN));
await assert.rejects(
  checkCloudflareAuth({
    env: authFixture,
    log: () => undefined,
    fetchImpl: async () => {
      throw new Error(authFixture.CLOUDFLARE_API_TOKEN);
    },
  }),
  (error) =>
    !error.message.includes(authFixture.CLOUDFLARE_API_TOKEN) &&
    /could not reach/.test(error.message),
);
console.log(
  "PASS: read-only Cloudflare authentication stays account-scoped and redacts credential values and inventory.",
);
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
for (const value of [
  "Bearer configuration-token-secret-fixture",
  "CLOUDFLARE_API_TOKEN=configuration-token-secret-fixture",
  '"configuration-token-secret-fixture"',
  "'configuration-token-secret-fixture'",
  "`configuration-token-secret-fixture`",
  "configuration-token secret-fixture",
  "configuration-token\nsecret-fixture",
  "configuration-token\tsecret-fixture",
  "Authorization:configuration-token-secret-fixture",
  "curl https://api.cloudflare.com/client/v4/user/tokens/verify",
]) {
  const result = preflight({ CLOUDFLARE_API_TOKEN: value });
  assert.notEqual(
    result.status,
    0,
    "Copied headers and commands must fail before deployment",
  );
  assert.match(
    result.stderr,
    /CLOUDFLARE_API_TOKEN must contain the raw token only/,
  );
  assert.ok(
    !result.stderr.includes(value),
    "Malformed credentials must never be printed",
  );
  assert.ok(!result.stderr.includes("configuration-token-secret-fixture"));
}
assert.equal(
  preflight({ CLOUDFLARE_API_TOKEN: "token-shape-".repeat(20) }).status,
  0,
  "Token format validation must not impose a fixed provider token length",
);
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
  "PASS: deployment preflight rejects missing inputs, malformed tokens, placeholders and browser-exposed server keys.",
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
