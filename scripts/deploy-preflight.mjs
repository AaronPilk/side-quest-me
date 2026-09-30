// Deployment-only validation. Local development intentionally supports an
// unconfigured backend, but a release must not silently build that state.
function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing deployment input: ${name}`);
  if (value !== value.trim() || /YOUR_|REPLACE_|PLACEHOLDER/i.test(value))
    throw new Error(
      `Replace the placeholder or surrounding whitespace in ${name}`,
    );
  return value;
}

required("CLOUDFLARE_API_TOKEN");
const rawUrl = required("VITE_SUPABASE_URL");
let url;
try {
  url = new URL(rawUrl);
} catch {
  throw new Error("VITE_SUPABASE_URL must be the project's HTTPS origin");
}
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  /(^|\.)(localhost|example\.com|example\.org|example\.net)$|\.(invalid|test)$/i.test(
    url.hostname,
  )
)
  throw new Error("VITE_SUPABASE_URL must be the project's HTTPS origin");

const key = required("VITE_SUPABASE_PUBLISHABLE_KEY");
let publicKey = /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key);
if (!publicKey && key.split(".").length === 3) {
  try {
    // Legacy anon keys are still supported. This checks key type only; the
    // provider verifies the signature when the deployed app makes a request.
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
    publicKey = claims.role === "anon";
  } catch {
    publicKey = false;
  }
}
if (!publicKey)
  throw new Error(
    "VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key, never a server secret",
  );

console.log(
  "Deployment inputs passed local validation. No remote changes made.",
);
