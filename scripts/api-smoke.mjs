import assert from "node:assert/strict";
const origin = process.env.SIDEQUEST_SMOKE_ORIGIN || "http://127.0.0.1:5279";
const url = new URL(origin);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw new Error(
    "This no-credential smoke targets an explicitly local dev server only.",
  );
async function request(path, expectedStatus, { api = true } = {}) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  const body = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    `${path}: ${body.slice(0, 160)}`,
  );
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.doesNotMatch(
    body,
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.|sb_secret_|service_role.{0,5}[:=].{0,5}[a-zA-Z0-9]{20}/,
  );
  if (api) {
    assert.match(
      response.headers.get("content-type") || "",
      /application\/json/,
    );
    assert.doesNotMatch(body, /<html/i);
    return JSON.parse(body);
  }
  return body;
}
const health = await request("/api/health", 200);
assert.equal(health.demo, false);
assert.equal(health.status, "ok");
assert.equal(
  health.services.databaseConfigured,
  false,
  "Use a dev process without provider credentials for this smoke.",
);
const missing = await request("/api/definitely-not-a-route", 404);
assert.equal(missing.error.code, "not_found");
assert.ok(missing.error.requestId);
const setup = await request("/api/me", 503);
assert.equal(setup.error.code, "setup_required");
assert.ok(setup.error.requestId);
assert.equal(
  Object.keys(setup.error).sort().join(","),
  "code,message,requestId",
);
await request("/api/operator", 503);
for (const path of [
  "/api/community/feed",
  "/api/community/me",
  "/api/community/operator",
  "/api/community/offers/11111111-1111-4111-8111-111111111111/media",
  "/api/social/me",
  "/api/social/profile/11111111-1111-4111-8111-111111111111",
  "/api/social/photo/11111111-1111-4111-8111-111111111111",
  "/api/series",
  "/api/series/mine",
  "/api/series/templates",
  "/api/series/11111111-1111-4111-8111-111111111111",
  "/api/series/parts/11111111-1111-4111-8111-111111111111",
]) {
  const communitySetup = await request(path, 503);
  assert.equal(communitySetup.error.code, "setup_required");
  assert.deepEqual(Object.keys(communitySetup.error).sort(), [
    "code",
    "message",
    "requestId",
  ]);
}
await request("/s/not-a-valid-share-token", 404, { api: false });
const page = await fetch(new URL("/journal", origin));
const html = await page.text();
assert.equal(page.status, 200);
assert.match(page.headers.get("content-type") || "", /text\/html/);
assert.match(html, /<div id="root">/);
console.log(
  "PASS: local Worker health JSON; API404 JSON; unconfigured profile/community/commercial/social/Series services503 with bounded error envelopes and no demo fallback; no token/cookie leaks; private no-store; invalid share404; SPA journal fallback.",
);
