import { fileURLToPath } from "node:url";
import path from "node:path";

export function credentialMetadata(token, accountId) {
  let kind = "opaque";
  if (token === "CLOUDFLARE_API_TOKEN") kind = "literal_secret_name";
  else if (token === accountId) kind = "account_id";
  else if (/^[a-f0-9]{32}$/i.test(token)) kind = "account_or_token_id_hex32";
  else if (/^[a-f0-9]{37}$/i.test(token)) kind = "global_api_key_hex37";
  else if (/^sb_(secret|publishable)_/.test(token)) kind = "supabase_key";
  return {
    characterCount: [...token].length,
    kind,
    nonAscii: /[^\x00-\x7f]/.test(token),
  };
}

// Never print arbitrary provider text: an error might echo credentials, even
// encoded or partially. Only these fixed messages can appear in diagnostics.
const providerMessages = new Set([
  "Authentication error",
  "Authentication failed",
  "Authentication failed (status: 400)",
  "Invalid request headers",
  "Invalid format for Authorization header",
  "Invalid access token",
  "Unauthorized",
  "Forbidden",
]);
export function safeProviderErrors(payload) {
  const pending = Array.isArray(payload?.errors)
    ? payload.errors.slice(0, 8)
    : [];
  const errors = [];
  while (pending.length && errors.length < 8) {
    const error = pending.shift();
    if (!error || typeof error !== "object") continue;
    errors.push({
      code: Number.isSafeInteger(error.code) ? error.code : null,
      message: providerMessages.has(error.message)
        ? error.message
        : "Provider error message omitted",
    });
    if (Array.isArray(error.error_chain))
      pending.push(...error.error_chain.slice(0, 8 - errors.length));
  }
  return errors;
}

async function readErrorBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) return null;
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function checkCloudflareAuth({
  env = process.env,
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  const token = env.CLOUDFLARE_API_TOKEN || "";
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || "";
  const worker = env.SIDEQUEST_WORKER || "";
  if (!/^[a-f0-9]{32}$/.test(accountId))
    throw new Error("CLOUDFLARE_ACCOUNT_ID must identify the selected account");
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(worker))
    throw new Error("SIDEQUEST_WORKER must name the selected Worker");
  const metadata = credentialMetadata(token, accountId);
  log(`Cloudflare credential metadata: ${JSON.stringify(metadata)}`);
  if (!token || metadata.nonAscii || /[\s="'`]/.test(token))
    throw new Error(
      "CLOUDFLARE_API_TOKEN must be a raw ASCII token with no whitespace, quotes or assignment",
    );
  if (metadata.kind !== "opaque")
    throw new Error(
      `CLOUDFLARE_API_TOKEN has ${metadata.kind} format. Save the API token value, not another key, identifier or setting name`,
    );

  // Primary API reference: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/
  // Account-scoped read works for user and account tokens and does not require
  // the first Worker deployment to exist. No inventory is printed or retained.
  let response;
  try {
    response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new Error(
      "Cloudflare authentication check could not reach the API within 15 seconds. Retry without changing credentials",
    );
  }
  if (response.ok) {
    await response.body?.cancel().catch(() => undefined);
    log(
      "Cloudflare account authentication and Workers read access verified. Deployment will still validate required write permissions.",
    );
    return;
  }
  const errors = safeProviderErrors(await readErrorBody(response));
  log(
    `Cloudflare authentication result: ${JSON.stringify({ httpStatus: response.status, errors })}`,
  );
  const codes = errors.map((error) => error.code);
  if (codes.includes(6111))
    throw new Error(
      "Cloudflare rejected the API token's authorization format. Replace the secret with the raw API token value",
    );
  if (
    response.status === 401 ||
    response.status === 403 ||
    codes.includes(9106)
  )
    throw new Error(
      "Cloudflare rejected this credential or its access to the selected account. Check token status, account resources and Workers permissions",
    );
  throw new Error(
    "Cloudflare account authentication check failed. Review the safe HTTP status and error codes above before retrying",
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    await checkCloudflareAuth();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
