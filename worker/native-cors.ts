import type { MiddlewareHandler } from "hono";
import type { AppBindings, AppEnv } from "./services";

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
const HEADERS = [
  "authorization",
  "content-type",
  "idempotency-key",
  "range",
  "accept",
];

/** Opt-in for our bundled iOS origin only; never reflect arbitrary origins. */
export function isNativeOrigin(
  origin: string | undefined,
  env: AppEnv,
): boolean {
  return origin === "capacitor://localhost" && env.NATIVE_APP_ORIGIN === origin;
}

export const nativeApiCors: MiddlewareHandler<AppBindings> = async (
  c,
  next,
) => {
  const origin = c.req.header("Origin");
  // No cookie credentials are enabled. The API still validates bearer sessions,
  // ownership and permissions independently of CORS on every actual request.
  c.header("Vary", "Origin", { append: true });
  if (c.req.method === "OPTIONS") {
    const method = c.req.header("Access-Control-Request-Method");
    const requested = (c.req.header("Access-Control-Request-Headers") || "")
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);
    if (
      !isNativeOrigin(origin, c.env) ||
      !method ||
      !METHODS.includes(method) ||
      requested.some((header) => !HEADERS.includes(header))
    )
      return c.json(
        {
          error: {
            code: "origin_rejected",
            message: "This app origin is not allowed.",
          },
        },
        403,
      );
    c.header("Access-Control-Allow-Origin", origin!);
    c.header("Access-Control-Allow-Methods", METHODS.join(", "));
    c.header("Access-Control-Allow-Headers", HEADERS.join(", "));
    c.header("Access-Control-Max-Age", "600");
    return c.body(null, 204);
  }
  // Apply after the route: raw/streamed media Responses do not inherit Hono's
  // prepared headers the way c.json() does. Never buffer or replace their body.
  await next();
  if (
    !(c.res.headers.get("Vary") || "")
      .split(",")
      .some((value) => value.trim().toLowerCase() === "origin")
  )
    c.header("Vary", "Origin", { append: true });
  if (isNativeOrigin(origin, c.env)) {
    c.header("Access-Control-Allow-Origin", origin!);
    c.header(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, X-Request-ID",
    );
  }
};
