import { readFile, writeFile, mkdir } from "node:fs/promises";
import ts from "typescript";
const required = [
  "SIDEQUEST_ENV",
  "CLOUDFLARE_ACCOUNT_ID",
  "SIDEQUEST_WORKER",
  "SIDEQUEST_BUCKET",
  "SIDEQUEST_QUEUE",
  "SIDEQUEST_ORIGIN",
  "SIDEQUEST_AREA",
];
for (const name of required)
  if (!process.env[name]?.trim())
    throw new Error(`Missing explicit deployment input: ${name}`);
if (!["staging", "production"].includes(process.env.SIDEQUEST_ENV))
  throw new Error("Select staging or production");
if (!/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID))
  throw new Error("Invalid account identifier");
for (const name of ["SIDEQUEST_WORKER", "SIDEQUEST_BUCKET", "SIDEQUEST_QUEUE"])
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(process.env[name]))
    throw new Error(`Invalid resource name: ${name}`);
const origin = new URL(process.env.SIDEQUEST_ORIGIN);
if (
  origin.protocol !== "https:" ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
)
  throw new Error("Use an exact HTTPS origin");
const parsed = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  await readFile("wrangler.jsonc", "utf8"),
);
if (parsed.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"),
  );
const config = parsed.config;
config.account_id = process.env.CLOUDFLARE_ACCOUNT_ID;
config.name = process.env.SIDEQUEST_WORKER;
config.main = "../worker/index.ts";
config.containers[0].image = "../renderer/Dockerfile";
config.containers[0].image_build_context = "..";
config.vars = {
  APP_ENV: process.env.SIDEQUEST_ENV,
  LAUNCH_CURRENCY: "USD",
  LAUNCH_AREA: process.env.SIDEQUEST_AREA,
  APP_ORIGIN: origin.origin,
};
config.r2_buckets = [
  { binding: "MEDIA", bucket_name: process.env.SIDEQUEST_BUCKET },
];
config.queues.producers[0].queue = process.env.SIDEQUEST_QUEUE;
config.queues.consumers[0].queue = process.env.SIDEQUEST_QUEUE;
await mkdir(".local", { recursive: true });
await writeFile(".local/wrangler.target.json", JSON.stringify(config, null, 2));
console.log(
  `Prepared ${process.env.SIDEQUEST_ENV} configuration. No resources created.`,
);
